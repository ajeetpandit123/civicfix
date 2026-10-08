/**
 * Officer queue + field-worker assignment (persisted).
 *
 * Covers the workflow's "officer receives complaint -> officer assigns a field
 * worker" steps: a routed complaint reaches the responsible officer's queue and
 * no other officer's; the officer can name an individual field worker, stored on
 * ComplaintAssignment; and the job reaches that worker (and only their crew).
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

async function login(app: Express, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

suite('officer queue + field-worker assignment', () => {
  let app: Express;
  let citizenToken: string;
  let officerToken: string;
  let otherOfficerToken: string;
  let workerToken: string;
  let otherWorkerToken: string;
  let publicId: string;
  let complaintId: string;
  let rahulUserId: string;
  let roadsWorkerUserId: string;

  beforeAll(async () => {
    const env = loadEnv();
    app = createApp(env);
    citizenToken = await login(app, 'citizen@civicfix.demo');
    officerToken = await login(app, 'officer.lighting.jahangirpuri@civicfix.demo');
    otherOfficerToken = await login(app, 'officer.lighting.model-town@civicfix.demo');
    workerToken = await login(app, 'worker.lighting.jahangirpuri-ward@civicfix.demo');
    otherWorkerToken = await login(app, 'worker.roads.model-town-ward@civicfix.demo');

    rahulUserId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'worker.lighting.jahangirpuri-ward@civicfix.demo' } })
    ).id;
    roadsWorkerUserId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'worker.roads.model-town-ward@civicfix.demo' } })
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shows the routed complaint in the responsible officer queue', async () => {
    const res = await request(app).get('/api/complaints').set('Authorization', `Bearer ${officerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((c: { publicId: string }) => c.publicId === publicId)).toBe(true);
  });

  it('keeps it out of another officer queue (different jurisdiction)', async () => {
    const res = await request(app).get('/api/complaints').set('Authorization', `Bearer ${otherOfficerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((c: { publicId: string }) => c.publicId === publicId)).toBe(false);
  });

  it('lists eligible field workers for the officer picker', async () => {
    const res = await request(app).get('/api/field-workers').set('Authorization', `Bearer ${officerToken}`);
    expect(res.status).toBe(200);
    const rahul = res.body.workers.find((w: { employeeId: string }) => w.employeeId === 'EL-1023');
    expect(rahul?.name).toBe('Rahul Kumar');
    expect(rahul?.teamId).toBeTruthy();
  });

  it('stores the individual field-worker assignment in the database', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ workerId: rahulUserId, note: 'Please fix the street light.' });
    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe('ASSIGNED');

    const row = await prisma.complaintAssignment.findFirst({
      where: { complaintId, workerId: rahulUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    expect(row?.status).toBe('PENDING');
    expect(row?.assignedById).toBeTruthy();
    expect(row?.teamId).toBeTruthy();

    const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
    expect(complaint?.status).toBe('ASSIGNED');
    expect(complaint?.assignedTeamId).toBe(row?.teamId);
    expect(complaint?.assignedOfficerId).toBeTruthy();
  });

  it("puts the job in the named worker's list — and in no unrelated worker's", async () => {
    const mine = await request(app).get('/api/complaints').set('Authorization', `Bearer ${workerToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items.some((c: { publicId: string }) => c.publicId === publicId)).toBe(true);

    const theirs = await request(app).get('/api/complaints').set('Authorization', `Bearer ${otherWorkerToken}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.items.some((c: { publicId: string }) => c.publicId === publicId)).toBe(false);
  });

  it('refuses assignment from citizens and field workers', async () => {
    const citizen = await request(app)
      .post(`/api/complaints/${publicId}/assign`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ workerId: rahulUserId });
    expect(citizen.status).toBe(403);

    const worker = await request(app)
      .post(`/api/complaints/${publicId}/assign`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ workerId: rahulUserId });
    expect(worker.status).toBe(403);
  });

  it('refuses a field worker from the wrong department', async () => {
    const res = await request(app)
      .post(`/api/complaints/${publicId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ workerId: roadsWorkerUserId });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/department/i);
  });
});
