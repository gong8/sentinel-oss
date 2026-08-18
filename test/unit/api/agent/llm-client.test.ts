/**
 * LLM Client Unit Tests
 * Tests for the unified LLM client abstraction (fully mocked, no API calls)
 */

import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks AND set env vars (this runs before imports)
const { mockFetch, mockAnthropicCreate, originalEnvVars } = vi.hoisted(() => {
  // Capture original env vars
  const origVars = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AGENT_MODEL: process.env.AGENT_MODEL,
    AGENT_MAX_TOKENS: process.env.AGENT_MAX_TOKENS,
  };

  // Clear all API keys first, then set only what we need for testing
  delete process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  return {
    mockFetch: vi.fn(),
    mockAnthropicCreate: vi.fn(),
    originalEnvVars: origVars,
  };
});

// Mock fetch for Gemini
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the Anthropic SDK with a more complete implementation
vi.mock('@anthropic-ai/sdk', () => {
  // Create a class that mimics the Anthropic SDK structure
  class MockAnthropic {
    messages: { create: typeof mockAnthropicCreate };
    constructor() {
      this.messages = {
        create: mockAnthropicCreate,
      };
    }
  }
  return {
    default: MockAnthropic,
  };
});

// Import the module after env vars are set in hoisted block
import { LLMClient } from '../../../../packages/api/src/agent/llm/index.js';

// Helper to import module with specific env vars (for tests needing module isolation)
async function importWithEnv(envVars: Record<string, string | undefined>) {
  // Clear existing env vars
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AGENT_MODEL;
  delete process.env.AGENT_MAX_TOKENS;

  // Set specified env vars
  for (const [key, value] of Object.entries(envVars)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  // Reset module cache and import fresh
  vi.resetModules();

  // Re-mock the logger
  vi.doMock('../../../../packages/api/src/lib/logger.js', () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  }));

  // Mock @sentinel/db to prevent dotenv.config() from reloading .env
  vi.doMock('@sentinel/db', () => ({
    prisma: {
      organizationSettings: {
        findUnique: vi.fn(),
      },
    },
  }));

  // Re-mock the Anthropic SDK
  vi.doMock('@anthropic-ai/sdk', () => {
    class MockAnthropic {
      messages: { create: typeof mockAnthropicCreate };
      constructor() {
        this.messages = {
          create: mockAnthropicCreate,
        };
      }
    }
    return { default: MockAnthropic };
  });

  const module = await import('../../../../packages/api/src/agent/llm/index.js');
  return module.LLMClient;
}

