import { Router } from 'express';
import {
  getAuditLog,
  getSystemReport,
  listRegistrationRequests,
  listUsers,
  reviewRegistration,
  deleteUser,
  updateUser,
} from '../controllers/adminController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { RolUsuario } from '@prisma/client';
import { downloadRegistrationDocument } from '../controllers/registrationDocumentsController';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.use(authenticate, authorize(...ADMIN_ROLES));
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', authorize(RolUsuario.SUPER_ADMIN), deleteUser);
router.get('/registration-requests', listRegistrationRequests);
router.patch('/registration-requests/:id/review', reviewRegistration);
router.get('/registration-documents/:id', downloadRegistrationDocument);
router.get('/reports', getSystemReport);
router.get('/audit', getAuditLog);

export default router;
