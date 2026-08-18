type DateInput = string | Date | null | undefined;

function parseDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// --- String Formatters ---

export function formatEnum(value?: string | null): string {
  if (!value) return '-';
  return value.toLowerCase().split('_').map(capitalize).join(' ');
}

export function formatToolName(toolName: string): string {
  return toolName
    .replace(/^admin_/, '')
    .split('_')
    .map(capitalize)
    .join(' ');
}

export function trimToken(token: string, keep = 6): string {
  if (token.length <= keep * 2) return token;
  return `${token.slice(0, keep)}...${token.slice(-keep)}`;
}

export function truncateId(id: string, keep = 8): string {
  if (id.length <= keep) return id;
  return `${id.slice(0, keep)}...`;
}

// --- Date Formatters ---

export function formatDateTime(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatShortDate(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date);
}

export function formatRelativeTime(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '-';

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, 'second');
  }
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  return rtf.format(diffDays, 'day');
}

/**
 * Formats a future date as countdown (e.g., "2m 30s", "1h 5m")
 * For displaying time until expiration
 */
export function formatCountdown(date: Date | string): string {
  const target = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// --- Number Formatters ---

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// --- Value Formatters ---

/**
 * Formats a value for display in policy conditions.
 * Arrays are joined, objects are stringified, primitives are converted to string.
 */
export function formatConditionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
