import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function writeAudit(input: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: input.ip,
    },
  });
}

export function actorRole(role: Role): Role {
  return role;
}
