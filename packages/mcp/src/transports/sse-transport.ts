import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger.js';
import type {
  ClientTransportResult,
  ConnectionState,
  ManagedTransport,
  SseTransportConfig,
  TransportStats,
} from './types.js';

/**
 * SSE Client Transport for legacy MCP servers
 *
 * This wraps the MCP SDK's SSEClientTransport to add:
 * - Connection state tracking
 * - Statistics collection
 * - Reconnection support
 *
 * SSE transport works differently from Streamable HTTP:
 * - Server to Client: SSE stream (text/event-stream)
 * - Client to Server: HTTP POST to a message endpoint
 *
 * The message endpoint is provided by the server via an 'endpoint' SSE event.
 */
class SseClientTransport implements ManagedTransport {
  private sseTransport: SSEClientTransport | null = null;
  private readonly url: URL;
  private readonly headers: Record<string, string>;
  private _state: ConnectionState = 'disconnected';
  private readonly stats: TransportStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesIn: 0,
    bytesOut: 0,
    connectionAttempts: 0,
  };

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  sessionId?: string;

  constructor(url: URL, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers ?? {};
    this.sessionId = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  get state(): ConnectionState {
    return this._state;
  }

  private createTransport(): SSEClientTransport {
    const transport = new SSEClientTransport(this.url, {
      requestInit: {
        headers: this.headers,
      },
    });

    transport.onclose = () => {
      this._state = 'disconnected';
      logger.session(`SSE connection closed: ${this.url.href}`);
      this.onclose?.();
    };

    transport.onerror = (error: Error) => {
      this._state = 'error';
      this.stats.lastErrorAt = new Date();
      this.stats.lastError = error.message;
      logger.error(`SSE transport error: ${this.url.href}`, error);
      this.onerror?.(error);
    };

    transport.onmessage = (message: JSONRPCMessage) => {
      this.stats.messagesReceived++;
      this.stats.bytesIn += JSON.stringify(message).length;
      this.onmessage?.(message);
    };

    return transport;
  }

  async start(): Promise<void> {
    if (this._state === 'connected') {
      return;
    }

    this._state = 'connecting';
    this.stats.connectionAttempts++;

    try {
      logger.session(`SSE connecting to: ${this.url.href}`);
      this.sseTransport = this.createTransport();
      await this.sseTransport.start();
      this._state = 'connected';
      this.stats.lastConnectedAt = new Date();
      logger.session(`SSE connected: ${this.url.href}`);
    } catch (error) {
      this._state = 'error';
      this.stats.lastErrorAt = new Date();
      if (error instanceof Error) {
        this.stats.lastError = error.message;
      }
      throw error;
    }
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._state !== 'connected' || !this.sseTransport) {
      throw new Error(`Cannot send message: transport is ${this._state}`);
    }

    this.stats.messagesSent++;
    this.stats.bytesOut += JSON.stringify(message).length;
    await this.sseTransport.send(message);
  }

  async close(): Promise<void> {
    logger.session(`SSE closing connection: ${this.url.href}`);
    if (this.sseTransport) {
      await this.sseTransport.close();
      this.sseTransport = null;
    }
    this._state = 'disconnected';
  }

  async reconnect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      await this.close();
    }
    await this.start();
  }

  setProtocolVersion(version: string): void {
    this.sseTransport?.setProtocolVersion(version);
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }
}

/**
 * Create an SSE client transport for legacy MCP servers
 *
 * SSE transport is the older MCP transport protocol where:
 * - Server sends messages via SSE (Server-Sent Events)
 * - Client sends messages via HTTP POST to a separate endpoint
 *
 * The SDK's SSEClientTransport handles the `endpoint` SSE event
 * automatically to discover the POST endpoint.
 *
 * @param config - SSE transport configuration
 * @returns Transport instance and control methods
 *
 * @example
 * ```typescript
 * const { transport, close } = await createSseClientTransport({
 *   url: 'http://localhost:3000/sse',
 *   headers: { Authorization: 'Bearer token' },
 * });
 *
 * // Use with MCP client
 * const client = new Client(clientInfo, { capabilities: {} });
 * await client.connect(transport);
 *
 * // When done
 * await close();
 * ```
 */
export async function createSseClientTransport(
  config: SseTransportConfig,
): Promise<ClientTransportResult> {
  const url = new URL(config.url);
  const transport = new SseClientTransport(url, config.headers);

  return {
    transport,
    close: () => transport.close(),
    getState: () => transport.state,
    reconnect: () => transport.reconnect(),
    getStats: () => transport.getStats(),
  };
}

/**
 * Create a raw SSE transport without managed wrapper
 *
 * Use this when you need direct access to the SDK's SSEClientTransport
 * without the additional state tracking and statistics.
 *
 * @param url - SSE endpoint URL
 * @param headers - Optional custom headers
 * @returns SDK SSEClientTransport instance
 */
export function createRawSseTransport(
  url: string | URL,
  headers?: Record<string, string>,
): SSEClientTransport {
  const urlObj = typeof url === 'string' ? new URL(url) : url;
  return new SSEClientTransport(urlObj, {
    requestInit: { headers: headers ?? {} },
  });
}

export { SseClientTransport };
