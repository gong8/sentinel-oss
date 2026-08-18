import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { access, constants } from 'fs/promises';
import { delimiter, isAbsolute, resolve } from 'path';
import { PassThrough, type Readable } from 'stream';
import { logger } from '../logger.js';
import { withTimeout } from '../utils.js';
import type { ClientTransportResult, StdioProcessState, StdioTransportConfig } from './types.js';

/**
 * Default timeout for process startup in milliseconds
 */
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Environment variables that are safe to inherit from the parent process
 */
const SAFE_ENV_VARS =
  process.platform === 'win32'
    ? [
        'APPDATA',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOCALAPPDATA',
        'PATH',
        'PROCESSOR_ARCHITECTURE',
        'SYSTEMDRIVE',
        'SYSTEMROOT',
        'TEMP',
        'USERNAME',
        'USERPROFILE',
        'PROGRAMFILES',
      ]
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];

/**
 * Dangerous environment variable names that could be used for attacks
 */
const DANGEROUS_ENV_VARS = new Set([
  // Library injection
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  // Path hijacking
  'PATH',
  'IFS',
  // Shell behavior
  'BASH_ENV',
  'ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'CDPATH',
  'GLOBIGNORE',
  'PS4',
  // Other dangerous vars
  'PYTHONPATH',
  'RUBYLIB',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PERL5LIB',
]);

/**
 * Validate environment variable key name
 */
function isValidEnvKey(key: string): boolean {
  // Must be non-empty alphanumeric + underscore, starting with letter or underscore
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Validate environment variable value
 */
function isValidEnvValue(value: string): boolean {
  // Check for Shellshock-style function definitions
  if (value.startsWith('()')) {
    return false;
  }
  return true;
}

/**
 * Build a safe environment object with only whitelisted variables
 */
function buildSafeEnvironment(additionalEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SAFE_ENV_VARS) {
    const value = process.env[key];
    if (value !== undefined && isValidEnvValue(value)) {
      env[key] = value;
    }
  }

  // Validate and merge additional env vars
  if (additionalEnv) {
    for (const [key, value] of Object.entries(additionalEnv)) {
      // Skip dangerous environment variables
      if (DANGEROUS_ENV_VARS.has(key.toUpperCase())) {
        logger.warn(`Skipping dangerous environment variable: ${key}`);
        continue;
      }
      // Validate key format
      if (!isValidEnvKey(key)) {
        logger.warn(`Skipping invalid environment variable key: ${key}`);
        continue;
      }
      // Validate value
      if (!isValidEnvValue(value)) {
        logger.warn(`Skipping environment variable with invalid value: ${key}`);
        continue;
      }
      env[key] = value;
    }
  }

  return env;
}

/**
 * Check if a file exists and is accessible
 * On Windows, we only check for existence (F_OK) since X_OK doesn't work reliably
 * On Unix, we check for execute permission (X_OK)
 */
async function isExecutable(filePath: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // On Windows, X_OK doesn't work reliably - just check if file exists
      await access(filePath, constants.F_OK);
    } else {
      await access(filePath, constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get executable extensions to try on Windows
 * Uses PATHEXT environment variable, falling back to common extensions
 */
function getWindowsExtensions(): string[] {
  const pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  // Split by semicolon and ensure lowercase for case-insensitive matching
  return pathExt.split(';').filter((ext) => ext.length > 0);
}

/**
 * Check if a command already has a Windows executable extension
 */
function hasExecutableExtension(command: string): boolean {
  if (process.platform !== 'win32') {
    return false;
  }
  const extensions = getWindowsExtensions();
  const upperCommand = command.toUpperCase();
  return extensions.some((ext) => upperCommand.endsWith(ext.toUpperCase()));
}

/**
 * Resolve a command to its full path if it exists
 */
async function resolveCommand(command: string): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const extensions = isWindows ? getWindowsExtensions() : [''];

  if (isAbsolute(command)) {
    // For absolute paths, check the command as-is first
    if (await isExecutable(command)) {
      return command;
    }
    // On Windows, try appending extensions if the command doesn't already have one
    if (isWindows && !hasExecutableExtension(command)) {
      for (const ext of extensions) {
        const withExt = command + ext;
        if (await isExecutable(withExt)) {
          return withExt;
        }
      }
    }
    return null;
  }

  const pathEnv = process.env.PATH ?? '';
  const pathDirs = pathEnv.split(delimiter);

  for (const dir of pathDirs) {
    const fullPath = resolve(dir, command);

    // Try the command as-is first (handles commands with extensions or Unix)
    if (await isExecutable(fullPath)) {
      return fullPath;
    }

    // On Windows, try appending extensions if the command doesn't already have one
    if (isWindows && !hasExecutableExtension(command)) {
      for (const ext of extensions) {
        const withExt = fullPath + ext;
        if (await isExecutable(withExt)) {
          return withExt;
        }
      }
    }
  }

  return null;
}

/**
 * Validate that a command exists before spawning
 */
async function validateCommand(command: string): Promise<void> {
  const resolvedPath = await resolveCommand(command);
  if (!resolvedPath) {
    throw new Error(
      `Command not found or not executable: ${command}. ` +
        `Ensure the command exists and is in PATH.`,
    );
  }
}

/**
 * Set up stderr logging for a child process
 */
function setupStderrLogging(stderr: Readable | null, serverName: string): void {
  if (!stderr) {
    return;
  }

  const passthrough = new PassThrough();
  stderr.pipe(passthrough);

  let buffer = '';
  passthrough.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        logger.debug(`[${serverName}] ${line}`, undefined, { emoji: '📝' });
      }
    }
  });

  passthrough.on('end', () => {
    if (buffer.trim()) {
      logger.debug(`[${serverName}] ${buffer}`, undefined, { emoji: '📝' });
    }
  });
}

