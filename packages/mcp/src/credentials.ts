import { isPlainObject, isSensitiveKey, mergeDeep } from './utils.js';

const RESERVED_KEYS = new Set(['headers', 'toolParams', '_sentinel']);

export type CredentialObject = Record<string, unknown>;

export interface CredentialMeta {
  injectIntoToolParams: boolean;
}

export { isPlainObject, isSensitiveKey };

export function extractCredentialMeta(credentials: CredentialObject | null): CredentialMeta {
  if (!credentials || !isPlainObject(credentials._sentinel)) {
    return { injectIntoToolParams: false };
  }

  const injectIntoToolParams = Boolean(credentials._sentinel.injectIntoToolParams);
  return { injectIntoToolParams };
}

export function extractHeaderOverrides(
  credentials: CredentialObject | null,
): Record<string, string> {
  if (!credentials || !isPlainObject(credentials.headers)) {
    return {};
  }

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials.headers)) {
    if (value === undefined) continue;
    overrides[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return overrides;
}

export function stripReservedCredentials(credentials: CredentialObject): CredentialObject {
  const stripped: CredentialObject = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (RESERVED_KEYS.has(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}

export function extractInjectedToolParams(
  credentials: CredentialObject | null,
): CredentialObject | null {
  if (!credentials) {
    return null;
  }

  const meta = extractCredentialMeta(credentials);
  const toolParams = isPlainObject(credentials.toolParams) ? credentials.toolParams : {};

  if (meta.injectIntoToolParams) {
    const payload = stripReservedCredentials(credentials);
    return mergeDeep(payload, toolParams);
  }

  if (Object.keys(toolParams).length > 0) {
    return toolParams;
  }

  return null;
}

function getStringCredential(
  credentials: CredentialObject | null,
  key: string,
): string | undefined {
  const value = credentials?.[key];
  return typeof value === 'string' ? value : undefined;
}

function hasNonEmptyString(credentials: CredentialObject | null, key: string): boolean {
  const value = getStringCredential(credentials, key);
  return value !== undefined && value.trim().length > 0;
}

function getAuthTokenKey(authType: 'NONE' | 'OAUTH' | 'API_KEY'): string | null {
  switch (authType) {
    case 'API_KEY':
      return 'apiKey';
    case 'OAUTH':
      return 'accessToken';
    default:
      return null;
  }
}

export function buildCredentialHeaders(
  authType: 'NONE' | 'OAUTH' | 'API_KEY',
  credentials: CredentialObject | null,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const tokenKey = getAuthTokenKey(authType);
  if (tokenKey) {
    const token = getStringCredential(credentials, tokenKey);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return { ...headers, ...extractHeaderOverrides(credentials) };
}

export function hasAuthMaterial(credentials: CredentialObject | null): boolean {
  if (!credentials) {
    return false;
  }

  return (
    hasNonEmptyString(credentials, 'apiKey') ||
    hasNonEmptyString(credentials, 'accessToken') ||
    (isPlainObject(credentials.headers) && Object.keys(credentials.headers).length > 0)
  );
}
