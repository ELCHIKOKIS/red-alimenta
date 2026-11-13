import { RolUsuario } from '@prisma/client';

export const ADMIN_ROLES: RolUsuario[] = [
  RolUsuario.ADMIN_GENERAL,
  RolUsuario.SUPER_ADMIN,
];

export const PRODUCT_VIEWER_ROLES: RolUsuario[] = [
  ...ADMIN_ROLES,
  RolUsuario.BANCO,
  RolUsuario.DONANTE,
  RolUsuario.BENEFICIARIO,
];

export function isAdminRole(role: RolUsuario): boolean {
  return ADMIN_ROLES.includes(role);
}

export function hasAllowedRole(role: RolUsuario, allowedRoles: readonly RolUsuario[]): boolean {
  return allowedRoles.includes(role);
}

export function isSuperAdmin(role: RolUsuario): boolean {
  return role === RolUsuario.SUPER_ADMIN;
}
