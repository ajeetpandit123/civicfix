import { z } from 'zod';
import { COMPLAINT_STATUSES, PRIORITIES, ROLES } from './constants.js';

export const emailSchema = z.string().trim().email().max(255);
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[0-9]/, 'Password needs a number');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const coordinateSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});

export const createComplaintSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
  categoryId: z.string().cuid().optional(),
  subcategoryId: z.string().cuid().optional(),
  priority: z.enum(PRIORITIES).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  address: z.string().trim().min(3).max(500),
  landmark: z.string().trim().max(200).optional(),
  attachToComplaintId: z.string().cuid().optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  note: z.string().trim().max(2000).optional(),
});

export const assignSchema = z.object({
  // Reference ids, not formats: the foreign key is the real integrity check, and
  // seeded ids are human-readable rather than CUIDs.
  officerId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(['PUBLIC', 'INTERNAL']).default('PUBLIC'),
});

export const verifySchema = z.object({
  resolved: z.boolean(),
  reason: z.string().trim().max(2000).optional(),
});

export const MEDIA_KINDS = ['EVIDENCE', 'BEFORE', 'AFTER', 'RESOLUTION', 'REOPEN'] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKindValue = z.infer<typeof mediaKindSchema>;

export const aiClassificationSchema = z.object({
  category: z.string().min(1).max(80),
  subcategory: z.string().min(1).max(80).optional(),
  severity: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(500),
  suggested_department: z.string().max(80).optional(),
  possible_hazards: z.array(z.string().max(80)).max(20).default([]),
  duplicate_search_terms: z.array(z.string().max(80)).max(20).optional(),
});

export type AiClassification = z.infer<typeof aiClassificationSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const roleSchema = z.enum(ROLES);
