import { EstadoCuenta, RolUsuario } from '@prisma/client';

export interface PublicUser {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
  estado: EstadoCuenta;
}

export function serializePublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    estado: user.estado,
  };
}
