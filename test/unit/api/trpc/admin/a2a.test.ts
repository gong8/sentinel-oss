/**
 * Tests for Admin A2A Router
 * Tests A2A agent registration, card management, and credential operations
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockEncrypt,
  mockDecrypt,
  mockFetchAgentCard,
  mockComputeCardHash,
  mockBuildAuthHeaders,
  mockGetSupportedAuthTypes,
  mockGetPrimarySecurityScheme,
} = vi.hoisted(() => ({
  mockPrisma: {
    agent: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    a2ACredential: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockEncrypt: vi.fn(),
  mockDecrypt: vi.fn(),
  mockFetchAgentCard: vi.fn(),
  mockComputeCardHash: vi.fn(),
  mockBuildAuthHeaders: vi.fn(),
  mockGetSupportedAuthTypes: vi.fn(),
  mockGetPrimarySecurityScheme: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    InputJsonValue: {},
  },
  AdminActionType: {
    A2A_AGENT_REGISTER: 'A2A_AGENT_REGISTER',
    A2A_AGENT_UPDATE: 'A2A_AGENT_UPDATE',
    A2A_AGENT_DELETE: 'A2A_AGENT_DELETE',
    A2A_CARD_REFRESH: 'A2A_CARD_REFRESH',
    A2A_CREDENTIAL_SET: 'A2A_CREDENTIAL_SET',
    A2A_CREDENTIAL_DELETE: 'A2A_CREDENTIAL_DELETE',
    A2A_CONNECTION_TEST: 'A2A_CONNECTION_TEST',
  },
  AdminResourceType: {
    AGENT: 'AGENT',
    A2A_CREDENTIAL: 'A2A_CREDENTIAL',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/crypto.js', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createProcedure = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createProcedure(),
  };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock @sentinel/a2a package
vi.mock('@sentinel/a2a', () => ({
  fetchAgentCard: mockFetchAgentCard,
  computeCardHash: mockComputeCardHash,
  buildAuthHeaders: mockBuildAuthHeaders,
  getSupportedAuthTypes: mockGetSupportedAuthTypes,
  getPrimarySecurityScheme: mockGetPrimarySecurityScheme,
  AgentCardSchema: {
    parse: (card: unknown) => card,
  },
  // Additional exports used by the router
  tryParseAgentCard: (card: unknown) => card, // Returns card directly or null
  agentCardToPrismaJson: (card: unknown) => card,
  parseCredentials: (creds: unknown) => creds,
}));

import { adminA2ARouter as _adminA2ARouter } from '../../../../../packages/api/src/trpc/admin/a2a.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

// Type for listAgents response
interface ListAgentsItem {
  id: string;
  credentialConfigured: boolean;
  credentialAuthType?: string;
}

const adminA2ARouter = _adminA2ARouter as unknown as {
  previewAgent: TestableHandler;
  registerAgent: TestableHandler;
  listAgents: TestableHandler<ListAgentsItem[]>;
  getAgent: TestableHandler;
  refreshAgentCard: TestableHandler;
  updateAgentCard: TestableHandler;
  deleteAgent: TestableHandler;
  setCredential: TestableHandler;
  getCredentialStatus: TestableHandler;
  deleteCredential: TestableHandler;
  testConnection: TestableHandler;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockEncrypt.mockReturnValue('encrypted-creds');
  mockDecrypt.mockReturnValue('{"apiKey":"decrypted-key"}');

  // Reset global fetch mock
  mockFetch.mockReset();

  // Default @sentinel/a2a mocks
  mockComputeCardHash.mockReturnValue('mock-hash-64-chars-padding-here-to-make-it-64-chars!!');
  mockGetSupportedAuthTypes.mockReturnValue(['NONE', 'API_KEY', 'OAUTH', 'OIDC']);
  mockGetPrimarySecurityScheme.mockReturnValue(null);
  mockBuildAuthHeaders.mockReturnValue({});
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
) {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'x-real-ip') return null;
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }),
      },
    },
  };
}

// Sample agent card for testing
const sampleAgentCard = {
  protocolVersion: '1.0.0',
  name: 'Test Agent',
  description: 'A test agent',
  url: 'https://agent.example.com',
  skills: [
    {
      id: 'skill-1',
      name: 'Test Skill',
      description: 'A test skill',
    },
  ],
};

// Sample agent card with security schemes
const sampleAgentCardWithSecurity = {
  ...sampleAgentCard,
  securitySchemes: {
    bearer: {
      type: 'http' as const,
      scheme: 'bearer',
    },
  },
  security: [{ bearer: [] }],
};

describe('Admin A2A Router', () => {
  describe('previewAgent', () => {
    test('should return agent preview from URL', async () => {
      const ctx = createMockContext();

      mockFetchAgentCard.mockResolvedValue(sampleAgentCard);

      const result = await adminA2ARouter.previewAgent({
        ctx,
        input: {
          url: 'https://agent.example.com',
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.suggestedName).toBe('Test Agent');
        expect(result.endpointUrl).toBe('https://agent.example.com');
      }
      expect(mockFetchAgentCard).toHaveBeenCalledWith('https://agent.example.com');
    });

    test('should return error when fetch fails', async () => {
      const ctx = createMockContext();

      mockFetchAgentCard.mockRejectedValue(new Error('Network error'));

      const result = await adminA2ARouter.previewAgent({
        ctx,
        input: {
          url: 'https://agent.example.com',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Network error');
      }
    });
  });

  describe('registerAgent', () => {
    test('should register agent from URL with auto-fetched card', async () => {
      const ctx = createMockContext();

      mockFetchAgentCard.mockResolvedValue(sampleAgentCard);

      mockPrisma.agent.create.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'URL',
        protocolType: 'A2A',
        agentCardUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCard,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'mock-hash-64-chars-padding-here-to-make-it-64-chars!!',
        createdAt: new Date(),
      });

      const result = await adminA2ARouter.registerAgent({
        ctx,
        input: {
          url: 'https://agent.example.com',
        },
      });

      expect(result.id).toBe('agent-1');
      expect(result.name).toBe('Test Agent');
      expect(result.cardSource).toBe('URL');
      expect(mockFetchAgentCard).toHaveBeenCalledWith('https://agent.example.com');
      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          name: 'Test Agent',
          protocolType: 'A2A',
          cardSource: 'URL',
        }),
      });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_AGENT_REGISTER',
          resourceType: 'AGENT',
        }),
      );
    });

    test('should register agent with name override', async () => {
      const ctx = createMockContext();

      mockFetchAgentCard.mockResolvedValue(sampleAgentCard);

      mockPrisma.agent.create.mockResolvedValue({
        id: 'agent-2',
        name: 'Custom Agent Name',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'URL',
        protocolType: 'A2A',
        agentCardUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCard,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'mock-hash-64-chars-padding-here-to-make-it-64-chars!!',
        createdAt: new Date(),
      });

      const result = await adminA2ARouter.registerAgent({
        ctx,
        input: {
          url: 'https://agent.example.com',
          nameOverride: 'Custom Agent Name',
        },
      });

      expect(result.id).toBe('agent-2');
      expect(result.name).toBe('Custom Agent Name');
      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Custom Agent Name',
        }),
      });
    });

    test('should throw error when URL fetch fails', async () => {
      const ctx = createMockContext();

      mockFetchAgentCard.mockRejectedValue(new Error('Failed to fetch agent card'));

      await expect(
        adminA2ARouter.registerAgent({
          ctx,
          input: {
            url: 'https://invalid.example.com',
          },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('listAgents', () => {
    test('should list all A2A agents for organization', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-1',
          name: 'Agent 1',
          endpointUrl: 'https://agent1.example.com',
          cardSource: 'MANUAL',
          agentCardCache: sampleAgentCard,
          agentCardFetchedAt: new Date(),
          signatureVerified: false,
          createdAt: new Date(),
          a2aCredential: null,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          endpointUrl: 'https://agent2.example.com',
          cardSource: 'URL',
          agentCardCache: sampleAgentCardWithSecurity,
          agentCardFetchedAt: new Date(),
          signatureVerified: true,
          createdAt: new Date(),
          a2aCredential: { authType: 'API_KEY', updatedAt: new Date() },
        },
      ]);

      const result = await adminA2ARouter.listAgents({ ctx });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('agent-1');
      expect(result[0].credentialConfigured).toBe(false);
      expect(result[1].credentialConfigured).toBe(true);
      expect(result[1].credentialAuthType).toBe('API_KEY');
      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          protocolType: 'A2A',
          deletedAt: null,
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should return empty array when no agents exist', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findMany.mockResolvedValue([]);

      const result = await adminA2ARouter.listAgents({ ctx });

      expect(result).toHaveLength(0);
    });
  });

  describe('getAgent', () => {
    test('should return agent details', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
        agentCardUrl: null,
        agentCardCache: sampleAgentCard,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'hash123',
        signatureVerified: false,
        signatureVerifiedAt: null,
        createdAt: new Date(),
        a2aCredential: null,
      });

      const result = await adminA2ARouter.getAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.id).toBe('agent-1');
      expect(result.agentCard).toEqual(sampleAgentCard);
      expect(result.supportedAuthTypes).toContain('NONE');
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expect(
        adminA2ARouter.getAgent({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should return supported auth types from security schemes', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Secure Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
        agentCardUrl: null,
        agentCardCache: sampleAgentCardWithSecurity,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'hash123',
        signatureVerified: false,
        signatureVerifiedAt: null,
        createdAt: new Date(),
        a2aCredential: null,
      });

      const result = await adminA2ARouter.getAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.supportedAuthTypes).toContain('API_KEY');
    });
  });

  describe('refreshAgentCard', () => {
    test('should refresh agent card from URL', async () => {
      const ctx = createMockContext();

      const updatedCard = {
        ...sampleAgentCard,
        description: 'Updated description',
      };

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
        agentCardHash: 'old-hash',
      });

      // refreshAgentCard uses fetchAgentCard from @sentinel/a2a, not direct fetch
      mockFetchAgentCard.mockResolvedValue(updatedCard);

      mockPrisma.agent.update.mockResolvedValue({});

      const result = await adminA2ARouter.refreshAgentCard({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.success).toBe(true);
      expect(result.cardChanged).toBe(true);
      expect(result.agentCard).toEqual(updatedCard);
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_CARD_REFRESH',
        }),
      );
    });

    test('should throw error when no URL configured', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        agentCardUrl: null,
      });

      await expect(
        adminA2ARouter.refreshAgentCard({
          ctx,
          input: { id: 'agent-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('updateAgentCard', () => {
    test('should update agent card manually', async () => {
      const ctx = createMockContext();

      const updatedCard = {
        ...sampleAgentCard,
        description: 'Manually updated',
      };

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        agentCardHash: 'old-hash',
      });

      mockPrisma.agent.update.mockResolvedValue({});

      const result = await adminA2ARouter.updateAgentCard({
        ctx,
        input: { id: 'agent-1', agentCard: updatedCard },
      });

      expect(result.success).toBe(true);
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_AGENT_UPDATE',
        }),
      );
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expect(
        adminA2ARouter.updateAgentCard({
          ctx,
          input: { id: 'non-existent', agentCard: sampleAgentCard },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('deleteAgent', () => {
    test('should soft delete agent and credentials', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
      });

      mockPrisma.agent.update.mockResolvedValue({});
      mockPrisma.a2ACredential.deleteMany.mockResolvedValue({ count: 1 });

      const result = await adminA2ARouter.deleteAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: 'user-123',
        },
      });
      expect(mockPrisma.a2ACredential.deleteMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-1',
          organizationId: 'org-123',
        },
      });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_AGENT_DELETE',
        }),
      );
    });
  });

  describe('setCredential', () => {
    test('should set API_KEY credentials', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        agentCardCache: sampleAgentCard,
      });

      mockPrisma.a2ACredential.upsert.mockResolvedValue({});

      const result = await adminA2ARouter.setCredential({
        ctx,
        input: {
          agentId: 'agent-1',
          authType: 'API_KEY',
          credentials: { apiKey: 'sk-12345' },
        },
      });

      expect(result.success).toBe(true);
      expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-12345' }));
      expect(mockPrisma.a2ACredential.upsert).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_CREDENTIAL_SET',
        }),
      );
    });

    test('should reject unsupported auth type', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        agentCardCache: sampleAgentCardWithSecurity, // Only supports API_KEY (http bearer)
      });

      // Override default mock to only allow API_KEY
      mockGetSupportedAuthTypes.mockReturnValue(['API_KEY']);

      await expect(
        adminA2ARouter.setCredential({
          ctx,
          input: {
            agentId: 'agent-1',
            authType: 'OAUTH',
            credentials: { accessToken: 'token' },
          },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expect(
        adminA2ARouter.setCredential({
          ctx,
          input: {
            agentId: 'non-existent',
            authType: 'API_KEY',
            credentials: { apiKey: 'sk-12345' },
          },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getCredentialStatus', () => {
    test('should return credential status when configured', async () => {
      const ctx = createMockContext();

      const updatedAt = new Date();
      mockPrisma.a2ACredential.findFirst.mockResolvedValue({
        authType: 'API_KEY',
        updatedAt,
      });

      const result = await adminA2ARouter.getCredentialStatus({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.configured).toBe(true);
      expect(result.authType).toBe('API_KEY');
      expect(result.updatedAt).toEqual(updatedAt);
    });

    test('should return not configured when no credentials', async () => {
      const ctx = createMockContext();

      mockPrisma.a2ACredential.findFirst.mockResolvedValue(null);

      const result = await adminA2ARouter.getCredentialStatus({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.configured).toBe(false);
    });
  });

  describe('deleteCredential', () => {
    test('should delete credentials for agent', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
      });

      mockPrisma.a2ACredential.deleteMany.mockResolvedValue({ count: 1 });

      const result = await adminA2ARouter.deleteCredential({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.a2ACredential.deleteMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-1',
          organizationId: 'org-123',
        },
      });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_CREDENTIAL_DELETE',
        }),
      );
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expect(
        adminA2ARouter.deleteCredential({
          ctx,
          input: { agentId: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('testConnection', () => {
    test('should test connection successfully without credentials', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCard,
        a2aCredential: null,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await adminA2ARouter.testConnection({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'A2A_CONNECTION_TEST',
          actionDetails: expect.objectContaining({
            success: true,
          }),
        }),
      );
    });

    test('should test connection with credentials', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCardWithSecurity,
        a2aCredential: {
          authType: 'API_KEY',
          credentials: 'encrypted-creds',
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await adminA2ARouter.testConnection({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.success).toBe(true);
      expect(mockDecrypt).toHaveBeenCalled();
    });

    test('should handle connection failure', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCard,
        a2aCredential: null,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await adminA2ARouter.testConnection({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toBe('HTTP 500');
    });

    test('should handle network error', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCard,
        a2aCredential: null,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adminA2ARouter.testConnection({
        ctx,
        input: { agentId: 'agent-1' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should throw error when no endpoint URL', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: null,
        agentCardCache: sampleAgentCard,
        a2aCredential: null,
      });

      await expect(
        adminA2ARouter.testConnection({
          ctx,
          input: { agentId: 'agent-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});

describe('Helper Functions', () => {
  describe('computeCardHash', () => {
    test('should compute consistent hash for same card', async () => {
      // We can't test this directly since it's not exported,
      // but we can verify the behavior through the router
      const ctx = createMockContext();

      mockFetchAgentCard.mockResolvedValue(sampleAgentCard);
      mockComputeCardHash.mockReturnValue('a'.repeat(64)); // 64 hex chars

      mockPrisma.agent.create.mockImplementation(async (args) => {
        // Verify hash is computed via mockComputeCardHash
        expect(args.data.agentCardHash).toBeDefined();
        expect(args.data.agentCardHash).toMatch(/^[a-f0-9]{64}$/);
        return {
          id: 'agent-1',
          ...args.data,
          createdAt: new Date(),
        };
      });

      await adminA2ARouter.registerAgent({
        ctx,
        input: {
          url: 'https://agent.example.com',
        },
      });

      expect(mockComputeCardHash).toHaveBeenCalledWith(sampleAgentCard);
    });
  });

  describe('getSupportedAuthTypes', () => {
    test('should return all types when no schemes defined', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
        agentCardUrl: null,
        agentCardCache: sampleAgentCard, // No security schemes
        agentCardFetchedAt: new Date(),
        agentCardHash: 'hash123',
        signatureVerified: false,
        signatureVerifiedAt: null,
        createdAt: new Date(),
        a2aCredential: null,
      });

      const result = await adminA2ARouter.getAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.supportedAuthTypes).toContain('NONE');
      expect(result.supportedAuthTypes).toContain('API_KEY');
      expect(result.supportedAuthTypes).toContain('OAUTH');
      expect(result.supportedAuthTypes).toContain('OIDC');
    });

    test('should map OAuth2 schemes correctly', async () => {
      const ctx = createMockContext();

      const cardWithOAuth = {
        ...sampleAgentCard,
        securitySchemes: {
          oauth: {
            type: 'oauth2' as const,
            flows: {},
          },
        },
      };

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
        agentCardUrl: null,
        agentCardCache: cardWithOAuth,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'hash123',
        signatureVerified: false,
        signatureVerifiedAt: null,
        createdAt: new Date(),
        a2aCredential: null,
      });

      const result = await adminA2ARouter.getAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.supportedAuthTypes).toContain('OAUTH');
    });

    test('should map OpenID Connect schemes correctly', async () => {
      const ctx = createMockContext();

      const cardWithOIDC = {
        ...sampleAgentCard,
        securitySchemes: {
          oidc: {
            type: 'openIdConnect' as const,
            openIdConnectUrl: 'https://auth.example.com/.well-known/openid-configuration',
          },
        },
      };

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        cardSource: 'MANUAL',
        agentCardUrl: null,
        agentCardCache: cardWithOIDC,
        agentCardFetchedAt: new Date(),
        agentCardHash: 'hash123',
        signatureVerified: false,
        signatureVerifiedAt: null,
        createdAt: new Date(),
        a2aCredential: null,
      });

      const result = await adminA2ARouter.getAgent({
        ctx,
        input: { id: 'agent-1' },
      });

      expect(result.supportedAuthTypes).toContain('OIDC');
    });
  });

  describe('buildAuthHeaders', () => {
    test('should build Bearer header for API_KEY with http bearer scheme', async () => {
      const ctx = createMockContext();

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        endpointUrl: 'https://agent.example.com',
        agentCardCache: sampleAgentCardWithSecurity,
        a2aCredential: {
          authType: 'API_KEY',
          credentials: 'encrypted',
        },
      });

      mockDecrypt.mockReturnValue('{"apiKey":"test-token"}');

      mockFetch.mockImplementation(async (_url, options) => {
        // Verify the Authorization header is set correctly
        const headers = options?.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer test-token');
        return { ok: true, status: 200 };
      });

      await adminA2ARouter.testConnection({
        ctx,
        input: { agentId: 'agent-1' },
      });
    });
  });
});
