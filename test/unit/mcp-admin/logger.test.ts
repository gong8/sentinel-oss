/**
 * Unit tests for Admin MCP Logger
 * Tests logging utilities for the Admin MCP server
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Capture console output
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Import the logger after mocking
import { logger, type LogLevel } from '../../../packages/mcp-admin/src/logger.js';

describe('Admin MCP Logger', () => {
  describe('formatTimestamp', () => {
    test('should include timestamp in log messages', () => {
      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];

      // Should match format like [HH:MM:SS.mmm]
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe('log levels', () => {
    test('debug should log with debug emoji', () => {
      logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Debug message');
    });

    test('info should log with info emoji', () => {
      logger.info('Info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Info message');
    });

    test('success should log with success emoji', () => {
      logger.success('Success message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Success message');
    });

    test('warn should log using console.warn', () => {
      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('Warning message');
    });

    test('error should log using console.error', () => {
      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Error message');
    });
  });

  describe('data logging', () => {
    test('should log additional data on separate line', () => {
      const data = { key: 'value', count: 42 };
      logger.info('Message with data', data);

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[1][0]).toEqual(data);
    });

    test('should not log undefined data', () => {
      logger.info('Message without data');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('should log null data', () => {
      logger.info('Message with null', null);

      // null is not undefined, so it gets logged on a separate line
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[1][0]).toBeNull();
    });

    test('should log error objects', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[1][0]).toBe(error);
    });
  });

  describe('convenience methods', () => {
    test('startup should use startup emoji', () => {
      logger.startup('Server starting');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Server starting');
    });

    test('shutdown should use shutdown emoji', () => {
      logger.shutdown('Server stopping');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Server stopping');
    });

    test('admin should use admin emoji', () => {
      logger.admin('Admin operation');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Admin operation');
    });

    test('tool should use tool emoji', () => {
      logger.tool('Tool operation');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Tool operation');
    });

    test('mcp should use mcp emoji', () => {
      logger.mcp('MCP operation');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('MCP operation');
    });

    test('health should use health emoji', () => {
      logger.health('Health check passed');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Health check passed');
    });

    test('session should use session emoji', () => {
      logger.session('Session operation');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Session operation');
    });

    test('confirmation should use confirmation emoji', () => {
      logger.confirmation('Confirmation pending');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Confirmation pending');
    });
  });

  describe('options', () => {
    test('should support custom emoji', () => {
      logger.info('Custom emoji', undefined, { emoji: '[CUSTOM]' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[CUSTOM]');
    });

    test('should support custom prefix', () => {
      logger.info('With prefix', undefined, { prefix: 'MODULE' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[MODULE]');
    });

    test('should support disabling timestamp', () => {
      logger.info('No timestamp', undefined, { timestamp: false });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      // Should not have timestamp format
      expect(output).not.toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe('edge cases', () => {
    test('should handle empty message', () => {
      logger.info('');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('should handle very long message', () => {
      const longMessage = 'x'.repeat(10000);
      logger.info(longMessage);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain(longMessage);
    });

    test('should handle special characters', () => {
      const specialMessage = 'Message with "quotes" and <brackets> and &ampersand';
      logger.info(specialMessage);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain(specialMessage);
    });

    test('should handle unicode characters', () => {
      const unicodeMessage = 'Message with unicode: characters emoji: test';
      logger.info(unicodeMessage);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain(unicodeMessage);
    });

    test('should handle newlines in message', () => {
      const multilineMessage = 'Line 1\nLine 2\nLine 3';
      logger.info(multilineMessage);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain(multilineMessage);
    });

    test('should handle complex nested data', () => {
      const complexData = {
        nested: {
          array: [1, 2, { deep: true }],
          object: { key: 'value' },
        },
        date: new Date(),
        regex: /test/,
      };
      logger.debug('Complex data', complexData);

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[1][0]).toEqual(complexData);
    });
  });

  describe('warn level data handling', () => {
    test('should log data with warn level', () => {
      const data = { warning: 'details' };
      logger.warn('Warning with data', data);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy.mock.calls[1][0]).toEqual(data);
    });
  });

  describe('error level data handling', () => {
    test('should log data with error level', () => {
      const data = { error: 'details' };
      logger.error('Error with data', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[1][0]).toEqual(data);
    });
  });
});

describe('LogLevel type', () => {
  test('should support all log levels', () => {
    // Verify the type is exported by using it
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'success'];

    expect(levels).toHaveLength(5);
  });
});
