import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { NextFunction, Request, Response } from 'express';
import {
  EstadoDonacion,
  EstadoEntrega,
  EstadoSolicitudAlimentos,
  Prisma,
  RolUsuario,
  TipoMovimientoInventario,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError, parsePositiveInteger } from '../lib/errors';
import { getDocumentsDirectory } from './registrationDocumentsController';
import {
  coverageRoom,
  disconnectRealtimeUser,
  publishRealtimeChange,
  removeRealtimeUserFromBank,
} from '../realtime/RealtimeHub';
import { ADMIN_ROLES, PRODUCT_VIEWER_ROLES } from '../lib/roles';

type Transaction = Prisma.TransactionClient;

interface InventoryDelta {
  bancoId: number;
  productoId: number;
  stockActual: number;
  stockReservado: number;
}

interface DeletionRecipients {
  bankIds: Set<number>;
  userIds: Set<number>;
  warnings?: string[];
  coverageRooms?: Set<string>;
  roles?: Set<RolUsuario>;
  disconnectUserIds?: Set<number>;
  bankMemberUserIds?: Set<number>;
}

export function isInventoryDeltaSafe(
  stockActual: number,
  stockReservado: number,
  deltaActual: number,
  deltaReservado: number,
): boolean {
  const nextStock = stockActual + deltaActual;
  const nextReserved = stockReservado + deltaReservado;
  return (
    stockActual >= 0
    && stockReservado >= 0
    && stockActual >= stockReservado
    && nextStock >= 0
    && nextReserved >= 0
    && nextStock >= nextReserved
  );
}

export function deliveryInventoryRestoration(
  status: EstadoEntrega,
  quantity: number,
): Pick<InventoryDelta, 'stockActual' | 'stockReservado'> {
  if (status === EstadoEntrega.CONFIRMADA) {
    return { stockActual: 0, stockReservado: 0 };
  }
  return { stockActual: quantity, stockReservado: quantity };
}

export function remainingReservationToRelease(
  approvedQuantity: number,
  confirmedDeliveryQuantity: number,
): number {
  return Math.max(0, approvedQuantity - confirmedDeliveryQuantity);
}

function getInventoryDelta(
  deltas: Map<string, InventoryDelta>,
  bankId: number,
  productId: number,
): InventoryDelta {
  const key = `${bankId}:${productId}`;
  let delta = deltas.get(key);
  if (!delta) {
    delta = { bancoId: bankId, productoId: productId, stockActual: 0, stockReservado: 0 };
    deltas.set(key, delta);
  }
  return delta;
}

async function applyInventoryDeltas(
  tx: Transaction,
  deltas: Map<string, InventoryDelta>,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const delta of deltas.values()) {
    const inventory = await tx.inventario.findUnique({
      where: {
        bancoId_productoId: {
          bancoId: delta.bancoId,
          productoId: delta.productoId,
        },
      },
    });
    if (
      !inventory
      || !isInventoryDeltaSafe(
        inventory.stockActual,
        inventory.stockReservado,
        delta.stockActual,
        delta.stockReservado,
      )
    ) {
      warnings.push(
        `No se ajustó el inventario del banco ${delta.bancoId} para el producto ${delta.productoId}; revísalo manualmente.`,
      );
      continue;
    }
    await tx.inventario.update({
      where: { id: inventory.id },
      data: {
        stockActual: inventory.stockActual + delta.stockActual,
        stockReservado: inventory.stockReservado + delta.stockReservado,
      },
    });
  }
  return warnings;
}

