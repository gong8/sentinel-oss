import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  JSONRPCMessageSchema,
  type JSONRPCMessage,
  type MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { logger } from '../logger.js';
import type { ClientTransportResult, ConnectionState, WebSocketTransportConfig } from './types.js';
import { DEFAULT_WEBSOCKET_CONFIG } from './types.js';

/**
 * Convert HTTP(S) URL to WebSocket URL
 */
function toWebSocketUrl(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://');
  }
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://');
  }
  return url;
}

/**
 * Sanitize URL for logging - removes query parameters and credentials
 */
function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove query parameters (may contain tokens)
    parsed.search = '';
    // Remove credentials from URL
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // If URL parsing fails, return a safe placeholder
    return '[invalid-url]';
  }
}

/**
 * Get a safe message summary for logging (no content)
 */
function getMessageSummary(message: JSONRPCMessage): string {
  if ('method' in message) {
    return `method=${message.method}`;
  }
  if ('result' in message) {
    return `result for id=${message.id}`;
  }
  if ('error' in message) {
    return `error for id=${message.id}`;
  }
  return 'unknown';
}

/**
 * WebSocket Client Transport for MCP servers
 *
 * Provides bidirectional communication with:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping-pong for connection health
 * - Connection state management
 * - Message queuing during reconnection
 */
class WebSocketClientTransport implements Transport {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private heartbeatTimeoutTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private messageQueue: Array<{ message: JSONRPCMessage; options?: TransportSendOptions }> = [];
  private isClosing = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;

  private readonly config: Required<
    Omit<WebSocketTransportConfig, 'headers'> & { headers: Record<string, string> }
  >;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  sessionId?: string;

