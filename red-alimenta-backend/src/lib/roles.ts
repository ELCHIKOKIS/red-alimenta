import { RolUsuario } from '@prisma/client';

export const ADMIN_ROLES: RolUsuario[] = [
  RolUsuario.ADMIN_GENERAL,
  RolUsuario.SUPER_ADMIN,
];

export function isAdminRole(role: RolUsuario): boolean {
  return ADMIN_ROLES.includes(role);
}
