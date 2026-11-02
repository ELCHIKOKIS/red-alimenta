import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import productRoutes from './routes/productsRoutes';
import donationRoutes from './routes/donationsRoutes';
import deliveryRoutes from './routes/deliveriesRoutes';
import authRoutes from './routes/authRoutes';
import bankRoutes from './routes/banksRoutes';
import requestRoutes from './routes/requestsRoutes';
import adminRoutes from './routes/adminRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : false }));
app.use(express.json({ limit: '32kb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/deliveries', deliveryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
