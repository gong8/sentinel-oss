/**
 * Centralized logger utility for A2A proxy with timestamps and nice formatting
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LogOptions {
  emoji?: string;
  prefix?: string;
  timestamp?: boolean;
}

class Logger {
  private formatTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  private formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = options?.timestamp !== false ? `[${this.formatTimestamp()}]` : '';
    const emoji = options?.emoji || this.getDefaultEmoji(level);
    const prefix = options?.prefix ? `[${options.prefix}]` : '';

    return `${timestamp} ${emoji} ${prefix} ${message}`.trim();
  }

  private getDefaultEmoji(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return '[DEBUG]';
      case 'info':
        return '[INFO]';
      case 'warn':
        return '[WARN]';
      case 'error':
        return '[ERROR]';
      case 'success':
        return '[OK]';
      default:
        return '';
    }
  }

  private log(level: LogLevel, message: string, data?: unknown, options?: LogOptions): void {
    const formattedMessage = this.formatMessage(level, message, options);
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(formattedMessage);
    if (data !== undefined) {
      logFn(data);
    }
  }

  debug(message: string, data?: unknown, options?: LogOptions): void {
    this.log('debug', message, data, options);
  }

  info(message: string, data?: unknown, options?: LogOptions): void {
    this.log('info', message, data, options);
  }

  success(message: string, data?: unknown, options?: LogOptions): void {
    this.log('success', message, data, options);
  }

  warn(message: string, data?: unknown, options?: LogOptions): void {
    this.log('warn', message, data, options);
  }

  error(message: string, error?: unknown, options?: LogOptions): void {
    this.log('error', message, error, options);
  }

  // Convenience methods with custom emojis
  startup(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '[STARTUP]' });
  }

  shutdown(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '[SHUTDOWN]' });
  }

  request(message: string, data?: unknown): void {
    this.debug(message, data, { emoji: '[REQUEST]' });
  }

  response(message: string, data?: unknown): void {
    this.debug(message, data, { emoji: '[RESPONSE]' });
  }

  security(message: string, data?: unknown): void {
    this.warn(message, data, { emoji: '[SECURITY]' });
  }

  a2a(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '[A2A]' });
  }

  card(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '[CARD]' });
  }

  proxy(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '[PROXY]' });
  }

  health(message: string, data?: unknown): void {
    this.success(message, data, { emoji: '[HEALTH]' });
  }
}

export const logger = new Logger();
