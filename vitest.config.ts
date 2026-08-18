/**
 * Vitest Configuration
 * Unified configuration for all test types with appropriate parallelism
 *
 * - Unit tests: Run in parallel (no shared state)
 * - Integration/Security tests: Run sequentially (shared database)
 */

import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.resolve(__dirname, './test/setup/setup.ts')],
    pool: 'forks',
    maxWorkers: 4,
    isolate: true,
    reporters: [
      'default',
      [
        path.resolve(__dirname, './test/reporters/vitest-summary-reporter.ts'),
        { testType: process.env.TEST_TYPE || 'unit' },
      ],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      clean: true,
      cleanOnRerun: true,
      // Process coverage files sequentially to avoid race conditions with forks
      processingConcurrency: 1,
      include: ['packages/api/src/**/*.ts', 'packages/mcp/src/**/*.ts', 'packages/db/src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/dist/**',
        '**/.next/**',
        '**/packages/web/**',
        '**/index.ts',
        '**/types/**',
        '**/types.ts',
        '**/trpc-client.ts',
      ],
      thresholds: {
        lines: 35,
        functions: 40,
        branches: 75,
        statements: 35,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Projects configuration for parallel/sequential execution
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
          // Parallel execution enabled via tenant isolation
          // Each test file gets its own organization, preventing data conflicts
          pool: 'forks',
          fileParallelism: true,
          sequence: { concurrent: false }, // Tests within a file still run sequentially
          maxWorkers: 4,
        },
      },
      {
        extends: true,
        test: {
          name: 'security',
          include: ['test/security/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
          // Sequential execution for shared database tests
          // Force single worker to prevent concurrent file execution
          pool: 'forks',
          fileParallelism: false,
          sequence: { concurrent: false },
          maxWorkers: 1,
        },
      },
    ],
  },
  resolve: {
    alias: [
      { find: '@sentinel/api', replacement: path.resolve(__dirname, './packages/api/src') },
      { find: '@sentinel/db', replacement: path.resolve(__dirname, './packages/db/src') },
      { find: '@sentinel/web', replacement: path.resolve(__dirname, './packages/web/src') },
      { find: '@sentinel/a2a', replacement: path.resolve(__dirname, './packages/a2a/src') },
      { find: '@sentinel/shared', replacement: path.resolve(__dirname, './packages/shared/src') },
      // Resolve @anthropic-ai/sdk from packages/api/node_modules for consistent mocking in tests
      {
        find: '@anthropic-ai/sdk',
        replacement: path.resolve(__dirname, './packages/api/node_modules/@anthropic-ai/sdk'),
      },
      // Resolve puppeteer from packages/api/node_modules for consistent mocking in tests
      {
        find: 'puppeteer',
        replacement: path.resolve(__dirname, './packages/api/node_modules/puppeteer'),
      },
      // Resolve @modelcontextprotocol/sdk subpath imports for transport tests using regex
      {
        find: /^@modelcontextprotocol\/sdk\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          './packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/$1',
        ),
      },
    ],
  },
});
