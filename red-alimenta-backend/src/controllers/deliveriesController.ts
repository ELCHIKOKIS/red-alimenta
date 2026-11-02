import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';

function normalizeDeliveryPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Delivery payload is required', 400);
  }

  const body = payload as Record<string, unknown>;
  const producto_id = parsePositiveInteger(body.producto_id, 'producto_id');
  const cantidad = parsePositiveInteger(body.cantidad, 'cantidad');

  const beneficiario_referencia = typeof body.beneficiario_referencia === 'string'
    ? body.beneficiario_referencia.trim()
    : '';

  if (beneficiario_referencia === '') {
    throw new AppError('beneficiario_referencia is required', 400);
  }

  return {
    producto_id,
    cantidad,
    beneficiario_referencia,
  };
}

export async function listDeliveries(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.query;
    const where: Prisma.EntregaWhereInput = {};

    if (productId !== undefined) {
      const parsed = Number(productId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError('productId must be a positive integer', 400);
      }
      where.producto_id = parsed;
    }

    const deliveries = await prisma.entrega.findMany({
      where,
      include: { producto: true },
      orderBy: { fecha: 'desc' },
    });

    res.json(deliveries);
  } catch (error) {
    next(error);
  }
}

export async function createDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = normalizeDeliveryPayload(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.producto.findUnique({ where: { id: payload.producto_id } });
      if (!product) {
        throw new AppError('Product not found', 404);
      }

      if (!product.activo) {
        throw new AppError('Product is inactive and cannot receive deliveries', 409);
      }

      if (payload.cantidad > product.stock_actual) {
        throw new AppError(
          `Delivery quantity exceeds available stock. Available: ${product.stock_actual}`,
          409,
        );
      }

      const delivery = await tx.entrega.create({
        data: {
          producto_id: payload.producto_id,
          cantidad: payload.cantidad,
          beneficiario_referencia: payload.beneficiario_referencia,
        },
      });

      const updatedProduct = await tx.producto.update({
        where: { id: payload.producto_id },
        data: {
          stock_actual: {
            decrement: payload.cantidad,
          },
        },
      });

      return { delivery, product: updatedProduct };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
