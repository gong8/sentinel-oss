/**
 * Playwright Configuration
 * E2E test configuration
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Override DATABASE_URL with TEST_DATABASE_URL for e2e tests
// This ensures both the test process AND spawned API server use the test database
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  testDir: '../e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // In CI with 8 shards, each shard gets ~6 test files, so 4 workers per shard is efficient
  // Locally, use 8 workers for speed
  workers: process.env.CI ? 4 : 8,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    [path.resolve(__dirname, '../reporters/playwright-summary-reporter.ts')],
  ],

  // Global setup/teardown for database snapshot/restore
  globalSetup: path.resolve(__dirname, './e2e-global-setup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e-global-teardown.ts'),

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Use tsx WITHOUT watch mode for tests - watch mode can restart during tests
      // when Prisma generates files, causing auth failures
      command: 'pnpm exec tsx packages/api/src/index.ts',
      url: 'http://localhost:3000/health',
      // IMPORTANT: Never reuse existing server for e2e tests in CI to ensure correct database connection
      // Existing dev servers use the dev database, but tests need the test database
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      cwd: path.resolve(__dirname, '../../'),
      // Capture stdout to see API server logs in test output
      stdout: 'pipe',
      env: {
        ...process.env,
        // Set NODE_ENV=test so @sentinel/db uses TEST_DATABASE_URL
        NODE_ENV: 'test',
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || '',
        DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
        // Skip MCP URL validation in e2e tests (allows fake URLs)
        SKIP_MCP_URL_VALIDATION: 'true',
        // Skip license validation in e2e tests (allows testing all features)
        SKIP_LICENSE_VALIDATION: 'true',
      },
    },
    {
      command: 'pnpm --filter @sentinel/web dev',
      url: 'http://localhost:5173',
      // Never reuse to avoid using wrong server configuration
      reuseExistingServer: false,
      timeout: 120000,
      cwd: path.resolve(__dirname, '../../'),
    },
    {
      command: 'node test/setup/mock-mcp-server.js',
      url: 'http://localhost:3001/health',
      // Never reuse to avoid using wrong server configuration
      reuseExistingServer: false,
      timeout: 30000,
      cwd: path.resolve(__dirname, '../../'),
    },
  ],
});
