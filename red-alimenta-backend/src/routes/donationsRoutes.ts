import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { createDonation, listDonations, reviewDonation } from '../controllers/donationsController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.DONANTE),
  listDonations,
);
router.post('/', authenticate, authorize(RolUsuario.DONANTE), createDonation);
router.patch(
  '/:id/review',
  authenticate,
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  reviewDonation,
);

export default router;
