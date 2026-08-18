#!/usr/bin/env npx tsx
/**
 * SENTINEL Help - Cross-platform help display
 * Usage: pnpm usage
 */
import { bold, boldBlue, cyan, green, yellow } from './lib/colors.js';

console.log(boldBlue('SENTINEL - Control Plane for AI Agent Tooling'));
console.log();

console.log(bold('Docker Commands'));
console.log(
  `  ${green('pnpm setup')}        Initial setup - creates .env, starts Docker, seeds database`,
);
console.log(`  ${green('pnpm configure')}    Interactive configuration - API keys, URLs, models`);
console.log(`  ${green('pnpm logs')}         View container logs (real-time, with timestamps)`);
console.log(
  `  ${green('pnpm reset')}        ${yellow('Destroy everything')} - clean slate for fresh install`,
);
console.log();

console.log(bold('Development Commands'));
console.log(`  ${green('pnpm dev')}          Start local development servers (API + Web)`);
console.log(`  ${green('pnpm build')}        Build all packages`);
console.log(`  ${green('pnpm check')}        Run all quality checks (lint, types, tests)`);
console.log(`  ${green('pnpm test')}         Run test suite`);
console.log(`  ${green('pnpm lint')}         Run linters`);
console.log(`  ${green('pnpm format')}       Format code with Prettier`);
console.log();

console.log(bold('Database Commands'));
console.log(`  ${green('pnpm db:studio')}    Open Prisma Studio (visual database browser)`);
console.log(`  ${green('pnpm db:push')}      Push schema changes to database`);
console.log(`  ${green('pnpm db:seed')}      Seed database with sample data`);
console.log(`  ${green('pnpm db:reset')}     Reset database (${yellow('deletes all data')})`);
console.log(`  ${green('pnpm seed')}         Full reset + seed + show credentials`);
console.log();

console.log(bold('Docker Quick Reference'));
console.log(`  ${cyan('docker compose up -d')}           Start containers in background`);
console.log(`  ${cyan('docker compose down')}            Stop containers`);
console.log(
  `  ${cyan('docker compose down -v')}         Stop + delete volumes (${yellow('wipes DB')})`,
);
console.log(`  ${cyan('docker compose restart api')}     Restart just the API`);
console.log(`  ${cyan('docker compose ps')}              Show running containers`);
console.log(`  ${cyan('docker compose exec api bash')}   Shell into API container`);
console.log();

console.log(bold('Logs Quick Reference'));
console.log(`  ${cyan('pnpm logs')}                      All services, real-time`);
console.log(`  ${cyan('pnpm logs api')}                  API logs only`);
console.log(`  ${cyan('pnpm logs -- -n 50')}             Last 50 lines`);
console.log(`  ${cyan('pnpm logs -- --no-follow')}       Show logs and exit`);
console.log();

console.log(bold('Troubleshooting'));
console.log(`  ${yellow("Container won't start?")}    Check logs: pnpm logs api`);
console.log(`  ${yellow('Port already in use?')}      Kill ports: pnpm kill`);
console.log(`  ${yellow('Database issues?')}          Reset: pnpm db:reset`);
console.log(`  ${yellow('Total reset needed?')}       Nuclear option: pnpm reset`);
console.log();

console.log(bold('URLs (default)'));
console.log('  Web UI:    http://localhost:5173 (dev) or http://localhost (docker)');
console.log('  API:       http://localhost:3000');
console.log('  API Docs:  http://localhost:3000/docs');
console.log();
