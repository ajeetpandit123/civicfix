import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('environment validation', () => {
  it('rejects short JWT secrets', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://x',
        JWT_ACCESS_SECRET: 'short',
        JWT_REFRESH_SECRET: 'short',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment/);
  });

  it('accepts a complete development config', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://civicfix:civicfix@localhost:5432/civicfix',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
    } as NodeJS.ProcessEnv);
    expect(env.API_PORT).toBe(4000);
    expect(env.AI_PROVIDER).toBe('mock');
  });
});
