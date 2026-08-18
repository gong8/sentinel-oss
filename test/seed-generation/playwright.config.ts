/**
 * Playwright Configuration for Seed Generation
 * Extended timeouts and serial execution for data generation
 */

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Override DATABASE_URL with TEST_DATABASE_URL for seed generation tests
// This ensures both the test process AND API server use the test database
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  testDir: './',
  testMatch: 'generate-seed-data.spec.ts',

  // Run tests serially to maintain data consistency
  fullyParallel: false,
  workers: 1,

  // Never fail on CI - this is a data generation script
  forbidOnly: false,

  // No retries - we want to see failures immediately
  retries: 0,

  // Extended timeouts for seed generation
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 30000, // 30 seconds for assertions
  },

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',

    // Record everything for debugging
    trace: 'on',
    screenshot: 'on',
    video: 'on',

    // Extended action timeout
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: 'seed-generation',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web servers to start
  webServer: [
    {
      command: 'pnpm --filter @sentinel/api dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 120000,
      cwd: path.resolve(__dirname, '../../'),
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      },
    },
    {
      command: 'pnpm --filter @sentinel/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
      cwd: path.resolve(__dirname, '../../'),
    },
  ],
});
