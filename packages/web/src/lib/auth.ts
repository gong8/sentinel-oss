/**
 * Authentication utilities
 * Manages access token storage and retrieval
 */

const STORAGE_KEYS = {
  accessToken: 'sentinel_access_token',
  isAdmin: 'sentinel_is_admin',
} as const;

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.accessToken);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.accessToken, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.isAdmin);
}

export function getIsAdmin(): boolean {
  return localStorage.getItem(STORAGE_KEYS.isAdmin) === 'true';
}

export function setIsAdmin(isAdmin: boolean): void {
  localStorage.setItem(STORAGE_KEYS.isAdmin, String(isAdmin));
}
