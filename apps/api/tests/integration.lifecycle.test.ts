import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const enabled = Boolean(process.env.DATABASE_URL) && process.env.RUN_API_INTEGRATION === '1';

async function login(app: ReturnType<typeof createApp>, email: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe.skipIf(!enabled)('complaint lifecycle integration', () => {
  const env = loadEnv();
  // Pin classification to the in-process mock so this suite measures our workflow
  // rather than a third-party model's latency or quota.
  env.AI_PROVIDER = 'mock';
  const app = createApp(env);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs the worker lifecycle and closes through citizen verification', async () => {
    const citizenToken = await login(app, 'citizen@civicfix.demo');
    const officerToken = await login(app, 'officer@civicfix.demo');
    const workerToken = await login(app, 'worker@civicfix.demo');

    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Garbage has not been collected for the last 5 days',
        description: 'Garbage has not been collected for the last 5 days.',
        latitude: 28.7196,
        longitude: 77.175,
        address: 'Adarsh Nagar, Delhi, near Domino\'s',
        priority: 'HIGH',
      });
    expect(created.status).toBe(201);
    const id = created.body.complaint.id as string;

    const assigned = await request(app)
      .post(`/api/complaints/${id}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ teamId: 'seed-sanitation-team', note: 'Please clear the pile' });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);

    for (const status of ['ACCEPTED', 'IN_PROGRESS'] as const) {
      const step = await request(app)
        .post(`/api/complaints/${id}/status`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ status, note: `moved to ${status}` });
      expect(step.status).toBe(200);
    }

    const resolved = await request(app)
      .post(`/api/complaints/${id}/status`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ status: 'RESOLVED', note: 'Cleared and swept' });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);

    // The assignment trail must move with the status trail.
    const assignment = await prisma.complaintAssignment.findFirst({
      where: { complaintId: id },
      orderBy: { createdAt: 'desc' },
    });
    expect(assignment?.status).toBe('COMPLETED');
    expect(assignment?.acceptedAt).toBeInstanceOf(Date);
    expect(assignment?.completedAt).toBeInstanceOf(Date);

    const verify = await request(app)
      .post(`/api/complaints/${id}/verify`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ resolved: true });
    expect(verify.status).toBe(200);
    expect(verify.body.complaint.status).toBe('CLOSED');
  });

  it('reopens when the citizen says the problem persists', async () => {
    const citizenToken = await login(app, 'citizen@civicfix.demo');
    const officerToken = await login(app, 'officer@civicfix.demo');
    const workerToken = await login(app, 'worker@civicfix.demo');

    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Garbage pile behind the community hall',
        description: 'Garbage has been rotting behind the hall for a week.',
        latitude: 28.72,
        longitude: 77.18,
        address: 'Adarsh Nagar, Delhi, behind the community hall',
      });
    expect(created.status).toBe(201);
    const id = created.body.complaint.id as string;

    const assigned2 = await request(app)
      .post(`/api/complaints/${id}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ teamId: 'seed-sanitation-team' });
    expect(assigned2.status, JSON.stringify(assigned2.body)).toBe(200);

    for (const status of ['ACCEPTED', 'IN_PROGRESS'] as const) {
      const step = await request(app)
        .post(`/api/complaints/${id}/status`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ status, note: `moved to ${status}` });
      expect(step.status, JSON.stringify(step.body)).toBe(200);
    }

    const resolved = await request(app)
      .post(`/api/complaints/${id}/status`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ status: 'RESOLVED', note: 'Patch laid' });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);

    const verify = await request(app)
      .post(`/api/complaints/${id}/verify`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ resolved: false, reason: 'The hole is still there' });
    expect(verify.status).toBe(200);
    expect(verify.body.complaint.status).toBe('REOPENED');

    const reopened = await request(app)
      .post(`/api/complaints/${id}/status`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.complaint.status).toBe('UNDER_REVIEW');
  });

  it('never hands a citizen internal data', async () => {
    const citizenToken = await login(app, 'citizen@civicfix.demo');

    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Streetlight out near the park',
        description: 'The lamp has been dark for a week.',
        latitude: 28.73,
        longitude: 77.19,
        address: 'Adarsh Nagar, Delhi, near the park',
      });
    expect(created.status).toBe(201);
    const id = created.body.complaint.id as string;

    const fetched = await request(app)
      .get(`/api/complaints/${id}`)
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(fetched.status).toBe(200);

    const complaint = fetched.body.complaint;
    expect(complaint).not.toHaveProperty('escalations');
    for (const analysis of complaint.aiAnalyses ?? []) {
      expect(analysis).not.toHaveProperty('rawOutput');
      expect(analysis).not.toHaveProperty('inputHash');
    }
    for (const assignment of complaint.assignments ?? []) {
      expect(assignment).not.toHaveProperty('note');
      expect(assignment).not.toHaveProperty('assignedById');
    }
  });

  it('enters ROUTING_PENDING instead of inventing an authority', async () => {
    const citizenToken = await login(app, 'citizen@civicfix.demo');

    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Broken bench in the park',
        description: 'The park bench has splintered and is unsafe to sit on.',
        latitude: 28.73,
        longitude: 77.19,
        address: 'Adarsh Nagar, Delhi, near the park',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    // Spec §9: with no responsibility mapping we must not name anyone responsible.
    const complaint = created.body.complaint;
    expect(complaint.status).toBe('ROUTING_PENDING');
    expect(complaint.departmentId ?? null).toBeNull();
    expect(complaint.assignedOfficer ?? null).toBeNull();
    expect(complaint.assignments ?? []).toHaveLength(0);
  });
});
