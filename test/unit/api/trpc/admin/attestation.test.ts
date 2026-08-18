/**
 * Tests for Admin Attestation Router
 * Tests agent verification and publisher management operations
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createMockContext,
  createMockContextWithHeaders,
  createMockData,
  expectAdminActionLogged,
  expectBadRequest,
  expectNotFound,
  type TestableHandler,
} from '../../../../helpers/admin-router-test.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockVerifyAgent,
  mockGetAgentVerificationStatus,
  mockClearAgentVerificationCache,
  mockRegisterPublisherKey,
  mockListPublishers,
} = vi.hoisted(() => ({
  mockPrisma: {
    agent: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    publisherRegistry: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockVerifyAgent: vi.fn(),
  mockGetAgentVerificationStatus: vi.fn(),
  mockClearAgentVerificationCache: vi.fn(),
  mockRegisterPublisherKey: vi.fn(),
  mockListPublishers: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: Symbol.for('DbNull') },
  AdminActionType: {
    AGENT_VERIFY: 'AGENT_VERIFY',
    AGENT_REFRESH_VERIFICATION: 'AGENT_REFRESH_VERIFICATION',
    PUBLISHER_CREATE: 'PUBLISHER_CREATE',
    PUBLISHER_DELETE: 'PUBLISHER_DELETE',
  },
  AdminResourceType: {
    AGENT: 'AGENT',
    PUBLISHER: 'PUBLISHER',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/verification.js', () => ({
  verifyAgent: mockVerifyAgent,
  getAgentVerificationStatus: mockGetAgentVerificationStatus,
  clearAgentVerificationCache: mockClearAgentVerificationCache,
  registerPublisherKey: mockRegisterPublisherKey,
  listPublishers: mockListPublishers,
  SUPPORTED_ALGORITHMS: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'],
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { adminAttestationRouter as _adminAttestationRouter } from '../../../../../packages/api/src/trpc/admin/attestation.js';

const adminAttestationRouter = _adminAttestationRouter as unknown as {
  verifyAgent: TestableHandler;
  getVerificationStatus: TestableHandler;
  refreshVerification: TestableHandler;
  updateAgentJwksUrl: TestableHandler;
  registerPublisher: TestableHandler;
  listPublishers: TestableHandler;
  getPublisher: TestableHandler;
  deletePublisher: TestableHandler;
};

// Test data defaults
const agentDefaults = {
  id: 'agent-1',
  name: 'Test Agent',
  organizationId: 'org-123',
  publicKeyUrl: 'https://example.com/.well-known/jwks.json',
  signatureVerified: false,
  signatureVerifiedAt: null,
  publicKeyCache: null,
  publicKeyCachedAt: null,
  createdAt: new Date(),
  deletedAt: null,
};

const publisherDefaults = {
  id: 'pub-1',
  organizationId: 'org-123',
  name: 'Test Publisher',
  publicKey: 'encrypted:key',
  keyAlgorithm: 'RS256',
  keyFingerprint: 'abc123fingerprint',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  deletedBy: null,
};

const verificationDefaults = {
  verified: true,
  verifiedAt: new Date(),
  algorithm: 'RS256',
  keyId: 'key-1',
  error: null,
};

function createMockAgent(overrides: Record<string, unknown> = {}) {
  return createMockData(agentDefaults, overrides);
}

function createMockPublisher(overrides: Record<string, unknown> = {}) {
  return createMockData(publisherDefaults, overrides);
}

function createVerificationResult(overrides: Record<string, unknown> = {}) {
  return createMockData(verificationDefaults, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('adminAttestationRouter', () => {
  describe('verifyAgent', () => {
    test('should verify agent and return result', async () => {
      const mockAgent = createMockAgent();
      const verificationResult = createVerificationResult();
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockVerifyAgent.mockResolvedValue(verificationResult);

      const result = await adminAttestationRouter.verifyAgent({
        ctx: createMockContext(),
        input: { agentId: 'agent-1' },
      });

      expect(result).toEqual(verificationResult);
      expect(mockVerifyAgent).toHaveBeenCalledWith('org-123', 'agent-1');
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.verifyAgent({
            ctx: createMockContext(),
            input: { agentId: 'unknown-agent' },
          }),
        'Agent not found',
      );
    });

    test('should enforce organization isolation', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      try {
        await adminAttestationRouter.verifyAgent({
          ctx: createMockContext({ organizationId: 'org-A' }),
          input: { agentId: 'agent-from-org-B' },
        });
      } catch {
        // Expected
      }

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: { id: 'agent-from-org-B', organizationId: 'org-A', deletedAt: null },
      });
    });

    test('should log admin action on successful verification', async () => {
      const mockAgent = createMockAgent({ name: 'My Agent' });
      const verificationResult = createVerificationResult({
        verified: true,
        algorithm: 'ES256',
        keyId: 'ec-key-1',
      });
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockVerifyAgent.mockResolvedValue(verificationResult);

      await adminAttestationRouter.verifyAgent({
        ctx: createMockContext({ userId: 'admin-456' }),
        input: { agentId: 'agent-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'AGENT_VERIFY',
        resourceType: 'AGENT',
        resourceId: 'agent-1',
        resourceName: 'My Agent',
        actionDetails: { verified: true, algorithm: 'ES256', keyId: 'ec-key-1', error: null },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    test('should log admin action on failed verification', async () => {
      const mockAgent = createMockAgent();
      const verificationResult = createVerificationResult({
        verified: false,
        algorithm: null,
        keyId: null,
        error: 'JWKS fetch failed',
      });
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockVerifyAgent.mockResolvedValue(verificationResult);

      await adminAttestationRouter.verifyAgent({
        ctx: createMockContext(),
        input: { agentId: 'agent-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionDetails: {
            verified: false,
            algorithm: null,
            keyId: null,
            error: 'JWKS fetch failed',
          },
        }),
      );
    });

    test('should capture IP from x-forwarded-for header', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockVerifyAgent.mockResolvedValue(createVerificationResult());

      await adminAttestationRouter.verifyAgent({
        ctx: createMockContextWithHeaders((name) =>
          name === 'x-forwarded-for' ? '10.0.0.1' : null,
        ),
        input: { agentId: 'agent-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '10.0.0.1' }),
      );
    });

    test('should fallback to x-real-ip header', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockVerifyAgent.mockResolvedValue(createVerificationResult());

      await adminAttestationRouter.verifyAgent({
        ctx: createMockContextWithHeaders((name) => (name === 'x-real-ip' ? '172.16.0.1' : null)),
        input: { agentId: 'agent-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '172.16.0.1' }),
      );
    });

    test('should handle null IP address', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockVerifyAgent.mockResolvedValue(createVerificationResult());

      await adminAttestationRouter.verifyAgent({
        ctx: createMockContextWithHeaders(() => null),
        input: { agentId: 'agent-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: null, userAgent: null }),
      );
    });
  });

  describe('getVerificationStatus', () => {
    test('should return verification status', async () => {
      const status = {
        verified: true,
        verifiedAt: new Date('2024-01-15T10:00:00Z'),
        publicKeyUrl: 'https://example.com/jwks',
        cacheExpired: false,
      };
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockGetAgentVerificationStatus.mockResolvedValue(status);

      const result = await adminAttestationRouter.getVerificationStatus({
        ctx: createMockContext(),
        input: { agentId: 'agent-1' },
      });

      expect(result).toEqual(status);
      expect(mockGetAgentVerificationStatus).toHaveBeenCalledWith('org-123', 'agent-1');
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.getVerificationStatus({
            ctx: createMockContext(),
            input: { agentId: 'unknown-agent' },
          }),
        'Agent not found',
      );
    });

    test('should return unverified and expired cache status', async () => {
      const statuses = [
        { verified: false, verifiedAt: null, publicKeyUrl: null, cacheExpired: true },
        {
          verified: true,
          verifiedAt: new Date('2024-01-14T10:00:00Z'),
          publicKeyUrl: 'https://example.com/jwks',
          cacheExpired: true,
        },
      ];

      for (const status of statuses) {
        mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
        mockGetAgentVerificationStatus.mockResolvedValue(status);

        const result = await adminAttestationRouter.getVerificationStatus({
          ctx: createMockContext(),
          input: { agentId: 'agent-1' },
        });

        expect(result.verified).toBe(status.verified);
        expect(result.cacheExpired).toBe(true);
      }
    });
  });

  describe('refreshVerification', () => {
    test('should clear cache and re-verify', async () => {
      const mockAgent = createMockAgent();
      const verificationResult = createVerificationResult();
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockClearAgentVerificationCache.mockResolvedValue(undefined);
      mockVerifyAgent.mockResolvedValue(verificationResult);

      const result = await adminAttestationRouter.refreshVerification({
        ctx: createMockContext(),
        input: { agentId: 'agent-1' },
      });

      expect(mockClearAgentVerificationCache).toHaveBeenCalledWith('org-123', 'agent-1');
      expect(mockVerifyAgent).toHaveBeenCalledWith('org-123', 'agent-1');
      expect(result).toEqual(verificationResult);
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.refreshVerification({
            ctx: createMockContext(),
            input: { agentId: 'unknown-agent' },
          }),
        'Agent not found',
      );
    });

    test('should log admin action', async () => {
      const mockAgent = createMockAgent({ name: 'Refresh Agent' });
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockClearAgentVerificationCache.mockResolvedValue(undefined);
      mockVerifyAgent.mockResolvedValue(
        createVerificationResult({ algorithm: 'EdDSA', keyId: 'ed-key' }),
      );

      await adminAttestationRouter.refreshVerification({
        ctx: createMockContext({ userId: 'admin-789' }),
        input: { agentId: 'agent-1' },
      });

      expectAdminActionLogged(mockLogAdminAction, 'AGENT_REFRESH_VERIFICATION', 'AGENT', 'agent-1');
    });

    test('should clear cache before verification', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockClearAgentVerificationCache.mockResolvedValue(undefined);
      mockVerifyAgent.mockResolvedValue(createVerificationResult());

      await adminAttestationRouter.refreshVerification({
        ctx: createMockContext(),
        input: { agentId: 'agent-1' },
      });

      const clearCacheCall = mockClearAgentVerificationCache.mock.invocationCallOrder[0];
      const verifyCall = mockVerifyAgent.mock.invocationCallOrder[0];
      expect(clearCacheCall).toBeLessThan(verifyCall);
    });
  });

  describe('updateAgentJwksUrl', () => {
    test('should update JWKS URL and reset verification', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(
        createMockAgent({ publicKeyUrl: 'https://old.example.com/jwks', signatureVerified: true }),
      );
      mockPrisma.agent.update.mockResolvedValue({});

      const result = await adminAttestationRouter.updateAgentJwksUrl({
        ctx: createMockContext(),
        input: {
          agentId: 'agent-1',
          publicKeyUrl: 'https://new.example.com/.well-known/jwks.json',
        },
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          publicKeyUrl: 'https://new.example.com/.well-known/jwks.json',
          signatureVerified: false,
          signatureVerifiedAt: null,
          publicKeyCache: Symbol.for('DbNull'),
          publicKeyCachedAt: null,
        },
      });
    });

    test('should accept null to clear URL', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(
        createMockAgent({ publicKeyUrl: 'https://example.com/jwks' }),
      );
      mockPrisma.agent.update.mockResolvedValue({});

      await adminAttestationRouter.updateAgentJwksUrl({
        ctx: createMockContext(),
        input: { agentId: 'agent-1', publicKeyUrl: null },
      });

      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: expect.objectContaining({ publicKeyUrl: null }),
      });
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.updateAgentJwksUrl({
            ctx: createMockContext(),
            input: { agentId: 'unknown-agent', publicKeyUrl: 'https://example.com/jwks' },
          }),
        'Agent not found',
      );
    });

    test('should log admin action with snapshots', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(
        createMockAgent({
          name: 'URL Update Agent',
          publicKeyUrl: 'https://old.example.com/jwks',
          signatureVerified: true,
        }),
      );
      mockPrisma.agent.update.mockResolvedValue({});

      await adminAttestationRouter.updateAgentJwksUrl({
        ctx: createMockContext({ userId: 'admin-123' }),
        input: { agentId: 'agent-1', publicKeyUrl: 'https://new.example.com/jwks' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-123',
        actionType: 'AGENT_VERIFY',
        resourceType: 'AGENT',
        resourceId: 'agent-1',
        resourceName: 'URL Update Agent',
        actionDetails: { action: 'update_jwks_url', newUrl: 'https://new.example.com/jwks' },
        beforeSnapshot: { publicKeyUrl: 'https://old.example.com/jwks', signatureVerified: true },
        afterSnapshot: { publicKeyUrl: 'https://new.example.com/jwks', signatureVerified: false },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('registerPublisher', () => {
    const validPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWy
-----END PUBLIC KEY-----`;

    test('should register new publisher', async () => {
      mockRegisterPublisherKey.mockResolvedValue({
        id: 'new-pub-id',
        fingerprint: 'abc123fingerprint',
      });

      const result = await adminAttestationRouter.registerPublisher({
        ctx: createMockContext(),
        input: { name: 'New Publisher', publicKey: validPublicKey, algorithm: 'RS256' },
      });

      expect(result).toEqual({ id: 'new-pub-id', fingerprint: 'abc123fingerprint' });
      expect(mockRegisterPublisherKey).toHaveBeenCalledWith(
        'org-123',
        'New Publisher',
        validPublicKey,
        'RS256',
      );
    });

    test('should throw BAD_REQUEST for invalid key', async () => {
      mockRegisterPublisherKey.mockRejectedValue(
        new Error('Invalid public key: Invalid PEM format'),
      );

      await expectBadRequest(
        () =>
          adminAttestationRouter.registerPublisher({
            ctx: createMockContext(),
            input: { name: 'Bad Publisher', publicKey: 'invalid-key', algorithm: 'RS256' },
          }),
        'Invalid public key: Invalid PEM format',
      );
    });

    test('should throw BAD_REQUEST for duplicate key', async () => {
      mockRegisterPublisherKey.mockRejectedValue(
        new Error('A publisher with this key already exists'),
      );

      await expectBadRequest(
        () =>
          adminAttestationRouter.registerPublisher({
            ctx: createMockContext(),
            input: { name: 'Duplicate Publisher', publicKey: validPublicKey, algorithm: 'RS256' },
          }),
        'A publisher with this key already exists',
      );
    });

    test('should log admin action', async () => {
      mockRegisterPublisherKey.mockResolvedValue({ id: 'pub-new', fingerprint: 'fp-123' });

      await adminAttestationRouter.registerPublisher({
        ctx: createMockContext({ userId: 'admin-456' }),
        input: { name: 'Logged Publisher', publicKey: validPublicKey, algorithm: 'ES256' },
      });

      expectAdminActionLogged(mockLogAdminAction, 'PUBLISHER_CREATE', 'PUBLISHER', 'pub-new');
    });

    test('should handle non-Error exception', async () => {
      mockRegisterPublisherKey.mockRejectedValue('string error');

      await expectBadRequest(
        () =>
          adminAttestationRouter.registerPublisher({
            ctx: createMockContext(),
            input: { name: 'Error Publisher', publicKey: validPublicKey, algorithm: 'RS256' },
          }),
        'Failed to register publisher',
      );
    });

    test('should accept all supported algorithms', async () => {
      const algorithms = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];

      for (const algorithm of algorithms) {
        mockRegisterPublisherKey.mockResolvedValueOnce({
          id: `pub-${algorithm}`,
          fingerprint: 'fp',
        });

        const result = await adminAttestationRouter.registerPublisher({
          ctx: createMockContext(),
          input: { name: `Publisher ${algorithm}`, publicKey: validPublicKey, algorithm },
        });

        expect(result.id).toBe(`pub-${algorithm}`);
      }
    });
  });

  describe('listPublishers', () => {
    test('should list all publishers', async () => {
      const publishers = [
        {
          id: 'pub-1',
          name: 'Publisher 1',
          keyAlgorithm: 'RS256',
          keyFingerprint: 'fp-1',
          createdAt: new Date('2024-01-10'),
          updatedAt: new Date('2024-01-10'),
        },
        {
          id: 'pub-2',
          name: 'Publisher 2',
          keyAlgorithm: 'ES256',
          keyFingerprint: 'fp-2',
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        },
      ];
      mockListPublishers.mockResolvedValue(publishers);

      const result = await adminAttestationRouter.listPublishers({ ctx: createMockContext() });

      expect(result).toEqual(publishers);
      expect(mockListPublishers).toHaveBeenCalledWith('org-123');
    });

    test('should respect organization isolation', async () => {
      mockListPublishers.mockResolvedValue([]);

      await adminAttestationRouter.listPublishers({
        ctx: createMockContext({ organizationId: 'org-specific' }),
      });

      expect(mockListPublishers).toHaveBeenCalledWith('org-specific');
    });

    test('should return empty array when no publishers', async () => {
      mockListPublishers.mockResolvedValue([]);

      const result = await adminAttestationRouter.listPublishers({ ctx: createMockContext() });

      expect(result).toEqual([]);
    });
  });

  describe('getPublisher', () => {
    test('should return publisher by id', async () => {
      const publisher = {
        id: 'pub-1',
        name: 'Test Publisher',
        keyAlgorithm: 'RS256',
        keyFingerprint: 'fp-123',
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-10'),
      };
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(publisher);

      const result = await adminAttestationRouter.getPublisher({
        ctx: createMockContext(),
        input: { id: 'pub-1' },
      });

      expect(result).toEqual(publisher);
    });

    test('should throw NOT_FOUND for non-existent publisher', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.getPublisher({
            ctx: createMockContext(),
            input: { id: 'unknown-pub' },
          }),
        'Publisher not found',
      );
    });

    test('should enforce organization isolation and exclude deleted', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(null);

      try {
        await adminAttestationRouter.getPublisher({
          ctx: createMockContext({ organizationId: 'org-A' }),
          input: { id: 'pub-from-org-B' },
        });
      } catch {
        // Expected
      }

      expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith({
        where: { id: 'pub-from-org-B', organizationId: 'org-A', deletedAt: null },
        select: {
          id: true,
          name: true,
          keyAlgorithm: true,
          keyFingerprint: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  });

  describe('deletePublisher', () => {
    test('should soft delete publisher', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(createMockPublisher());
      mockPrisma.publisherRegistry.update.mockResolvedValue({});

      const result = await adminAttestationRouter.deletePublisher({
        ctx: createMockContext({ userId: 'admin-123' }),
        input: { id: 'pub-1' },
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.publisherRegistry.update).toHaveBeenCalledWith({
        where: { id: 'pub-1' },
        data: { deletedAt: expect.any(Date), deletedBy: 'admin-123' },
      });
    });

    test('should throw NOT_FOUND for non-existent publisher', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () =>
          adminAttestationRouter.deletePublisher({
            ctx: createMockContext(),
            input: { id: 'unknown-pub' },
          }),
        'Publisher not found',
      );
    });

    test('should log admin action with snapshot', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(
        createMockPublisher({
          id: 'pub-del',
          name: 'Delete Me',
          keyAlgorithm: 'ES384',
          keyFingerprint: 'fp-delete',
        }),
      );
      mockPrisma.publisherRegistry.update.mockResolvedValue({});

      await adminAttestationRouter.deletePublisher({
        ctx: createMockContext({ userId: 'admin-456' }),
        input: { id: 'pub-del' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'PUBLISHER_DELETE',
        resourceType: 'PUBLISHER',
        resourceId: 'pub-del',
        resourceName: 'Delete Me',
        actionDetails: { fingerprint: 'fp-delete' },
        beforeSnapshot: {
          id: 'pub-del',
          name: 'Delete Me',
          keyAlgorithm: 'ES384',
          keyFingerprint: 'fp-delete',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('organization isolation', () => {
    test('all agent endpoints should filter by organizationId', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-test' });
      const endpoints = [
        'verifyAgent',
        'getVerificationStatus',
        'refreshVerification',
        'updateAgentJwksUrl',
      ];

      for (const endpoint of endpoints) {
        try {
          await (adminAttestationRouter as Record<string, TestableHandler>)[endpoint]({
            ctx,
            input: { agentId: 'test-agent', publicKeyUrl: 'https://example.com/jwks' },
          });
        } catch {
          // Expected
        }
      }

      const calls = mockPrisma.agent.findFirst.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((call) => {
        expect(call[0].where.organizationId).toBe('org-test');
      });
    });

    test('all publisher endpoints should filter by organizationId', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValue(null);
      mockListPublishers.mockResolvedValue([]);
      mockRegisterPublisherKey.mockResolvedValue({ id: 'pub', fingerprint: 'fp' });

      const ctx = createMockContext({ organizationId: 'org-publisher-test' });

      try {
        await adminAttestationRouter.getPublisher({ ctx, input: { id: 'pub-1' } });
      } catch {
        // Expected
      }
      try {
        await adminAttestationRouter.deletePublisher({ ctx, input: { id: 'pub-1' } });
      } catch {
        // Expected
      }
      await adminAttestationRouter.listPublishers({ ctx });
      await adminAttestationRouter.registerPublisher({
        ctx,
        input: {
          name: 'Test',
          publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
          algorithm: 'RS256',
        },
      });

      expect(mockListPublishers).toHaveBeenCalledWith('org-publisher-test');
      expect(mockRegisterPublisherKey).toHaveBeenCalledWith(
        'org-publisher-test',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('edge cases', () => {
    test('should handle special characters and long names', async () => {
      const testCases = [
        { name: 'A'.repeat(200), description: 'very long name' },
        {
          name: 'Agent <script>alert("xss")</script> & "quotes"',
          description: 'special characters',
        },
      ];

      for (const { name } of testCases) {
        mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent({ name }));
        mockVerifyAgent.mockResolvedValue(createVerificationResult());

        await adminAttestationRouter.verifyAgent({
          ctx: createMockContext(),
          input: { agentId: 'agent-1' },
        });

        expect(mockLogAdminAction).toHaveBeenCalledWith(
          expect.objectContaining({ resourceName: name }),
        );
      }
    });

    test('should handle unicode in publisher names', async () => {
      mockRegisterPublisherKey.mockResolvedValue({ id: 'pub', fingerprint: 'fp' });

      await adminAttestationRouter.registerPublisher({
        ctx: createMockContext(),
        input: {
          name: '发布者 日本語 Emojis',
          publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
          algorithm: 'RS256',
        },
      });

      expect(mockRegisterPublisherKey).toHaveBeenCalledWith(
        'org-123',
        '发布者 日本語 Emojis',
        expect.any(String),
        'RS256',
      );
    });

    test('should handle concurrent verification requests', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(createMockAgent());
      mockVerifyAgent.mockResolvedValue(createVerificationResult());

      const results = await Promise.all([
        adminAttestationRouter.verifyAgent({
          ctx: createMockContext(),
          input: { agentId: 'agent-1' },
        }),
        adminAttestationRouter.verifyAgent({
          ctx: createMockContext(),
          input: { agentId: 'agent-1' },
        }),
        adminAttestationRouter.verifyAgent({
          ctx: createMockContext(),
          input: { agentId: 'agent-1' },
        }),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.verified).toBe(true);
      });
    });
  });
});
