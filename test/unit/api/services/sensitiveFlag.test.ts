/**
 * Sensitive Flag Service Unit Tests
 * Tests for sensitive flag evaluation logic
 */

import { ApprovalRequestStatus, SensitiveFlagBehavior } from '@sentinel/db';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger, mockSendWebhook, mockCheckToolPattern } = vi.hoisted(() => ({
  mockPrisma: {
    sensitiveToolFlag: {
      findMany: vi.fn(),
    },
    sensitiveFlagRateLimitUsage: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    sensitiveFlagApprovalRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
    },
  },
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  mockSendWebhook: vi.fn(),
  mockCheckToolPattern: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  SensitiveFlagBehavior: {
    RATE_LIMIT: 'RATE_LIMIT',
    REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
    ALERT: 'ALERT',
  },
  ApprovalRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
  },
  WebhookEvent: {
    SENSITIVE_TOOL_INVOKED: 'SENSITIVE_TOOL_INVOKED',
    SENSITIVE_RATE_LIMITED: 'SENSITIVE_RATE_LIMITED',
    SENSITIVE_APPROVAL_NEEDED: 'SENSITIVE_APPROVAL_NEEDED',
  },
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../packages/api/src/services/webhook.js', () => ({
  sendWebhook: mockSendWebhook,
}));

vi.mock('../../../../packages/api/src/services/policy.js', () => ({
  checkToolPattern: mockCheckToolPattern,
}));

import {
  alertConfigSchema,
  approvalConfigSchema,
  cancelApprovalRequest,
  checkRateLimit,
  cleanupExpiredRateLimits,
  createApprovalRequest,
  evaluateSensitiveFlags,
  getApprovalStatus,
  getMatchingFlags,
  getPendingApprovals,
  getUserPendingApprovals,
  incrementRateLimit,
  processApprovalDecision,
  rateLimitConfigSchema,
  waitForApproval,
} from '../../../../packages/api/src/services/sensitiveFlag.js';

// ============================================================================
// Test Helpers and Factories
// ============================================================================

interface MockFlagOptions {
  id?: string;
  toolPattern?: string;
  behaviors?: SensitiveFlagBehavior[];
  rateLimitConfig?: { maxPerSession: number; windowMinutes: number } | null;
  approvalConfig?: {
    allowedApprovers: ('session_owner' | 'admin')[];
    timeoutSeconds: number;
  } | null;
  alertConfig?: { webhookEndpointIds: string[] } | null;
  description?: string | null;
  agentOverrides?: Array<{
    agentId: string;
    exempted: boolean;
    behaviors: SensitiveFlagBehavior[];
    rateLimitConfig?: { maxPerSession: number; windowMinutes: number } | null;
    approvalConfig?: {
      allowedApprovers: ('session_owner' | 'admin')[];
      timeoutSeconds: number;
    } | null;
  }>;
}

function createMockFlag(options: MockFlagOptions = {}) {
  return {
    id: options.id ?? 'flag-1',
    toolPattern: options.toolPattern ?? 'github.com::*',
    behaviors: options.behaviors ?? (['RATE_LIMIT'] as SensitiveFlagBehavior[]),
    rateLimitConfig:
      'rateLimitConfig' in options
        ? (options.rateLimitConfig ?? null)
        : { maxPerSession: 10, windowMinutes: 60 },
    approvalConfig: options.approvalConfig ?? null,
    alertConfig: options.alertConfig ?? null,
    description: options.description ?? 'Test flag',
    agentOverrides: options.agentOverrides ?? [],
    createdAt: new Date(),
  };
}

function createMockContext(
  overrides: Partial<{
    organizationId: string;
    sessionId: string;
    userId: string;
    agentId: string;
    toolName: string;
    parameters: Record<string, unknown>;
  }> = {},
) {
  return {
    organizationId: overrides.organizationId ?? 'org-1',
    sessionId: overrides.sessionId ?? 'session-1',
    userId: overrides.userId ?? 'user-1',
    agentId: overrides.agentId ?? 'agent-1',
    toolName: overrides.toolName ?? 'github.com::createPR',
    parameters: overrides.parameters ?? { branch: 'main' },
  };
}

