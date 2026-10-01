import { describe, expect, it } from 'vitest';
import { formatStatus } from '@/lib/cn';

describe('formatStatus', () => {
  it('humanizes enum values', () => {
    expect(formatStatus('UNDER_REVIEW')).toBe('Under review');
  });
});
