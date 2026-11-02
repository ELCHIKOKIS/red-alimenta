import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { createDonation, listDonations, reviewDonation } from '../controllers/donationsController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO, RolUsuario.DONANTE),
  listDonations,
);
router.post('/', authenticate, authorize(RolUsuario.DONANTE), createDonation);
router.patch(
  '/:id/review',
  authenticate,
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  reviewDonation,
);

export default router;
