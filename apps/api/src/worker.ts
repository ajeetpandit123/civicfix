import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { runSlaSweep } from './jobs/slaSweep.js';

loadEnv();
logger.info('worker_start');

async function loop() {
  await runSlaSweep();
}

await loop();
setInterval(() => {
  loop().catch((err) => logger.error({ err }, 'worker_tick_failed'));
}, 60_000);
