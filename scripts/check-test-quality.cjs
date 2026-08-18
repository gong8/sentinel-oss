#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
// Quality checks for test code

const { execSync } = require('child_process');

const errors = [];

// Check for disallowed patterns in test code
const disallowedPatterns = [
  { pattern: 'as any', description: 'Type assertion to any' },
  { pattern: '@ts-ignore', description: 'TypeScript ignore comment' },
  { pattern: '@ts-expect-error', description: 'TypeScript expect-error comment' },
  // Allow 'no-empty-pattern' exception for Playwright fixtures (required by API)
  // Disallow all other eslint-disable comments
  {
    pattern: 'eslint-disable(?!-next-line no-empty-pattern)',
    description: 'ESLint disable comment (except no-empty-pattern for Playwright fixtures)',
  },
  { pattern: '\\.skip\\(\\)', description: 'Unconditionally skipped test' },
  { pattern: '\\.only\\(', description: 'Focused test (.only)' },
];

console.log('🔍 Checking test code quality...\n');

for (const { pattern, description } of disallowedPatterns) {
  try {
    const result = execSync(
      `grep -rE "${pattern}" test --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      { encoding: 'utf-8' },
    );
    if (result.trim()) {
      errors.push(`Found "${pattern}" (${description}):\n${result}`);
    }
  } catch {
    // grep returns non-zero if no matches, which is fine
  }
}

if (errors.length > 0) {
  console.error('❌ Test quality check failed:\n');
  errors.forEach((e) => console.error(e));
  process.exit(1);
}

console.log('✅ Test code quality checks passed');
