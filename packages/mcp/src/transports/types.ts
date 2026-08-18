/**
 * Types for MCP transport implementations
 */

/**
 * Connection state for transports
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Stdio transport configuration (for local subprocess MCP servers)
 */
export interface StdioTransportConfig {
  /** Command to execute */
  command: string;

  /** Command line arguments */
  args?: string[];

  /** Working directory for the process */
  workingDir?: string;

  /** Additional environment variables to pass to the process */
  env?: Record<string, string>;
}

/**
 * Stdio process state
 */
export interface StdioProcessState {
  /** Process ID */
  pid?: number;

  /** Whether the process is running */
  running: boolean;

  /** Exit code if the process has exited */
  exitCode?: number;

  /** Signal that terminated the process */
  signal?: string;
}

/**
 * SSE transport configuration
 */
export interface SseTransportConfig {
  /** SSE endpoint URL */
  url: string;

  /** Additional headers for SSE connection */
  headers?: Record<string, string>;

  /** Timeout for SSE connection in ms (default: 30000) */
  connectionTimeout?: number;
}

/**
 * Transport statistics
 */
export interface TransportStats {
  messagesSent: number;
  messagesReceived: number;
  bytesIn: number;
  bytesOut: number;
  connectionAttempts: number;
  lastConnectedAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
}

/**
 * Managed transport interface with lifecycle management
 */
export interface ManagedTransport {
  readonly state: ConnectionState;
  reconnect(): Promise<void>;
  getStats(): TransportStats;
  start(): Promise<void>;
  send(
    message: import('@modelcontextprotocol/sdk/types.js').JSONRPCMessage,
    options?: import('@modelcontextprotocol/sdk/shared/transport.js').TransportSendOptions,
  ): Promise<void>;
  close(): Promise<void>;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends import('@modelcontextprotocol/sdk/types.js').JSONRPCMessage>(
    message: T,
    extra?: import('@modelcontextprotocol/sdk/types.js').MessageExtraInfo,
  ) => void;
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;
}

/**
 * Configuration options for WebSocket transport
 */
export interface WebSocketTransportConfig {
  /** WebSocket URL (supports ws://, wss://, http://, https://) */
  url: string;

  /** Additional headers for the WebSocket handshake */
  headers?: Record<string, string>;

  /** Enable automatic reconnection (default: true) */
  reconnect?: boolean;

  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;

  /** Initial reconnection delay in ms (default: 1000) */
  initialReconnectDelay?: number;

  /** Maximum reconnection delay in ms (default: 30000) */
  maxReconnectDelay?: number;

  /** Reconnection backoff multiplier (default: 2) */
  reconnectBackoffMultiplier?: number;

  /** Enable heartbeat/ping-pong (default: true) */
  heartbeat?: boolean;

  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;

  /** Heartbeat timeout in ms (default: 10000) */
  heartbeatTimeout?: number;

  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;
}

/**
 * Result from creating a client transport
 */
export interface ClientTransportResult {
  /** The transport instance */
  transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport;

  /** Close the transport and cleanup */
  close: () => Promise<void>;

  /** Get current connection state (optional for simple transports) */
  getState?: () => ConnectionState;

  /** Force reconnection (optional for transports that don't support reconnection) */
  reconnect?: () => Promise<void>;

  /** Get transport statistics (optional for transports that track stats) */
  getStats?: () => TransportStats;
}

/**
 * Events emitted by the WebSocket transport
 */
export interface WebSocketTransportEvents {
  /** Connection state changed */
  stateChange: (state: ConnectionState) => void;

  /** Reconnection attempt */
  reconnectAttempt: (attempt: number, maxAttempts: number) => void;

  /** Heartbeat sent */
  heartbeatSent: () => void;

  /** Heartbeat received */
  heartbeatReceived: () => void;

  /** Heartbeat timeout */
  heartbeatTimeout: () => void;
}

/**
 * Default configuration values
 */
export const DEFAULT_WEBSOCKET_CONFIG = {
  reconnect: true,
  maxReconnectAttempts: 10,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectBackoffMultiplier: 2,
  heartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  connectionTimeout: 10000,
} as const;
