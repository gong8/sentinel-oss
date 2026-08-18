#!/usr/bin/env npx tsx
/**
 * SENTINEL Backup - Cross-platform database backup
 *
 * Usage:
 *   pnpm backup [filename]
 *   pnpm backup                         # Auto-generates timestamped filename
 *   pnpm backup my-backup.sql           # Uses specified filename
 *
 * Output:
 *   Creates a SQL dump file in the current directory
 */
import $ from 'dax-sh';
import { bold, green, yellow } from './lib/colors.js';

async function main() {
  // Generate timestamp in format: YYYYMMDD_HHMMSS
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const backupFile = process.argv[2] || `sentinel_backup_${timestamp}.sql`;

  console.log(`\n${bold('SENTINEL Database Backup')}`);
  console.log('─'.repeat(40));
  console.log(`Backing up database to ${yellow(backupFile)}...`);

  try {
    // Check if docker compose is running
    const containers = await $`docker compose ps --format json`.text().catch(() => '');
    if (!containers.includes('postgres')) {
      console.log(yellow('\n⚠ Warning: PostgreSQL container may not be running.'));
      console.log('  Run `docker compose up -d postgres` first.\n');
    }

    // Run pg_dump in the postgres container
    const output = await $`docker compose exec -T postgres pg_dump -U sentinel sentinel`.text();
    await $.path(backupFile).writeText(output);

    // Get file size
    const stat = await $.path(backupFile).stat();
    const sizeKB = Math.round((stat?.size || 0) / 1024);
    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

    console.log(green(`\n✓ Backup complete!`));
    console.log(`  File: ${backupFile}`);
    console.log(`  Size: ${sizeStr}`);
    console.log(`  Time: ${new Date().toLocaleString()}\n`);

    console.log('To restore this backup, run:');
    console.log(`  pnpm restore ${backupFile}\n`);
  } catch (error) {
    console.error('\n❌ Backup failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);
