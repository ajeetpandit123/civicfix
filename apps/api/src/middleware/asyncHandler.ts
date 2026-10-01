import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function parseJson<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    throw new AppError(422, 'Invalid request', 'VALIDATION_ERROR', err);
  }
}
