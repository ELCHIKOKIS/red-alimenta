import { NextFunction, Request, Response } from 'express';
import {
  EstadoBanco,
  EstadoCuenta,
  Prisma,
  RolUsuario,
  NivelMembresiaBanco,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';
import { assertBankAccess, getBankId } from '../lib/bankAccess';
import { hashPassword } from '../lib/auth';

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('Request body must be an object', 400);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new AppError(`${field} is required and must be at most ${maxLength} characters`, 400);
  }
  return value.trim();
}

function parseCoverage(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new AppError('coberturas must contain between 1 and 100 locations', 400);
  }
  return value.map((item, index) => {
    const coverage = asObject(item);
    return {
      departamento: requiredText(coverage.departamento, `coberturas[${index}].departamento`, 100),
      municipio: coverage.municipio === undefined || coverage.municipio === null
        ? '*'
        : requiredText(coverage.municipio, `coberturas[${index}].municipio`, 100),
    };
  });
}

export async function listBanks(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    let where: Prisma.BancoAlimentosWhereInput = {};

    if (req.auth.role === RolUsuario.BANCO) {
      where.id = { in: req.auth.bankIds };
    } else if (req.auth.role !== RolUsuario.ADMIN_GENERAL) {
      where.estado = EstadoBanco.ACTIVO;
    }

    if (req.auth.role === RolUsuario.BENEFICIARIO) {
      const beneficiary = await prisma.beneficiario.findUnique({
        where: { usuarioId: req.auth.userId },
      });
      if (!beneficiary || beneficiary.estadoVerificacion !== 'APROBADA') {
        throw new AppError('Beneficiary registration has not been approved', 403);
      }
      where.coberturas = {
        some: {
          departamento: beneficiary.departamento,
          OR: [{ municipio: beneficiary.municipio }, { municipio: '*' }],
        },
      };
    }

    const banks = await prisma.bancoAlimentos.findMany({
      where,
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        departamento: true,
        municipio: true,
        direccion: true,
        telefono: true,
        estado: true,
        coberturas: { select: { departamento: true, municipio: true } },
      },
    });
    res.json(banks);
  } catch (error) {
    next(error);
  }
}

export async function createBank(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const body = asObject(req.body);
    const coberturas = parseCoverage(body.coberturas);
    const bank = await prisma.$transaction(async (tx) => {
      const created = await tx.bancoAlimentos.create({
        data: {
          nombre: requiredText(body.nombre, 'nombre', 191),
          nit: body.nit === undefined ? undefined : requiredText(body.nit, 'nit', 30),
          descripcion: typeof body.descripcion === 'string' ? body.descripcion.trim() : undefined,
          departamento: requiredText(body.departamento, 'departamento', 100),
          municipio: requiredText(body.municipio, 'municipio', 100),
          direccion: typeof body.direccion === 'string' ? body.direccion.trim() : undefined,
          telefono: typeof body.telefono === 'string' ? body.telefono.trim() : undefined,
          coberturas: { create: coberturas },
        },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: created.id,
          accion: 'BANCO_CREADO',
          entidad: 'BancoAlimentos',
          entidadId: String(created.id),
        },
      });
      return created;
    });
    res.status(201).json(bank);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('A food bank with that name or identification already exists', 409));
    }
    return next(error);
  }
}

export async function updateBank(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    const body = asObject(req.body);
    const data: Prisma.BancoAlimentosUpdateInput = {};
    if (body.nombre !== undefined) data.nombre = requiredText(body.nombre, 'nombre', 191);
    if (body.nit !== undefined) data.nit = requiredText(body.nit, 'nit', 30);
    if (body.descripcion !== undefined) {
      if (typeof body.descripcion !== 'string') throw new AppError('descripcion must be text', 400);
      data.descripcion = body.descripcion.trim();
    }
    if (body.departamento !== undefined) {
      data.departamento = requiredText(body.departamento, 'departamento', 100);
    }
    if (body.municipio !== undefined) data.municipio = requiredText(body.municipio, 'municipio', 100);
    if (body.direccion !== undefined) {
      data.direccion = body.direccion === null ? null : requiredText(body.direccion, 'direccion', 255);
    }
    if (body.telefono !== undefined) {
      data.telefono = body.telefono === null ? null : requiredText(body.telefono, 'telefono', 30);
    }
    if (body.estado !== undefined) {
      if (body.estado !== EstadoBanco.ACTIVO && body.estado !== EstadoBanco.SUSPENDIDO) {
        throw new AppError('estado must be ACTIVO or SUSPENDIDO', 400);
      }
      data.estado = body.estado;
    }
    if (Object.keys(data).length === 0) throw new AppError('At least one valid field is required', 400);

    const updated = await prisma.$transaction(async (tx) => {
      const bank = await tx.bancoAlimentos.update({ where: { id: bankId }, data });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'BANCO_ACTUALIZADO',
          entidad: 'BancoAlimentos',
          entidadId: String(bankId),
          detalles: { campos: Object.keys(data) },
        },
      });
      return bank;
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('A food bank with that name or identification already exists', 409));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return next(new AppError('Food bank not found', 404));
    }
    next(error);
  }
}

