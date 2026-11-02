import { Router } from 'express';
import { currentUser, login, logout, register, updateProfile } from '../controllers/authController';
import {
  registrationDocumentUpload,
  uploadRegistrationDocument,
} from '../controllers/registrationDocumentsController';
import { authenticate } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Try again later.' },
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many registration attempts. Try again later.' },
});

router.post('/register', registrationLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, currentUser);
router.patch('/me', authenticate, updateProfile);
router.post(
  '/beneficiary/documents',
  authenticate,
  registrationDocumentUpload,
  uploadRegistrationDocument,
);

export default router;
