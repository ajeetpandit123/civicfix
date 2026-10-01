import { Router } from 'express';
import type { Env } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authController } from '../controllers/authController.js';
import { rateLimit } from 'express-rate-limit';

export function authRouter(env: Env): Router {
  const r = Router();
  const c = authController(env);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
  });
  r.post('/register', limiter, asyncHandler(c.register));
  r.post('/login', limiter, asyncHandler(c.login));
  r.post('/refresh', asyncHandler(c.refresh));
  r.post('/logout', asyncHandler(c.logout));
  r.post('/verify-email', asyncHandler(c.verifyEmail));
  r.post('/forgot-password', limiter, asyncHandler(c.forgotPassword));
  r.post('/reset-password', limiter, asyncHandler(c.resetPassword));
  return r;
}
