/**
 * Staff registration, PENDING_VERIFICATION gating and admin approval.
 *
 * Security contract (§17/§21/§22): a public signup can never grant itself a
 * government role — public registration is CITIZEN-only, staff signup can only
 * REQUEST officer/field-worker and gets NO permissions until an admin approves,
 * and approval/rejection is admin-only with a mandatory rejection reason.
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

const stamp = Date.now();

async function login(app: Express, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('role escalation is impossible from public input', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp(loadEnv());
  });

  it('ignores a role field on public registration (always CITIZEN)', async () => {
    const email = `escalation-${stamp}@example.test`;
    const res = await request(app).post('/api/auth/register').send({
      email,
      password: 'Str0ngPassw0rd!',
      name: 'Escalation Attempt',
      role: 'ADMIN',
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe('CITIZEN');
  });

  it('refuses to even request the ADMIN role through staff registration', async () => {
    const res = await request(app).post('/api/auth/register-staff').send({
      role: 'ADMIN',
      name: 'Sneaky Admin',
      email: `sneaky-${stamp}@example.test`,
      password: 'Str0ngPassw0rd!',
      employeeId: 'X-1',
      departmentId: 'LIGHTING',
      jurisdictionId: 'JAHANGIRPURI',
    });
    expect(res.status).toBe(422);
  });
});

suite('staff registration -> PENDING_VERIFICATION -> admin approval', () => {
  let app: Express;
  let adminToken: string;
  let citizenToken: string;
  let officerEmail: string;
  let workerEmail: string;
  let officerUserId: string;
  let workerUserId: string;
  let departmentId: string;
  let jurisdictionId: string;
  let teamId: string;

  beforeAll(async () => {
    const env = loadEnv();
    app = createApp(env);
    adminToken = await login(app, 'admin@civicfix.demo');
    citizenToken = await login(app, 'citizen@civicfix.demo');

    const department = await prisma.department.findFirstOrThrow({ where: { code: 'LIGHTING' } });
    const jurisdiction = await prisma.jurisdiction.findFirstOrThrow({ where: { code: 'JAHANGIRPURI' } });
    const team = await prisma.fieldTeam.findFirstOrThrow({
      where: { departmentId: department.id, area: { jurisdictionId: jurisdiction.id } },
    });
    departmentId = department.id;
    jurisdictionId = jurisdiction.id;
    teamId = team.id;

    officerEmail = `pending-officer-${stamp}@example.test`;
    workerEmail = `pending-worker-${stamp}@example.test`;

    const officer = await request(app).post('/api/auth/register-staff').send({
      role: 'OFFICER',
      name: 'Neha Verma',
      email: officerEmail,
      password: 'Str0ngPassw0rd!',
      phone: '555-0100',
      employeeId: 'ELEC-901',
      designation: 'Municipal Officer',
      organization: 'Municipal Corporation',
      departmentId,
      jurisdictionId,
      officeLocation: 'Jahangirpuri Zonal Office',
    });
    expect(officer.status).toBe(201);

    const worker = await request(app).post('/api/auth/register-staff').send({
      role: 'FIELD_WORKER',
      name: 'Anil Kumar',
      email: workerEmail,
      password: 'Str0ngPassw0rd!',
      employeeId: 'EL-9101',
      departmentId,
      teamId,
    });
    expect(worker.status).toBe(201);

    officerUserId = (await prisma.user.findUniqueOrThrow({ where: { email: officerEmail } })).id;
    workerUserId = (await prisma.user.findUniqueOrThrow({ where: { email: workerEmail } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates both requests as PENDING_VERIFICATION with employee profiles, no permissions', async () => {
    const officer = await prisma.user.findUniqueOrThrow({ where: { id: officerUserId } });
    expect(officer.status).toBe('PENDING_VERIFICATION');
    expect(officer.role).toBe('OFFICER');

    const profile = await prisma.officerProfile.findUniqueOrThrow({ where: { userId: officerUserId } });
    expect(profile.employeeId).toBe('ELEC-901');
    expect(profile.departmentId).toBe(departmentId);
    expect(profile.jurisdictionId).toBe(jurisdictionId);

    const worker = await prisma.user.findUniqueOrThrow({ where: { id: workerUserId } });
    expect(worker.status).toBe('PENDING_VERIFICATION');
    const workerProfile = await prisma.fieldWorkerProfile.findUniqueOrThrow({ where: { userId: workerUserId } });
    expect(workerProfile.employeeId).toBe('EL-9101');
    expect(workerProfile.teamId).toBe(teamId);

    // The requester can see their own status but nothing operational.
    const token = (await request(app).post('/api/auth/login').send({ email: officerEmail, password: 'Str0ngPassw0rd!' }))
      .body.accessToken as string;
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    for (const path of ['/api/complaints', '/api/notifications']) {
      const blocked = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      expect(blocked.status, path).toBe(403);
      expect(blocked.body.error.message).toMatch(/under verification/i);
    }

    const workerToken = (
      await request(app).post('/api/auth/login').send({ email: workerEmail, password: 'Str0ngPassw0rd!' })
    ).body.accessToken as string;
    const blockedWorker = await request(app).get('/api/complaints').set('Authorization', `Bearer ${workerToken}`);
    expect(blockedWorker.status).toBe(403);
    expect(blockedWorker.body.error.message).toMatch(/under verification/i);
  });

  it('tells the admins a verification request is waiting and lists it', async () => {
    const asked = await prisma.notification.findFirst({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@civicfix.demo' } })).id, type: 'VERIFICATION_REQUIRED' },
    });
    expect(asked).toBeTruthy();

    const res = await request(app).get('/api/admin/staff-requests').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const rows = res.body.requests as Array<{ id: string; employeeId?: string | null }>;
    expect(rows.some((r) => r.id === officerUserId)).toBe(true);
    expect(rows.some((r) => r.id === workerUserId)).toBe(true);
  });

  it('refuses rejection without a reason and keeps the request pending', async () => {
    const noReason = await request(app)
      .post(`/api/admin/staff-requests/${workerUserId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(noReason.status).toBe(422);

    const still = await prisma.user.findUniqueOrThrow({ where: { id: workerUserId } });
    expect(still.status).toBe('PENDING_VERIFICATION');
  });

  it('rejects with a reason (account disabled, audited)', async () => {
    const res = await request(app)
      .post(`/api/admin/staff-requests/${workerUserId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Employee ID does not match our records' });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: workerUserId } });
    expect(user.status).toBe('DISABLED');
    const audited = await prisma.auditLog.findFirst({
      where: { action: 'staff.rejected', entityId: workerUserId },
    });
    expect((audited?.metadata as { reason?: string } | null)?.reason).toContain('does not match');

    // A disabled account cannot even log in.
    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: workerEmail, password: 'Str0ngPassw0rd!' });
    expect(loginAttempt.status).toBe(401);
  });

  it('approves the officer: ACTIVE with the requested role and full access', async () => {
    const res = await request(app)
      .post(`/api/admin/staff-requests/${officerUserId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: officerUserId } });
    expect(user.status).toBe('ACTIVE');
    expect(user.role).toBe('OFFICER');
    const audited = await prisma.auditLog.findFirst({ where: { action: 'staff.approved', entityId: officerUserId } });
    expect(audited).toBeTruthy();

    // The gate is gone: the queue is reachable now.
    const token = (await request(app).post('/api/auth/login').send({ email: officerEmail, password: 'Str0ngPassw0rd!' }))
      .body.accessToken as string;
    const queue = await request(app).get('/api/complaints').set('Authorization', `Bearer ${token}`);
    expect(queue.status).toBe(200);
  });

  it('keeps staff approval admin-only', async () => {
    for (const token of [citizenToken]) {
      const res = await request(app)
        .post(`/api/admin/staff-requests/${officerUserId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
    }
  });
});
