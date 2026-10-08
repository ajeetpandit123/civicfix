import type { Complaint, ComplaintStatus, Prisma, Role, User } from '@prisma/client';
import {
  canRoleTransition,
  computeSystemPriority,
  mergePriority,
  type Priority,
} from '@civicfix/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from './auditService.js';
import { nextPublicId } from './idService.js';
import { getJobQueue } from '../jobs/jobQueue.js';
import { notify, notifyMany } from './notificationService.js';
import { routeComplaint } from './routingService.js';
import { applySla } from './slaService.js';
import { classifySafe, createAiProvider, inputHash } from '../ai/provider.js';
import type { Env } from '../config/env.js';

const complaintInclude = {
  category: true,
  subcategory: true,
  department: true,
  jurisdiction: true,
  area: true,
  assignedTeam: true,
  assignedOfficer: { select: { id: true, name: true, role: true } },
  citizen: { select: { id: true, name: true } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  media: { orderBy: { createdAt: 'asc' as const } },
  assignments: { orderBy: { createdAt: 'desc' as const }, take: 10 },
} satisfies Prisma.ComplaintInclude;

export type Actor = { id: string; role: Role; email: string };

export function assertComplaintAccess(actor: Actor, complaint: Complaint): void {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'CITIZEN' && complaint.citizenId !== actor.id) {
    throw new ForbiddenError();
  }
}

