/**
 * Centralized logger utility with structured JSON logging for production
 * and human-readable format for development
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LogContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  [key: string]: unknown;
}

interface LogOptions {
  emoji?: string;
  prefix?: string;
  timestamp?: boolean;
}

interface JsonLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: unknown;
}

// Determine logging mode based on NODE_ENV
const isProduction = process.env.NODE_ENV === 'production';

class Logger {
  private context: LogContext = {};

  /**
   * Set global context that will be included in all log entries
   */
  setContext(ctx: LogContext): void {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Clear global context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Create a child logger with additional context
   */
  child(ctx: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.context = { ...this.context, ...ctx };
    return childLogger;
  }

  private formatTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  private formatHumanMessage(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = options?.timestamp !== false ? `[${this.formatTimestamp()}]` : '';
    const emoji = options?.emoji || this.getDefaultEmoji(level);
    const prefix = options?.prefix ? `[${options.prefix}]` : '';

    return `${timestamp} ${emoji} ${prefix} ${message}`.trim();
  }

  private readonly defaultEmojis: Record<LogLevel, string> = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    success: '✅',
  };

  private getDefaultEmoji(level: LogLevel): string {
    return this.defaultEmojis[level] ?? '';
  }

  private formatJsonEntry(
    level: LogLevel,
    message: string,
    data?: unknown,
    additionalContext?: LogContext,
  ): JsonLogEntry {
    const entry: JsonLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    // Merge global context with additional context
    const mergedContext = { ...this.context, ...additionalContext };
    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext;
    }

    if (data !== undefined) {
      // Handle Error objects specially
      if (data instanceof Error) {
        entry.data = {
          name: data.name,
          message: data.message,
          stack: data.stack,
        };
      } else {
        entry.data = data;
      }
    }

    return entry;
  }

  private log(
    level: LogLevel,
    logFn: typeof console.log,
    message: string,
    data?: unknown,
    options?: LogOptions,
    additionalContext?: LogContext,
  ): void {
    if (isProduction) {
      // JSON format for production - single line for log aggregators
      const entry = this.formatJsonEntry(level, message, data, additionalContext);
      logFn(JSON.stringify(entry));
    } else {
      // Human-readable format for development
      logFn(this.formatHumanMessage(level, message, options));
      if (data !== undefined) {
        logFn(data);
      }
    }
  }

  debug(message: string, data?: unknown, options?: LogOptions): void {
    this.log('debug', console.log, message, data, options);
  }

  info(message: string, data?: unknown, options?: LogOptions): void {
    this.log('info', console.log, message, data, options);
  }

  success(message: string, data?: unknown, options?: LogOptions): void {
    this.log('success', console.log, message, data, options);
  }

  warn(message: string, data?: unknown, options?: LogOptions): void {
    this.log('warn', console.warn, message, data, options);
  }

  error(message: string, error?: unknown, options?: LogOptions): void {
    this.log('error', console.error, message, error, options);
  }

  // Convenience methods with custom emojis
  startup(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '🚀' });
  }

  shutdown(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '👋' });
  }

  request(message: string, data?: unknown): void {
    this.debug(message, data, { emoji: '📨' });
  }

  response(message: string, data?: unknown): void {
    this.debug(message, data, { emoji: '📤' });
  }

  database(message: string, data?: unknown): void {
    this.debug(message, data, { emoji: '🗄️' });
  }

  security(message: string, data?: unknown): void {
    this.warn(message, data, { emoji: '🔒' });
  }

  policy(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '📋' });
  }

  tool(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '🔧' });
  }

  mcp(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '📡' });
  }

  health(message: string, data?: unknown): void {
    this.success(message, data, { emoji: '🏥' });
  }

  // Methods that accept context for request-scoped logging
  withContext(ctx: LogContext): {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: unknown) => void;
  } {
    return {
      debug: (message: string, data?: unknown) =>
        this.log('debug', console.log, message, data, undefined, ctx),
      info: (message: string, data?: unknown) =>
        this.log('info', console.log, message, data, undefined, ctx),
      warn: (message: string, data?: unknown) =>
        this.log('warn', console.warn, message, data, undefined, ctx),
      error: (message: string, error?: unknown) =>
        this.log('error', console.error, message, error, undefined, ctx),
    };
  }
}

export const logger = new Logger();
