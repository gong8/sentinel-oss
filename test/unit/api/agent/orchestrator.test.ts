/**
 * Unified Orchestrator Unit Tests
 * Tests for the unified agent loop (fully mocked, no API calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const {
  mockSendMessage,
  mockExecuteTool,
  mockGetAvailableTools,
  mockSelectTools,
  mockGetToolResultDescription,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockExecuteTool: vi.fn(),
  mockGetAvailableTools: vi.fn(),
  mockSelectTools: vi.fn(),
  // Mock getToolResultDescription to return description from result if available
  mockGetToolResultDescription: vi.fn().mockImplementation((result) => {
    return result?.result?.description ?? 'Tool executed';
  }),
}));

/**
 * Helper to convert mockSendMessage response to streaming events
 * Used by the mock LLM client's streamMessage method
 */
async function* convertToStreamEvents(params?: unknown) {
  // Get the mock response from sendMessage (pass params for proper mock matching)
  const response = await mockSendMessage(params);

  if (!response || !response.content) {
    yield { type: 'done' as const, usage: undefined, stopReason: 'end_turn' };
    return;
  }

  // Emit events for each content block
  for (const block of response.content) {
    if (block.type === 'text') {
      yield { type: 'text' as const, text: block.text };
    } else if (block.type === 'tool_use') {
      yield { type: 'tool_start' as const, id: block.id, name: block.name };
      yield {
        type: 'tool_input' as const,
        id: block.id,
        partialInput: JSON.stringify(block.input),
      };
      yield { type: 'tool_end' as const, id: block.id };
    }
  }

  // Emit done event
  const stopReason =
    response.stopReason ||
    (response.content.some((b: { type: string }) => b.type === 'tool_use')
      ? 'tool_use'
      : 'end_turn');
  yield { type: 'done' as const, usage: response.usage, stopReason };
}

// Mock LLM client with static methods
vi.mock('../../../../packages/api/src/agent/llm/index.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../../packages/api/src/agent/llm/index.js')>();
  return {
    ...original,
    LLMClient: class MockLLMClient {
      sendMessage = mockSendMessage;
      getModel = () => 'mock-model';
      getProvider = () => 'mock-provider';
      static isTextBlock = (block: { type: string }): block is { type: 'text'; text: string } =>
        block.type === 'text';
      static isToolUse = (block: {
        type: string;
      }): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
        block.type === 'tool_use';
      static extractToolUses = (content: Array<{ type: string }>) =>
        content.filter((c) => c.type === 'tool_use');
      static extractText = (content: Array<{ type: string; text?: string }>) =>
        content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');
    },
  };
});

// Mock unified LLM client factory
vi.mock('../../../../packages/api/src/agent/unified-llm-client.js', () => ({
  createLLMClientForContext: vi.fn().mockResolvedValue({
    sendMessage: mockSendMessage,
    streamMessage: (params: unknown) => convertToStreamEvents(params),
    getModel: () => 'mock-model',
    getProvider: () => 'mock-provider',
    supportsStreaming: () => false,
  }),
}));

// Mock unified tool router
vi.mock('../../../../packages/api/src/agent/unified-tool-router.js', () => ({
  createUnifiedToolRouter: vi.fn().mockReturnValue({
    getAvailableTools: mockGetAvailableTools,
    executeTool: mockExecuteTool,
    getToolResultDescription: mockGetToolResultDescription,
  }),
}));

// Mock tool selection service
vi.mock('../../../../packages/api/src/services/toolSelection.js', () => ({
  selectTools: mockSelectTools,
}));

