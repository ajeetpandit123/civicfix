import type { ComplaintStatus, Role } from './constants.js';

const TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  REPORTED: ['ROUTING_PENDING', 'UNDER_REVIEW', 'REJECTED'],
  ROUTING_PENDING: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ASSIGNED', 'REJECTED', 'ROUTING_PENDING'],
  ASSIGNED: ['ACCEPTED', 'ASSIGNED', 'UNDER_REVIEW', 'REJECTED'],
  ACCEPTED: ['IN_PROGRESS', 'ASSIGNED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'ASSIGNED'],
  ON_HOLD: ['IN_PROGRESS', 'ASSIGNED', 'REJECTED'],
  RESOLVED: ['CITIZEN_VERIFICATION', 'REOPENED', 'CLOSED', 'IN_PROGRESS'],
  CITIZEN_VERIFICATION: ['CLOSED', 'REOPENED'],
  CLOSED: [],
  REJECTED: ['UNDER_REVIEW', 'REOPENED'],
  REOPENED: ['UNDER_REVIEW'],
};

export function canTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ComplaintStatus, to: ComplaintStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ComplaintStatus,
    public readonly to: ComplaintStatus,
  ) {
    super(`Invalid complaint status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

const ROLE_TRANSITIONS: Partial<Record<Role, Partial<Record<ComplaintStatus, ComplaintStatus[]>>>> =
  {
    CITIZEN: {
      CITIZEN_VERIFICATION: ['CLOSED', 'REOPENED'],
      CLOSED: [],
    },
    FIELD_WORKER: {
      // 'UNDER_REVIEW' from ASSIGNED means the team declined the assignment.
      ASSIGNED: ['ACCEPTED', 'UNDER_REVIEW'],
      ACCEPTED: ['IN_PROGRESS'],
      IN_PROGRESS: ['ON_HOLD', 'RESOLVED'],
      ON_HOLD: ['IN_PROGRESS'],
    },
    OFFICER: {
      REPORTED: ['UNDER_REVIEW', 'REJECTED', 'ROUTING_PENDING'],
      ROUTING_PENDING: ['UNDER_REVIEW', 'REJECTED'],
      UNDER_REVIEW: ['ASSIGNED', 'REJECTED', 'ROUTING_PENDING'],
      ASSIGNED: ['ASSIGNED', 'UNDER_REVIEW', 'REJECTED', 'ACCEPTED'],
      ACCEPTED: ['IN_PROGRESS', 'ASSIGNED'],
      IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'ASSIGNED'],
      ON_HOLD: ['IN_PROGRESS', 'ASSIGNED', 'REJECTED'],
      RESOLVED: ['CITIZEN_VERIFICATION', 'REOPENED', 'IN_PROGRESS'],
      CITIZEN_VERIFICATION: ['CLOSED', 'REOPENED'],
      REOPENED: ['UNDER_REVIEW'],
      REJECTED: ['UNDER_REVIEW'],
    },
    ADMIN: TRANSITIONS,
  };

export function canRoleTransition(
  role: Role,
  from: ComplaintStatus,
  to: ComplaintStatus,
): boolean {
  if (!canTransition(from, to)) return false;
  const allowed = ROLE_TRANSITIONS[role]?.[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export { TRANSITIONS };
