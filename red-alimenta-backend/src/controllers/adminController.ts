import { NextFunction, Request, Response } from 'express';
import {
  EstadoCuenta,
  EstadoSolicitudRegistro,
  EstadoVerificacion,
  Prisma,
  RolUsuario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new AppError(`${field} is required and must be at most ${maxLength} characters`, 400);
  }
  return value.trim();
}

function pageSize(value: unknown, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError('limit must be an integer between 1 and 100', 400);
  }
  return parsed;
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = pageSize(req.query.limit, 50);
    const offsetValue = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      throw new AppError('offset must be a non-negative integer', 400);
    }

    const where: Prisma.UsuarioWhereInput = {};
    if (req.query.rol !== undefined) {
      if (!Object.values(RolUsuario).includes(String(req.query.rol) as RolUsuario)) {
        throw new AppError('rol is invalid', 400);
      }
      where.rol = req.query.rol as RolUsuario;
    }
    if (req.query.estado !== undefined) {
      if (!Object.values(EstadoCuenta).includes(String(req.query.estado) as EstadoCuenta)) {
        throw new AppError('estado is invalid', 400);
      }
      where.estado = req.query.estado as EstadoCuenta;
    }

    const [users, total, usersByRole, usersByStatus] = await prisma.$transaction([
      prisma.usuario.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          estado: true,
          telefono: true,
          createdAt: true,
          membresias: { include: { banco: { select: { id: true, nombre: true } } } },
        },
        orderBy: { id: 'asc' },
        skip: offsetValue,
        take: limit,
      }),
      prisma.usuario.count({ where }),
      prisma.usuario.groupBy({ by: ['rol'], _count: { _all: true } }),
      prisma.usuario.groupBy({ by: ['estado'], _count: { _all: true } }),
    ]);
    res.json({
      items: users,
      total,
      limit,
      offset: offsetValue,
      counts: {
        total: usersByRole.reduce((sum, group) => sum + group._count._all, 0),
        byRole: Object.fromEntries(usersByRole.map((group) => [group.rol, group._count._all])),
        byStatus: Object.fromEntries(usersByStatus.map((group) => [group.estado, group._count._all])),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError('Request body must be an object', 400);
    }
    const userId = parsePositiveInteger(req.params.id, 'user id');
    const body = req.body as Record<string, unknown>;
    if ('rol' in body || 'role' in body || 'passwordHash' in body) {
      throw new AppError('Role and password hash cannot be changed through this endpoint', 400);
    }

    const data: Prisma.UsuarioUpdateInput = {};
    if (body.nombre !== undefined) data.nombre = requiredText(body.nombre, 'nombre', 150);
    if (body.telefono !== undefined) {
      if (body.telefono !== null && (typeof body.telefono !== 'string' || body.telefono.length > 30)) {
        throw new AppError('telefono must be at most 30 characters', 400);
      }
      data.telefono = body.telefono === null ? null : String(body.telefono).trim();
    }
    if (body.email !== undefined) {
      const email = requiredText(body.email, 'email', 191).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError('email must be a valid email address', 400);
      }
      data.email = email;
    }
    if (body.estado !== undefined) {
      if (body.estado !== EstadoCuenta.ACTIVA && body.estado !== EstadoCuenta.SUSPENDIDA) {
        throw new AppError('estado must be ACTIVA or SUSPENDIDA', 400);
      }
      data.estado = body.estado;
    }
    if (Object.keys(data).length === 0) throw new AppError('At least one valid field is required', 400);

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.usuario.findUnique({
        where: { id: userId },
        select: { id: true, rol: true, estado: true },
      });
      if (!current) throw new AppError('User not found', 404);
      if (userId === req.auth?.userId && data.estado === EstadoCuenta.SUSPENDIDA) {
        throw new AppError('You cannot suspend your own account', 409);
      }
      if (
        current.rol === RolUsuario.ADMIN_GENERAL
        && current.estado === EstadoCuenta.ACTIVA
        && data.estado === EstadoCuenta.SUSPENDIDA
      ) {
        const activeAdmins = await tx.usuario.count({
          where: { rol: RolUsuario.ADMIN_GENERAL, estado: EstadoCuenta.ACTIVA },
        });
        if (activeAdmins <= 1) {
          throw new AppError('The last active administrator cannot be suspended', 409);
        }
      }
      const user = await tx.usuario.update({
        where: { id: userId },
        data,
        select: { id: true, nombre: true, email: true, rol: true, estado: true, telefono: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'USUARIO_ACTUALIZADO',
          entidad: 'Usuario',
          entidadId: String(user.id),
          detalles: { campos: Object.keys(data) },
        },
      });
      return user;
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('An account with that email already exists', 409));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return next(new AppError('User not found', 404));
    }
    next(error);
  }
}

