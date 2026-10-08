import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import type { Env } from '../config/env.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { checksum, createStorage } from '../storage/objectStorage.js';
import { loadAuthorizedComplaint, type Actor } from './complaintService.js';
import type { MediaKind } from '@prisma/client';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export async function saveComplaintMedia(
  env: Env,
  actor: Actor,
  complaintId: string,
  file: { buffer: Buffer; originalname: string; size: number },
  kind: MediaKind,
) {
  if (file.size > MAX_BYTES) throw new ValidationError('Image must be 5MB or smaller');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED.has(detected.mime)) {
    throw new ValidationError('Only JPEG, PNG, and WebP images are allowed');
  }

  const complaint = await loadAuthorizedComplaint(actor, complaintId);
  if (actor.role === 'CITIZEN' && complaint.citizenId !== actor.id) throw new ForbiddenError();

  const processed = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const key = `complaints/${complaint.id}/${Date.now()}-${kind}.jpg`;
  const storage = createStorage(env);
  await storage.put(key, processed, 'image/jpeg');

  return prisma.complaintMedia.create({
    data: {
      complaintId: complaint.id,
      uploadedById: actor.id,
      kind,
      storageKey: key,
      mimeType: 'image/jpeg',
      byteSize: processed.length,
      checksum: checksum(processed),
    },
  });
}

export async function readMedia(env: Env, actor: Actor, mediaId: string) {
  const media = await prisma.complaintMedia.findUnique({ where: { id: mediaId } });
  if (!media) throw new ValidationError('Media not found');
  await loadAuthorizedComplaint(actor, media.complaintId);
  const storage = createStorage(env);
  const bytes = await storage.get(media.storageKey);
  return { bytes, mimeType: media.mimeType };
}
