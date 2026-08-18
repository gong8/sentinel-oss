#!/usr/bin/env node
/**
 * MCP Test Runner Server
 *
 * Provides tools for running tests and checks with filtered output:
 * - run_tests: Run test suite, returns success message or full failure details
 * - run_check: Run full quality check, returns success or failure details
 * - get_last_results: Get results from last test run without re-running
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

// Get project root from environment or use cwd
const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RESULTS_DIR = join(PROJECT_ROOT, 'test/results');

// Types matching test/reporters/types.ts
interface TestFailure {
  testName: string;
  file: string;
  error: string;
  stack: string;
  expected?: string;
  actual?: string;
}

interface TestFileResult {
  file: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures?: TestFailure[];
}

interface TestCategoryResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestFileResult[];
}

interface TestTypeResult {
  type: 'unit' | 'integration' | 'security' | 'e2e';
  timestamp: string;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDuration: number;
  categories: TestCategoryResult[];
}

interface AggregatedResults {
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDuration: number;
  failures: TestFailure[];
}

/**
 * Run a command and return stdout/stderr
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

/**
 * Read and aggregate test results from JSON files
 */
async function aggregateResults(): Promise<AggregatedResults> {
  const results: AggregatedResults = {
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    totalDuration: 0,
    failures: [],
  };

  try {
    const files = await readdir(RESULTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(RESULTS_DIR, file), 'utf-8');
        const testResult: TestTypeResult = JSON.parse(content);

        results.totalPassed += testResult.totalPassed;
        results.totalFailed += testResult.totalFailed;
        results.totalSkipped += testResult.totalSkipped;
        results.totalDuration += testResult.totalDuration;

        // Collect failures from all categories
        for (const category of testResult.categories) {
          for (const test of category.tests) {
            if (test.failures && test.failures.length > 0) {
              results.failures.push(...test.failures);
            }
          }
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Results directory may not exist yet
  }

  return results;
}

/**
 * Format test duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format failures for display
 */
function formatFailures(failures: TestFailure[]): string {
  if (failures.length === 0) return '';

  return failures
    .map((f) => {
      let output = `\n${'='.repeat(60)}\n`;
      output += `FAILED: ${f.file}\n`;
      output += `Test: ${f.testName}\n`;
      output += `${'='.repeat(60)}\n\n`;
      output += `${f.error}\n`;

      if (f.expected !== undefined || f.actual !== undefined) {
        output += `\nExpected: ${f.expected ?? 'N/A'}\n`;
        output += `Actual: ${f.actual ?? 'N/A'}\n`;
      }

      if (f.stack) {
        output += `\nStack trace:\n${f.stack}\n`;
      }

      return output;
    })
    .join('\n');
}

// Create MCP server
const server = new McpServer({
  name: 'test-runner',
  version: '0.1.0',
});

// Register run_tests tool
server.registerTool(
  'run_tests',
  {
    title: 'Run Tests',
    description:
      'Run test suite. Returns minimal success message if all pass, or full error details with stack traces if any fail.',
    inputSchema: {
      type: z.enum(['unit', 'integration', 'e2e', 'security', 'all']).default('all'),
    },
  },
  async (args) => {
    const testType = args.type;

    // Run tests
    const result = await runCommand(
      'pnpm',
      testType === 'all' ? ['test'] : [`test:${testType}`],
      PROJECT_ROOT,
    );

    // Read aggregated results
    const aggregated = await aggregateResults();
    const total = aggregated.totalPassed + aggregated.totalFailed + aggregated.totalSkipped;

    if (result.exitCode === 0 && aggregated.totalFailed === 0) {
      // All passed - minimal output
      return {
        content: [
          {
            type: 'text' as const,
            text: `All ${aggregated.totalPassed} tests passed (${formatDuration(aggregated.totalDuration)})`,
          },
        ],
      };
    } else {
      // Failures - full output
      let output = `${aggregated.totalFailed} of ${total} tests failed\n`;
      output += `Passed: ${aggregated.totalPassed}, Failed: ${aggregated.totalFailed}, Skipped: ${aggregated.totalSkipped}\n`;
      output += `Duration: ${formatDuration(aggregated.totalDuration)}\n`;

      if (aggregated.failures.length > 0) {
        output += formatFailures(aggregated.failures);
      } else {
        // No structured failures - include raw output
        output += '\n--- Raw Output ---\n';
        output += result.stderr || result.stdout;
      }

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    }
  },
);

// Register run_check tool
server.registerTool(
  'run_check',
  {
    title: 'Run Check',
    description:
      'Run full quality check (quality scan, format, lint, types, build, tests). Returns minimal success message if all pass, or full error details if any fail.',
    inputSchema: {},
  },
  async () => {
    const checks = [
      { name: 'Quality', cmd: ['check:quality'] },
      { name: 'Format', cmd: ['check:format'] },
      { name: 'Lint', cmd: ['check:lint'] },
      { name: 'Types', cmd: ['check:types'] },
      { name: 'Build', cmd: ['check:build'] },
      { name: 'Tests', cmd: ['check:tests'] },
    ];

    const failures: { name: string; error: string }[] = [];

    for (const check of checks) {
      const result = await runCommand('pnpm', check.cmd, PROJECT_ROOT);
      if (result.exitCode !== 0) {
        failures.push({
          name: check.name,
          error: result.stderr || result.stdout,
        });
      }
    }

    if (failures.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'All checks passed' }],
      };
    }

    let output = `${failures.length} check(s) failed:\n\n`;
    for (const f of failures) {
      output += `${'='.repeat(60)}\n`;
      output += `FAILED: ${f.name}\n`;
      output += `${'='.repeat(60)}\n`;
      output += `${f.error}\n\n`;
    }

    return {
      content: [{ type: 'text' as const, text: output }],
    };
  },
);

// Register get_last_results tool
server.registerTool(
  'get_last_results',
  {
    title: 'Get Last Test Results',
    description:
      'Get results from the last test run without re-running tests. Returns cached results from test/results/*.json files.',
    inputSchema: {},
  },
  async () => {
    const aggregated = await aggregateResults();
    const total = aggregated.totalPassed + aggregated.totalFailed + aggregated.totalSkipped;

    if (total === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No test results found. Run tests first.' }],
      };
    }

    if (aggregated.totalFailed === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Last run: All ${aggregated.totalPassed} tests passed (${formatDuration(aggregated.totalDuration)})`,
          },
        ],
      };
    }

    let output = `Last run: ${aggregated.totalFailed} of ${total} tests failed\n`;
    output += `Passed: ${aggregated.totalPassed}, Failed: ${aggregated.totalFailed}, Skipped: ${aggregated.totalSkipped}\n`;
    output += `Duration: ${formatDuration(aggregated.totalDuration)}\n`;

    if (aggregated.failures.length > 0) {
      output += formatFailures(aggregated.failures);
    }

    return {
      content: [{ type: 'text' as const, text: output }],
    };
  },
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
