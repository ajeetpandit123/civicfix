import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { runSlaSweep } from './jobs/slaSweep.js';

const env = loadEnv();
const app = createApp(env);

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'api_listening');
});

setInterval(() => {
  runSlaSweep().catch((err) => logger.error({ err }, 'sla_sweep_failed'));
}, 5 * 60 * 1000).unref();

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
