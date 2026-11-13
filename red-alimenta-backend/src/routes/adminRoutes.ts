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
import {
  deleteBank,
  deleteDelivery,
  deleteDonation,
  deleteProduct,
  deleteRequest,
} from '../controllers/superAdminDeletionController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { RolUsuario } from '@prisma/client';
import { downloadRegistrationDocument } from '../controllers/registrationDocumentsController';
import { getAdminUserProfileImage } from '../controllers/profileImagesController';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.use(authenticate, authorize(...ADMIN_ROLES));
router.get('/users', listUsers);
router.get('/users/:id/photo', getAdminUserProfileImage);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', authorize(RolUsuario.SUPER_ADMIN), deleteUser);
router.delete('/banks/:id', authorize(RolUsuario.SUPER_ADMIN), deleteBank);
router.delete('/products/:id', authorize(RolUsuario.SUPER_ADMIN), deleteProduct);
router.delete('/donations/:id', authorize(RolUsuario.SUPER_ADMIN), deleteDonation);
router.delete('/requests/:id', authorize(RolUsuario.SUPER_ADMIN), deleteRequest);
router.delete('/deliveries/:id', authorize(RolUsuario.SUPER_ADMIN), deleteDelivery);
router.get('/registration-requests', listRegistrationRequests);
router.patch('/registration-requests/:id/review', reviewRegistration);
router.get('/registration-documents/:id', downloadRegistrationDocument);
router.get('/reports', getSystemReport);
router.get('/audit', getAuditLog);

export default router;
