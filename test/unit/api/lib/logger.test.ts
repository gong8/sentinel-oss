/**
 * Tests for Logger Utility
 * Tests all logging methods and formatting options
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock console methods before importing logger
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

import { logger } from '../../../../packages/api/src/lib/logger.js';

beforeAll(() => {
  console.log = mockConsoleLog;
  console.warn = mockConsoleWarn;
  console.error = mockConsoleError;
});

afterAll(() => {
  mockConsoleLog.mockRestore();
  mockConsoleWarn.mockRestore();
  mockConsoleError.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logger', () => {
  describe('debug', () => {
    test('should log message with debug emoji', () => {
      logger.debug('Test debug message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('Test debug message');
    });

    test('should log data when provided', () => {
      const testData = { key: 'value' };
      logger.debug('Debug with data', testData);

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenLastCalledWith(testData);
    });

    test('should not log data when undefined', () => {
      logger.debug('Debug without data');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    });

    test('should include timestamp by default', () => {
      logger.debug('Timestamped message');

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      // Check for timestamp pattern [HH:MM:SS.mmm]
      expect(loggedMessage).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    test('should exclude timestamp when disabled', () => {
      logger.debug('No timestamp', undefined, { timestamp: false });

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).not.toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    test('should use custom emoji when provided', () => {
      logger.debug('Custom emoji', undefined, { emoji: '🎯' });

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('🎯');
    });

    test('should include prefix when provided', () => {
      logger.debug('With prefix', undefined, { prefix: 'TEST' });

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('[TEST]');
    });
  });

  describe('info', () => {
    test('should log message with info emoji', () => {
      logger.info('Test info message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('Test info message');
    });

    test('should log data when provided', () => {
      const testData = { info: 'data' };
      logger.info('Info with data', testData);

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenLastCalledWith(testData);
    });
  });

  describe('success', () => {
    test('should log message with success emoji', () => {
      logger.success('Operation succeeded');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('Operation succeeded');
    });

    test('should log data when provided', () => {
      const testData = { result: 'success' };
      logger.success('Success with data', testData);

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenLastCalledWith(testData);
    });
  });

  describe('warn', () => {
    test('should log message with warn emoji using console.warn', () => {
      logger.warn('Test warning message');

      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockConsoleWarn.mock.calls[0][0];
      expect(loggedMessage).toContain('Test warning message');
    });

    test('should log data when provided', () => {
      const testData = { warning: 'details' };
      logger.warn('Warning with data', testData);

      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenLastCalledWith(testData);
    });

    test('should not log data when undefined', () => {
      logger.warn('Warning without data');

      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
    });
  });

  describe('error', () => {
    test('should log message with error emoji using console.error', () => {
      logger.error('Test error message');

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const loggedMessage = mockConsoleError.mock.calls[0][0];
      expect(loggedMessage).toContain('Test error message');
    });

    test('should log error object when provided', () => {
      const testError = new Error('Something went wrong');
      logger.error('Error occurred', testError);

      expect(mockConsoleError).toHaveBeenCalledTimes(2);
      expect(mockConsoleError).toHaveBeenLastCalledWith(testError);
    });

    test('should not log error when undefined', () => {
      logger.error('Error without details');

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });

    test('should handle non-Error objects', () => {
      const errorData = { code: 500, message: 'Internal error' };
      logger.error('Server error', errorData);

      expect(mockConsoleError).toHaveBeenCalledTimes(2);
      expect(mockConsoleError).toHaveBeenLastCalledWith(errorData);
    });
  });

  describe('convenience methods', () => {
    describe('startup', () => {
      test('should log with rocket emoji', () => {
        logger.startup('Server starting');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('🚀');
        expect(loggedMessage).toContain('Server starting');
      });

      test('should log data when provided', () => {
        logger.startup('Starting', { port: 3000 });

        expect(mockConsoleLog).toHaveBeenCalledTimes(2);
        expect(mockConsoleLog).toHaveBeenLastCalledWith({ port: 3000 });
      });
    });

    describe('shutdown', () => {
      test('should log with wave emoji', () => {
        logger.shutdown('Server stopping');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('👋');
        expect(loggedMessage).toContain('Server stopping');
      });
    });

    describe('request', () => {
      test('should log with incoming mail emoji', () => {
        logger.request('Incoming request');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('📨');
        expect(loggedMessage).toContain('Incoming request');
      });
    });

    describe('response', () => {
      test('should log with outgoing mail emoji', () => {
        logger.response('Sending response');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('📤');
        expect(loggedMessage).toContain('Sending response');
      });
    });

    describe('database', () => {
      test('should log with database emoji', () => {
        logger.database('Database query');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('🗄️');
        expect(loggedMessage).toContain('Database query');
      });
    });

    describe('security', () => {
      test('should log with lock emoji using console.warn', () => {
        logger.security('Security event');

        expect(mockConsoleWarn).toHaveBeenCalled();
        const loggedMessage = mockConsoleWarn.mock.calls[0][0];
        expect(loggedMessage).toContain('🔒');
        expect(loggedMessage).toContain('Security event');
      });
    });

    describe('policy', () => {
      test('should log with clipboard emoji', () => {
        logger.policy('Policy evaluated');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('📋');
        expect(loggedMessage).toContain('Policy evaluated');
      });
    });

    describe('tool', () => {
      test('should log with wrench emoji', () => {
        logger.tool('Tool invoked');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('🔧');
        expect(loggedMessage).toContain('Tool invoked');
      });
    });

    describe('mcp', () => {
      test('should log with satellite emoji', () => {
        logger.mcp('MCP server connected');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('📡');
        expect(loggedMessage).toContain('MCP server connected');
      });
    });

    describe('health', () => {
      test('should log with hospital emoji', () => {
        logger.health('Health check passed');

        expect(mockConsoleLog).toHaveBeenCalled();
        const loggedMessage = mockConsoleLog.mock.calls[0][0];
        expect(loggedMessage).toContain('🏥');
        expect(loggedMessage).toContain('Health check passed');
      });
    });
  });

  describe('formatting', () => {
    test('should format timestamp correctly', () => {
      logger.info('Test');

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      // Timestamp format: [HH:MM:SS.mmm]
      const timestampMatch = loggedMessage.match(/\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/);
      expect(timestampMatch).not.toBeNull();

      if (timestampMatch) {
        const [, hours, minutes, seconds, ms] = timestampMatch;
        expect(Number(hours)).toBeGreaterThanOrEqual(0);
        expect(Number(hours)).toBeLessThan(24);
        expect(Number(minutes)).toBeGreaterThanOrEqual(0);
        expect(Number(minutes)).toBeLessThan(60);
        expect(Number(seconds)).toBeGreaterThanOrEqual(0);
        expect(Number(seconds)).toBeLessThan(60);
        expect(Number(ms)).toBeGreaterThanOrEqual(0);
        expect(Number(ms)).toBeLessThan(1000);
      }
    });

    test('should handle all options together', () => {
      logger.info('Combined options', undefined, {
        emoji: '🎉',
        prefix: 'CUSTOM',
        timestamp: true,
      });

      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('🎉');
      expect(loggedMessage).toContain('[CUSTOM]');
      expect(loggedMessage).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
      expect(loggedMessage).toContain('Combined options');
    });

    test('should handle empty message', () => {
      logger.info('');

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    test('should handle message with special characters', () => {
      logger.info('Test with "quotes" and \'apostrophes\' and <tags>');

      expect(mockConsoleLog).toHaveBeenCalled();
      const loggedMessage = mockConsoleLog.mock.calls[0][0];
      expect(loggedMessage).toContain('Test with "quotes" and \'apostrophes\' and <tags>');
    });

    test('should handle complex data objects', () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        date: new Date('2024-01-01'),
        null: null,
        undefined: undefined,
      };

      logger.info('Complex data', complexData);

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenLastCalledWith(complexData);
    });
  });
});
