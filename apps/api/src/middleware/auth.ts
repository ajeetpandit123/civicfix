import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import type { Env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../services/authService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required to augment Express.Request
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        email: string;
      };
    }
  }
}

export function authMiddleware(env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!token) throw new UnauthorizedError();
      const claims = await verifyAccessToken(env, token);
      const user = await prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user || user.deletedAt || user.status === 'DISABLED') {
        throw new UnauthorizedError('Account unavailable');
      }
      // Staff under review have an account but no permissions yet: they may
      // read their own status (auth endpoints) and nothing operational.
      // Matched on the full URL so it does not depend on how routers mount.
      const staffSelfService = req.originalUrl.startsWith('/api/auth/');
      if (
        user.status === 'PENDING_VERIFICATION' &&
        user.role !== 'CITIZEN' &&
        !staffSelfService
      ) {
        throw new ForbiddenError(
          'Your staff account is currently under verification. You will receive access after an administrator approves your account.',
        );
      }
      req.user = { id: user.id, role: user.role, email: user.email };
      next();
    } catch (err) {
      next(err instanceof ForbiddenError || err instanceof UnauthorizedError ? err : new UnauthorizedError());
    }
  };
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}
