import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import productRoutes from './routes/productsRoutes';
import donationRoutes from './routes/donationsRoutes';
import deliveryRoutes from './routes/deliveriesRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/products', productRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/deliveries', deliveryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
