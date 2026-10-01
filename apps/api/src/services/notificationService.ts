import { prisma } from '../lib/prisma.js';
import type { NotificationType } from '@prisma/client';
import { logger } from '../lib/logger.js';
import type { Env } from '../config/env.js';

export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  complaintId?: string;
}): Promise<void> {
  await prisma.notification.create({ data: input });
}

export async function notifyMany(
  userIds: string[],
  payload: Omit<Parameters<typeof notify>[0], 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((userId) => notify({ ...payload, userId })));
}

export async function deliverEmail(env: Env, to: string, subject: string, text: string): Promise<void> {
  if (env.EMAIL_DRIVER === 'console') {
    logger.info({ to, subject }, 'email_console');
    return;
  }
  logger.info({ to, subject, textLength: text.length }, 'email_smtp_not_fully_configured');
}
