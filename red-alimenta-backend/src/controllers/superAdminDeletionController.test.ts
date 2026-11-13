import assert from 'node:assert/strict';
import test from 'node:test';
import { EstadoEntrega } from '@prisma/client';
import {
  deliveryInventoryRestoration,
  isInventoryDeltaSafe,
  remainingReservationToRelease,
} from './superAdminDeletionController';

test('confirmed delivery deletion does not restore distributed inventory', () => {
  assert.deepEqual(
    deliveryInventoryRestoration(EstadoEntrega.CONFIRMADA, 4),
    { stockActual: 0, stockReservado: 0 },
  );
  assert.deepEqual(
    deliveryInventoryRestoration(EstadoEntrega.REGISTRADA, 4),
    { stockActual: 4, stockReservado: 4 },
  );
});

test('request deletion releases only the reservation not consumed by confirmed deliveries', () => {
  assert.equal(remainingReservationToRelease(10, 4), 6);
  assert.equal(remainingReservationToRelease(10, 0), 10);
  assert.equal(remainingReservationToRelease(3, 5), 0);
});

test('inventory cleanup accepts balanced reversals and reservation releases', () => {
  assert.equal(isInventoryDeltaSafe(12, 3, -5, 0), true);
  assert.equal(isInventoryDeltaSafe(12, 8, 0, -8), true);
  assert.equal(isInventoryDeltaSafe(7, 7, 4, 4), true);
});

test('inventory cleanup rejects consumed or invalid reserved stock', () => {
  assert.equal(isInventoryDeltaSafe(4, 2, -3, 0), false);
  assert.equal(isInventoryDeltaSafe(4, 5, 0, 0), false);
  assert.equal(isInventoryDeltaSafe(4, 2, 0, -3), false);
  assert.equal(isInventoryDeltaSafe(-1, 0, 2, 0), false);
});
