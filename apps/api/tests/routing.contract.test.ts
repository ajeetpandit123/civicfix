import { describe, expect, it } from 'vitest';
import { routeComplaint, resolveLocation } from '../src/services/routingService.js';

describe('routing service contract', () => {
  it('exports routing functions', () => {
    expect(typeof routeComplaint).toBe('function');
    expect(typeof resolveLocation).toBe('function');
  });
});
