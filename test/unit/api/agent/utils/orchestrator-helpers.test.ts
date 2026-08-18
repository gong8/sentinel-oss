/**
 * Orchestrator Helpers Tests
 * Tests for shared orchestrator utility functions
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockLogLlmUsage } = vi.hoisted(() => ({
  mockLogLlmUsage: vi.fn(),
}));

// Mock the logger before importing functions
vi.mock('../../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock LLM usage logging
vi.mock('../../../../../packages/api/src/services/llmUsage.js', () => ({
  logLlmUsage: mockLogLlmUsage,
}));

import type {
  AdminAgentContext,
  WorkspaceAgentContext,
} from '../../../../../packages/api/src/agent/unified-types.js';
import {
  createPermissionDeniedData,
  logLlmUsageForResponse,
  parseToolInput,
} from '../../../../../packages/api/src/agent/utils/orchestrator-helpers.js';

describe('parseToolInput', () => {
  test('parses valid JSON input', () => {
    const result = parseToolInput('{"name":"test","value":42}');
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  test('parses JSON array', () => {
    const result = parseToolInput('[1,2,3]');
    expect(result).toEqual([1, 2, 3]);
  });

  test('parses JSON string value', () => {
    const result = parseToolInput('"hello"');
    expect(result).toBe('hello');
  });

  test('parses JSON number value', () => {
    const result = parseToolInput('42');
    expect(result).toBe(42);
  });

  test('parses JSON boolean value', () => {
    const result = parseToolInput('true');
    expect(result).toBe(true);
  });

  test('parses JSON null value', () => {
    const result = parseToolInput('null');
    expect(result).toBeNull();
  });

  test('returns empty object for undefined input', () => {
    const result = parseToolInput(undefined);
    expect(result).toEqual({});
  });

  test('returns empty object for empty string', () => {
    const result = parseToolInput('');
    expect(result).toEqual({});
  });

  test('returns empty object for invalid JSON', () => {
    const result = parseToolInput('{invalid json}');
    expect(result).toEqual({});
  });

  test('returns empty object for malformed JSON', () => {
    const result = parseToolInput('{"name": "test"');
    expect(result).toEqual({});
  });
});

describe('createPermissionDeniedData', () => {
  test('creates permission denied data with all fields', () => {
    const result = createPermissionDeniedData(
      'github::delete_repo',
      'Delete operations are not allowed',
      'github.com',
      'policy-123',
    );

    expect(result).toEqual({
      toolName: 'github::delete_repo',
      reason: 'Delete operations are not allowed',
      serverDomain: 'github.com',
      blockingPolicyId: 'policy-123',
    });
  });

  test('provides default reason when undefined', () => {
    const result = createPermissionDeniedData('some_tool', undefined, undefined, undefined);

    expect(result).toEqual({
      toolName: 'some_tool',
      reason: 'Access denied by policy',
      serverDomain: undefined,
      blockingPolicyId: undefined,
    });
  });

  test('handles partial fields', () => {
    const result = createPermissionDeniedData(
      'slack::post_message',
      'Not authorized',
      'slack.com',
      undefined,
    );

    expect(result).toEqual({
      toolName: 'slack::post_message',
      reason: 'Not authorized',
      serverDomain: 'slack.com',
      blockingPolicyId: undefined,
    });
  });
});

describe('logLlmUsageForResponse', () => {
  const adminContext: AdminAgentContext = {
    mode: 'admin',
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    sessionId: 'session-1',
  };

  const workspaceContext: WorkspaceAgentContext = {
    mode: 'workspace',
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    userEmail: 'user@test.com',
    userRoles: ['user'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogLlmUsage.mockResolvedValue(undefined);
  });

  test('does not log when usage is undefined', () => {
    logLlmUsageForResponse(adminContext, 'anthropic', 'claude-3-sonnet', undefined, 'chat');
    expect(mockLogLlmUsage).not.toHaveBeenCalled();
  });

  test('logs usage with admin context', () => {
    logLlmUsageForResponse(
      adminContext,
      'anthropic',
      'claude-3-sonnet',
      { inputTokens: 100, outputTokens: 50 },
      'chat',
    );

    expect(mockLogLlmUsage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sessionId: 'session-1',
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      inputTokens: 100,
      outputTokens: 50,
      requestType: 'chat',
    });
  });

  test('logs usage with workspace context', () => {
    logLlmUsageForResponse(
      workspaceContext,
      'openai',
      'gpt-4',
      { inputTokens: 200, outputTokens: 100 },
      'workspace_streaming',
    );

    expect(mockLogLlmUsage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sessionId: 'conv-1',
      provider: 'openai',
      model: 'gpt-4',
      inputTokens: 200,
      outputTokens: 100,
      requestType: 'workspace_streaming',
    });
  });

  test('handles logging failure gracefully', async () => {
    mockLogLlmUsage.mockRejectedValue(new Error('Logging failed'));

    // Should not throw
    logLlmUsageForResponse(
      adminContext,
      'anthropic',
      'claude-3-sonnet',
      { inputTokens: 100, outputTokens: 50 },
      'chat',
    );

    expect(mockLogLlmUsage).toHaveBeenCalled();

    // Wait for the promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
