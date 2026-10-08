import { prisma } from '../lib/prisma.js';
import { notify } from '../services/notificationService.js';
import { logger } from '../lib/logger.js';

export async function runSlaSweep(): Promise<void> {
  const now = new Date();
  const approachingUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const approaching = await prisma.complaint.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['CLOSED', 'REJECTED'] },
      slaDeadline: { gt: now, lte: approachingUntil },
      escalationLevel: 'NONE',
    },
    take: 100,
  });

  for (const c of approaching) {
    if (c.assignedOfficerId) {
      await notify({
        userId: c.assignedOfficerId,
        complaintId: c.id,
        type: 'SLA_APPROACHING',
        title: `SLA approaching for ${c.publicId}`,
        body: 'Resolution target is within 24 hours.',
      });
    }
    await prisma.complaint.update({
      where: { id: c.id },
      data: { escalationLevel: 'REMINDER' },
    });
    await prisma.escalation.create({
      data: { complaintId: c.id, level: 'REMINDER', reason: 'SLA approaching' },
    });
  }

  const breached = await prisma.complaint.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['CLOSED', 'REJECTED'] },
      slaDeadline: { lt: now },
      escalationLevel: { in: ['NONE', 'REMINDER'] },
    },
    take: 100,
  });

  for (const c of breached) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        complaintId: c.id,
        type: 'SLA_BREACHED',
        title: `SLA breached for ${c.publicId}`,
        body: 'Resolution target was missed. Supervisor escalation recorded.',
      });
    }
    if (c.assignedOfficerId) {
      await notify({
        userId: c.assignedOfficerId,
        complaintId: c.id,
        type: 'SLA_BREACHED',
        title: `SLA breached for ${c.publicId}`,
        body: 'This complaint is now overdue.',
      });
    }
    await prisma.complaint.update({
      where: { id: c.id },
      data: { escalationLevel: 'SUPERVISOR' },
    });
    await prisma.escalation.create({
      data: { complaintId: c.id, level: 'SUPERVISOR', reason: 'SLA breached' },
    });
  }

  const unassignedHigh = await prisma.complaint.findMany({
    where: {
      deletedAt: null,
      assignedTeamId: null,
      priority: { in: ['HIGH', 'CRITICAL'] },
      status: { in: ['UNDER_REVIEW', 'ROUTING_PENDING'] },
      createdAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    },
    take: 50,
  });
  for (const c of unassignedHigh) {
    const officers = await prisma.officerProfile.findMany({
      where: {
        isActive: true,
        ...(c.departmentId ? { departmentId: c.departmentId } : {}),
        ...(c.jurisdictionId ? { jurisdictionId: c.jurisdictionId } : {}),
      },
    });
    for (const o of officers) {
      await notify({
        userId: o.userId,
        complaintId: c.id,
        type: 'ESCALATION',
        title: `Unassigned ${c.priority} complaint ${c.publicId}`,
        body: 'High-priority complaint is still unassigned.',
      });
    }
  }

  logger.info(
    { approaching: approaching.length, breached: breached.length, unassignedHigh: unassignedHigh.length },
    'sla_sweep_complete',
  );
}
