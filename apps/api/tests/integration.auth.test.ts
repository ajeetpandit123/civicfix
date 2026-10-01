import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const enabled = Boolean(process.env.DATABASE_URL) && process.env.RUN_API_INTEGRATION === '1';

describe.skipIf(!enabled)('auth + complaint integration', () => {
  const env = loadEnv();
  const app = createApp(env);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('logs in a citizen and forbids another citizen id', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'citizen@civicfix.demo', password: 'CivicFix!demo1' });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const list = await request(app).get('/api/complaints').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);

    const other = await request(app)
      .get('/api/complaints/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(other.status).toBe(404);

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@civicfix.demo', password: 'CivicFix!demo1' });
    expect(adminLogin.status).toBe(200);
  });
});