async function deleteDonationData(
  tx: Transaction,
  donationId: number,
): Promise<DeletionRecipients> {
  const donation = await tx.donacion.findUnique({
    where: { id: donationId },
    include: {
      banco: {
        select: {
          coberturas: { select: { departamento: true, municipio: true } },
        },
      },
      donante: { select: { usuarioId: true } },
      beneficiario: { select: { usuarioId: true } },
    },
  });
  if (!donation) throw new AppError('No se encontró la donación.', 404);

  const movements = await tx.movimientoInventario.findMany({
    where: { donacionId: donation.id },
  });
  const deltas = new Map<string, InventoryDelta>();
  const warnings: string[] = [];
  if (donation.estado === EstadoDonacion.ACEPTADA) {
    const movement = movements.length === 1 ? movements[0] : undefined;
    if (
      !movement
      || movement.tipo !== TipoMovimientoInventario.DONACION_ACEPTADA
      || movement.cantidad !== donation.cantidad
      || movement.bancoId !== donation.bancoId
      || movement.productoId !== donation.producto_id
    ) {
      warnings.push('La donación no tenía un movimiento verificable; sus existencias no se ajustaron.');
    } else {
      const inventory = await tx.inventario.findUnique({
        where: {
          bancoId_productoId: {
            bancoId: donation.bancoId,
            productoId: donation.producto_id,
          },
        },
        select: { id: true },
      });
      if (!inventory || inventory.id !== movement.inventarioId) {
        warnings.push('La donación apunta a otro registro de inventario; sus existencias no se ajustaron.');
      } else {
        getInventoryDelta(deltas, donation.bancoId, donation.producto_id).stockActual -= donation.cantidad;
      }
    }
  } else if (movements.length > 0) {
    warnings.push('La donación tenía movimientos inesperados; sus existencias no se ajustaron.');
  }
  warnings.push(...await applyInventoryDeltas(tx, deltas));

  const movementIds = movements.map((movement) => String(movement.id));
  if (movementIds.length) {
    await tx.auditoria.deleteMany({
      where: { entidad: 'MovimientoInventario', entidadId: { in: movementIds } },
    });
  }
  await tx.auditoria.deleteMany({
    where: { entidad: 'Donacion', entidadId: String(donation.id) },
  });
  await tx.movimientoInventario.deleteMany({ where: { donacionId: donation.id } });
  await tx.donacion.delete({ where: { id: donation.id } });

  return {
    bankIds: new Set([donation.bancoId]),
    warnings,
    coverageRooms: new Set(
      donation.banco.coberturas.map((coverage) => (
        coverageRoom(coverage.departamento, coverage.municipio)
      )),
    ),
    userIds: new Set(
      [donation.donante?.usuarioId, donation.beneficiario?.usuarioId]
        .filter((userId): userId is number => userId !== undefined),
    ),
  };
}

