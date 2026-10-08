import { Router } from 'express';
import type { Env } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';
import { adminController } from '../controllers/adminController.js';
import { prisma } from '../lib/prisma.js';

export function adminRouter(env: Env): Router {
  const r = Router();
  const c = adminController();
  r.use(authMiddleware(env), requireRoles('ADMIN'));
  r.get('/users', asyncHandler(c.users));
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
