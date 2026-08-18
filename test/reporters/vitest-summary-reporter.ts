/**
 * Custom Vitest Reporter for Summary Generation (Vitest 4.x compatible)
 *
 * Outputs JSON results to a file for later aggregation.
 * Preserves default terminal output by being used alongside 'default' reporter.
 */

import fs from 'fs';
import path from 'path';
import type { Reporter, TestModule } from 'vitest/node';
import type { TestCategoryResult, TestFailure, TestFileResult, TestTypeResult } from './types';

interface ReporterOptions {
  testType?: 'unit' | 'integration' | 'security';
}

export default class VitestSummaryReporter implements Reporter {
  private startTime = 0;
  private testType: 'unit' | 'integration' | 'security';

  constructor(options: ReporterOptions = {}) {
    this.testType =
      options.testType || (process.env.TEST_TYPE as 'unit' | 'integration' | 'security') || 'unit';
  }

  onInit(): void {
    this.startTime = Date.now();
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const categories = this.aggregateByCategory(testModules);
    const wallClockDuration = Date.now() - this.startTime;

    const result: TestTypeResult = {
      type: this.testType,
      timestamp: new Date().toISOString(),
      totalPassed: categories.reduce((sum, c) => sum + c.passed, 0),
      totalFailed: categories.reduce((sum, c) => sum + c.failed, 0),
      totalSkipped: categories.reduce((sum, c) => sum + c.skipped, 0),
      totalDuration: categories.reduce((sum, c) => sum + c.duration, 0),
      wallClockDuration,
      categories,
    };

    const outputDir = path.resolve(process.cwd(), 'test/results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `${this.testType}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  }

  private aggregateByCategory(testModules: ReadonlyArray<TestModule>): TestCategoryResult[] {
    const categoryMap = new Map<string, TestCategoryResult>();

    for (const module of testModules) {
      const relativePath = this.getRelativePath(module.moduleId);
      const category = this.extractCategory(relativePath);

      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          name: category,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          tests: [],
        });
      }

      const cat = categoryMap.get(category)!;
      const fileResult = this.processModule(module, relativePath);

      cat.passed += fileResult.passed;
      cat.failed += fileResult.failed;
      cat.skipped += fileResult.skipped;
      cat.duration += fileResult.duration;
      cat.tests.push(fileResult);
    }

    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private getRelativePath(moduleId: string): string {
    const testDir = path.resolve(process.cwd(), 'test');
    return path.relative(testDir, moduleId);
  }

  private extractCategory(relativePath: string): string {
    // Extract category from path like "unit/api/services/policy.test.ts"
    // Returns "api/services"
    const parts = relativePath.split(path.sep);
    // Skip the first part (unit/integration/security) and last part (filename)
    if (parts.length >= 3) {
      return parts.slice(1, -1).join('/');
    }
    // Fallback for files directly in type folder
    return parts.length >= 2 ? parts[1].replace('.test.ts', '') : 'root';
  }

  private processModule(module: TestModule, relativePath: string): TestFileResult {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let duration = 0;
    const failures: TestFailure[] = [];

    // Iterate through all tests in the module using the new API
    for (const test of module.children.allTests()) {
      const result = test.result();
      const diagnostic = test.diagnostic();
      duration += diagnostic?.duration ?? 0;

      if (test.options.mode === 'skip' || test.options.mode === 'todo') {
        skipped++;
      } else if (result.state === 'passed') {
        passed++;
      } else if (result.state === 'failed') {
        failed++;
        // Capture failure details
        if (result.errors && result.errors.length > 0) {
          for (const error of result.errors) {
            failures.push({
              testName: test.name,
              file: relativePath,
              error: error.message || String(error),
              stack: error.stack || '',
              expected: this.extractExpected(error),
              actual: this.extractActual(error),
            });
          }
        }
      } else if (result.state === 'skipped') {
        skipped++;
      }
    }

    return {
      file: relativePath,
      passed,
      failed,
      skipped,
      duration,
      failures: failures.length > 0 ? failures : undefined,
    };
  }

  private extractExpected(error: { expected?: unknown }): string | undefined {
    if ('expected' in error && error.expected !== undefined) {
      return typeof error.expected === 'string' ? error.expected : JSON.stringify(error.expected);
    }
    return undefined;
  }

  private extractActual(error: { actual?: unknown }): string | undefined {
    if ('actual' in error && error.actual !== undefined) {
      return typeof error.actual === 'string' ? error.actual : JSON.stringify(error.actual);
    }
    return undefined;
  }
}
