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
    throw new AppError(422, validationMessage(err), 'VALIDATION_ERROR', err);
  }
}

/**
 * Turns schema issues into a message a person can act on, e.g.
 * "title: String must contain at most 160 character(s)". The issues stay
 * available in `details` for machines.
 */
function validationMessage(err: unknown): string {
  const issues = (err as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return 'Invalid request';
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
    .join('; ');
}
