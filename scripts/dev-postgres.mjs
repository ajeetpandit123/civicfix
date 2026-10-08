/**
 * Boots a local PostgreSQL for development WITHOUT Docker, using the same
 * user/password/database as docker-compose.yml so DATABASE_URL is unchanged.
 *
 * Dev-only helper: on a machine with Docker, prefer `docker compose up -d postgres`.
 * Usage: npm run db:dev:up  (keeps running in the foreground)
 */
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const DATA_DIR = './.pgdata';
const USER = 'civicfix';
const PASSWORD = 'civicfix';
const DATABASE = 'civicfix';
const PORT = 5432;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

if (!existsSync(DATA_DIR)) {
  console.log('[dev-postgres] initialising cluster in', DATA_DIR);
  await pg.initialise();
} else {
  console.log('[dev-postgres] reusing existing cluster in', DATA_DIR);
}

await pg.start();

try {
  await pg.createDatabase(DATABASE);
  console.log(`[dev-postgres] created database "${DATABASE}"`);
} catch {
  console.log(`[dev-postgres] database "${DATABASE}" already exists`);
}

console.log(`[dev-postgres] ready on localhost:${PORT} — Ctrl+C to stop`);
