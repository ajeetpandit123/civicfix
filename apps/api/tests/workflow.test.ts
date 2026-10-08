/**
 * Field-worker completion report + officer review (approve / send back).
 *
 * The mandated sequence:
 *   worker fixes -> uploads proof -> submits the work report (-> RESOLVED,
 *   awaiting officer review) -> officer APPROVES (-> citizen verification) or
 *   REJECTS WITH A REASON (-> back to the worker, who fixes and resubmits).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

loadDotEnv();
const suite = describe.runIf(Boolean(process.env.DATABASE_URL));

// 1x1 PNG with real magic bytes — the media pipeline validates them.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(app: Express, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

suite('completion report + officer review', () => {
  let app: Express;
  let citizenToken: string;
  let officerToken: string;
  let workerToken: string;
  let outsiderWorkerToken: string;
  let publicId: string;
  let complaintId: string;
  let rahulUserId: string;

  beforeAll(async () => {
    const env = loadEnv();
    app = createApp(env);
    citizenToken = await login(app, 'citizen@civicfix.demo');
    officerToken = await login(app, 'officer.lighting.jahangirpuri@civicfix.demo');
    workerToken = await login(app, 'worker.lighting.jahangirpuri-ward@civicfix.demo');
    outsiderWorkerToken = await login(app, 'worker.roads.model-town-ward@civicfix.demo');
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

    const assigned = await request(app)
      .post(`/api/complaints/${publicId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ workerId: rahulUserId, note: 'Fix the street light' });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);

    for (const status of ['ACCEPTED', 'IN_PROGRESS'] as const) {
      const step = await request(app)
        .post(`/api/complaints/${publicId}/status`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ status });
      expect(step.status, JSON.stringify(step.body)).toBe(200);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses the old skip-the-report path (worker /status RESOLVED)', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/status`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ status: 'RESOLVED' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/completion report/i);
  });

  it('refuses a completion report without proof of work', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/completion`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ workCompleted: 'Repaired the wiring and replaced the bulb' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/AFTER photo/i);
  });

  it('records the work report + proof and holds it for officer review', async () => {
    const proof = await request(app)
      .post(`/api/complaints/${publicId}/media`)
      .set('Authorization', `Bearer ${workerToken}`)
      .attach('file', PNG, { filename: 'after.png', contentType: 'image/png' })
      .field('kind', 'AFTER');
    expect(proof.status, JSON.stringify(proof.body)).toBe(201);

    const res = await request(app)
      .post(`/api/complaints/${publicId}/completion`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        workCompleted: 'Repaired the wiring and replaced the damaged bulb',
        completionNotes: 'Light tested successfully',
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.complaint.status).toBe('RESOLVED');

    const row = await prisma.complaintAssignment.findFirst({
      where: { complaintId, workerId: rahulUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.workCompleted).toContain('Repaired the wiring');
    expect(row?.completionNotes).toBe('Light tested successfully');
    expect(row?.submittedAt).toBeTruthy();

    // The responsible officer is asked to review (workflow notification).
    const asked = await prisma.notification.findFirst({
      where: { complaintId, type: 'RESOLUTION_SUBMITTED' },
    });
    expect(asked).toBeTruthy();
  });

  it('refuses rejection without a reason', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'REJECT' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/reason/i);
  });

  it('sends rejected work back to the field worker with the reason', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'REJECT', reason: 'Bulb cover is still cracked — replace it' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.complaint.status).toBe('IN_PROGRESS');

    const row = await prisma.complaintAssignment.findFirst({
      where: { complaintId, workerId: rahulUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.reviewDecision).toBe('REJECTED');
    expect(row?.reviewNote).toContain('Bulb cover');
    expect(row?.status).toBe('ACCEPTED');

    // The worker holds the job again and is told why.
    const mine = await request(app).get('/api/complaints').set('Authorization', `Bearer ${workerToken}`);
    expect(mine.body.items.some((c: { publicId: string }) => c.publicId === publicId)).toBe(true);
    const told = await prisma.notification.findFirst({
      where: { complaintId, type: 'COMPLAINT_REVIEWED', userId: rahulUserId },
    });
    expect(told).toBeTruthy();
  });

  it('accepts the worker resubmission and clears the old verdict', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/completion`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ workCompleted: 'Replaced the cracked cover and retested', completionNotes: 'Cover secure' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.complaint.status).toBe('RESOLVED');

    const row = await prisma.complaintAssignment.findFirst({
      where: { complaintId, workerId: rahulUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.reviewDecision).toBeNull();
    expect(row?.workCompleted).toContain('cracked cover');
  });

  it('resolves the complaint when the officer approves', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'APPROVE', reason: 'Checked on site' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.complaint.status).toBe('CITIZEN_VERIFICATION');

    const row = await prisma.complaintAssignment.findFirst({
      where: { complaintId, workerId: rahulUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.reviewDecision).toBe('APPROVED');

    const asked = await prisma.notification.findFirst({
      where: { complaintId, type: 'VERIFICATION_REQUIRED' },
    });
    expect(asked).toBeTruthy();

    const verified = await request(app)
      .post(`/api/complaints/${publicId}/verify`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ resolved: true });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body.complaint.status).toBe('CLOSED');
  });

  it('keeps review and completion away from the wrong roles', async () => {
    const workerReview = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ decision: 'APPROVE' });
    expect(workerReview.status).toBe(403);

    const outsiderCompletion = await request(app)
      .post(`/api/complaints/${publicId}/completion`)
      .set('Authorization', `Bearer ${outsiderWorkerToken}`)
      .send({ workCompleted: 'Not my job to report on this one' });
    expect(outsiderCompletion.status).toBe(403);

    const officerCompletion = await request(app)
      .post(`/api/complaints/${publicId}/completion`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ workCompleted: 'Officers do not submit worker reports' });
    expect(officerCompletion.status).toBe(403);

    const citizenReview = await request(app)
      .post(`/api/complaints/${publicId}/review`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ decision: 'APPROVE' });
    expect(citizenReview.status).toBe(403);
  });
});
