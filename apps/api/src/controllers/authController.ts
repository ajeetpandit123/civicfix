import type { CookieOptions, Request, Response } from 'express';
import { loginSchema, registerSchema } from '@civicfix/shared';
import type { Env } from '../config/env.js';
import { parseJson } from '../middleware/asyncHandler.js';
import {
  authenticate,
  publicUser,
  refreshCookieName,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyEmail,
} from '../services/authService.js';
import { prisma } from '../lib/prisma.js';
import { emailSchema, passwordSchema } from '@civicfix/shared';
import { z } from 'zod';

function cookieOpts(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: Boolean(env.COOKIE_SECURE) || env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400000,
  };
}

export function authController(env: Env) {
  return {
    register: async (req: Request, res: Response) => {
      const body = parseJson(registerSchema, req.body);
      const user = await registerUser(env, body);
      res.status(201).json({
        user: publicUser(user),
        message: 'Account created. In this demo environment an admin may activate accounts, or use seeded demo users.',
      });
    },
    login: async (req: Request, res: Response) => {
      const body = parseJson(loginSchema, req.body);
      const result = await authenticate(env, body.email, body.password, {
        userAgent: req.get('user-agent') ?? undefined,
        ip: req.ip,
      });
      res.cookie(refreshCookieName(), result.refreshToken, cookieOpts(env));
      res.json({ accessToken: result.accessToken, user: publicUser(result.user) });
    },
    refresh: async (req: Request, res: Response) => {
      const token = req.cookies?.[refreshCookieName()];
      if (!token) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } });
        return;
      }
      const result = await rotateRefreshToken(env, token, {
        userAgent: req.get('user-agent') ?? undefined,
        ip: req.ip,
      });
      res.cookie(refreshCookieName(), result.refreshToken, cookieOpts(env));
      res.json({ accessToken: result.accessToken, user: publicUser(result.user) });
    },
    logout: async (req: Request, res: Response) => {
      const token = req.cookies?.[refreshCookieName()];
      if (token) await revokeRefreshToken(token);
      res.clearCookie(refreshCookieName(), { path: '/api/auth' });
      res.status(204).send();
    },
    me: async (req: Request, res: Response) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      res.json({ user: publicUser(user) });
    },
    verifyEmail: async (req: Request, res: Response) => {
      const token = String(req.body?.token ?? '');
      await verifyEmail(token);
      res.json({ ok: true });
    },
    forgotPassword: async (req: Request, res: Response) => {
      const body = parseJson(z.object({ email: emailSchema }), req.body);
      await requestPasswordReset(env, body.email);
      res.json({ ok: true });
    },
    resetPassword: async (req: Request, res: Response) => {
      const body = parseJson(z.object({ token: z.string().min(10), password: passwordSchema }), req.body);
      await resetPassword(body.token, body.password);
      res.json({ ok: true });
    },
  };
}
