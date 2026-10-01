import { describe, expect, it } from 'vitest';
import { isMediaKindAllowed, parseMediaKind } from '../src/services/mediaPolicy.js';
import { ValidationError } from '../src/lib/errors.js';

describe('media kind policy', () => {
  it('restricts citizens to their own evidence kinds', () => {
    expect(isMediaKindAllowed('CITIZEN', 'EVIDENCE')).toBe(true);
    expect(isMediaKindAllowed('CITIZEN', 'REOPEN')).toBe(true);
    expect(isMediaKindAllowed('CITIZEN', 'BEFORE')).toBe(false);
    expect(isMediaKindAllowed('CITIZEN', 'AFTER')).toBe(false);
    expect(isMediaKindAllowed('CITIZEN', 'RESOLUTION')).toBe(false);
  });

  it('lets field workers attach before and after evidence', () => {
    expect(isMediaKindAllowed('FIELD_WORKER', 'BEFORE')).toBe(true);
    expect(isMediaKindAllowed('FIELD_WORKER', 'AFTER')).toBe(true);
    expect(isMediaKindAllowed('FIELD_WORKER', 'RESOLUTION')).toBe(true);
    expect(isMediaKindAllowed('FIELD_WORKER', 'REOPEN')).toBe(false);
  });

  it('keeps officers on evidence and resolution', () => {
    expect(isMediaKindAllowed('OFFICER', 'EVIDENCE')).toBe(true);
    expect(isMediaKindAllowed('OFFICER', 'RESOLUTION')).toBe(true);
    expect(isMediaKindAllowed('OFFICER', 'BEFORE')).toBe(false);
    expect(isMediaKindAllowed('OFFICER', 'AFTER')).toBe(false);
  });

  it('lets admins attach every kind', () => {
    for (const kind of ['EVIDENCE', 'BEFORE', 'AFTER', 'RESOLUTION', 'REOPEN'] as const) {
      expect(isMediaKindAllowed('ADMIN', kind)).toBe(true);
    }
  });

  it('defaults an absent kind to EVIDENCE', () => {
    expect(parseMediaKind(undefined)).toBe('EVIDENCE');
    expect(parseMediaKind(null)).toBe('EVIDENCE');
    expect(parseMediaKind('')).toBe('EVIDENCE');
  });

  it('accepts known kinds', () => {
    expect(parseMediaKind('BEFORE')).toBe('BEFORE');
    expect(parseMediaKind('REOPEN')).toBe('REOPEN');
  });

  it('rejects an unknown kind instead of trusting the cast', () => {
    expect(() => parseMediaKind('nope')).toThrow(ValidationError);
    expect(() => parseMediaKind('evidence')).toThrow(ValidationError);
    expect(() => parseMediaKind(7)).toThrow(ValidationError);
    expect(() => parseMediaKind({ kind: 'AFTER' })).toThrow(ValidationError);
  });
});
