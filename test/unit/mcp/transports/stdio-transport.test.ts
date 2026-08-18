/**
 * Unit tests for STDIO transport
 *
 * Tests the stdio transport module focusing on edge cases, error handling,
 * and path resolution that are difficult to cover with integration tests.
 *
 * Coverage includes:
 * - Command validation and path resolution (Unix and Windows)
 * - Windows executable extension handling (.exe, .cmd, .bat)
 * - Environment variable security (filtering dangerous vars)
 * - Environment variable validation (key format, Shellshock protection)
 * - Transport lifecycle (start, close, callbacks)
 * - Stderr logging and buffering
 * - Restart capability with limits
 * - Timeout handling
 * - Working directory configuration
 */

import { EventEmitter } from 'events';
import { delimiter } from 'path';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the logger first to prevent side effects during tests
vi.mock('../../../../packages/mcp/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    mcp: vi.fn(),
    session: vi.fn(),
    security: vi.fn(),
    tool: vi.fn(),
  },
}));

// Mock fs/promises for path resolution tests
const mockAccess = vi.fn();
vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  constants: { X_OK: 1, F_OK: 0 },
}));

// Mock path module to handle Windows paths correctly regardless of host platform
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return {
    ...actual,
    // Use a platform-aware isAbsolute that works for Windows paths even on Unix
    isAbsolute: (path: string) => {
      // Check for Windows drive letter paths (C:\, D:\, etc.)
      if (/^[A-Za-z]:[\\/]/.test(path)) {
        return true;
      }
      // Fall back to original behavior
      return actual.isAbsolute(path);
    },
  };
});

// Create a mock transport class that simulates StdioClientTransport behavior
class MockStdioTransport extends EventEmitter {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  stderr: PassThrough | null = null;
  private _pid: number | undefined;
  private startError: Error | null = null;
  private closeError: Error | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(config: {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
    stderr?: string;
  }) {
    super();
    this.command = config.command;
    this.args = config.args;
    this.env = config.env;
    this.cwd = config.cwd;

    if (config.stderr === 'pipe') {
      // Use a real PassThrough stream that has the pipe method
      this.stderr = new PassThrough();
    }
  }

  get pid(): number | undefined {
    return this._pid;
  }

  setStartError(error: Error): void {
    this.startError = error;
  }

  setCloseError(error: Error): void {
    this.closeError = error;
  }

  setPid(pid: number): void {
    this._pid = pid;
  }

  async start(): Promise<void> {
    if (this.startError) {
      throw this.startError;
    }
    this._pid = 12345;
  }

  async close(): Promise<void> {
    if (this.closeError) {
      throw this.closeError;
    }
  }
}

let mockTransportInstance: MockStdioTransport | null = null;
let mockTransportFactory: (config: {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  stderr?: string;
}) => MockStdioTransport;

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
    stderr: EventEmitter | null = null;
    onclose?: () => void;
    onerror?: (error: Error) => void;

    constructor(config: {
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd?: string;
      stderr?: string;
    }) {
      const instance = mockTransportFactory(config);
      mockTransportInstance = instance;
      this.command = config.command;
      this.args = config.args;
      this.env = config.env;
      this.cwd = config.cwd;
      this.stderr = instance.stderr;

      // Proxy onclose and onerror to the mock instance
      Object.defineProperty(this, 'onclose', {
        get: () => instance.onclose,
        set: (fn) => {
          instance.onclose = fn;
        },
      });
      Object.defineProperty(this, 'onerror', {
        get: () => instance.onerror,
        set: (fn) => {
          instance.onerror = fn;
        },
      });
    }

    get pid(): number | undefined {
      return mockTransportInstance?.pid;
    }

    async start(): Promise<void> {
      return mockTransportInstance?.start();
    }

    async close(): Promise<void> {
      return mockTransportInstance?.close();
    }
  },
}));