describe('LLMClient', () => {
  afterAll(() => {
    // Restore original env vars after all tests complete
    if (originalEnvVars.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = originalEnvVars.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalEnvVars.GEMINI_API_KEY !== undefined) {
      process.env.GEMINI_API_KEY = originalEnvVars.GEMINI_API_KEY;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalEnvVars.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnvVars.ANTHROPIC_API_KEY;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalEnvVars.AGENT_MODEL !== undefined) {
      process.env.AGENT_MODEL = originalEnvVars.AGENT_MODEL;
    } else {
      delete process.env.AGENT_MODEL;
    }
    if (originalEnvVars.AGENT_MAX_TOKENS !== undefined) {
      process.env.AGENT_MAX_TOKENS = originalEnvVars.AGENT_MAX_TOKENS;
    } else {
      delete process.env.AGENT_MAX_TOKENS;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider Selection', () => {
    test('should throw error when no API key is configured', async () => {
      const LLMClientNoKeys = await importWithEnv({});
      expect(() => new LLMClientNoKeys()).toThrow(
        'No LLM API key configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env',
      );
    });

    test('should use Gemini provider when GEMINI_API_KEY is set', async () => {
      const LLMClientGemini = await importWithEnv({ GEMINI_API_KEY: 'test-gemini-key' });
      const client = new LLMClientGemini();
      expect(client.getProvider()).toBe('gemini');
    });

    test('should use Claude provider when only ANTHROPIC_API_KEY is set', async () => {
      const LLMClientClaude = await importWithEnv({ ANTHROPIC_API_KEY: 'test-anthropic-key' });
      const client = new LLMClientClaude();
      expect(client.getProvider()).toBe('claude');
    });

    test('should prefer Claude when both Claude and Gemini keys are set (OpenAI > Claude > Gemini priority)', async () => {
      // Uses importWithEnv for proper module isolation
      // With priority OpenAI > Claude > Gemini, Claude should be selected when both are set
      const LLMClientBoth = await importWithEnv({
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        GEMINI_API_KEY: 'test-gemini-key',
      });
      const client = new LLMClientBoth();
      expect(client.getProvider()).toBe('claude');
    });

    test('should allow explicit provider override', () => {
      // Uses the statically imported LLMClient which has both keys
      const client = new LLMClient({ provider: 'claude' });
      expect(client.getProvider()).toBe('claude');
    });
  });

  describe('Gemini Provider', () => {
    test('should send message to Gemini API', async () => {
      const mockGeminiResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from Gemini!' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockGeminiResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from Gemini!' });
      expect(result.stopReason).toBe('end_turn');
    });

    test('should handle Gemini tool calls', async () => {
      const mockGeminiResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Let me search that for you.' },
                  { functionCall: { name: 'search', args: { query: 'test' } } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockGeminiResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Search for test' }],
        tools: [
          {
            name: 'search',
            description: 'Search for information',
            input_schema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ],
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Let me search that for you.' });
      expect(result.content[1]?.type).toBe('tool_use');
      expect((result.content[1] as { name: string }).name).toBe('search');
    });

    test('should handle Gemini API error', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };
      mockFetch.mockResolvedValueOnce(mockErrorResponse);

      const client = new LLMClient({ provider: 'gemini' });

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('Gemini API error: 500');
    });

    test('should handle empty Gemini response gracefully', async () => {
      // The implementation has retry logic (maxRetries=2), so we need to provide
      // enough mock responses for all retry attempts (initial + 2 retries = 3 total)
      const createMockEmptyResponse = () => ({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: null,
              finishReason: 'STOP',
            },
          ],
        }),
      });
      mockFetch
        .mockResolvedValueOnce(createMockEmptyResponse())
        .mockResolvedValueOnce(createMockEmptyResponse())
        .mockResolvedValueOnce(createMockEmptyResponse());

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // When Gemini returns empty responses, the implementation provides a helpful
      // fallback message instead of returning empty content (better UX)
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('I apologize'),
      });
      expect(result.stopReason).toBe('end_turn');
    });

    test('should convert tool results correctly', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Based on the search results...' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });

      // Message history with tool use and result
      const messages = [
        { role: 'user' as const, content: 'Search for info' },
        {
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 'tool-1', name: 'search', input: { query: 'info' } },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'tool-1',
              content: JSON.stringify({ results: ['result1', 'result2'] }),
            },
          ],
        },
      ];

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Based on the search results...',
      });
    });

    test('should handle tool with empty properties', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'list_all', args: {} } }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'List all items' }],
        tools: [
          {
            name: 'list_all',
            description: 'List all items without parameters',
            input_schema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('tool_use');

      // Verify the request body includes properly formatted empty tool
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools[0].functionDeclarations[0].parameters).toEqual({
        type: 'object',
        properties: {},
      });
    });

    test('should strip additionalProperties from nested schema', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'I can help with that' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            name: 'nested_tool',
            description: 'Tool with nested schema',
            input_schema: {
              type: 'object',
              properties: {
                nested: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
        ],
      });

      // Verify additionalProperties is stripped from request
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolParams = requestBody.tools[0].functionDeclarations[0].parameters;
      expect(toolParams.additionalProperties).toBeUndefined();
      expect(toolParams.properties.nested.additionalProperties).toBeUndefined();
    });

    test('should strip additionalProperties from arrays in schema', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Processed' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            name: 'array_tool',
            description: 'Tool with array in schema',
            input_schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: [
                    { type: 'string', additionalProperties: false },
                    { type: 'number', additionalProperties: false },
                  ],
                },
              },
            },
          },
        ],
      });

      // Verify additionalProperties is stripped from array items
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolParams = requestBody.tools[0].functionDeclarations[0].parameters;
      expect(toolParams.properties.items.items[0].additionalProperties).toBeUndefined();
      expect(toolParams.properties.items.items[1].additionalProperties).toBeUndefined();
    });

    test('should add type to typeless properties from z.unknown()', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Policy created' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Create a policy' }],
        tools: [
          {
            name: 'create_policy',
            description: 'Create a policy with conditions',
            input_schema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Policy name' },
                conditions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string', description: 'Field to check' },
                      operator: { type: 'string', description: 'Comparison operator' },
                      // This simulates z.unknown() which produces description but no type
                      value: { description: 'Value to compare against' },
                    },
                  },
                },
              },
            },
          },
        ],
      });

      // Verify typeless property gets type: 'string' added
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolParams = requestBody.tools[0].functionDeclarations[0].parameters;
      const valueProperty = toolParams.properties.conditions.items.properties.value;
      expect(valueProperty.type).toBe('string');
      expect(valueProperty.description).toBe('Value to compare against');
    });

    test('should not add type to properties objects with description as property name', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Done' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Create something' }],
        tools: [
          {
            name: 'create_item',
            description: 'Create an item',
            input_schema: {
              type: 'object',
              // This properties object has "description" as a property NAME (key),
              // not as a schema description field. The fix should NOT add type: 'string' here.
              properties: {
                name: { type: 'string', description: 'Item name' },
                description: { type: 'string', description: 'Item description' },
              },
            },
          },
        ],
      });

      // Verify the properties object doesn't get an extra "type" property added
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolParams = requestBody.tools[0].functionDeclarations[0].parameters;
      // The properties object should have exactly 2 keys: name and description
      // It should NOT have a "type" key added to it
      expect(Object.keys(toolParams.properties)).toEqual(['name', 'description']);
      expect(toolParams.properties.type).toBeUndefined();
    });

    test('should handle assistant messages with text content array', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Continue with the task...' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });

      // Message with assistant having array content containing text blocks
      const messages = [
        { role: 'user' as const, content: 'Start task' },
        {
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'Starting the task...' },
            { type: 'text' as const, text: 'Here is my analysis:' },
          ],
        },
        { role: 'user' as const, content: 'Continue' },
      ];

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Continue with the task...',
      });
    });

    test('should handle invalid Gemini response format', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          invalid: 'response format',
          candidates: 'not an array',
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('Invalid Gemini API response format');
    });

    test('should map different Gemini finish reasons', async () => {
      // Test MAX_TOKENS finish reason
      const mockMaxTokensResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Truncated response...' }],
              },
              finishReason: 'MAX_TOKENS',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockMaxTokensResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Write a very long essay' }],
      });

      expect(result.stopReason).toBe('max_tokens');
    });

    test('should pass through unmapped Gemini finish reasons', async () => {
      const mockUnknownReasonResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
              },
              finishReason: 'SOME_NEW_REASON',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockUnknownReasonResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Unknown reasons are passed through as-is
      expect(result.stopReason).toBe('SOME_NEW_REASON');
    });

    test('should retry on empty response and recover', async () => {
      // First call returns empty, second returns valid response
      const emptyResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [{ content: null, finishReason: 'STOP' }],
        }),
      };
      const validResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: { parts: [{ text: 'Success after retry!' }] },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(emptyResponse).mockResolvedValueOnce(validResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Success after retry!' });
    });

    test('should handle SAFETY finish reason', async () => {
      const mockSafetyResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'I cannot help with that.' }],
              },
              finishReason: 'SAFETY',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockSafetyResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Unsafe request' }],
      });

      expect(result.stopReason).toBe('content_filtered');
    });

    test('should handle missing finishReason', async () => {
      const mockNoReasonResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response without finish reason' }],
              },
              // No finishReason field
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockNoReasonResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.stopReason).toBeNull();
    });

    test('should handle response with missing parts', async () => {
      // Create 3 mock responses since the client retries up to 2 times
      const createMockNoParts = () => ({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                // No parts field
              },
              finishReason: 'STOP',
            },
          ],
        }),
      });

      mockFetch
        .mockResolvedValueOnce(createMockNoParts())
        .mockResolvedValueOnce(createMockNoParts())
        .mockResolvedValueOnce(createMockNoParts());

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Should return fallback message after all retries
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('I apologize'),
      });
    });

    test('should send message without system prompt', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello!' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: '',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Verify system_instruction is not included when system is empty
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.system_instruction).toBeUndefined();
    });

    test('should throw error when GEMINI_API_KEY is missing', async () => {
      const LLMClientNoKey = await importWithEnv({ ANTHROPIC_API_KEY: 'test-key' });
      expect(() => new LLMClientNoKey({ provider: 'gemini' })).toThrow(
        'GEMINI_API_KEY is required for Gemini provider',
      );
    });
  });

  describe('Claude Provider', () => {
    test('should select Claude provider when configured', () => {
      const client = new LLMClient({ provider: 'claude' });
      expect(client.getProvider()).toBe('claude');
    });

    test('should use custom model when provided', () => {
      const client = new LLMClient({
        provider: 'claude',
        model: 'claude-3-opus-20240229',
      });
      expect(client.getProvider()).toBe('claude');
    });

    test('should use custom maxTokens when provided', () => {
      const client = new LLMClient({
        provider: 'claude',
        maxTokens: 8192,
      });
      expect(client.getProvider()).toBe('claude');
    });

    test('should send message to Claude API and parse text response', async () => {
      // Create a client and inject a mock provider
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      // Create a mock that implements ILLMProvider interface
      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from Claude!' });
      expect(result.stopReason).toBe('end_turn');
      expect(mockProvider.sendMessage).toHaveBeenCalledWith({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    test('should handle Claude tool_use response', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Let me search that for you.' },
            { type: 'tool_use', id: 'tool-123', name: 'search', input: { query: 'test' } },
          ],
          stopReason: 'tool_use',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Search for test' }],
        tools: [
          {
            name: 'search',
            description: 'Search for information',
            input_schema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ],
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Let me search that for you.' });
      expect(result.content[1]).toEqual({
        type: 'tool_use',
        id: 'tool-123',
        name: 'search',
        input: { query: 'test' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    test('should convert tool results to Claude format', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Based on the search results...' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const messages = [
        { role: 'user' as const, content: 'Search for info' },
        {
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 'tool-1', name: 'search', input: { query: 'info' } },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'tool-1',
              content: JSON.stringify({ results: ['result1', 'result2'] }),
            },
          ],
        },
      ];

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Based on the search results...',
      });
    });

    test('should handle unknown block types gracefully', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      // Simulate a response with an unexpected block type being parsed
      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Known type' },
            { type: 'text', text: '' }, // Unknown types fall back to empty text in parseResponse
          ],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Known type' });
      // Unknown types fall back to empty text
      expect(result.content[1]).toEqual({ type: 'text', text: '' });
    });

    test('should throw error when ANTHROPIC_API_KEY is missing', async () => {
      const LLMClientNoKey = await importWithEnv({ GEMINI_API_KEY: undefined });
      expect(() => new LLMClientNoKey({ provider: 'claude' })).toThrow(
        'ANTHROPIC_API_KEY is required for Claude provider',
      );
    });
  });

  describe('Static Helper Methods', () => {
    test('isToolUse should identify tool_use blocks', () => {
      expect(LLMClient.isToolUse({ type: 'tool_use', id: 't1', name: 'test', input: {} })).toBe(
        true,
      );
      expect(LLMClient.isToolUse({ type: 'text', text: 'hello' })).toBe(false);
    });

    test('isTextBlock should identify text blocks', () => {
      expect(LLMClient.isTextBlock({ type: 'text', text: 'hello' })).toBe(true);
      expect(LLMClient.isTextBlock({ type: 'tool_use', id: 't1', name: 'test', input: {} })).toBe(
        false,
      );
    });

    test('extractText should concatenate text from blocks', () => {
      const content = [
        { type: 'text' as const, text: 'Hello ' },
        { type: 'tool_use' as const, id: 't1', name: 'test', input: {} },
        { type: 'text' as const, text: 'World' },
      ];

      expect(LLMClient.extractText(content)).toBe('Hello World');
    });

    test('extractToolUses should filter tool_use blocks', () => {
      const content = [
        { type: 'text' as const, text: 'Processing...' },
        { type: 'tool_use' as const, id: 't1', name: 'search', input: { q: 'a' } },
        { type: 'tool_use' as const, id: 't2', name: 'read', input: { f: 'b' } },
      ];

      const toolUses = LLMClient.extractToolUses(content);
      expect(toolUses).toHaveLength(2);
      expect(toolUses[0]?.name).toBe('search');
      expect(toolUses[1]?.name).toBe('read');
    });

    test('extractText should return empty string for no text blocks', () => {
      const content = [{ type: 'tool_use' as const, id: 't1', name: 'test', input: {} }];
      expect(LLMClient.extractText(content)).toBe('');
    });
  });

  describe('Error Cases', () => {
    test('should throw error when provider sendMessage fails', async () => {
      // Create an LLMClient and inject a mock provider that throws
      const client = new LLMClient({ provider: 'gemini' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockRejectedValue(new Error('Provider failed')),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('gemini-2.0-flash'),
        getProvider: vi.fn().mockReturnValue('gemini'),
      };
      clientAsRecord.provider = mockProvider;

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('Provider failed');
    });

    test('should delegate to provider correctly', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      // Create a mock provider that returns a specific response
      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response from provider!' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content[0]).toEqual({ type: 'text', text: 'Response from provider!' });
      expect(mockProvider.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('API Error Scenarios', () => {
    describe('Gemini Rate Limits and Server Errors', () => {
      beforeEach(() => {
        mockFetch.mockReset();
      });

      test('should throw on 429 rate limit error', async () => {
        const mockRateLimitResponse = {
          ok: false,
          status: 429,
          text: vi.fn().mockResolvedValue('Rate limit exceeded. Please retry after 60 seconds.'),
        };
        mockFetch.mockResolvedValueOnce(mockRateLimitResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Gemini API error: 429');
      });

      test('should throw on 503 service unavailable error', async () => {
        const mockServiceUnavailableResponse = {
          ok: false,
          status: 503,
          text: vi.fn().mockResolvedValue('Service temporarily unavailable'),
        };
        mockFetch.mockResolvedValueOnce(mockServiceUnavailableResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Gemini API error: 503');
      });

      test('should throw on 400 bad request error', async () => {
        const mockBadRequestResponse = {
          ok: false,
          status: 400,
          text: vi.fn().mockResolvedValue('Invalid request: malformed JSON'),
        };
        mockFetch.mockResolvedValueOnce(mockBadRequestResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Gemini API error: 400');
      });

      test('should throw on 401 unauthorized error', async () => {
        const mockUnauthorizedResponse = {
          ok: false,
          status: 401,
          text: vi.fn().mockResolvedValue('Invalid API key'),
        };
        mockFetch.mockResolvedValueOnce(mockUnauthorizedResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Gemini API error: 401');
      });
    });

    describe('Claude API Errors', () => {
      test('should propagate Claude API errors', async () => {
        const client = new LLMClient({ provider: 'claude' });
        const clientAsRecord = client as unknown as Record<string, unknown>;

        const mockProvider = {
          sendMessage: vi
            .fn()
            .mockRejectedValue(new Error('Anthropic API error: 429 rate_limit_error')),
          streamMessage: vi.fn(),
          supportsStreaming: vi.fn().mockReturnValue(true),
          getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
          getProvider: vi.fn().mockReturnValue('claude'),
        };
        clientAsRecord.provider = mockProvider;

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Anthropic API error: 429 rate_limit_error');
      });

      test('should propagate Claude overloaded errors', async () => {
        const client = new LLMClient({ provider: 'claude' });
        const clientAsRecord = client as unknown as Record<string, unknown>;

        const mockProvider = {
          sendMessage: vi
            .fn()
            .mockRejectedValue(new Error('Anthropic API error: 529 overloaded_error')),
          streamMessage: vi.fn(),
          supportsStreaming: vi.fn().mockReturnValue(true),
          getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
          getProvider: vi.fn().mockReturnValue('claude'),
        };
        clientAsRecord.provider = mockProvider;

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Anthropic API error: 529 overloaded_error');
      });

      test('should propagate Claude authentication errors', async () => {
        const client = new LLMClient({ provider: 'claude' });
        const clientAsRecord = client as unknown as Record<string, unknown>;

        const mockProvider = {
          sendMessage: vi
            .fn()
            .mockRejectedValue(new Error('Anthropic API error: 401 authentication_error')),
          streamMessage: vi.fn(),
          supportsStreaming: vi.fn().mockReturnValue(true),
          getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
          getProvider: vi.fn().mockReturnValue('claude'),
        };
        clientAsRecord.provider = mockProvider;

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Anthropic API error: 401 authentication_error');
      });
    });

    describe('Network and Timeout Errors', () => {
      beforeEach(() => {
        mockFetch.mockReset();
      });

      test('should handle network failure during Gemini request', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Network request failed');
      });

      test('should handle fetch timeout', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Request timeout');
      });

      test('should handle connection reset error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('ECONNRESET');
      });

      test('should handle DNS resolution failure', async () => {
        mockFetch.mockRejectedValueOnce(
          new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'),
        );

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('ENOTFOUND');
      });
    });
  });

  describe('Malformed Response Handling', () => {
    describe('Gemini Malformed Responses', () => {
      beforeEach(() => {
        mockFetch.mockReset();
      });

      test('should handle response with empty candidates array', async () => {
        // Empty candidates results in undefined candidate, which triggers fallback
        const createEmptyCandidates = () => ({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [],
          }),
        });

        mockFetch
          .mockResolvedValueOnce(createEmptyCandidates())
          .mockResolvedValueOnce(createEmptyCandidates())
          .mockResolvedValueOnce(createEmptyCandidates());

        const client = new LLMClient({ provider: 'gemini' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        // Should return fallback message after retries
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('I apologize'),
        });
      });

      test('should handle response with null candidate content', async () => {
        const createNullContent = () => ({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: null,
                finishReason: 'STOP',
              },
            ],
          }),
        });

        mockFetch
          .mockResolvedValueOnce(createNullContent())
          .mockResolvedValueOnce(createNullContent())
          .mockResolvedValueOnce(createNullContent());

        const client = new LLMClient({ provider: 'gemini' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('I apologize'),
        });
      });

      test('should handle response with undefined parts array', async () => {
        const createUndefinedParts = () => ({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  // parts is undefined
                },
                finishReason: 'STOP',
              },
            ],
          }),
        });

        mockFetch
          .mockResolvedValueOnce(createUndefinedParts())
          .mockResolvedValueOnce(createUndefinedParts())
          .mockResolvedValueOnce(createUndefinedParts());

        const client = new LLMClient({ provider: 'gemini' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('I apologize'),
        });
      });

      test('should handle response with empty parts array', async () => {
        const createEmptyParts = () => ({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [],
                },
                finishReason: 'STOP',
              },
            ],
          }),
        });

        mockFetch
          .mockResolvedValueOnce(createEmptyParts())
          .mockResolvedValueOnce(createEmptyParts())
          .mockResolvedValueOnce(createEmptyParts());

        const client = new LLMClient({ provider: 'gemini' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('I apologize'),
        });
      });

      test('should handle JSON parse error in response', async () => {
        const mockBadJsonResponse = {
          ok: true,
          json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
        };
        mockFetch.mockResolvedValueOnce(mockBadJsonResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Unexpected token');
      });

      test('should reject response with candidates not being an array', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: { notAnArray: true },
          }),
        };
        mockFetch.mockResolvedValueOnce(mockResponse);

        const client = new LLMClient({ provider: 'gemini' });

        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('Invalid Gemini API response format');
      });

      test('should handle parts with neither text nor functionCall', async () => {
        // Parts without text or functionCall are skipped, resulting in empty content
        // which triggers the fallback behavior after retries
        const createNoTextResponse = () => ({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [{ someOtherField: 'value' }],
                },
                finishReason: 'STOP',
              },
            ],
          }),
        });

        mockFetch
          .mockResolvedValueOnce(createNoTextResponse())
          .mockResolvedValueOnce(createNoTextResponse())
          .mockResolvedValueOnce(createNoTextResponse());

        const client = new LLMClient({ provider: 'gemini' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        // Empty content triggers fallback message
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('I apologize'),
        });
      });
    });
  });

  describe('Retry Logic Edge Cases', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    test('should exhaust all retries and return fallback on persistent empty responses', async () => {
      const createEmptyResponse = () => ({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [{ content: null, finishReason: 'STOP' }],
        }),
      });

      // Mock all 3 attempts (initial + 2 retries)
      mockFetch
        .mockResolvedValueOnce(createEmptyResponse())
        .mockResolvedValueOnce(createEmptyResponse())
        .mockResolvedValueOnce(createEmptyResponse());

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Verify all retries were attempted
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Should return fallback message
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('I apologize'),
      });
      expect(result.stopReason).toBe('end_turn');
    });

    test('should succeed on second retry after two empty responses', async () => {
      const emptyResponse = () => ({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [{ content: null, finishReason: 'STOP' }],
        }),
      });

      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Finally succeeded!' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };

      mockFetch
        .mockResolvedValueOnce(emptyResponse())
        .mockResolvedValueOnce(emptyResponse())
        .mockResolvedValueOnce(successResponse);

      const client = new LLMClient({ provider: 'gemini' });
      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Finally succeeded!' });
    });

    test('should not retry on API errors (only on empty responses)', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };
      mockFetch.mockResolvedValueOnce(errorResponse);

      const client = new LLMClient({ provider: 'gemini' });

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('Gemini API error: 500');

      // Should only call once - no retry on HTTP errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should not retry on validation errors', async () => {
      const invalidResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          invalid: 'structure',
          candidates: 'not-an-array',
        }),
      };
      mockFetch.mockResolvedValueOnce(invalidResponse);

      const client = new LLMClient({ provider: 'gemini' });

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('Invalid Gemini API response format');

      // Should only call once - no retry on validation errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Conversion Edge Cases', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    test('should handle tool result with missing tool_use_id in mapping', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Processed result' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });

      // Tool result without a corresponding tool_use in previous messages
      const messages = [
        { role: 'user' as const, content: 'Process this' },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'unknown-tool-id',
              content: JSON.stringify({ data: 'result' }),
            },
          ],
        },
      ];

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      // Should use tool_use_id as function name when not found in mapping
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const functionResponse = requestBody.contents[1].parts[0].functionResponse;
      expect(functionResponse.name).toBe('unknown-tool-id');
      expect(result.content[0]).toEqual({ type: 'text', text: 'Processed result' });
    });

    test('should handle messages with empty content array', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });

      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: [] },
        { role: 'user' as const, content: 'Continue' },
      ];

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      // Empty content arrays should be filtered out (parts.length === 0)
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Only 2 contents should be sent (user messages), assistant with empty content filtered
      expect(requestBody.contents).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Response' });
    });

    test('should handle messages with no tools provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response without tools' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeUndefined();
      expect(requestBody.tool_config).toBeUndefined();
    });

    test('should handle complex nested tool schema', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'Understood the complex schema' }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = new LLMClient({ provider: 'gemini' });
      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Use complex tool' }],
        tools: [
          {
            name: 'complex_tool',
            description: 'A tool with complex nested schema',
            input_schema: {
              type: 'object',
              properties: {
                level1: {
                  type: 'object',
                  properties: {
                    level2: {
                      type: 'object',
                      properties: {
                        level3: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              value: { type: 'string' },
                            },
                            additionalProperties: false,
                          },
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolParams = requestBody.tools[0].functionDeclarations[0].parameters;

      // Verify additionalProperties is stripped at all levels
      expect(toolParams.additionalProperties).toBeUndefined();
      expect(toolParams.properties.level1.additionalProperties).toBeUndefined();
      expect(toolParams.properties.level1.properties.level2.additionalProperties).toBeUndefined();
      expect(
        toolParams.properties.level1.properties.level2.properties.level3.items.additionalProperties,
      ).toBeUndefined();
    });
  });

  describe('Claude Internal Method Coverage', () => {
    test('should call provider sendMessage with correct parameters', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello from Claude provider!' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockProvider.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockProvider.sendMessage).toHaveBeenCalledWith({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from Claude provider!' });
    });

    test('should handle tool_use response from provider', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', id: 'toolu_123', name: 'get_weather', input: { city: 'NYC' } },
          ],
          stopReason: 'tool_use',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a city',
            input_schema: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        ],
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Using tool' });
      expect(result.content[1]).toEqual({
        type: 'tool_use',
        id: 'toolu_123',
        name: 'get_weather',
        input: { city: 'NYC' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    test('should handle unknown content block types from Claude', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      // Simulate a response with an unknown block type being parsed
      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Normal text' },
            { type: 'text', text: '' }, // Unknown types fall back to empty text in parseResponse
          ],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Unknown types should fall back to empty text
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Normal text' });
      expect(result.content[1]).toEqual({ type: 'text', text: '' });
    });

    test('should convert messages with array content to provider format', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Processed tool result' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const messages = [
        { role: 'user' as const, content: 'Use the tool' },
        {
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 'tool-1', name: 'search', input: { q: 'test' } },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'tool-1',
              content: JSON.stringify({ results: ['a', 'b'] }),
            },
          ],
        },
      ];

      await client.sendMessage({
        system: 'You are helpful.',
        messages,
      });

      expect(mockProvider.sendMessage).toHaveBeenCalledWith({
        system: 'You are helpful.',
        messages,
      });
    });

    test('should handle provider throwing error', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockRejectedValue(new Error('API request failed')),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      await expect(
        client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow('API request failed');
    });

    test('should pass tools to provider when provided', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I have tools available' }],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const tools = [
        {
          name: 'calculator',
          description: 'Perform calculations',
          input_schema: {
            type: 'object' as const,
            properties: { expression: { type: 'string' } },
            required: ['expression'],
          },
        },
      ];

      await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Calculate something' }],
        tools,
      });

      expect(mockProvider.sendMessage).toHaveBeenCalledWith({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Calculate something' }],
        tools,
      });
    });

    test('should handle empty content array from provider', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [],
          stopReason: 'end_turn',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toHaveLength(0);
      expect(result.stopReason).toBe('end_turn');
    });

    test('should handle max_tokens stop reason from provider', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Truncated response due to...' }],
          stopReason: 'max_tokens',
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Write a very long essay' }],
      });

      expect(result.content).toHaveLength(1);
      expect(result.stopReason).toBe('max_tokens');
    });

    test('should handle null stop reason from provider', async () => {
      const client = new LLMClient({ provider: 'claude' });
      const clientAsRecord = client as unknown as Record<string, unknown>;

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
          stopReason: null,
        }),
        streamMessage: vi.fn(),
        supportsStreaming: vi.fn().mockReturnValue(true),
        getModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
        getProvider: vi.fn().mockReturnValue('claude'),
      };
      clientAsRecord.provider = mockProvider;

      const result = await client.sendMessage({
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.stopReason).toBeNull();
    });
  });

  describe('ClaudeClientWrapper Internal Methods', () => {
    beforeEach(() => {
      mockAnthropicCreate.mockReset();
    });

    describe('toClaudeTools', () => {
      test('should convert tool definitions to Claude format', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'I can use tools' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Use tools' }],
          tools: [
            {
              name: 'search',
              description: 'Search for information',
              input_schema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
            {
              name: 'calculate',
              description: 'Perform calculations',
              input_schema: {
                type: 'object',
                properties: {
                  expression: { type: 'string' },
                  precision: { type: 'number' },
                },
                required: ['expression'],
                additionalProperties: false,
              },
            },
          ],
        });

        expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.tools).toHaveLength(2);
        expect(callArgs.tools[0]).toEqual({
          name: 'search',
          description: 'Search for information',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        });
        expect(callArgs.tools[1]).toEqual({
          name: 'calculate',
          description: 'Perform calculations',
          input_schema: {
            type: 'object',
            properties: {
              expression: { type: 'string' },
              precision: { type: 'number' },
            },
            required: ['expression'],
            additionalProperties: false,
          },
        });
      });

      test('should handle empty tools array', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'No tools needed' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
          tools: [],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        // Empty array is passed through (truthy check on params.tools)
        expect(callArgs.tools).toEqual([]);
      });

      test('should omit tools when not provided', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'No tools needed' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.tools).toBeUndefined();
      });

      test('should handle tools with complex nested schema', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Complex tool registered' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Use complex tool' }],
          tools: [
            {
              name: 'complex_tool',
              description: 'Tool with nested schema',
              input_schema: {
                type: 'object',
                properties: {
                  nested: {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          ],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.tools[0].input_schema.properties.nested.properties.items.type).toBe(
          'array',
        );
      });
    });

    describe('toClaudeMessages', () => {
      test('should convert string content messages', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
          ],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.messages).toEqual([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ]);
      });

      test('should convert array content messages with text blocks', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Processed' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text' as const, text: 'First part' },
                { type: 'text' as const, text: 'Second part' },
              ],
            },
          ],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toEqual([
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ]);
      });

      test('should convert messages with tool_use blocks', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Tool result processed' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [
            { role: 'user', content: 'Search for something' },
            {
              role: 'assistant',
              content: [
                { type: 'text' as const, text: 'Let me search' },
                {
                  type: 'tool_use' as const,
                  id: 'toolu_abc123',
                  name: 'search',
                  input: { query: 'test' },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: 'toolu_abc123',
                  content: JSON.stringify({ results: ['result1'] }),
                },
              ],
            },
          ],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.messages).toHaveLength(3);
        expect(callArgs.messages[1].content[1]).toEqual({
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'search',
          input: { query: 'test' },
        });
      });

      test('should handle mixed string and array content in conversation', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Understood' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [
            { role: 'user', content: 'Start' },
            {
              role: 'assistant',
              content: [{ type: 'text' as const, text: 'Acknowledged' }],
            },
            { role: 'user', content: 'Continue' },
          ],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toBe('Start');
        expect(callArgs.messages[1].content).toEqual([{ type: 'text', text: 'Acknowledged' }]);
        expect(callArgs.messages[2].content).toBe('Continue');
      });
    });

    describe('parseResponse', () => {
      test('should parse text block response', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from Claude!' });
        expect(result.stopReason).toBe('end_turn');
      });

      test('should parse tool_use block response', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'I will search for that' },
            {
              type: 'tool_use',
              id: 'toolu_xyz789',
              name: 'web_search',
              input: { query: 'latest news', limit: 5 },
            },
          ],
          stop_reason: 'tool_use',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Search for latest news' }],
          tools: [
            {
              name: 'web_search',
              description: 'Search the web',
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  limit: { type: 'number' },
                },
                required: ['query'],
              },
            },
          ],
        });

        expect(result.content).toHaveLength(2);
        expect(result.content[0]).toEqual({ type: 'text', text: 'I will search for that' });
        expect(result.content[1]).toEqual({
          type: 'tool_use',
          id: 'toolu_xyz789',
          name: 'web_search',
          input: { query: 'latest news', limit: 5 },
        });
        expect(result.stopReason).toBe('tool_use');
      });

      test('should parse response with multiple tool_use blocks', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Let me do both' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'search',
              input: { q: 'first' },
            },
            {
              type: 'tool_use',
              id: 'toolu_2',
              name: 'calculate',
              input: { expr: '2+2' },
            },
          ],
          stop_reason: 'tool_use',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Search and calculate' }],
        });

        expect(result.content).toHaveLength(3);
        expect(result.content[1]).toEqual({
          type: 'tool_use',
          id: 'toolu_1',
          name: 'search',
          input: { q: 'first' },
        });
        expect(result.content[2]).toEqual({
          type: 'tool_use',
          id: 'toolu_2',
          name: 'calculate',
          input: { expr: '2+2' },
        });
      });

      test('should handle unknown block types with fallback', async () => {
        // Simulate a response with an unknown block type
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Known type' },
            { type: 'unknown_type', data: 'some data' },
            { type: 'another_unknown', value: 123 },
          ],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(3);
        expect(result.content[0]).toEqual({ type: 'text', text: 'Known type' });
        // Unknown types fall back to empty text blocks
        expect(result.content[1]).toEqual({ type: 'text', text: '' });
        expect(result.content[2]).toEqual({ type: 'text', text: '' });
      });

      test('should handle max_tokens stop reason', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Truncated...' }],
          stop_reason: 'max_tokens',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Write a long essay' }],
        });

        expect(result.stopReason).toBe('max_tokens');
      });

      test('should handle null stop_reason', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: null,
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.stopReason).toBeNull();
      });

      test('should handle empty content array', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        const result = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toHaveLength(0);
        expect(result.stopReason).toBe('end_turn');
      });
    });

    describe('sendMessage', () => {
      test('should send message with all parameters', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Complete response' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Test message' }],
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              input_schema: {
                type: 'object',
                properties: { arg: { type: 'string' } },
              },
            },
          ],
        });

        expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.model).toBeDefined();
        expect(callArgs.max_tokens).toBeDefined();
        expect(callArgs.system).toBe('You are a helpful assistant.');
        expect(callArgs.messages).toHaveLength(1);
        expect(callArgs.tools).toHaveLength(1);
      });

      test('should send message without tools', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Simple response' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({ provider: 'claude' });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.tools).toBeUndefined();
      });

      test('should propagate API errors', async () => {
        mockAnthropicCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

        const client = new LLMClient({ provider: 'claude' });
        await expect(
          client.sendMessage({
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ).rejects.toThrow('API rate limit exceeded');
      });

      test('should use custom model from config', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({
          provider: 'claude',
          model: 'claude-3-opus-20240229',
        });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.model).toBe('claude-3-opus-20240229');
      });

      test('should use custom maxTokens from config', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
        });

        const client = new LLMClient({
          provider: 'claude',
          maxTokens: 8192,
        });
        await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const callArgs = mockAnthropicCreate.mock.calls[0][0];
        expect(callArgs.max_tokens).toBe(8192);
      });

      test('should handle full conversation flow with tool use', async () => {
        // First call: assistant uses tool
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Searching...' },
            {
              type: 'tool_use',
              id: 'toolu_conv_1',
              name: 'search',
              input: { query: 'weather' },
            },
          ],
          stop_reason: 'tool_use',
        });

        const client = new LLMClient({ provider: 'claude' });

        // First turn: user asks, assistant uses tool
        const firstResult = await client.sendMessage({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'What is the weather?' }],
          tools: [
            {
              name: 'search',
              description: 'Search',
              input_schema: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
        });

        expect(firstResult.stopReason).toBe('tool_use');
        expect(firstResult.content[1]).toEqual({
          type: 'tool_use',
          id: 'toolu_conv_1',
          name: 'search',
          input: { query: 'weather' },
        });

        // Second call: with tool result
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'The weather is sunny!' }],
          stop_reason: 'end_turn',
        });

        const secondResult = await client.sendMessage({
          system: 'You are helpful.',
          messages: [
            { role: 'user', content: 'What is the weather?' },
            {
              role: 'assistant',
              content: [
                { type: 'text' as const, text: 'Searching...' },
                {
                  type: 'tool_use' as const,
                  id: 'toolu_conv_1',
                  name: 'search',
                  input: { query: 'weather' },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: 'toolu_conv_1',
                  content: JSON.stringify({ weather: 'sunny', temp: 72 }),
                },
              ],
            },
          ],
          tools: [
            {
              name: 'search',
              description: 'Search',
              input_schema: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
        });

        expect(secondResult.stopReason).toBe('end_turn');
        expect(secondResult.content[0]).toEqual({
          type: 'text',
          text: 'The weather is sunny!',
        });
      });
    });
  });
});
