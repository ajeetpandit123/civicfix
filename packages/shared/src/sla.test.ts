import { describe, expect, it } from 'vitest';
import { slaDeadline, slaState } from './sla.js';

describe('SLA calculations', () => {
  it('computes deadlines from hours', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadline(from, 48).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });

  it('classifies approaching and breached windows', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    expect(slaState(new Date('2026-01-02T12:00:00Z'), now)).toBe('APPROACHING');
    expect(slaState(new Date('2026-01-01T00:00:00Z'), now)).toBe('BREACHED');
    expect(slaState(new Date('2026-01-10T00:00:00Z'), now)).toBe('OK');
  });
});
