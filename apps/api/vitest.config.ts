import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration cases hash at bcrypt cost 12 and run 3 sequential logins plus
    // a dozen round trips against a remote Postgres — well past vitest's 5s default.
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
