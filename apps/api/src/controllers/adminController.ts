import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../services/authService.js';
import { parseJson } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import { analyticsSummary } from '../services/complaintService.js';
import { routeComplaint } from '../services/routingService.js';

const departmentSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

const jurisdictionSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  description: z.string().max(500).optional(),
  isDemo: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const areaSchema = z.object({
  jurisdictionId: z.string().cuid(),
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  minLat: z.number(),
  maxLat: z.number(),
  minLng: z.number(),
  maxLng: z.number(),
  isActive: z.boolean().optional(),
});

const mappingSchema = z.object({
  areaId: z.string().cuid(),
  categoryId: z.string().cuid(),
  departmentId: z.string().cuid(),
  defaultOfficerId: z.string().cuid().optional(),
  defaultTeamId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
});

const slaSchema = z.object({
  name: z.string().min(2).max(120),
  categoryId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  responseHours: z.number().int().min(1).max(24 * 30),
  resolutionHours: z.number().int().min(1).max(24 * 90),
});

const userPatchSchema = z.object({
  role: z.enum(['CITIZEN', 'FIELD_WORKER', 'OFFICER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'PENDING_VERIFICATION']).optional(),
});

export function adminController() {
  return {
    users: async (req: Request, res: Response) => {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json({ users });
    },
    patchUser: async (req: Request, res: Response) => {
      const body = parseJson(userPatchSchema, req.body);
      const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: body });
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
      });
    },
    departments: async (_req: Request, res: Response) => {
      res.json({ departments: await prisma.department.findMany({ where: { deletedAt: null } }) });
    },
    createDepartment: async (req: Request, res: Response) => {
      const body = parseJson(departmentSchema, req.body);
      const department = await prisma.department.create({ data: body });
      res.status(201).json({ department });
    },
    patchDepartment: async (req: Request, res: Response) => {
      const body = parseJson(departmentSchema.partial(), req.body);
      const department = await prisma.department.update({
        where: { id: String(req.params.id) },
        data: body,
      });
      res.json({ department });
    },
    jurisdictions: async (_req: Request, res: Response) => {
      res.json({ jurisdictions: await prisma.jurisdiction.findMany({ where: { deletedAt: null } }) });
    },
    createJurisdiction: async (req: Request, res: Response) => {
      const body = parseJson(jurisdictionSchema, req.body);
      const jurisdiction = await prisma.jurisdiction.create({ data: body });
      res.status(201).json({ jurisdiction });
    },
    areas: async (_req: Request, res: Response) => {
      res.json({
        areas: await prisma.area.findMany({ where: { deletedAt: null }, include: { jurisdiction: true } }),
      });
    },
    createArea: async (req: Request, res: Response) => {
      const body = parseJson(areaSchema, req.body);
      const area = await prisma.area.create({ data: body });
      res.status(201).json({ area });
    },
    teams: async (_req: Request, res: Response) => {
      res.json({
        teams: await prisma.fieldTeam.findMany({
          where: { deletedAt: null },
          include: { department: true, area: true, members: true },
        }),
      });
    },
    createTeam: async (req: Request, res: Response) => {
      const body = parseJson(
        z.object({
          name: z.string().min(2),
          departmentId: z.string().cuid(),
          areaId: z.string().cuid().optional(),
        }),
        req.body,
      );
      const team = await prisma.fieldTeam.create({ data: body });
      res.status(201).json({ team });
    },
    officers: async (_req: Request, res: Response) => {
      res.json({
        officers: await prisma.officerProfile.findMany({
          include: { user: { select: { id: true, name: true, email: true } }, department: true, jurisdiction: true },
        }),
      });
    },
    createOfficer: async (req: Request, res: Response) => {
      const body = parseJson(
        z.object({
          email: z.string().email(),
          name: z.string().min(2),
          password: z.string().min(10),
          departmentId: z.string().cuid(),
          jurisdictionId: z.string().cuid(),
          title: z.string().optional(),
        }),
        req.body,
      );
      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash,
          role: 'OFFICER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          officerProfile: {
            create: {
              departmentId: body.departmentId,
              jurisdictionId: body.jurisdictionId,
              title: body.title,
            },
          },
        },
      });
      res.status(201).json({ user: { id: user.id, email: user.email } });
    },
    mappings: async (_req: Request, res: Response) => {
      res.json({
        mappings: await prisma.responsibilityMapping.findMany({
          include: { area: true, category: true, department: true, defaultTeam: true },
        }),
      });
    },
    createMapping: async (req: Request, res: Response) => {
      const body = parseJson(mappingSchema, req.body);
      const mapping = await prisma.responsibilityMapping.create({ data: body });
      res.status(201).json({ mapping });
    },
    sla: async (_req: Request, res: Response) => {
      res.json({ policies: await prisma.slaPolicy.findMany() });
    },
    createSla: async (req: Request, res: Response) => {
      const body = parseJson(slaSchema, req.body);
      const policy = await prisma.slaPolicy.create({ data: body });
      res.status(201).json({ policy });
    },
    categories: async (_req: Request, res: Response) => {
      res.json({
        categories: await prisma.complaintCategory.findMany({ include: { subcategories: true } }),
      });
    },
    audit: async (_req: Request, res: Response) => {
      res.json({
        logs: await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      });
    },
    analytics: async (_req: Request, res: Response) => {
      res.json(await analyticsSummary());
    },
    testRoute: async (req: Request, res: Response) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const categoryId = String(req.query.categoryId ?? '');
      res.json(await routeComplaint({ latitude: lat, longitude: lng, categoryId: categoryId || undefined }));
    },
  };
}
