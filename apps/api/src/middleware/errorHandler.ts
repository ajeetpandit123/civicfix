import type { NextFunction, Request, Response } from 'express';
import { AppError, ServiceUnavailableError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId: req.id,
    });
    return;
  }

  // Prisma reports "can't reach the database" as PrismaClientInitializationError
  // (P1001). That is an outage, not a bug: answer 503 instead of a misleading 500.
  if (err instanceof Error && err.name === 'PrismaClientInitializationError') {
    const outage = new ServiceUnavailableError('The database is unreachable right now. Please try again shortly.');
    logger.error({ err, requestId: req.id }, 'database_unavailable');
    res.status(outage.statusCode).json({
      error: { code: outage.code, message: outage.message },
      requestId: req.id,
    });
    return;
  }

  logger.error({ err, requestId: req.id }, 'unhandled_error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    requestId: req.id,
  });
}
