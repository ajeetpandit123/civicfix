import { Router } from 'express';
import type { Env } from '../config/env.js';
import { asyncHandler, parseJson } from '../middleware/asyncHandler.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';
import { adminController } from '../controllers/adminController.js';
import { prisma } from '../lib/prisma.js';
import { staffRejectSchema } from '@civicfix/shared';
import { writeAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import { ValidationError } from '../lib/errors.js';

export function adminRouter(env: Env): Router {
  const r = Router();
  const c = adminController();
  r.use(authMiddleware(env), requireRoles('ADMIN'));
  r.get('/users', asyncHandler(c.users));
  // --- staff verification requests (§20): pending accounts, admin verdicts ---
  r.get(
    '/staff-requests',
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        where: { status: 'PENDING_VERIFICATION', role: { in: ['OFFICER', 'FIELD_WORKER'] }, deletedAt: null },
        include: { officerProfile: true, workerProfile: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json({
        requests: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          requestedRole: u.role,
          phone: u.phone ?? null,
          employeeId: u.officerProfile?.employeeId ?? u.workerProfile?.employeeId ?? null,
          designation: u.officerProfile?.designation ?? u.workerProfile?.designation ?? null,
          organization: u.officerProfile?.organization ?? u.workerProfile?.organization ?? null,
          departmentId: u.officerProfile?.departmentId ?? null,
          jurisdictionId: u.officerProfile?.jurisdictionId ?? null,
          teamId: u.workerProfile?.teamId ?? null,
          officeLocation: u.officerProfile?.officeLocation ?? null,
          createdAt: u.createdAt,
        })),
      });
    }),
  );
  r.post(
    '/staff-requests/:id/approve',
    asyncHandler(async (req, res) => {
      const target = await prisma.user.findFirst({ where: { id: String(req.params.id), deletedAt: null } });
      if (!target) throw new ValidationError(`Unknown user: ${req.params.id}`);
      if (target.status !== 'PENDING_VERIFICATION') throw new ValidationError('That request has already been decided');
      await prisma.user.update({ where: { id: target.id }, data: { status: 'ACTIVE' } });
      await writeAudit({
        actorId: req.user!.id,
        action: 'staff.approved',
        entityType: 'User',
        entityId: target.id,
        metadata: { role: target.role },
      });
      await notify({
        userId: target.id,
        type: 'STATUS_CHANGED',
        title: 'Staff account approved',
        body: 'Your CivicFix staff account is now active.',
      });
      res.json({ ok: true });
    }),
  );
  r.post(
    '/staff-requests/:id/reject',
    asyncHandler(async (req, res) => {
      // Rejecting is permanent and must say why (the schema enforces a reason).
      const body = parseJson(staffRejectSchema, req.body);
      const target = await prisma.user.findFirst({ where: { id: String(req.params.id), deletedAt: null } });
      if (!target) throw new ValidationError(`Unknown user: ${req.params.id}`);
      if (target.status !== 'PENDING_VERIFICATION') throw new ValidationError('That request has already been decided');
      await prisma.user.update({ where: { id: target.id }, data: { status: 'DISABLED' } });
      await writeAudit({
        actorId: req.user!.id,
        action: 'staff.rejected',
        entityType: 'User',
        entityId: target.id,
        metadata: { reason: body.reason },
      });
      await notify({
        userId: target.id,
        type: 'STATUS_CHANGED',
        title: 'Staff account request rejected',
        body: body.reason,
      });
      res.json({ ok: true });
    }),
  );
  r.patch('/users/:id', asyncHandler(c.patchUser));
  r.get('/departments', asyncHandler(c.departments));
  r.post('/departments', asyncHandler(c.createDepartment));
  r.patch('/departments/:id', asyncHandler(c.patchDepartment));
  r.get('/jurisdictions', asyncHandler(c.jurisdictions));
  r.post('/jurisdictions', asyncHandler(c.createJurisdiction));
  r.get('/areas', asyncHandler(c.areas));
  r.post('/areas', asyncHandler(c.createArea));
  r.get('/teams', asyncHandler(c.teams));
  r.post('/teams', asyncHandler(c.createTeam));
  r.get('/officers', asyncHandler(c.officers));
  r.post('/officers', asyncHandler(c.createOfficer));
  r.get('/responsibility-mappings', asyncHandler(c.mappings));
  r.post('/responsibility-mappings', asyncHandler(c.createMapping));
  r.get('/sla-policies', asyncHandler(c.sla));
  r.post('/sla-policies', asyncHandler(c.createSla));
  r.get('/categories', asyncHandler(c.categories));
  r.get('/audit-logs', asyncHandler(c.audit));
  r.get('/analytics', asyncHandler(c.analytics));
  r.get('/routing-preview', asyncHandler(c.testRoute));
  return r;
}

export function catalogRouter(env: Env): Router {
  const r = Router();
  r.use(authMiddleware(env));
  // Field workers the officer can put on a job: active accounts in the officer's
  // own department (or the department asked for). Powers the assign-worker pick.
  r.get(
    '/field-workers',
    requireRoles('OFFICER', 'ADMIN'),
    asyncHandler(async (req, res) => {
      const profile =
        req.user!.role === 'OFFICER'
          ? await prisma.officerProfile.findUnique({ where: { userId: req.user!.id } })
          : null;
      const departmentId =
        typeof req.query.departmentId === 'string' && req.query.departmentId
          ? req.query.departmentId
          : profile?.departmentId;
      const teamId = typeof req.query.teamId === 'string' && req.query.teamId ? req.query.teamId : undefined;
      const workers = await prisma.fieldWorkerProfile.findMany({
        where: {
          isActive: true,
          user: { role: 'FIELD_WORKER', status: 'ACTIVE', deletedAt: null },
          ...(departmentId ? { team: { departmentId } } : {}),
          ...(teamId ? { teamId } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true, areaId: true } },
        },
        orderBy: { user: { name: 'asc' } },
      });
      res.json({
        workers: workers.map((w) => ({
          id: w.user.id,
          name: w.user.name,
          email: w.user.email,
          employeeId: w.employeeId,
          designation: w.designation,
          teamId: w.teamId,
          teamName: w.team?.name ?? null,
        })),
      });
    }),
  );
  r.get(
    '/departments',
    asyncHandler(async (_req, res) => {
      res.json({ departments: await prisma.department.findMany({ where: { isActive: true, deletedAt: null } }) });
    }),
  );
  r.get(
    '/jurisdictions',
    asyncHandler(async (_req, res) => {
      res.json({ jurisdictions: await prisma.jurisdiction.findMany({ where: { isActive: true, deletedAt: null } }) });
    }),
  );
  r.get(
    '/areas',
    asyncHandler(async (_req, res) => {
      res.json({ areas: await prisma.area.findMany({ where: { isActive: true, deletedAt: null } }) });
    }),
  );
  r.get(
    '/teams',
    asyncHandler(async (req, res) => {
      if (req.user!.role === 'CITIZEN') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        return;
      }
      res.json({
        teams: await prisma.fieldTeam.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true, departmentId: true, areaId: true },
        }),
      });
    }),
  );
  r.get(
    '/notifications',
    asyncHandler(async (req, res) => {
      const items = await prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ items });
    }),
  );
  r.post(
    '/notifications/:id/read',
    asyncHandler(async (req, res) => {
      await prisma.notification.updateMany({
        where: { id: String(req.params.id), userId: req.user!.id },
        data: { readAt: new Date() },
      });
      res.status(204).send();
    }),
  );
  return r;
}
