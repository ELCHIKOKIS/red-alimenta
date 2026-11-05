import assert from 'node:assert/strict';
import test from 'node:test';
import { RolUsuario } from '@prisma/client';
import { ADMIN_ROLES, hasAllowedRole, isAdminRole, isSuperAdmin } from './roles';
import { serializePublicUser } from './publicUser';

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

test('only SUPER_ADMIN passes the permanent-deletion role check', () => {
  assert.equal(hasAllowedRole(RolUsuario.SUPER_ADMIN, [RolUsuario.SUPER_ADMIN]), true);
  assert.equal(hasAllowedRole(RolUsuario.ADMIN_GENERAL, [RolUsuario.SUPER_ADMIN]), false);
  assert.equal(isSuperAdmin(RolUsuario.SUPER_ADMIN), true);
  assert.equal(isSuperAdmin(RolUsuario.ADMIN_GENERAL), false);
});

test('public user serialization preserves each stored administrator role', () => {
  const user = {
    id: 1,
    nombre: 'Admin',
    email: 'admin@example.test',
    estado: 'ACTIVA' as const,
  };

  assert.equal(serializePublicUser({ ...user, rol: RolUsuario.SUPER_ADMIN }).rol, 'SUPER_ADMIN');
  assert.equal(serializePublicUser({ ...user, rol: RolUsuario.ADMIN_GENERAL }).rol, 'ADMIN_GENERAL');
});