function createMockApprovalRequest(
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED',
  options: {
    expiresAt?: Date;
    approvedBy?: string | null;
    approvedAt?: Date | null;
    approverEmail?: string | null;
  } = {},
) {
  const isPast = options.expiresAt ? options.expiresAt.getTime() < Date.now() : false;
  return {
    status,
    expiresAt: options.expiresAt ?? new Date(Date.now() + (isPast ? -60000 : 60000)),
    approvedBy:
      options.approvedBy ?? (status !== 'PENDING' && status !== 'CANCELLED' ? 'admin-1' : null),
    approvedAt:
      options.approvedAt ?? (status !== 'PENDING' && status !== 'CANCELLED' ? new Date() : null),
    approver: options.approverEmail ? { email: options.approverEmail } : null,
  };
}

function createActiveWindow(invocationCount: number, minutesRemaining = 60) {
  return {
    invocationCount,
    windowEnd: new Date(Date.now() + minutesRemaining * 60 * 1000),
  };
}

function setupRateLimitExceeded(limit = 10) {
  mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(createActiveWindow(limit));
}

function setupNoRateLimitUsage() {
  mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(null);
}

function setupApprovalCreation(requestId = 'approval-request-1') {
  mockPrisma.sensitiveFlagApprovalRequest.create.mockResolvedValue({ id: requestId });
}

function setupApprovalStatus(
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED',
  options: Parameters<typeof createMockApprovalRequest>[1] = {},
) {
  mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(
    createMockApprovalRequest(status, options),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckToolPattern.mockReturnValue(true);
  mockSendWebhook.mockResolvedValue(['delivery-1']);
  mockPrisma.mcpServer.findMany.mockResolvedValue([]);
});