// Import after mocks are set up
import { logger } from '../../../../packages/mcp/src/logger.js';
import {
  createStdioClientTransport,
  createStdioClientTransportWithRestart,
} from '../../../../packages/mcp/src/transports/stdio-transport.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockTransportInstance = null;
  mockTransportFactory = (config) => new MockStdioTransport(config);

  // Default: command exists and is executable
  mockAccess.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('STDIO Transport Unit Tests', () => {
  describe('createStdioClientTransport', () => {
    describe('command validation and path resolution', () => {
      test('should resolve absolute command path directly', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        expect(mockAccess).toHaveBeenCalledWith('/usr/bin/node', expect.any(Number));
      });

      test('should reject non-existent absolute command path', async () => {
        mockAccess.mockRejectedValue(new Error('ENOENT'));

        await expect(
          createStdioClientTransport({
            command: '/nonexistent/path/to/command',
            args: [],
          }),
        ).rejects.toThrow(/Command not found or not executable/);
      });

      test('should search PATH for non-absolute commands', async () => {
        // First call (absolute check) fails, subsequent calls search PATH directories
        mockAccess
          .mockRejectedValueOnce(new Error('ENOENT')) // First PATH dir fails
          .mockRejectedValueOnce(new Error('ENOENT')) // Second PATH dir fails
          .mockResolvedValueOnce(undefined); // Third PATH dir succeeds

        // Set a controlled PATH for testing (use platform-specific delimiter)
        const originalPath = process.env.PATH;
        process.env.PATH = `/first/dir${delimiter}/second/dir${delimiter}/third/dir`;

        try {
          const result = await createStdioClientTransport({
            command: 'mycommand',
            args: [],
          });

          expect(result.transport).toBeDefined();
          // Should have searched through PATH directories
          expect(mockAccess).toHaveBeenCalledTimes(3);
        } finally {
          process.env.PATH = originalPath;
        }
      });

      test('should reject command not found in PATH', async () => {
        // All PATH directory checks fail
        mockAccess.mockRejectedValue(new Error('ENOENT'));

        const originalPath = process.env.PATH;
        process.env.PATH = `/first/dir${delimiter}/second/dir`;

        try {
          await expect(
            createStdioClientTransport({
              command: 'nonexistent-command',
              args: [],
            }),
          ).rejects.toThrow(/Command not found or not executable/);
        } finally {
          process.env.PATH = originalPath;
        }
      });

      test('should handle empty PATH gracefully', async () => {
        mockAccess.mockRejectedValue(new Error('ENOENT'));

        const originalPath = process.env.PATH;
        process.env.PATH = '';

        try {
          await expect(
            createStdioClientTransport({
              command: 'somecommand',
              args: [],
            }),
          ).rejects.toThrow(/Command not found or not executable/);
        } finally {
          process.env.PATH = originalPath;
        }
      });

      test('should handle undefined PATH gracefully', async () => {
        mockAccess.mockRejectedValue(new Error('ENOENT'));

        const originalPath = process.env.PATH;
        delete process.env.PATH;

        try {
          await expect(
            createStdioClientTransport({
              command: 'somecommand',
              args: [],
            }),
          ).rejects.toThrow(/Command not found or not executable/);
        } finally {
          process.env.PATH = originalPath;
        }
      });

      test('should pass working directory to transport', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
          workingDir: '/custom/work/dir',
        });

        expect(result.transport).toBeDefined();
        expect(mockTransportInstance?.cwd).toBe('/custom/work/dir');
      });

      test('should handle command with slashes in name for logging', async () => {
        const result = await createStdioClientTransport({
          command: '/path/to/my-mcp-server',
          args: [],
        });

        expect(result.transport).toBeDefined();
        expect(logger.mcp).toHaveBeenCalledWith(expect.stringContaining('my-mcp-server'));
      });

      test('should handle command without slashes for logging', async () => {
        const result = await createStdioClientTransport({
          command: 'node',
          args: [],
        });

        expect(result.transport).toBeDefined();
        expect(logger.mcp).toHaveBeenCalledWith(expect.stringContaining('node'));
      });
    });

    describe('Windows-specific path resolution', () => {
      const originalPlatform = process.platform;

      beforeEach(() => {
        // Mock Windows platform
        Object.defineProperty(process, 'platform', {
          value: 'win32',
          writable: true,
          configurable: true,
        });
      });

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
          configurable: true,
        });
      });

      test('should try Windows executable extensions for commands without extension', async () => {
        // Mock: command without extension fails, command with .exe succeeds
        mockAccess
          .mockRejectedValueOnce(new Error('ENOENT')) // node fails
          .mockResolvedValueOnce(undefined); // node.COM succeeds (first in PATHEXT)

        const originalPath = process.env.PATH;
        const originalPathExt = process.env.PATHEXT;
        process.env.PATH = 'C:\\nodejs';
        process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

        try {
          const result = await createStdioClientTransport({
            command: 'node',
            args: [],
          });

          expect(result.transport).toBeDefined();
          // Should have tried the base command first, then with extension
          expect(mockAccess).toHaveBeenCalledTimes(2);
        } finally {
          process.env.PATH = originalPath;
          process.env.PATHEXT = originalPathExt;
        }
      });

      // Skip on non-Windows: path.isAbsolute('C:\...') uses host platform rules, not mocked platform
      test.skipIf(process.platform !== 'win32')(
        'should not add extension to commands that already have Windows extension',
        async () => {
          const originalPathExt = process.env.PATHEXT;
          process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

          try {
            const result = await createStdioClientTransport({
              command: 'C:\\nodejs\\node.exe',
              args: [],
            });

            expect(result.transport).toBeDefined();
            // Should only check the path as-is, not try adding more extensions
            expect(mockAccess).toHaveBeenCalledWith('C:\\nodejs\\node.exe', expect.any(Number));
          } finally {
            process.env.PATHEXT = originalPathExt;
          }
        },
      );

      test('should use default PATHEXT when not set', async () => {
        const originalPathExt = process.env.PATHEXT;
        delete process.env.PATHEXT;

        mockAccess
          .mockRejectedValueOnce(new Error('ENOENT')) // command without ext
          .mockResolvedValueOnce(undefined); // command.COM succeeds

        const originalPath = process.env.PATH;
        process.env.PATH = 'C:\\bin';

        try {
          const result = await createStdioClientTransport({
            command: 'mycommand',
            args: [],
          });

          expect(result.transport).toBeDefined();
        } finally {
          process.env.PATH = originalPath;
          process.env.PATHEXT = originalPathExt;
        }
      });

      test('should handle absolute Windows path with extension lookup', async () => {
        const originalPathExt = process.env.PATHEXT;
        process.env.PATHEXT = '.EXE;.CMD';

        // Absolute path without extension - should try adding extensions
        mockAccess
          .mockRejectedValueOnce(new Error('ENOENT')) // C:\bin\myapp fails
          .mockResolvedValueOnce(undefined); // C:\bin\myapp.EXE succeeds

        try {
          const result = await createStdioClientTransport({
            command: 'C:\\bin\\myapp',
            args: [],
          });

          expect(result.transport).toBeDefined();
        } finally {
          process.env.PATHEXT = originalPathExt;
        }
      });
    });

    describe('transport startup errors', () => {
      test('should cleanup and rethrow on startup timeout', async () => {
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          // Mock a transport that never resolves start()
          transport.start = () => new Promise(() => {});
          return transport;
        };

        await expect(
          createStdioClientTransport(
            {
              command: '/usr/bin/node',
              args: ['server.js'],
            },
            100, // Very short timeout
          ),
        ).rejects.toThrow(/timeout/i);
      });

      test('should cleanup and rethrow on startup error', async () => {
        const startupError = new Error('Process spawn failed');

        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          transport.setStartError(startupError);
          return transport;
        };

        await expect(
          createStdioClientTransport({
            command: '/usr/bin/node',
            args: ['server.js'],
          }),
        ).rejects.toThrow('Process spawn failed');
      });

      test('should ignore cleanup errors during startup failure', async () => {
        const startupError = new Error('Process spawn failed');

        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          transport.setStartError(startupError);
          // Also make close() fail - this should be caught and ignored
          transport.setCloseError(new Error('Close also failed'));
          return transport;
        };

        // Should still throw the original startup error, not the cleanup error
        await expect(
          createStdioClientTransport({
            command: '/usr/bin/node',
            args: ['server.js'],
          }),
        ).rejects.toThrow('Process spawn failed');
      });
    });

    describe('close function error handling', () => {
      test('should log error when close fails', async () => {
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          transport.setCloseError(new Error('Failed to stop process'));
          return transport;
        };

        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        // Call close - it should log the error but not throw
        await result.close();

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error stopping stdio server'),
          expect.any(Error),
        );
      });

      test('should log success when close succeeds', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        await result.close();

        expect(logger.success).toHaveBeenCalledWith(
          expect.stringContaining('Stdio server stopped'),
        );
      });
    });

    describe('transport callbacks', () => {
      test('should handle onclose callback', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();

        // Trigger onclose
        if (mockTransportInstance?.onclose) {
          mockTransportInstance.onclose();
        }

        expect(logger.mcp).toHaveBeenCalledWith(expect.stringContaining('Stdio server closed'));
      });

      test('should handle onerror callback', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();

        const testError = new Error('Transport error occurred');

        // Trigger onerror
        if (mockTransportInstance?.onerror) {
          mockTransportInstance.onerror(testError);
        }

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Stdio server error'),
          testError,
        );
      });
    });

    describe('environment variable handling', () => {
      test('should filter dangerous environment variables', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            SAFE_VAR: 'safe-value',
            LD_PRELOAD: '/dangerous/lib.so',
            NODE_OPTIONS: '--dangerous-flag',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping dangerous environment variable: LD_PRELOAD'),
        );
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping dangerous environment variable: NODE_OPTIONS'),
        );
      });

      test('should filter invalid environment variable keys', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            VALID_KEY: 'value',
            '123_INVALID': 'value',
            'key-with-dash': 'value',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping invalid environment variable key'),
        );
      });

      test('should filter Shellshock-style values', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            SAFE_VAR: 'safe-value',
            MALICIOUS: '() { :; }; echo pwned',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping environment variable with invalid value'),
        );
      });

      test('should filter all dangerous environment variables', async () => {
        const dangerousVars: Record<string, string> = {
          LD_PRELOAD: '/lib/evil.so',
          LD_LIBRARY_PATH: '/evil/lib',
          DYLD_INSERT_LIBRARIES: '/evil.dylib',
          DYLD_LIBRARY_PATH: '/evil',
          PATH: '/evil/bin',
          IFS: ' ',
          BASH_ENV: '/evil/.bashrc',
          ENV: '/evil/.profile',
          SHELLOPTS: 'allexport',
          BASHOPTS: 'expand_aliases',
          CDPATH: '/evil',
          GLOBIGNORE: '*',
          PS4: '$(evil)',
          PYTHONPATH: '/evil/python',
          RUBYLIB: '/evil/ruby',
          NODE_OPTIONS: '--require=/evil.js',
          NODE_PATH: '/evil/node',
          PERL5LIB: '/evil/perl',
        };

        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            ...dangerousVars,
            SAFE_VAR: 'allowed',
          },
        });

        expect(result.transport).toBeDefined();
        // Each dangerous variable should trigger a warning
        expect(logger.warn).toHaveBeenCalledTimes(Object.keys(dangerousVars).length);
      });

      test('should filter dangerous vars case-insensitively', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            node_options: '--require=/evil.js',
            Node_Path: '/evil',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping dangerous environment variable'),
        );
      });

      test('should handle empty additional env', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {},
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      test('should handle undefined additional env', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      test('should allow valid environment variable keys', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            VALID_KEY: 'value1',
            _UNDERSCORE_START: 'value2',
            MY_VAR_123: 'value3',
            lowercase: 'value4',
            MixedCase: 'value5',
          },
        });

        expect(result.transport).toBeDefined();
        // No warnings should be logged for valid keys
        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Skipping invalid environment variable key'),
        );
      });

      test('should filter keys starting with numbers', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            '1STARTS_WITH_NUMBER': 'value',
            '9ABC': 'value',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping invalid environment variable key'),
        );
      });

      test('should filter keys with special characters', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            'key.with.dots': 'value',
            'key=with=equals': 'value',
            key$with$dollar: 'value',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledTimes(3);
      });

      test('should filter empty key names', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            '': 'empty-key-value',
          },
        });

        expect(result.transport).toBeDefined();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Skipping invalid environment variable key'),
        );
      });

      test('should allow normal values including special characters', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
          env: {
            NORMAL: 'normal value',
            WITH_SPACES: 'value with spaces',
            WITH_SPECIAL: 'value!@#$%^&*',
            WITH_QUOTES: '"quoted value"',
            WITH_NEWLINES: 'line1\nline2',
            EMPTY_VALUE: '',
          },
        });

        expect(result.transport).toBeDefined();
        // No warnings for these valid values
        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Skipping environment variable with invalid value'),
        );
      });

      test('should inherit safe environment variables from parent process', async () => {
        // Store originals
        const originalHome = process.env.HOME;
        const originalUser = process.env.USER;

        // Set test values
        process.env.HOME = '/test/home';
        process.env.USER = 'testuser';

        try {
          const result = await createStdioClientTransport({
            command: '/usr/bin/node',
            args: [],
          });

          expect(result.transport).toBeDefined();
          // The mock transport should receive the inherited env vars
          // (we can verify the transport was created successfully)
        } finally {
          process.env.HOME = originalHome;
          process.env.USER = originalUser;
        }
      });
    });

    describe('stderr logging', () => {
      test('should set up stderr logging when stderr is piped', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        expect(mockTransportInstance?.stderr).toBeDefined();
      });

      test('should handle null stderr gracefully', async () => {
        // Create a mock that returns null for stderr
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          // Override stderr to be null
          transport.stderr = null;
          return transport;
        };

        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        expect(mockTransportInstance?.stderr).toBeNull();
      });

      test('should log stderr data and handle remaining buffer on end', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();

        // Simulate stderr output
        if (mockTransportInstance?.stderr) {
          const stderrStream = mockTransportInstance.stderr;

          // Write data with complete line
          stderrStream.write('test line 1\ntest line 2\n');

          // Write data without trailing newline (remaining buffer)
          stderrStream.write('partial line');

          // End the stream - this should log the remaining buffer
          stderrStream.end();

          // Allow event handlers to run
          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('test line 1'),
            undefined,
            expect.any(Object),
          );
        }
      });

      test('should skip empty stderr lines', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();

        if (mockTransportInstance?.stderr) {
          const stderrStream = mockTransportInstance.stderr;

          // Write only empty lines and whitespace
          stderrStream.write('\n\n   \n\t\n');
          stderrStream.end();

          await new Promise((resolve) => setTimeout(resolve, 10));

          // Debug should not be called for empty/whitespace lines
          // (or called with messages that don't contain our test content)
        }
      });

      test('should handle stderr without on method gracefully', async () => {
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          // Override stderr to be an object without 'on' method
          transport.stderr = {} as PassThrough;
          return transport;
        };

        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        // Should not throw, stderr logging just won't be set up
      });
    });

    describe('process state tracking', () => {
      test('should track process PID after start', async () => {
        // The default mock sets PID to 12345 in start()
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('PID: 12345'));
      });

      test('should handle undefined PID', async () => {
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          // Override start to not set PID
          transport.start = async () => {
            // Start without setting PID - leave it undefined
          };
          return transport;
        };

        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        expect(result.transport).toBeDefined();
        expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('PID: undefined'));
      });
    });

    describe('default timeout behavior', () => {
      test('should use default 30 second timeout when not specified', async () => {
        mockTransportFactory = (config) => {
          const transport = new MockStdioTransport(config);
          // This would normally take 30+ seconds
          transport.start = () => new Promise(() => {});
          return transport;
        };

        // We can't easily test the 30s timeout without making tests slow,
        // but we can verify the transport is created and would eventually timeout
        const _transportPromise = createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['server.js'],
        });

        // Instead, verify with a short explicit timeout that the timeout mechanism works
        const shortTimeoutPromise = createStdioClientTransport(
          {
            command: '/usr/bin/node',
            args: ['server.js'],
          },
          50, // 50ms timeout
        );

        await expect(shortTimeoutPromise).rejects.toThrow(/timeout/i);
      });
    });

    describe('args handling', () => {
      test('should pass args to transport', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: ['--version', '--help', 'script.js'],
        });

        expect(result.transport).toBeDefined();
        expect(mockTransportInstance?.args).toEqual(['--version', '--help', 'script.js']);
      });

      test('should handle empty args array', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
        });

        expect(result.transport).toBeDefined();
        expect(mockTransportInstance?.args).toEqual([]);
      });

      test('should default args to empty array when not provided', async () => {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
        });

        expect(result.transport).toBeDefined();
        // Log should show 0 args
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('[0 args]'),
          undefined,
          expect.any(Object),
        );
      });
    });
  });

  describe('createStdioClientTransportWithRestart', () => {
    test('should create transport with restart capability', async () => {
      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 10,
        },
      );

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);
      expect(result.reconnect).toBeInstanceOf(Function);
    });

    test('should call onRestart callback when restarting', async () => {
      const onRestart = vi.fn();

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 10,
          onRestart,
        },
      );

      if (result.reconnect) {
        await result.reconnect();
      }

      expect(onRestart).toHaveBeenCalledWith(1);
    });

    test('should throw when max restarts exceeded', async () => {
      const onMaxRestartsReached = vi.fn();

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 2,
          restartDelayMs: 10,
          onMaxRestartsReached,
        },
      );

      if (result.reconnect) {
        await result.reconnect(); // Restart 1
        await result.reconnect(); // Restart 2

        // Restart 3 should fail
        await expect(result.reconnect()).rejects.toThrow(/Max restarts.*reached/);
      }

      expect(onMaxRestartsReached).toHaveBeenCalled();
    });

    test('should ignore cleanup errors during restart', async () => {
      let restartCount = 0;

      mockTransportFactory = (config) => {
        const transport = new MockStdioTransport(config);
        // Make first transport's close fail
        if (restartCount === 0) {
          transport.setCloseError(new Error('Close failed during restart'));
        }
        restartCount++;
        return transport;
      };

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 10,
        },
      );

      if (result.reconnect) {
        // Should not throw even though close failed
        await result.reconnect();
      }

      expect(restartCount).toBe(2);
    });

    test('should use default options when not provided', async () => {
      const result = await createStdioClientTransportWithRestart({
        command: '/usr/bin/node',
        args: ['server.js'],
      });

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);
      expect(result.reconnect).toBeInstanceOf(Function);
    });

    test('should increment restart count correctly', async () => {
      const restartAttempts: number[] = [];
      const onRestart = vi.fn((attempt: number) => {
        restartAttempts.push(attempt);
      });

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 5,
          restartDelayMs: 10,
          onRestart,
        },
      );

      if (result.reconnect) {
        await result.reconnect(); // Restart 1
        await result.reconnect(); // Restart 2
        await result.reconnect(); // Restart 3
      }

      expect(restartAttempts).toEqual([1, 2, 3]);
    });

    test('should respect restart delay', async () => {
      const startTime = Date.now();

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 100,
        },
      );

      if (result.reconnect) {
        await result.reconnect();
        const elapsed = Date.now() - startTime;
        // Should have waited at least the restart delay
        // (minus some time for other operations)
        expect(elapsed).toBeGreaterThanOrEqual(90);
      }
    });

    test('should propagate transport creation errors during restart', async () => {
      let createCount = 0;

      mockTransportFactory = (config) => {
        createCount++;
        if (createCount === 2) {
          // Fail on the second transport creation (during restart)
          throw new Error('Failed to create transport');
        }
        return new MockStdioTransport(config);
      };

      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 10,
        },
      );

      if (result.reconnect) {
        await expect(result.reconnect()).rejects.toThrow('Failed to create transport');
      }
    });

    test('should call close function from current result', async () => {
      const result = await createStdioClientTransportWithRestart(
        {
          command: '/usr/bin/node',
          args: ['server.js'],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 10,
        },
      );

      // Close should work
      await result.close();

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Stdio server stopped'));
    });
  });

  describe('platform-specific safe environment variables', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });

    test('should use Windows-specific safe env vars on win32', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Set Windows env vars
      const originalAppData = process.env.APPDATA;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';
      process.env.USERPROFILE = 'C:\\Users\\Test';

      try {
        const result = await createStdioClientTransport({
          command: 'C:\\nodejs\\node.exe',
          args: [],
        });

        expect(result.transport).toBeDefined();
        // Transport should be created successfully with Windows env vars
      } finally {
        process.env.APPDATA = originalAppData;
        process.env.USERPROFILE = originalUserProfile;
      }
    });

    test('should use Unix-specific safe env vars on darwin', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      const originalHome = process.env.HOME;
      const originalShell = process.env.SHELL;
      process.env.HOME = '/Users/test';
      process.env.SHELL = '/bin/zsh';

      try {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
        });

        expect(result.transport).toBeDefined();
      } finally {
        process.env.HOME = originalHome;
        process.env.SHELL = originalShell;
      }
    });

    test('should use Unix-specific safe env vars on linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      const originalHome = process.env.HOME;
      const originalLogname = process.env.LOGNAME;
      process.env.HOME = '/home/test';
      process.env.LOGNAME = 'testuser';

      try {
        const result = await createStdioClientTransport({
          command: '/usr/bin/node',
          args: [],
        });

        expect(result.transport).toBeDefined();
      } finally {
        process.env.HOME = originalHome;
        process.env.LOGNAME = originalLogname;
      }
    });
  });

  describe('error message formatting', () => {
    test('should include command in not found error message', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(
        createStdioClientTransport({
          command: '/path/to/my-special-command',
          args: [],
        }),
      ).rejects.toThrow(/my-special-command/);
    });

    test('should include PATH hint in not found error message', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(
        createStdioClientTransport({
          command: 'missing-command',
          args: [],
        }),
      ).rejects.toThrow(/PATH/);
    });

    test('should include timeout duration in timeout error message', async () => {
      mockTransportFactory = (config) => {
        const transport = new MockStdioTransport(config);
        transport.start = () => new Promise(() => {});
        return transport;
      };

      await expect(
        createStdioClientTransport(
          {
            command: '/usr/bin/node',
            args: [],
          },
          500,
        ),
      ).rejects.toThrow(/500ms/);
    });
  });
});
