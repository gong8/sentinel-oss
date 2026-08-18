/**
 * Orchestrator Services Tests
 * Tests for focused service interfaces and factory functions
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const {
  mockDetectMultiStepRequest,
  mockGenerateAndCreatePlan,
  mockGetAndSelectTools,
  mockCreateLLMClient,
  mockPrepareSystemPrompt,
  mockLogLlmUsage,
  mockRecordToolUsage,
  mockExtractKeywords,
} = vi.hoisted(() => ({
  mockDetectMultiStepRequest: vi.fn(),
  mockGenerateAndCreatePlan: vi.fn(),
  mockGetAndSelectTools: vi.fn(),
  mockCreateLLMClient: vi.fn(),
  mockPrepareSystemPrompt: vi.fn(),
  mockLogLlmUsage: vi.fn(),
  mockRecordToolUsage: vi.fn(),
  mockExtractKeywords: vi.fn(),
}));

// Mock dependencies
vi.mock('../../../../packages/api/src/services/agentPlan.js', () => ({
  detectMultiStepRequest: mockDetectMultiStepRequest,
}));

vi.mock('../../../../packages/api/src/agent/utils/orchestrator-helpers.js', () => ({
  generateAndCreatePlanFromMessage: mockGenerateAndCreatePlan,
  getAndSelectTools: mockGetAndSelectTools,
}));

vi.mock('../../../../packages/api/src/agent/utils/prompt-builder.js', () => ({
  prepareSystemPromptWithMemory: mockPrepareSystemPrompt,
}));

vi.mock('../../../../packages/api/src/agent/utils/analytics.js', () => ({
  logLlmUsageForResponse: mockLogLlmUsage,
  recordToolUsageAsync: mockRecordToolUsage,
}));

vi.mock('../../../../packages/api/src/agent/utils/keywords.js', () => ({
  extractKeywords: mockExtractKeywords,
}));

vi.mock('../../../../packages/api/src/agent/unified-llm-client.js', () => ({
  createLLMClientForContext: mockCreateLLMClient,
}));

import {
  createDefaultAnalyticsService,
  createDefaultLLMService,
  createDefaultOrchestratorServices,
  createDefaultPlanningService,
  createDefaultToolService,
  createOrchestratorServices,
  createOrchestratorServicesFromPartial,
  type IAnalyticsService,
  type ILLMService,
  type IPlanningService,
  type IToolService,
  type OrchestratorServices,
} from '../../../../packages/api/src/agent/orchestrator-services.js';
import type { AdminAgentContext } from '../../../../packages/api/src/agent/unified-types.js';

// ============================================================================
// FOCUSED SERVICE INTERFACE TESTS
// ============================================================================

describe('IPlanningService', () => {
  test('createDefaultPlanningService returns planning methods', () => {
    const planning = createDefaultPlanningService();

    expect(planning).toHaveProperty('detectMultiStepRequest');
    expect(planning).toHaveProperty('generateAndCreatePlan');
    expect(typeof planning.detectMultiStepRequest).toBe('function');
    expect(typeof planning.generateAndCreatePlan).toBe('function');
  });

  test('detectMultiStepRequest delegates to agentPlan service', () => {
    mockDetectMultiStepRequest.mockReturnValue(true);

    const planning = createDefaultPlanningService();
    const result = planning.detectMultiStepRequest('Create a policy and assign it');

    expect(mockDetectMultiStepRequest).toHaveBeenCalledWith('Create a policy and assign it');
    expect(result).toBe(true);
  });
});

describe('IToolService', () => {
  test('createDefaultToolService returns tool methods', () => {
    const tool = createDefaultToolService();

    expect(tool).toHaveProperty('getAndSelectTools');
    expect(typeof tool.getAndSelectTools).toBe('function');
  });
});

describe('ILLMService', () => {
  test('createDefaultLLMService returns LLM methods', () => {
    const llm = createDefaultLLMService();

    expect(llm).toHaveProperty('createLLMClient');
    expect(llm).toHaveProperty('prepareSystemPrompt');
    expect(typeof llm.createLLMClient).toBe('function');
    expect(typeof llm.prepareSystemPrompt).toBe('function');
  });
});

describe('IAnalyticsService', () => {
  test('createDefaultAnalyticsService returns analytics methods', () => {
    const analytics = createDefaultAnalyticsService();

    expect(analytics).toHaveProperty('logLlmUsage');
    expect(analytics).toHaveProperty('recordToolUsage');
    expect(analytics).toHaveProperty('extractKeywords');
    expect(typeof analytics.logLlmUsage).toBe('function');
    expect(typeof analytics.recordToolUsage).toBe('function');
    expect(typeof analytics.extractKeywords).toBe('function');
  });
});

// ============================================================================
// COMBINED SERVICE TESTS
// ============================================================================

describe('createDefaultOrchestratorServices', () => {
  test('returns object with all required service methods', () => {
    const services = createDefaultOrchestratorServices();

    expect(services).toHaveProperty('detectMultiStepRequest');
    expect(services).toHaveProperty('generateAndCreatePlan');
    expect(services).toHaveProperty('getAndSelectTools');
    expect(services).toHaveProperty('createLLMClient');
    expect(services).toHaveProperty('prepareSystemPrompt');
    expect(services).toHaveProperty('logLlmUsage');
    expect(services).toHaveProperty('recordToolUsage');
    expect(services).toHaveProperty('extractKeywords');
  });

  test('all service methods are functions', () => {
    const services = createDefaultOrchestratorServices();

    expect(typeof services.detectMultiStepRequest).toBe('function');
    expect(typeof services.generateAndCreatePlan).toBe('function');
    expect(typeof services.getAndSelectTools).toBe('function');
    expect(typeof services.createLLMClient).toBe('function');
    expect(typeof services.prepareSystemPrompt).toBe('function');
    expect(typeof services.logLlmUsage).toBe('function');
    expect(typeof services.recordToolUsage).toBe('function');
    expect(typeof services.extractKeywords).toBe('function');
  });

  test('detectMultiStepRequest delegates to agentPlan service', () => {
    mockDetectMultiStepRequest.mockReturnValue(true);

    const services = createDefaultOrchestratorServices();
    const result = services.detectMultiStepRequest('Create a policy and assign it');

    expect(mockDetectMultiStepRequest).toHaveBeenCalledWith('Create a policy and assign it');
    expect(result).toBe(true);
  });
});

describe('createOrchestratorServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns default services when no overrides provided', () => {
    const services = createOrchestratorServices();

    expect(services).toHaveProperty('detectMultiStepRequest');
    expect(services).toHaveProperty('generateAndCreatePlan');
    expect(services).toHaveProperty('createLLMClient');
  });

  test('merges partial overrides with defaults', () => {
    const customDetect = vi.fn().mockReturnValue(false);
    const services = createOrchestratorServices({
      detectMultiStepRequest: customDetect,
    });

    // Custom override should be used
    services.detectMultiStepRequest('test message');
    expect(customDetect).toHaveBeenCalledWith('test message');

    // Other services should still be the defaults
    expect(services.createLLMClient).toBeDefined();
    expect(services.prepareSystemPrompt).toBeDefined();
  });

  test('allows overriding all services', () => {
    const mockServices: OrchestratorServices = {
      detectMultiStepRequest: vi.fn(),
      generateAndCreatePlan: vi.fn(),
      getAndSelectTools: vi.fn(),
      createLLMClient: vi.fn(),
      prepareSystemPrompt: vi.fn(),
      logLlmUsage: vi.fn(),
      recordToolUsage: vi.fn(),
      extractKeywords: vi.fn(),
    };

    const services = createOrchestratorServices(mockServices);

    expect(services.detectMultiStepRequest).toBe(mockServices.detectMultiStepRequest);
    expect(services.generateAndCreatePlan).toBe(mockServices.generateAndCreatePlan);
    expect(services.getAndSelectTools).toBe(mockServices.getAndSelectTools);
    expect(services.createLLMClient).toBe(mockServices.createLLMClient);
    expect(services.prepareSystemPrompt).toBe(mockServices.prepareSystemPrompt);
    expect(services.logLlmUsage).toBe(mockServices.logLlmUsage);
    expect(services.recordToolUsage).toBe(mockServices.recordToolUsage);
    expect(services.extractKeywords).toBe(mockServices.extractKeywords);
  });

  test('override takes precedence over default', () => {
    mockDetectMultiStepRequest.mockReturnValue(true);
    const customDetect = vi.fn().mockReturnValue(false);

    const services = createOrchestratorServices({
      detectMultiStepRequest: customDetect,
    });

    const result = services.detectMultiStepRequest('complex task');

    // Should use the override, not the default
    expect(customDetect).toHaveBeenCalled();
    expect(mockDetectMultiStepRequest).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

// ============================================================================
// GROUPED OVERRIDE TESTS
// ============================================================================

describe('createOrchestratorServicesFromPartial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns default services when no overrides provided', () => {
    const services = createOrchestratorServicesFromPartial();

    expect(services).toHaveProperty('detectMultiStepRequest');
    expect(services).toHaveProperty('generateAndCreatePlan');
    expect(services).toHaveProperty('getAndSelectTools');
    expect(services).toHaveProperty('createLLMClient');
    expect(services).toHaveProperty('prepareSystemPrompt');
    expect(services).toHaveProperty('logLlmUsage');
    expect(services).toHaveProperty('recordToolUsage');
    expect(services).toHaveProperty('extractKeywords');
  });

  test('allows overriding planning service group', () => {
    const customDetect = vi.fn().mockReturnValue(false);
    const services = createOrchestratorServicesFromPartial({
      planning: { detectMultiStepRequest: customDetect },
    });

    services.detectMultiStepRequest('test');
    expect(customDetect).toHaveBeenCalledWith('test');

    // Other groups should use defaults
    expect(services.getAndSelectTools).toBeDefined();
    expect(services.createLLMClient).toBeDefined();
  });

  test('allows overriding tool service group', () => {
    const customGetTools = vi.fn().mockResolvedValue({ allTools: [], selectedTools: [] });
    const services = createOrchestratorServicesFromPartial({
      tool: { getAndSelectTools: customGetTools },
    });

    expect(services.getAndSelectTools).toBe(customGetTools);
  });

  test('allows overriding llm service group', () => {
    const customCreateClient = vi.fn().mockResolvedValue({});
    const customPreparePrompt = vi.fn().mockResolvedValue('custom prompt');
    const services = createOrchestratorServicesFromPartial({
      llm: {
        createLLMClient: customCreateClient,
        prepareSystemPrompt: customPreparePrompt,
      },
    });

    expect(services.createLLMClient).toBe(customCreateClient);
    expect(services.prepareSystemPrompt).toBe(customPreparePrompt);
  });

  test('allows overriding analytics service group', () => {
    const customExtract = vi.fn().mockReturnValue(['custom', 'keywords']);
    const services = createOrchestratorServicesFromPartial({
      analytics: { extractKeywords: customExtract },
    });

    const result = services.extractKeywords('test message');
    expect(customExtract).toHaveBeenCalledWith('test message');
    expect(result).toEqual(['custom', 'keywords']);
  });

  test('allows overriding multiple groups simultaneously', () => {
    const customDetect = vi.fn().mockReturnValue(false);
    const customExtract = vi.fn().mockReturnValue([]);
    const services = createOrchestratorServicesFromPartial({
      planning: { detectMultiStepRequest: customDetect },
      analytics: { extractKeywords: customExtract },
    });

    services.detectMultiStepRequest('test');
    services.extractKeywords('test');

    expect(customDetect).toHaveBeenCalled();
    expect(customExtract).toHaveBeenCalled();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('OrchestratorServices integration', () => {
  const adminContext: AdminAgentContext = {
    mode: 'admin',
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    sessionId: 'session-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareSystemPrompt.mockResolvedValue('System prompt');
    mockGetAndSelectTools.mockResolvedValue({
      allTools: [],
      selectedTools: [],
    });
    mockCreateLLMClient.mockResolvedValue({
      sendMessage: vi.fn(),
      streamMessage: vi.fn(),
      getProvider: () => 'anthropic',
      getModel: () => 'claude-3-sonnet',
    });
    mockExtractKeywords.mockReturnValue(['test', 'keywords']);
  });

  test('services work together for tool selection flow', async () => {
    const services = createDefaultOrchestratorServices();
    const mockToolRouter = {
      getAvailableTools: vi.fn().mockResolvedValue([]),
    };

    await services.getAndSelectTools(mockToolRouter as never, adminContext, 'list policies');

    expect(mockGetAndSelectTools).toHaveBeenCalledWith(
      mockToolRouter,
      adminContext,
      'list policies',
    );
  });

  test('services work together for system prompt preparation', async () => {
    const services = createDefaultOrchestratorServices();

    await services.prepareSystemPrompt(adminContext, 'help me');

    expect(mockPrepareSystemPrompt).toHaveBeenCalledWith(adminContext, 'help me');
  });

  test('services work together for LLM client creation', async () => {
    const services = createDefaultOrchestratorServices();

    const client = await services.createLLMClient(adminContext);

    expect(mockCreateLLMClient).toHaveBeenCalledWith(adminContext);
    expect(client.getProvider()).toBe('anthropic');
  });

  test('extractKeywords returns keyword array', () => {
    const services = createDefaultOrchestratorServices();

    const keywords = services.extractKeywords('list all active policies');

    expect(mockExtractKeywords).toHaveBeenCalledWith('list all active policies');
    expect(keywords).toEqual(['test', 'keywords']);
  });
});

// ============================================================================
// MOCKING EXAMPLES
// ============================================================================

describe('OrchestratorServices mocking for tests', () => {
  test('demonstrates how to create mock services for orchestrator testing', () => {
    // This shows the pattern for testing orchestrators with mocked services
    const mockServices: OrchestratorServices = {
      detectMultiStepRequest: vi.fn().mockReturnValue(false),
      generateAndCreatePlan: vi.fn().mockResolvedValue(null),
      getAndSelectTools: vi.fn().mockResolvedValue({
        allTools: [
          { name: 'test_tool', description: 'A test tool', input_schema: { type: 'object' } },
        ],
        selectedTools: [
          { name: 'test_tool', description: 'A test tool', input_schema: { type: 'object' } },
        ],
      }),
      createLLMClient: vi.fn().mockResolvedValue({
        sendMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
        streamMessage: vi.fn(),
        getProvider: () => 'anthropic',
        getModel: () => 'claude-3-sonnet',
      }),
      prepareSystemPrompt: vi.fn().mockResolvedValue('You are a helpful assistant.'),
      logLlmUsage: vi.fn(),
      recordToolUsage: vi.fn(),
      extractKeywords: vi.fn().mockReturnValue(['test']),
    };

    // Verify the mock services can be used with createOrchestratorServices
    const services = createOrchestratorServices(mockServices);

    // Each call should use the mock
    services.detectMultiStepRequest('test');
    expect(mockServices.detectMultiStepRequest).toHaveBeenCalledWith('test');

    services.extractKeywords('hello world');
    expect(mockServices.extractKeywords).toHaveBeenCalledWith('hello world');
  });

  test('demonstrates creating focused service mocks', () => {
    const mockPlanning: IPlanningService = {
      detectMultiStepRequest: vi.fn().mockReturnValue(true),
      generateAndCreatePlan: vi.fn().mockResolvedValue({
        planId: 'plan-1',
        planName: 'Test Plan',
        planDescription: 'A test plan',
        stepCount: 3,
      }),
    };

    const mockTool: IToolService = {
      getAndSelectTools: vi.fn().mockResolvedValue({
        allTools: [],
        selectedTools: [],
      }),
    };

    const mockLLM: ILLMService = {
      createLLMClient: vi.fn(),
      prepareSystemPrompt: vi.fn().mockResolvedValue('System prompt'),
    };

    const mockAnalytics: IAnalyticsService = {
      logLlmUsage: vi.fn(),
      recordToolUsage: vi.fn(),
      extractKeywords: vi.fn().mockReturnValue([]),
    };

    const services = createOrchestratorServicesFromPartial({
      planning: mockPlanning,
      tool: mockTool,
      llm: mockLLM,
      analytics: mockAnalytics,
    });

    expect(services.detectMultiStepRequest('test')).toBe(true);
    expect(mockPlanning.detectMultiStepRequest).toHaveBeenCalled();
  });
});
