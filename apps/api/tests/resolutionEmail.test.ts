/**
 * Resolution email: built from real database values (never hardcoded), sent
 * exactly once, only after the officer approves the work — and audited when it
 * goes out. Rejection must send nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import {
  createMailer,
  resolutionMail,
  sendResolution,
  type MailMessage,
} from '../src/services/emailService.js';

loadDotEnv();
const suite = describe.runIf(Boolean(process.env.DATABASE_URL));

// 1x1 PNG with real magic bytes — the media pipeline validates them.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function recordingTransport() {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message: MailMessage) {
      sent.push(message);
    },
  };
}

async function login(app: Express, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('resolution mail content and delivery', () => {
  const input = {
    to: 'ajeet@test',
    citizenName: 'Ajeet Kr',
    publicId: 'CF-10310',
    title: 'Street light is not working in Jahangirpuri.',
    departmentName: 'Electrical Department',
  };

  it('is built entirely from the complaint data (no placeholders)', () => {
    const msg = resolutionMail(input);
    expect(msg.subject).toBe('CivicFix — Your Civic Complaint Has Been Resolved');
    expect(msg.to).toBe('ajeet@test');
    for (const value of ['Ajeet Kr', 'CF-10310', input.title, 'Electrical Department', 'Resolved']) {
      expect(msg.text).toContain(value);
    }
    expect(msg.text).not.toContain('{');
    expect(msg.text).not.toContain('undefined');
  });

  it('delivers exactly the built message', async () => {
    const spy = recordingTransport();
    const mailer = createMailer({ driver: 'console', from: 'noreply@test' }, spy);
    await sendResolution(mailer, input);
    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]).toMatchObject({ to: 'ajeet@test', subject: 'CivicFix — Your Civic Complaint Has Been Resolved' });
    expect(spy.sent[0].text).toContain('CF-10310');
  });

  it('never lets a mail transport failure break the approval path', async () => {
    const failing = createMailer({ driver: 'smtp', from: 'x', smtp: { host: 'h', port: 587 } }, {
      async send() {
        throw new Error('smtp connection refused');
      },
    });
    await expect(sendResolution(failing, input)).resolves.toBeUndefined();
  });
});

suite('resolution email end to end (exactly once, only on approval)', () => {
  let app: Express;
  let citizenToken: string;
  let officerToken: string;
  let workerToken: string;
  let publicId: string;
  let complaintId: string;
  let rahulUserId: string;

  const resolutionMailsSent = () =>
    prisma.auditLog.count({
      where: { action: 'complaint.resolution_email_sent', entityId: complaintId },
    });

  beforeAll(async () => {
    const env = loadEnv();
    app = createApp(env);
    citizenToken = await login(app, 'citizen@civicfix.demo');
    officerToken = await login(app, 'officer.lighting.jahangirpuri@civicfix.demo');
    workerToken = await login(app, 'worker.lighting.jahangirpuri-ward@civicfix.demo');
    rahulUserId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'worker.lighting.jahangirpuri-ward@civicfix.demo' } })
    ).id;

    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Street light is not working in Jahangirpuri.',
        description: 'The street light near the park gate has been out for three nights.',
        latitude: 28.72,
        longitude: 77.1,
        address: 'Jahangirpuri Ward, near the park gate',
      });
    expect(created.status).toBe(201);
    publicId = created.body.complaint.publicId;
    complaintId = created.body.complaint.id;

    expect(
      (
        await request(app)
          .post(`/api/complaints/${publicId}/assign`)
          .set('Authorization', `Bearer ${officerToken}`)
          .send({ workerId: rahulUserId, note: 'Fix the street light' })
      ).status,
    ).toBe(200);

    for (const status of ['ACCEPTED', 'IN_PROGRESS'] as const) {
      expect(
        (
          await request(app)
            .post(`/api/complaints/${publicId}/status`)
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ status })
        ).status,
      ).toBe(200);
    }

    expect(
      (
        await request(app)
          .post(`/api/complaints/${publicId}/media`)
          .set('Authorization', `Bearer ${workerToken}`)
          .attach('file', PNG, { filename: 'after.png', contentType: 'image/png' })
          .field('kind', 'AFTER')
      ).status,
    ).toBe(201);

    expect(
      (
        await request(app)
          .post(`/api/complaints/${publicId}/completion`)
          .set('Authorization', `Bearer ${workerToken}`)
          .send({ workCompleted: 'Repaired the wiring and replaced the bulb', completionNotes: 'Tested' })
      ).status,
    ).toBe(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sends nothing when the officer sends the work back', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'REJECT', reason: 'Cover is still cracked' });
    expect(res.status).toBe(200);
    expect(await resolutionMailsSent()).toBe(0);

    // Worker fixes it and resubmits, so there is work to approve again.
    expect(
      (
        await request(app)
          .post(`/api/complaints/${publicId}/completion`)
          .set('Authorization', `Bearer ${workerToken}`)
          .send({ workCompleted: 'Replaced the cracked cover and retested', completionNotes: 'Secure' })
      ).status,
    ).toBe(200);
  });

  it('sends the resolution email exactly once, only after approval', async () => {
    const approved = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'APPROVE', reason: 'Checked on site' });
    expect(approved.status).toBe(200);
    expect(approved.body.complaint.status).toBe('CITIZEN_VERIFICATION');

    expect(await resolutionMailsSent()).toBe(1);

    // The audit row records who got it — the address from the database.
    const row = await prisma.auditLog.findFirst({
      where: { action: 'complaint.resolution_email_sent', entityId: complaintId },
    });
    expect((row?.metadata as { to?: string } | null)?.to).toBe('citizen@civicfix.demo');

    // A retried approval cannot double-send (there is nothing left to approve).
    const again = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'APPROVE', reason: 'Checked on site' });
    expect(again.status).toBe(422);
    expect(await resolutionMailsSent()).toBe(1);
  });

  it('notifies the citizen to verify once the work is approved', async () => {
    const asked = await prisma.notification.findFirst({
      where: { complaintId, type: 'VERIFICATION_REQUIRED' },
    });
    expect(asked).toBeTruthy();
  });
});
