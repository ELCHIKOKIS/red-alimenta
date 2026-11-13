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
import {
  disconnectRealtimeUser,
  publishRealtimeChange,
  removeRealtimeUserFromBank,
} from '../realtime/RealtimeHub';
import { ADMIN_ROLES } from '../lib/roles';

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

function jsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value === null) return {};
  if (Array.isArray(value) || typeof value !== 'object') return { valorAnterior: value };
  return value as Prisma.JsonObject;
}

async function preserveAuditSnapshot(
  tx: Transaction,
  where: Prisma.AuditoriaWhereInput,
  key: string,
  snapshot: Prisma.InputJsonObject,
): Promise<void> {
  const entries = await tx.auditoria.findMany({
    where,
    select: { id: true, detalles: true },
  });
  for (const entry of entries) {
    await tx.auditoria.update({
      where: { id: entry.id },
      data: {
        detalles: {
          ...jsonObject(entry.detalles),
          [key]: snapshot,
        },
      },
    });
  }
}

export async function preserveUserAuditActor(
  tx: Transaction,
  user: { id: number; nombre: string; email: string },
): Promise<void> {
  await preserveAuditSnapshot(
    tx,
    { usuarioId: user.id },
    'actorEliminado',
    { id: user.id, nombre: user.nombre, email: user.email },
  );
}

async function recordDeletion(
  tx: Transaction,
  actorId: number,
  entity: string,
  entityId: number,
  action: string,
  details: Prisma.InputJsonObject,
  bankId?: number,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      usuarioId: actorId,
      bancoId: bankId,
      accion: action,
      entidad: entity,
      entidadId: String(entityId),
      detalles: details,
    },
  });
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
): Promise<void> {
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
      throw new AppError(
        'No se puede cuadrar el inventario de forma segura; ajusta las existencias o resuelve las reservas antes de eliminar estos registros.',
        409,
      );
    }
    await tx.inventario.update({
      where: { id: inventory.id },
      data: {
        stockActual: inventory.stockActual + delta.stockActual,
        stockReservado: inventory.stockReservado + delta.stockReservado,
      },
    });
  }
}

async function deleteDonationData(
  tx: Transaction,
  donationId: number,
  actorId: number,
): Promise<DeletionRecipients> {
  const donation = await tx.donacion.findUnique({
    where: { id: donationId },
    include: {
      donante: { select: { usuarioId: true } },
      beneficiario: { select: { usuarioId: true } },
    },
  });
  if (!donation) throw new AppError('No se encontró la donación.', 404);

  const movements = await tx.movimientoInventario.findMany({
    where: { donacionId: donation.id },
  });
  const deltas = new Map<string, InventoryDelta>();
  if (donation.estado === EstadoDonacion.ACEPTADA) {
    if (
      movements.length !== 1
      || movements[0].tipo !== TipoMovimientoInventario.DONACION_ACEPTADA
      || movements[0].cantidad !== donation.cantidad
      || movements[0].bancoId !== donation.bancoId
      || movements[0].productoId !== donation.producto_id
    ) {
      throw new AppError(
        'El historial de la donación aceptada no coincide con el inventario; revísalo antes de eliminarla.',
        409,
      );
    }
    const inventory = await tx.inventario.findUnique({
      where: {
        bancoId_productoId: {
          bancoId: donation.bancoId,
          productoId: donation.producto_id,
        },
      },
      select: { id: true },
    });
    if (!inventory || inventory.id !== movements[0].inventarioId) {
      throw new AppError('La donación apunta a otro registro de inventario; revísala antes de eliminarla.', 409);
    }
    getInventoryDelta(deltas, donation.bancoId, donation.producto_id).stockActual -= donation.cantidad;
  } else if (movements.length > 0) {
    throw new AppError('El historial de inventario de la donación no coincide; revísalo antes de eliminarla.', 409);
  }
  await applyInventoryDeltas(tx, deltas);

  await preserveAuditSnapshot(
    tx,
    { entidad: 'Donacion', entidadId: String(donation.id) },
    'donacionEliminada',
    {
      id: donation.id,
      productoId: donation.producto_id,
      cantidad: donation.cantidad,
      estado: donation.estado,
      bancoId: donation.bancoId,
    },
  );
  await tx.movimientoInventario.deleteMany({ where: { donacionId: donation.id } });
  await tx.donacion.delete({ where: { id: donation.id } });
  await recordDeletion(
    tx,
    actorId,
    'Donacion',
    donation.id,
    'DONACION_ELIMINADA',
    { productoId: donation.producto_id, cantidad: donation.cantidad, estado: donation.estado },
    donation.bancoId,
  );

  return {
    bankIds: new Set([donation.bancoId]),
    userIds: new Set(
      [donation.donante?.usuarioId, donation.beneficiario?.usuarioId]
        .filter((userId): userId is number => userId !== undefined),
    ),
  };
}

