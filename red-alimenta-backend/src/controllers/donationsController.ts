import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';

function normalizeDonationPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Donation payload is required', 400);
  }

  const body = payload as Record<string, unknown>;
  const producto_id = parsePositiveInteger(body.producto_id, 'producto_id');
  const cantidad = parsePositiveInteger(body.cantidad, 'cantidad');

  const donante_referencia = typeof body.donante_referencia === 'string'
    ? body.donante_referencia.trim()
    : '';

  if (donante_referencia === '') {
    throw new AppError('donante_referencia is required', 400);
  }

  return {
    producto_id,
    cantidad,
    donante_referencia,
  };
}

export async function listDonations(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.query;
    const where: Prisma.DonacionWhereInput = {};

    if (productId !== undefined) {
      const parsed = Number(productId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError('productId must be a positive integer', 400);
      }
      where.producto_id = parsed;
    }

    const donations = await prisma.donacion.findMany({
      where,
      include: { producto: true },
      orderBy: { fecha: 'desc' },
    });

    res.json(donations);
  } catch (error) {
    next(error);
  }
}

export async function createDonation(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = normalizeDonationPayload(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.producto.findUnique({ where: { id: payload.producto_id } });
      if (!product) {
        throw new AppError('Product not found', 404);
      }

      if (!product.activo) {
        throw new AppError('Product is inactive and cannot receive donations', 409);
      }

      const donation = await tx.donacion.create({
        data: {
          producto_id: payload.producto_id,
          cantidad: payload.cantidad,
          donante_referencia: payload.donante_referencia,
        },
      });

      const updatedProduct = await tx.producto.update({
        where: { id: payload.producto_id },
        data: {
          stock_actual: {
            increment: payload.cantidad,
          },
        },
      });

      return { donation, product: updatedProduct };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
