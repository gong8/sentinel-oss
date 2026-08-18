import { isPlainObject } from './utils.js';

export type CredentialEntryType = 'text' | 'password' | 'number' | 'boolean' | 'json';

const CREDENTIAL_ENTRY_TYPES: readonly CredentialEntryType[] = [
  'text',
  'password',
  'number',
  'boolean',
  'json',
];

const CREDENTIAL_ENTRY_TYPE_SET: ReadonlySet<string> = new Set(CREDENTIAL_ENTRY_TYPES);

export function isCredentialEntryType(value: string): value is CredentialEntryType {
  return CREDENTIAL_ENTRY_TYPE_SET.has(value);
}

export interface CredentialEntry {
  id: string;
  key: string;
  type: CredentialEntryType;
  value: string;
}

const SENSITIVE_KEY_REGEX = /key|secret|token|password|credential|auth/i;

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function inferEntryType(key: string, value: unknown): CredentialEntryType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (isPlainObject(value)) return 'json';
  if (SENSITIVE_KEY_REGEX.test(key)) return 'password';
  return 'text';
}

export function createEmptyEntry(): CredentialEntry {
  return {
    id: generateId(),
    key: '',
    type: 'text',
    value: '',
  };
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isPlainObject(value)) return JSON.stringify(value, null, 2);
  if (value != null) return String(value);
  return '';
}

export function entriesFromObject(obj: Record<string, unknown>): CredentialEntry[] {
  return Object.entries(obj).map(([key, value]) => ({
    id: generateId(),
    key,
    type: inferEntryType(key, value),
    value: serializeValue(value),
  }));
}

export function entriesToObject(
  entries: CredentialEntry[],
  options: { reservedKeys?: string[] } = {},
): { value: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const output: Record<string, unknown> = {};
  const seenKeys = new Set<string>();
  const reservedKeys = new Set(options.reservedKeys ?? []);

  entries.forEach((entry, index) => {
    const key = entry.key.trim();
    if (!key) return;

    if (reservedKeys.has(key)) {
      errors.push(`Row ${index + 1}: "${key}" is reserved for SENTINEL metadata.`);
      return;
    }

    if (seenKeys.has(key)) {
      errors.push(`Row ${index + 1}: Duplicate key "${key}".`);
      return;
    }

    seenKeys.add(key);

    switch (entry.type) {
      case 'number': {
        const parsed = Number(entry.value);
        if (Number.isNaN(parsed)) {
          errors.push(`Row ${index + 1}: "${key}" must be a number.`);
        } else {
          output[key] = parsed;
        }
        break;
      }
      case 'boolean': {
        if (!entry.value) {
          output[key] = false;
          break;
        }
        if (entry.value === 'true' || entry.value === 'false') {
          output[key] = entry.value === 'true';
        } else {
          errors.push(`Row ${index + 1}: "${key}" must be true or false.`);
        }
        break;
      }
      case 'json': {
        if (!entry.value.trim()) {
          output[key] = {};
          break;
        }
        try {
          output[key] = JSON.parse(entry.value);
        } catch {
          errors.push(`Row ${index + 1}: "${key}" contains invalid JSON.`);
        }
        break;
      }
      case 'password':
      case 'text':
      default:
        output[key] = entry.value;
        break;
    }
  });

  return { value: output, errors };
}

export function coerceBooleanValue(value: string): string {
  return value === 'true' ? 'true' : 'false';
}

export function splitCredentials(credentials: Record<string, unknown> | null): {
  fields: Record<string, unknown>;
  headers: Record<string, unknown>;
  injectIntoToolParams: boolean;
} {
  if (!credentials) {
    return { fields: {}, headers: {}, injectIntoToolParams: false };
  }

  const headers = isPlainObject(credentials.headers) ? credentials.headers : {};
  const sentinel = isPlainObject(credentials._sentinel) ? credentials._sentinel : {};
  const injectIntoToolParams = Boolean(sentinel.injectIntoToolParams);

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (key !== 'headers' && key !== '_sentinel') {
      fields[key] = value;
    }
  }

  return { fields, headers, injectIntoToolParams };
}

export function buildCredentialsPayload(options: {
  fields: Record<string, unknown>;
  headers: Record<string, unknown>;
  injectIntoToolParams: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...options.fields };

  if (Object.keys(options.headers).length > 0) {
    payload.headers = options.headers;
  }

  if (options.injectIntoToolParams) {
    payload._sentinel = { injectIntoToolParams: true };
  }

  return payload;
}