async function deleteDeliveryData(
  tx: Transaction,
  deliveryId: number,
  actorId: number,
  requestWillBeDeleted = false,
): Promise<DeletionRecipients> {
  const delivery = await tx.entrega.findUnique({
    where: { id: deliveryId },
    include: {
      banco: { select: { id: true, nombre: true } },
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
  if (delivery.estado === EstadoEntrega.CONFIRMADA) {
    throw new AppError('No se puede eliminar una entrega confirmada porque los alimentos ya fueron recibidos.', 409);
  }
  if (
    !delivery.solicitud
    || !delivery.bancoId
    || delivery.solicitud.bancoId !== delivery.bancoId
    || delivery.detalles.length === 0
  ) {
    throw new AppError('La entrega no tiene un historial de inventario verificable; revísala antes de eliminarla.', 409);
  }

  const allRequestDeliveries = await tx.entrega.findMany({
    where: { solicitudId: delivery.solicitud.id },
    include: { detalles: true },
  });
  const deliveredByDetail = new Map<number, number>();
  for (const relatedDelivery of allRequestDeliveries) {
    for (const relatedDetail of relatedDelivery.detalles) {
      deliveredByDetail.set(
        relatedDetail.detalleSolicitudId,
        (deliveredByDetail.get(relatedDetail.detalleSolicitudId) ?? 0) + relatedDetail.cantidad,
      );
    }
  }
  if (delivery.solicitud.detalles.some((detail) => (
    (deliveredByDetail.get(detail.id) ?? 0) > detail.cantidadAprobada
  ))) {
    throw new AppError('Las cantidades entregadas superan las aprobadas; revisa el inventario antes de eliminar.', 409);
  }

  const deltas = new Map<string, InventoryDelta>();
  for (const detail of delivery.detalles) {
    const movement = detail.movimiento;
    if (
      !movement
      || movement.tipo !== TipoMovimientoInventario.ENTREGA_REGISTRADA
      || movement.cantidad !== detail.cantidad
      || movement.bancoId !== delivery.bancoId
      || movement.productoId !== detail.productoId
      || detail.detalleSolicitud.solicitudId !== delivery.solicitud.id
      || detail.detalleSolicitud.productoId !== detail.productoId
    ) {
      throw new AppError('El historial de inventario de la entrega no coincide; revísalo antes de eliminarla.', 409);
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
      throw new AppError('La entrega apunta a otro registro de inventario; revísalo antes de eliminarla.', 409);
    }
    getInventoryDelta(deltas, movement.bancoId, movement.productoId).stockActual += detail.cantidad;
    getInventoryDelta(deltas, movement.bancoId, movement.productoId).stockReservado += detail.cantidad;
  }
  await applyInventoryDeltas(tx, deltas);

  await preserveAuditSnapshot(
    tx,
    { entidad: 'Entrega', entidadId: String(delivery.id) },
    'entregaEliminada',
    {
      id: delivery.id,
      bancoId: delivery.bancoId,
      solicitudId: delivery.solicitudId,
      estado: delivery.estado,
      beneficiarioReferencia: delivery.beneficiario_referencia,
    },
  );

  const detailIds = delivery.detalles.map((detail) => detail.id);
  await tx.movimientoInventario.deleteMany({
    where: { detalleEntregaId: { in: detailIds } },
  });
  await tx.detalleEntrega.deleteMany({ where: { entregaId: delivery.id } });
  await tx.entrega.delete({ where: { id: delivery.id } });

  if (!requestWillBeDeleted && delivery.solicitud.estado === EstadoSolicitudAlimentos.ENTREGADA) {
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

  await recordDeletion(
    tx,
    actorId,
    'Entrega',
    delivery.id,
    'ENTREGA_ELIMINADA',
    {
      bancoId: delivery.bancoId,
      solicitudId: delivery.solicitudId,
      estado: delivery.estado,
    },
    delivery.bancoId,
  );

  return {
    bankIds: new Set([delivery.bancoId]),
    userIds: new Set(
      [delivery.beneficiario?.usuarioId, delivery.solicitud.beneficiario.usuarioId]
        .filter((userId): userId is number => userId !== undefined),
    ),
  };
}

async function deleteRequestData(
  tx: Transaction,
  requestId: number,
  actorId: number,
): Promise<DeletionRecipients> {
  const request = await tx.solicitudAlimentos.findUnique({
    where: { id: requestId },
    include: {
      banco: { select: { id: true, nombre: true } },
      beneficiario: { select: { usuarioId: true } },
      detalles: true,
    },
  });
  if (!request) throw new AppError('No se encontró la solicitud de alimentos.', 404);

  const deliveries = await tx.entrega.findMany({
    where: { solicitudId: request.id },
    select: { id: true, estado: true },
  });
  if (deliveries.some((delivery) => delivery.estado === EstadoEntrega.CONFIRMADA)) {
    throw new AppError(
      'No se puede eliminar una solicitud con entregas confirmadas porque los alimentos ya fueron recibidos.',
      409,
    );
  }
  for (const delivery of deliveries) {
    await deleteDeliveryData(tx, delivery.id, actorId, true);
  }

  const deltas = new Map<string, InventoryDelta>();
  for (const detail of request.detalles) {
    if (detail.cantidadAprobada > 0) {
      getInventoryDelta(deltas, request.bancoId, detail.productoId).stockReservado
        -= detail.cantidadAprobada;
    }
  }
  await applyInventoryDeltas(tx, deltas);

  await preserveAuditSnapshot(
    tx,
    { entidad: 'SolicitudAlimentos', entidadId: String(request.id) },
    'solicitudEliminada',
    {
      id: request.id,
      bancoId: request.bancoId,
      beneficiarioId: request.beneficiarioId,
      estado: request.estado,
    },
  );
  await tx.detalleSolicitud.deleteMany({ where: { solicitudId: request.id } });
  await tx.solicitudAlimentos.delete({ where: { id: request.id } });
  await recordDeletion(
    tx,
    actorId,
    'SolicitudAlimentos',
    request.id,
    'SOLICITUD_ALIMENTOS_ELIMINADA',
    { bancoId: request.bancoId, estado: request.estado },
    request.bancoId,
  );

  return {
    bankIds: new Set([request.bancoId]),
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
      roles: ADMIN_ROLES,
      bankIds: [...recipients.bankIds],
      userIds: [...recipients.userIds],
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
      (tx) => deleteDonationData(tx, donationId, req.auth!.userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('donations', 'donation.deleted', donationId, recipients);
    res.json({ deleted: true });
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
      (tx) => deleteRequestData(tx, requestId, req.auth!.userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('requests', 'request.deleted', requestId, recipients);
    res.json({ deleted: true });
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
      (tx) => deleteDeliveryData(tx, deliveryId, req.auth!.userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    publishDeletion('deliveries', 'delivery.deleted', deliveryId, recipients);
    res.json({ deleted: true });
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
      if (product.stock_actual > 0) {
        throw new AppError('El producto conserva existencias históricas; revísalas antes de eliminarlo.', 409);
      }

      const recipients: DeletionRecipients = { bankIds: new Set(), userIds: new Set() };
      const relatedRequests = await tx.solicitudAlimentos.findMany({
        where: { detalles: { some: { productoId: productId } } },
        select: { id: true },
      });
      for (const request of relatedRequests) {
        const requestRecipients = await deleteRequestData(tx, request.id, req.auth!.userId);
        requestRecipients.bankIds.forEach((id) => recipients.bankIds.add(id));
        requestRecipients.userIds.forEach((id) => recipients.userIds.add(id));
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
      if (untrackedDeliveries.length > 0) {
        throw new AppError(
          'Una entrega aún referencia este producto fuera de una solicitud segura; revísala antes de eliminarlo.',
          409,
        );
      }

      const donations = await tx.donacion.findMany({
        where: { producto_id: productId },
        select: { id: true },
      });
      for (const donation of donations) {
        const donationRecipients = await deleteDonationData(tx, donation.id, req.auth!.userId);
        donationRecipients.bankIds.forEach((id) => recipients.bankIds.add(id));
        donationRecipients.userIds.forEach((id) => recipients.userIds.add(id));
      }

      const inventories = await tx.inventario.findMany({
        where: { productoId: productId },
      });
      if (inventories.some((inventory) => inventory.stockActual !== 0 || inventory.stockReservado !== 0)) {
        throw new AppError(
          'El producto conserva existencias o reservas que no se pueden cuadrar; revísalas antes de eliminarlo.',
          409,
        );
      }
      inventories.forEach((inventory) => recipients.bankIds.add(inventory.bancoId));

      await preserveAuditSnapshot(
        tx,
        { entidad: 'Producto', entidadId: String(product.id) },
        'productoEliminado',
        { id: product.id, nombre: product.nombre, categoria: product.categoria, unidad: product.unidad },
      );
      await tx.movimientoInventario.deleteMany({ where: { productoId: productId } });
      await tx.inventario.deleteMany({ where: { productoId: productId } });
      await tx.imagenProducto.deleteMany({ where: { productoId: productId } });
      await tx.producto.delete({ where: { id: productId } });
      await recordDeletion(
        tx,
        req.auth!.userId,
        'Producto',
        product.id,
        'PRODUCTO_ELIMINADO',
        { nombre: product.nombre, categoria: product.categoria, unidad: product.unidad },
      );
      return recipients;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    publishDeletion('products', 'product.deleted', productId, result);
    res.json({ deleted: true });
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
    const result = await prisma.$transaction(async (tx) => {
      const bank = await tx.bancoAlimentos.findUnique({ where: { id: bankId } });
      if (!bank) throw new AppError('No se encontró el banco de alimentos.', 404);

      const recipients: DeletionRecipients = {
        bankIds: new Set([bankId]),
        userIds: new Set(),
        disconnectUserIds: new Set(),
        bankMemberUserIds: new Set(),
      };
      const requests = await tx.solicitudAlimentos.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const request of requests) {
        const requestRecipients = await deleteRequestData(tx, request.id, req.auth!.userId);
        requestRecipients.userIds.forEach((id) => recipients.userIds.add(id));
      }

      const remainingDeliveries = await tx.entrega.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const delivery of remainingDeliveries) {
        const deliveryRecipients = await deleteDeliveryData(tx, delivery.id, req.auth!.userId);
        deliveryRecipients.userIds.forEach((id) => recipients.userIds.add(id));
      }

      const donations = await tx.donacion.findMany({
        where: { bancoId: bankId },
        select: { id: true },
      });
      for (const donation of donations) {
        const donationRecipients = await deleteDonationData(tx, donation.id, req.auth!.userId);
        donationRecipients.userIds.forEach((id) => recipients.userIds.add(id));
      }

      const inventories = await tx.inventario.findMany({ where: { bancoId: bankId } });
      if (inventories.some((inventory) => inventory.stockActual !== 0 || inventory.stockReservado !== 0)) {
        throw new AppError(
          'El banco conserva existencias o reservas que no se pueden cuadrar de forma segura.',
          409,
        );
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
      await preserveAuditSnapshot(
        tx,
        { bancoId: bankId },
        'bancoEliminado',
        { id: bank.id, nombre: bank.nombre, departamento: bank.departamento, municipio: bank.municipio },
      );
      await tx.coberturaBanco.deleteMany({ where: { bancoId: bankId } });
      await tx.membresiaBanco.deleteMany({ where: { bancoId: bankId } });
      await tx.movimientoInventario.deleteMany({ where: { bancoId: bankId } });
      await tx.inventario.deleteMany({ where: { bancoId: bankId } });

      for (const membership of memberships) {
        const user = membership.usuario;
        recipients.bankMemberUserIds?.add(user.id);
        if (user.rol !== RolUsuario.BANCO || user.membresias.length !== 1) continue;
        if (user.donante || user.beneficiario) {
          throw new AppError('Un usuario del banco tiene datos de perfil adicionales; resuélvelos antes de eliminar el banco.', 409);
        }
        const registration = await tx.solicitudRegistro.findFirst({
          where: { solicitanteId: user.id },
          select: { id: true },
        });
        if (registration) {
          throw new AppError(
            'Un usuario del banco tiene historial de registro relacionado; resuélvelo antes de eliminar el banco.',
            409,
          );
        }
        await preserveUserAuditActor(tx, user);
        await tx.usuario.delete({ where: { id: user.id } });
        recipients.userIds.add(user.id);
        recipients.disconnectUserIds?.add(user.id);
      }

      await tx.bancoAlimentos.delete({ where: { id: bankId } });
      await recordDeletion(
        tx,
        req.auth!.userId,
        'BancoAlimentos',
        bank.id,
        'BANCO_ELIMINADO',
        { nombre: bank.nombre, departamento: bank.departamento, municipio: bank.municipio },
      );
      return recipients;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    publishDeletion('banks', 'bank.deleted', bankId, result);
    for (const userId of result.disconnectUserIds ?? []) {
      disconnectRealtimeUser(userId);
    }
    for (const userId of result.bankMemberUserIds ?? []) {
      if (!result.disconnectUserIds?.has(userId)) {
        removeRealtimeUserFromBank(userId, bankId);
      }
    }
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}
