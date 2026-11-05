import { NextFunction, Request, Response } from 'express';
import {
  EstadoEntrega,
  EstadoSolicitudAlimentos,
  Prisma,
  RolUsuario,
  TipoMovimientoInventario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';
import { isAdminRole } from '../lib/roles';

interface DeliveryItem {
  detalleSolicitudId: number;
  cantidad: number;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('Request body must be an object', 400);
  }
  return value as Record<string, unknown>;
}

function parseDeliveryItems(value: unknown): DeliveryItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new AppError('items must contain between 1 and 50 delivery details', 400);
  }
  const items = value.map((entry, index) => {
    const item = asObject(entry);
    return {
      detalleSolicitudId: parsePositiveInteger(
        item.detalleSolicitudId,
        `items[${index}].detalleSolicitudId`,
      ),
      cantidad: parsePositiveInteger(item.cantidad, `items[${index}].cantidad`),
    };
  });
  if (new Set(items.map((item) => item.detalleSolicitudId)).size !== items.length) {
    throw new AppError('A request detail can only appear once per delivery', 400);
  }
  return items;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new AppError(`${field} is required and must be at most ${maxLength} characters`, 400);
  }
  return value.trim();
}

export async function listDeliveries(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const where: Prisma.EntregaWhereInput = {};
    if (req.auth.role === RolUsuario.BANCO) {
      where.bancoId = { in: req.auth.bankIds };
    } else if (req.auth.role === RolUsuario.BENEFICIARIO) {
      const beneficiary = await prisma.beneficiario.findUnique({
        where: { usuarioId: req.auth.userId },
      });
      if (!beneficiary) throw new AppError('Beneficiary profile not found', 404);
      where.beneficiarioId = beneficiary.id;
    }

    if (req.query.productId !== undefined) {
      const productId = parsePositiveInteger(req.query.productId, 'productId');
      where.OR = [
        { producto_id: productId },
        { detalles: { some: { productoId: productId } } },
      ];
    }

    const deliveries = await prisma.entrega.findMany({
      where,
      include: {
        producto: true,
        banco: { select: { id: true, nombre: true } },
        solicitud: { select: { id: true, estado: true } },
        detalles: {
          include: {
            producto: true,
            detalleSolicitud: { select: { cantidadSolicitada: true, cantidadAprobada: true } },
          },
        },
      },
      orderBy: { fecha: 'desc' },
    });
    res.json(deliveries);
  } catch (error) {
    next(error);
  }
}