export async function loadAuthorizedComplaint(actor: Actor, id: string) {
  const complaint = await prisma.complaint.findFirst({
    where: { OR: [{ id }, { publicId: id }], deletedAt: null },
    include: {
      ...complaintInclude,
      comments: {
        where: {
          deletedAt: null,
          ...(actor.role === 'CITIZEN' ? { visibility: 'PUBLIC' as const } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      aiAnalyses: { orderBy: { createdAt: 'desc' }, take: 3 },
      duplicateCandidates: { include: { match: { select: { id: true, publicId: true, title: true, status: true } } } },
      escalations: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!complaint) throw new NotFoundError('Complaint not found');
  assertComplaintAccess(actor, complaint);

  if (actor.role === 'OFFICER') {
    const profile = await prisma.officerProfile.findUnique({ where: { userId: actor.id } });
    if (!profile) throw new ForbiddenError();
    if (complaint.jurisdictionId && complaint.jurisdictionId !== profile.jurisdictionId) {
      throw new ForbiddenError();
    }
    if (complaint.departmentId && complaint.departmentId !== profile.departmentId) {
      throw new ForbiddenError();
    }
  }

  if (actor.role === 'FIELD_WORKER') {
    const worker = await prisma.fieldWorkerProfile.findUnique({ where: { userId: actor.id } });
    const onTeam = worker?.teamId && complaint.assignedTeamId === worker.teamId;
    if (!onTeam) throw new ForbiddenError();
  }

  return complaint;
}

type AssignmentRow = {
  id: string;
  status: string;
  officerId?: string | null;
  teamId?: string | null;
  note?: string | null;
  assignedById?: string | null;
};

const ACTIVE_ASSIGNMENT_STATUSES = ['PENDING', 'ACCEPTED'];

export type LoadedComplaint = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }> & {
  comments?: Array<Record<string, unknown>>;
  aiAnalyses?: Array<Record<string, unknown>>;
  duplicateCandidates?: Array<Record<string, unknown>>;
  escalations?: Array<Record<string, unknown>>;
};

/**
 * The ComplaintAssignment trail is a side effect of the status machine, never a
 * parallel state machine, so the two cannot desync. Dates are resolved per call.
 */
export function resolveAssignmentEffect(
  to: ComplaintStatus,
  from: ComplaintStatus,
  role: Role,
): Prisma.ComplaintAssignmentUpdateManyMutationInput | undefined {
  if (to === 'ACCEPTED') return { status: 'ACCEPTED', acceptedAt: new Date() };
  if (to === 'RESOLVED') return { status: 'COMPLETED', completedAt: new Date() };
  if (to === 'ASSIGNED') return { status: 'REASSIGNED' };
  // A field team sending ASSIGNED back to UNDER_REVIEW is a decline, unlike an
  // officer moving it there to re-review, which must not stamp DECLINED.
  if (to === 'UNDER_REVIEW' && from === 'ASSIGNED' && role === 'FIELD_WORKER') {
    return { status: 'DECLINED' };
  }
  return undefined;
}

/** An officer without an assigned jurisdiction/department must scope to nothing, not everything. */
export function assertListScope(
  actor: Role,
  profile: { jurisdictionId: string; departmentId: string } | null,
): void {
  if (actor === 'OFFICER' && !profile) throw new ForbiddenError();
}

function isInternalRole(role: Role): boolean {
  return role === 'OFFICER' || role === 'ADMIN';
}

/**
 * Output validation boundary. The service layer needs the full record to enforce
 * rules; the wire must never carry it. Shallow-clones so callers keep the original.
 * Accepts any complaint-shaped row: callers pass full, partial or bare records.
 */
export type PresentedComplaint = Record<string, unknown> & {
  comments?: Array<Record<string, unknown>>;
  aiAnalyses?: Array<Record<string, unknown>>;
  duplicateCandidates?: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
  assignedOfficer?: unknown;
  citizen?: unknown;
  escalations?: unknown;
};

/**
 * Coarse public bucket for a duplicate score. Citizens see high/medium/low per
 * spec §13, never the exact score or the heuristics that produced it.
 */
export function similarityLabel(score: number | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (typeof score !== 'number') return 'LOW';
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

export function presentComplaint<T extends object>(actor: Actor, complaint: T): PresentedComplaint {
  const src = complaint as unknown as LoadedComplaint;
  const view: PresentedComplaint = { ...(complaint as Record<string, unknown>) };

  if (actor.role === 'FIELD_WORKER') {
    // Workers have no business reading who reported the issue.
    delete view.citizen;
  }

  if (isInternalRole(actor.role)) return view;

  delete view.escalations;

  if (Array.isArray(src.comments)) {
    view.comments = src.comments.filter((c) => c.visibility !== 'INTERNAL');
  }
  if (Array.isArray(src.aiAnalyses)) {
    view.aiAnalyses = src.aiAnalyses.map((analysis) => {
      const safe = { ...analysis };
      delete safe.rawOutput;
      delete safe.inputHash;
      return safe;
    });
  }
  if (Array.isArray(src.duplicateCandidates)) {
    view.duplicateCandidates = src.duplicateCandidates.map((candidate) => {
      const safe = { ...candidate };
      const similarity = similarityLabel(candidate.score as number | undefined);
      delete safe.score;
      delete safe.reasons;
      return { ...safe, similarity };
    });
  }

  const assignments = (src.assignments ?? []) as unknown as AssignmentRow[];
  const active = assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
  view.assignments = active.map((a) => ({
    id: a.id,
    status: a.status,
    teamId: a.teamId ?? null,
    officerId: a.officerId ?? null,
  }));

  // Never imply an individual is responsible when no active assignment names one.
  view.assignedOfficer = active.some((a) => a.officerId) ? view.assignedOfficer : null;

  return view;
}

export async function createComplaint(
  env: Env,
  actor: Actor,
  input: {
    title: string;
    description: string;
    categoryId?: string;
    subcategoryId?: string;
    priority?: Priority;
    latitude: number;
    longitude: number;
    address: string;
    landmark?: string;
    attachToComplaintId?: string;
  },
) {
  if (actor.role !== 'CITIZEN' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only citizens can file complaints');
  }

  let categoryId = input.categoryId;
  const ai = createAiProvider(env);
  const classification = await classifySafe(ai, {
    title: input.title,
    description: input.description,
    address: input.address,
  });

  if (!categoryId && classification) {
    const cat = await prisma.complaintCategory.findUnique({
      where: { code: classification.category },
    });
    categoryId = cat?.id;
    if (classification.subcategory && cat) {
      const sub = await prisma.complaintSubcategory.findFirst({
        where: { categoryId: cat.id, code: classification.subcategory },
      });
      if (sub && !input.subcategoryId) input.subcategoryId = sub.id;
    }
  }

  const durationMatch = input.description.match(/(\d+)\s*day/i);
  const system = computeSystemPriority({
    durationDays: durationMatch ? Number(durationMatch[1]) : undefined,
    healthRisk: Boolean(classification?.possible_hazards.includes('public_health')),
    publicSafetyRisk: Boolean(classification?.possible_hazards.includes('public_safety')),
    obstruction: Boolean(classification?.possible_hazards.includes('obstruction')),
    categoryCode: classification?.category,
  });
  const aiPriority = classification?.severity;
  const merged = mergePriority(aiPriority, system.priority);
  const finalPriority = input.priority ?? merged;

  const routing = await routeComplaint({
    latitude: input.latitude,
    longitude: input.longitude,
    categoryId,
  });

  const initialStatus: ComplaintStatus =
    routing.kind === 'mapped' ? 'UNDER_REVIEW' : 'ROUTING_PENDING';

  const publicId = await nextPublicId();
  const complaint = await prisma.complaint.create({
    data: {
      publicId,
      citizenId: actor.id,
      title: input.title,
      description: input.description,
      categoryId,
      subcategoryId: input.subcategoryId,
      priority: finalPriority,
      aiSuggestedPriority: aiPriority,
      status: initialStatus,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      landmark: input.landmark,
      areaId: routing.kind === 'mapped' ? routing.areaId : routing.areaId,
      jurisdictionId: routing.kind === 'mapped' ? routing.jurisdictionId : routing.jurisdictionId,
      departmentId: routing.kind === 'mapped' ? routing.departmentId : undefined,
      duplicateOfId: input.attachToComplaintId,
    },
  });

  await prisma.complaintStatusHistory.create({
    data: {
      complaintId: complaint.id,
      fromStatus: null,
      toStatus: initialStatus,
      actorId: actor.id,
      note:
        routing.kind === 'unmapped'
          ? 'Received. Responsible authority has not yet been configured.'
          : 'Complaint received and routed to responsible department.',
    },
  });

  if (classification) {
    await prisma.aiAnalysis.create({
      data: {
        complaintId: complaint.id,
        provider: ai.name,
        model: env.AI_MODEL,
        inputHash: inputHash(`${input.title}|${input.description}`),
        rawOutput: classification as object,
        categoryCode: classification.category,
        subcategory: classification.subcategory,
        severity: classification.severity,
        confidence: classification.confidence,
        summary: classification.summary,
        hazards: classification.possible_hazards,
      },
    });
  }

  await applySla(complaint.id, categoryId, finalPriority);
  await writeAudit({
    actorId: actor.id,
    action: 'complaint.create',
    entityType: 'Complaint',
    entityId: complaint.id,
    metadata: { publicId, routing: routing.kind, mappingId: routing.kind === 'mapped' ? routing.mappingId : undefined },
  });

  // Side effects leave the request path: notification fan-out and duplicate
  // analysis are slow and must not block the citizen's response.
  const queue = getJobQueue();
  if (queue) {
    await queue.enqueue('complaint.created', {
      complaintId: complaint.id,
      actorId: actor.id,
      publicId,
      routing: routing.kind,
      departmentId: routing.kind === 'mapped' ? routing.departmentId : undefined,
      jurisdictionId: routing.kind === 'mapped' ? routing.jurisdictionId : undefined,
    });
  } else {
    await runComplaintCreatedSideEffects({
      complaintId: complaint.id,
      actorId: actor.id,
      publicId,
      routing: routing.kind,
      departmentId: routing.kind === 'mapped' ? routing.departmentId : undefined,
      jurisdictionId: routing.kind === 'mapped' ? routing.jurisdictionId : undefined,
    });
  }

  return loadAuthorizedComplaint(actor, complaint.id);
}

export interface ComplaintCreatedJob {
  complaintId: string;
  actorId: string;
  publicId: string;
  routing: 'mapped' | 'unmapped';
  departmentId?: string;
  jurisdictionId?: string;
}

/** Notification fan-out plus duplicate analysis. Runs on the queue or inline. */
export async function runComplaintCreatedSideEffects(job: ComplaintCreatedJob): Promise<void> {
  await notify({
    userId: job.actorId,
    complaintId: job.complaintId,
    type: 'COMPLAINT_RECEIVED',
    title: `Complaint ${job.publicId} received`,
    body:
      job.routing === 'mapped'
        ? 'Your complaint was routed to the configured department.'
        : 'Your complaint was received, but the responsible authority has not yet been configured.',
  });

  if (job.routing === 'unmapped') {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    await notifyMany(
      admins.map((a) => a.id),
      {
        complaintId: job.complaintId,
        type: 'ROUTING_PENDING',
        title: `Routing pending for ${job.publicId}`,
        body: 'No active responsibility mapping exists for this area and category.',
      },
    );
  } else {
    const officers = await prisma.officerProfile.findMany({
      where: {
        isActive: true,
        departmentId: job.departmentId,
        jurisdictionId: job.jurisdictionId,
      },
    });
    await notifyMany(
      officers.map((o) => o.userId),
      {
        complaintId: job.complaintId,
        type: 'COMPLAINT_RECEIVED',
        title: `New complaint ${job.publicId}`,
        body: 'A new complaint entered the department queue.',
      },
    );
  }

  await findDuplicates(
    { id: job.actorId, role: 'CITIZEN', email: '' },
    job.complaintId,
  );
}

export async function findDuplicates(actor: Actor, complaintId: string) {
  // Enforces ownership/jurisdiction scope before any comparison data is exposed.
  const complaint = await loadAuthorizedComplaint(actor, complaintId);

  const nearby = await prisma.complaint.findMany({
    where: {
      id: { not: complaintId },
      deletedAt: null,
      status: { notIn: ['CLOSED', 'REJECTED'] },
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
    },
    take: 50,
  });

  const candidates = nearby
    .map((other) => {
      const dLat = complaint.latitude - other.latitude;
      const dLng = complaint.longitude - other.longitude;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      const sameCat = complaint.categoryId && complaint.categoryId === other.categoryId;
      const textScore = overlapScore(complaint.description, other.description);
      let score = 0;
      const reasons: string[] = [];
      if (dist < 0.01) {
        score += 0.45;
        reasons.push('nearby');
      }
      if (sameCat) {
        score += 0.25;
        reasons.push('same_category');
      }
      if (textScore > 0.2) {
        score += Math.min(0.3, textScore);
        reasons.push('similar_text');
      }
      return { other, score, reasons };
    })
    .filter((c) => c.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  await prisma.duplicateCandidate.deleteMany({ where: { sourceId: complaintId } });
  await prisma.duplicateCandidate.createMany({
    data: candidates.map((c) => ({
      sourceId: complaintId,
      matchId: c.other.id,
      score: c.score,
      reasons: c.reasons,
    })),
  });
  return candidates.map((c) => ({
    id: c.other.id,
    publicId: c.other.publicId,
    title: c.other.title,
    score: c.score,
    reasons: c.reasons,
  }));
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

export async function listComplaints(
  actor: Actor,
  query: {
    page: number;
    pageSize: number;
    status?: ComplaintStatus;
    priority?: Priority;
    q?: string;
    categoryId?: string;
    areaId?: string;
    assigned?: string;
    sla?: string;
  },
) {
  const where: Prisma.ComplaintWhereInput = { deletedAt: null };
  if (actor.role === 'CITIZEN') where.citizenId = actor.id;
  if (actor.role === 'FIELD_WORKER') {
    const worker = await prisma.fieldWorkerProfile.findUnique({ where: { userId: actor.id } });
    where.assignedTeamId = worker?.teamId ?? '__none__';
  }
  if (actor.role === 'OFFICER') {
    const profile = await prisma.officerProfile.findUnique({ where: { userId: actor.id } });
    assertListScope(actor.role, profile);
    where.jurisdictionId = profile!.jurisdictionId;
    where.departmentId = profile!.departmentId;
  }
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.areaId) where.areaId = query.areaId;
  if (query.assigned === 'unassigned') where.assignedTeamId = null;
  if (query.assigned === 'assigned') where.assignedTeamId = { not: null };
  if (query.sla === 'breached') where.slaDeadline = { lt: new Date() };
  if (query.sla === 'approaching') {
    where.slaDeadline = { gte: new Date(), lte: new Date(Date.now() + 86400000) };
  }
  if (query.q) {
    where.OR = [
      { publicId: { contains: query.q, mode: 'insensitive' } },
      { title: { contains: query.q, mode: 'insensitive' } },
      { address: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      include: {
        category: true,
        department: true,
        area: true,
        assignedTeam: true,
        assignedOfficer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { total, page: query.page, pageSize: query.pageSize, items };
}

export async function transitionStatus(
  actor: Actor,
  complaintId: string,
  to: ComplaintStatus,
  note?: string,
) {
  const complaint = await loadAuthorizedComplaint(actor, complaintId);
  if (!canRoleTransition(actor.role, complaint.status, to)) {
    throw new ValidationError(`Cannot transition from ${complaint.status} to ${to}`);
  }

  const data: Prisma.ComplaintUpdateInput = { status: to };
  if (to === 'RESOLVED') data.resolvedAt = new Date();
  if (to === 'REOPENED') data.reopenedAt = new Date();
  if (to === 'CLOSED') data.closedAt = new Date();

  const updated = await prisma.complaint.update({
    where: { id: complaint.id },
    data,
  });
  const effect = resolveAssignmentEffect(to, complaint.status, actor.role);
  if (effect) {
    await prisma.complaintAssignment.updateMany({
      // Rows still in play are PENDING or ACCEPTED. By RESOLVED time ACCEPTED has
      // already moved the row off PENDING, so a PENDING-only filter would match
      // nothing and silently drop the COMPLETED stamp.
      where: { complaintId: complaint.id, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: effect,
    });
  }
  await prisma.complaintStatusHistory.create({
    data: {
      complaintId: complaint.id,
      fromStatus: complaint.status,
      toStatus: to,
      actorId: actor.id,
      note,
    },
  });
  await writeAudit({
    actorId: actor.id,
    action: 'complaint.status',
    entityType: 'Complaint',
    entityId: complaint.id,
    metadata: { from: complaint.status, to, note },
  });
  await notify({
    userId: complaint.citizenId,
    complaintId: complaint.id,
    type: to === 'REOPENED' ? 'COMPLAINT_REOPENED' : 'STATUS_CHANGED',
    title: `${complaint.publicId} is now ${to.replaceAll('_', ' ')}`,
    body: note ?? `Status changed to ${to}`,
  });
  return updated;
}

export async function assignComplaint(
  actor: Actor,
  complaintId: string,
  input: { officerId?: string; teamId?: string; note?: string },
) {
  if (actor.role !== 'OFFICER' && actor.role !== 'ADMIN') throw new ForbiddenError();
  const complaint = await loadAuthorizedComplaint(actor, complaintId);
  if (!canRoleTransition(actor.role, complaint.status, 'ASSIGNED')) {
    throw new ValidationError(`Cannot assign from status ${complaint.status}`);
  }
  if (input.teamId) {
    const team = await prisma.fieldTeam.findFirst({ where: { id: input.teamId, deletedAt: null } });
    if (!team) throw new ValidationError(`Unknown field team: ${input.teamId}`);
  }

  await prisma.complaintAssignment.updateMany({
    // Sweep every row still in play, including one a team already ACCEPTED.
    where: { complaintId: complaint.id, status: { in: ['PENDING', 'ACCEPTED'] } },
    data: { status: 'REASSIGNED' },
  });

  await prisma.complaintAssignment.create({
    data: {
      complaintId: complaint.id,
      assignedById: actor.id,
      officerId: input.officerId,
      teamId: input.teamId,
      note: input.note,
      status: 'PENDING',
    },
  });

  await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      assignedOfficerId: input.officerId,
      assignedTeamId: input.teamId,
      status: 'ASSIGNED',
    },
  });
  await prisma.complaintStatusHistory.create({
    data: {
      complaintId: complaint.id,
      fromStatus: complaint.status,
      toStatus: 'ASSIGNED',
      actorId: actor.id,
      note: input.note,
    },
  });

  if (input.teamId) {
    const members = await prisma.fieldWorkerProfile.findMany({ where: { teamId: input.teamId } });
    await notifyMany(
      members.map((m) => m.userId),
      {
        complaintId: complaint.id,
        type: 'COMPLAINT_ASSIGNED',
        title: `Assigned ${complaint.publicId}`,
        body: 'A new field assignment is waiting for acceptance.',
      },
    );
  }
  await notify({
    userId: complaint.citizenId,
    complaintId: complaint.id,
    type: 'COMPLAINT_ASSIGNED',
    title: `${complaint.publicId} assigned`,
    body: 'A field team has been assigned where configured.',
  });
  return loadAuthorizedComplaint(actor, complaint.id);
}

export async function addComment(
  actor: Actor,
  complaintId: string,
  body: string,
  visibility: 'PUBLIC' | 'INTERNAL',
) {
  const complaint = await loadAuthorizedComplaint(actor, complaintId);
  if (actor.role === 'CITIZEN' && visibility === 'INTERNAL') throw new ForbiddenError();
  const comment = await prisma.complaintComment.create({
    data: {
      complaintId: complaint.id,
      authorId: actor.id,
      body,
      visibility: actor.role === 'CITIZEN' ? 'PUBLIC' : visibility,
    },
  });
  if (visibility === 'PUBLIC' && actor.id !== complaint.citizenId) {
    await notify({
      userId: complaint.citizenId,
      complaintId: complaint.id,
      type: 'COMMENT_RECEIVED',
      title: `Update on ${complaint.publicId}`,
      body: 'A new comment was added.',
    });
  }
  return comment;
}

export async function verifyResolution(
  actor: Actor,
  complaintId: string,
  resolved: boolean,
  reason?: string,
) {
  if (actor.role !== 'CITIZEN') throw new ForbiddenError();
  const complaint = await loadAuthorizedComplaint(actor, complaintId);
  if (complaint.citizenId !== actor.id) throw new ForbiddenError();
  const to = resolved ? 'CLOSED' : 'REOPENED';
  return transitionStatus(actor, complaint.id, to, reason);
}

export async function listPublicIssues(page: number, pageSize: number) {
  const where = { deletedAt: null, status: { not: 'REJECTED' as const } };
  const [total, items] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      select: {
        publicId: true,
        status: true,
        priority: true,
        createdAt: true,
        latitude: true,
        longitude: true,
        category: { select: { name: true, code: true } },
        area: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    total,
    items: items.map((i) => ({
      ...i,
      latitude: Math.round(i.latitude * 1000) / 1000,
      longitude: Math.round(i.longitude * 1000) / 1000,
    })),
  };
}

export async function analyticsSummary() {
  const [total, open, resolved, reopened, duplicates] = await Promise.all([
    prisma.complaint.count({ where: { deletedAt: null } }),
    prisma.complaint.count({
      where: { deletedAt: null, status: { notIn: ['CLOSED', 'REJECTED'] } },
    }),
    prisma.complaint.count({ where: { deletedAt: null, status: 'CLOSED' } }),
    prisma.complaint.count({ where: { deletedAt: null, reopenedAt: { not: null } } }),
    prisma.duplicateCandidate.count(),
  ]);
  const byCategory = await prisma.complaint.groupBy({
    by: ['categoryId'],
    _count: { _all: true },
    where: { deletedAt: null },
  });
  const byPriority = await prisma.complaint.groupBy({
    by: ['priority'],
    _count: { _all: true },
    where: { deletedAt: null },
  });
  const byArea = await prisma.complaint.groupBy({
    by: ['areaId'],
    _count: { _all: true },
    where: { deletedAt: null },
  });
  const closed = await prisma.complaint.findMany({
    where: { deletedAt: null, closedAt: { not: null } },
    select: { createdAt: true, closedAt: true },
    take: 500,
  });
  const avgMs =
    closed.length === 0
      ? 0
      : closed.reduce((s, c) => s + (c.closedAt!.getTime() - c.createdAt.getTime()), 0) /
        closed.length;
  const slaBreached = await prisma.complaint.count({
    where: {
      deletedAt: null,
      slaDeadline: { lt: new Date() },
      status: { notIn: ['CLOSED', 'REJECTED'] },
    },
  });
  const slaTotal = await prisma.complaint.count({
    where: { deletedAt: null, slaDeadline: { not: null } },
  });
  return {
    total,
    open,
    resolved,
    reopened,
    duplicates,
    avgResolutionHours: avgMs / 36e5,
    slaCompliance:
      slaTotal === 0 ? 1 : Math.max(0, 1 - slaBreached / slaTotal),
    byCategory,
    byPriority,
    byArea,
  };
}

export type { User };
