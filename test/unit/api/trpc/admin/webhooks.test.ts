/**
 * Tests for Admin Webhooks Router
 * Tests webhook endpoint management and delivery operations
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createMockContext,
  createMockData,
  expectAdminActionLogged,
  expectBadRequest,
  expectConflict,
  expectNotFound,
  type TestableHandler,
} from '../../../../helpers/admin-router-test.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockGenerateWebhookSecret,
  mockSendTestWebhook,
  mockGetDeliveryHistory,
  mockIsValidSlackWebhookUrl,
  mockIsValidDiscordWebhookUrl,
} = vi.hoisted(() => ({
  mockPrisma: {
    webhookEndpoint: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockGenerateWebhookSecret: vi.fn(),
  mockSendTestWebhook: vi.fn(),
  mockGetDeliveryHistory: vi.fn(),
  mockIsValidSlackWebhookUrl: vi.fn(),
  mockIsValidDiscordWebhookUrl: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: null },
  WebhookEvent: {
    TOOL_INVOCATION_ALLOWED: 'TOOL_INVOCATION_ALLOWED',
    TOOL_INVOCATION_DENIED: 'TOOL_INVOCATION_DENIED',
    SENSITIVE_TOOL_INVOKED: 'SENSITIVE_TOOL_INVOKED',
    SENSITIVE_RATE_LIMITED: 'SENSITIVE_RATE_LIMITED',
    SENSITIVE_APPROVAL_NEEDED: 'SENSITIVE_APPROVAL_NEEDED',
  },
  WebhookEndpointType: {
    CUSTOM: 'CUSTOM',
    DISCORD: 'DISCORD',
    SLACK: 'SLACK',
    EMAIL: 'EMAIL',
  },
  AdminActionType: {
    WEBHOOK_ENDPOINT_CREATE: 'WEBHOOK_ENDPOINT_CREATE',
    WEBHOOK_ENDPOINT_UPDATE: 'WEBHOOK_ENDPOINT_UPDATE',
    WEBHOOK_ENDPOINT_DELETE: 'WEBHOOK_ENDPOINT_DELETE',
  },
  AdminResourceType: {
    WEBHOOK_ENDPOINT: 'WEBHOOK_ENDPOINT',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/webhook.js', () => ({
  generateWebhookSecret: mockGenerateWebhookSecret,
  sendTestWebhook: mockSendTestWebhook,
  getDeliveryHistory: mockGetDeliveryHistory,
  isValidSlackWebhookUrl: mockIsValidSlackWebhookUrl,
  isValidDiscordWebhookUrl: mockIsValidDiscordWebhookUrl,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
      output: vi.fn(() => ({
        mutation: vi.fn((fn) => (args: unknown) => fn(args)),
      })),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
  webhooksProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
      output: vi.fn(() => ({
        mutation: vi.fn((fn) => (args: unknown) => fn(args)),
      })),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { adminWebhooksRouter as _adminWebhooksRouter } from '../../../../../packages/api/src/trpc/admin/webhooks.js';

const adminWebhooksRouter = _adminWebhooksRouter as unknown as {
  create: TestableHandler;
  delete: TestableHandler;
  get: TestableHandler;
  getDelivery: TestableHandler;
  getSecret: TestableHandler;
  list: TestableHandler;
  listDeliveries: TestableHandler;
  retryDelivery: TestableHandler;
  rotateSecret: TestableHandler;
  test: TestableHandler;
  update: TestableHandler;
};

// Test data defaults
const endpointDefaults = {
  id: 'endpoint-1',
  name: 'My Webhook',
  url: 'https://example.com/webhook',
  events: ['TOOL_INVOCATION_ALLOWED'],
  enabled: true,
  type: 'CUSTOM',
  secret: 'secret123',
  maxRetries: 3,
  retryDelayMs: 1000,
};

const deliveryDefaults = {
  id: 'delivery-1',
  event: 'TOOL_INVOCATION_ALLOWED',
  deliveredAt: null,
  retryCount: 0,
  endpoint: {
    id: 'endpoint-1',
    name: 'My Webhook',
    url: 'https://example.com/webhook',
    organizationId: 'org-123',
  },
};

function createMockEndpoint(overrides: Record<string, unknown> = {}) {
  return createMockData(endpointDefaults, overrides);
}

function createMockDelivery(overrides: Record<string, unknown> = {}) {
  return createMockData(deliveryDefaults, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockGenerateWebhookSecret.mockReturnValue('secret123');
  mockGetDeliveryHistory.mockResolvedValue({ total: 0, deliveries: [] });
  mockIsValidSlackWebhookUrl.mockReturnValue(true);
  mockIsValidDiscordWebhookUrl.mockReturnValue(true);
});

describe('adminWebhooksRouter', () => {
  describe('list', () => {
    test('should list enabled endpoints by default', async () => {
      const mockEndpoints = [createMockEndpoint({ _count: { deliveries: 10 } })];
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue(mockEndpoints);

      const result = await adminWebhooksRouter.list({
        ctx: createMockContext(),
        input: {},
      });

      expect(result).toEqual(mockEndpoints);
      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 'org-123', enabled: true }),
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should include disabled endpoints when requested', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

      await adminWebhooksRouter.list({
        ctx: createMockContext(),
        input: { includeDisabled: true },
      });

      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 'org-123' }),
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('get', () => {
    test('should get endpoint by id with recent deliveries', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(createMockEndpoint());
      mockGetDeliveryHistory.mockResolvedValue({ total: 5, deliveries: [] });

      const result = await adminWebhooksRouter.get({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(result).toMatchObject({
        id: 'endpoint-1',
        recentDeliveries: [],
        totalDeliveries: 5,
      });
      expect(mockGetDeliveryHistory).toHaveBeenCalledWith('org-123', 'endpoint-1', { limit: 10 });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(
        () => adminWebhooksRouter.get({ ctx: createMockContext(), input: { id: 'nonexistent' } }),
        'Webhook endpoint not found',
      );
    });
  });

  describe('getSecret', () => {
    test('should return endpoint secret', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        secret: 'mysecret123',
        type: 'CUSTOM',
      });

      const result = await adminWebhooksRouter.getSecret({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(result).toEqual({ secret: 'mysecret123' });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.getSecret({ ctx: createMockContext(), input: { id: 'nonexistent' } }),
      );
    });

    test('should reject for non-CUSTOM endpoint types', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ secret: null, type: 'DISCORD' });

      await expectBadRequest(
        () =>
          adminWebhooksRouter.getSecret({ ctx: createMockContext(), input: { id: 'endpoint-1' } }),
        'Only custom webhooks have secrets',
      );
    });
  });

  describe('create', () => {
    test('should create a new endpoint', async () => {
      const newEndpoint = createMockEndpoint({ id: 'endpoint-new' });
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(newEndpoint);

      const result = await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expect(result).toMatchObject({ secret: 'secret123' });
      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          secret: 'secret123',
          createdBy: 'user-123',
        }),
      });
    });

    test('should throw CONFLICT when URL already exists', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'existing' });

      await expectConflict(() =>
        adminWebhooksRouter.create({
          ctx: createMockContext(),
          input: {
            name: 'My Webhook',
            url: 'https://example.com/webhook',
            events: ['TOOL_INVOCATION_ALLOWED'],
          },
        }),
      );
    });

    test('should use default maxRetries and retryDelayMs', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue({ id: 'endpoint-new' });

      await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ maxRetries: 3, retryDelayMs: 1000 }),
      });
    });

    test('should log admin action on create', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(
        createMockEndpoint({ id: 'endpoint-new' }),
      );

      await adminWebhooksRouter.create({
        ctx: createMockContext({ userId: 'admin-456' }),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expectAdminActionLogged(
        mockLogAdminAction,
        'WEBHOOK_ENDPOINT_CREATE',
        'WEBHOOK_ENDPOINT',
        'endpoint-new',
      );
    });
  });

  describe('update', () => {
    test('should update an endpoint', async () => {
      const existingEndpoint = createMockEndpoint({ name: 'Old Name' });
      const updatedEndpoint = createMockEndpoint({ name: 'New Name' });
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(existingEndpoint);
      mockPrisma.webhookEndpoint.update.mockResolvedValue(updatedEndpoint);

      const result = await adminWebhooksRouter.update({
        ctx: createMockContext(),
        input: { id: 'endpoint-1', name: 'New Name' },
      });

      expect(result).toMatchObject({ name: 'New Name', secret: undefined });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.update({
          ctx: createMockContext(),
          input: { id: 'nonexistent', name: 'New Name' },
        }),
      );
    });

    test('should throw CONFLICT when updating to existing URL', async () => {
      mockPrisma.webhookEndpoint.findFirst
        .mockResolvedValueOnce({
          id: 'endpoint-1',
          url: 'https://old.example.com/webhook',
          type: 'CUSTOM',
        })
        .mockResolvedValueOnce({ id: 'endpoint-2' });

      await expectConflict(() =>
        adminWebhooksRouter.update({
          ctx: createMockContext(),
          input: { id: 'endpoint-1', url: 'https://duplicate.example.com/webhook' },
        }),
      );
    });

    test('should not check for duplicates when URL unchanged', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(createMockEndpoint());
      mockPrisma.webhookEndpoint.update.mockResolvedValue(createMockEndpoint());

      await adminWebhooksRouter.update({
        ctx: createMockContext(),
        input: { id: 'endpoint-1', url: 'https://example.com/webhook', name: 'New Name' },
      });

      expect(mockPrisma.webhookEndpoint.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('rotateSecret', () => {
    test('should rotate endpoint secret', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        name: 'My Webhook',
        type: 'CUSTOM',
      });
      mockPrisma.webhookEndpoint.update.mockResolvedValue({});
      mockGenerateWebhookSecret.mockReturnValue('newsecret456');

      const result = await adminWebhooksRouter.rotateSecret({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(result).toEqual({ secret: 'newsecret456' });
      expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'endpoint-1' },
        data: { secret: 'newsecret456' },
      });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.rotateSecret({
          ctx: createMockContext(),
          input: { id: 'nonexistent' },
        }),
      );
    });

    test('should reject for non-CUSTOM endpoint types', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        name: 'My Slack Webhook',
        type: 'SLACK',
      });

      await expectBadRequest(
        () =>
          adminWebhooksRouter.rotateSecret({
            ctx: createMockContext(),
            input: { id: 'endpoint-1' },
          }),
        'Only custom webhooks have secrets that can be rotated',
      );
    });

    test('should log admin action on secret rotation', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        name: 'My Webhook',
        type: 'CUSTOM',
      });
      mockPrisma.webhookEndpoint.update.mockResolvedValue({});

      await adminWebhooksRouter.rotateSecret({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'WEBHOOK_ENDPOINT_UPDATE',
          actionDetails: expect.objectContaining({ action: 'secret_rotated' }),
        }),
      );
    });
  });

  describe('delete', () => {
    test('should delete an endpoint', async () => {
      const mockEndpoint = createMockEndpoint();
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockPrisma.webhookEndpoint.delete.mockResolvedValue(mockEndpoint);

      const result = await adminWebhooksRouter.delete({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.webhookEndpoint.delete).toHaveBeenCalledWith({
        where: { id: 'endpoint-1' },
      });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.delete({ ctx: createMockContext(), input: { id: 'nonexistent' } }),
      );
    });

    test('should log admin action on delete', async () => {
      const mockEndpoint = createMockEndpoint();
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockPrisma.webhookEndpoint.delete.mockResolvedValue(mockEndpoint);

      await adminWebhooksRouter.delete({ ctx: createMockContext(), input: { id: 'endpoint-1' } });

      expectAdminActionLogged(
        mockLogAdminAction,
        'WEBHOOK_ENDPOINT_DELETE',
        'WEBHOOK_ENDPOINT',
        'endpoint-1',
      );
    });
  });

  describe('test', () => {
    test('should send test webhook', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        name: 'My Webhook',
      });
      mockSendTestWebhook.mockResolvedValue({
        success: true,
        responseStatus: 200,
        responseBody: 'OK',
      });

      const result = await adminWebhooksRouter.test({
        ctx: createMockContext(),
        input: { id: 'endpoint-1' },
      });

      expect(result).toEqual({ success: true, responseStatus: 200, responseBody: 'OK' });
      expect(mockSendTestWebhook).toHaveBeenCalledWith('org-123', 'endpoint-1');
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.test({ ctx: createMockContext(), input: { id: 'nonexistent' } }),
      );
    });
  });

  describe('listDeliveries', () => {
    test('should list deliveries for an endpoint', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'endpoint-1' });
      mockGetDeliveryHistory.mockResolvedValue({ total: 10, deliveries: [] });

      const result = await adminWebhooksRouter.listDeliveries({
        ctx: createMockContext(),
        input: { endpointId: 'endpoint-1' },
      });

      expect(result).toEqual({ total: 10, deliveries: [] });
      expect(mockGetDeliveryHistory).toHaveBeenCalledWith('org-123', 'endpoint-1', {
        event: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    test('should pass filter options', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'endpoint-1' });
      mockGetDeliveryHistory.mockResolvedValue({ total: 0, deliveries: [] });

      await adminWebhooksRouter.listDeliveries({
        ctx: createMockContext(),
        input: {
          endpointId: 'endpoint-1',
          event: 'TOOL_INVOCATION_ALLOWED',
          limit: 20,
          offset: 10,
        },
      });

      expect(mockGetDeliveryHistory).toHaveBeenCalledWith('org-123', 'endpoint-1', {
        event: 'TOOL_INVOCATION_ALLOWED',
        limit: 20,
        offset: 10,
      });
    });

    test('should throw NOT_FOUND when endpoint does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.listDeliveries({
          ctx: createMockContext(),
          input: { endpointId: 'nonexistent' },
        }),
      );
    });
  });

  describe('getDelivery', () => {
    test('should get delivery by id', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(createMockDelivery());

      const result = await adminWebhooksRouter.getDelivery({
        ctx: createMockContext(),
        input: { id: 'delivery-1' },
      });

      expect(result.id).toBe('delivery-1');
    });

    test('should throw NOT_FOUND when delivery does not exist', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.getDelivery({ ctx: createMockContext(), input: { id: 'nonexistent' } }),
      );
    });

    test('should throw NOT_FOUND when delivery belongs to different org', async () => {
      // With query-time org scoping, a delivery from a different org won't be found
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.getDelivery({ ctx: createMockContext(), input: { id: 'delivery-1' } }),
      );
    });
  });

  describe('retryDelivery', () => {
    test('should retry a failed delivery', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(createMockDelivery());
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await adminWebhooksRouter.retryDelivery({
        ctx: createMockContext(),
        input: { id: 'delivery-1' },
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { nextRetryAt: expect.any(Date), failedAt: null },
      });
    });

    test('should throw NOT_FOUND when delivery does not exist', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.retryDelivery({
          ctx: createMockContext(),
          input: { id: 'nonexistent' },
        }),
      );
    });

    test('should throw BAD_REQUEST when delivery was successful', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(
        createMockDelivery({ deliveredAt: new Date() }),
      );

      await expectBadRequest(
        () =>
          adminWebhooksRouter.retryDelivery({
            ctx: createMockContext(),
            input: { id: 'delivery-1' },
          }),
        'Cannot retry a successfully delivered webhook',
      );
    });

    test('should throw NOT_FOUND when delivery belongs to different org', async () => {
      // With query-time org scoping, a delivery from a different org won't be found
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expectNotFound(() =>
        adminWebhooksRouter.retryDelivery({
          ctx: createMockContext(),
          input: { id: 'delivery-1' },
        }),
      );
    });

    test('should log admin action with delivery details', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(
        createMockDelivery({ retryCount: 2, event: 'TOOL_INVOCATION_ALLOWED' }),
      );
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await adminWebhooksRouter.retryDelivery({
        ctx: createMockContext(),
        input: { id: 'delivery-1' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'WEBHOOK_ENDPOINT_UPDATE',
          resourceId: 'endpoint-1',
          actionDetails: expect.objectContaining({
            action: 'retry_delivery',
            deliveryId: 'delivery-1',
            event: 'TOOL_INVOCATION_ALLOWED',
            previousRetryCount: 2,
          }),
        }),
      );
    });
  });

  describe('create - type-specific validation', () => {
    const typeValidationTests = [
      { type: 'CUSTOM', missingField: 'url', message: 'URL is required for custom webhooks' },
      { type: 'DISCORD', missingField: 'url', message: 'URL is required for discord webhooks' },
      { type: 'SLACK', missingField: 'url', message: 'URL is required for slack webhooks' },
      {
        type: 'EMAIL',
        missingField: 'config',
        message: 'Email recipients are required for email webhooks',
      },
    ];

    for (const { type, message } of typeValidationTests) {
      test(`should reject ${type} type without required field`, async () => {
        await expectBadRequest(
          () =>
            adminWebhooksRouter.create({
              ctx: createMockContext(),
              input: { name: 'My Webhook', type, events: ['TOOL_INVOCATION_ALLOWED'] },
            }),
          message,
        );
      });
    }

    test('should reject DISCORD type with invalid URL format', async () => {
      mockIsValidDiscordWebhookUrl.mockReturnValue(false);

      await expectBadRequest(
        () =>
          adminWebhooksRouter.create({
            ctx: createMockContext(),
            input: {
              name: 'My Webhook',
              type: 'DISCORD',
              url: 'https://example.com/webhook',
              events: ['TOOL_INVOCATION_ALLOWED'],
            },
          }),
        'Invalid Discord webhook URL',
      );
    });

    test('should reject SLACK type with invalid URL format', async () => {
      mockIsValidSlackWebhookUrl.mockReturnValue(false);

      await expectBadRequest(
        () =>
          adminWebhooksRouter.create({
            ctx: createMockContext(),
            input: {
              name: 'My Webhook',
              type: 'SLACK',
              url: 'https://example.com/webhook',
              events: ['TOOL_INVOCATION_ALLOWED'],
            },
          }),
        'Invalid Slack webhook URL',
      );
    });

    test('should reject EMAIL type with empty config', async () => {
      await expectBadRequest(
        () =>
          adminWebhooksRouter.create({
            ctx: createMockContext(),
            input: {
              name: 'My Webhook',
              type: 'EMAIL',
              events: ['TOOL_INVOCATION_ALLOWED'],
              config: null,
            },
          }),
        'Email recipients are required for email webhooks',
      );
    });

    test('should create EMAIL endpoint with valid recipients', async () => {
      const mockEndpoint = createMockEndpoint({
        id: 'endpoint-new',
        type: 'EMAIL',
        url: null,
        config: { recipients: ['user@example.com'] },
        secret: null,
      });
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(mockEndpoint);

      const result = await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'Email Webhook',
          type: 'EMAIL',
          events: ['TOOL_INVOCATION_ALLOWED'],
          config: { recipients: ['user@example.com'] },
        },
      });

      expect(result.type).toBe('EMAIL');
      expect(result.secret).toBeUndefined();
    });

    test('should not generate secret for non-CUSTOM types', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(
        createMockEndpoint({
          type: 'EMAIL',
          secret: null,
          url: null,
          config: { recipients: ['user@example.com'] },
        }),
      );

      await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'Email Webhook',
          type: 'EMAIL',
          events: ['TOOL_INVOCATION_ALLOWED'],
          config: { recipients: ['user@example.com'] },
        },
      });

      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ secret: null }),
      });
    });

    test('should set verbose flag when provided', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue({ id: 'endpoint-new' });

      await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
          verbose: true,
        },
      });

      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ verbose: true }),
      });
    });
  });

  describe('update - URL validation by type', () => {
    test('should reject invalid Discord URL on update', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        url: 'https://discord.com/api/webhooks/123/abc',
        type: 'DISCORD',
      });
      mockIsValidDiscordWebhookUrl.mockReturnValue(false);

      await expectBadRequest(
        () =>
          adminWebhooksRouter.update({
            ctx: createMockContext(),
            input: { id: 'endpoint-1', url: 'https://example.com/webhook' },
          }),
        'Invalid Discord webhook URL',
      );
    });

    test('should reject invalid Slack URL on update', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        url: 'https://hooks.slack.com/services/T00/B00/xxx',
        type: 'SLACK',
      });
      mockIsValidSlackWebhookUrl.mockReturnValue(false);

      await expectBadRequest(
        () =>
          adminWebhooksRouter.update({
            ctx: createMockContext(),
            input: { id: 'endpoint-1', url: 'https://example.com/webhook' },
          }),
        'Invalid Slack webhook URL',
      );
    });

    test('should allow valid Discord URL on update', async () => {
      mockPrisma.webhookEndpoint.findFirst
        .mockResolvedValueOnce({
          id: 'endpoint-1',
          url: 'https://discord.com/api/webhooks/old/old',
          type: 'DISCORD',
        })
        .mockResolvedValueOnce(null);
      mockPrisma.webhookEndpoint.update.mockResolvedValue({
        url: 'https://discord.com/api/webhooks/new/new',
      });

      const result = await adminWebhooksRouter.update({
        ctx: createMockContext(),
        input: { id: 'endpoint-1', url: 'https://discord.com/api/webhooks/new/new' },
      });

      expect(result.url).toBe('https://discord.com/api/webhooks/new/new');
    });

    test('should allow discordapp.com URL variant', async () => {
      mockPrisma.webhookEndpoint.findFirst
        .mockResolvedValueOnce({
          id: 'endpoint-1',
          url: 'https://discord.com/api/webhooks/old/old',
          type: 'DISCORD',
        })
        .mockResolvedValueOnce(null);
      mockPrisma.webhookEndpoint.update.mockResolvedValue({
        url: 'https://discordapp.com/api/webhooks/new/new',
      });

      const result = await adminWebhooksRouter.update({
        ctx: createMockContext(),
        input: { id: 'endpoint-1', url: 'https://discordapp.com/api/webhooks/new/new' },
      });

      expect(result.url).toBe('https://discordapp.com/api/webhooks/new/new');
    });

    test('should update config for EMAIL type', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'endpoint-1',
        type: 'EMAIL',
        url: null,
        config: { recipients: ['old@example.com'] },
      });
      mockPrisma.webhookEndpoint.update.mockResolvedValue({
        config: { recipients: ['new@example.com'] },
      });

      await adminWebhooksRouter.update({
        ctx: createMockContext(),
        input: { id: 'endpoint-1', config: { recipients: ['new@example.com'] } },
      });

      expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ config: { recipients: ['new@example.com'] } }),
        }),
      );
    });
  });

  describe('organization isolation', () => {
    test('list should only return endpoints from current organization', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

      await adminWebhooksRouter.list({
        ctx: createMockContext({ organizationId: 'isolated-org' }),
        input: {},
      });

      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'isolated-org' }),
        }),
      );
    });

    test('create should assign to current organization', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue({ id: 'endpoint-new' });

      await adminWebhooksRouter.create({
        ctx: createMockContext({ organizationId: 'org-A' }),
        input: {
          name: 'Test',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-A' }),
      });
    });
  });

  describe('type guard functions via schema validation', () => {
    // Note: Tests for rejecting invalid webhook event/endpoint types require Zod validation
    // which is bypassed by the test mocks. These are covered by integration tests instead.

    test('should accept valid webhook event types', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(
        createMockEndpoint({
          events: ['TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED', 'SENSITIVE_TOOL_INVOKED'],
        }),
      );

      const result = await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED', 'SENSITIVE_TOOL_INVOKED'],
        },
      });

      expect(result).toBeDefined();
    });

    test('should accept valid webhook endpoint types', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(createMockEndpoint({ type: 'CUSTOM' }));

      const result = await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
          type: 'CUSTOM',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('validateUrlForType - SLACK validation', () => {
    test('should call isValidSlackWebhookUrl for SLACK type on create', async () => {
      mockIsValidSlackWebhookUrl.mockReturnValue(true);
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      mockPrisma.webhookEndpoint.create.mockResolvedValue(
        createMockEndpoint({ type: 'SLACK', url: 'https://hooks.slack.com/services/T00/B00/xxx' }),
      );

      await adminWebhooksRouter.create({
        ctx: createMockContext(),
        input: {
          name: 'Slack Webhook',
          url: 'https://hooks.slack.com/services/T00/B00/xxx',
          type: 'SLACK',
          events: ['TOOL_INVOCATION_ALLOWED'],
        },
      });

      expect(mockIsValidSlackWebhookUrl).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/xxx',
      );
    });

    test('should reject SLACK type with invalid Slack URL format', async () => {
      mockIsValidSlackWebhookUrl.mockReturnValue(false);

      await expectBadRequest(
        () =>
          adminWebhooksRouter.create({
            ctx: createMockContext(),
            input: {
              name: 'Slack Webhook',
              url: 'https://not-slack.com/webhook',
              type: 'SLACK',
              events: ['TOOL_INVOCATION_ALLOWED'],
            },
          }),
        'Invalid Slack webhook URL. Must be https://hooks.slack.com/services/...',
      );
    });
  });
});
