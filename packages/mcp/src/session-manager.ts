import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createHash } from 'crypto';
import { logger } from './logger.js';
import { createTransport } from './transport-factory.js';
import type { McpServer } from './types.js';
import { isPlainObject } from './utils.js';

interface SessionInfo {
  client: Client;
  transport: Transport;
  cleanup: () => Promise<void>;
  sessionId: string;
  mcpServerId: string;
  sessionSignature: string;
  createdAt: Date;
  lastUsedAt: Date;
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  // Type guard ensures value is Record<string, unknown>
  if (!isPlainObject(value)) {
    return JSON.stringify(value);
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function buildSessionSignature(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
): string {
  const payload = stableStringify({
    url: mcpServer.url,
    authType: mcpServer.authType,
    credentials,
  });

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Manages persistent MCP client sessions with proper session ID handling
 */
class McpSessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Generate a session key for a given MCP server, organization, and user.
   * SECURITY: Include organizationId to prevent cross-org session sharing.
   */
  private getSessionKey(mcpServerId: string, organizationId: string, userId?: string): string {
    return userId
      ? `${organizationId}:${mcpServerId}:${userId}`
      : `${organizationId}:${mcpServerId}`;
  }

  /**
   * Get or create a session for an MCP server.
   * SECURITY: organizationId is required to prevent cross-org session sharing.
   */
  async getSession(
    mcpServer: McpServer,
    credentials: Record<string, unknown> | null,
    organizationId: string,
    userId?: string,
  ): Promise<Client> {
    const sessionKey = this.getSessionKey(mcpServer.id, organizationId, userId);
    const sessionSignature = buildSessionSignature(mcpServer, credentials);

    // Check if we have an existing valid session
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      if (existing.sessionSignature !== sessionSignature) {
        await this.closeSession(sessionKey);
      } else {
        const age = Date.now() - existing.lastUsedAt.getTime();
        if (age < this.sessionTimeout) {
          existing.lastUsedAt = new Date();
          return existing.client;
        } else {
          // Session expired, clean it up
          await this.closeSession(sessionKey);
        }
      }
    }

    // Create new session
    return await this.createSession(mcpServer, credentials, sessionKey, sessionSignature);
  }

  /**
   * Create a new MCP client session with proper initialization
   */
  private async createSession(
    mcpServer: McpServer,
    credentials: Record<string, unknown> | null,
    sessionKey: string,
    sessionSignature: string,
  ): Promise<Client> {
    const client = new Client({ name: 'sentinel-proxy', version: '0.1.0' }, { capabilities: {} });

    const { transport, cleanup } = await createTransport(mcpServer, credentials);

    try {
      // Connect to upstream server - this does the initialize handshake
      await client.connect(transport);

      // Store session info
      const sessionInfo: SessionInfo = {
        client,
        transport,
        cleanup,
        sessionId: this.generateSessionId(),
        mcpServerId: mcpServer.id,
        sessionSignature,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      this.sessions.set(sessionKey, sessionInfo);

      logger.session(`Created new session for ${mcpServer.name} (${sessionKey})`);

      return client;
    } catch (error) {
      // Clean up on error
      try {
        await client.close();
      } catch (closeError) {
        logger.error('[MCP Session] Error closing client after failed connect:', closeError);
      }
      try {
        await cleanup();
      } catch (cleanupError) {
        logger.error(
          '[MCP Session] Error cleaning up transport after failed connect:',
          cleanupError,
        );
      }
      throw error;
    }
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (session) {
      try {
        await session.client.close();
      } catch (error) {
        logger.error(`[MCP Session] Error closing client ${sessionKey}:`, error);
      }
      try {
        await session.cleanup();
        logger.session(`Closed session ${sessionKey}`);
      } catch (error) {
        logger.error(`[MCP Session] Error cleaning up transport ${sessionKey}:`, error);
      }
      this.sessions.delete(sessionKey);
    }
  }

  /**
   * Close session for a specific MCP server and user.
   * Used when credentials need to be refreshed (e.g., after OAuth token refresh).
   * SECURITY: organizationId is required to prevent cross-org session sharing.
   */
  async closeSessionForServer(
    mcpServerId: string,
    organizationId: string,
    userId?: string,
  ): Promise<void> {
    const sessionKey = this.getSessionKey(mcpServerId, organizationId, userId);
    await this.closeSession(sessionKey);
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const keys = Array.from(this.sessions.keys());
    await Promise.all(keys.map((key) => this.closeSession(key)));
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const keysToClose: string[] = [];

    for (const [key, session] of this.sessions.entries()) {
      const age = now - session.lastUsedAt.getTime();
      if (age >= this.sessionTimeout) {
        keysToClose.push(key);
      }
    }

    await Promise.all(keysToClose.map((key) => this.closeSession(key)));

    if (keysToClose.length > 0) {
      logger.info(`[MCP Session] Cleaned up ${keysToClose.length} expired sessions`);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get session stats
   */
  getStats(): {
    totalSessions: number;
    sessions: Array<{ key: string; mcpServerId: string; age: number }>;
  } {
    const now = Date.now();
    return {
      totalSessions: this.sessions.size,
      sessions: Array.from(this.sessions.entries()).map(([key, session]) => ({
        key,
        mcpServerId: session.mcpServerId,
        age: now - session.createdAt.getTime(),
      })),
    };
  }
}

// Global singleton instance
export const mcpSessionManager = new McpSessionManager();

// Cleanup expired sessions every 5 minutes
/* istanbul ignore next -- @preserve Module-level timer runs at import time */
setInterval(
  () => {
    void mcpSessionManager.cleanupExpiredSessions();
  },
  5 * 60 * 1000,
);

// Cleanup all sessions on process exit
/* istanbul ignore next -- @preserve Process handlers run at import time */
process.on('SIGTERM', () => {
  void mcpSessionManager.closeAllSessions();
});

/* istanbul ignore next -- @preserve Process handlers run at import time */
process.on('SIGINT', () => {
  void mcpSessionManager.closeAllSessions();
});
