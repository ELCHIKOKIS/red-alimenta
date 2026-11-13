import assert from 'node:assert/strict';
import test from 'node:test';
import { isInventoryDeltaSafe } from './superAdminDeletionController';

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