// Mock agent memory service
vi.mock('../../../../packages/api/src/services/agentMemory.js', () => ({
  getRelevantContext: vi.fn().mockResolvedValue([]),
  formatMemoriesForPrompt: vi.fn().mockReturnValue(''),
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock agent plan service
vi.mock('../../../../packages/api/src/services/agentPlan.js', () => ({
  detectMultiStepRequest: vi.fn().mockReturnValue(false),
  generatePlanPrompt: vi.fn(),
  parsePlanFromLLM: vi.fn(),
  createPlan: vi.fn(),
}));

// Mock LLM usage logging
vi.mock('../../../../packages/api/src/services/llmUsage.js', () => ({
  logLlmUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock system prompt
vi.mock('../../../../packages/api/src/agent/prompts/system.js', () => ({
  AGENT_SYSTEM_PROMPT: 'You are a helpful agent.',
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
  createUnifiedOrchestrator,
  type AdminAgentContext,
  type ConversationMessageForConversion,
  type UnifiedAgentResponse,
  type UnifiedOrchestratorResponse,
} from '../../../../packages/api/src/agent/index.js';
import { toClaudeMessages } from '../../../../packages/api/src/agent/utils/index.js';

/**
 * Type guard to check if an OrchestratorResponse is an AgentResponse (not a PlanCreatedResult)
 */
function isAgentResponse(response: UnifiedOrchestratorResponse): response is UnifiedAgentResponse {
  return response.planCreated !== true;
}

/**
 * Helper to assert and narrow to AgentResponse for tests
 * Throws if the response is a PlanCreatedResult
 */
function assertAgentResponse(response: UnifiedOrchestratorResponse): UnifiedAgentResponse {
  if (!isAgentResponse(response)) {
    throw new Error('Expected AgentResponse but got PlanCreatedResult');
  }
  return response;
}

/**
 * Create a test admin context with required fields
 */
function createTestContext(organizationId: string = 'org-1'): AdminAgentContext {
  return {
    mode: 'admin',
    organizationId,
    userId: 'user-1',
    conversationId: 'conv-1',
  };
}

describe('UnifiedOrchestrator', () => {
  const mockTools = [
    { name: 'list_policies', description: 'List policies', input_schema: {} },
    { name: 'get_policy', description: 'Get a policy', input_schema: {} },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock responses
    mockGetAvailableTools.mockResolvedValue(mockTools);
    mockSelectTools.mockResolvedValue(mockTools);
  });

  describe('factory function', () => {
    test('should create orchestrator with default config', () => {
      const orchestrator = createUnifiedOrchestrator();
      expect(orchestrator).toBeDefined();
    });

    test('should create orchestrator with write tools enabled', () => {
      const orchestrator = createUnifiedOrchestrator({
        includeWriteTools: true,
      });
      expect(orchestrator).toBeDefined();
    });
  });

  describe('processMessage', () => {
    test('should process simple message without tool calls', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello! How can I help you?' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Hello', context));

      expect(result.text).toBe('Hello! How can I help you?');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.complete).toBe(true);
      expect(result.stopReason).toBe('end_turn');
      expect(result.pendingConfirmations).toHaveLength(0);
    });

    test('should process message with tool calls', async () => {
      // First LLM response: wants to call a tool
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Let me check the policies.' },
          { type: 'tool_use', id: 'tool-1', name: 'list_policies', input: { limit: 10 } },
        ],
        stopReason: 'tool_use',
      });

      // Tool execution result (unified format - must include id, name, input)
      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'list_policies',
        input: { limit: 10 },
        result: { policies: [{ id: 'p1', slug: 'admin-access' }] },
      });

      // Second LLM response: final answer
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Found 1 policy: admin-access' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('List all policies', context),
      );

      // Streaming-first approach: text is accumulated across all rounds
      // This includes intermediate text like "Let me check..." and final response
      expect(result.text).toBe('Let me check the policies.Found 1 policy: admin-access');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.name).toBe('list_policies');
      expect(result.toolCalls[0]?.result).toEqual({
        policies: [{ id: 'p1', slug: 'admin-access' }],
      });
      expect(result.complete).toBe(true);
    });

    test('should handle tool execution errors', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'get_policy',
            input: { policyId: 'nonexistent' },
          },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'get_policy',
        input: { policyId: 'nonexistent' },
        error: 'Policy not found',
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The policy was not found.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Get policy xyz', context),
      );

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.error).toBe('Policy not found');
      expect(result.toolCalls[0]?.result).toBeUndefined();
    });

    test('should capture pending confirmations from write tools', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'I will create a new policy.' },
          { type: 'tool_use', id: 'tool-1', name: 'create_policy', input: { slug: 'new-policy' } },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'create_policy',
        input: { slug: 'new-policy' },
        result: {
          confirmationRequired: true,
          description: 'Create new policy new-policy',
        },
        confirmationId: 'conf-123',
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Please confirm the policy creation.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Create a policy', context),
      );

      expect(result.pendingConfirmations).toHaveLength(1);
      expect(result.pendingConfirmations[0]).toEqual({
        confirmationId: 'conf-123',
        toolName: 'create_policy',
        toolInput: { slug: 'new-policy' },
        description: 'Create new policy new-policy',
      });
      expect(result.toolCalls[0]?.confirmationId).toBe('conf-123');
    });

    test('should respect max tool rounds limit', async () => {
      // Set up infinite tool call loop
      mockSendMessage.mockResolvedValue({
        content: [
          { type: 'text', text: 'Calling tool...' },
          { type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
      });

      const orchestrator = createUnifiedOrchestrator({ maxToolRounds: 3 });
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Keep calling tools', context),
      );

      // Should stop after maxToolRounds
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
      expect(result.complete).toBe(true);
    });

    test('should include conversation history in messages', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'I remember the context.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();
      const history = [
        { role: 'user' as const, content: 'Previous question' },
        {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: 'Previous answer' }],
        },
      ];

      await orchestrator.processMessage('Follow-up question', context, history);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Previous question' },
            { role: 'assistant', content: [{ type: 'text', text: 'Previous answer' }] },
            { role: 'user', content: 'Follow-up question' },
          ],
        }),
      );
    });

    test('should handle multiple tool calls in single response', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} },
          { type: 'tool_use', id: 'tool-2', name: 'get_policy', input: { id: 'p1' } },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool
        .mockResolvedValueOnce({
          result: { policies: ['p1', 'p2'] },
        })
        .mockResolvedValueOnce({
          result: { policy: { id: 'p1' } },
        });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Here are the results.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Get policies info', context),
      );

      expect(result.toolCalls).toHaveLength(2);
      expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    });
  });

  describe('toClaudeMessages', () => {
    test('should convert simple user message', () => {
      const messages: ConversationMessageForConversion[] = [{ role: 'user', content: 'Hello' }];

      const result = toClaudeMessages(messages);

      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    test('should convert simple assistant message', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = toClaudeMessages(messages);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    test('should convert assistant message with tool calls', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'List policies' },
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'list_policies',
              input: { limit: 10 },
              result: { policies: [] },
            },
          ],
        },
      ];

      const result = toClaudeMessages(messages);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ role: 'user', content: 'List policies' });

      // Assistant message with tool use
      expect(result[1]?.role).toBe('assistant');
      expect(result[1]?.content).toHaveLength(2);
      expect((result[1]?.content as Array<{ type: string }>)[0]?.type).toBe('text');
      expect((result[1]?.content as Array<{ type: string }>)[1]?.type).toBe('tool_use');

      // Tool result
      expect(result[2]?.role).toBe('user');
      expect((result[2]?.content as Array<{ type: string }>)[0]?.type).toBe('tool_result');
    });

    test('should convert assistant message with tool calls but no text', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'List policies' },
        {
          role: 'assistant',
          content: '', // Empty content
          toolCalls: [
            {
              id: 'tool-1',
              name: 'list_policies',
              input: {},
              result: { policies: [] },
            },
          ],
        },
      ];

      const result = toClaudeMessages(messages);

      // Should not include empty text block
      const assistantContent = result[1]?.content as Array<{ type: string }>;
      expect(assistantContent).toHaveLength(1);
      expect(assistantContent[0]?.type).toBe('tool_use');
    });

    test('should handle tool call with error', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'Get policy' },
        {
          role: 'assistant',
          content: 'Let me find that.',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'get_policy',
              input: { id: 'nonexistent' },
              error: 'Policy not found',
            },
          ],
        },
      ];

      const result = toClaudeMessages(messages);

      const toolResult = (result[2]?.content as Array<{ type: string; content?: string }>)[0];
      expect(toolResult?.type).toBe('tool_result');
      expect(toolResult?.content).toContain('error');
      expect(toolResult?.content).toContain('Policy not found');
    });

    test('should handle multiple tool calls in single assistant message', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'Get info' },
        {
          role: 'assistant',
          content: 'Gathering data.',
          toolCalls: [
            { id: 'tool-1', name: 'tool_a', input: {}, result: { a: 1 } },
            { id: 'tool-2', name: 'tool_b', input: {}, result: { b: 2 } },
          ],
        },
      ];

      const result = toClaudeMessages(messages);

      const assistantContent = result[1]?.content as Array<{ type: string }>;
      expect(assistantContent).toHaveLength(3); // text + 2 tool_use

      const toolResults = result[2]?.content as Array<{ type: string }>;
      expect(toolResults).toHaveLength(2); // 2 tool_result
    });

    test('should handle empty messages array', () => {
      const result = toClaudeMessages([]);

      expect(result).toEqual([]);
    });

    test('should handle assistant message with empty toolCalls array', () => {
      const messages: ConversationMessageForConversion[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!', toolCalls: [] },
      ];

      const result = toClaudeMessages(messages);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]);
    });
  });

  // ============================================================================
  // LLM Streaming Failures and Error Scenarios
  // ============================================================================

  describe('LLM streaming failures', () => {
    test('should throw when LLM client fails on first message', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Network error: connection reset'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Hello', context)).rejects.toThrow(
        'Network error: connection reset',
      );
    });

    test('should throw when LLM fails mid-conversation after successful tool call', async () => {
      // First LLM response: wants to call a tool
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} },
        ],
        stopReason: 'tool_use',
      });

      // Tool execution succeeds
      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
      });

      // Second LLM call fails (simulating streaming failure mid-conversation)
      mockSendMessage.mockRejectedValueOnce(new Error('LLM streaming interrupted'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('List policies', context)).rejects.toThrow(
        'LLM streaming interrupted',
      );
    });

    test('should handle LLM returning empty/null content gracefully', async () => {
      // Return a response with missing content
      mockSendMessage.mockResolvedValueOnce({
        content: null,
        stopReason: 'error',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      // Streaming-first approach: handles null content gracefully by completing with empty result
      const result = assertAgentResponse(await orchestrator.processMessage('Hello', context));
      expect(result.text).toBe('');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.complete).toBe(true);
    });

    test('should handle LLM timeout gracefully', async () => {
      // Simulate a timeout by rejecting with a timeout error
      mockSendMessage.mockRejectedValueOnce(new Error('Request timeout after 30000ms'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Hello', context)).rejects.toThrow(
        'Request timeout after 30000ms',
      );
    });

    test('should throw on API rate limit errors', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Rate limit exceeded: 429'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Hello', context)).rejects.toThrow(
        'Rate limit exceeded: 429',
      );
    });

    test('should throw on API authentication errors', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Invalid API key: 401'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Hello', context)).rejects.toThrow(
        'Invalid API key: 401',
      );
    });
  });

  // ============================================================================
  // Tool Execution Failures
  // ============================================================================

  describe('tool execution failures', () => {
    test('should continue processing when tool throws unexpected error', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} }],
        stopReason: 'tool_use',
      });

      // Tool execution throws an unexpected error
      mockExecuteTool.mockRejectedValueOnce(new Error('Database connection lost'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      // The error should propagate
      await expect(orchestrator.processMessage('List policies', context)).rejects.toThrow(
        'Database connection lost',
      );
    });

    test('should handle multiple tool failures in sequence', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'tool_a', input: {} },
          { type: 'tool_use', id: 'tool-2', name: 'tool_b', input: {} },
        ],
        stopReason: 'tool_use',
      });

      // Both tools return errors (but don't throw)
      mockExecuteTool
        .mockResolvedValueOnce({
          id: 'tool-1',
          name: 'tool_a',
          input: {},
          success: false,
          error: 'Tool A failed',
        })
        .mockResolvedValueOnce({
          id: 'tool-2',
          name: 'tool_b',
          input: {},
          success: false,
          error: 'Tool B failed',
        });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Both tools failed.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Execute tools', context),
      );

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0]?.error).toBe('Tool A failed');
      expect(result.toolCalls[1]?.error).toBe('Tool B failed');
    });

    test('should handle tool returning undefined result', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} }],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: undefined,
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('List policies', context),
      );

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.result).toBeUndefined();
      expect(result.toolCalls[0]?.error).toBeUndefined();
    });

    test('should handle partial tool execution with first failing', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'tool_a', input: {} },
          { type: 'tool_use', id: 'tool-2', name: 'tool_b', input: {} },
        ],
        stopReason: 'tool_use',
      });

      // First tool throws, second should not be reached
      mockExecuteTool.mockRejectedValueOnce(new Error('Critical failure'));

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Execute', context)).rejects.toThrow(
        'Critical failure',
      );
      // Only the first tool should have been attempted
      expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Context Overflow Handling
  // ============================================================================

  describe('context overflow handling', () => {
    test('should handle very long conversation history', async () => {
      // Create a very long history
      const longHistory: ConversationMessageForConversion[] = [];
      for (let i = 0; i < 100; i++) {
        longHistory.push({ role: 'user', content: `Message ${i}: ${'a'.repeat(1000)}` });
        longHistory.push({ role: 'assistant', content: `Response ${i}: ${'b'.repeat(1000)}` });
      }

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Processed long history.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();
      const llmHistory = toClaudeMessages(longHistory);

      const result = assertAgentResponse(
        await orchestrator.processMessage('Continue', context, llmHistory),
      );

      expect(result.text).toBe('Processed long history.');
      // Verify the full history was passed
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Continue' }),
          ]),
        }),
      );
    });

    test('should handle LLM context length exceeded error', async () => {
      mockSendMessage.mockRejectedValueOnce(
        new Error('Context length exceeded: maximum 200000 tokens'),
      );

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      await expect(orchestrator.processMessage('Hello', context)).rejects.toThrow(
        'Context length exceeded',
      );
    });

    test('should handle max_tokens stop reason', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This response was truncated because...' }],
        stopReason: 'max_tokens',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Generate long response', context),
      );

      // Streaming-first approach: text is captured, stopReason is normalized to 'end_turn'
      expect(result.text).toBe('This response was truncated because...');
      expect(result.stopReason).toBe('end_turn');
      expect(result.complete).toBe(true);
    });

    test('should handle very large tool result', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'list_policies', input: {} }],
        stopReason: 'tool_use',
      });

      // Return a very large result
      const largeResult = { data: 'x'.repeat(100000), items: Array(1000).fill({ id: 1 }) };
      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: largeResult,
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Processed large result.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Get data', context));

      expect(result.toolCalls[0]?.result).toEqual(largeResult);
    });
  });

  // ============================================================================
  // Timeout Scenarios
  // ============================================================================

  describe('timeout scenarios', () => {
    test('should handle slow LLM response within timeout', async () => {
      // Simulate a slow but successful response
      mockSendMessage.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          content: [{ type: 'text', text: 'Slow but successful.' }],
          stopReason: 'end_turn',
        };
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Hello', context));

      expect(result.text).toBe('Slow but successful.');
    });

    test('should handle slow tool execution', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'slow_tool', input: {} }],
        stopReason: 'tool_use',
      });

      // Simulate slow tool execution
      mockExecuteTool.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { id: 'tool-1', name: 'slow_tool', input: {}, result: { result: 'slow' } };
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Tool completed.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Run slow tool', context),
      );

      expect(result.toolCalls[0]?.result).toEqual({ result: 'slow' });
    });

    test('should respect maxToolRounds even with continuous tool calls', async () => {
      // Set up a loop where LLM always wants to call tools
      mockSendMessage.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'tool-loop', name: 'loop_tool', input: {} }],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValue({
        id: 'tool-loop',
        name: 'loop_tool',
        input: {},
        result: { continue: true },
      });

      const orchestrator = createUnifiedOrchestrator({ maxToolRounds: 5 });
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Start loop', context));

      // Should stop after exactly 5 rounds
      expect(mockSendMessage).toHaveBeenCalledTimes(5);
      expect(result.complete).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases with Response Content
  // ============================================================================

  describe('response content edge cases', () => {
    test('should handle empty text blocks', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: 'Actual content' },
          { type: 'text', text: '' },
        ],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Hello', context));

      expect(result.text).toBe('Actual content');
    });

    test('should handle response with only tool_use and no text', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'silent_tool', input: {} }],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'silent_tool',
        input: {},
        result: { done: true },
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Run silent', context));

      expect(result.text).toBe('Done.');
      expect(result.toolCalls).toHaveLength(1);
    });

    test('should handle mixed content blocks across multiple rounds', async () => {
      // Round 1: text + tool
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'First part.' },
          { type: 'tool_use', id: 'tool-1', name: 'tool_a', input: {} },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'tool_a',
        input: {},
        result: { a: 1 },
      });

      // Round 2: more text + another tool
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Second part.' },
          { type: 'tool_use', id: 'tool-2', name: 'tool_b', input: {} },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-2',
        name: 'tool_b',
        input: {},
        result: { b: 2 },
      });

      // Round 3: final text
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Final part.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Multi-round', context));

      // Streaming-first approach: text is accumulated across all rounds
      expect(result.text).toBe('First part.Second part.Final part.');
      expect(result.toolCalls).toHaveLength(2);
    });

    test('should handle null stopReason', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response with null stop.' }],
        stopReason: null,
      });

      const orchestrator = createUnifiedOrchestrator();
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Hello', context));

      // Streaming-first approach: stopReason is normalized to 'end_turn' for completed streams
      expect(result.text).toBe('Response with null stop.');
      expect(result.stopReason).toBe('end_turn');
      expect(result.complete).toBe(true);
    });
  });

  // ============================================================================
  // Redirect Action Handling
  // ============================================================================

  describe('redirect action handling', () => {
    test('should capture redirect action from tool result', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'create_policy', input: { slug: 'new' } },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool.mockResolvedValueOnce({
        id: 'tool-1',
        name: 'create_policy',
        input: { slug: 'new' },
        result: { id: 'policy-123' },
        redirectAction: { type: 'policy', id: 'policy-123' },
      });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Policy created.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
      const context = createTestContext();

      const result = assertAgentResponse(
        await orchestrator.processMessage('Create policy', context),
      );

      expect(result.redirectAction).toEqual({ type: 'policy', id: 'policy-123' });
    });

    test('should use last redirect action when multiple tools return redirects', async () => {
      mockSendMessage.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'tool_a', input: {} },
          { type: 'tool_use', id: 'tool-2', name: 'tool_b', input: {} },
        ],
        stopReason: 'tool_use',
      });

      mockExecuteTool
        .mockResolvedValueOnce({
          id: 'tool-1',
          name: 'tool_a',
          input: {},
          result: {},
          redirectAction: { type: 'first', id: '1' },
        })
        .mockResolvedValueOnce({
          id: 'tool-2',
          name: 'tool_b',
          input: {},
          result: {},
          redirectAction: { type: 'second', id: '2' },
        });

      mockSendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done.' }],
        stopReason: 'end_turn',
      });

      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
      const context = createTestContext();

      const result = assertAgentResponse(await orchestrator.processMessage('Run tools', context));

      // Last redirect wins
      expect(result.redirectAction).toEqual({ type: 'second', id: '2' });
    });
  });
});
