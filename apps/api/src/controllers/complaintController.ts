import type { Request, Response } from 'express';
import {
  assignSchema,
  commentSchema,
  createComplaintSchema,
  completionSchema,
  paginationSchema,
  reviewSchema,
  statusChangeSchema,
  verifySchema,
} from '@civicfix/shared';
import type { Env } from '../config/env.js';
import { parseJson } from '../middleware/asyncHandler.js';
import {
  addComment,
  assignComplaint,
  createComplaint,
  findDuplicates,
  listComplaints,
  loadAuthorizedComplaint,
  presentComplaint,
  reviewCompletion,
  submitCompletion,
  transitionStatus,
  verifyResolution,
} from '../services/complaintService.js';
import { readMedia, saveComplaintMedia } from '../services/mediaService.js';
import { isMediaKindAllowed, parseMediaKind } from '../services/mediaPolicy.js';
import { ForbiddenError } from '../lib/errors.js';
import type { ComplaintStatus, Priority } from '@prisma/client';
import { createGeocoder } from '../geo/geocoder.js';

/** Express types path params as `string | string[]`; these routes only ever bind one segment. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return String(value);
}

export function complaintController(env: Env) {
  return {
    create: async (req: Request, res: Response) => {
      const body = parseJson(createComplaintSchema, req.body);
      const complaint = await createComplaint(env, req.user!, body);
      res.status(201).json({ complaint: presentComplaint(req.user!, complaint) });
    },
    list: async (req: Request, res: Response) => {
      const page = parseJson(paginationSchema, req.query);
      const result = await listComplaints(req.user!, {
        ...page,
        status: req.query.status as ComplaintStatus | undefined,
        priority: req.query.priority as Priority | undefined,
        q: req.query.q as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        areaId: req.query.areaId as string | undefined,
        assigned: req.query.assigned as string | undefined,
        sla: req.query.sla as string | undefined,
      });
      res.json({
        ...result,
        items: result.items.map((item) => presentComplaint(req.user!, item)),
      });
    },
    get: async (req: Request, res: Response) => {
      const complaint = await loadAuthorizedComplaint(req.user!, param(req, 'id'));
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    duplicates: async (req: Request, res: Response) => {
      const items = await findDuplicates(req.user!, param(req, 'id'));
      res.json({ items });
    },
    status: async (req: Request, res: Response) => {
      const body = parseJson(statusChangeSchema, req.body);
      const complaint = await transitionStatus(req.user!, param(req, 'id'), body.status, body.note);
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    assign: async (req: Request, res: Response) => {
      const body = parseJson(assignSchema, req.body);
      const complaint = await assignComplaint(req.user!, param(req, 'id'), body);
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    comment: async (req: Request, res: Response) => {
      const body = parseJson(commentSchema, req.body);
      const comment = await addComment(req.user!, param(req, 'id'), body.body, body.visibility);
      res.status(201).json({ comment });
    },
    verify: async (req: Request, res: Response) => {
      const body = parseJson(verifySchema, req.body);
      const complaint = await verifyResolution(req.user!, param(req, 'id'), body.resolved, body.reason);
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    completion: async (req: Request, res: Response) => {
      const body = parseJson(completionSchema, req.body);
      const complaint = await submitCompletion(req.user!, param(req, 'id'), body);
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    review: async (req: Request, res: Response) => {
      const body = parseJson(reviewSchema, req.body);
      const complaint = await reviewCompletion(env, req.user!, param(req, 'id'), body);
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    reopen: async (req: Request, res: Response) => {
      const complaint = await transitionStatus(
        req.user!,
        param(req, 'id'),
        'REOPENED',
        typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      );
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    resolve: async (req: Request, res: Response) => {
      const complaint = await transitionStatus(
        req.user!,
        param(req, 'id'),
        'RESOLVED',
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      );
      res.json({ complaint: presentComplaint(req.user!, complaint) });
    },
    upload: async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Image required' } });
        return;
      }
      const kind = parseMediaKind(req.body?.kind);
      if (!isMediaKindAllowed(req.user!.role, kind)) throw new ForbiddenError();
      const media = await saveComplaintMedia(env, req.user!, param(req, 'id'), file, kind);
      res.status(201).json({ media });
    },
    media: async (req: Request, res: Response) => {
      const { bytes, mimeType } = await readMedia(env, req.user!, param(req, 'mediaId'));
      res.setHeader('Content-Type', mimeType);
      res.send(bytes);
    },
    geocode: async (req: Request, res: Response) => {
      const q = String(req.query.q ?? '');
      const geo = createGeocoder(env);
      const results = q ? await geo.search(q) : [];
      res.json({ results });
    },
  };
}
