/**
 * Verifies the development PostgreSQL is reachable through the app's own
 * DATABASE_URL and Prisma client. Prints the server's own version string on
 * success (output that only a live PostgreSQL can produce), exits 1 on failure.
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe('select version()');
  console.log(rows[0].version);
  await prisma.$disconnect();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
