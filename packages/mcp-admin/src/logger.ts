/**
 * MCP Admin-specific logger with convenience methods for admin operations.
 */

import { BaseLogger } from '@sentinel/shared';

class McpAdminLogger extends BaseLogger {
  startup(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '🚀' });
  }

  shutdown(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '👋' });
  }

  admin(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '👑' });
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

  confirmation(message: string, data?: unknown): void {
    this.info(message, data, { emoji: '⏳' });
  }
}

export const logger = new McpAdminLogger();

export type { LogLevel, LogOptions } from '@sentinel/shared';
