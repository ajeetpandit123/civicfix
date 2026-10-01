import { describe, expect, it } from 'vitest';
import { computeSystemPriority, mergePriority } from './priority.js';

describe('priority rules', () => {
  it('elevates uncollected garbage with health risk and duration', () => {
    const result = computeSystemPriority({
      durationDays: 5,
      healthRisk: true,
      publicSafetyRisk: false,
      obstruction: true,
      categoryCode: 'WASTE_MANAGEMENT',
    });
    expect(result.priority).toBe('HIGH');
  });

  it('takes the higher of AI and system priority', () => {
    expect(mergePriority('LOW', 'HIGH')).toBe('HIGH');
    expect(mergePriority('CRITICAL', 'MEDIUM')).toBe('CRITICAL');
  });
});