export async function addBankCoverage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    const body = asObject(req.body);
    const coverage = {
      departamento: requiredText(body.departamento, 'departamento', 100),
      municipio: body.municipio === undefined || body.municipio === null
        ? '*'
        : requiredText(body.municipio, 'municipio', 100),
    };
    const created = await prisma.$transaction(async (tx) => {
      const coverageRow = await tx.coberturaBanco.create({
        data: { bancoId: bankId, ...coverage },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'COBERTURA_BANCO_AGREGADA',
          entidad: 'CoberturaBanco',
          entidadId: String(coverageRow.id),
        },
      });
      return coverageRow;
    });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('This coverage already exists', 409));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return next(new AppError('Food bank not found', 404));
    }
    next(error);
  }
}

export async function createBankUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    const body = asObject(req.body);
    const nombre = requiredText(body.nombre, 'nombre', 150);
    const email = requiredText(body.email, 'email', 191).toLowerCase();
    const password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('email must be a valid email address', 400);
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new AppError('password must contain between 12 and 128 characters', 400);
    }
    if (
      body.nivel !== undefined
      && body.nivel !== NivelMembresiaBanco.ADMINISTRADOR
      && body.nivel !== NivelMembresiaBanco.OPERADOR
    ) {
      throw new AppError('nivel must be ADMINISTRADOR or OPERADOR', 400);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.usuario.create({
        data: {
          nombre,
          email,
          passwordHash,
          rol: RolUsuario.BANCO,
          estado: EstadoCuenta.ACTIVA,
          membresias: {
            create: {
              bancoId: bankId,
              nivel: (body.nivel as NivelMembresiaBanco | undefined)
                ?? NivelMembresiaBanco.OPERADOR,
            },
          },
        },
        select: { id: true, nombre: true, email: true, rol: true, estado: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'USUARIO_BANCO_CREADO',
          entidad: 'Usuario',
          entidadId: String(created.id),
        },
      });
      return created;
    });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('An account with that email already exists', 409));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return next(new AppError('Food bank not found', 404));
    }
    next(error);
  }
}

export async function getBankAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role !== RolUsuario.BENEFICIARIO) {
      throw new AppError('Only beneficiaries can view published inventory', 403);
    }
    const bankId = getBankId(req);
    const beneficiary = await prisma.beneficiario.findUnique({
      where: { usuarioId: req.auth.userId },
    });
    if (!beneficiary || beneficiary.estadoVerificacion !== 'APROBADA') {
      throw new AppError('Beneficiary registration has not been approved', 403);
    }

    const bank = await prisma.bancoAlimentos.findFirst({
      where: {
        id: bankId,
        estado: EstadoBanco.ACTIVO,
        coberturas: {
          some: {
            departamento: beneficiary.departamento,
            OR: [{ municipio: beneficiary.municipio }, { municipio: '*' }],
          },
        },
      },
      select: {
        id: true,
        nombre: true,
        inventarios: {
          where: { activo: true, publicado: true, producto: { activo: true } },
          include: { producto: true },
          orderBy: { producto: { nombre: 'asc' } },
        },
      },
    });
    if (!bank) throw new AppError('Food bank not found in your coverage area', 404);

    res.json({
      banco: { id: bank.id, nombre: bank.nombre },
      productos: bank.inventarios.map((inventory) => ({
        ...inventory.producto,
        inventarioId: inventory.id,
        cantidadDisponible: Math.max(0, inventory.stockActual - inventory.stockReservado),
      })).filter((product) => product.cantidadDisponible > 0),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBankInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const inventory = await prisma.inventario.findMany({
      where: { bancoId: bankId },
      include: { producto: true },
      orderBy: { producto: { nombre: 'asc' } },
    });
    res.json(inventory.map((item) => ({
      ...item,
      cantidadDisponible: Math.max(0, item.stockActual - item.stockReservado),
    })));
  } catch (error) {
    next(error);
  }
}

export async function addProductToInventory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const body = asObject(req.body);
    const productId = parsePositiveInteger(body.productoId, 'productoId');
    if (body.publicado !== undefined && typeof body.publicado !== 'boolean') {
      throw new AppError('publicado must be a boolean', 400);
    }
    const inventory = await prisma.$transaction(async (tx) => {
      const [bank, product] = await Promise.all([
        tx.bancoAlimentos.findUnique({ where: { id: bankId } }),
        tx.producto.findUnique({ where: { id: productId } }),
      ]);
      if (!bank || bank.estado !== EstadoBanco.ACTIVO) {
        throw new AppError('Food bank is not active', 409);
      }
      if (!product || !product.activo) throw new AppError('Active product not found', 404);
      const created = await tx.inventario.create({
        data: {
          bancoId: bankId,
          productoId: productId,
          publicado: body.publicado === true,
        },
        include: { producto: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'PRODUCTO_AGREGADO_A_INVENTARIO',
          entidad: 'Inventario',
          entidadId: String(created.id),
        },
      });
      return created;
    });
    res.status(201).json(inventory);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('Product is already in this bank inventory', 409));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return next(new AppError('Product or food bank not found', 404));
    }
    next(error);
  }
}

