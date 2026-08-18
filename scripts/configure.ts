#!/usr/bin/env npx tsx
/**
 * SENTINEL Configuration - Cross-platform interactive configuration
 * Manages .env file settings
 */
import $ from 'dax-sh';
import { blue, green, red, yellow } from './lib/colors.js';
import { envExists, getEnvValue, randomHex, setEnvValue } from './lib/env.js';

function statusText(value: string): string {
  return value ? green('configured') : yellow('not set');
}

async function showMenu(): Promise<void> {
  const frontendUrl = await getEnvValue('FRONTEND_URL');
  const openai = await getEnvValue('OPENAI_API_KEY');
  const anthropic = await getEnvValue('ANTHROPIC_API_KEY');
  const gemini = await getEnvValue('GEMINI_API_KEY');
  const model = (await getEnvValue('LLM_MODEL')) || '(provider default)';
  const resend = await getEnvValue('RESEND_API_KEY');
  const emailFrom = await getEnvValue('EMAIL_FROM');

  console.log(blue('What would you like to configure?'));
  console.log();
  console.log(blue('  Deployment'));
  console.log(`  1) URL                 - ${frontendUrl || 'http://localhost'}`);
  console.log();
  console.log(blue('  LLM Providers (priority: OpenAI > Claude > Gemini)'));
  console.log(`  2) OpenAI API Key      - ${statusText(openai)}`);
  console.log(`  3) Anthropic API Key   - ${statusText(anthropic)}`);
  console.log(`  4) Gemini API Key      - ${statusText(gemini)}`);
  console.log(`  5) Default Model       - ${model}`);
  console.log();
  console.log(blue('  Email'));
  console.log(`  6) Resend API Key      - ${statusText(resend)}`);
  console.log(`  7) Email Sender        - ${emailFrom || '(not set)'}`);
  console.log();
  console.log(blue('  System'));
  console.log('  8) Regenerate Secrets  - Generate new encryption keys');
  console.log('  9) Show Current Config - Display all settings');
  console.log('  10) Restart Services   - Apply changes');
  console.log('  q) Quit');
  console.log();
}

