import { NextFunction, Request, Response } from 'express';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  EstadoCuenta,
  EstadoDonacion,
  EstadoEntrega,
  EstadoSolicitudRegistro,
  EstadoVerificacion,
  Prisma,
  RolUsuario,
  TipoMovimientoInventario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';
import { getDocumentsDirectory } from './registrationDocumentsController';
import { ADMIN_ROLES, isSuperAdmin } from '../lib/roles';

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
      if (isSuperAdmin(current.rol) && !isSuperAdmin(req.auth!.role)) {
        throw new AppError('Only a super administrator can modify a super administrator', 403);
      }
      if (
        ADMIN_ROLES.includes(current.rol)
        && current.estado === EstadoCuenta.ACTIVA
        && data.estado === EstadoCuenta.SUSPENDIDA
      ) {
        const activeAdmins = await tx.usuario.count({
          where: { rol: { in: ADMIN_ROLES }, estado: EstadoCuenta.ACTIVA },
        });
        if (activeAdmins <= 1) {
          throw new AppError('The last active administrator cannot be suspended', 409);
        }
        if (current.rol === RolUsuario.SUPER_ADMIN) {
          const activeSuperAdmins = await tx.usuario.count({
            where: { rol: RolUsuario.SUPER_ADMIN, estado: EstadoCuenta.ACTIVA },
          });
          if (activeSuperAdmins <= 1) {
            throw new AppError('The last active super administrator cannot be suspended', 409);
          }
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

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !isSuperAdmin(req.auth.role)) {
      throw new AppError('Only a super administrator can permanently delete users', 403);
    }
    const userId = parsePositiveInteger(req.params.id, 'user id');
    if (userId === req.auth.userId) {
      throw new AppError('You cannot permanently delete your own account', 409);
    }

    const storedDocumentNames = await prisma.$transaction(async (tx) => {
      const user = await tx.usuario.findUnique({
        where: { id: userId },
        include: {
          donante: { select: { id: true, organizacion: true } },
          beneficiario: { select: { id: true, nombreOrganizacion: true } },
        },
      });
      if (!user) throw new AppError('User not found', 404);
      if (user.donante) {
        const donorReferences = [user.nombre, user.email, user.donante.organizacion]
          .filter((reference): reference is string => Boolean(reference));
        const legacyDonations = await tx.donacion.count({
          where: {
            donanteId: null,
            donante_referencia: { in: donorReferences },
          },
        });
        if (legacyDonations > 0) {
          throw new AppError(
            'This account may have legacy donations without a linked donor profile; reconcile those records before deletion',
            409,
          );
        }
      }
      if (user.beneficiario) {
        const beneficiaryReferences = [
          user.nombre,
          user.email,
          user.beneficiario.nombreOrganizacion,
        ];
        const legacyDeliveries = await tx.entrega.count({
          where: {
            beneficiarioId: null,
            beneficiario_referencia: { in: beneficiaryReferences },
          },
        });
        if (legacyDeliveries > 0) {
          throw new AppError(
            'This account may have legacy deliveries without a linked beneficiary profile; reconcile those records before deletion',
            409,
          );
        }
      }
      if (user.rol === RolUsuario.SUPER_ADMIN) {
        const activeSuperAdmins = await tx.usuario.count({
          where: { rol: RolUsuario.SUPER_ADMIN, estado: EstadoCuenta.ACTIVA },
        });
        if (user.estado === EstadoCuenta.ACTIVA && activeSuperAdmins <= 1) {
          throw new AppError('The last active super administrator cannot be deleted', 409);
        }
      }

      const registrationRequests = await tx.solicitudRegistro.findMany({
        where: {
          OR: [
            { solicitanteId: userId },
            ...(user.beneficiario ? [{ beneficiarioId: user.beneficiario.id }] : []),
          ],
        },
        select: { id: true },
      });
      const registrationIds = registrationRequests.map((request) => request.id);
      const documents = registrationIds.length
        ? await tx.documentoVerificacion.findMany({
          where: { solicitudRegistroId: { in: registrationIds } },
          select: { nombreAlmacenado: true },
        })
        : [];

      const requests = user.beneficiario
        ? await tx.solicitudAlimentos.findMany({
          where: { beneficiarioId: user.beneficiario.id },
          include: { detalles: true },
        })
        : [];
      const requestIds = requests.map((request) => request.id);
      const deliveryConditions: Prisma.EntregaWhereInput[] = [];
      if (user.beneficiario) deliveryConditions.push({ beneficiarioId: user.beneficiario.id });
      if (requestIds.length) deliveryConditions.push({ solicitudId: { in: requestIds } });
      const deliveries = deliveryConditions.length
        ? await tx.entrega.findMany({
          where: { OR: deliveryConditions },
          include: { detalles: { include: { movimiento: true } } },
        })
        : [];

      if (deliveries.some((delivery) => delivery.estado === EstadoEntrega.CONFIRMADA)) {
        throw new AppError(
          'This account has confirmed deliveries that cannot be removed without falsifying completed transactions',
          409,
        );
      }
      const requestIdSet = new Set(requestIds);
      for (const delivery of deliveries) {
        if (
          !delivery.solicitudId
          || !requestIdSet.has(delivery.solicitudId)
          || delivery.detalles.length === 0
          || delivery.detalles.some((detail) => (
            !detail.movimiento
            || detail.movimiento.tipo !== TipoMovimientoInventario.ENTREGA_REGISTRADA
            || detail.movimiento.cantidad !== detail.cantidad
          ))
        ) {
          throw new AppError(
            'This account has an untracked or inconsistent delivery; reconcile inventory before deleting it',
            409,
          );
        }
      }

      const inventoryChanges = new Map<string, {
        bancoId: number;
        productoId: number;
        stockActual: number;
        stockReservado: number;
      }>();
      const inventoryChange = (bancoId: number, productoId: number) => {
        const key = `${bancoId}:${productoId}`;
        let change = inventoryChanges.get(key);
        if (!change) {
          change = { bancoId, productoId, stockActual: 0, stockReservado: 0 };
          inventoryChanges.set(key, change);
        }
        return change;
      };

      for (const request of requests) {
        for (const detail of request.detalles) {
          inventoryChange(request.bancoId, detail.productoId).stockReservado -= detail.cantidadAprobada;
        }
      }
      const deliveryIds = deliveries.map((delivery) => delivery.id);
      for (const delivery of deliveries) {
        if (!delivery.bancoId) {
          throw new AppError('Delivery has no bank; reconcile inventory before deleting this account', 409);
        }
        for (const detail of delivery.detalles) {
          const change = inventoryChange(delivery.bancoId, detail.productoId);
          change.stockActual += detail.cantidad;
          change.stockReservado += detail.cantidad;
        }
      }
      for (const change of inventoryChanges.values()) {
        const inventory = await tx.inventario.findUnique({
          where: {
            bancoId_productoId: {
              bancoId: change.bancoId,
              productoId: change.productoId,
            },
          },
        });
        if (
          !inventory
          || inventory.stockReservado + change.stockReservado < 0
          || inventory.stockActual + change.stockActual
            < inventory.stockReservado + change.stockReservado
        ) {
          throw new AppError(
            'Inventory cannot be reconciled safely; adjust stock before deleting this account',
            409,
          );
        }
        await tx.inventario.update({
          where: { id: inventory.id },
          data: {
            stockActual: { increment: change.stockActual },
            stockReservado: { increment: change.stockReservado },
          },
        });
      }

      const donations = await tx.donacion.findMany({
        where: {
          OR: [
            ...(user.donante ? [{ donanteId: user.donante.id }] : []),
            ...(user.beneficiario ? [{ beneficiarioId: user.beneficiario.id }] : []),
          ],
        },
        select: {
          id: true,
          bancoId: true,
          producto_id: true,
          cantidad: true,
          estado: true,
        },
      });
      for (const donation of donations) {
        const movements = await tx.movimientoInventario.findMany({
          where: { donacionId: donation.id },
        });
        if (donation.estado === EstadoDonacion.ACEPTADA) {
          if (
            movements.length !== 1
            || movements[0].tipo !== TipoMovimientoInventario.DONACION_ACEPTADA
            || movements[0].cantidad !== donation.cantidad
          ) {
            throw new AppError(
              'An accepted donation has no reliable inventory movement; reconcile stock before deleting this account',
              409,
            );
          }
          const inventory = await tx.inventario.findUnique({
            where: {
              bancoId_productoId: {
                bancoId: donation.bancoId,
                productoId: donation.producto_id,
              },
            },
          });
          if (
            !inventory
            || inventory.stockActual - donation.cantidad < inventory.stockReservado
          ) {
            throw new AppError(
              'Accepted donation stock has been reserved or consumed; adjust inventory before deleting this account',
              409,
            );
          }
          await tx.inventario.update({
            where: { id: inventory.id },
            data: { stockActual: { decrement: donation.cantidad } },
          });
        } else if (movements.length > 0) {
          throw new AppError(
            'Donation inventory history is inconsistent; reconcile stock before deleting this account',
            409,
          );
        }
      }

      if (deliveryIds.length) {
        const deliveryDetailIds = deliveries.flatMap((delivery) => (
          delivery.detalles.map((detail) => detail.id)
        ));
        await tx.movimientoInventario.deleteMany({
          where: { detalleEntregaId: { in: deliveryDetailIds } },
        });
        await tx.detalleEntrega.deleteMany({ where: { entregaId: { in: deliveryIds } } });
        await tx.entrega.deleteMany({ where: { id: { in: deliveryIds } } });
      }
      if (requestIds.length) {
        await tx.detalleSolicitud.deleteMany({ where: { solicitudId: { in: requestIds } } });
        await tx.solicitudAlimentos.deleteMany({ where: { id: { in: requestIds } } });
      }

      const donationIds = donations.map((donation) => donation.id);
      if (donationIds.length) {
        await tx.movimientoInventario.deleteMany({ where: { donacionId: { in: donationIds } } });
        await tx.donacion.deleteMany({ where: { id: { in: donationIds } } });
      }
      if (registrationIds.length) {
        await tx.documentoVerificacion.deleteMany({
          where: { solicitudRegistroId: { in: registrationIds } },
        });
        await tx.solicitudRegistro.deleteMany({ where: { id: { in: registrationIds } } });
      }
      await tx.auditoria.deleteMany({ where: { usuarioId: userId } });
      await tx.membresiaBanco.deleteMany({ where: { usuarioId: userId } });
      if (user.donante) await tx.donante.delete({ where: { id: user.donante.id } });
      if (user.beneficiario) {
        await tx.beneficiario.delete({ where: { id: user.beneficiario.id } });
      }
      await tx.usuario.delete({ where: { id: userId } });
      return documents.map((document) => document.nombreAlmacenado);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let documentCleanupWarnings = 0;
    for (const storedName of storedDocumentNames) {
      if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(storedName)) {
        documentCleanupWarnings += 1;
        console.error('Unable to remove verification document with an invalid stored name');
        continue;
      }
      try {
        await unlink(path.join(getDocumentsDirectory(), storedName));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          documentCleanupWarnings += 1;
          console.error('Unable to remove a deleted user verification document:', error);
        }
      }
    }
    res.json({ deleted: true, documentCleanupWarnings });
  } catch (error) {
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