export async function listRegistrationRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.estado ?? EstadoSolicitudRegistro.PENDIENTE;
    if (!Object.values(EstadoSolicitudRegistro).includes(String(status) as EstadoSolicitudRegistro)) {
      throw new AppError('estado is invalid', 400);
    }
    const requests = await prisma.solicitudRegistro.findMany({
      where: { estado: status as EstadoSolicitudRegistro },
      include: {
        solicitante: { select: { id: true, nombre: true, email: true } },
        beneficiario: true,
        documentos: {
          select: {
            id: true,
            nombreOriginal: true,
            tipoMime: true,
            tamanoBytes: true,
            creadoEn: true,
          },
        },
      },
      orderBy: { creadaEn: 'asc' },
    });
    res.json(requests);
  } catch (error) {
    next(error);
  }
}

export async function reviewRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError('Request body must be an object', 400);
    }
    const requestId = parsePositiveInteger(req.params.id, 'registration request id');
    const body = req.body as Record<string, unknown>;
    if (body.decision !== 'APROBAR' && body.decision !== 'RECHAZAR') {
      throw new AppError('decision must be APROBAR or RECHAZAR', 400);
    }
    const decision = body.decision;
    const observaciones = typeof body.observaciones === 'string'
      ? body.observaciones.trim().slice(0, 4000)
      : null;
    if (decision === 'RECHAZAR' && !observaciones) {
      throw new AppError('observaciones is required when rejecting a registration', 400);
    }

    const reviewed = await prisma.$transaction(async (tx) => {
      const request = await tx.solicitudRegistro.findUnique({
        where: { id: requestId },
        include: { beneficiario: true },
      });
      if (!request) throw new AppError('Registration request not found', 404);
      if (request.estado !== EstadoSolicitudRegistro.PENDIENTE) {
        throw new AppError('Registration request has already been reviewed', 409);
      }

      const approved = decision === 'APROBAR';
      const transition = await tx.solicitudRegistro.updateMany({
        where: { id: request.id, estado: EstadoSolicitudRegistro.PENDIENTE },
        data: {
          estado: approved ? EstadoSolicitudRegistro.APROBADA : EstadoSolicitudRegistro.RECHAZADA,
          revisadaPorId: req.auth!.userId,
          revisadaEn: new Date(),
          observacionesRevision: observaciones,
        },
      });
      if (transition.count !== 1) {
        throw new AppError('Registration request has already been reviewed', 409);
      }

      await tx.beneficiario.update({
        where: { id: request.beneficiarioId },
        data: {
          estadoVerificacion: approved ? EstadoVerificacion.APROBADA : EstadoVerificacion.RECHAZADA,
        },
      });
      await tx.usuario.update({
        where: { id: request.solicitanteId },
        data: { estado: approved ? EstadoCuenta.ACTIVA : EstadoCuenta.RECHAZADA },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: approved ? 'REGISTRO_BENEFICIARIO_APROBADO' : 'REGISTRO_BENEFICIARIO_RECHAZADO',
          entidad: 'SolicitudRegistro',
          entidadId: String(request.id),
        },
      });
      return tx.solicitudRegistro.findUnique({
        where: { id: request.id },
        include: {
          beneficiario: true,
          solicitante: { select: { id: true, nombre: true, email: true, estado: true } },
        },
      });
    });
    res.json(reviewed);
  } catch (error) {
    next(error);
  }
}

export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = pageSize(req.query.limit, 50);
    const offsetValue = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      throw new AppError('offset must be a non-negative integer', 400);
    }
    const audit = await prisma.auditoria.findMany({
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
        banco: { select: { id: true, nombre: true } },
      },
      orderBy: { creadoEn: 'desc' },
      skip: offsetValue,
      take: limit,
    });
    res.json({ items: audit, limit, offset: offsetValue });
  } catch (error) {
    next(error);
  }
}

export async function getSystemReport(_req: Request, res: Response, next: NextFunction) {
  try {
    const [
      donations,
      requests,
      deliveries,
      inventory,
      deliveryQuantities,
    ] = await Promise.all([
      prisma.donacion.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.solicitudAlimentos.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.entrega.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.inventario.findMany({
        where: { activo: true },
        select: {
          banco: { select: { id: true, nombre: true } },
          producto: { select: { id: true, nombre: true, unidad: true } },
          stockActual: true,
          stockReservado: true,
        },
        orderBy: [{ bancoId: 'asc' }, { productoId: 'asc' }],
      }),
      prisma.detalleEntrega.aggregate({ _sum: { cantidad: true } }),
    ]);
    res.json({
      donaciones: donations,
      solicitudes: requests,
      entregas: deliveries,
      productosPorBanco: inventory.map((item) => ({
        ...item,
        cantidadDisponible: Math.max(0, item.stockActual - item.stockReservado),
      })),
      cantidadesDistribuidas: deliveryQuantities._sum.cantidad ?? 0,
    });
  } catch (error) {
    next(error);
  }
}
