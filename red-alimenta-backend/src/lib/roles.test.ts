import assert from 'node:assert/strict';
import test from 'node:test';
import { RolUsuario } from '@prisma/client';
import { ADMIN_ROLES, isAdminRole } from './roles';

test('both administrator roles receive administrative access', () => {
  assert.deepEqual(ADMIN_ROLES, [RolUsuario.ADMIN_GENERAL, RolUsuario.SUPER_ADMIN]);
  assert.equal(isAdminRole(RolUsuario.ADMIN_GENERAL), true);
  assert.equal(isAdminRole(RolUsuario.SUPER_ADMIN), true);
});

test('non-administrator roles do not receive administrative access', () => {
  assert.equal(isAdminRole(RolUsuario.BANCO), false);
  assert.equal(isAdminRole(RolUsuario.DONANTE), false);
  assert.equal(isAdminRole(RolUsuario.BENEFICIARIO), false);
});
