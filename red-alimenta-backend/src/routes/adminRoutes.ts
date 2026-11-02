import { Router } from 'express';
import {
  getAuditLog,
  getSystemReport,
  listRegistrationRequests,
  listUsers,
  reviewRegistration,
  updateUser,
} from '../controllers/adminController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { RolUsuario } from '@prisma/client';
import { downloadRegistrationDocument } from '../controllers/registrationDocumentsController';

const router = Router();

router.use(authenticate, authorize(RolUsuario.ADMIN_GENERAL));
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.get('/registration-requests', listRegistrationRequests);
router.patch('/registration-requests/:id/review', reviewRegistration);
router.get('/registration-documents/:id', downloadRegistrationDocument);
router.get('/reports', getSystemReport);
router.get('/audit', getAuditLog);

export default router;
