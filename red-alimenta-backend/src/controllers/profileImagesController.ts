import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';
import { hasExpectedImageSignature } from '../lib/imageValidation';
import { ADMIN_ROLES, isAdminRole } from '../lib/roles';
import { publishRealtimeChange } from '../realtime/RealtimeHub';

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROFILE_IMAGE_SIZE, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (!PROFILE_IMAGE_TYPES.has(file.mimetype)) {
      callback(new AppError('Profile photos must be JPEG, PNG, or WebP', 400));
      return;
    }
    callback(null, true);
  },
}).single('imagen');

export async function uploadProfileImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    if (!req.file) throw new AppError('A profile photo is required', 400);
    if (!hasExpectedImageSignature(req.file.mimetype, req.file.buffer)) {
      throw new AppError('Image contents do not match the declared file type', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const photo = await tx.fotoPerfil.upsert({
        where: { usuarioId: req.auth!.userId },
        create: {
          usuarioId: req.auth!.userId,
          tipoMime: req.file!.mimetype,
          contenido: req.file!.buffer,
        },
        update: {
          tipoMime: req.file!.mimetype,
          contenido: req.file!.buffer,
        },
        select: { actualizadaEn: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'FOTO_PERFIL_ACTUALIZADA',
          entidad: 'Usuario',
          entidadId: String(req.auth!.userId),
          detalles: { tipoMime: req.file!.mimetype, tamanoBytes: req.file!.size },
        },
      });
      return photo;
    });

    publishRealtimeChange(
      { userIds: [req.auth.userId], roles: ADMIN_ROLES },
      { type: 'profile.updated', resource: 'users', resourceId: req.auth.userId },
    );
    res.json({
      fotoPerfilUrl: `/api/auth/me/photo?v=${updated.actualizadaEn.getTime()}-${randomUUID()}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getProfileImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const image = await prisma.fotoPerfil.findUnique({
      where: { usuarioId: req.auth.userId },
      select: { tipoMime: true, contenido: true },
    });
    if (!image) throw new AppError('Profile photo not found', 404);

    res
      .type(image.tipoMime)
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(Buffer.from(image.contenido));
  } catch (error) {
    next(error);
  }
}

export async function getAdminUserProfileImage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !isAdminRole(req.auth.role)) {
      throw new AppError('Only administrators can view user profile photos', 403);
    }
    const userId = parsePositiveInteger(req.params.id, 'user id');
    const image = await prisma.fotoPerfil.findUnique({
      where: { usuarioId: userId },
      select: { tipoMime: true, contenido: true },
    });
    if (!image) throw new AppError('Profile photo not found', 404);

    res
      .type(image.tipoMime)
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(Buffer.from(image.contenido));
  } catch (error) {
    next(error);
  }
}
