/**
 * Shared types for test result aggregation
 */

export interface TestFailure {
  testName: string;
  file: string;
  error: string;
  stack: string;
  expected?: string;
  actual?: string;
}

export interface TestFileResult {
  file: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures?: TestFailure[];
}

export interface TestCategoryResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestFileResult[];
}

export interface TestTypeResult {
  type: 'unit' | 'integration' | 'security' | 'e2e';
  timestamp: string;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  /** Sum of individual test durations (as if run sequentially) */
  totalDuration: number;
  /** Actual wall-clock time elapsed */
  wallClockDuration: number;
  categories: TestCategoryResult[];
}

export interface AggregatedResults {
  results: TestTypeResult[];
  overallPassed: number;
  overallFailed: number;
  overallSkipped: number;
  /** Sum of all test durations (as if run sequentially) */
  overallDuration: number;
  /** Actual wall-clock time (sum of individual test type wall-clock times, as they run sequentially) */
  overallWallClockDuration: number;
}
