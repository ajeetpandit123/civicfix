import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/authRoutes.js';
import { complaintRouter } from './routes/complaintRoutes.js';
import { adminRouter, catalogRouter } from './routes/adminRoutes.js';
import { authMiddleware } from './middleware/auth.js';
import { asyncHandler } from './middleware/asyncHandler.js';
import { authController } from './controllers/authController.js';
import { prisma } from './lib/prisma.js';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  });

  app.use('/api/auth', authRouter(env));
  app.get('/api/auth/me', authMiddleware(env), asyncHandler(authController(env).me));
  app.use('/api/complaints', complaintRouter(env));
  app.use('/api/admin', adminRouter(env));
  app.use('/api', catalogRouter(env));

  app.use(errorHandler);
  return app;
}