async function deleteDeliveryData(
  tx: Transaction,
  deliveryId: number,
  requestWillBeDeleted = false,
): Promise<DeletionRecipients> {
  const delivery = await tx.entrega.findUnique({
    where: { id: deliveryId },
    include: {
      banco: {
        select: {
          id: true,
          nombre: true,
          coberturas: { select: { departamento: true, municipio: true } },
        },
      },
      beneficiario: { select: { usuarioId: true } },
      solicitud: {
        include: {
          detalles: true,
          beneficiario: { select: { usuarioId: true } },
        },
      },
      detalles: {
        include: {
          movimiento: true,
          detalleSolicitud: { select: { solicitudId: true, productoId: true, cantidadAprobada: true } },
        },
      },
    },
  });
  if (!delivery) throw new AppError('No se encontró la entrega.', 404);
  const deltas = new Map<string, InventoryDelta>();
  const warnings: string[] = [];
  for (const detail of delivery.detalles) {
    const restoration = deliveryInventoryRestoration(delivery.estado, detail.cantidad);
    if (restoration.stockActual === 0 && restoration.stockReservado === 0) continue;
    const movement = detail.movimiento;
    if (
      !movement
      || !delivery.bancoId
      || movement.tipo !== TipoMovimientoInventario.ENTREGA_REGISTRADA
      || movement.cantidad !== detail.cantidad
      || movement.bancoId !== delivery.bancoId
      || movement.productoId !== detail.productoId
      || (delivery.solicitud && detail.detalleSolicitud.solicitudId !== delivery.solicitud.id)
      || detail.detalleSolicitud.productoId !== detail.productoId
    ) {
      warnings.push('Una entrega no tenía un movimiento verificable; sus existencias no se restauraron.');
      continue;
    }
    const inventory = await tx.inventario.findUnique({
      where: {
        bancoId_productoId: {
          bancoId: movement.bancoId,
          productoId: movement.productoId,
        },
      },
      select: { id: true },
    });
    if (!inventory || inventory.id !== movement.inventarioId) {
      warnings.push('Una entrega apunta a otro registro de inventario; sus existencias no se restauraron.');
      continue;
    }
    getInventoryDelta(deltas, movement.bancoId, movement.productoId).stockActual += restoration.stockActual;
    getInventoryDelta(deltas, movement.bancoId, movement.productoId).stockReservado += restoration.stockReservado;
  }
  warnings.push(...await applyInventoryDeltas(tx, deltas));

  const detailIds = delivery.detalles.map((detail) => detail.id);
  const movementIds = delivery.detalles
    .map((detail) => detail.movimiento?.id)
    .filter((id): id is number => id !== undefined)
    .map(String);
  if (movementIds.length) {
    await tx.auditoria.deleteMany({
      where: { entidad: 'MovimientoInventario', entidadId: { in: movementIds } },
    });
  }
  await tx.auditoria.deleteMany({
    where: { entidad: 'Entrega', entidadId: String(delivery.id) },
  });
  await tx.movimientoInventario.deleteMany({
    where: { detalleEntregaId: { in: detailIds } },
  });
  await tx.detalleEntrega.deleteMany({ where: { entregaId: delivery.id } });
  await tx.entrega.delete({ where: { id: delivery.id } });

  if (
    !requestWillBeDeleted
    && delivery.estado !== EstadoEntrega.CONFIRMADA
    && delivery.solicitud?.estado === EstadoSolicitudAlimentos.ENTREGADA
  ) {
    const remaining = await tx.entrega.findMany({
      where: { solicitudId: delivery.solicitud.id },
      include: { detalles: true },
    });
    const deliveredByDetail = new Map<number, number>();
    for (const remainingDelivery of remaining) {
      for (const detail of remainingDelivery.detalles) {
        deliveredByDetail.set(
          detail.detalleSolicitudId,
          (deliveredByDetail.get(detail.detalleSolicitudId) ?? 0) + detail.cantidad,
        );
      }
    }
    const stillComplete = delivery.solicitud.detalles.every((detail) => (
      (deliveredByDetail.get(detail.id) ?? 0) >= detail.cantidadAprobada
    ));
    if (!stillComplete) {
      const fullyApproved = delivery.solicitud.detalles.every(
        (detail) => detail.cantidadAprobada === detail.cantidadSolicitada,
      );
      await tx.solicitudAlimentos.update({
        where: { id: delivery.solicitud.id },
        data: {
          estado: fullyApproved
            ? EstadoSolicitudAlimentos.APROBADA
            : EstadoSolicitudAlimentos.APROBADA_PARCIALMENTE,
        },
      });
    }
  }

  return {
    bankIds: new Set(delivery.bancoId ? [delivery.bancoId] : []),
    warnings,
    coverageRooms: new Set(
      (delivery.banco?.coberturas ?? []).map((coverage) => (
        coverageRoom(coverage.departamento, coverage.municipio)
      )),
    ),
    userIds: new Set(
      [delivery.beneficiario?.usuarioId, delivery.solicitud?.beneficiario.usuarioId]
        .filter((userId): userId is number => userId !== undefined),
    ),
  };
}

