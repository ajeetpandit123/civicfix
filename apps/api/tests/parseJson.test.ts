import { describe, expect, it } from 'vitest';
import { createComplaintSchema } from '@civicfix/shared';
import { parseJson } from '../src/middleware/asyncHandler.js';
import { AppError } from '../src/lib/errors.js';

const validBody = {
  title: 'Road collapse near dominoz',
  description: 'A large section of the road has collapsed and needs repair.',
  latitude: 28.7182,
  longitude: 77.1721,
  address: 'rajan babu road, adarsh nagar 110033',
};

function catchErr(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    return err as AppError;
  }
  throw new Error('expected parseJson to throw');
}

describe('parseJson validation messages', () => {
  it('names the offending field and its limit instead of a blanket message', () => {
    const err = catchErr(() => parseJson(createComplaintSchema, { ...validBody, title: 'x'.repeat(200) }));
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('title');
    expect(err.message).toMatch(/160/);
    expect(err.message).not.toBe('Invalid request');
  });

  it('lists several problems in one message', () => {
    const err = catchErr(() => parseJson(createComplaintSchema, { title: 'x', description: 'short' }));
    expect(err.message).toContain('title');
    expect(err.message).toContain('description');
  });

  it('keeps the raw issues available in details', () => {
    const err = catchErr(() => parseJson(createComplaintSchema, { ...validBody, title: 'x'.repeat(200) }));
    expect(err.details).toBeTruthy();
  });

  it('falls back to the generic message for non-schema errors', () => {
    const throwingSchema = {
      parse() {
        throw new Error('boom');
      },
    };
    const err = catchErr(() => parseJson(throwingSchema, {}));
    expect(err.message).toBe('Invalid request');
    expect(err.statusCode).toBe(422);
  });
});
