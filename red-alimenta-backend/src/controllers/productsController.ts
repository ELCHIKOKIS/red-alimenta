import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parseBooleanField } from '../lib/errors';

function normalizeText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > 191) {
    throw new AppError(`${fieldName} is required and must be at most 191 characters`, 400);
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
  if (body.stock_actual !== undefined && Number(body.stock_actual) !== 0) {
    throw new AppError('Stock is managed per food bank; create the product with stock_actual set to 0', 400);
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
      select: { id: true, nombre: true, categoria: true, unidad: true, activo: true },
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
      select: {
        id: true,
        nombre: true,
        categoria: true,
        unidad: true,
        activo: true,
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

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.producto.create({
        data: payload,
        select: { id: true, nombre: true, categoria: true, unidad: true, activo: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'PRODUCTO_CREADO',
          entidad: 'Producto',
          entidadId: String(created.id),
        },
      });
      return created;
    });
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

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError('Product payload is required', 400);
    }
    const body = req.body as Record<string, unknown>;
    const payload = normalizeProductPayload({
      nombre: body.nombre ?? product.nombre,
      categoria: body.categoria ?? product.categoria,
      unidad: body.unidad ?? product.unidad,
      activo: body.activo ?? product.activo,
      stock_actual: body.stock_actual,
    });

    if (payload.nombre !== product.nombre) {
      const duplicate = await prisma.producto.findUnique({ where: { nombre: payload.nombre } });
      if (duplicate && duplicate.id !== productId) {
        throw new AppError('A product with that name already exists', 409);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.producto.update({
        where: { id: productId },
        data: payload,
        select: { id: true, nombre: true, categoria: true, unidad: true, activo: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'PRODUCTO_ACTUALIZADO',
          entidad: 'Producto',
          entidadId: String(item.id),
        },
      });
      return item;
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

    await prisma.$transaction(async (tx) => {
      await tx.producto.update({
        where: { id: productId },
        data: { activo: false },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          accion: 'PRODUCTO_DESACTIVADO',
          entidad: 'Producto',
          entidadId: String(productId),
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
