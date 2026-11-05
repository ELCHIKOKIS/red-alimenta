import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { EstadoSolicitudRegistro, Prisma, RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../lib/errors';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const registrationDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 2 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new AppError('Only PDF, JPEG, and PNG documents are allowed', 400));
      return;
    }
    callback(null, true);
  },
}).single('documento');

export function getDocumentsDirectory(): string {
  const configuredDirectory = process.env.DOCUMENTS_DIR;
  return configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.resolve(__dirname, '..', '..', 'storage', 'documents');
}

function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case 'application/pdf': return 'pdf';
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    default: throw new AppError('Unsupported document type', 400);
  }
}

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return false;
}

export async function uploadRegistrationDocument(req: Request, res: Response, next: NextFunction) {
  let storedPath: string | undefined;
  try {
    if (!req.auth || req.auth.role !== RolUsuario.BENEFICIARIO) {
      throw new AppError('Only beneficiaries can submit verification documents', 403);
    }
    if (!req.file) throw new AppError('A document file is required', 400);
    if (!hasExpectedSignature(req.file.buffer, req.file.mimetype)) {
      throw new AppError('Document contents do not match the declared file type', 400);
    }

    const registration = await prisma.solicitudRegistro.findFirst({
      where: {
        solicitanteId: req.auth.userId,
        estado: EstadoSolicitudRegistro.PENDIENTE,
      },
      orderBy: { creadaEn: 'desc' },
    });
    if (!registration) {
      throw new AppError('No pending beneficiary registration was found', 409);
    }

    const extension = getFileExtension(req.file.mimetype);
    const storedName = `${randomUUID()}.${extension}`;
    const safeOriginalName = path.basename(req.file.originalname)
      .replace(/[\u0000-\u001f\u007f]/g, '_')
      .slice(0, 255);
    if (!safeOriginalName) throw new AppError('Document filename is invalid', 400);
    const directory = getDocumentsDirectory();
    storedPath = path.join(directory, storedName);
    await mkdir(directory, { recursive: true });
    await writeFile(storedPath, req.file.buffer, { flag: 'wx' });

    const document = await prisma.$transaction(async (tx) => {
      const saved = await tx.documentoVerificacion.create({
        data: {
          solicitudRegistroId: registration.id,
          nombreOriginal: safeOriginalName,
          nombreAlmacenado: storedName,
          tipoMime: req.file!.mimetype,
          tamanoBytes: req.file!.size,
        },
        select: {
          id: true,
          nombreOriginal: true,
          tipoMime: true,
          tamanoBytes: true,
          creadoEn: true,
        },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'DOCUMENTO_VERIFICACION_CARGADO',
          entidad: 'DocumentoVerificacion',
          entidadId: String(saved.id),
        },
      });
      return saved;
    });
    res.status(201).json(document);
  } catch (error) {
    if (storedPath) {
      try {
        await unlink(storedPath);
      } catch (cleanupError) {
        console.error('Unable to remove an unregistered verification document:', cleanupError);
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('Document could not be registered', 409));
    }
    next(error);
  }
}

export async function downloadRegistrationDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new AppError('Document id must be a positive integer', 400);
    }
    const document = await prisma.documentoVerificacion.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new AppError('Verification document not found', 404);
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(document.nombreAlmacenado)) {
      throw new AppError('Stored document reference is invalid', 500);
    }

    const filePath = path.join(getDocumentsDirectory(), document.nombreAlmacenado);
    res.type(document.tipoMime).sendFile(filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
}
