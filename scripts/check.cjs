#!/usr/bin/env node
/**
 * Main check script that runs all quality checks.
 * If formatting fails, automatically runs formatter on only the failed files and retries.
 */
const { spawnSync } = require('child_process');

const STEPS = [
  { name: 'check:quality', label: 'Quality scan' },
  { name: 'check:format', label: 'Format check' },
  { name: 'check:lint', label: 'Linting' },
  { name: 'check:types', label: 'Type checking' },
  { name: 'check:test', label: 'Test code quality' },
  { name: 'check:build', label: 'Building' },
  { name: 'check:tests', label: 'Running tests' },
];

function runCommand(cmd) {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  return result.status === 0;
}

function getUnformattedFiles() {
  const result = spawnSync('prettier --list-different . --ignore-path .prettierignore', {
    shell: true,
    stdio: ['inherit', 'pipe', 'inherit'],
    cwd: process.cwd(),
  });
  if (result.stdout) {
    return result.stdout
      .toString()
      .split('\n')
      .filter((f) => f.trim());
  }
  return [];
}

function formatFiles(files) {
  if (files.length === 0) return true;
  const fileList = files.map((f) => `"${f}"`).join(' ');
  const result = spawnSync(`prettier --write ${fileList}`, {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  return result.status === 0;
}

function runChecks() {
  for (const step of STEPS) {
    console.log(`\n▶ Running ${step.label}...`);

    const success = runCommand(`pnpm ${step.name}`);

    if (!success) {
      // If format check fails, auto-fix only failed files and restart
      if (step.name === 'check:format') {
        const unformattedFiles = getUnformattedFiles();
        if (unformattedFiles.length > 0) {
          console.log(
            `\n⚠️  Format check failed. Formatting ${unformattedFiles.length} file(s)...\n`,
          );
          const formatSuccess = formatFiles(unformattedFiles);
          if (formatSuccess) {
            console.log('\n✅ Formatting complete. Restarting checks...\n');
            return runChecks(); // Restart from beginning
          } else {
            console.error('\n❌ Formatter failed');
            process.exit(1);
          }
        } else {
          console.error('\n❌ Format check failed but no files to fix');
          process.exit(1);
        }
      }

      console.error(`\n❌ ${step.label} failed`);
      process.exit(1);
    }
  }

  console.log('\n✅ All checks passed!\n');
}

runChecks();
