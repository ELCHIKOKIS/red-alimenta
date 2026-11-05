import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { createRequest, listRequests, reviewRequest } from '../controllers/requestsController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.use(authenticate);
router.get(
  '/',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.BENEFICIARIO),
  listRequests,
);
router.post('/', authorize(RolUsuario.BENEFICIARIO), createRequest);
router.patch(
  '/:id/review',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  reviewRequest,
);

export default router;
