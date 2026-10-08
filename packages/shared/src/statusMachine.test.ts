import { describe, expect, it } from 'vitest';
import { canRoleTransition, canTransition } from './statusMachine.js';

describe('complaint status machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('REPORTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'CITIZEN_VERIFICATION')).toBe(true);
    expect(canTransition('CITIZEN_VERIFICATION', 'CLOSED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('REPORTED', 'CLOSED')).toBe(false);
    expect(canTransition('CLOSED', 'IN_PROGRESS')).toBe(false);
  });

  it('restricts citizen transitions', () => {
    expect(canRoleTransition('CITIZEN', 'CITIZEN_VERIFICATION', 'CLOSED')).toBe(true);
    // Officer approval is mandatory (user-confirmed product decision): a citizen
    // may close only AFTER approval, from CITIZEN_VERIFICATION — never straight
    // from RESOLVED, which still means 'work submitted, awaiting review'.
    expect(canRoleTransition('CITIZEN', 'RESOLVED', 'CLOSED')).toBe(false);
    expect(canRoleTransition('CITIZEN', 'RESOLVED', 'REOPENED')).toBe(false);
    expect(canRoleTransition('CITIZEN', 'UNDER_REVIEW', 'ASSIGNED')).toBe(false);
  });

  it('restricts worker transitions', () => {
    expect(canRoleTransition('FIELD_WORKER', 'ASSIGNED', 'ACCEPTED')).toBe(true);
    expect(canRoleTransition('FIELD_WORKER', 'UNDER_REVIEW', 'ASSIGNED')).toBe(false);
  });

  it('lets a worker decline an assignment', () => {
    expect(canRoleTransition('FIELD_WORKER', 'ASSIGNED', 'UNDER_REVIEW')).toBe(true);
  });

  it('still blocks a worker from self-resolving', () => {
    expect(canRoleTransition('FIELD_WORKER', 'ASSIGNED', 'RESOLVED')).toBe(false);
    expect(canRoleTransition('CITIZEN', 'ASSIGNED', 'UNDER_REVIEW')).toBe(false);
  });
});
