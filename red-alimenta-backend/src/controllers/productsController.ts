import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma, RolUsuario } from '@prisma/client';
import multer from 'multer';
import prisma from '../lib/prisma';
import { AppError, parseBooleanField } from '../lib/errors';
import { hasExpectedImageSignature } from '../lib/imageValidation';
import { PRODUCT_VIEWER_ROLES } from '../lib/roles';
import { publishRealtimeChange } from '../realtime/RealtimeHub';
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => {
    if (!PRODUCT_IMAGE_TYPES.has(file.mimetype)) {
      callback(new AppError('Product images must be JPEG, PNG, or WebP', 400));
      return;
    }
    callback(null, true);
  },
}).single('imagen');

function getProductImageUrl(productId: number): string {
  return `/api/products/${productId}/image?v=${randomUUID()}`;
}

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
      select: {
        id: true,
        nombre: true,
        categoria: true,
        unidad: true,
        activo: true,
        imagenUrl: true,
      },
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
        imagenUrl: true,
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
    if (req.file && !hasExpectedImageSignature(req.file.mimetype, req.file.buffer)) {
      throw new AppError('Image contents do not match the declared file type', 400);
    }

    const existingProduct = await prisma.producto.findUnique({
      where: { nombre: payload.nombre },
    });

    if (existingProduct) {
      throw new AppError('A product with that name already exists', 409);
    }

    const product = await prisma.$transaction(async (tx) => {
      let created = await tx.producto.create({
        data: { ...payload, imagenUrl: null },
        select: {
          id: true,
          nombre: true,
          categoria: true,
          unidad: true,
          activo: true,
          imagenUrl: true,
        },
      });
      if (req.file) {
        await tx.imagenProducto.create({
          data: {
            productoId: created.id,
            tipoMime: req.file.mimetype,
            contenido: req.file.buffer,
          },
        });
        created = await tx.producto.update({
          where: { id: created.id },
          data: { imagenUrl: getProductImageUrl(created.id) },
          select: {
            id: true,
            nombre: true,
            categoria: true,
            unidad: true,
            activo: true,
            imagenUrl: true,
          },
        });
      }
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
    publishRealtimeChange(
      { roles: PRODUCT_VIEWER_ROLES },
      { type: 'product.created', resource: 'products', resourceId: product.id },
    );
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
    const clearImage = body.eliminarImagen === undefined
      ? false
      : parseBooleanField(body.eliminarImagen, 'eliminarImagen');
    if (req.file && clearImage) {
      throw new AppError('Choose a new image or remove the current image, not both', 400);
    }
    if (req.file && !hasExpectedImageSignature(req.file.mimetype, req.file.buffer)) {
      throw new AppError('Image contents do not match the declared file type', 400);
    }
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
        data: {
          ...payload,
          imagenUrl: req.file
            ? getProductImageUrl(productId)
            : clearImage ? null : product.imagenUrl,
        },
        select: {
          id: true,
          nombre: true,
          categoria: true,
          unidad: true,
          activo: true,
          imagenUrl: true,
        },
      });
      if (req.file) {
        await tx.imagenProducto.upsert({
          where: { productoId: productId },
          create: {
            productoId: productId,
            tipoMime: req.file.mimetype,
            contenido: req.file.buffer,
          },
          update: {
            tipoMime: req.file.mimetype,
            contenido: req.file.buffer,
          },
        });
      } else if (clearImage) {
        await tx.imagenProducto.deleteMany({ where: { productoId: productId } });
      }
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

    publishRealtimeChange(
      { roles: PRODUCT_VIEWER_ROLES },
      { type: 'product.updated', resource: 'products', resourceId: updated.id },
    );
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function getProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('Product id must be a positive integer', 400);
    }

    if (!req.auth) throw new AppError('Authentication is required', 401);
    if (req.auth.role === RolUsuario.BENEFICIARIO) {
      const beneficiary = await prisma.beneficiario.findUnique({
        where: { usuarioId: req.auth.userId },
        select: {
          departamento: true,
          municipio: true,
          estadoVerificacion: true,
        },
      });
      if (!beneficiary || beneficiary.estadoVerificacion !== 'APROBADA') {
        throw new AppError('Beneficiary registration has not been approved', 403);
      }

      const inventory = await prisma.inventario.findMany({
        where: {
          productoId: productId,
          activo: true,
          publicado: true,
          producto: { activo: true },
          banco: {
            estado: 'ACTIVO',
            coberturas: {
              some: {
                departamento: beneficiary.departamento,
                OR: [
                  { municipio: beneficiary.municipio },
                  { municipio: '*' },
                ],
              },
            },
          },
        },
        select: { stockActual: true, stockReservado: true },
      });
      if (!inventory.some((item) => item.stockActual > item.stockReservado)) {
        throw new AppError('Product image not found', 404);
      }
    }

    const image = await prisma.imagenProducto.findUnique({
      where: { productoId: productId },
      select: { tipoMime: true, contenido: true },
    });
    if (!image) throw new AppError('Product image not found', 404);

    res
      .type(image.tipoMime)
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(Buffer.from(image.contenido));
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

    publishRealtimeChange(
      { roles: PRODUCT_VIEWER_ROLES },
      { type: 'product.deactivated', resource: 'products', resourceId: productId },
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
