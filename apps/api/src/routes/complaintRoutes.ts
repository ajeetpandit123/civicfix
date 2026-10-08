import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';
import { complaintController } from '../controllers/complaintController.js';
import { prisma } from '../lib/prisma.js';
import { listPublicIssues } from '../services/complaintService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export function complaintRouter(env: Env): Router {
  const r = Router();
  const c = complaintController(env);
  const auth = authMiddleware(env);

  r.get(
    '/public',
    asyncHandler(async (req, res) => {
      const page = Number(req.query.page ?? 1);
      const pageSize = Math.min(100, Number(req.query.pageSize ?? 50));
      res.json(await listPublicIssues(page, pageSize));
    }),
  );

  r.get(
    '/meta/categories',
    asyncHandler(async (_req, res) => {
      res.json({
        categories: await prisma.complaintCategory.findMany({
          where: { isActive: true },
          include: { subcategories: true },
        }),
      });
    }),
  );

  r.use(auth);
  r.get('/', asyncHandler(c.list));
  r.post('/', requireRoles('CITIZEN', 'ADMIN'), asyncHandler(c.create));
  r.get('/geocode', asyncHandler(c.geocode));
  r.get('/:id', asyncHandler(c.get));
  r.get('/:id/duplicates', asyncHandler(c.duplicates));
  r.post('/:id/status', asyncHandler(c.status));
  r.post('/:id/assign', requireRoles('OFFICER', 'ADMIN'), asyncHandler(c.assign));
  // Field worker's work report + proof (the only worker path to RESOLVED).
  r.post('/:id/completion', requireRoles('FIELD_WORKER'), asyncHandler(c.completion));
  // Officer approves the report or sends the work back (reason required).
  r.post('/:id/review', requireRoles('OFFICER', 'ADMIN'), asyncHandler(c.review));
  r.post('/:id/comments', asyncHandler(c.comment));
  r.post('/:id/verify', requireRoles('CITIZEN'), asyncHandler(c.verify));
  r.post('/:id/reopen', asyncHandler(c.reopen));
  r.post('/:id/resolve', asyncHandler(c.resolve));
  r.post('/:id/media', upload.single('file'), asyncHandler(c.upload));
  r.get('/:id/media/:mediaId', asyncHandler(c.media));
  return r;
}
