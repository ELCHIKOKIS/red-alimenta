import { Router } from 'express';
import { RolUsuario } from '@prisma/client';
import {
  addBankCoverage,
  addProductToInventory,
  adjustInventory,
  createBank,
  createBankUser,
  getBankAvailability,
  getBankHistory,
  getBankInventory,
  listBankBeneficiaries,
  listBankDonors,
  listBanks,
  updateBank,
  updateInventorySettings,
} from '../controllers/banksController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { ADMIN_ROLES } from '../lib/roles';

const router = Router();

router.use(authenticate);
router.get(
  '/',
  authorize(
    ...ADMIN_ROLES,
    RolUsuario.BANCO,
    RolUsuario.DONANTE,
    RolUsuario.BENEFICIARIO,
  ),
  listBanks,
);
router.post('/', authorize(...ADMIN_ROLES), createBank);
router.post('/:bankId/users', authorize(...ADMIN_ROLES), createBankUser);
router.post('/:bankId/coverage', authorize(...ADMIN_ROLES), addBankCoverage);
router.patch('/:bankId', authorize(...ADMIN_ROLES), updateBank);
router.get(
  '/:bankId/donors',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  listBankDonors,
);
router.get(
  '/:bankId/beneficiaries',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  listBankBeneficiaries,
);
router.get(
  '/:bankId/history',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  getBankHistory,
);
router.get('/:bankId/availability', authorize(RolUsuario.BENEFICIARIO), getBankAvailability);
router.get(
  '/:bankId/inventory',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  getBankInventory,
);
router.post(
  '/:bankId/inventory',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  addProductToInventory,
);
router.patch(
  '/:bankId/inventory/:productId',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  updateInventorySettings,
);
router.post(
  '/:bankId/inventory/:productId/adjustments',
  authorize(...ADMIN_ROLES, RolUsuario.BANCO),
  adjustInventory,
);

export default router;
