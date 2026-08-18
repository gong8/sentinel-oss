/**
 * Base logger utility with timestamps and nice formatting.
 * Extend this class to add domain-specific convenience methods.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface LogOptions {
  emoji?: string;
  prefix?: string;
  timestamp?: boolean;
}

export class BaseLogger {
  protected formatTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  protected formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = options?.timestamp !== false ? `[${this.formatTimestamp()}]` : '';
    const emoji = options?.emoji ?? this.getDefaultEmoji(level);
    const prefix = options?.prefix ? `[${options.prefix}]` : '';

    return `${timestamp} ${emoji} ${prefix} ${message}`.trim();
  }

  protected getDefaultEmoji(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return '🔍';
      case 'info':
        return 'ℹ️';
      case 'warn':
        return '⚠️';
      case 'error':
        return '❌';
      case 'success':
        return '✅';
      default:
        return '';
    }
  }

  debug(message: string, data?: unknown, options?: LogOptions): void {
    console.log(this.formatMessage('debug', message, options));
    if (data !== undefined) {
      console.log(data);
    }
  }

  info(message: string, data?: unknown, options?: LogOptions): void {
    console.log(this.formatMessage('info', message, options));
    if (data !== undefined) {
      console.log(data);
    }
  }

  success(message: string, data?: unknown, options?: LogOptions): void {
    console.log(this.formatMessage('success', message, options));
    if (data !== undefined) {
      console.log(data);
    }
  }

  warn(message: string, data?: unknown, options?: LogOptions): void {
    console.warn(this.formatMessage('warn', message, options));
    if (data !== undefined) {
      console.warn(data);
    }
  }

  error(message: string, error?: unknown, options?: LogOptions): void {
    console.error(this.formatMessage('error', message, options));
    if (error !== undefined) {
      console.error(error);
    }
  }
}
