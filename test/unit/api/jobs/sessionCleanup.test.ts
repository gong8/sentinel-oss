/**
 * Session Cleanup Job Unit Tests
 * Tests for the periodic session cleanup job
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the session service
vi.mock('../../../../packages/api/src/services/session.js', () => ({
  markExpiredSessions: vi.fn(),
  cleanupExpiredSessions: vi.fn(),
  cleanupExpiredContextEntries: vi.fn(),
}));

// Mock logger to avoid console noise
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  runSessionCleanup,
  startSessionCleanupInterval,
} from '../../../../packages/api/src/jobs/sessionCleanup.js';
import { logger } from '../../../../packages/api/src/lib/logger.js';
import {
  cleanupExpiredContextEntries,
  cleanupExpiredSessions,
  markExpiredSessions,
} from '../../../../packages/api/src/services/session.js';

describe('Session Cleanup Job', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runSessionCleanup', () => {
    test('should call all cleanup functions in order', async () => {
      const mockMarkExpired = vi.mocked(markExpiredSessions);
      const mockCleanupSessions = vi.mocked(cleanupExpiredSessions);
      const mockCleanupEntries = vi.mocked(cleanupExpiredContextEntries);

      mockMarkExpired.mockResolvedValue(5);
      mockCleanupSessions.mockResolvedValue(3);
      mockCleanupEntries.mockResolvedValue(10);

      const result = await runSessionCleanup();

      expect(result).toEqual({
        markedExpired: 5,
        sessionsDeleted: 3,
        entriesDeleted: 10,
      });

      expect(mockMarkExpired).toHaveBeenCalledTimes(1);
      expect(mockCleanupSessions).toHaveBeenCalledTimes(1);
      expect(mockCleanupEntries).toHaveBeenCalledTimes(1);
    });

    test('should return zero counts when nothing to clean', async () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const result = await runSessionCleanup();

      expect(result).toEqual({
        markedExpired: 0,
        sessionsDeleted: 0,
        entriesDeleted: 0,
      });
    });

    test('should log start and completion', async () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(2);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(1);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(5);

      await runSessionCleanup();

      expect(logger.info).toHaveBeenCalledWith('Starting session cleanup job');
      expect(logger.info).toHaveBeenCalledWith('Session cleanup job completed', {
        markedExpired: 2,
        sessionsDeleted: 1,
        entriesDeleted: 5,
      });
    });

    test('should propagate errors from markExpiredSessions', async () => {
      vi.mocked(markExpiredSessions).mockRejectedValue(new Error('Database error'));

      await expect(runSessionCleanup()).rejects.toThrow('Database error');
    });

    test('should propagate errors from cleanupExpiredSessions', async () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockRejectedValue(new Error('Cleanup failed'));

      await expect(runSessionCleanup()).rejects.toThrow('Cleanup failed');
    });

    test('should propagate errors from cleanupExpiredContextEntries', async () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockRejectedValue(new Error('Entry cleanup failed'));

      await expect(runSessionCleanup()).rejects.toThrow('Entry cleanup failed');
    });
  });

  describe('startSessionCleanupInterval', () => {
    test('should run cleanup immediately on start', async () => {
      // Use real timers for this test since we're testing immediate execution
      vi.useRealTimers();

      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalId = startSessionCleanupInterval();

      // Wait a tick for the immediate run to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(markExpiredSessions).toHaveBeenCalledTimes(1);

      clearInterval(intervalId);
      vi.useFakeTimers();
    });

    test('should use default interval of 1 hour', () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalId = startSessionCleanupInterval();

      expect(logger.info).toHaveBeenCalledWith(
        'Starting session cleanup interval (every 60 minutes)',
      );

      clearInterval(intervalId);
    });

    test('should accept custom interval', () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const customInterval = 30 * 60 * 1000; // 30 minutes
      const intervalId = startSessionCleanupInterval(customInterval);

      expect(logger.info).toHaveBeenCalledWith(
        'Starting session cleanup interval (every 30 minutes)',
      );

      clearInterval(intervalId);
    });

    test('should run cleanup on interval ticks', async () => {
      // Use real timers with a short interval for this test
      vi.useRealTimers();

      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalMs = 50; // 50ms for fast test
      const intervalId = startSessionCleanupInterval(intervalMs);

      // Wait for immediate run + one interval tick
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Should have run at least twice (immediate + at least one interval)
      expect(vi.mocked(markExpiredSessions).mock.calls.length).toBeGreaterThanOrEqual(2);

      clearInterval(intervalId);
      vi.useFakeTimers();
    });

    test('should log error when cleanup fails but not crash interval', async () => {
      // Use real timers for this test
      vi.useRealTimers();

      vi.mocked(markExpiredSessions).mockRejectedValue(new Error('Cleanup failed'));
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalMs = 50; // 50ms for fast test
      const intervalId = startSessionCleanupInterval(intervalMs);

      // Wait for immediate run to fail
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(logger.error).toHaveBeenCalledWith('Session cleanup job failed:', expect.any(Error));

      // Reset mock to succeed for interval tick
      vi.mocked(markExpiredSessions).mockResolvedValue(0);

      // Wait for interval tick
      await new Promise((resolve) => setTimeout(resolve, 80));

      // Should have attempted cleanup at least twice (immediate failure + at least one interval)
      expect(vi.mocked(markExpiredSessions).mock.calls.length).toBeGreaterThanOrEqual(2);

      clearInterval(intervalId);
      vi.useFakeTimers();
    });

    test('should return interval ID that can be cleared', () => {
      vi.mocked(markExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalId = startSessionCleanupInterval();

      expect(intervalId).toBeDefined();
      expect(typeof intervalId).toBe('object'); // NodeJS.Timeout is an object

      clearInterval(intervalId);
    });

    test('should log error when interval callback cleanup fails', async () => {
      // Use real timers for this test
      vi.useRealTimers();

      // First call succeeds (immediate run), subsequent calls fail (interval)
      vi.mocked(markExpiredSessions)
        .mockResolvedValueOnce(0) // immediate run succeeds
        .mockRejectedValue(new Error('Interval cleanup failed')); // interval runs fail
      vi.mocked(cleanupExpiredSessions).mockResolvedValue(0);
      vi.mocked(cleanupExpiredContextEntries).mockResolvedValue(0);

      const intervalMs = 50; // 50ms for fast test
      const intervalId = startSessionCleanupInterval(intervalMs);

      // Wait for immediate run to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Clear previous calls - immediate run logged info
      vi.mocked(logger.error).mockClear();

      // Wait for interval tick to fail
      await new Promise((resolve) => setTimeout(resolve, 80));

      // The interval callback error should have been logged
      expect(logger.error).toHaveBeenCalledWith(
        'Session cleanup job failed:',
        expect.objectContaining({ message: 'Interval cleanup failed' }),
      );

      clearInterval(intervalId);
      vi.useFakeTimers();
    });
  });
});
