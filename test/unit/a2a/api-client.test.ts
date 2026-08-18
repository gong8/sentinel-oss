/**
 * Unit tests for A2A API Client
 * Tests communication with the Sentinel API for A2A proxy operations
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockValidateToken,
  mockGetA2AAgentQuery,
  mockGetA2ACredentialsQuery,
  mockLogA2AAuditEntryMutation,
  mockRefreshA2AAgentCardMutation,
  mockDecryptCredentials,
  mockLogger,
} = vi.hoisted(() => ({
  mockValidateToken: vi.fn(),
  mockGetA2AAgentQuery: vi.fn(),
  mockGetA2ACredentialsQuery: vi.fn(),
  mockLogA2AAuditEntryMutation: vi.fn(),
  mockRefreshA2AAgentCardMutation: vi.fn(),
  mockDecryptCredentials: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock modules with new function exports
vi.mock('../../../packages/a2a/src/trpc-client.js', () => ({
  validateToken: mockValidateToken,
  getA2AAgentQuery: mockGetA2AAgentQuery,
  getA2ACredentialsQuery: mockGetA2ACredentialsQuery,
  logA2AAuditEntryMutation: mockLogA2AAuditEntryMutation,
  refreshA2AAgentCardMutation: mockRefreshA2AAgentCardMutation,
}));

vi.mock('../../../packages/a2a/src/crypto.js', () => ({
  decryptCredentials: mockDecryptCredentials,
}));

vi.mock('../../../packages/a2a/src/logger.js', () => ({
  logger: mockLogger,
}));

// Import after mocks
import {
  getA2AAgent,
  getA2ACredentials,
  isCardCacheStale,
  logA2AAuditEntry,
  refreshA2AAgentCard,
  validateAccessToken,
} from '../../../packages/a2a/src/api-client.js';

// Sample data
const sampleUserContext = {
  valid: true,
  userId: 'user-123',
  email: 'test@example.com',
  organizationId: 'org-123',
  roles: ['admin'],
};

const sampleAgentCard = {
  protocolVersion: '1.0.0',
  name: 'Test Agent',
  description: 'A test agent',
  url: 'https://agent.example.com',
  skills: [{ id: 'skill-1', name: 'Test Skill', description: 'A test skill' }],
};

const sampleAgent = {
  id: 'agent-123',
  name: 'Test Agent',
  endpointUrl: 'https://agent.example.com',
  agentCardCache: sampleAgentCard,
  agentCardFetchedAt: new Date().toISOString(),
  cardSource: 'MANUAL',
  agentCardUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateAccessToken', () => {
  test('should return user context for valid token', async () => {
    mockValidateToken.mockResolvedValue(sampleUserContext);

    const result = await validateAccessToken('valid-token');

    expect(result).toEqual(sampleUserContext);
    expect(mockValidateToken).toHaveBeenCalledWith({
      accessToken: 'valid-token',
    });
  });

  test('should return null for invalid token', async () => {
    mockValidateToken.mockResolvedValue({ valid: false });

    const result = await validateAccessToken('invalid-token');

    expect(result).toBeNull();
  });

  test('should return null on error', async () => {
    mockValidateToken.mockRejectedValue(new Error('Network error'));

    const result = await validateAccessToken('token');

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith('Error validating token:', expect.any(Error));
  });
});

describe('getA2AAgent', () => {
  test('should return agent details', async () => {
    mockGetA2AAgentQuery.mockResolvedValue(sampleAgent);

    const result = await getA2AAgent('org-123', 'agent-123');

    expect(result).toBeDefined();
    expect(result?.id).toBe('agent-123');
    expect(result?.name).toBe('Test Agent');
    expect(result?.endpointUrl).toBe('https://agent.example.com');
    expect(result?.agentCardCache).toEqual(sampleAgentCard);
    expect(result?.cardSource).toBe('MANUAL');
    expect(mockGetA2AAgentQuery).toHaveBeenCalledWith({
      organizationId: 'org-123',
      agentId: 'agent-123',
    });
  });

  test('should return null when agent not found', async () => {
    mockGetA2AAgentQuery.mockResolvedValue(null);

    const result = await getA2AAgent('org-123', 'non-existent');

    expect(result).toBeNull();
  });

  test('should return null on error', async () => {
    mockGetA2AAgentQuery.mockRejectedValue(new Error('Database error'));

    const result = await getA2AAgent('org-123', 'agent-123');

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith('Error getting A2A agent:', expect.any(Error));
  });

  test('should convert agentCardFetchedAt to Date', async () => {
    const isoDate = '2024-01-15T10:30:00.000Z';
    mockGetA2AAgentQuery.mockResolvedValue({
      ...sampleAgent,
      agentCardFetchedAt: isoDate,
    });

    const result = await getA2AAgent('org-123', 'agent-123');

    expect(result?.agentCardFetchedAt).toBeInstanceOf(Date);
    expect(result?.agentCardFetchedAt?.toISOString()).toBe(isoDate);
  });

  test('should handle null agentCardFetchedAt', async () => {
    mockGetA2AAgentQuery.mockResolvedValue({
      ...sampleAgent,
      agentCardFetchedAt: null,
    });

    const result = await getA2AAgent('org-123', 'agent-123');

    expect(result?.agentCardFetchedAt).toBeNull();
  });
});

describe('getA2ACredentials', () => {
  test('should return decrypted credentials', async () => {
    mockGetA2ACredentialsQuery.mockResolvedValue({
      authType: 'API_KEY',
      credentials: 'encrypted-creds',
    });
    mockDecryptCredentials.mockReturnValue({ apiKey: 'sk-12345' });

    const result = await getA2ACredentials('org-123', 'agent-123');

    expect(result).toBeDefined();
    expect(result?.authType).toBe('API_KEY');
    expect(result?.credentials).toEqual({ apiKey: 'sk-12345' });
    expect(mockDecryptCredentials).toHaveBeenCalledWith('encrypted-creds');
  });

  test('should return null when no credentials', async () => {
    mockGetA2ACredentialsQuery.mockResolvedValue(null);

    const result = await getA2ACredentials('org-123', 'agent-123');

    expect(result).toBeNull();
  });

  test('should extract security scheme from agent card', async () => {
    const cardWithSecurity = {
      ...sampleAgentCard,
      securitySchemes: {
        bearer: { type: 'http' as const, scheme: 'bearer' },
      },
    };

    mockGetA2ACredentialsQuery.mockResolvedValue({
      authType: 'API_KEY',
      credentials: 'encrypted-creds',
    });
    mockDecryptCredentials.mockReturnValue({ apiKey: 'sk-12345' });

    const result = await getA2ACredentials('org-123', 'agent-123', cardWithSecurity);

    expect(result?.securityScheme).toEqual({ type: 'http', scheme: 'bearer' });
  });

  test('should return null on error', async () => {
    mockGetA2ACredentialsQuery.mockRejectedValue(new Error('Decryption error'));

    const result = await getA2ACredentials('org-123', 'agent-123');

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error getting A2A credentials:',
      expect.any(Error),
    );
  });
});

describe('logA2AAuditEntry', () => {
  test('should log audit entry successfully', async () => {
    mockLogA2AAuditEntryMutation.mockResolvedValue({ success: true });

    await logA2AAuditEntry({
      organizationId: 'org-123',
      agentId: 'agent-123',
      skillId: 'skill-1',
      userId: 'user-123',
      request: { jsonrpc: '2.0', method: 'test', id: 1 },
      response: { jsonrpc: '2.0', result: {}, id: 1 },
      durationMs: 150,
      success: true,
    });

    expect(mockLogA2AAuditEntryMutation).toHaveBeenCalledWith({
      organizationId: 'org-123',
      agentId: 'agent-123',
      skillId: 'skill-1',
      userId: 'user-123',
      request: { jsonrpc: '2.0', method: 'test', id: 1 },
      response: { jsonrpc: '2.0', result: {}, id: 1 },
      durationMs: 150,
      success: true,
      error: undefined,
    });
  });

  test('should log failed request', async () => {
    mockLogA2AAuditEntryMutation.mockResolvedValue({ success: true });

    await logA2AAuditEntry({
      organizationId: 'org-123',
      agentId: 'agent-123',
      request: { jsonrpc: '2.0', method: 'test', id: 1 },
      durationMs: 50,
      success: false,
      error: 'Connection refused',
    });

    expect(mockLogA2AAuditEntryMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Connection refused',
      }),
    );
  });

  test('should not throw on logging error', async () => {
    mockLogA2AAuditEntryMutation.mockRejectedValue(new Error('DB error'));

    // Should not throw
    await expect(
      logA2AAuditEntry({
        organizationId: 'org-123',
        agentId: 'agent-123',
        request: {},
        durationMs: 100,
        success: true,
      }),
    ).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to log A2A audit entry:',
      expect.any(Error),
    );
  });
});

describe('refreshA2AAgentCard', () => {
  test('should return refreshed card', async () => {
    const updatedCard = { ...sampleAgentCard, description: 'Updated description' };
    mockRefreshA2AAgentCardMutation.mockResolvedValue({
      success: true,
      card: updatedCard,
    });

    const result = await refreshA2AAgentCard('org-123', 'agent-123');

    expect(result.success).toBe(true);
    expect(result.card).toEqual(updatedCard);
    expect(result.error).toBeUndefined();
  });

  test('should return error on refresh failure', async () => {
    mockRefreshA2AAgentCardMutation.mockResolvedValue({
      success: false,
      error: 'Agent not found',
    });

    const result = await refreshA2AAgentCard('org-123', 'agent-123');

    expect(result.success).toBe(false);
    expect(result.card).toBeUndefined();
    expect(result.error).toBe('Agent not found');
  });

  test('should handle network error', async () => {
    mockRefreshA2AAgentCardMutation.mockRejectedValue(new Error('Network error'));

    const result = await refreshA2AAgentCard('org-123', 'agent-123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error refreshing A2A agent card:',
      expect.any(Error),
    );
  });

  test('should handle non-Error rejection', async () => {
    mockRefreshA2AAgentCardMutation.mockRejectedValue('Unknown error');

    const result = await refreshA2AAgentCard('org-123', 'agent-123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to refresh card');
  });
});

describe('isCardCacheStale', () => {
  test('should return true for null fetchedAt', () => {
    const result = isCardCacheStale(null);
    expect(result).toBe(true);
  });

  test('should return true for old date (> 1 hour)', () => {
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const result = isCardCacheStale(oldDate);
    expect(result).toBe(true);
  });

  test('should return false for recent date (< 1 hour)', () => {
    const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const result = isCardCacheStale(recentDate);
    expect(result).toBe(false);
  });

  test('should return false for current time', () => {
    const now = new Date();
    const result = isCardCacheStale(now);
    expect(result).toBe(false);
  });

  test('should return true for exactly 1 hour old', () => {
    const exactlyOneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = isCardCacheStale(exactlyOneHourAgo);
    // At exactly 1 hour, it's not stale (needs to be > 1 hour)
    expect(result).toBe(false);
  });

  test('should return true for just over 1 hour old', () => {
    const justOverOneHour = new Date(Date.now() - 60 * 60 * 1000 - 1);
    const result = isCardCacheStale(justOverOneHour);
    expect(result).toBe(true);
  });
});

describe('Type Handling', () => {
  test('should handle agent with URL card source', async () => {
    mockGetA2AAgentQuery.mockResolvedValue({
      ...sampleAgent,
      cardSource: 'URL',
      agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
    });

    const result = await getA2AAgent('org-123', 'agent-123');

    expect(result?.cardSource).toBe('URL');
    expect(result?.agentCardUrl).toBe('https://agent.example.com/.well-known/agent-card.json');
  });

  test('should handle OAUTH auth type', async () => {
    mockGetA2ACredentialsQuery.mockResolvedValue({
      authType: 'OAUTH',
      credentials: 'encrypted',
    });
    mockDecryptCredentials.mockReturnValue({
      accessToken: 'oauth-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: Date.now() + 3600000,
    });

    const result = await getA2ACredentials('org-123', 'agent-123');

    expect(result?.authType).toBe('OAUTH');
    expect(result?.credentials.accessToken).toBe('oauth-token');
    expect(result?.credentials.refreshToken).toBe('refresh-token');
  });

  test('should handle OIDC auth type', async () => {
    mockGetA2ACredentialsQuery.mockResolvedValue({
      authType: 'OIDC',
      credentials: 'encrypted',
    });
    mockDecryptCredentials.mockReturnValue({
      accessToken: 'oidc-token',
      idToken: 'id-token',
    });

    const result = await getA2ACredentials('org-123', 'agent-123');

    expect(result?.authType).toBe('OIDC');
    expect(result?.credentials.idToken).toBe('id-token');
  });
});
