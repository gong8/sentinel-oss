/**
 * Cross-platform .env file utilities
 */
import $ from 'dax-sh';

const envPath = $.path('.env');

/**
 * Load .env file into environment
 */
export async function loadEnv(): Promise<void> {
  if (await envPath.exists()) {
    const content = await envPath.readText();
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          // Remove quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (key) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

/**
 * Get value from .env file
 */
export async function getEnvValue(key: string): Promise<string> {
  if (!(await envPath.exists())) return '';

  const content = await envPath.readText();
  for (const line of content.split('\n')) {
    const match = line.match(new RegExp(`^${key}=(.*)$`));
    if (match) {
      let value = match[1].trim();
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }
  return '';
}

/**
 * Set or add a value in .env file
 */
export async function setEnvValue(key: string, value: string): Promise<void> {
  if (!(await envPath.exists())) {
    await envPath.writeText(`${key}=${value}\n`);
    return;
  }

  const content = await envPath.readText();
  const lines = content.split('\n');
  let found = false;
  const newLines: string[] = [];

  for (const line of lines) {
    if (line.match(new RegExp(`^${key}=`))) {
      newLines.push(`${key}=${value}`);
      found = true;
    } else if (line.match(new RegExp(`^#\\s*${key}=`))) {
      // Uncomment and set
      newLines.push(`${key}=${value}`);
      found = true;
    } else {
      newLines.push(line);
    }
  }

  if (!found) {
    newLines.push(`${key}=${value}`);
  }

  await envPath.writeText(newLines.join('\n'));
}

/**
 * Check if .env file exists
 */
export async function envExists(): Promise<boolean> {
  return envPath.exists();
}

/**
 * Generate random hex string
 */
export function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate random base64 string (URL-safe)
 */
export function randomBase64(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Buffer.from(array)
    .toString('base64')
    .replace(/\//g, '')
    .replace(/\+/g, '')
    .slice(0, length);
}
