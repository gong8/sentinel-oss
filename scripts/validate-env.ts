#!/usr/bin/env npx tsx
/**
 * SENTINEL Environment Validation - Cross-platform
 * Validates required environment variables
 */
import { green, red, yellow } from './lib/colors.js';
import { loadEnv } from './lib/env.js';

async function main() {
  console.log('Validating environment variables...');

  // Load .env if exists
  await loadEnv();

  let errors = 0;

  function checkRequired(varName: string): void {
    if (!process.env[varName]) {
      console.log(`${red('ERROR:')} ${varName} is required but not set`);
      errors++;
    }
  }

  function checkRecommended(varName: string): void {
    if (!process.env[varName]) {
      console.log(`${yellow('WARNING:')} ${varName} is not set. Using defaults might be insecure.`);
    }
  }

  // Check required variables
  checkRequired('DATABASE_URL');
  checkRequired('ENCRYPTION_KEY');
  checkRequired('NODE_ENV');

  // Check recommended variables
  checkRecommended('SESSION_SECRET');
  checkRecommended('PROXY_API_KEY');
  checkRecommended('FRONTEND_URL');

  // Format validation
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey)) {
    console.log(`${red('ERROR:')} ENCRYPTION_KEY must be exactly 64 hex characters`);
    errors++;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.startsWith('postgresql://')) {
    console.log(`${red('ERROR:')} DATABASE_URL must start with postgresql://`);
    errors++;
  }

  if (errors === 0) {
    console.log(green('Environment validation passed.'));
    process.exit(0);
  } else {
    console.log(red(`Environment validation failed with ${errors} errors.`));
    process.exit(1);
  }
}

main().catch(console.error);