async function deleteRequestData(
  tx: Transaction,
  requestId: number,
): Promise<DeletionRecipients> {
  const request = await tx.solicitudAlimentos.findUnique({
    where: { id: requestId },
    include: {
      banco: {
        select: {
          id: true,
          nombre: true,
          coberturas: { select: { departamento: true, municipio: true } },
        },
      },
      beneficiario: { select: { usuarioId: true } },
      detalles: true,
    },
  });
  if (!request) throw new AppError('No se encontró la solicitud de alimentos.', 404);

  const deliveries = await tx.entrega.findMany({
    where: { solicitudId: request.id },
    include: { detalles: true },
  });
  const confirmedByDetail = new Map<number, number>();
  for (const delivery of deliveries) {
    if (delivery.estado !== EstadoEntrega.CONFIRMADA) continue;
    for (const detail of delivery.detalles) {
      confirmedByDetail.set(
        detail.detalleSolicitudId,
        (confirmedByDetail.get(detail.detalleSolicitudId) ?? 0) + detail.cantidad,
      );
    }
  }
  const warnings: string[] = [];
  for (const delivery of deliveries) {
    const deliveryRecipients = await deleteDeliveryData(tx, delivery.id, true);
    warnings.push(...(deliveryRecipients.warnings ?? []));
  }

  const deltas = new Map<string, InventoryDelta>();
  for (const detail of request.detalles) {
    const remainingReservation = remainingReservationToRelease(
      detail.cantidadAprobada,
      confirmedByDetail.get(detail.id) ?? 0,
    );
    if (remainingReservation > 0) {
      getInventoryDelta(deltas, request.bancoId, detail.productoId).stockReservado
        -= remainingReservation;
    }
  }
  warnings.push(...await applyInventoryDeltas(tx, deltas));

  await tx.auditoria.deleteMany({
    where: { entidad: 'SolicitudAlimentos', entidadId: String(request.id) },
  });
  await tx.detalleSolicitud.deleteMany({ where: { solicitudId: request.id } });
  await tx.solicitudAlimentos.delete({ where: { id: request.id } });

  return {
    bankIds: new Set([request.bancoId]),
    warnings,
    coverageRooms: new Set(
      request.banco.coberturas.map((coverage) => (
        coverageRoom(coverage.departamento, coverage.municipio)
      )),
    ),
    userIds: new Set([request.beneficiario.usuarioId]),
  };
}

function publishDeletion(
  resource: string,
  type: string,
  resourceId: number,
  recipients: DeletionRecipients,
): void {
  publishRealtimeChange(
    {
      bankIds: [...recipients.bankIds],
      userIds: [...recipients.userIds],
      coverageRooms: [...(recipients.coverageRooms ?? [])],
      roles: [...ADMIN_ROLES, ...(recipients.roles ?? [])],
    },
    { type, resource, resourceId },
  );
}

