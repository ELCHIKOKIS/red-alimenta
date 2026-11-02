import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parseBooleanField } from '../lib/errors';

function normalizeText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(`${fieldName} is required`, 400);
  }

  return value.trim();
}

function normalizeProductPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Product payload is required', 400);
  }

  const body = payload as Record<string, unknown>;
  const nombre = normalizeText(body.nombre, 'nombre');
  const categoria = normalizeText(body.categoria, 'categoria');
  const unidad = normalizeText(body.unidad, 'unidad');

  let stockActual: number = Number(body.stock_actual ?? 0);

  if (!Number.isInteger(stockActual) || stockActual < 0) {
    throw new AppError('stock_actual must be a non-negative integer', 400);
  }

  let activo = body.activo ?? true;
  if (typeof activo === 'string') {
    const normalized = activo.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') {
      throw new AppError('activo must be a boolean value', 400);
    }
    activo = normalized === 'true';
  }

  if (typeof activo !== 'boolean') {
    throw new AppError('activo must be a boolean value', 400);
  }

  return {
    nombre,
    categoria,
    unidad,
    stock_actual: stockActual,
    activo,
  };
}

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, active } = req.query;
    const where: Prisma.ProductoWhereInput = {};

    if (search && typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { nombre: { contains: term } },
        { categoria: { contains: term } },
      ];
    }

    if (active !== undefined) {
      where.activo = parseBooleanField(active, 'active');
    }

    const products = await prisma.producto.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });

    res.json(products);
  } catch (error) {
    next(error);
  }
}

export async function getProductById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('Product id must be a positive integer', 400);
    }

    const product = await prisma.producto.findUnique({
      where: { id },
      include: {
        _count: {
          select: { donaciones: true, entregas: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = normalizeProductPayload(req.body);

    const existingProduct = await prisma.producto.findUnique({
      where: { nombre: payload.nombre },
    });

    if (existingProduct) {
      throw new AppError('A product with that name already exists', 409);
    }

    const product = await prisma.producto.create({ data: payload });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('Product id must be a positive integer', 400);
    }

    const product = await prisma.producto.findUnique({ where: { id: productId } });
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const payload = normalizeProductPayload({
      ...product,
      ...(req.body ?? {}),
    });

    if (payload.nombre !== product.nombre) {
      const duplicate = await prisma.producto.findUnique({ where: { nombre: payload.nombre } });
      if (duplicate && duplicate.id !== productId) {
        throw new AppError('A product with that name already exists', 409);
      }
    }

    const updated = await prisma.producto.update({
      where: { id: productId },
      data: payload,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('Product id must be a positive integer', 400);
    }

    const product = await prisma.producto.findUnique({ where: { id: productId } });
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    await prisma.producto.update({
      where: { id: productId },
      data: { activo: false },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