  constructor(config: WebSocketTransportConfig) {
    this.config = {
      url: toWebSocketUrl(config.url),
      headers: config.headers ?? {},
      reconnect: config.reconnect ?? DEFAULT_WEBSOCKET_CONFIG.reconnect,
      maxReconnectAttempts:
        config.maxReconnectAttempts ?? DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts,
      initialReconnectDelay:
        config.initialReconnectDelay ?? DEFAULT_WEBSOCKET_CONFIG.initialReconnectDelay,
      maxReconnectDelay: config.maxReconnectDelay ?? DEFAULT_WEBSOCKET_CONFIG.maxReconnectDelay,
      reconnectBackoffMultiplier:
        config.reconnectBackoffMultiplier ?? DEFAULT_WEBSOCKET_CONFIG.reconnectBackoffMultiplier,
      heartbeat: config.heartbeat ?? DEFAULT_WEBSOCKET_CONFIG.heartbeat,
      heartbeatInterval: config.heartbeatInterval ?? DEFAULT_WEBSOCKET_CONFIG.heartbeatInterval,
      heartbeatTimeout: config.heartbeatTimeout ?? DEFAULT_WEBSOCKET_CONFIG.heartbeatTimeout,
      connectionTimeout: config.connectionTimeout ?? DEFAULT_WEBSOCKET_CONFIG.connectionTimeout,
    };

    this.sessionId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Start the transport and establish connection
   */
  async start(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    return this.connect();
  }

  /**
   * Establish WebSocket connection
   */
  private connect(): Promise<void> {
    this.setState('connecting');
    this.isClosing = false;

    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;

      const connectionTimeout = setTimeout(() => {
        if (this.state === 'connecting') {
          const error = new Error(`Connection timeout after ${this.config.connectionTimeout}ms`);
          this.handleConnectionError(error);
          reject(error);
        }
      }, this.config.connectionTimeout);

      try {
        this.ws = new WebSocket(this.config.url, {
          headers: this.config.headers,
        });

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.handleOpen();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(connectionTimeout);
          this.handleClose(code, reason.toString());
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          this.handleError(error);
        });

        this.ws.on('pong', () => {
          this.handlePong();
        });
      } catch (error) {
        clearTimeout(connectionTimeout);
        const wsError = error instanceof Error ? error : new Error(String(error));
        this.handleConnectionError(wsError);
        reject(wsError);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Handle successful connection
   */
  private handleOpen(): void {
    logger.info(`[WebSocket] Connected to ${sanitizeUrlForLogging(this.config.url)}`);
    this.setState('connected');
    this.reconnectAttempts = 0;
    this.connectionPromise = null;
    this.connectionResolve = null;
    this.connectionReject = null;

    if (this.config.heartbeat) {
      this.startHeartbeat();
    }

    this.flushMessageQueue();
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const messageStr = data.toString();
      const parsed: unknown = JSON.parse(messageStr);
      const parseResult = JSONRPCMessageSchema.safeParse(parsed);

      if (!parseResult.success) {
        const validationError = new Error(
          `Invalid JSONRPC message format: ${parseResult.error.message}`,
        );
        logger.error(`[WebSocket] Validation error:`, validationError);
        this.onerror?.(validationError);
        return;
      }

      const message = parseResult.data;
      // Only log message type, not content (may contain sensitive data)
      logger.debug(`[WebSocket] Received: ${getMessageSummary(message)}`);

      if (this.onmessage) {
        this.onmessage(message);
      }
    } catch (error) {
      const parseError = new Error(
        `Failed to parse WebSocket message: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(`[WebSocket] Parse error:`, parseError);
      this.onerror?.(parseError);
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(code: number, reason: string): void {
    logger.info(`[WebSocket] Connection closed: code=${code}, reason=${reason}`);
    this.cleanup();

    if (!this.isClosing && this.config.reconnect && this.shouldReconnect(code)) {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
      this.onclose?.();
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    logger.error(`[WebSocket] Error:`, error);

    if (this.connectionReject) {
      this.connectionReject(error);
      this.connectionPromise = null;
      this.connectionResolve = null;
      this.connectionReject = null;
    }

    this.onerror?.(error);
  }

  /**
   * Handle connection error during setup
   */
  private handleConnectionError(error: Error): void {
    logger.error(`[WebSocket] Connection error:`, error);
    this.cleanup();

    if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
      this.onerror?.(error);
    }
  }

  /**
   * Handle pong response for heartbeat
   */
  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = undefined;
    }
    logger.debug(`[WebSocket] Heartbeat pong received`);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        logger.debug(`[WebSocket] Heartbeat ping sent`);

        this.heartbeatTimeoutTimer = setTimeout(() => {
          logger.warn(`[WebSocket] Heartbeat timeout, closing connection`);
          this.ws?.terminate();
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = undefined;
    }
  }

  /**
   * Determine if reconnection should be attempted based on close code
   */
  private shouldReconnect(code: number): boolean {
    // Normal closure - don't reconnect
    if (code === 1000) {
      return false;
    }
    // Going away (server shutting down) - try to reconnect
    if (code === 1001) {
      return true;
    }
    // Protocol error - don't reconnect
    if (code === 1002) {
      return false;
    }
    // Invalid data - don't reconnect
    if (code === 1003) {
      return false;
    }
    // Policy violation - don't reconnect
    if (code === 1008) {
      return false;
    }
    // Message too big - don't reconnect
    if (code === 1009) {
      return false;
    }
    // Internal server error - try to reconnect
    if (code === 1011) {
      return true;
    }
    // Default: try to reconnect for other codes
    return true;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(
        `[WebSocket] Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`,
      );
      this.setState('disconnected');
      this.onerror?.(new Error('Max reconnection attempts reached'));
      this.onclose?.();
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.initialReconnectDelay *
        Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay,
    );

    logger.info(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error) => {
        logger.error(`[WebSocket] Reconnection failed:`, error);
      });
    }, delay);
  }

  /**
   * Force a reconnection
   */
  async reconnect(): Promise<void> {
    this.cleanup();
    this.reconnectAttempts = 0;
    return this.connect();
  }

  /**
   * Send a JSON-RPC message
   */
  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.state === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.sendImmediate(message);
    }

    if (this.state === 'connecting' || this.state === 'reconnecting') {
      this.messageQueue.push({ message, options });
      logger.debug(`[WebSocket] Message queued (queue size: ${this.messageQueue.length})`);
      return;
    }

    throw new Error(`Cannot send message: WebSocket is ${this.state}`);
  }

  /**
   * Send a message immediately
   */
  private sendImmediate(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }

      const messageStr = JSON.stringify(message);
      // Only log message type, not content (may contain sensitive data)
      logger.debug(`[WebSocket] Sending: ${getMessageSummary(message)}`);

      this.ws.send(messageStr, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    const queue = this.messageQueue;
    this.messageQueue = [];

    if (queue.length > 0) {
      logger.info(`[WebSocket] Flushing ${queue.length} queued messages`);
    }

    for (const { message } of queue) {
      void this.sendImmediate(message).catch((error) => {
        logger.error(`[WebSocket] Failed to send queued message:`, error);
      });
    }
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      logger.debug(`[WebSocket] State change: ${this.state} -> ${state}`);
      this.state = state;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    this.isClosing = true;
    this.cleanup();
    this.messageQueue = [];
    this.setState('disconnected');
    this.onclose?.();
  }

  /**
   * Set protocol version (called when initialize response is received)
   */
  setProtocolVersion(_version: string): void {
    // Store protocol version if needed for future compatibility
  }
}

/**
 * Create a WebSocket client transport for MCP servers
 *
 * @param config - Transport configuration
 * @returns Transport result with control methods
 */
export async function createWebSocketClientTransport(
  config: WebSocketTransportConfig,
): Promise<ClientTransportResult> {
  const transport = new WebSocketClientTransport(config);

  return {
    transport,
    close: () => transport.close(),
    getState: () => transport.getState(),
    reconnect: () => transport.reconnect(),
  };
}

export { WebSocketClientTransport };
