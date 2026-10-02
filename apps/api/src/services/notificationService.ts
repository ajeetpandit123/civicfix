import { prisma } from '../lib/prisma.js';
import type { NotificationType } from '@prisma/client';
import type { Env } from '../config/env.js';
import { createMailer } from './emailService.js';

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
  const mailer = createMailer({
    driver: env.EMAIL_DRIVER,
    from: env.SMTP_FROM,
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: env.SMTP_PORT ?? 587, user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
  await mailer.send({ to, subject, text });
}
