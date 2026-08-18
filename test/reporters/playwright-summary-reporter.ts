/**
 * Custom Playwright Reporter for Summary Generation
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import type { TestCategoryResult, TestFailure, TestFileResult, TestTypeResult } from './types';

interface ReporterOptions {
  outputFile?: string;
}

interface FileData {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

class PlaywrightSummaryReporter implements Reporter {
  private outputFile: string;
  private startTime = 0;
  private testResults = new Map<string, FileData>();

  constructor(options: ReporterOptions = {}) {
    this.outputFile = options.outputFile ?? path.resolve(process.cwd(), 'test/results/e2e.json');
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();
    this.testResults.clear();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const specName = path.basename(test.location.file, '.spec.ts');
    const relativePath = `e2e/${specName}.spec.ts`;

    if (!this.testResults.has(specName)) {
      this.testResults.set(specName, {
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        failures: [],
      });
    }

    const fileResult = this.testResults.get(specName)!;
    fileResult.duration += result.duration;

    if (result.status === 'passed') {
      fileResult.passed++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      fileResult.failed++;
      // Capture failure details
      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          fileResult.failures.push({
            testName: test.title,
            file: relativePath,
            error: error.message || String(error),
            stack: error.stack || '',
          });
        }
      } else if (result.status === 'timedOut') {
        fileResult.failures.push({
          testName: test.title,
          file: relativePath,
          error: `Test timed out after ${test.timeout}ms`,
          stack: '',
        });
      }
    } else if (result.status === 'skipped') {
      fileResult.skipped++;
    }
  }

  onEnd(_result: FullResult): void {
    const categories: TestCategoryResult[] = [];

    for (const [name, data] of this.testResults) {
      const fileResult: TestFileResult = {
        file: `${name}.spec.ts`,
        passed: data.passed,
        failed: data.failed,
        skipped: data.skipped,
        duration: data.duration,
        failures: data.failures.length > 0 ? data.failures : undefined,
      };

      categories.push({
        name,
        passed: data.passed,
        failed: data.failed,
        skipped: data.skipped,
        duration: data.duration,
        tests: [fileResult],
      });
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));

    const wallClockDuration = Date.now() - this.startTime;

    const testResult: TestTypeResult = {
      type: 'e2e',
      timestamp: new Date().toISOString(),
      totalPassed: categories.reduce((sum, c) => sum + c.passed, 0),
      totalFailed: categories.reduce((sum, c) => sum + c.failed, 0),
      totalSkipped: categories.reduce((sum, c) => sum + c.skipped, 0),
      totalDuration: categories.reduce((sum, c) => sum + c.duration, 0),
      wallClockDuration,
      categories,
    };

    const outputDir = path.dirname(this.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(this.outputFile, JSON.stringify(testResult, null, 2));
  }
}

export default PlaywrightSummaryReporter;
