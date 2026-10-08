/**
 * Routing contract: AI category -> department -> jurisdiction -> responsible
 * officer (never "any officer in the department").
 *
 * The routing assertions exercise the seeded matrix (departments, bounded
 * areas, ResponsibilityMapping rows), so they need a database; without one the
 * suite skips rather than passing silently.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { createAiProvider, classifySafe } from '../src/ai/provider.js';
import { routeComplaint } from '../src/services/routingService.js';

loadDotEnv();

const suite = describe.runIf(Boolean(process.env.DATABASE_URL));

async function login(app: ReturnType<typeof createApp>, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'CivicFix!demo1' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

suite('AI + routing: category -> department -> jurisdiction -> officer', () => {
  let app: ReturnType<typeof createApp>;
  let ai: ReturnType<typeof createAiProvider>;

  beforeAll(() => {
    const env = loadEnv();
    app = createApp(env);
    ai = createAiProvider(env);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("AI: 'Street light is not working in Jahangirpuri.' -> Street Lighting", async () => {
    const result = await classifySafe(ai, {
      title: 'Street light is not working in Jahangirpuri.',
      description: 'It has been dark and unsafe at night for three days.',
    });
    expect(result?.category).toBe('STREETLIGHT');
  });

  it("AI: 'Garbage has not been collected for five days.' -> Waste management", async () => {
    const result = await classifySafe(ai, {
      title: 'Garbage has not been collected for five days.',
      description: 'The waste is rotting outside the houses.',
    });
    expect(result?.category).toBe('WASTE_MANAGEMENT');
  });

  it("AI: 'Huge pothole/road collapse.' -> Road Damage", async () => {
    const result = await classifySafe(ai, {
      title: 'Huge pothole/road collapse.',
      description: 'The road surface collapsed and vehicles cannot pass.',
    });
    expect(result?.category).toBe('ROADS');
  });

  it('routes Street Lighting + Jahangirpuri to Electrical Department + that place\'s officer', async () => {
    const category = await prisma.complaintCategory.findUnique({ where: { code: 'STREETLIGHT' } });
    const route = await routeComplaint({ latitude: 28.72, longitude: 77.1, categoryId: category!.id });
    expect(route.kind).toBe('mapped');
    if (route.kind !== 'mapped') return;

    const department = await prisma.department.findUnique({ where: { id: route.departmentId } });
    const jurisdiction = await prisma.jurisdiction.findUnique({ where: { id: route.jurisdictionId } });
    const officer = await prisma.officerProfile.findUnique({
      where: { userId: route.defaultOfficerUserId ?? '__none__' },
      include: { user: true, department: true, jurisdiction: true },
    });

    expect(department?.name).toBe('Electrical Department');
    expect(jurisdiction?.name).toBe('Jahangirpuri');
    expect(officer?.user.name).toBe('Priya Sharma');
    expect(officer?.employeeId).toBe('ELEC-204');
    expect(officer?.department.name).toBe('Electrical Department');
    expect(officer?.jurisdiction.name).toBe('Jahangirpuri');
  });

  it('never hands a complaint to just any officer in the department (§5)', async () => {
    const category = await prisma.complaintCategory.findUnique({ where: { code: 'STREETLIGHT' } });
    const jahangirpuri = await routeComplaint({ latitude: 28.72, longitude: 77.1, categoryId: category!.id });
    const modelTown = await routeComplaint({ latitude: 28.67, longitude: 77.23, categoryId: category!.id });
    expect(jahangirpuri.kind).toBe('mapped');
    expect(modelTown.kind).toBe('mapped');
    if (jahangirpuri.kind !== 'mapped' || modelTown.kind !== 'mapped') return;

    const modelTownOfficer = await prisma.officerProfile.findFirst({
      where: { jurisdiction: { name: 'Model Town' }, department: { name: 'Electrical Department' } },
      include: { user: true },
    });
    expect(modelTown.defaultOfficerUserId).toBe(modelTownOfficer?.user.id);
    expect(modelTown.defaultOfficerUserId).not.toBe(jahangirpuri.defaultOfficerUserId);
  });

  it('persists department, jurisdiction and the responsible officer on the complaint', async () => {
    const token = await login(app, 'citizen@civicfix.demo');
    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Street light is not working in Jahangirpuri.',
        description: 'The street light near the park gate has been out for three nights.',
        latitude: 28.72,
        longitude: 77.1,
        address: 'Jahangirpuri Ward, near the park gate',
      });
    expect(res.status).toBe(201);
    const complaint = res.body.complaint;
    // Routed, so it must NOT sit in the manual queue.
    expect(complaint.status).toBe('UNDER_REVIEW');
    expect(complaint.department.name).toBe('Electrical Department');
    expect(complaint.jurisdiction.name).toBe('Jahangirpuri');
    expect(complaint.assignedOfficer.name).toBe('Priya Sharma');
    expect(complaint.assignedOfficer.id).toBeTruthy();
  });
});
