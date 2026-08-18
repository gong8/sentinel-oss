#!/usr/bin/env npx tsx
/**
 * SENTINEL Logs - Cross-platform Docker logs viewer
 * Usage: pnpm logs [service] [options]
 */
import $ from 'dax-sh';
import { blue } from './lib/colors.js';

function showHelp(): void {
  console.log(blue('SENTINEL Logs'));
  console.log();
  console.log('Usage: pnpm logs [service] [options]');
  console.log();
  console.log('Services:');
  console.log('  api       - API server logs');
  console.log('  db        - PostgreSQL database logs');
  console.log('  web       - Web frontend logs (if running in Docker)');
  console.log('  all       - All services (default)');
  console.log();
  console.log('Options:');
  console.log('  -n, --lines N   Show last N lines (default: 100)');
  console.log("  --no-follow     Don't follow logs in real-time");
  console.log('  -h, --help      Show this help');
  console.log();
  console.log('Examples:');
  console.log('  pnpm logs              # All services, real-time');
  console.log('  pnpm logs api          # API logs, real-time');
  console.log('  pnpm logs api -n 50    # Last 50 lines of API, real-time');
  console.log('  pnpm logs db --no-follow  # DB logs, no follow');
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let service = '';
  let lines = 100;
  let follow = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (arg === '-n' || arg === '--lines') {
      lines = parseInt(args[++i] || '100', 10);
    } else if (arg === '--no-follow') {
      follow = false;
    } else if (['api', 'db', 'web', 'all'].includes(arg)) {
      service = arg;
    } else {
      console.log(`Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
    }
  }

  // Build command arguments
  const cmdArgs = ['compose', 'logs', '--tail', String(lines), '-t'];

  if (follow) {
    cmdArgs.push('-f');
  }

  if (service && service !== 'all') {
    cmdArgs.push(service);
  }

  const cmdString = `docker ${cmdArgs.join(' ')}`;
  console.log(blue(`Running: ${cmdString}`));
  console.log('Press Ctrl+C to stop');
  console.log();

  // Execute docker compose logs
  await $`docker ${cmdArgs}`.stdin('inherit').stdout('inherit').stderr('inherit');
}

main().catch(console.error);
