import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { confirmDelivery, createDelivery, listDeliveries } from '../controllers/deliveriesController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO, RolUsuario.BENEFICIARIO),
  listDeliveries,
);
router.post(
  '/',
  authenticate,
  authorize(RolUsuario.BANCO, RolUsuario.ADMIN_GENERAL),
  createDelivery,
);
router.post(
  '/:id/confirm',
  authenticate,
  authorize(RolUsuario.BENEFICIARIO),
  confirmDelivery,
);

export default router;
