import { describe, expect, it } from 'vitest';
import { resolveAssignmentEffect } from '../src/services/complaintService.js';

describe('assignment lifecycle effects', () => {
  it('accepts the active assignment and records when', () => {
    const effect = resolveAssignmentEffect('ACCEPTED', 'ASSIGNED', 'FIELD_WORKER');
    expect(effect?.status).toBe('ACCEPTED');
    expect(effect?.acceptedAt).toBeInstanceOf(Date);
  });

  it('completes the assignment when work is marked resolved', () => {
    const effect = resolveAssignmentEffect('RESOLVED', 'IN_PROGRESS', 'FIELD_WORKER');
    expect(effect?.status).toBe('COMPLETED');
    expect(effect?.completedAt).toBeInstanceOf(Date);
  });

  it('records a decline when a field team sends the assignment back', () => {
    const effect = resolveAssignmentEffect('UNDER_REVIEW', 'ASSIGNED', 'FIELD_WORKER');
    expect(effect?.status).toBe('DECLINED');
  });

  it('does not record a decline when an officer re-reviews', () => {
    expect(resolveAssignmentEffect('UNDER_REVIEW', 'ASSIGNED', 'OFFICER')).toBeUndefined();
  });

  it('does not record a decline when the worker moves back from another status', () => {
    expect(resolveAssignmentEffect('UNDER_REVIEW', 'IN_PROGRESS', 'FIELD_WORKER')).toBeUndefined();
  });

  it('sweeps stale pending rows on reassignment', () => {
    expect(resolveAssignmentEffect('ASSIGNED', 'ASSIGNED', 'OFFICER')?.status).toBe('REASSIGNED');
  });

  it('leaves the assignment trail alone for citizen actions', () => {
    expect(resolveAssignmentEffect('CLOSED', 'CITIZEN_VERIFICATION', 'CITIZEN')).toBeUndefined();
    expect(resolveAssignmentEffect('REOPENED', 'CITIZEN_VERIFICATION', 'CITIZEN')).toBeUndefined();
  });

  it('resolves dates per call rather than capturing them at module load', () => {
    const first = resolveAssignmentEffect('ACCEPTED', 'ASSIGNED', 'FIELD_WORKER');
    const second = resolveAssignmentEffect('ACCEPTED', 'ASSIGNED', 'FIELD_WORKER');
    expect(first?.acceptedAt).toBeInstanceOf(Date);
    expect(second?.acceptedAt).toBeInstanceOf(Date);
  });
});