/**
 * Create a stdio client transport for spawning local MCP servers
 *
 * This function spawns a local MCP server as a subprocess and communicates
 * with it via stdin/stdout using JSON-RPC.
 *
 * @param config - Stdio transport configuration
 * @param startupTimeoutMs - Timeout for process startup (default: 30s)
 * @returns Transport result with cleanup function
 */
export async function createStdioClientTransport(
  config: StdioTransportConfig,
  startupTimeoutMs: number = DEFAULT_STARTUP_TIMEOUT_MS,
): Promise<ClientTransportResult> {
  const { command, args = [], workingDir, env: additionalEnv } = config;

  await validateCommand(command);

  const serverName = command.split('/').pop() ?? command;
  logger.mcp(`Starting stdio MCP server: ${serverName}`);
  // Only log command name and arg count, not arg values (may contain secrets)
  logger.debug(`Command: ${command} [${args.length} args]`, undefined, {
    emoji: '🔧',
  });

  const env = buildSafeEnvironment(additionalEnv);

  const transport = new StdioClientTransport({
    command,
    args,
    env,
    cwd: workingDir,
    stderr: 'pipe',
  });

  const stderrStream = transport.stderr;
  if (stderrStream && 'on' in stderrStream) {
    setupStderrLogging(stderrStream as Readable, serverName);
  }

  let _processState: StdioProcessState = { running: false };

  transport.onclose = () => {
    _processState = { running: false };
    logger.mcp(`Stdio server closed: ${serverName}`);
  };

  transport.onerror = (error: Error) => {
    logger.error(`Stdio server error (${serverName}):`, error);
  };

  try {
    await withTimeout(
      transport.start(),
      startupTimeoutMs,
      `Stdio server startup timeout after ${startupTimeoutMs}ms: ${command}`,
    );

    const pid = transport.pid;
    _processState = { pid: pid ?? undefined, running: true };
    logger.success(`Stdio server started: ${serverName} (PID: ${pid})`);
  } catch (error) {
    await transport.close().catch(() => {
      // Ignore cleanup errors
    });
    throw error;
  }

  async function close(): Promise<void> {
    logger.mcp(`Stopping stdio server: ${serverName}`);
    try {
      await transport.close();
      logger.success(`Stdio server stopped: ${serverName}`);
    } catch (error) {
      logger.error(`Error stopping stdio server ${serverName}:`, error);
    }
  }

  return {
    transport,
    close,
  };
}

/**
 * Options for creating a stdio transport with restart capability
 */
export interface StdioRestartOptions {
  /** Maximum number of restart attempts (default: 3) */
  maxRestarts?: number;

  /** Delay between restarts in ms (default: 1000) */
  restartDelayMs?: number;

  /** Callback when restart is attempted */
  onRestart?: (attempt: number) => void;

  /** Callback when max restarts is reached */
  onMaxRestartsReached?: () => void;
}

/**
 * Create stdio transport with restart capability
 *
 * This is a wrapper around createStdioClientTransport that adds
 * automatic restart on process exit.
 */
export async function createStdioClientTransportWithRestart(
  config: StdioTransportConfig,
  options: StdioRestartOptions = {},
): Promise<ClientTransportResult> {
  const { maxRestarts = 3, restartDelayMs = 1000, onRestart, onMaxRestartsReached } = options;

  let restartCount = 0;
  let currentResult = await createStdioClientTransport(config);

  async function restart(): Promise<void> {
    if (restartCount >= maxRestarts) {
      onMaxRestartsReached?.();
      throw new Error(`Max restarts (${maxRestarts}) reached for ${config.command}`);
    }

    restartCount++;
    onRestart?.(restartCount);

    await new Promise((resolve) => setTimeout(resolve, restartDelayMs));

    try {
      await currentResult.close();
    } catch {
      // Ignore cleanup errors during restart
    }

    currentResult = await createStdioClientTransport(config);
  }

  return {
    transport: currentResult.transport,
    close: currentResult.close,
    reconnect: restart,
  };
}
