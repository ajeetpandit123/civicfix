import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { ServiceUnavailableError, ValidationError } from '../src/lib/errors.js';

type Req = Parameters<typeof errorHandler>[1];
type Res = Parameters<typeof errorHandler>[2];
type Next = Parameters<typeof errorHandler>[3];

function mockRes(): { res: Res; captured: { status?: number; body?: unknown } } {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  return { res: res as unknown as Res, captured };
}

const req = { id: 'req-1' } as unknown as Req;
const next = (() => {}) as Next;

describe('errorHandler', () => {
  it('answers 503 when the database is unreachable (P1001 as PrismaClientKnownRequestError)', () => {
    // Seen live in apps/api logs: P1001 can arrive with THIS name + code.
    const err = Object.assign(new Error("Can't reach database server at `localhost:5432`"), {
      name: 'PrismaClientKnownRequestError',
      code: 'P1001',
    });
    const { res, captured } = mockRes();
    errorHandler(err, req, res, next);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: expect.stringContaining('database is unreachable') },
    });
  });
  it('answers 503 with a clear message when the database is unreachable', () => {
    // Prisma raises P1001 ("Can't reach database server") with this name.
    const err = Object.assign(new Error("Can't reach database server at `localhost:5432`"), {
      name: 'PrismaClientInitializationError',
    });
    const { res, captured } = mockRes();
    errorHandler(err, req, res, next);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: expect.stringContaining('database is unreachable') },
    });
  });

  it('keeps AppError semantics (status, code, details)', () => {
    const { res, captured } = mockRes();
    errorHandler(new ValidationError('title: too long', [{ path: ['title'] }]), req, res, next);
    expect(captured.status).toBe(422);
    expect(captured.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', message: 'title: too long' } });
  });

  it('still answers a generic 500 that leaks nothing for unknown errors', () => {
    const { res, captured } = mockRes();
    errorHandler(new Error('boom secret detail'), req, res, next);
    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(captured.body)).not.toContain('secret detail');
  });

  it('exposes a 503 AppError for outages raised by design', () => {
    expect(new ServiceUnavailableError().statusCode).toBe(503);
    expect(new ServiceUnavailableError().code).toBe('SERVICE_UNAVAILABLE');
  });
});
