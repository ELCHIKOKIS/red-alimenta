import 'dotenv/config';
import { EstadoCuenta, Prisma, RolUsuario } from '@prisma/client';
import prisma from '../lib/prisma';
import { hashPassword } from '../lib/auth';

async function main() {
  const nombre = process.env.BOOTSTRAP_SUPER_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

  if (!nombre || nombre.length > 150 || !email || !password) {
    throw new Error(
      'Set BOOTSTRAP_SUPER_ADMIN_NAME, BOOTSTRAP_SUPER_ADMIN_EMAIL, and BOOTSTRAP_SUPER_ADMIN_PASSWORD locally before running this command',
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error('BOOTSTRAP_SUPER_ADMIN_PASSWORD must contain between 12 and 128 characters');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new Error('BOOTSTRAP_SUPER_ADMIN_EMAIL must be a valid email address');
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const userCount = await tx.usuario.count();
    if (userCount > 0) {
      throw new Error('Bootstrap requires a database with no users; no account was created');
    }

    await tx.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        rol: RolUsuario.SUPER_ADMIN,
        estado: EstadoCuenta.ACTIVA,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log('Initial SUPER_ADMIN created. Remove the BOOTSTRAP_SUPER_ADMIN_* values from your local environment.');
}

main()
  .catch((error: unknown) => {
    console.error('SUPER_ADMIN bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
