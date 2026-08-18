#!/usr/bin/env npx tsx
/**
 * SENTINEL Restore - Cross-platform database restore
 *
 * Usage:
 *   pnpm restore <backup-file.sql>
 *
 * This script:
 *   1. Validates the backup file exists and appears valid
 *   2. Prompts for confirmation before proceeding
 *   3. Restores the database from the backup
 *
 * WARNING: This will overwrite all existing data!
 */
import $ from 'dax-sh';
import * as readline from 'readline';
import { bold, boldRed, green, red, yellow } from './lib/colors.js';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function validateBackupFile(filePath: string): Promise<boolean> {
  const path = $.path(filePath);

  // Check file exists
  if (!(await path.exists())) {
    console.log(red(`\n❌ Backup file not found: ${filePath}`));
    return false;
  }

  // Check file extension
  if (!filePath.endsWith('.sql')) {
    console.log(yellow(`\n⚠ Warning: File does not have .sql extension`));
  }

  // Check file size
  const stat = await path.stat();
  if (!stat || stat.size === 0) {
    console.log(red(`\n❌ Backup file is empty`));
    return false;
  }

  // Check file starts with SQL-like content
  const content = await path.readText();
  const firstLine = content.split('\n')[0] || '';

  // PostgreSQL dumps typically start with comments or SET statements
  const validStarts = ['--', 'SET', 'CREATE', 'DROP', 'ALTER', 'INSERT', 'BEGIN', 'COPY'];
  const isValidSql = validStarts.some((start) => firstLine.trim().toUpperCase().startsWith(start));

  if (!isValidSql) {
    console.log(yellow(`\n⚠ Warning: File may not be a valid PostgreSQL dump`));
    console.log(`  First line: ${firstLine.substring(0, 80)}...`);
  }

  return true;
}

async function main() {
  const backupFile = process.argv[2];

  console.log(`\n${bold('SENTINEL Database Restore')}`);
  console.log('─'.repeat(40));

  // Check for backup file argument
  if (!backupFile) {
    console.log(red('\n❌ No backup file specified'));
    console.log('\nUsage: pnpm restore <backup-file.sql>');
    console.log('\nExample:');
    console.log('  pnpm restore sentinel_backup_20250130_120000.sql\n');
    process.exit(1);
  }

  // Validate backup file
  const isValid = await validateBackupFile(backupFile);
  if (!isValid) {
    process.exit(1);
  }

  // Get file info
  const stat = await $.path(backupFile).stat();
  const sizeKB = Math.round((stat?.size || 0) / 1024);
  const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

  console.log(`\nBackup file: ${yellow(backupFile)}`);
  console.log(`File size:   ${sizeStr}`);

  // Warning and confirmation
  console.log(boldRed('\n⚠️  WARNING: This will OVERWRITE ALL existing data!'));
  console.log('   Make sure you have a current backup before proceeding.\n');

  const answer = await prompt('Are you sure you want to restore? Type "yes" to confirm: ');

  if (answer !== 'yes') {
    console.log('\n❌ Restore cancelled.\n');
    process.exit(0);
  }

  console.log('\nRestoring database...');

  try {
    // Check if docker compose is running
    const containers = await $`docker compose ps --format json`.text().catch(() => '');
    if (!containers.includes('postgres')) {
      console.log(red('\n❌ PostgreSQL container is not running.'));
      console.log('  Run `docker compose up -d postgres` first.\n');
      process.exit(1);
    }

    // Read backup file
    const backupContent = await $.path(backupFile).readText();

    // Drop and recreate database
    console.log('  Dropping existing database...');
    await $`docker compose exec -T postgres psql -U sentinel -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`.quiet();

    // Restore from backup
    console.log('  Restoring from backup...');
    await $`docker compose exec -T postgres psql -U sentinel sentinel`.stdin(backupContent);

    console.log(green('\n✓ Database restored successfully!'));
    console.log(`  Source: ${backupFile}`);
    console.log(`  Time:   ${new Date().toLocaleString()}\n`);

    console.log('Note: You may need to restart the API server to pick up changes.\n');
  } catch (error) {
    console.error(
      red('\n❌ Restore failed:'),
      error instanceof Error ? error.message : String(error),
    );
    console.log('\nThe database may be in an inconsistent state.');
    console.log('Consider restoring from a different backup.\n');
    process.exit(1);
  }
}

main().catch(console.error);
