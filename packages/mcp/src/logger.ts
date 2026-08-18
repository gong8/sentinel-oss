/**
 * MCP-specific logger with convenience methods for MCP operations.
 */

import { BaseLogger } from '@sentinel/shared';

class McpLogger extends BaseLogger {
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

  session(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '🔌' });
  }
}

export const logger = new McpLogger();

export type { LogLevel, LogOptions } from '@sentinel/shared';
