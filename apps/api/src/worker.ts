import { loadDotEnv } from './config/dotenv.js';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { runSlaSweep } from './jobs/slaSweep.js';
import { bootstrapJobQueue } from './jobs/handlers.js';

loadDotEnv();
loadEnv();

const queue = bootstrapJobQueue();

async function loop() {
  await queue.drain();
  await runSlaSweep();
}

loop().catch((err) => logger.error({ err }, 'worker_start_failed'));
setInterval(() => {
  loop().catch((err) => logger.error({ err }, 'worker_loop_failed'));
}, 60_000).unref();
