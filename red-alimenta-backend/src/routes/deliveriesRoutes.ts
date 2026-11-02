import { Router } from 'express';
import { createDelivery, listDeliveries } from '../controllers/deliveriesController';

const router = Router();

router.get('/', listDeliveries);
router.post('/', createDelivery);

export default router;
