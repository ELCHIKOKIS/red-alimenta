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

const router = Router();

router.use(authenticate);
router.get(
  '/',
  authorize(
    RolUsuario.ADMIN_GENERAL,
    RolUsuario.BANCO,
    RolUsuario.DONANTE,
    RolUsuario.BENEFICIARIO,
  ),
  listBanks,
);
router.post('/', authorize(RolUsuario.ADMIN_GENERAL), createBank);
router.post('/:bankId/users', authorize(RolUsuario.ADMIN_GENERAL), createBankUser);
router.post('/:bankId/coverage', authorize(RolUsuario.ADMIN_GENERAL), addBankCoverage);
router.patch('/:bankId', authorize(RolUsuario.ADMIN_GENERAL), updateBank);
router.get(
  '/:bankId/donors',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  listBankDonors,
);
router.get(
  '/:bankId/beneficiaries',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  listBankBeneficiaries,
);
router.get(
  '/:bankId/history',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  getBankHistory,
);
router.get('/:bankId/availability', authorize(RolUsuario.BENEFICIARIO), getBankAvailability);
router.get(
  '/:bankId/inventory',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  getBankInventory,
);
router.post(
  '/:bankId/inventory',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  addProductToInventory,
);
router.patch(
  '/:bankId/inventory/:productId',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  updateInventorySettings,
);
router.post(
  '/:bankId/inventory/:productId/adjustments',
  authorize(RolUsuario.ADMIN_GENERAL, RolUsuario.BANCO),
  adjustInventory,
);

export default router;
