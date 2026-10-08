export const ROLES = ['CITIZEN', 'FIELD_WORKER', 'OFFICER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const COMPLAINT_STATUSES = [
  'REPORTED',
  'ROUTING_PENDING',
  'UNDER_REVIEW',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'CITIZEN_VERIFICATION',
  'CLOSED',
  'REJECTED',
  'REOPENED',
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const COMMENT_VISIBILITY = ['PUBLIC', 'INTERNAL'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITY)[number];
