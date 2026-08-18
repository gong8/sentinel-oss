#!/usr/bin/env npx tsx
/**
 * Test Summary Display Script
 * Reads all JSON result files and displays a unified summary.
 */

import fs from 'fs';
import path from 'path';
import type { AggregatedResults, TestTypeResult } from './types';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

const RESULTS_DIR = path.resolve(process.cwd(), 'test/results');
const RESULT_FILES = ['unit.json', 'integration.json', 'security.json', 'e2e.json'];

function loadResults(): AggregatedResults {
  const results: TestTypeResult[] = [];

  for (const file of RESULT_FILES) {
    const filePath = path.join(RESULTS_DIR, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const result = JSON.parse(content) as TestTypeResult;
        // Backwards compatibility: if wallClockDuration is missing, use totalDuration
        if (result.wallClockDuration === undefined) {
          result.wallClockDuration = result.totalDuration;
        }
        results.push(result);
      } catch {
        console.warn(`Warning: Could not parse ${file}`);
      }
    }
  }

  return {
    results,
    overallPassed: results.reduce((sum, r) => sum + r.totalPassed, 0),
    overallFailed: results.reduce((sum, r) => sum + r.totalFailed, 0),
    overallSkipped: results.reduce((sum, r) => sum + r.totalSkipped, 0),
    overallDuration: results.reduce((sum, r) => sum + r.totalDuration, 0),
    overallWallClockDuration: results.reduce((sum, r) => sum + r.wallClockDuration, 0),
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function printTestType(result: TestTypeResult): void {
  const typeLabel = result.type.toUpperCase().padEnd(12);
  const status =
    result.totalFailed > 0
      ? colors.red + 'FAIL' + colors.reset
      : colors.green + 'PASS' + colors.reset;

  const failedColor = result.totalFailed > 0 ? colors.red : colors.dim;

  // Show wall-clock time with sequential time in parentheses if significantly different
  const wallTime = formatDuration(result.wallClockDuration);
  const seqTime = formatDuration(result.totalDuration);
  const timeDisplay =
    result.totalDuration > result.wallClockDuration * 1.1
      ? `${wallTime} wall, ${seqTime} seq`
      : wallTime;

  console.log();
  console.log(
    `${colors.bold}${typeLabel}${colors.reset} ${status} ` +
      `${colors.green}${result.totalPassed} passed${colors.reset}, ` +
      `${failedColor}${result.totalFailed} failed${colors.reset}, ` +
      `${colors.dim}${result.totalSkipped} skipped (${timeDisplay})${colors.reset}`,
  );

  for (const category of result.categories) {
    const catStatus = category.failed > 0 ? colors.red + 'x' : colors.green + 'v';
    const total = category.passed + category.failed + category.skipped;
    console.log(
      `  ${catStatus} ${colors.reset}${category.name.padEnd(25)} ` +
        `${colors.green}${category.passed}${colors.reset}/${total} ` +
        `${colors.dim}(${formatDuration(category.duration)})${colors.reset}`,
    );
  }
}

function printOverallSummary(aggregated: AggregatedResults): void {
  const total = aggregated.overallPassed + aggregated.overallFailed + aggregated.overallSkipped;
  const passRate = total > 0 ? ((aggregated.overallPassed / total) * 100).toFixed(1) : '0';

  console.log();
  console.log(colors.dim + '-'.repeat(70) + colors.reset);
  console.log(colors.bold + colors.cyan + 'OVERALL TEST SUMMARY' + colors.reset);
  console.log(colors.dim + '-'.repeat(70) + colors.reset);

  const statusBg = aggregated.overallFailed > 0 ? colors.bgRed : colors.bgGreen;
  const statusText = aggregated.overallFailed > 0 ? ' TESTS FAILED ' : ' ALL TESTS PASSED ';
  console.log();
  console.log(`${statusBg}${colors.bold}${colors.white}${statusText}${colors.reset}`);

  console.log();
  console.log(`  Total Tests:    ${colors.bold}${total}${colors.reset}`);
  console.log(`  Passed:         ${colors.green}${aggregated.overallPassed}${colors.reset}`);
  const failedColor = aggregated.overallFailed > 0 ? colors.red : colors.dim;
  console.log(`  Failed:         ${failedColor}${aggregated.overallFailed}${colors.reset}`);
  console.log(`  Skipped:        ${colors.dim}${aggregated.overallSkipped}${colors.reset}`);
  console.log(`  Pass Rate:      ${colors.bold}${passRate}%${colors.reset}`);
  console.log(
    `  Wall Clock:     ${colors.bold}${formatDuration(aggregated.overallWallClockDuration)}${colors.reset} ${colors.dim}(actual time elapsed)${colors.reset}`,
  );
  console.log(
    `  Sequential:     ${colors.dim}${formatDuration(aggregated.overallDuration)} (sum of all test durations)${colors.reset}`,
  );
  console.log(colors.dim + '-'.repeat(70) + colors.reset);
}

function main(): void {
  console.log();
  console.log(colors.bold + colors.blue + '='.repeat(70) + colors.reset);
  console.log(
    colors.bold + colors.blue + '                     TEST RESULTS SUMMARY' + colors.reset,
  );
  console.log(colors.bold + colors.blue + '='.repeat(70) + colors.reset);

  const aggregated = loadResults();

  if (aggregated.results.length === 0) {
    console.log();
    console.log(colors.yellow + 'No test results found. Run tests first.' + colors.reset);
    process.exit(0);
  }

  for (const result of aggregated.results) {
    printTestType(result);
  }

  printOverallSummary(aggregated);
  process.exit(aggregated.overallFailed > 0 ? 1 : 0);
}

main();
