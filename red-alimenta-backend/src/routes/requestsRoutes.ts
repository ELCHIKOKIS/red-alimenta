import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { createRequest, listRequests, reviewRequest } from '../controllers/requestsController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.get(
  '/',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO, RolUsuario.BENEFICIARIO),
  listRequests,
);
router.post('/', authorize(RolUsuario.BENEFICIARIO), createRequest);
router.patch(
  '/:id/review',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  reviewRequest,
);

export default router;
