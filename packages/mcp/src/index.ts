import { logger } from './logger.js';
import { SentinelServer } from './server.js';

async function main() {
  const server = new SentinelServer();
  await server.run();
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
