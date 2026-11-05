import 'dotenv/config';
import { EstadoCuenta, RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';
import { hashPassword } from '../lib/auth';
import { ADMIN_ROLES } from '../lib/roles';

async function main() {
  const nombre = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!nombre || nombre.length > 150 || !email || !password) {
    throw new Error(
      'Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD locally before running this command',
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain between 12 and 128 characters');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }

  const admins = await prisma.usuario.count({ where: { rol: { in: ADMIN_ROLES } } });
  if (admins > 0) {
    throw new Error('An administrator already exists; bootstrap is only available before the first administrator');
  }

  const passwordHash = await hashPassword(password);
  await prisma.usuario.create({
    data: {
      nombre,
      email,
      passwordHash,
      rol: RolUsuario.ADMIN_GENERAL,
      estado: EstadoCuenta.ACTIVA,
    },
  });
  console.log('Initial administrator created. Remove the BOOTSTRAP_ADMIN_* values from your local environment.');
}

main()
  .catch((error: unknown) => {
    console.error('Administrator bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
