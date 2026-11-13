import type { Server as HttpServer } from 'node:http';
import { EstadoCuenta, RolUsuario } from '@prisma/client';
import { Server } from 'socket.io';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/auth';
import prisma from '../lib/prisma';
import {
  RealtimeHub,
  coverageRoom,
  roleRoom,
  sessionRoom,
  userRoom,
  bankRoom,
  type RealtimeIdentity,
} from './RealtimeHub';

export type RealtimeIdentityResolver = (token: string) => Promise<RealtimeIdentity>;

export async function resolveRealtimeIdentity(token: string): Promise<RealtimeIdentity> {
  const claims = verifyAccessToken(token);
  const session = await prisma.sesion.findUnique({
    where: { id: claims.sid },
    include: {
      usuario: {
        select: {
          id: true,
          rol: true,
          estado: true,
          beneficiario: {
            select: {
              estadoVerificacion: true,
              departamento: true,
              municipio: true,
            },
          },
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
    || session.usuario.estado === EstadoCuenta.SUSPENDIDA
    || (session.usuario.estado === EstadoCuenta.RECHAZADA && !canReviewRejectedRegistration)
  ) {
    throw new AppError('Invalid or expired access token', 401);
  }

  const beneficiary = session.usuario.beneficiario;
  return {
    userId: session.usuario.id,
    sessionId: session.id,
    role: session.usuario.rol,
    accountStatus: session.usuario.estado,
    bankIds: session.usuario.membresias.map((membership) => membership.bancoId),
    beneficiaryCoverage: beneficiary?.estadoVerificacion === 'APROBADA'
      ? { departamento: beneficiary.departamento, municipio: beneficiary.municipio }
      : null,
  };
}

export function createRealtimeSocketServer(
  httpServer: HttpServer,
  resolveIdentity: RealtimeIdentityResolver = resolveRealtimeIdentity,
): { io: Server; hub: RealtimeHub } {
  const allowedOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins?.length ? allowedOrigins : false },
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.trim() === '') {
      next(new Error('Unauthorized'));
      return;
    }

    try {
      socket.data.auth = await resolveIdentity(token);
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(new Error('Unauthorized'));
        return;
      }
      console.error('Realtime authentication lookup failed');
      next(new Error('Authentication unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const identity = socket.data.auth as RealtimeIdentity;
    socket.join([userRoom(identity.userId), sessionRoom(identity.sessionId)]);

    if (identity.accountStatus === EstadoCuenta.ACTIVA) {
      socket.join(identity.bankIds.map(bankRoom));
      if (identity.role === RolUsuario.ADMIN_GENERAL || identity.role === RolUsuario.SUPER_ADMIN) {
        socket.join(roleRoom(identity.role));
      }
      if (identity.role === RolUsuario.BENEFICIARIO && identity.beneficiaryCoverage) {
        const { departamento, municipio } = identity.beneficiaryCoverage;
        socket.join([
          coverageRoom(departamento, municipio),
          coverageRoom(departamento, '*'),
        ]);
      }
    }
  });

  return { io, hub: new RealtimeHub(io) };
}
