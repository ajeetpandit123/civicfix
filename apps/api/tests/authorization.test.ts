import { describe, expect, it } from 'vitest';
import { assertComplaintAccess, assertListScope } from '../src/services/complaintService.js';
import type { Complaint } from '@prisma/client';
import { ForbiddenError } from '../src/lib/errors.js';

function complaint(citizenId: string): Complaint {
  return { id: 'c1', citizenId } as Complaint;
}

describe('complaint authorization', () => {
  it('allows a citizen to access their own complaint', () => {
    expect(() =>
      assertComplaintAccess({ id: 'u1', role: 'CITIZEN', email: 'a@b.c' }, complaint('u1')),
    ).not.toThrow();
  });

  it('blocks a citizen from another complaint (IDOR)', () => {
    expect(() =>
      assertComplaintAccess({ id: 'u1', role: 'CITIZEN', email: 'a@b.c' }, complaint('u2')),
    ).toThrow();
  });

  it('allows admins', () => {
    expect(() =>
      assertComplaintAccess({ id: 'admin', role: 'ADMIN', email: 'a@b.c' }, complaint('u2')),
    ).not.toThrow();
  });
});

describe('complaint list scoping', () => {
  const profile = { jurisdictionId: 'j1', departmentId: 'd1' };

  it('scopes an officer to their jurisdiction and department', () => {
    expect(() => assertListScope('OFFICER', profile)).not.toThrow();
  });

  it('blocks an officer with no profile instead of listing everything', () => {
    expect(() => assertListScope('OFFICER', null)).toThrow(ForbiddenError);
  });

  it('does not scope roles that are not officer', () => {
    expect(() => assertListScope('ADMIN', null)).not.toThrow();
    expect(() => assertListScope('CITIZEN', null)).not.toThrow();
  });
});
