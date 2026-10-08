import { prisma } from '../lib/prisma.js';
import type { Priority } from '@prisma/client';
import { slaDeadline } from '@civicfix/shared';

export async function applySla(complaintId: string, categoryId?: string | null, priority?: Priority) {
  if (!categoryId || !priority) return;
  const policy = await prisma.slaPolicy.findFirst({
    where: {
      isActive: true,
      priority,
      OR: [{ categoryId }, { categoryId: null }],
    },
    orderBy: { categoryId: 'desc' },
  });
  if (!policy) return;
  const now = new Date();
  await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      responseDeadline: slaDeadline(now, policy.responseHours),
      slaDeadline: slaDeadline(now, policy.resolutionHours),
    },
  });
}
