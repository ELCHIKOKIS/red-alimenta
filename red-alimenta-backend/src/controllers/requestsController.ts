import { NextFunction, Request, Response } from 'express';
import {
  EstadoBanco,
  EstadoSolicitudAlimentos,
  Prisma,
  RolUsuario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';

interface RequestedItem {
  productoId: number;
  cantidad: number;
}

interface ApprovedItem {
  detalleId: number;
  cantidadAprobada: number;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('Request body must be an object', 400);
  }
  return value as Record<string, unknown>;
}

function parseItems(value: unknown): RequestedItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new AppError('items must contain between 1 and 50 products', 400);
  }
  const items = value.map((entry, index) => {
    const item = asObject(entry);
    return {
      productoId: parsePositiveInteger(item.productoId, `items[${index}].productoId`),
      cantidad: parsePositiveInteger(item.cantidad, `items[${index}].cantidad`),
    };
  });
  if (new Set(items.map((item) => item.productoId)).size !== items.length) {
    throw new AppError('A product can only appear once in a request', 400);
  }
  return items;
}

function parseApprovals(value: unknown): ApprovedItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new AppError('items must contain approval quantities for all request details', 400);
  }
  const approvals = value.map((entry, index) => {
    const item = asObject(entry);
    const cantidadAprobada = Number(item.cantidadAprobada);
    if (!Number.isSafeInteger(cantidadAprobada) || cantidadAprobada < 0) {
      throw new AppError(`items[${index}].cantidadAprobada must be a non-negative integer`, 400);
    }
    return {
      detalleId: parsePositiveInteger(item.detalleId, `items[${index}].detalleId`),
      cantidadAprobada,
    };
  });
  if (new Set(approvals.map((item) => item.detalleId)).size !== approvals.length) {
    throw new AppError('A request detail can only be approved once', 400);
  }
  return approvals;
}

export async function listRequests(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const where: Prisma.SolicitudAlimentosWhereInput = {};
    if (req.auth.role === RolUsuario.BANCO) {
      where.bancoId = { in: req.auth.bankIds };
    } else if (req.auth.role === RolUsuario.BENEFICIARIO) {
      const beneficiary = await prisma.beneficiario.findUnique({
        where: { usuarioId: req.auth.userId },
      });
      if (!beneficiary || beneficiary.estadoVerificacion !== 'APROBADA') {
        throw new AppError('Beneficiary registration has not been approved', 403);
      }
      where.beneficiarioId = beneficiary.id;
    }

    const requests = await prisma.solicitudAlimentos.findMany({
      where,
      include: {
        banco: { select: { id: true, nombre: true } },
        beneficiario: { select: { id: true, nombreOrganizacion: true } },
        detalles: { include: { producto: true } },
      },
      orderBy: { creadaEn: 'desc' },
    });
    res.json(requests);
  } catch (error) {
    next(error);
  }
}

export async function createRequest(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role !== RolUsuario.BENEFICIARIO) {
      throw new AppError('Only beneficiaries can submit food requests', 403);
    }
    const body = asObject(req.body);
    const bancoId = parsePositiveInteger(body.bancoId, 'bancoId');
    const items = parseItems(body.items);
    const observaciones = typeof body.observaciones === 'string'
      ? body.observaciones.trim().slice(0, 4000)
      : undefined;
    const idempotencyKey = req.header('Idempotency-Key');
    if (idempotencyKey !== undefined && (idempotencyKey.trim() === '' || idempotencyKey.length > 100)) {
      throw new AppError('Idempotency-Key must contain between 1 and 100 characters', 400);
    }
    const beneficiary = await prisma.beneficiario.findUnique({
      where: { usuarioId: req.auth.userId },
    });
    if (!beneficiary || beneficiary.estadoVerificacion !== 'APROBADA') {
      throw new AppError('Beneficiary registration has not been approved', 403);
    }
    if (idempotencyKey) {
      const existing = await prisma.solicitudAlimentos.findUnique({
        where: { claveIdempotencia: idempotencyKey },
        include: { detalles: true },
      });
      if (existing) {
        if (existing.beneficiarioId !== beneficiary.id) {
          throw new AppError('Idempotency-Key has already been used', 409);
        }
        return res.status(200).json(existing);
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const bank = await tx.bancoAlimentos.findFirst({
        where: {
          id: bancoId,
          estado: EstadoBanco.ACTIVO,
          coberturas: {
            some: {
              departamento: beneficiary.departamento,
              OR: [{ municipio: beneficiary.municipio }, { municipio: '*' }],
            },
          },
        },
      });
      if (!bank) throw new AppError('Food bank is not available in your coverage area', 404);

      const inventories = await tx.inventario.findMany({
        where: {
          bancoId,
          productoId: { in: items.map((item) => item.productoId) },
          activo: true,
          publicado: true,
          producto: { activo: true },
        },
      });
      const inventoryByProduct = new Map(inventories.map((inventory) => [inventory.productoId, inventory]));
      for (const item of items) {
        const inventory = inventoryByProduct.get(item.productoId);
        if (!inventory) throw new AppError('A requested product is not published by this food bank', 409);
        if (item.cantidad > inventory.stockActual - inventory.stockReservado) {
          throw new AppError(
            `Requested quantity exceeds available stock for product ${item.productoId}`,
            409,
          );
        }
      }

      const request = await tx.solicitudAlimentos.create({
        data: {
          bancoId,
          beneficiarioId: beneficiary.id,
          claveIdempotencia: idempotencyKey,
          observaciones,
          detalles: {
            create: items.map((item) => ({
              productoId: item.productoId,
              cantidadSolicitada: item.cantidad,
            })),
          },
        },
        include: {
          banco: { select: { id: true, nombre: true } },
          detalles: { include: { producto: true } },
        },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId,
          accion: 'SOLICITUD_ALIMENTOS_CREADA',
          entidad: 'SolicitudAlimentos',
          entidadId: String(request.id),
        },
      });
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('Idempotency-Key has already been used', 409));
    }
    next(error);
  }
}