async function configureUrl(): Promise<void> {
  console.log(blue('Deployment URL Configuration'));
  const currentFrontend = await getEnvValue('FRONTEND_URL');
  const currentApi = await getEnvValue('API_URL');
  console.log(`Current Frontend: ${currentFrontend || 'http://localhost'}`);
  console.log(`Current API:      ${currentApi || 'http://localhost:3000'}`);
  console.log(`OAuth Callback:   ${currentApi || 'http://localhost:3000'}/api/oauth/callback`);
  console.log();
  console.log('Examples:');
  console.log('  - Local:      http://localhost');
  console.log('  - Custom:     http://sentinel');
  console.log('  - Production: https://sentinel.yourdomain.com');
  console.log();

  const newUrl = await $.maybePrompt('New URL (Enter to keep current):');
  if (!newUrl) return;

  let url = newUrl;
  // Normalize URL - add http:// if no protocol
  if (!url.match(/^https?:\/\//)) {
    url = `http://${url}`;
    console.log('  (Added http:// prefix)');
  }

  // Extract protocol and host
  const isHttps = url.startsWith('https://');
  const host = url
    .replace(/^https?:\/\//, '')
    .split(':')[0]
    .split('/')[0];

  await setEnvValue('FRONTEND_URL', url);

  const apiUrl = isHttps ? `${url}/api` : `http://${host}:3000`;
  await setEnvValue('API_URL', apiUrl);

  console.log(green('✓ Updated deployment URL'));
  console.log(`  Frontend: ${url}`);
  console.log(`  API:      ${apiUrl}`);
  console.log(`  OAuth:    ${apiUrl}/api/oauth/callback`);

  // Check if custom hostname needs hosts entry
  if (host !== 'localhost' && !host.includes('.')) {
    // Simple hostname - might need hosts entry
    const net = await import('net');
    const canResolve = await new Promise<boolean>((resolve) => {
      const lookup = net.createConnection({ host, port: 80 });
      lookup.on('error', () => resolve(false));
      lookup.on('connect', () => {
        lookup.destroy();
        resolve(true);
      });
      setTimeout(() => {
        lookup.destroy();
        resolve(false);
      }, 1000);
    });

    if (!canResolve) {
      console.log();
      const addHosts = await $.confirm(`Add '${host}' to hosts file? (requires admin)`);
      if (addHosts) {
        const isWindows = process.platform === 'win32';
        const hostsPath = isWindows
          ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`
          : '/etc/hosts';

        try {
          const hostsContent = await $.path(hostsPath).readText();
          if (!hostsContent.match(new RegExp(`^127\\.0\\.0\\.1\\s+${host}`, 'm'))) {
            if (isWindows) {
              console.log(yellow('On Windows, please add this line to your hosts file manually:'));
              console.log(`  127.0.0.1 ${host}`);
            } else {
              await $`sudo tee -a ${hostsPath}`.stdinText(`127.0.0.1 ${host}\n`).quiet();
              console.log(green(`✓ Added '${host}' to hosts file`));
            }
          } else {
            console.log('Entry already exists in hosts file');
          }
        } catch (e) {
          console.log(yellow(`Could not modify hosts file: ${e}`));
        }
      }
    }
  }
}

async function configureApiKey(
  name: string,
  envKey: string,
  url: string,
  description: string,
): Promise<void> {
  console.log(blue(name));
  console.log(`Get your key from: ${url}`);
  console.log(`Used for: ${description}`);
  console.log();

  const current = await getEnvValue(envKey);
  if (current) {
    console.log(`Current: ${current.slice(0, 10)}...${current.slice(-4)}`);
  }

  const key = await $.maybePrompt("API Key (Enter to keep current, 'clear' to remove):");

  if (key === 'clear') {
    await setEnvValue(envKey, '');
    console.log(yellow(`✓ Cleared ${name}`));
  } else if (key) {
    await setEnvValue(envKey, key);
    console.log(green(`✓ Updated ${name}`));
  }
}

async function configureModel(): Promise<void> {
  console.log(blue('Default LLM Model Configuration'));
  const current = await getEnvValue('LLM_MODEL');
  const openaiKey = await getEnvValue('OPENAI_API_KEY');
  const anthropicKey = await getEnvValue('ANTHROPIC_API_KEY');
  const geminiKey = await getEnvValue('GEMINI_API_KEY');

  console.log(`Current: ${current || '(provider default)'}`);
  console.log();
  console.log('Provider priority (when set to "auto"): OpenAI > Claude > Gemini');
  console.log(`  - OpenAI:    ${statusText(openaiKey)}`);
  console.log(`  - Claude:    ${statusText(anthropicKey)}`);
  console.log(`  - Gemini:    ${statusText(geminiKey)}`);
  console.log();
  console.log('Note: Organizations can override this in Settings > AI / LLM');
  console.log();
  console.log('Available models:');
  console.log(blue('  OpenAI:'));
  console.log('    1) gpt-4o              (balanced, recommended)');
  console.log('    2) gpt-4o-mini         (fast, economical)');
  console.log('    3) gpt-4-turbo         (capable)');
  console.log(blue('  Claude:'));
  console.log('    4) claude-sonnet-4-20250514  (balanced)');
  console.log('    5) claude-opus-4-20250514    (most capable)');
  console.log(blue('  Gemini:'));
  console.log('    6) gemini-2.0-flash    (fast)');
  console.log('    7) gemini-2.5-flash    (latest)');
  console.log('    8) gemini-2.5-pro      (most capable)');
  console.log();
  console.log('  0) Auto (use provider default)');
  console.log('  c) Custom model name');
  console.log();

  const choice = await $.maybePrompt('Choice [Enter to keep current]:');

  const models: Record<string, string> = {
    '1': 'gpt-4o',
    '2': 'gpt-4o-mini',
    '3': 'gpt-4-turbo',
    '4': 'claude-sonnet-4-20250514',
    '5': 'claude-opus-4-20250514',
    '6': 'gemini-2.0-flash',
    '7': 'gemini-2.5-flash',
    '8': 'gemini-2.5-pro',
  };

  if (choice === '0') {
    await setEnvValue('LLM_MODEL', '');
    console.log(green('✓ Set to auto (provider default)'));
  } else if (choice && models[choice]) {
    await setEnvValue('LLM_MODEL', models[choice]);
    console.log(green(`✓ Set to ${models[choice]}`));
  } else if (choice?.toLowerCase() === 'c') {
    const customModel = await $.maybePrompt('Enter custom model name:');
    if (customModel) {
      await setEnvValue('LLM_MODEL', customModel);
      console.log(green(`✓ Set to ${customModel}`));
    }
  } else if (choice) {
    console.log(red('Invalid choice'));
  }
}

async function configureEmail(): Promise<void> {
  console.log(blue('Email Sender Address'));
  console.log(`Current: ${(await getEnvValue('EMAIL_FROM')) || '(not set)'}`);
  console.log();
  console.log('Format: Sentinel <notifications@yourdomain.com>');
  console.log('Note: Domain must be verified in Resend, or use onboarding@resend.dev for testing');
  console.log();

  const email = await $.maybePrompt('Sender email address (Enter to keep current):');
  if (email) {
    await setEnvValue('EMAIL_FROM', `"Sentinel <${email}>"`);
    console.log(green('✓ Updated email sender'));
  }
}

async function regenerateSecrets(): Promise<void> {
  console.log(yellow('Warning: This will regenerate all encryption keys.'));
  console.log('Existing encrypted data (credentials) will become unreadable!');
  console.log();

  const confirm = await $.prompt("Are you sure? (type 'yes' to confirm):");

  if (confirm === 'yes') {
    await setEnvValue('ENCRYPTION_KEY', randomHex(32));
    await setEnvValue('SESSION_SECRET', randomHex(32));
    await setEnvValue('PROXY_API_KEY', randomHex(32));

    console.log(green('✓ Regenerated all secrets'));
    console.log(yellow("Note: You'll need to re-enter any saved credentials in the UI."));
  } else {
    console.log('Cancelled.');
  }
}

async function showConfig(): Promise<void> {
  console.log(blue('Current Configuration'));
  console.log('================================================');
  const apiUrl = await getEnvValue('API_URL');
  console.log('Deployment:');
  console.log(`  FRONTEND_URL:      ${(await getEnvValue('FRONTEND_URL')) || 'http://localhost'}`);
  console.log(`  API_URL:           ${apiUrl || 'http://localhost:3000'}`);
  console.log(`  OAuth Callback:    ${apiUrl || 'http://localhost:3000'}/api/oauth/callback`);
  console.log();
  console.log('LLM Configuration:');
  const openai = await getEnvValue('OPENAI_API_KEY');
  const anthropic = await getEnvValue('ANTHROPIC_API_KEY');
  const gemini = await getEnvValue('GEMINI_API_KEY');
  const model = await getEnvValue('LLM_MODEL');
  console.log(`  OPENAI_API_KEY:    ${openai ? openai.slice(0, 10) + '...' : '(not set)'}`);
  console.log(`  ANTHROPIC_API_KEY: ${anthropic ? anthropic.slice(0, 10) + '...' : '(not set)'}`);
  console.log(`  GEMINI_API_KEY:    ${gemini ? gemini.slice(0, 10) + '...' : '(not set)'}`);
  console.log(`  LLM_MODEL:         ${model || '(provider default)'}`);

  // Show active provider based on priority
  if (openai) {
    console.log(`  Active Provider:   ${green('OpenAI')} (priority 1)`);
  } else if (anthropic) {
    console.log(`  Active Provider:   ${green('Claude')} (priority 2)`);
  } else if (gemini) {
    console.log(`  Active Provider:   ${green('Gemini')} (priority 3)`);
  } else {
    console.log(`  Active Provider:   ${red('None (no API key set)')}`);
  }
  console.log(`  Local Providers:   ${green('Available')} (Ollama, LM Studio, custom)`);
  console.log();
  console.log('Email:');
  const resend = await getEnvValue('RESEND_API_KEY');
  console.log(`  RESEND_API_KEY:    ${resend ? resend.slice(0, 10) + '...' : '(not set)'}`);
  console.log(`  EMAIL_FROM:        ${(await getEnvValue('EMAIL_FROM')) || '(not set)'}`);
  console.log();
  console.log('Database:');
  const dbUrl = await getEnvValue('DATABASE_URL');
  console.log(`  DATABASE_URL:      ${dbUrl?.replace(/:.*@/, ':***@') || '(not set)'}`);
  console.log('================================================');
  console.log();
  console.log('Note: Organizations can override LLM settings in Settings > AI / LLM');
}

async function restartServices(): Promise<void> {
  console.log('Restarting services to apply changes...');

  try {
    const output = await $`docker compose ps --quiet`.noThrow().text();
    if (output.trim()) {
      await $`docker compose restart api`;
      console.log(green('✓ Services restarted'));
    } else {
      console.log(yellow('Docker services not running. Start with: docker compose up -d'));
    }
  } catch {
    console.log(yellow('Docker services not running. Start with: docker compose up -d'));
  }
}

async function main() {
  // Check .env exists
  if (!(await envExists())) {
    console.log(red('Error: .env file not found. Run pnpm setup first.'));
    process.exit(1);
  }

  console.log(blue('SENTINEL Configuration'));
  console.log();

  // Main loop
  while (true) {
    console.log();
    await showMenu();
    const choice = await $.prompt('Choice:');
    console.log();

    switch (choice.toLowerCase()) {
      case '1':
        await configureUrl();
        break;
      case '2':
        await configureApiKey(
          'OpenAI API Key',
          'OPENAI_API_KEY',
          'https://platform.openai.com',
          'AI agent (priority 1)',
        );
        break;
      case '3':
        await configureApiKey(
          'Anthropic API Key',
          'ANTHROPIC_API_KEY',
          'https://console.anthropic.com',
          'AI agent (priority 2)',
        );
        break;
      case '4':
        await configureApiKey(
          'Gemini API Key',
          'GEMINI_API_KEY',
          'https://aistudio.google.com/apikey',
          'AI agent (priority 3)',
        );
        break;
      case '5':
        await configureModel();
        break;
      case '6':
        await configureApiKey(
          'Resend API Key',
          'RESEND_API_KEY',
          'https://resend.com/api-keys',
          'Email webhook notifications',
        );
        break;
      case '7':
        await configureEmail();
        break;
      case '8':
        await regenerateSecrets();
        break;
      case '9':
        await showConfig();
        break;
      case '10':
        await restartServices();
        break;
      case 'q':
        console.log('Goodbye!');
        process.exit(0);
        break;
      default:
        console.log(red('Invalid choice'));
    }
  }
}

main().catch(console.error);