export async function deleteDonation(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.auth?.role !== RolUsuario.SUPER_ADMIN) {
      throw new AppError('Solo SUPER_ADMIN puede eliminar donaciones permanentemente.', 403);
    }
    const donationId = parsePositiveInteger(req.params.id, 'donation id');
    const recipients = await prisma.$transaction(
      (tx) => deleteDonationData(tx, donationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('donations', 'donation.deleted', donationId, recipients);
    res.json({ deleted: true, warnings: recipients.warnings ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function deleteRequest(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.auth?.role !== RolUsuario.SUPER_ADMIN) {
      throw new AppError('Solo SUPER_ADMIN puede eliminar solicitudes permanentemente.', 403);
    }
    const requestId = parsePositiveInteger(req.params.id, 'request id');
    const recipients = await prisma.$transaction(
      (tx) => deleteRequestData(tx, requestId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('requests', 'request.deleted', requestId, recipients);
    res.json({ deleted: true, warnings: recipients.warnings ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function deleteDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.auth?.role !== RolUsuario.SUPER_ADMIN) {
      throw new AppError('Solo SUPER_ADMIN puede eliminar entregas permanentemente.', 403);
    }
    const deliveryId = parsePositiveInteger(req.params.id, 'delivery id');
    const recipients = await prisma.$transaction(
      (tx) => deleteDeliveryData(tx, deliveryId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('deliveries', 'delivery.deleted', deliveryId, recipients);
    res.json({ deleted: true, warnings: recipients.warnings ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.auth?.role !== RolUsuario.SUPER_ADMIN) {
      throw new AppError('Solo SUPER_ADMIN puede eliminar productos permanentemente.', 403);
    }
    const productId = parsePositiveInteger(req.params.id, 'product id');
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.producto.findUnique({ where: { id: productId } });
      if (!product) throw new AppError('No se encontró el producto.', 404);

      const recipients: DeletionRecipients = {
        bankIds: new Set(),
        userIds: new Set(),
        warnings: [],
        coverageRooms: new Set(),
      };
      const relatedRequests = await tx.solicitudAlimentos.findMany({
        where: { detalles: { some: { productoId: productId } } },
        select: { id: true },
      });
      for (const request of relatedRequests) {
        const requestRecipients = await deleteRequestData(tx, request.id);
        requestRecipients.bankIds.forEach((id) => recipients.bankIds.add(id));
        requestRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(requestRecipients.warnings ?? []));
      }

      const untrackedDeliveries = await tx.entrega.findMany({
        where: {
          OR: [
            { producto_id: productId },
            { detalles: { some: { productoId: productId } } },
          ],
        },
        select: { id: true },
      });
      for (const delivery of untrackedDeliveries) {
        const deliveryRecipients = await deleteDeliveryData(tx, delivery.id);
        deliveryRecipients.bankIds.forEach((id) => recipients.bankIds.add(id));
        deliveryRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(deliveryRecipients.warnings ?? []));
      }

      const donations = await tx.donacion.findMany({
        where: { producto_id: productId },
        select: { id: true },
      });
      for (const donation of donations) {
        const donationRecipients = await deleteDonationData(tx, donation.id);
        donationRecipients.bankIds.forEach((id) => recipients.bankIds.add(id));
        donationRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(donationRecipients.warnings ?? []));
      }

      const inventories = await tx.inventario.findMany({
        where: { productoId: productId },
        include: {
          banco: {
            select: {
              coberturas: { select: { departamento: true, municipio: true } },
            },
          },
        },
      });
      recipients.roles = new Set(PRODUCT_VIEWER_ROLES);
      inventories.forEach((inventory) => {
        recipients.bankIds.add(inventory.bancoId);
        inventory.banco.coberturas.forEach((coverage) => {
          recipients.coverageRooms?.add(
            coverageRoom(coverage.departamento, coverage.municipio),
          );
        });
      });

      const movementRows = await tx.movimientoInventario.findMany({
        where: { productoId: productId },
        select: { id: true },
      });
      const productAuditEntities: Prisma.AuditoriaWhereInput[] = [
        { entidad: 'Producto', entidadId: String(product.id) },
      ];
      const inventoryIds = inventories.map((inventory) => String(inventory.id));
      if (inventoryIds.length) {
        productAuditEntities.push({
          entidad: 'Inventario',
          entidadId: { in: inventoryIds },
        });
      }
      const movementIds = movementRows.map((movement) => String(movement.id));
      if (movementIds.length) {
        productAuditEntities.push({
          entidad: 'MovimientoInventario',
          entidadId: { in: movementIds },
        });
      }
      await tx.auditoria.deleteMany({ where: { OR: productAuditEntities } });
      await tx.movimientoInventario.deleteMany({ where: { productoId: productId } });
      await tx.inventario.deleteMany({ where: { productoId: productId } });
      await tx.imagenProducto.deleteMany({ where: { productoId: productId } });
      await tx.producto.delete({ where: { id: productId } });
      return recipients;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    publishDeletion('products', 'product.deleted', productId, result);
    res.json({ deleted: true, warnings: result.warnings ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function deleteBank(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.auth?.role !== RolUsuario.SUPER_ADMIN) {
      throw new AppError('Solo SUPER_ADMIN puede eliminar bancos de alimentos permanentemente.', 403);
    }
    const bankId = parsePositiveInteger(req.params.id, 'bank id');
    const cleanup = await prisma.$transaction(async (tx) => {
      const bank = await tx.bancoAlimentos.findUnique({
        where: { id: bankId },
        include: { coberturas: { select: { departamento: true, municipio: true } } },
      });
      if (!bank) throw new AppError('No se encontró el banco de alimentos.', 404);

      const recipients: DeletionRecipients = {
        bankIds: new Set([bankId]),
        userIds: new Set(),
        warnings: [],
        coverageRooms: new Set(
          bank.coberturas.map((coverage) => (
            coverageRoom(coverage.departamento, coverage.municipio)
          )),
        ),
        disconnectUserIds: new Set(),
        bankMemberUserIds: new Set(),
      };
      const documentNames: string[] = [];
      const requests = await tx.solicitudAlimentos.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const request of requests) {
        const requestRecipients = await deleteRequestData(tx, request.id);
        requestRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(requestRecipients.warnings ?? []));
      }

      const remainingDeliveries = await tx.entrega.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const delivery of remainingDeliveries) {
        const deliveryRecipients = await deleteDeliveryData(tx, delivery.id);
        deliveryRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(deliveryRecipients.warnings ?? []));
      }

      const donations = await tx.donacion.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const donation of donations) {
        const donationRecipients = await deleteDonationData(tx, donation.id);
        donationRecipients.userIds.forEach((id) => recipients.userIds.add(id));
        recipients.warnings?.push(...(donationRecipients.warnings ?? []));
      }

      const memberships = await tx.membresiaBanco.findMany({
        where: { bancoId: bankId },
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true,
              rol: true,
              membresias: { select: { bancoId: true } },
              donante: { select: { id: true } },
              beneficiario: { select: { id: true } },
            },
          },
        },
      });
      await tx.auditoria.deleteMany({
        where: {
          OR: [
            { bancoId: bankId },
            { entidad: 'BancoAlimentos', entidadId: String(bankId) },
          ],
        },
      });
      await tx.coberturaBanco.deleteMany({ where: { bancoId: bankId } });
      await tx.membresiaBanco.deleteMany({ where: { bancoId: bankId } });
      await tx.movimientoInventario.deleteMany({ where: { bancoId: bankId } });
      await tx.inventario.deleteMany({ where: { bancoId: bankId } });

      for (const membership of memberships) {
        const user = membership.usuario;
        recipients.bankMemberUserIds?.add(user.id);
        if (user.rol !== RolUsuario.BANCO || user.membresias.length !== 1) continue;
        if (user.donante || user.beneficiario) {
          await tx.usuario.update({
            where: { id: user.id },
            data: { estado: 'SUSPENDIDA' },
          });
          continue;
        }
        await tx.auditoria.deleteMany({ where: { usuarioId: user.id } });
        const registrations = await tx.solicitudRegistro.findMany({
          where: { solicitanteId: user.id },
          select: { id: true },
        });
        const registrationIds = registrations.map((registration) => registration.id);
        if (registrationIds.length) {
          const documents = await tx.documentoVerificacion.findMany({
            where: { solicitudRegistroId: { in: registrationIds } },
            select: { nombreAlmacenado: true },
          });
          documentNames.push(...documents.map((document) => document.nombreAlmacenado));
          await tx.documentoVerificacion.deleteMany({
            where: { solicitudRegistroId: { in: registrationIds } },
          });
          await tx.solicitudRegistro.deleteMany({
            where: { id: { in: registrationIds } },
          });
        }
        await tx.fotoPerfil.deleteMany({ where: { usuarioId: user.id } });
        await tx.usuario.delete({ where: { id: user.id } });
        recipients.userIds.add(user.id);
        recipients.disconnectUserIds?.add(user.id);
      }

      await tx.auditoria.deleteMany({
        where: { entidad: 'BancoAlimentos', entidadId: String(bank.id) },
      });
      await tx.bancoAlimentos.delete({ where: { id: bankId } });
      return { recipients, documentNames };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    let documentCleanupWarnings = 0;
    for (const storedName of cleanup.documentNames) {
      if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(storedName)) {
        documentCleanupWarnings += 1;
        console.error('Unable to remove verification document with an invalid stored name');
        continue;
      }
      try {
        await unlink(path.join(getDocumentsDirectory(), storedName));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          documentCleanupWarnings += 1;
          console.error('Unable to remove a deleted bank user verification document:', error);
        }
      }
    }
    const warnings = [...(cleanup.recipients.warnings ?? [])];
    if (documentCleanupWarnings > 0) {
      warnings.push(`${documentCleanupWarnings} documento(s) requieren limpieza.`);
    }
    publishDeletion('banks', 'bank.deleted', bankId, cleanup.recipients);
    for (const userId of cleanup.recipients.disconnectUserIds ?? []) {
      disconnectRealtimeUser(userId);
    }
    for (const userId of cleanup.recipients.bankMemberUserIds ?? []) {
      if (!cleanup.recipients.disconnectUserIds?.has(userId)) {
        removeRealtimeUserFromBank(userId, bankId);
      }
    }
    res.json({ deleted: true, warnings });
  } catch (error) {
    next(error);
  }
}
