import { describe, expect, it } from 'vitest';
import { loadEnv, normalizeEnvValue } from '../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@host:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
} as NodeJS.ProcessEnv;

describe('environment value normalization', () => {
  it('unwraps an accidental doubled key', () => {
    expect(normalizeEnvValue('REDIS_URL', 'REDIS_URL="rediss://host:6379"')).toBe(
      'rediss://host:6379',
    );
  });

  it('strips a literal quote wrapper', () => {
    expect(normalizeEnvValue('REDIS_URL', '"rediss://host:6379"')).toBe('rediss://host:6379');
    expect(normalizeEnvValue('SMTP_PASS', "'app password'")).toBe('app password');
  });

  it('leaves a clean value untouched', () => {
    expect(normalizeEnvValue('DATABASE_URL', 'postgresql://h/db')).toBe('postgresql://h/db');
  });

  it('passes an absent value through as absent', () => {
    expect(normalizeEnvValue('REDIS_URL', undefined)).toBeUndefined();
  });

  it('makes a doubled-key REDIS_URL usable end to end', () => {
    const env = loadEnv({
      ...base,
      REDIS_URL: 'REDIS_URL="rediss://default:secret@host:6379"',
    } as NodeJS.ProcessEnv);

    expect(env.REDIS_URL).toBe('rediss://default:secret@host:6379');
  });

  it('still rejects genuinely invalid config after normalizing', () => {
    expect(() =>
      loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment/);
  });
});
