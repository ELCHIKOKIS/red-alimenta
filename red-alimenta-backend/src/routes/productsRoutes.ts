import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { authenticate, authorize } from '../middleware/authMiddleware';
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from '../controllers/productsController';

const router = Router();

router.use(authenticate);
router.get('/', authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO, RolUsuario.DONANTE), listProducts);
router.get('/:id', authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO, RolUsuario.DONANTE), getProductById);
router.post('/', authorize(RolUsuario.ADMIN_GENERAL), createProduct);
router.patch('/:id', authorize(RolUsuario.ADMIN_GENERAL), updateProduct);
router.put('/:id', authorize(RolUsuario.ADMIN_GENERAL), updateProduct);
router.delete('/:id', authorize(RolUsuario.ADMIN_GENERAL), deleteProduct);

export default router;
