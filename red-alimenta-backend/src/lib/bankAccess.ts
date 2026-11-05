import { Request } from 'express';
import { RolUsuario } from '@prisma/client';
import { AppError, parsePositiveInteger } from './errors';
import { isAdminRole } from './roles';

export function getBankId(req: Request): number {
  return parsePositiveInteger(req.params.bankId, 'bankId');
}

export function assertBankAccess(req: Request, bankId: number): void {
  if (!req.auth) {
    throw new AppError('Authentication is required', 401);
  }
  if (isAdminRole(req.auth.role)) return;
  if (req.auth.role === RolUsuario.BANCO && req.auth.bankIds.includes(bankId)) return;
  throw new AppError('Food bank not found', 404);
}
