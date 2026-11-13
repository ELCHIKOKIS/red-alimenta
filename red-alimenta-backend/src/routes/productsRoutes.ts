import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { ADMIN_ROLES } from '../lib/roles';
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductImage,
  listProducts,
  productImageUpload,
  updateProduct,
} from '../controllers/productsController';

const router = Router();

router.use(authenticate);
router.get(
  '/:id/image',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.DONANTE, RolUsuario.BENEFICIARIO),
  getProductImage,
);
router.get('/', authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.DONANTE), listProducts);
router.get('/:id', authorize(...ADMIN_ROLES, RolUsuario.BANCO, RolUsuario.DONANTE), getProductById);
router.post('/', authorize(...ADMIN_ROLES), productImageUpload, createProduct);
router.patch('/:id', authorize(...ADMIN_ROLES), productImageUpload, updateProduct);
router.put('/:id', authorize(...ADMIN_ROLES), productImageUpload, updateProduct);
router.delete('/:id', authorize(...ADMIN_ROLES), deleteProduct);

export default router;