export async function updateInventorySettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const productId = parsePositiveInteger(req.params.productId, 'productId');
    const body = asObject(req.body);
    if (typeof body.publicado !== 'boolean' && typeof body.activo !== 'boolean') {
      throw new AppError('At least one of publicado or activo must be a boolean', 400);
    }
    const data: Prisma.InventarioUpdateInput = {};
    if (typeof body.publicado === 'boolean') data.publicado = body.publicado;
    if (typeof body.activo === 'boolean') data.activo = body.activo;
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.inventario.update({
        where: { bancoId_productoId: { bancoId: bankId, productoId: productId } },
        data,
        include: { producto: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'INVENTARIO_ACTUALIZADO',
          entidad: 'Inventario',
          entidadId: String(item.id),
          detalles: {
            publicado: typeof body.publicado === 'boolean' ? body.publicado : null,
            activo: typeof body.activo === 'boolean' ? body.activo : null,
          },
        },
      });
      return item;
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return next(new AppError('Product inventory not found for this food bank', 404));
    }
    next(error);
  }
}

export async function adjustInventory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const body = asObject(req.body);
    const productId = parsePositiveInteger(req.params.productId, 'productId');
    const cantidad = parsePositiveInteger(body.cantidad, 'cantidad');
    const reason = requiredText(body.motivo, 'motivo', 500);
    const tipo = body.tipo;
    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') {
      throw new AppError('tipo must be ENTRADA or SALIDA', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventario.findUnique({
        where: { bancoId_productoId: { bancoId: bankId, productoId: productId } },
      });
      if (!inventory) throw new AppError('Product inventory not found for this food bank', 404);

      const isEntry = tipo === 'ENTRADA';
      if (!isEntry && cantidad > inventory.stockActual - inventory.stockReservado) {
        throw new AppError('Adjustment exceeds available inventory', 409);
      }

      const updated = await tx.inventario.update({
        where: { id: inventory.id },
        data: isEntry
          ? { stockActual: { increment: cantidad } }
          : { stockActual: { decrement: cantidad } },
      });
      const movement = await tx.movimientoInventario.create({
        data: {
          bancoId: bankId,
          inventarioId: inventory.id,
          productoId: productId,
          tipo: isEntry
            ? 'AJUSTE_ENTRADA'
            : 'AJUSTE_SALIDA',
          cantidad,
          usuarioId: req.auth!.userId,
        },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: req.auth!.userId,
          bancoId: bankId,
          accion: 'INVENTARIO_AJUSTADO',
          entidad: 'MovimientoInventario',
          entidadId: String(movement.id),
          detalles: { tipo, cantidad, motivo: reason },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listBankDonors(req: Request, res: Response, next: NextFunction) {
  try {
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const donors = await prisma.donante.findMany({
      where: { donaciones: { some: { bancoId: bankId } } },
      select: {
        id: true,
        organizacion: true,
        direccion: true,
        usuario: { select: { id: true, nombre: true, email: true, telefono: true } },
      },
      orderBy: { usuario: { nombre: 'asc' } },
    });
    res.json(donors);
  } catch (error) {
    next(error);
  }
}

export async function listBankBeneficiaries(req: Request, res: Response, next: NextFunction) {
  try {
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const beneficiaries = await prisma.beneficiario.findMany({
      where: {
        estadoVerificacion: 'APROBADA',
        OR: [
          { solicitudes: { some: { bancoId: bankId } } },
          { donaciones: { some: { bancoId: bankId } } },
        ],
      },
      select: {
        id: true,
        nombreOrganizacion: true,
        nit: true,
        tipoOrganizacion: true,
        departamento: true,
        municipio: true,
        telefono: true,
        usuario: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: { nombreOrganizacion: 'asc' },
    });
    res.json(beneficiaries);
  } catch (error) {
    next(error);
  }
}

export async function getBankHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const bankId = getBankId(req);
    assertBankAccess(req, bankId);
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError('limit must be an integer between 1 and 100', 400);
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new AppError('offset must be a non-negative integer', 400);
    }
    const history = await prisma.auditoria.findMany({
      where: { bancoId: bankId },
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
      orderBy: { creadoEn: 'desc' },
      skip: offset,
      take: limit,
    });
    res.json({ items: history, limit, offset });
  } catch (error) {
    next(error);
  }
}
