import { MEDIA_KINDS, type Role } from '@civicfix/shared';
import { ValidationError } from '../lib/errors.js';

export type MediaKind = (typeof MEDIA_KINDS)[number];

const ROLE_MEDIA_KINDS: Record<Role, readonly MediaKind[]> = {
  CITIZEN: ['EVIDENCE', 'REOPEN'],
  FIELD_WORKER: ['BEFORE', 'AFTER', 'EVIDENCE', 'RESOLUTION'],
  OFFICER: ['EVIDENCE', 'RESOLUTION'],
  ADMIN: ['EVIDENCE', 'BEFORE', 'AFTER', 'RESOLUTION', 'REOPEN'],
};

export function isMediaKindAllowed(role: Role, kind: MediaKind): boolean {
  return ROLE_MEDIA_KINDS[role].includes(kind);
}

export function parseMediaKind(raw: unknown): MediaKind {
  if (raw === undefined || raw === null || raw === '') return 'EVIDENCE';
  if (typeof raw !== 'string') {
    throw new ValidationError('Unsupported media kind');
  }
  const match = MEDIA_KINDS.find((kind) => kind === raw);
  if (!match) {
    throw new ValidationError(`Unsupported media kind: ${raw}`);
  }
  return match;
}
