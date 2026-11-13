import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { EstadoCuenta, EstadoVerificacion, Prisma, RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../lib/errors';
import { createAccessToken, getAccessTokenLifetimeSeconds, hashPassword, verifyPassword } from '../lib/auth';
import { serializePublicUser } from '../lib/publicUser';
import { disconnectRealtimeSession, publishRealtimeChange } from '../realtime/RealtimeHub';
import { ADMIN_ROLES } from '../lib/roles';

const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('Request body must be an object', 400);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new AppError(`${fieldName} is required and must be at most ${maxLength} characters`, 400);
  }
  return value.trim();
}

function optionalText(value: unknown, fieldName: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(value, fieldName, maxLength);
}

function nullableProfileText(value: unknown, fieldName: string, maxLength: number): string | null {
  if (value === null || value === '') return null;
  return requiredText(value, fieldName, maxLength);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError('Email is required', 400);
  }
  const email = value.trim().toLowerCase();
  if (email.length > 191) {
    throw new AppError('Email must be at most 191 characters', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('email must be a valid email address', 400);
  }
  return email;
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new AppError('password must contain between 12 and 128 characters', 400);
  }
  return value;
}

function getTokenExpiration(): Date {
  return new Date(Date.now() + getAccessTokenLifetimeSeconds() * 1000);
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = asObject(req.body);
    if ('role' in body || 'rol' in body) {
      throw new AppError('Role assignment is not allowed during public registration', 400);
    }

    const accountType = body.tipoCuenta;
    if (accountType !== 'DONANTE' && accountType !== 'BENEFICIARIO') {
      throw new AppError('tipoCuenta must be DONANTE or BENEFICIARIO', 400);
    }

    const name = requiredText(body.nombre, 'nombre', 150);
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password);
    const passwordHash = await hashPassword(password);

    const created = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.usuario.create({
        data: {
          nombre: name,
          email,
          passwordHash,
          rol: accountType,
          estado: accountType === 'DONANTE' ? EstadoCuenta.ACTIVA : EstadoCuenta.PENDIENTE,
        },
      });

      let registrationRequestId: number | undefined;
      if (accountType === 'DONANTE') {
        await tx.donante.create({
          data: {
            usuarioId: createdUser.id,
            organizacion: optionalText(body.organizacion, 'organizacion', 191),
            direccion: optionalText(body.direccion, 'direccion', 255),
          },
        });
      } else {
        const beneficiary = await tx.beneficiario.create({
          data: {
            usuarioId: createdUser.id,
            nombreOrganizacion: requiredText(body.nombreOrganizacion, 'nombreOrganizacion', 191),
            nit: optionalText(body.nit, 'nit', 30),
            tipoOrganizacion: requiredText(body.tipoOrganizacion, 'tipoOrganizacion', 100),
            departamento: requiredText(body.departamento, 'departamento', 100),
            municipio: requiredText(body.municipio, 'municipio', 100),
            direccion: requiredText(body.direccion, 'direccion', 255),
            telefono: optionalText(body.telefono, 'telefono', 30),
          },
        });

        const registration = await tx.solicitudRegistro.create({
          data: {
            beneficiarioId: beneficiary.id,
            solicitanteId: createdUser.id,
          },
        });
        registrationRequestId = registration.id;
      }

      return { user: createdUser, registrationRequestId };
    });

    if (created.registrationRequestId !== undefined) {
      publishRealtimeChange(
        { roles: ADMIN_ROLES },
        {
          type: 'registration.created',
          resource: 'registrations',
          resourceId: created.registrationRequestId,
        },
      );
    } else {
      publishRealtimeChange(
        { roles: ADMIN_ROLES },
        { type: 'user.created', resource: 'users', resourceId: created.user.id },
      );
    }

    res.status(201).json({
      user: serializePublicUser(created.user),
      message: accountType === 'BENEFICIARIO'
        ? 'Registration submitted and awaiting administrator review'
        : 'Registration completed',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('An account with that email or identification already exists', 409));
    }
    return next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = asObject(req.body);
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password);
    const user = await prisma.usuario.findUnique({
      where: { email },
      include: { beneficiario: { select: { estadoVerificacion: true } } },
    });
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      throw new AppError('Email or password is incorrect', 401);
    }
    const canReviewRejectedRegistration = user.rol === RolUsuario.BENEFICIARIO
      && user.beneficiario?.estadoVerificacion === EstadoVerificacion.RECHAZADA;
    if (
      user.estado === EstadoCuenta.SUSPENDIDA
      || (user.estado === EstadoCuenta.RECHAZADA && !canReviewRejectedRegistration)
    ) {
      throw new AppError('This account is not active', 403);
    }

    const expiresAt = getTokenExpiration();
    const sessionId = randomUUID();
    const accessToken = createAccessToken(user.id, sessionId, expiresAt);
    await prisma.sesion.create({
      data: {
        id: sessionId,
        usuarioId: user.id,
        expiraEn: expiresAt,
      },
    });

    res.json({
      accessToken,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString(),
      user: serializePublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      throw new AppError('Authentication is required', 401);
    }
    await prisma.sesion.updateMany({
      where: { id: req.auth.sessionId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    disconnectRealtimeSession(req.auth.sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Authentication is required', 401);
    const body = asObject(req.body);
    if ('role' in body || 'rol' in body || 'estado' in body || 'passwordHash' in body) {
      throw new AppError('Role, account status, and password hash cannot be changed here', 400);
    }

    const name = body.nombre === undefined ? undefined : requiredText(body.nombre, 'nombre', 150);
    const email = body.email === undefined ? undefined : normalizeEmail(body.email);
    const phone = body.telefono === undefined
      ? undefined
      : nullableProfileText(body.telefono, 'telefono', 30);
    const donorFields = ['organizacion'];
    const beneficiaryFields = [
      'nombreOrganizacion',
      'nit',
      'tipoOrganizacion',
      'departamento',
      'municipio',
    ];
    const containsDonorFields = donorFields.some((field) => field in body);
    const containsBeneficiaryFields = beneficiaryFields.some((field) => field in body);
    const containsAddress = 'direccion' in body;
    if (
      name === undefined
      && email === undefined
      && phone === undefined
      && !containsDonorFields
      && !containsBeneficiaryFields
      && !containsAddress
    ) {
      throw new AppError('At least one profile field is required', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.usuario.findUnique({
        where: { id: req.auth!.userId },
        include: { donante: true, beneficiario: true, membresias: { select: { bancoId: true } } },
      });
      if (!current) throw new AppError('User not found', 404);
      if (containsDonorFields && current.rol !== RolUsuario.DONANTE) {
        throw new AppError('Only donor accounts can update donor profile fields', 403);
      }
      if (containsBeneficiaryFields && current.rol !== RolUsuario.BENEFICIARIO) {
        throw new AppError('Only beneficiary accounts can update organization fields', 403);
      }
      if (
        containsAddress
        && current.rol !== RolUsuario.DONANTE
        && current.rol !== RolUsuario.BENEFICIARIO
      ) {
        throw new AppError('Only donor or beneficiary accounts can update an address', 403);
      }

      const userData: Prisma.UsuarioUpdateInput = {};
      if (name !== undefined) userData.nombre = name;
      if (email !== undefined) userData.email = email;
      if (phone !== undefined) userData.telefono = phone;
      if (current.rol === RolUsuario.BENEFICIARIO && phone !== undefined) {
        await tx.beneficiario.update({
          where: { usuarioId: current.id },
          data: { telefono: phone },
        });
      }
      if (Object.keys(userData).length > 0) {
        await tx.usuario.update({ where: { id: current.id }, data: userData });
      }

      if (containsDonorFields || (containsAddress && current.rol === RolUsuario.DONANTE)) {
        if (!current.donante) throw new AppError('Donor profile not found', 404);
        const data: Prisma.DonanteUpdateInput = {};
        if ('organizacion' in body) {
          data.organizacion = nullableProfileText(body.organizacion, 'organizacion', 191);
        }
        if ('direccion' in body) {
          data.direccion = nullableProfileText(body.direccion, 'direccion', 255);
        }
        await tx.donante.update({ where: { usuarioId: current.id }, data });
      }

      let requiresVerificationReview = false;
      let registrationRequestId: number | undefined;
      if (containsBeneficiaryFields || (containsAddress && current.rol === RolUsuario.BENEFICIARIO)) {
        if (!current.beneficiario) throw new AppError('Beneficiary profile not found', 404);
        const data: Prisma.BeneficiarioUpdateInput = {};
        if ('nombreOrganizacion' in body) {
          data.nombreOrganizacion = requiredText(body.nombreOrganizacion, 'nombreOrganizacion', 191);
        }
        if ('nit' in body) data.nit = nullableProfileText(body.nit, 'nit', 30);
        if ('tipoOrganizacion' in body) {
          data.tipoOrganizacion = requiredText(body.tipoOrganizacion, 'tipoOrganizacion', 100);
        }
        if ('departamento' in body) {
          data.departamento = requiredText(body.departamento, 'departamento', 100);
        }
        if ('municipio' in body) data.municipio = requiredText(body.municipio, 'municipio', 100);
        if ('direccion' in body) data.direccion = requiredText(body.direccion, 'direccion', 255);

        const verificationChanged = Object.entries(data).some(([field, value]) => {
          const currentValue = current.beneficiario![field as keyof typeof current.beneficiario];
          return value !== currentValue;
        });
        if (verificationChanged) {
          data.estadoVerificacion = EstadoVerificacion.PENDIENTE;
          await tx.usuario.update({
            where: { id: current.id },
            data: { estado: EstadoCuenta.PENDIENTE },
          });
          requiresVerificationReview = true;
        }
        await tx.beneficiario.update({ where: { usuarioId: current.id }, data });
        if (requiresVerificationReview) {
          const registration = await tx.solicitudRegistro.create({
            data: {
              beneficiarioId: current.beneficiario.id,
              solicitanteId: current.id,
            },
          });
          registrationRequestId = registration.id;
        }
      }

      await tx.auditoria.create({
        data: {
          usuarioId: current.id,
          bancoId: current.membresias[0]?.bancoId,
          accion: 'PERFIL_ACTUALIZADO',
          entidad: 'Usuario',
          entidadId: String(current.id),
          detalles: { campos: Object.keys(body), requiereVerificacion: requiresVerificationReview },
        },
      });
      return { requiresVerificationReview, registrationRequestId };
    });

    publishRealtimeChange(
      { userIds: [req.auth.userId] },
      {
        type: 'profile.updated',
        resource: 'users',
        resourceId: req.auth.userId,
      },
    );
    if (updated.registrationRequestId !== undefined) {
      publishRealtimeChange(
        { roles: ADMIN_ROLES },
        {
          type: 'registration.created',
          resource: 'registrations',
          resourceId: updated.registrationRequestId,
        },
      );
      disconnectRealtimeSession(req.auth.sessionId);
    }

    res.json({
      message: updated.requiresVerificationReview
        ? 'Organization details updated; administrator verification is required again'
        : 'Profile updated',
      ...updated,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError('Email or identification is already registered', 409));
    }
    next(error);
  }
}

export async function currentUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      throw new AppError('Authentication is required', 401);
    }
    const user = await prisma.usuario.findUnique({
      where: { id: req.auth.userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        estado: true,
        telefono: true,
        donante: { select: { organizacion: true, direccion: true } },
        beneficiario: {
          select: {
            nombreOrganizacion: true,
            nit: true,
            tipoOrganizacion: true,
            departamento: true,
            municipio: true,
            direccion: true,
            telefono: true,
            estadoVerificacion: true,
            solicitudesRegistro: {
              select: { id: true, estado: true, observacionesRevision: true, creadaEn: true, revisadaEn: true },
              orderBy: { creadaEn: 'desc' },
            },
          },
        },
        membresias: {
          select: {
            nivel: true,
            banco: { select: { id: true, nombre: true, estado: true } },
          },
        },
      },
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
}
