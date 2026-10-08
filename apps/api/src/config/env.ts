import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(14),
  REDIS_URL: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  AI_PROVIDER: z.enum(['none', 'openai', 'mock']).default('mock'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().default(15000),
  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('CivicFix <noreply@civicfix.local>'),
  GEOCODER_PROVIDER: z.enum(['nominatim', 'none']).default('nominatim'),
  GEOCODER_USER_AGENT: z.string().default('CivicFix/0.1'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * Tolerates the value shapes a hand-edited .env actually produces: an accidental
 * doubled key (`REDIS_URL=REDIS_URL="x"`) and literal quote wrappers. Keeps the
 * original value when neither applies.
 */
export function normalizeEnvValue(key: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let v = value.trim();
  const doubled = `${key}=`;
  while (v.startsWith(doubled)) v = v.slice(doubled.length).trim();
  const first = v[0];
  const last = v[v.length - 1];
  if (v.length >= 2 && (first === '"' || first === "'") && last === first) {
    v = v.slice(1, -1);
  }
  return v;
}

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const normalized: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key] = normalizeEnvValue(key, value);
  }
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