describe('Sensitive Flag Service', () => {
  describe('Schema Validation', () => {
    describe('rateLimitConfigSchema', () => {
      test('should validate valid rate limit config', () => {
        const config = { maxPerSession: 10, windowMinutes: 60 };
        expect(rateLimitConfigSchema.parse(config)).toEqual(config);
      });

      test('should reject negative maxPerSession', () => {
        const config = { maxPerSession: -1, windowMinutes: 60 };
        expect(() => rateLimitConfigSchema.parse(config)).toThrow();
      });

      test('should reject zero windowMinutes', () => {
        const config = { maxPerSession: 10, windowMinutes: 0 };
        expect(() => rateLimitConfigSchema.parse(config)).toThrow();
      });

      test('should reject missing fields', () => {
        expect(() => rateLimitConfigSchema.parse({})).toThrow();
      });
    });

    describe('approvalConfigSchema', () => {
      test('should validate valid approval config', () => {
        const config = { allowedApprovers: ['admin'], timeoutSeconds: 600 };
        expect(approvalConfigSchema.parse(config)).toEqual(config);
      });

      test('should accept session_owner approver', () => {
        const config = { allowedApprovers: ['session_owner'], timeoutSeconds: 300 };
        expect(approvalConfigSchema.parse(config)).toEqual(config);
      });

      test('should accept multiple approvers', () => {
        const config = { allowedApprovers: ['session_owner', 'admin'], timeoutSeconds: 300 };
        expect(approvalConfigSchema.parse(config)).toEqual(config);
      });

      test('should use default timeout if not provided', () => {
        const config = { allowedApprovers: ['admin'] };
        const result = approvalConfigSchema.parse(config);
        expect(result.timeoutSeconds).toBe(300);
      });

      test('should reject invalid approver type', () => {
        const config = { allowedApprovers: ['invalid'], timeoutSeconds: 300 };
        expect(() => approvalConfigSchema.parse(config)).toThrow();
      });
    });

    describe('alertConfigSchema', () => {
      test('should validate valid alert config', () => {
        const config = { webhookEndpointIds: ['endpoint-1', 'endpoint-2'] };
        expect(alertConfigSchema.parse(config)).toEqual(config);
      });

      test('should accept empty array', () => {
        const config = { webhookEndpointIds: [] };
        expect(alertConfigSchema.parse(config)).toEqual(config);
      });
    });
  });

  describe('getMatchingFlags', () => {
    test('should return empty array when no flags exist', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR');

      expect(result).toEqual([]);
      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          enabled: true,
          OR: [{ workspaceId: null }],
        },
        include: {
          agentOverrides: false,
        },
      });
    });

    test('should return matching flags with tool pattern match', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      mockCheckToolPattern.mockReturnValue(true);

      const result = await getMatchingFlags('org-1', 'github.com::createPR');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      });
    });

    test('should filter out non-matching patterns', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'notion.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      mockCheckToolPattern.mockReturnValue(false);

      const result = await getMatchingFlags('org-1', 'github.com::createPR');

      expect(result).toHaveLength(0);
    });

    test('should include agent overrides when agentId provided', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      await getMatchingFlags('org-1', 'github.com::createPR', 'agent-1');

      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          enabled: true,
          OR: [{ workspaceId: null }],
        },
        include: {
          agentOverrides: {
            where: { agentId: 'agent-1' },
          },
        },
      });
    });

    test('should apply agent override behaviors when present', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT', 'ALERT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [
          {
            agentId: 'agent-1',
            exempted: false,
            behaviors: ['ALERT'],
            rateLimitConfig: null,
            approvalConfig: null,
          },
        ],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR', 'agent-1');

      expect(result).toHaveLength(1);
      expect(result[0].behaviors).toEqual(['ALERT']);
    });

    test('should skip exempted agents', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [
          {
            agentId: 'agent-1',
            exempted: true,
            behaviors: [],
            rateLimitConfig: null,
            approvalConfig: null,
          },
        ],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR', 'agent-1');

      expect(result).toHaveLength(0);
    });

    test('should apply override rateLimitConfig when present', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [
          {
            agentId: 'agent-1',
            exempted: false,
            behaviors: [],
            rateLimitConfig: { maxPerSession: 5, windowMinutes: 30 },
            approvalConfig: null,
          },
        ],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR', 'agent-1');

      expect(result).toHaveLength(1);
      expect(result[0].rateLimitConfig).toEqual({ maxPerSession: 5, windowMinutes: 30 });
    });
  });

  describe('checkRateLimit', () => {
    const mockFlag = createMockFlag({ description: null });

    test('should allow when no rate limit config', async () => {
      const flagWithoutConfig = createMockFlag({ rateLimitConfig: null });
      const result = await checkRateLimit('org-1', 'session-1', flagWithoutConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    test('should allow when no active window exists', async () => {
      setupNoRateLimitUsage();
      const result = await checkRateLimit('org-1', 'session-1', mockFlag);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    test('should allow when under limit', async () => {
      const window = createActiveWindow(5);
      mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(window);

      const result = await checkRateLimit('org-1', 'session-1', mockFlag);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
      expect(result.resetAt).toEqual(window.windowEnd);
    });

    test('should deny when at limit', async () => {
      setupRateLimitExceeded(10);
      const result = await checkRateLimit('org-1', 'session-1', mockFlag);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should deny when over limit', async () => {
      setupRateLimitExceeded(15);
      const result = await checkRateLimit('org-1', 'session-1', mockFlag);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('incrementRateLimit', () => {
    const mockFlag = createMockFlag({ description: null });

    test('should do nothing when no rate limit config', async () => {
      const flagWithoutConfig = createMockFlag({ rateLimitConfig: null });
      await incrementRateLimit('org-1', 'session-1', flagWithoutConfig);

      expect(mockPrisma.sensitiveFlagRateLimitUsage.findFirst).not.toHaveBeenCalled();
    });

    test('should create new rate limit window when no existing window', async () => {
      mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(null);
      await incrementRateLimit('org-1', 'session-1', mockFlag);

      expect(mockPrisma.sensitiveFlagRateLimitUsage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: 'session-1',
            toolPattern: 'github.com::*',
            organizationId: 'org-1',
          }),
        }),
      );
      expect(mockPrisma.sensitiveFlagRateLimitUsage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            sessionId: 'session-1',
            toolPattern: 'github.com::*',
            invocationCount: 1,
          }),
        }),
      );
    });

    test('should update existing rate limit window', async () => {
      const existingWindow = {
        id: 'window-1',
        windowEnd: new Date(Date.now() + 60 * 60 * 1000),
      };
      mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(existingWindow);
      await incrementRateLimit('org-1', 'session-1', mockFlag);

      expect(mockPrisma.sensitiveFlagRateLimitUsage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'window-1' },
          data: expect.objectContaining({
            invocationCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('createApprovalRequest', () => {
    const mockCtx = createMockContext();
    const mockFlag = createMockFlag({
      behaviors: ['REQUIRE_APPROVAL'] as SensitiveFlagBehavior[],
      rateLimitConfig: null,
      approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
      description: null,
    });

    test('should create approval request with correct data', async () => {
      setupApprovalCreation('request-1');
      const result = await createApprovalRequest(mockCtx, mockFlag);

      expect(result.requestId).toBe('request-1');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.sensitiveFlagApprovalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          sessionId: 'session-1',
          userId: 'user-1',
          agentId: 'agent-1',
          toolName: 'github.com::createPR',
        }),
      });
    });

    test('should use default timeout when not configured', async () => {
      const flagWithoutTimeout = createMockFlag({ approvalConfig: null });
      setupApprovalCreation('request-1');

      const result = await createApprovalRequest(mockCtx, flagWithoutTimeout);

      const expectedExpiry = Date.now() + 300 * 1000;
      expect(result.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });

    test('should sanitize sensitive parameters', async () => {
      const ctxWithSecrets = createMockContext({
        parameters: { password: 'secret123', token: 'abc', normalParam: 'value' },
      });
      setupApprovalCreation('request-1');

      await createApprovalRequest(ctxWithSecrets, mockFlag);

      const createCall = mockPrisma.sensitiveFlagApprovalRequest.create.mock.calls[0][0];
      expect(createCall.data.parameters).toMatchObject({
        password: '[REDACTED]',
        token: '[REDACTED]',
        normalParam: 'value',
      });
    });
  });

  describe('getApprovalStatus', () => {
    test('should return null when request not found', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);
      const result = await getApprovalStatus('org-1', 'nonexistent');
      expect(result).toBeNull();
    });

    test('should return current status when not expired', async () => {
      setupApprovalStatus('PENDING');
      const result = await getApprovalStatus('org-1', 'request-1');
      expect(result).toBe('PENDING');
    });

    test('should return APPROVED status', async () => {
      setupApprovalStatus('APPROVED', { expiresAt: new Date(Date.now() - 60000) });
      const result = await getApprovalStatus('org-1', 'request-1');
      expect(result).toBe('APPROVED');
    });

    test('should mark as expired when pending and past expiry', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 60000),
      });
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await getApprovalStatus('org-1', 'request-1');

      expect(result).toBe('EXPIRED');
      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1' },
        data: { status: 'EXPIRED' },
      });
    });
  });

  describe('processApprovalDecision', () => {
    test('should approve request (only PENDING requests)', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      await processApprovalDecision('org-1', 'request-1', 'APPROVED', 'admin-1');

      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedBy: 'admin-1',
          approvedAt: expect.any(Date),
          deniedReason: undefined,
        }),
      });
    });

    test('should deny request with reason (only PENDING requests)', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      await processApprovalDecision('org-1', 'request-1', 'DENIED', 'admin-1', 'Policy violation');

      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'DENIED',
          approvedBy: 'admin-1',
          deniedReason: 'Policy violation',
        }),
      });
    });
  });

  describe('cancelApprovalRequest', () => {
    test('should cancel request', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      await cancelApprovalRequest('org-1', 'request-1');

      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('getPendingApprovals', () => {
    test('should return pending approvals by default', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.count.mockResolvedValue(5);
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue([]);

      const result = await getPendingApprovals('org-1');

      expect(result).toEqual({ total: 5, requests: [] });
      expect(mockPrisma.sensitiveFlagApprovalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: 'PENDING' },
        }),
      );
    });

    test('should filter by status when provided', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.count.mockResolvedValue(3);
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue([]);

      await getPendingApprovals('org-1', { status: 'APPROVED' as ApprovalRequestStatus });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: 'APPROVED' },
        }),
      );
    });

    test('should apply pagination', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.count.mockResolvedValue(100);
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue([]);

      await getPendingApprovals('org-1', { limit: 10, offset: 20 });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('getUserPendingApprovals', () => {
    test('should return pending approvals for user', async () => {
      const mockApprovals = [{ id: 'request-1' }, { id: 'request-2' }];
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);

      const result = await getUserPendingApprovals('org-1', 'user-1');

      expect(result).toEqual(mockApprovals);
      expect(mockPrisma.sensitiveFlagApprovalRequest.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', userId: 'user-1', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('cleanupExpiredRateLimits', () => {
    test('should delete expired rate limit records', async () => {
      mockPrisma.sensitiveFlagRateLimitUsage.deleteMany.mockResolvedValue({ count: 5 });

      const result = await cleanupExpiredRateLimits();

      expect(result).toBe(5);
      expect(mockPrisma.sensitiveFlagRateLimitUsage.deleteMany).toHaveBeenCalledWith({
        where: {
          windowEnd: { lt: expect.any(Date) },
        },
      });
    });
  });

  describe('evaluateSensitiveFlags', () => {
    const mockCtx = createMockContext();

    test('should proceed when no matching flags', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);
      const result = await evaluateSensitiveFlags(mockCtx);
      expect(result.proceed).toBe(true);
    });

    test('should block when rate limit exceeded', async () => {
      const mockFlag = createMockFlag({ behaviors: ['RATE_LIMIT'] as SensitiveFlagBehavior[] });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupRateLimitExceeded(10);

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toContain('Rate limit exceeded');
    });

    test('should send alert when rate limit exceeded with ALERT behavior', async () => {
      const mockFlag = createMockFlag({
        behaviors: ['RATE_LIMIT', 'ALERT'] as SensitiveFlagBehavior[],
        alertConfig: { webhookEndpointIds: ['endpoint-1'] },
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupRateLimitExceeded(10);

      await evaluateSensitiveFlags(mockCtx);

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-1',
        'SENSITIVE_RATE_LIMITED',
        expect.objectContaining({ flagId: 'flag-1', toolName: 'github.com::createPR' }),
        undefined,
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });

    test('should always include enhanced audit data for matched flags', async () => {
      const mockFlag = createMockFlag({
        behaviors: ['ALERT'] as SensitiveFlagBehavior[],
        rateLimitConfig: null,
        alertConfig: { webhookEndpointIds: ['endpoint-1'] },
        description: 'Sensitive operation',
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(true);
      expect(result.enhancedAuditData).toBeDefined();
      expect(result.enhancedAuditData?.sensitiveFlag).toMatchObject({
        id: 'flag-1',
        toolPattern: 'github.com::*',
      });
      expect(result.enhancedAuditData?.fullParameters).toBeDefined();
    });

    test('should send alert on successful invocation with ALERT behavior', async () => {
      const mockFlag = createMockFlag({
        behaviors: ['ALERT'] as SensitiveFlagBehavior[],
        rateLimitConfig: null,
        alertConfig: { webhookEndpointIds: ['endpoint-1'] },
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(true);
      expect(result.alertsSent).toEqual(['delivery-1']);
      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-1',
        'SENSITIVE_TOOL_INVOKED',
        expect.objectContaining({ flagId: 'flag-1', toolName: 'github.com::createPR' }),
        undefined,
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });

    test('should increment rate limit after successful evaluation', async () => {
      const mockFlag = createMockFlag({ behaviors: ['RATE_LIMIT'] as SensitiveFlagBehavior[] });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupNoRateLimitUsage();
      mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveFlagRateLimitUsage.create.mockResolvedValue({});

      await evaluateSensitiveFlags(mockCtx);

      expect(mockPrisma.sensitiveFlagRateLimitUsage.create).toHaveBeenCalled();
    });

    test('should fail closed on errors', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockRejectedValue(new Error('Database error'));

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toBe('Error evaluating sensitive flags');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should return matchedFlagIds for all matching flags', async () => {
      const mockFlags = [
        createMockFlag({
          id: 'flag-1',
          behaviors: ['ALERT'] as SensitiveFlagBehavior[],
          rateLimitConfig: null,
          alertConfig: { webhookEndpointIds: ['endpoint-1'] },
          description: null,
        }),
        createMockFlag({
          id: 'flag-2',
          toolPattern: 'github.com::createPR',
          behaviors: ['ALERT'] as SensitiveFlagBehavior[],
          rateLimitConfig: null,
          alertConfig: { webhookEndpointIds: ['endpoint-1'] },
          description: null,
        }),
      ];
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.matchedFlagIds).toEqual(['flag-1', 'flag-2']);
    });
  });

  describe('waitForApproval', () => {
    test('should return approved: false when request not found', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);
      const result = await waitForApproval('org-1', 'nonexistent', 1000);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('NOT_FOUND');
    });

    test('should return approved: true when request is approved', async () => {
      const approvedAt = new Date();
      setupApprovalStatus('APPROVED', { approvedAt, approverEmail: 'admin@example.com' });

      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(true);
      expect(result.details).toEqual({
        status: 'APPROVED',
        decidedBy: 'admin-1',
        decidedByEmail: 'admin@example.com',
        decidedAt: approvedAt,
      });
    });

    test('should return approved: false when request is denied', async () => {
      setupApprovalStatus('DENIED', { approverEmail: 'admin@example.com' });
      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('DENIED');
      expect(result.details?.status).toBe('DENIED');
    });

    test('should return approved: false when request is cancelled', async () => {
      setupApprovalStatus('CANCELLED');
      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('CANCELLED');
    });

    test('should return approved: false when request expires during wait', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
        approvedBy: null,
        approvedAt: null,
        approver: null,
      });
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('EXPIRED');
      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1' },
        data: { status: 'EXPIRED' },
      });
    });

    test('should return approved: false with ALREADY_EXPIRED status', async () => {
      setupApprovalStatus('EXPIRED', { expiresAt: new Date(Date.now() - 60000) });
      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('EXPIRED');
    });

    test('should poll and return when approved after waiting', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst
        .mockResolvedValueOnce(createMockApprovalRequest('PENDING'))
        .mockResolvedValueOnce(
          createMockApprovalRequest('APPROVED', { approverEmail: 'admin@example.com' }),
        );

      const result = await waitForApproval('org-1', 'request-1', 10000);

      expect(result.approved).toBe(true);
      expect(mockPrisma.sensitiveFlagApprovalRequest.findFirst).toHaveBeenCalledTimes(2);
    });

    test('should handle timeout and mark as expired', async () => {
      setupApprovalStatus('PENDING');
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await waitForApproval('org-1', 'request-1', 100);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TIMEOUT');
      expect(result.details?.status).toBe('EXPIRED');
      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', organizationId: 'org-1' },
        data: { status: 'EXPIRED' },
      });
    });
  });

  describe('evaluateSensitiveFlags - REQUIRE_APPROVAL behavior', () => {
    const mockCtx = createMockContext({
      toolName: 'github.com::deleteBranch',
      parameters: { branch: 'feature-branch' },
    });

    function createApprovalFlag(overrides: Partial<MockFlagOptions> = {}) {
      return createMockFlag({
        behaviors: ['REQUIRE_APPROVAL'] as SensitiveFlagBehavior[],
        rateLimitConfig: null,
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
        description: 'Requires approval',
        ...overrides,
      });
    }

    test('should block and wait for approval when REQUIRE_APPROVAL behavior is set', async () => {
      const mockFlag = createApprovalFlag({
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 1 },
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupApprovalCreation();
      // Set expiresAt in past so polling returns immediately with EXPIRED
      setupApprovalStatus('PENDING', { expiresAt: new Date(Date.now() - 1000) });
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toContain('EXPIRED');
      expect(result.approvalRequestId).toBe('approval-request-1');
      expect(result.approvalDetails?.approvalRequired).toBe(true);
    });

    test('should proceed when approval is granted', async () => {
      const mockFlag = createApprovalFlag();
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupApprovalCreation();
      setupApprovalStatus('APPROVED', { approverEmail: 'admin@example.com' });

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(true);
      expect(result.approvalDetails).toBeDefined();
      expect(result.approvalDetails?.approvalRequired).toBe(true);
      expect(result.approvalDetails?.approvalStatus).toBe('APPROVED');
      expect(result.approvalDetails?.approvalDecidedBy).toBe('admin-1');
      expect(result.approvalDetails?.approvalDecidedByEmail).toBe('admin@example.com');
    });

    test('should send alert when approval needed with ALERT behavior', async () => {
      const mockFlag = createApprovalFlag({
        behaviors: ['REQUIRE_APPROVAL', 'ALERT'] as SensitiveFlagBehavior[],
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 1 },
        alertConfig: { webhookEndpointIds: ['endpoint-1'] },
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupApprovalCreation();
      // Set expiresAt in past so polling returns immediately
      setupApprovalStatus('PENDING', { expiresAt: new Date(Date.now() - 1000) });
      mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

      await evaluateSensitiveFlags(mockCtx);

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-1',
        'SENSITIVE_APPROVAL_NEEDED',
        expect.objectContaining({
          requestId: 'approval-request-1',
          flagId: 'flag-1',
          toolName: 'github.com::deleteBranch',
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });

    test('should handle approval denied', async () => {
      const mockFlag = createApprovalFlag();
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupApprovalCreation();
      setupApprovalStatus('DENIED', { approverEmail: 'admin@example.com' });

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toContain('Approval required but DENIED');
      expect(result.approvalDetails?.approvalStatus).toBe('DENIED');
    });

    test('should handle combined RATE_LIMIT and REQUIRE_APPROVAL behaviors', async () => {
      const mockFlag = createApprovalFlag({
        behaviors: ['RATE_LIMIT', 'REQUIRE_APPROVAL'] as SensitiveFlagBehavior[],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        description: 'Rate limited and requires approval',
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupNoRateLimitUsage();
      mockPrisma.sensitiveFlagRateLimitUsage.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveFlagRateLimitUsage.create.mockResolvedValue({});
      setupApprovalCreation();
      setupApprovalStatus('APPROVED', { approverEmail: 'admin@example.com' });

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(true);
      expect(result.approvalDetails?.approvalStatus).toBe('APPROVED');
      expect(mockPrisma.sensitiveFlagRateLimitUsage.create).toHaveBeenCalled();
    });

    test('should block at rate limit before checking approval', async () => {
      const mockFlag = createApprovalFlag({
        behaviors: ['RATE_LIMIT', 'REQUIRE_APPROVAL'] as SensitiveFlagBehavior[],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        description: 'Rate limited and requires approval',
      });
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      setupRateLimitExceeded(10);

      const result = await evaluateSensitiveFlags(mockCtx);

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toContain('Rate limit exceeded');
      expect(mockPrisma.sensitiveFlagApprovalRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle missing approver email gracefully', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
        status: 'APPROVED',
        expiresAt: new Date(Date.now() + 60000),
        approvedBy: 'admin-1',
        approvedAt: new Date(),
        approver: null, // No approver user record
      });

      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(true);
      expect(result.details?.decidedBy).toBe('admin-1');
      expect(result.details?.decidedByEmail).toBeUndefined();
    });

    test('should handle null approvedAt gracefully', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
        status: 'APPROVED',
        expiresAt: new Date(Date.now() + 60000),
        approvedBy: null,
        approvedAt: null,
        approver: null,
      });

      const result = await waitForApproval('org-1', 'request-1', 1000);

      expect(result.approved).toBe(true);
      expect(result.details?.decidedBy).toBeUndefined();
      expect(result.details?.decidedAt).toBeUndefined();
    });

    test('getMatchingFlags should handle invalid rateLimitConfig', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { invalid: 'config' }, // Invalid config
        approvalConfig: null,
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR');

      expect(result).toHaveLength(1);
      expect(result[0].rateLimitConfig).toBeNull(); // Invalid config should be null
    });

    test('getMatchingFlags should handle invalid approvalConfig', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['REQUIRE_APPROVAL'],
        rateLimitConfig: null,
        approvalConfig: { invalid: 'config' }, // Invalid config
        alertConfig: null,
        description: 'Test flag',
        agentOverrides: [],
      };
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const result = await getMatchingFlags('org-1', 'github.com::createPR');

      expect(result).toHaveLength(1);
      expect(result[0].approvalConfig).toBeNull(); // Invalid config should be null
    });

    test('should sanitize nested sensitive parameters', async () => {
      const mockCtx = {
        organizationId: 'org-1',
        sessionId: 'session-1',
        userId: 'user-1',
        agentId: 'agent-1',
        toolName: 'github.com::createPR',
        parameters: {
          config: {
            apiKey: 'secret-key',
            nested: {
              password: 'nested-secret',
            },
          },
          normalParam: 'value',
        },
      };
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['REQUIRE_APPROVAL'] as SensitiveFlagBehavior[],
        rateLimitConfig: null,
        approvalConfig: {
          allowedApprovers: ['admin'] as ('session_owner' | 'admin')[],
          timeoutSeconds: 300,
        },
        alertConfig: null,
        description: null,
        createdAt: new Date(),
      };
      mockPrisma.sensitiveFlagApprovalRequest.create.mockResolvedValue({
        id: 'request-1',
      });

      await createApprovalRequest(mockCtx, mockFlag);

      const createCall = mockPrisma.sensitiveFlagApprovalRequest.create.mock.calls[0][0];
      expect(createCall.data.parameters).toMatchObject({
        config: {
          apiKey: '[REDACTED]',
          nested: {
            password: '[REDACTED]',
          },
        },
        normalParam: 'value',
      });
    });
  });
});
