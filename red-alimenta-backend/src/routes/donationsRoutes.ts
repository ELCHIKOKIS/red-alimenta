import { Router } from 'express';
import { createDonation, listDonations } from '../controllers/donationsController';

const router = Router();

router.get('/', listDonations);
router.post('/', createDonation);

export default router;