export async function createDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role !== RolUsuario.BANCO && !isAdminRole(req.auth.role)) {
      throw new AppError('Only a food bank can register deliveries', 403);
    }
    const body = asObject(req.body);
    const solicitudId = parsePositiveInteger(body.solicitudId, 'solicitudId');
    const items = parseDeliveryItems(body.items);
    const entregadaPor = requiredText(body.entregadaPor, 'entregadaPor', 191);
    const recibidaPor = body.recibidaPor === undefined
      ? null
      : requiredText(body.recibidaPor, 'recibidaPor', 191);
    const observaciones = typeof body.observaciones === 'string'
      ? body.observaciones.trim().slice(0, 4000)
      : null;

    const delivery = await prisma.$transaction(async (tx) => {
      const request = await tx.solicitudAlimentos.findUnique({
        where: { id: solicitudId },
        include: {
          beneficiario: { select: { id: true, nombreOrganizacion: true } },
          detalles: true,
        },
      });
      if (!request) throw new AppError('Food request not found', 404);
      if (
        req.auth!.role === RolUsuario.BANCO
        && !req.auth!.bankIds.includes(request.bancoId)
      ) {
        throw new AppError('Food request not found', 404);
      }
      if (
        request.estado !== EstadoSolicitudAlimentos.APROBADA
        && request.estado !== EstadoSolicitudAlimentos.APROBADA_PARCIALMENTE
      ) {
        throw new AppError('Deliveries require an approved food request', 409);
      }

      const detailById = new Map(request.detalles.map((detail) => [detail.id, detail]));
      const deliveredRows = await tx.detalleEntrega.groupBy({
        by: ['detalleSolicitudId'],
        where: { detalleSolicitud: { solicitudId } },
        _sum: { cantidad: true },
      });
      const deliveredByDetail = new Map(
        deliveredRows.map((row) => [row.detalleSolicitudId, row._sum.cantidad ?? 0]),
      );
      for (const item of items) {
        const detail = detailById.get(item.detalleSolicitudId);
        if (!detail || detail.cantidadAprobada <= 0) {
          throw new AppError('Delivery item is not part of this approved request', 400);
        }
        const alreadyDelivered = deliveredByDetail.get(detail.id) ?? 0;
        if (item.cantidad > detail.cantidadAprobada - alreadyDelivered) {
          throw new AppError('Delivery quantity exceeds the approved remaining quantity', 409);
        }
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
          || inventory.stockActual < item.cantidad
          || inventory.stockReservado < item.cantidad
        ) {
          throw new AppError('Reserved inventory is no longer available', 409);
        }
      }

      const created = await tx.entrega.create({
        data: {
          solicitudId,
          bancoId: request.bancoId,
          beneficiarioId: request.beneficiarioId,
          beneficiario_referencia: request.beneficiario.nombreOrganizacion,
          entregadaPor,
          recibidaPor,
          observaciones,
          registradaPorId: req.auth!.userId,
          estado: EstadoEntrega.REGISTRADA,
          detalles: {
            create: items.map((item) => {
              const detail = detailById.get(item.detalleSolicitudId)!;
              return {
                detalleSolicitudId: detail.id,
                productoId: detail.productoId,
                cantidad: item.cantidad,
              };
            }),
          },
        },
        include: { detalles: true },
      });

      for (const detailDelivery of created.detalles) {
        const inventory = await tx.inventario.findUniqueOrThrow({
          where: {
            bancoId_productoId: {
              bancoId: request.bancoId,
              productoId: detailDelivery.productoId,
            },
          },
        });
        await tx.inventario.update({
          where: { id: inventory.id },
          data: {
            stockActual: { decrement: detailDelivery.cantidad },
            stockReservado: { decrement: detailDelivery.cantidad },
          },
        });
        await tx.movimientoInventario.create({
          data: {
            bancoId: request.bancoId,
            inventarioId: inventory.id,
            productoId: detailDelivery.productoId,
            tipo: TipoMovimientoInventario.ENTREGA_REGISTRADA,
            cantidad: detailDelivery.cantidad,
            detalleEntregaId: detailDelivery.id,
            usuarioId: req.auth!.userId,
          },
        });
      }

      const completedDetails = request.detalles.every((detail) => (
        (deliveredByDetail.get(detail.id) ?? 0)
        + (items.find((item) => item.detalleSolicitudId === detail.id)?.cantidad ?? 0)
        >= detail.cantidadAprobada
      ));
      if (completedDetails) {
        await tx.solicitudAlimentos.update({
          where: { id: request.id },
          data: { estado: EstadoSolicitudAlimentos.ENTREGADA },
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: request.bancoId,
          accion: 'ENTREGA_REGISTRADA',
          entidad: 'Entrega',
          entidadId: String(created.id),
        },
      });

      return tx.entrega.findUnique({
        where: { id: created.id },
        include: {
          banco: { select: { id: true, nombre: true } },
          solicitud: { select: { id: true, estado: true } },
          detalles: { include: { producto: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json(delivery);
  } catch (error) {
    next(error);
  }
}

export async function confirmDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role !== RolUsuario.BENEFICIARIO) {
      throw new AppError('Only beneficiaries can confirm delivery receipt', 403);
    }
    const deliveryId = parsePositiveInteger(req.params.id, 'delivery id');
    const body = asObject(req.body);
    const recibidaPor = requiredText(body.recibidaPor, 'recibidaPor', 191);
    const updated = await prisma.$transaction(async (tx) => {
      const delivery = await tx.entrega.findUnique({
        where: { id: deliveryId },
        select: { id: true, beneficiarioId: true, estado: true, bancoId: true },
      });
      const beneficiary = await tx.beneficiario.findUnique({
        where: { usuarioId: req.auth!.userId },
        select: { id: true },
      });
      if (!delivery || !beneficiary || delivery.beneficiarioId !== beneficiary.id) {
        throw new AppError('Delivery not found', 404);
      }
      if (delivery.estado !== EstadoEntrega.REGISTRADA) {
        throw new AppError('Only unconfirmed deliveries can be confirmed', 409);
      }

      const transition = await tx.entrega.updateMany({
        where: { id: delivery.id, estado: EstadoEntrega.REGISTRADA },
        data: {
          estado: EstadoEntrega.CONFIRMADA,
          recibidaPor,
          confirmadaPorId: req.auth!.userId,
          confirmadaEn: new Date(),
        },
      });
      if (transition.count !== 1) {
        throw new AppError('Delivery has already been confirmed', 409);
      }
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: delivery.bancoId,
          accion: 'ENTREGA_CONFIRMADA',
          entidad: 'Entrega',
          entidadId: String(delivery.id),
        },
      });
      return tx.entrega.findUnique({ where: { id: delivery.id } });
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}
