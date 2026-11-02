import { NextFunction, Request, Response } from 'express';
import { RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/auth';

export interface AuthContext {
  userId: number;
  sessionId: string;
  role: RolUsuario;
  accountStatus: string;
  bankIds: number[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError('Authentication is required', 401);
    }

    const claims = verifyAccessToken(authorization.slice('Bearer '.length).trim());
    const session = await prisma.sesion.findUnique({
      where: { id: claims.sid },
      include: {
        usuario: {
          select: {
            id: true,
            rol: true,
            estado: true,
            beneficiario: { select: { estadoVerificacion: true } },
            membresias: { select: { bancoId: true } },
          },
        },
      },
    });

    const canReviewRejectedRegistration = session?.usuario.rol === RolUsuario.BENEFICIARIO
      && session.usuario.beneficiario?.estadoVerificacion === 'RECHAZADA';
    if (
      !session
      || session.usuarioId !== Number(claims.sub)
      || session.revocadaEn
      || session.expiraEn.getTime() <= Date.now()
      || session.usuario.estado === 'SUSPENDIDA'
      || (session.usuario.estado === 'RECHAZADA' && !canReviewRejectedRegistration)
    ) {
      throw new AppError('Invalid or expired access token', 401);
    }

    req.auth = {
      userId: session.usuario.id,
      sessionId: session.id,
      role: session.usuario.rol,
      accountStatus: session.usuario.estado,
      bankIds: session.usuario.membresias.map((membership) => membership.bancoId),
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...allowedRoles: RolUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AppError('Authentication is required', 401));
    }
    if (req.auth.accountStatus !== 'ACTIVA') {
      return next(new AppError('This account is awaiting administrator approval', 403));
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return next(new AppError('You are not authorized to perform this action', 403));
    }
    return next();
  };
}