export async function reviewRequest(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const requestId = parsePositiveInteger(req.params.id, 'request id');
    const body = asObject(req.body);
    if (body.decision !== 'APROBAR' && body.decision !== 'RECHAZAR') {
      throw new AppError('decision must be APROBAR or RECHAZAR', 400);
    }
    const decision = body.decision;
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 4000) : null;
    if (decision === 'RECHAZAR' && !motivo) {
      throw new AppError('motivo is required when rejecting a request', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.solicitudAlimentos.findUnique({
        where: { id: requestId },
        include: { detalles: true },
      });
      if (!request) throw new AppError('Food request not found', 404);
      if (
        req.auth!.role === RolUsuario.BANCO
        && !req.auth!.bankIds.includes(request.bancoId)
      ) {
        throw new AppError('Food request not found', 404);
      }
      if (request.estado !== EstadoSolicitudAlimentos.PENDIENTE) {
        throw new AppError('Only pending requests can be reviewed', 409);
      }

      let nextState: EstadoSolicitudAlimentos = EstadoSolicitudAlimentos.RECHAZADA;
      if (decision === 'APROBAR') {
        const approvals = parseApprovals(body.items);
        const detailIds = new Set(request.detalles.map((detail) => detail.id));
        if (
          approvals.length !== request.detalles.length
          || approvals.some((approval) => !detailIds.has(approval.detalleId))
        ) {
          throw new AppError('Provide an approval quantity for every request detail', 400);
        }

        const approvalByDetail = new Map(approvals.map((approval) => [approval.detalleId, approval.cantidadAprobada]));
        let totalApproved = 0;
        let fullyApproved = true;
        for (const detail of request.detalles) {
          const quantity = approvalByDetail.get(detail.id)!;
          if (quantity > detail.cantidadSolicitada) {
            throw new AppError('Approved quantity cannot exceed the requested quantity', 400);
          }
          if (quantity < detail.cantidadSolicitada) fullyApproved = false;
          totalApproved += quantity;
          if (quantity > 0) {
            const inventory = await tx.inventario.findUnique({
              where: {
                bancoId_productoId: {
                  bancoId: request.bancoId,
                  productoId: detail.productoId,
                },
              },
            });
            if (
              !inventory
              || !inventory.activo
              || quantity > inventory.stockActual - inventory.stockReservado
            ) {
              throw new AppError('Approved quantity exceeds available stock', 409);
            }
            await tx.inventario.update({
              where: { id: inventory.id },
              data: { stockReservado: { increment: quantity } },
            });
          }
          await tx.detalleSolicitud.update({
            where: { id: detail.id },
            data: { cantidadAprobada: quantity },
          });
        }
        if (totalApproved === 0) {
          throw new AppError('At least one product quantity must be approved', 400);
        }
        nextState = fullyApproved
          ? EstadoSolicitudAlimentos.APROBADA
          : EstadoSolicitudAlimentos.APROBADA_PARCIALMENTE;
      }

      const transition = await tx.solicitudAlimentos.updateMany({
        where: { id: request.id, estado: EstadoSolicitudAlimentos.PENDIENTE },
        data: {
          estado: nextState,
          motivoDecision: motivo,
          revisadaPorId: req.auth!.userId,
          revisadaEn: new Date(),
        },
      });
      if (transition.count !== 1) throw new AppError('Food request has already been reviewed', 409);

      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: request.bancoId,
          accion: decision === 'APROBAR' ? 'SOLICITUD_APROBADA' : 'SOLICITUD_RECHAZADA',
          entidad: 'SolicitudAlimentos',
          entidadId: String(request.id),
          detalles: { estado: nextState },
        },
      });

      return tx.solicitudAlimentos.findUnique({
        where: { id: request.id },
        include: {
          banco: { select: { id: true, nombre: true } },
          beneficiario: { select: { id: true, nombreOrganizacion: true } },
          detalles: { include: { producto: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}
