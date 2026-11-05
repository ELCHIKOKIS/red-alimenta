import 'dotenv/config';
import { EstadoCuenta, Prisma, RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new Error('Set SUPER_ADMIN_EMAIL to the existing administrator account to promote');
  }

  await prisma.$transaction(async (tx) => {
    const existingSuperAdmins = await tx.usuario.count({
      where: { rol: RolUsuario.SUPER_ADMIN },
    });
    if (existingSuperAdmins > 0) {
      throw new Error('A super administrator already exists; promotion is a one-time operation');
    }

    const target = await tx.usuario.findUnique({
      where: { email },
      select: { id: true, rol: true, estado: true },
    });
    if (!target || target.rol !== RolUsuario.ADMIN_GENERAL || target.estado !== EstadoCuenta.ACTIVA) {
      throw new Error('SUPER_ADMIN_EMAIL must belong to an existing active ADMIN_GENERAL account');
    }

    const result = await tx.usuario.updateMany({
      where: {
        id: target.id,
        rol: RolUsuario.ADMIN_GENERAL,
        estado: EstadoCuenta.ACTIVA,
      },
      data: { rol: RolUsuario.SUPER_ADMIN },
    });
    if (result.count !== 1) {
      throw new Error('The administrator account changed during promotion; no role was updated');
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log('The existing active administrator was promoted to SUPER_ADMIN.');
  console.log('Remove SUPER_ADMIN_EMAIL from the environment after this one-time operation.');
}

main()
  .catch((error: unknown) => {
    console.error('Super administrator promotion failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
