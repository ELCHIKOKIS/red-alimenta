import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { confirmDelivery, createDelivery, listDeliveries } from '../controllers/deliveriesController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.BENEFICIARIO),
  listDeliveries,
);
router.post(
  '/',
  authenticate,
  authorize(RolUsuario.BANCO, ...ADMIN_ROLES),
  createDelivery,
);
router.post(
  '/:id/confirm',
  authenticate,
  authorize(RolUsuario.BENEFICIARIO),
  confirmDelivery,
);

export default router;
