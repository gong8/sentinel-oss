/**
 * Unified Streaming Orchestrator Unit Tests
 * Tests for mode-based streaming behavior (fully mocked, no API calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const {
  mockStreamMessage,
  mockGetAvailableTools,
  mockExecuteTool,
  mockSelectTools,
  mockGetRelevantContext,
  mockDetectMultiStepRequest,
} = vi.hoisted(() => ({
  mockStreamMessage: vi.fn(),
  mockGetAvailableTools: vi.fn(),
  mockExecuteTool: vi.fn(),
  mockSelectTools: vi.fn(),
  mockGetRelevantContext: vi.fn(),
  mockDetectMultiStepRequest: vi.fn(),
}));

// Mock LLM client factory
vi.mock('../../../../packages/api/src/agent/unified-llm-client.js', () => ({
  createLLMClientForContext: vi.fn().mockResolvedValue({
    streamMessage: mockStreamMessage,
    getProvider: () => 'anthropic',
    getModel: () => 'claude-3-sonnet',
    supportsStreaming: () => true,
  }),
}));

// Mock unified tool router
vi.mock('../../../../packages/api/src/agent/unified-tool-router.js', () => ({
  createUnifiedToolRouter: vi.fn(() => ({
    getAvailableTools: mockGetAvailableTools,
    executeTool: mockExecuteTool,
    getToolResultDescription: vi.fn(() => 'Tool executed'),
  })),
  UnifiedToolRouter: vi.fn(),
}));

// Mock tool selection
vi.mock('../../../../packages/api/src/services/toolSelection.js', () => ({
  selectTools: mockSelectTools,
}));

// Mock agent memory
vi.mock('../../../../packages/api/src/services/agentMemory.js', () => ({
  getRelevantContext: mockGetRelevantContext,
  formatMemoriesForPrompt: vi.fn(() => '\n\n[Memory context]'),
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock agent plan
vi.mock('../../../../packages/api/src/services/agentPlan.js', () => ({
  detectMultiStepRequest: mockDetectMultiStepRequest,
  generatePlanPrompt: vi.fn(() => 'Plan prompt'),
  parsePlanFromLLM: vi.fn(),
  createPlan: vi.fn(),
}));

// Mock LLM usage logging
vi.mock('../../../../packages/api/src/services/llmUsage.js', () => ({
  logLlmUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock system prompt
vi.mock('../../../../packages/api/src/agent/prompts/system.js', () => ({
  AGENT_SYSTEM_PROMPT: 'You are a Sentinel admin agent.',
}));

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocking
import {
  UnifiedOrchestrator,
  createUnifiedOrchestrator,
} from '../../../../packages/api/src/agent/unified-orchestrator.js';
import type {
  AdminAgentContext,
  UnifiedStreamingEvent,
  WorkspaceAgentContext,
} from '../../../../packages/api/src/agent/unified-types.js';

describe('UnifiedStreamingOrchestrator', () => {
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

    // Default: no multi-step detection
    mockDetectMultiStepRequest.mockReturnValue(false);

    // Default: no memory context
    mockGetRelevantContext.mockResolvedValue([]);

    // Default: return provided tools
    mockSelectTools.mockImplementation(({ allTools }) => Promise.resolve(allTools));

    // Default: return some tools
    mockGetAvailableTools.mockResolvedValue([
      { name: 'list_policies', description: 'List policies', input_schema: { type: 'object' } },
    ]);
  });

  describe('factory function', () => {
    test('createUnifiedOrchestrator creates an instance', () => {
      const orchestrator = createUnifiedOrchestrator();
      expect(orchestrator).toBeInstanceOf(UnifiedOrchestrator);
    });

    test('accepts configuration options', () => {
      const orchestrator = createUnifiedOrchestrator({
        maxToolRounds: 5,
        includeWriteTools: false,
      });
      expect(orchestrator).toBeInstanceOf(UnifiedOrchestrator);
    });
  });

  describe('text streaming', () => {
    test('yields text events in real-time', async () => {
      // Simulate streaming text response
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'text', text: 'world!' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('Hi', adminContext, [])) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0]).toEqual({ type: 'text', text: 'Hello ' });
      expect(textEvents[1]).toEqual({ type: 'text', text: 'world!' });
    });

    test('emits done event with model info', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Done' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('Hi', adminContext, [])) {
        events.push(event);
      }

      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toEqual({ type: 'done', model: 'claude-3-sonnet' });
    });
  });

  describe('tool execution', () => {
    test('emits tool_start and tool_result events', async () => {
      // Simulate tool call
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'list_policies' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
        decision: 'ALLOWED',
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream(
        'List policies',
        adminContext,
        [],
      )) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'tool_start' && e.toolName === 'list_policies')).toBe(
        true,
      );
      expect(events.some((e) => e.type === 'tool_result' && e.toolName === 'list_policies')).toBe(
        true,
      );
    });
  });

  describe('admin mode specific behavior', () => {
    test('emits confirmation events for write tools', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'create_policy' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{"name":"Test"}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'create_policy',
        input: { name: 'Test' },
        result: { id: 'policy-1' },
        confirmationId: 'confirm-123',
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream(
        'Create policy',
        adminContext,
        [],
      )) {
        events.push(event);
      }

      const confirmEvent = events.find((e) => e.type === 'confirmation');
      expect(confirmEvent).toBeDefined();
      expect(confirmEvent).toEqual({
        type: 'confirmation',
        confirmationId: 'confirm-123',
        toolId: 'tool-1',
        toolName: 'create_policy',
        toolInput: { name: 'Test' },
        description: 'Tool executed',
      });
    });

    test('admin mode does NOT emit permission_denied events', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'list_policies' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('List', adminContext, [])) {
        events.push(event);
      }

      // Admin mode should never emit permission_denied
      expect(events.some((e) => e.type === 'permission_denied')).toBe(false);
    });
  });

  describe('workspace mode specific behavior', () => {
    test('emits permission_denied events when policy denies', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'github::delete_repo' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{"id":"repo-1"}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'github::delete_repo',
        input: { id: 'repo-1' },
        decision: 'DENIED',
        deniedReason: 'Delete operations are not allowed',
        serverDomain: 'github.com',
        blockingPolicyId: 'policy-456',
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream(
        'Delete repo',
        workspaceContext,
        [],
      )) {
        events.push(event);
      }

      const deniedEvent = events.find((e) => e.type === 'permission_denied');
      expect(deniedEvent).toBeDefined();
      expect(deniedEvent).toEqual({
        type: 'permission_denied',
        toolName: 'github::delete_repo',
        reason: 'Delete operations are not allowed',
        serverDomain: 'github.com',
        blockingPolicyId: 'policy-456',
      });
    });

    test('workspace mode does NOT emit confirmation events', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'github::list_repos' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'github::list_repos',
        input: {},
        result: { repos: [] },
        decision: 'ALLOWED',
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream(
        'List repos',
        workspaceContext,
        [],
      )) {
        events.push(event);
      }

      // Workspace mode should never emit confirmation events
      expect(events.some((e) => e.type === 'confirmation')).toBe(false);
    });
  });

  describe('error handling', () => {
    test('emits error event on stream error', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'error', error: 'API connection failed' };
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('Hi', adminContext, [])) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toEqual({ type: 'error', error: 'API connection failed' });
    });
  });

  describe('system prompt selection', () => {
    test('uses admin system prompt for admin context', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Response' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('Hi', adminContext, [])) {
        events.push(event);
      }

      // Verify streamMessage was called with admin system prompt
      expect(mockStreamMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Sentinel admin'),
        }),
      );
    });

    test('uses workspace system prompt for workspace context', async () => {
      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Response' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator();
      const events: UnifiedStreamingEvent[] = [];

      for await (const event of orchestrator.processMessageStream('Hi', workspaceContext, [])) {
        events.push(event);
      }

      // Verify streamMessage was called with workspace system prompt
      expect(mockStreamMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('workspace'),
        }),
      );
    });
  });

  describe('dependency injection pattern', () => {
    test('accepts custom services via config for text-only responses', async () => {
      // Create mock services for testing
      const mockServices = {
        detectMultiStepRequest: vi.fn().mockReturnValue(false),
        prepareSystemPrompt: vi.fn().mockResolvedValue('Custom system prompt'),
        logLlmUsage: vi.fn(),
      };

      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Response' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator({
        services: mockServices,
      });

      const events: UnifiedStreamingEvent[] = [];
      for await (const event of orchestrator.processMessageStream('Hello', adminContext, [])) {
        events.push(event);
      }

      // Verify custom services were called
      expect(mockServices.detectMultiStepRequest).toHaveBeenCalledWith('Hello');
      expect(mockServices.prepareSystemPrompt).toHaveBeenCalledWith(adminContext, 'Hello');
      // logLlmUsage is called after streaming (fire and forget)
      expect(mockServices.logLlmUsage).toHaveBeenCalled();
    });

    test('uses extractKeywords and recordToolUsage when tools are executed', async () => {
      const mockServices = {
        detectMultiStepRequest: vi.fn().mockReturnValue(false),
        extractKeywords: vi.fn().mockReturnValue(['list', 'policies']),
        recordToolUsage: vi.fn(),
      };

      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'tool_start', id: 'tool-1', name: 'list_policies' };
        yield { type: 'tool_input', id: 'tool-1', partialInput: '{}' };
        yield { type: 'tool_end', id: 'tool-1' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'tool_use' };
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
        decision: 'ALLOWED',
      });

      const orchestrator = createUnifiedOrchestrator({
        services: mockServices,
      });

      const events: UnifiedStreamingEvent[] = [];
      for await (const event of orchestrator.processMessageStream(
        'List policies',
        adminContext,
        [],
      )) {
        events.push(event);
      }

      // Verify extractKeywords was called during tool execution
      expect(mockServices.extractKeywords).toHaveBeenCalledWith('List policies');
      // Verify recordToolUsage was called with the keywords
      expect(mockServices.recordToolUsage).toHaveBeenCalledWith(
        adminContext.organizationId,
        adminContext.userId,
        'list_policies',
        ['list', 'policies'],
        true,
      );
    });

    test('accepts custom tool router via config', async () => {
      const mockToolRouter = {
        getAvailableTools: vi
          .fn()
          .mockResolvedValue([
            { name: 'custom_tool', description: 'A custom tool', input_schema: { type: 'object' } },
          ]),
        executeTool: vi.fn().mockResolvedValue({
          id: 'tool-1',
          name: 'custom_tool',
          input: {},
          result: { success: true },
        }),
        getToolResultDescription: vi.fn(() => 'Custom tool executed'),
      };

      mockStreamMessage.mockImplementation(async function* () {
        yield { type: 'text', text: 'Done' };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
      });

      const orchestrator = createUnifiedOrchestrator({
        toolRouter: mockToolRouter as never,
      });

      const events: UnifiedStreamingEvent[] = [];
      for await (const event of orchestrator.processMessageStream('Use tool', adminContext, [])) {
        events.push(event);
      }

      // Verify custom tool router's getAvailableTools was called
      expect(mockToolRouter.getAvailableTools).toHaveBeenCalledWith(adminContext);
    });
  });
});
