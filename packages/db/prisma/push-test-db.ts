/**
 * Push schema to test database
 * Usage: pnpm db:push:test
 */
import { execSync } from 'child_process';
import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  console.error('ERROR: TEST_DATABASE_URL is not set in .env');
  process.exit(1);
}

console.log('Pushing schema to test database:', testDbUrl.replace(/:[^:@]+@/, ':***@'));

try {
  execSync(`npx prisma db push --url "${testDbUrl}"`, {
    stdio: 'inherit',
    cwd: join(__dirname, '..'),
  });
  console.log('✅ Test database schema synced successfully');
} catch (error) {
  console.error('❌ Failed to push schema to test database:', error);
  process.exit(1);
}
