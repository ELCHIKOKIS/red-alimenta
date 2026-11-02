import { NextFunction, Request, Response } from 'express';
import {
  EstadoDonacion,
  EstadoBanco,
  Prisma,
  RolUsuario,
  TipoMovimientoInventario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';

function normalizeDonationPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Donation payload is required', 400);
  }

  const body = payload as Record<string, unknown>;
  const productoId = parsePositiveInteger(body.productoId, 'productoId');
  const bancoId = parsePositiveInteger(body.bancoId, 'bancoId');
  const cantidad = parsePositiveInteger(body.cantidad, 'cantidad');
  const fechaVencimiento = body.fechaVencimiento === undefined || body.fechaVencimiento === null
    ? null
    : new Date(String(body.fechaVencimiento));
  if (fechaVencimiento && Number.isNaN(fechaVencimiento.getTime())) {
    throw new AppError('fechaVencimiento must be a valid date', 400);
  }

  return {
    productoId,
    bancoId,
    cantidad,
    fechaVencimiento,
    observaciones: typeof body.observaciones === 'string' ? body.observaciones.trim() : null,
  };
}

export async function listDonations(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const { productId } = req.query;
    const where: Prisma.DonacionWhereInput = {};

    if (productId !== undefined) {
      where.producto_id = parsePositiveInteger(productId, 'productId');
    }

    if (req.auth.role === RolUsuario.BANCO) {
      where.bancoId = { in: req.auth.bankIds };
    } else if (req.auth.role === RolUsuario.DONANTE) {
      const donor = await prisma.donante.findUnique({ where: { usuarioId: req.auth.userId } });
      if (!donor) throw new AppError('Donor profile not found', 404);
      where.donanteId = donor.id;
    }

    const donations = await prisma.donacion.findMany({
      where,
      include: {
        producto: true,
        banco: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: 'desc' },
    });

    res.json(donations);
  } catch (error) {
    next(error);
  }
}

export async function createDonation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role !== RolUsuario.DONANTE) {
      throw new AppError('Only donors can register donations', 403);
    }
    const payload = normalizeDonationPayload(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const [product, bank, donor, user] = await Promise.all([
        tx.producto.findUnique({ where: { id: payload.productoId } }),
        tx.bancoAlimentos.findUnique({ where: { id: payload.bancoId } }),
        tx.donante.findUnique({ where: { usuarioId: req.auth!.userId } }),
        tx.usuario.findUnique({ where: { id: req.auth!.userId }, select: { nombre: true } }),
      ]);

      if (!product || !product.activo) {
        throw new AppError('Product is not available for donation', 404);
      }
      if (!bank || bank.estado !== EstadoBanco.ACTIVO) {
        throw new AppError('Receiving food bank is not available', 404);
      }
      if (!donor || !user) {
        throw new AppError('Donor profile not found', 404);
      }

      const donation = await tx.donacion.create({
        data: {
          producto_id: product.id,
          cantidad: payload.cantidad,
          donante_referencia: user.nombre,
          bancoId: bank.id,
          donanteId: donor.id,
          fechaVencimiento: payload.fechaVencimiento,
          observaciones: payload.observaciones,
        },
        include: {
          producto: true,
          banco: { select: { id: true, nombre: true } },
        },
      });

      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bank.id,
          accion: 'DONACION_REGISTRADA',
          entidad: 'Donacion',
          entidadId: String(donation.id),
          detalles: { cantidad: payload.cantidad, productoId: product.id },
        },
      });

      return donation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(201).json({ donation: result, inventoryUpdated: false });
  } catch (error) {
    next(error);
  }
}

export async function reviewDonation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const donationId = parsePositiveInteger(req.params.id, 'donation id');
    const body = req.body as Record<string, unknown>;
    if (!body || (body.decision !== 'ACEPTAR' && body.decision !== 'RECHAZAR')) {
      throw new AppError('decision must be ACEPTAR or RECHAZAR', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const donation = await tx.donacion.findUnique({
        where: { id: donationId },
        include: { producto: true },
      });
      if (!donation) throw new AppError('Donation not found', 404);
      if (
        req.auth!.role === RolUsuario.BANCO
        && !req.auth!.bankIds.includes(donation.bancoId)
      ) {
        throw new AppError('Donation not found', 404);
      }
      if (donation.estado !== EstadoDonacion.PENDIENTE) {
        throw new AppError('Only pending donations can be reviewed', 409);
      }

      const accepted = body.decision === 'ACEPTAR';
      const transition = await tx.donacion.updateMany({
        where: { id: donation.id, estado: EstadoDonacion.PENDIENTE },
        data: {
          estado: accepted ? EstadoDonacion.ACEPTADA : EstadoDonacion.RECHAZADA,
          revisadaPorId: req.auth!.userId,
          revisadaEn: new Date(),
        },
      });
      if (transition.count !== 1) {
        throw new AppError('Donation has already been reviewed', 409);
      }

      if (accepted) {
        const inventory = await tx.inventario.upsert({
          where: {
            bancoId_productoId: {
              bancoId: donation.bancoId,
              productoId: donation.producto_id,
            },
          },
          create: {
            bancoId: donation.bancoId,
            productoId: donation.producto_id,
            stockActual: donation.cantidad,
            activo: donation.producto.activo,
          },
          update: { stockActual: { increment: donation.cantidad } },
        });

        await tx.movimientoInventario.create({
          data: {
            bancoId: donation.bancoId,
            inventarioId: inventory.id,
            productoId: donation.producto_id,
            tipo: TipoMovimientoInventario.DONACION_ACEPTADA,
            cantidad: donation.cantidad,
            donacionId: donation.id,
            usuarioId: req.auth!.userId,
          },
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: donation.bancoId,
          accion: accepted ? 'DONACION_ACEPTADA' : 'DONACION_RECHAZADA',
          entidad: 'Donacion',
          entidadId: String(donation.id),
        },
      });

      return tx.donacion.findUnique({
        where: { id: donation.id },
        include: { producto: true, banco: { select: { id: true, nombre: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json(result);
  } catch (error) {
    next(error);
  }
}
