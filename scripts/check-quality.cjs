#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
// Quality checks for source code

const { execSync } = require('child_process');

const errors = [];

// Check for disallowed patterns in source code (excluding generated files)
const disallowedPatterns = [
  { pattern: ' as any[^a-zA-Z]', description: 'Type assertion to any', useExtended: true },
  { pattern: ' as any$', description: 'Type assertion to any (end of line)', useExtended: true },
  { pattern: '@ts-ignore', description: 'TypeScript ignore comment', useExtended: false },
  {
    pattern: '@ts-expect-error',
    description: 'TypeScript expect-error comment',
    useExtended: false,
  },
  { pattern: 'eslint-disable', description: 'ESLint disable comment', useExtended: false },
];

console.log('🔍 Checking code quality...\n');

for (const { pattern, description, useExtended } of disallowedPatterns) {
  try {
    const grepFlag = useExtended ? '-rE' : '-r';
    const result = execSync(
      `grep ${grepFlag} "${pattern}" packages/*/src --include="*.ts" --include="*.tsx" --exclude-dir=generated 2>/dev/null || true`,
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
  console.error('❌ Quality check failed:\n');
  errors.forEach((e) => console.error(e));
  process.exit(1);
}

console.log('✅ Code quality checks passed');
