/**
 * Tests for MCP Logger utility
 * Tests logging functionality, formatting, and convenience methods
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../../../packages/mcp/src/logger.js';

describe('MCP Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debug', () => {
    test('should log debug message with timestamp and emoji', () => {
      logger.debug('test debug message');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🔍');
      expect(call).toContain('test debug message');
    });

    test('should log debug message with data', () => {
      const data = { key: 'value' };
      logger.debug('test message', data);
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('should log debug message with custom options', () => {
      logger.debug('test message', undefined, { emoji: '🎯', prefix: 'TEST' });
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🎯');
      expect(call).toContain('[TEST]');
    });
  });

  describe('info', () => {
    test('should log info message with timestamp and emoji', () => {
      logger.info('test info message');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('ℹ️');
      expect(call).toContain('test info message');
    });

    test('should log info message with data', () => {
      const data = { info: 'details' };
      logger.info('info message', data);
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('should include timestamp in format', () => {
      logger.info('test');
      const call = consoleSpy.log.mock.calls[0][0];
      // Should match timestamp pattern [HH:MM:SS.mmm]
      expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe('success', () => {
    test('should log success message with checkmark emoji', () => {
      logger.success('test success');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('✅');
      expect(call).toContain('test success');
    });

    test('should log success message with data', () => {
      const data = { result: 'ok' };
      logger.success('success', data);
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });
  });

  describe('warn', () => {
    test('should log warning to console.warn with warning emoji', () => {
      logger.warn('test warning');
      expect(consoleSpy.warn).toHaveBeenCalled();
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('⚠️');
      expect(call).toContain('test warning');
    });

    test('should log warning with data', () => {
      const data = { warning: 'details' };
      logger.warn('warning', data);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(2);
      expect(consoleSpy.warn).toHaveBeenLastCalledWith(data);
    });
  });

  describe('error', () => {
    test('should log error to console.error with error emoji', () => {
      logger.error('test error');
      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toContain('❌');
      expect(call).toContain('test error');
    });

    test('should log error with error object', () => {
      const error = new Error('test error object');
      logger.error('error occurred', error);
      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
      expect(consoleSpy.error).toHaveBeenLastCalledWith(error);
    });
  });

  describe('convenience methods', () => {
    test('startup should log with rocket emoji', () => {
      logger.startup('Server starting');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🚀');
      expect(call).toContain('Server starting');
    });

    test('startup should log with data', () => {
      const data = { port: 3000 };
      logger.startup('Starting', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('shutdown should log with wave emoji', () => {
      logger.shutdown('Server stopping');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('👋');
      expect(call).toContain('Server stopping');
    });

    test('shutdown should log with data', () => {
      const data = { reason: 'graceful' };
      logger.shutdown('Stopping', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('request should log with incoming emoji', () => {
      logger.request('Incoming request');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('📨');
      expect(call).toContain('Incoming request');
    });

    test('request should log with data', () => {
      const data = { method: 'GET', path: '/' };
      logger.request('Request', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('response should log with outgoing emoji', () => {
      logger.response('Sending response');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('📤');
      expect(call).toContain('Sending response');
    });

    test('response should log with data', () => {
      const data = { status: 200 };
      logger.response('Response', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('database should log with database emoji', () => {
      logger.database('Database query');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🗄️');
      expect(call).toContain('Database query');
    });

    test('database should log with data', () => {
      const data = { query: 'SELECT *' };
      logger.database('Query', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('security should log with lock emoji as warning', () => {
      logger.security('Security event');
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('🔒');
      expect(call).toContain('Security event');
    });

    test('security should log with data', () => {
      const data = { event: 'failed_login' };
      logger.security('Security', data);
      expect(consoleSpy.warn).toHaveBeenLastCalledWith(data);
    });

    test('policy should log with clipboard emoji', () => {
      logger.policy('Policy evaluation');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('📋');
      expect(call).toContain('Policy evaluation');
    });

    test('policy should log with data', () => {
      const data = { decision: 'ALLOWED' };
      logger.policy('Policy', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('tool should log with wrench emoji', () => {
      logger.tool('Tool invocation');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🔧');
      expect(call).toContain('Tool invocation');
    });

    test('tool should log with data', () => {
      const data = { name: 'create_file' };
      logger.tool('Tool', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('mcp should log with satellite emoji', () => {
      logger.mcp('MCP connection');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('📡');
      expect(call).toContain('MCP connection');
    });

    test('mcp should log with data', () => {
      const data = { server: 'test-server' };
      logger.mcp('MCP', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('health should log with hospital emoji', () => {
      logger.health('Health check passed');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🏥');
      expect(call).toContain('Health check passed');
    });

    test('health should log with data', () => {
      const data = { status: 'healthy' };
      logger.health('Health', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('session should log with plug emoji', () => {
      logger.session('Session created');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🔌');
      expect(call).toContain('Session created');
    });

    test('session should log with data', () => {
      const data = { sessionId: 'abc123' };
      logger.session('Session', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });
  });

  describe('timestamp formatting', () => {
    test('should format timestamp with hours, minutes, seconds, and milliseconds', () => {
      logger.info('test');
      const call = consoleSpy.log.mock.calls[0][0];
      // Format: [HH:MM:SS.mmm]
      const timestampMatch = call.match(/\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/);
      expect(timestampMatch).not.toBeNull();
    });

    test('should not include timestamp when disabled', () => {
      logger.info('test', undefined, { timestamp: false });
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).not.toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe('prefix formatting', () => {
    test('should include prefix when provided', () => {
      logger.info('test', undefined, { prefix: 'MODULE' });
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('[MODULE]');
    });

    test('should not include prefix when not provided', () => {
      logger.info('test');
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).not.toMatch(/\[.*\].*\[.*\]/); // Should only have timestamp brackets
    });
  });

  describe('custom emoji handling', () => {
    test('should use custom emoji when provided', () => {
      logger.info('test', undefined, { emoji: '🎉' });
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('🎉');
      expect(call).not.toContain('ℹ️'); // Should not have default
    });

    test('should use default emoji when not provided', () => {
      logger.warn('test');
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('⚠️');
    });
  });

  describe('data handling', () => {
    test('should not log data when undefined', () => {
      logger.info('test');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    test('should log data when provided', () => {
      logger.info('test', { key: 'value' });
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });

    test('should log null data', () => {
      logger.info('test', null);
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(null);
    });

    test('should log array data', () => {
      const data = [1, 2, 3];
      logger.info('test', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });

    test('should log complex nested data', () => {
      const data = {
        level1: {
          level2: {
            level3: 'deep value',
          },
        },
      };
      logger.info('test', data);
      expect(consoleSpy.log).toHaveBeenLastCalledWith(data);
    });
  });
});
