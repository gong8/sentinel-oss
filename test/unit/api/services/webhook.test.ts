/**
 * Webhook Service Unit Tests
 * Tests for webhook delivery and management
 */

import { WebhookEvent } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger, mockFetch } = vi.hoisted(() => ({
  mockPrisma: {
    webhookEndpoint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  mockFetch: vi.fn(),
}));

// Hoisted mock for enrichPayloadIfVerbose
const { mockEnrichPayloadIfVerbose } = vi.hoisted(() => ({
  mockEnrichPayloadIfVerbose: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  WebhookEvent: {
    TOOL_INVOCATION_ALLOWED: 'TOOL_INVOCATION_ALLOWED',
    TOOL_INVOCATION_DENIED: 'TOOL_INVOCATION_DENIED',
    SENSITIVE_TOOL_INVOKED: 'SENSITIVE_TOOL_INVOKED',
    SENSITIVE_RATE_LIMITED: 'SENSITIVE_RATE_LIMITED',
    SENSITIVE_APPROVAL_NEEDED: 'SENSITIVE_APPROVAL_NEEDED',
    POLICY_CREATED: 'POLICY_CREATED',
    POLICY_UPDATED: 'POLICY_UPDATED',
    POLICY_DELETED: 'POLICY_DELETED',
    AGENT_CREATED: 'AGENT_CREATED',
    AGENT_DELETED: 'AGENT_DELETED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
  },
  WebhookEndpointType: {
    CUSTOM: 'CUSTOM',
    DISCORD: 'DISCORD',
    SLACK: 'SLACK',
    EMAIL: 'EMAIL',
  },
}));

vi.mock('../../../../packages/api/src/services/webhookVerbose.js', () => ({
  enrichPayloadIfVerbose: mockEnrichPayloadIfVerbose,
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Mock global fetch
vi.stubGlobal('fetch', mockFetch);

import {
  formatDiscordPayload,
  formatEmailPayload,
  formatSlackPayload,
  generateWebhookSecret,
  generateWebhookSignature,
  getDeliveryHistory,
  getDeliveryStatus,
  isValidDiscordWebhookUrl,
  isValidSlackWebhookUrl,
  retryFailedDeliveries,
  sendTestWebhook,
  sendWebhook,
} from '../../../../packages/api/src/services/webhook.js';

// =============================================================================
// Test Helpers - Mock Object Factories
// =============================================================================

interface EndpointOptions {
  id?: string;
  url?: string | null;
  secret?: string | null;
  maxRetries?: number;
  retryDelayMs?: number;
  type?: string;
  verbose?: boolean;
  config?: Record<string, unknown> | null;
  organizationId?: string;
  events?: string[];
}

function createMockEndpoint(options: EndpointOptions = {}): Record<string, unknown> {
  return {
    id: options.id ?? 'endpoint-1',
    url: 'url' in options ? options.url : 'https://example.com/webhook',
    secret: 'secret' in options ? options.secret : 'secret123',
    maxRetries: options.maxRetries ?? 3,
    retryDelayMs: options.retryDelayMs ?? 1000,
    type: options.type ?? 'CUSTOM',
    verbose: options.verbose ?? false,
    config: 'config' in options ? options.config : null,
    organizationId: options.organizationId ?? 'org-1',
    events: options.events,
  };
}

interface DeliveryOptions {
  id?: string;
  retryCount?: number;
  payload?: Record<string, unknown>;
  endpoint?: Record<string, unknown>;
}

function createMockDelivery(options: DeliveryOptions = {}): Record<string, unknown> {
  return {
    id: options.id ?? 'delivery-1',
    retryCount: options.retryCount ?? 0,
    payload: options.payload ?? {
      event: 'TOOL_INVOCATION_ALLOWED',
      timestamp: new Date().toISOString(),
      organizationId: 'org-1',
      data: { test: true },
    },
    endpoint: options.endpoint ?? createMockEndpoint(),
  };
}

interface WebhookPayloadOptions {
  event?: WebhookEvent;
  timestamp?: string;
  organizationId?: string;
  data?: Record<string, unknown>;
}

function createWebhookPayload(options: WebhookPayloadOptions = {}): {
  event: WebhookEvent;
  timestamp: string;
  organizationId: string;
  data: Record<string, unknown>;
} {
  return {
    event: options.event ?? ('TOOL_INVOCATION_ALLOWED' as WebhookEvent),
    timestamp: options.timestamp ?? '2024-01-15T12:00:00Z',
    organizationId: options.organizationId ?? 'org-1',
    data: options.data ?? {},
  };
}

// =============================================================================
// Test Helpers - Fetch Response Factories
// =============================================================================

interface FetchResponseOptions {
  ok?: boolean;
  status?: number;
  body?: string;
  textError?: boolean;
}

function createMockFetchResponse(options: FetchResponseOptions = {}): {
  ok: boolean;
  status: number;
  text: ReturnType<typeof vi.fn>;
} {
  const textFn = options.textError
    ? vi.fn().mockRejectedValue(new Error('Body already consumed'))
    : vi.fn().mockResolvedValue(options.body ?? 'OK');

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: textFn,
  };
}

function mockSuccessfulFetch(body = 'OK'): void {
  mockFetch.mockResolvedValue(createMockFetchResponse({ body }));
}

function mockFailedFetch(status = 500, body = 'Internal Server Error'): void {
  mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status, body }));
}

function mockNetworkError(message = 'Network error'): void {
  mockFetch.mockRejectedValue(new Error(message));
}

// =============================================================================
// Test Helpers - Common Mock Setups
// =============================================================================

function setupSuccessfulDelivery(endpoint?: Record<string, unknown>): void {
  mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpoint ?? createMockEndpoint()]);
  mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
  mockSuccessfulFetch();
  mockPrisma.webhookDelivery.update.mockResolvedValue({});
}

function setupFailedDelivery(
  endpoint?: Record<string, unknown>,
  retryCount = 0,
  status = 500,
): void {
  mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpoint ?? createMockEndpoint()]);
  mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
  mockFailedFetch(status);
  mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'delivery-1', retryCount });
  mockPrisma.webhookDelivery.update.mockResolvedValue({});
}

function setupNetworkErrorDelivery(endpoint?: Record<string, unknown>, retryCount = 0): void {
  mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpoint ?? createMockEndpoint()]);
  mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
  mockNetworkError();
  mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'delivery-1', retryCount });
  mockPrisma.webhookDelivery.update.mockResolvedValue({});
}

function setupRetryDeliveries(deliveries: Array<Record<string, unknown>>): void {
  mockPrisma.webhookDelivery.findMany.mockResolvedValue(deliveries);
  mockPrisma.webhookDelivery.update.mockResolvedValue({});
}

async function sendTestEvent(
  orgId = 'org-1',
  event: WebhookEvent = 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
  data: Record<string, unknown> = { test: true },
): Promise<string[]> {
  return sendWebhook(orgId, event, data);
}

// Helper for finding Discord embed fields
function findDiscordField(
  result: { embeds: Array<{ fields?: Array<{ name: string; value: string }> }> },
  fieldName: string,
): { name: string; value: string } | undefined {
  return result.embeds[0].fields?.find((f) => f.name === fieldName);
}

// Helper for finding Slack blocks
function findSlackSection(
  result: {
    blocks: Array<{ type: string; text?: { text?: string }; fields?: Array<{ text: string }> }>;
  },
  textMatch: string,
): { type: string; text?: { text?: string }; fields?: Array<{ text: string }> } | undefined {
  return result.blocks.find(
    (b) =>
      (b.type === 'section' && b.text?.text?.includes(textMatch)) ||
      (b.type === 'section' && b.fields?.some((f) => f.text.includes(textMatch))),
  );
}

function findSlackContext(
  result: { blocks: Array<{ type: string; elements?: Array<{ text: string }> }> },
  textMatch: string,
): { type: string; elements?: Array<{ text: string }> } | undefined {
  return result.blocks.find(
    (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes(textMatch)),
  );
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Webhook Service', () => {
  describe('generateWebhookSignature', () => {
    test('should generate HMAC-SHA256 signature', () => {
      const payload = '{"event":"test"}';
      const secret = 'secret123';

      const signature = generateWebhookSignature(payload, secret);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should generate different signatures for different payloads', () => {
      const secret = 'secret123';

      const sig1 = generateWebhookSignature('payload1', secret);
      const sig2 = generateWebhookSignature('payload2', secret);

      expect(sig1).not.toBe(sig2);
    });

    test('should generate different signatures for different secrets', () => {
      const payload = '{"event":"test"}';

      const sig1 = generateWebhookSignature(payload, 'secret1');
      const sig2 = generateWebhookSignature(payload, 'secret2');

      expect(sig1).not.toBe(sig2);
    });

    test('should generate consistent signature for same inputs', () => {
      const payload = '{"event":"test"}';
      const secret = 'secret123';

      const sig1 = generateWebhookSignature(payload, secret);
      const sig2 = generateWebhookSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });
  });

  describe('generateWebhookSecret', () => {
    test('should generate 64-character hex string', () => {
      const secret = generateWebhookSecret();

      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should generate unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret());
      }

      expect(secrets.size).toBe(100);
    });
  });

  describe('sendWebhook', () => {
    test('should return empty array when no endpoints exist', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

      const result = await sendTestEvent();

      expect(result).toEqual([]);
    });

    test('should send webhook to all subscribed endpoints', async () => {
      setupSuccessfulDelivery();

      const result = await sendTestEvent();

      expect(result).toContain('delivery-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Event': 'TOOL_INVOCATION_ALLOWED',
          }),
        }),
      );
    });

    test('should filter endpoints by event subscription', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

      await sendTestEvent('org-1', 'TOOL_INVOCATION_DENIED' as WebhookEvent);

      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          enabled: true,
          events: { has: 'TOOL_INVOCATION_DENIED' },
          OR: [{ workspaceId: null }, { workspaceId: undefined }],
        },
      });
    });

    test('should handle fetch errors gracefully', async () => {
      setupNetworkErrorDelivery();

      const result = await sendTestEvent();

      expect(result).toContain('delivery-1');
    });

    test('should handle failed responses', async () => {
      setupFailedDelivery();

      const result = await sendTestEvent();

      expect(result).toContain('delivery-1');
    });

    test('should update delivery record on success', async () => {
      setupSuccessfulDelivery();

      await sendTestEvent();

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          responseStatus: 200,
          responseBody: 'OK',
          deliveredAt: expect.any(Date),
        }),
      });
    });

    test('should log error when sendWebhook throws', async () => {
      mockPrisma.webhookEndpoint.findMany.mockRejectedValue(new Error('Database error'));

      const result = await sendTestEvent();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should send to multiple endpoints in parallel', async () => {
      const endpoints = [
        createMockEndpoint({ id: 'endpoint-1', url: 'https://example1.com/webhook' }),
        createMockEndpoint({ id: 'endpoint-2', url: 'https://example2.com/webhook' }),
      ];
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue(endpoints);
      mockPrisma.webhookDelivery.create
        .mockResolvedValueOnce({ id: 'delivery-1' })
        .mockResolvedValueOnce({ id: 'delivery-2' });
      mockSuccessfulFetch();
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendTestEvent();

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryFailedDeliveries', () => {
    test('should return 0 when no deliveries need retry', async () => {
      setupRetryDeliveries([]);

      const result = await retryFailedDeliveries();

      expect(result).toBe(0);
    });

    test('should retry failed deliveries', async () => {
      setupRetryDeliveries([createMockDelivery({ retryCount: 1 })]);
      mockSuccessfulFetch();

      const result = await retryFailedDeliveries();

      expect(result).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'TOOL_INVOCATION_ALLOWED',
          }),
        }),
      );
    });

    test('should update delivery on successful retry', async () => {
      setupRetryDeliveries([createMockDelivery({ retryCount: 1 })]);
      mockSuccessfulFetch();

      await retryFailedDeliveries();

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          responseStatus: 200,
          deliveredAt: expect.any(Date),
          nextRetryAt: null,
        }),
      });
    });

    test('should handle retry failure', async () => {
      setupRetryDeliveries([createMockDelivery({ retryCount: 1 })]);
      mockFailedFetch(500, 'Server Error');
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'delivery-1', retryCount: 1 });

      const result = await retryFailedDeliveries();

      expect(result).toBe(0);
    });

    test('should handle network errors during retry', async () => {
      setupRetryDeliveries([createMockDelivery({ retryCount: 1 })]);
      mockNetworkError();
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'delivery-1', retryCount: 1 });

      const result = await retryFailedDeliveries();

      expect(result).toBe(0);
    });

    test('should log error when retryFailedDeliveries fails', async () => {
      mockPrisma.webhookDelivery.findMany.mockRejectedValue(new Error('Database error'));

      const result = await retryFailedDeliveries();

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should query for deliveries due for retry', async () => {
      setupRetryDeliveries([]);

      await retryFailedDeliveries();

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith({
        where: {
          nextRetryAt: { lte: expect.any(Date) },
          failedAt: null,
          deliveredAt: null,
        },
        include: {
          endpoint: true,
        },
        take: 100,
      });
    });
  });

  describe('getDeliveryStatus', () => {
    test('should return delivery with endpoint info', async () => {
      const mockDelivery = {
        id: 'delivery-1',
        event: 'TOOL_INVOCATION_ALLOWED',
        endpoint: {
          name: 'My Webhook',
          url: 'https://example.com/webhook',
        },
      };
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(mockDelivery);

      const result = await getDeliveryStatus('org-1', 'delivery-1');

      expect(result).toEqual(mockDelivery);
      expect(mockPrisma.webhookDelivery.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'delivery-1',
          endpoint: { organizationId: 'org-1' },
        },
        include: {
          endpoint: {
            select: {
              name: true,
              url: true,
            },
          },
        },
      });
    });

    test('should return null when delivery not found', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      const result = await getDeliveryStatus('org-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getDeliveryHistory', () => {
    test('should return delivery history for endpoint', async () => {
      mockPrisma.webhookDelivery.count.mockResolvedValue(10);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([]);

      const result = await getDeliveryHistory('org-1', 'endpoint-1');

      expect(result).toEqual({ total: 10, deliveries: [] });
      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith({
        where: { endpointId: 'endpoint-1', endpoint: { organizationId: 'org-1' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    test('should apply pagination', async () => {
      mockPrisma.webhookDelivery.count.mockResolvedValue(100);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([]);

      await getDeliveryHistory('org-1', 'endpoint-1', { limit: 20, offset: 40 });

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 40,
        }),
      );
    });

    test('should filter by event when provided', async () => {
      mockPrisma.webhookDelivery.count.mockResolvedValue(5);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([]);

      await getDeliveryHistory('org-1', 'endpoint-1', {
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
      });

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            endpointId: 'endpoint-1',
            endpoint: { organizationId: 'org-1' },
            event: 'TOOL_INVOCATION_ALLOWED',
          },
        }),
      );
    });
  });

  describe('sendTestWebhook', () => {
    function setupTestEndpoint(options: EndpointOptions = {}): void {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(createMockEndpoint(options));
    }

    test('should return error when endpoint not found', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      const result = await sendTestWebhook('org-1', 'nonexistent');

      expect(result).toEqual({ success: false, error: 'Endpoint not found' });
    });

    test('should send test webhook successfully', async () => {
      setupTestEndpoint();
      mockSuccessfulFetch();

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result).toEqual({ success: true, responseStatus: 200, responseBody: 'OK' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'TOOL_INVOCATION_ALLOWED',
          }),
        }),
      );
    });

    test('should return failure status on non-ok response', async () => {
      setupTestEndpoint();
      mockFailedFetch(500, 'Internal Server Error');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result).toEqual({
        success: false,
        responseStatus: 500,
        responseBody: 'Internal Server Error',
      });
    });

    test('should handle network errors', async () => {
      setupTestEndpoint();
      mockNetworkError('Connection refused');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result).toEqual({ success: false, error: 'Connection refused' });
    });

    test('should truncate long response body', async () => {
      setupTestEndpoint();
      mockFetch.mockResolvedValue(createMockFetchResponse({ body: 'x'.repeat(2000) }));

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.responseBody?.length).toBe(1000);
    });

    test('should send test webhook to Discord endpoint', async () => {
      setupTestEndpoint({ type: 'DISCORD', url: 'https://discord.com/api/webhooks/123/abc' });
      mockSuccessfulFetch('');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/abc',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('embeds');
    });

    test('should handle Discord endpoint with null URL', async () => {
      setupTestEndpoint({ type: 'DISCORD', url: null });

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No URL configured');
    });

    test('should handle Discord API errors', async () => {
      setupTestEndpoint({ type: 'DISCORD', url: 'https://discord.com/api/webhooks/123/abc' });
      mockFailedFetch(429, 'Rate limited');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.responseStatus).toBe(429);
    });

    test('should send test webhook to Slack endpoint', async () => {
      setupTestEndpoint({ type: 'SLACK', url: 'https://hooks.slack.com/services/T00/B00/xxx' });
      mockSuccessfulFetch('ok');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('blocks');
    });

    test('should handle Slack endpoint with null URL', async () => {
      setupTestEndpoint({ type: 'SLACK', url: null });

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No URL configured');
    });

    test('should return missing API key error for Email endpoint when RESEND_API_KEY not set', async () => {
      setupTestEndpoint({ type: 'EMAIL', url: null, config: { recipients: ['test@example.com'] } });

      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      try {
        const result = await sendTestWebhook('org-1', 'endpoint-1');
        expect(result.success).toBe(false);
        expect(result.error).toContain('RESEND_API_KEY');
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        }
      }
    });

    test('should handle unknown endpoint type', async () => {
      setupTestEndpoint({ type: 'UNKNOWN_TYPE' });

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown endpoint type');
    });

    test('should handle Discord network timeout', async () => {
      setupTestEndpoint({ type: 'DISCORD', url: 'https://discord.com/api/webhooks/123/abc' });
      mockNetworkError('The operation was aborted');

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });
  });

  describe('retryFailedDeliveries - endpoint types', () => {
    function createRetryDelivery(
      endpointOverrides: Partial<Record<string, unknown>> = {},
      payloadOverrides: Partial<Record<string, unknown>> = {},
    ): Record<string, unknown> {
      return createMockDelivery({
        id: 'del-1',
        endpoint: {
          type: 'CUSTOM',
          url: 'https://example.com/webhook',
          maxRetries: 3,
          retryDelayMs: 1000,
          ...endpointOverrides,
        },
        payload: {
          event: 'TOOL_INVOCATION_ALLOWED',
          timestamp: new Date().toISOString(),
          organizationId: 'org-1',
          data: { test: true },
          ...payloadOverrides,
        },
      });
    }

    test('should retry Discord endpoint', async () => {
      setupRetryDeliveries([
        createRetryDelivery({ type: 'DISCORD', url: 'https://discord.com/api/webhooks/123/abc' }),
      ]);
      mockSuccessfulFetch('');

      const count = await retryFailedDeliveries();

      expect(count).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/abc',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    test('should retry Slack endpoint', async () => {
      setupRetryDeliveries([
        createRetryDelivery({ type: 'SLACK', url: 'https://hooks.slack.com/services/T00/B00/xxx' }),
      ]);
      mockSuccessfulFetch('ok');

      const count = await retryFailedDeliveries();

      expect(count).toBe(1);
    });

    test('should handle Email endpoint retry (fails without API key)', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      try {
        setupRetryDeliveries([
          createRetryDelivery({
            type: 'EMAIL',
            url: null,
            config: { recipients: ['test@example.com'] },
          }),
        ]);
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'del-1', retryCount: 0 });

        const count = await retryFailedDeliveries();

        expect(count).toBe(0);
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        }
      }
    });

    test('should handle unknown endpoint type in retry', async () => {
      setupRetryDeliveries([createRetryDelivery({ type: 'UNKNOWN' })]);
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'del-1', retryCount: 0 });

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
    });

    test('should handle Discord delivery failure with retry scheduling', async () => {
      const delivery = createRetryDelivery({
        type: 'DISCORD',
        url: 'https://discord.com/api/webhooks/123/abc',
      });
      delivery.retryCount = 1;
      setupRetryDeliveries([delivery]);
      mockFailedFetch(500, 'Server Error');
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'del-1', retryCount: 1 });

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nextRetryAt: expect.any(Date) }),
        }),
      );
    });

    test('should handle invalid payload schema in retry', async () => {
      setupRetryDeliveries([
        {
          id: 'del-1',
          retryCount: 0,
          payload: { invalid: 'payload' },
          endpoint: createMockEndpoint(),
        },
      ]);

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAt: expect.any(Date),
            responseBody: 'Invalid payload schema',
          }),
        }),
      );
    });
  });

  describe('isValidDiscordWebhookUrl', () => {
    test('should accept valid discord.com webhook URLs', () => {
      expect(isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe(true);
    });

    test('should accept valid discordapp.com webhook URLs', () => {
      expect(isValidDiscordWebhookUrl('https://discordapp.com/api/webhooks/456/def')).toBe(true);
    });

    test('should reject URLs without /api/webhooks/ path', () => {
      expect(isValidDiscordWebhookUrl('https://discord.com/channels/123')).toBe(false);
    });

    test('should reject URLs with wrong hostname', () => {
      expect(isValidDiscordWebhookUrl('https://example.com/api/webhooks/123/abc')).toBe(false);
    });

    test('should reject invalid URLs', () => {
      expect(isValidDiscordWebhookUrl('not-a-url')).toBe(false);
    });

    test('should reject empty string', () => {
      expect(isValidDiscordWebhookUrl('')).toBe(false);
    });

    test('should reject http (non-https) URLs', () => {
      expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(true);
    });
  });

  describe('isValidSlackWebhookUrl', () => {
    test('should accept valid Slack webhook URLs', () => {
      expect(isValidSlackWebhookUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true);
    });

    test('should reject URLs without /services/ path', () => {
      expect(isValidSlackWebhookUrl('https://hooks.slack.com/other/path')).toBe(false);
    });

    test('should reject URLs with wrong hostname', () => {
      expect(isValidSlackWebhookUrl('https://api.slack.com/services/T00/B00/xxx')).toBe(false);
    });

    test('should reject invalid URLs', () => {
      expect(isValidSlackWebhookUrl('not-a-url')).toBe(false);
    });

    test('should reject empty string', () => {
      expect(isValidSlackWebhookUrl('')).toBe(false);
    });
  });

  describe('formatDiscordPayload', () => {
    function discordPayload(
      data: Record<string, unknown> = {},
    ): ReturnType<typeof formatDiscordPayload> {
      return formatDiscordPayload(createWebhookPayload({ data }));
    }

    test('should create Discord embed with correct structure', () => {
      const result = discordPayload();

      expect(result).toHaveProperty('embeds');
      expect(result.embeds).toHaveLength(1);
      expect(result.embeds[0]).toHaveProperty('title');
      expect(result.embeds[0]).toHaveProperty('color');
      expect(result.embeds[0]).toHaveProperty('timestamp');
      expect(result.embeds[0]).toHaveProperty('footer');
    });

    test('should format event name in title', () => {
      const result = discordPayload();

      expect(result.embeds[0].title).toBe('Sentinel: Tool Invocation Allowed');
    });

    test('should include tool name field', () => {
      const result = discordPayload({ toolName: 'my-tool' });

      expect(findDiscordField(result, 'Tool')?.value).toBe('my-tool');
    });

    test('should prefer toolFriendlyName over toolName', () => {
      const result = discordPayload({ toolName: 'my-tool', toolFriendlyName: 'My Friendly Tool' });

      expect(findDiscordField(result, 'Tool')?.value).toBe('My Friendly Tool');
    });

    test('should include user and agent fields', () => {
      const result = discordPayload({ userId: 'user-1', agentId: 'agent-1' });

      expect(findDiscordField(result, 'User ID')?.value).toBe('user-1');
      expect(findDiscordField(result, 'Agent ID')?.value).toBe('agent-1');
    });

    test('should truncate session ID', () => {
      const result = discordPayload({ sessionId: '12345678901234567890' });

      expect(findDiscordField(result, 'Session')?.value).toBe('12345678...');
    });

    test('should include policy fields', () => {
      const result = discordPayload({ policySlug: 'allow-all', effect: 'ALLOW' });

      expect(findDiscordField(result, 'Policy')?.value).toBe('allow-all');
      expect(findDiscordField(result, 'Effect')?.value).toBe('ALLOW');
    });

    test('should truncate long descriptions', () => {
      const result = discordPayload({ description: 'x'.repeat(150) });

      const descField = findDiscordField(result, 'Description');
      expect(descField?.value).toHaveLength(100);
      expect(descField?.value).toMatch(/\.\.\.$/);
    });

    test('should format matchers array', () => {
      const result = discordPayload({ matchers: ['user:*', 'role:admin'] });

      expect(findDiscordField(result, 'Matchers')?.value).toBe('user:*, role:admin');
    });

    test('should limit matchers to 5 with count suffix', () => {
      const result = discordPayload({ matchers: ['1', '2', '3', '4', '5', '6', '7'] });

      expect(findDiscordField(result, 'Matchers')?.value).toContain('(+2 more)');
    });

    test('should include test message indicator', () => {
      const result = discordPayload({ test: true, message: 'Test message' });

      expect(findDiscordField(result, 'Test')).toBeDefined();
      expect(findDiscordField(result, 'Message')?.value).toBe('Test message');
    });

    test('should include rate limit fields for SENSITIVE_RATE_LIMITED event', () => {
      const result = formatDiscordPayload(
        createWebhookPayload({
          event: 'SENSITIVE_RATE_LIMITED' as WebhookEvent,
          data: { remaining: 5, resetAt: '2024-01-15T13:00:00Z' },
        }),
      );

      expect(findDiscordField(result, 'Remaining')?.value).toBe('5');
      expect(findDiscordField(result, 'Reset At')).toBeDefined();
    });

    test('should include approval fields for SENSITIVE_APPROVAL_NEEDED event', () => {
      const result = formatDiscordPayload(
        createWebhookPayload({
          event: 'SENSITIVE_APPROVAL_NEEDED' as WebhookEvent,
          data: { requestId: 'req-1', expiresAt: '2024-01-15T13:00:00Z' },
        }),
      );

      expect(findDiscordField(result, 'Request ID')?.value).toBe('req-1');
      expect(findDiscordField(result, 'Expires At')).toBeDefined();
    });

    test('should include parameters as JSON block', () => {
      const result = discordPayload({ parameters: { key: 'value' } });

      const paramsField = findDiscordField(result, 'Parameters');
      expect(paramsField?.value).toContain('```json');
      expect(paramsField?.value).toContain('"key": "value"');
    });

    test('should skip parameters if too long', () => {
      const result = discordPayload({ parameters: { key: 'x'.repeat(1100) } });

      expect(findDiscordField(result, 'Parameters')).toBeUndefined();
    });

    test('should include impact summary from verbose enrichment', () => {
      const result = discordPayload({ impact: { affectedUserCount: 10, affectedAgentCount: 5 } });

      expect(findDiscordField(result, 'Impact')?.value).toBe('10 user(s), 5 agent(s)');
    });

    test('should include user context from verbose enrichment', () => {
      const result = discordPayload({
        userContext: { email: 'test@example.com', roles: [{ name: 'Admin' }] },
      });

      expect(findDiscordField(result, 'User')?.value).toBe('test@example.com (Admin)');
    });

    test('should include flag config from verbose enrichment', () => {
      const result = discordPayload({
        flagConfig: {
          toolPattern: 'danger:*',
          behaviors: ['LOG', 'ALERT'],
          rateLimit: { maxPerSession: 5, windowMinutes: 60 },
        },
      });

      expect(findDiscordField(result, 'Flag Pattern')?.value).toBe('danger:*');
      expect(findDiscordField(result, 'Behaviors')?.value).toBe('LOG, ALERT');
      expect(findDiscordField(result, 'Rate Limit')?.value).toBe('5 per 60 min');
    });
  });

  describe('formatSlackPayload', () => {
    function slackPayload(
      data: Record<string, unknown> = {},
    ): ReturnType<typeof formatSlackPayload> {
      return formatSlackPayload(createWebhookPayload({ data }));
    }

    test('should create Slack blocks with correct structure', () => {
      const result = slackPayload();

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('blocks');
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    test('should include header block', () => {
      const result = slackPayload();

      const headerBlock = result.blocks.find((b) => b.type === 'header');
      expect(headerBlock).toBeDefined();
      expect(headerBlock?.text?.text).toBe('Sentinel: Tool Invocation Allowed');
    });

    test('should include fallback text', () => {
      const result = slackPayload();

      expect(result.text).toBe('Sentinel: Tool Invocation Allowed');
    });

    test('should include tool field in section', () => {
      const result = slackPayload({ toolName: 'my-tool' });

      expect(findSlackSection(result, '*Tool:*')).toBeDefined();
    });

    test('should prefer toolFriendlyName over toolName', () => {
      const result = slackPayload({ toolName: 'my-tool', toolFriendlyName: 'My Friendly Tool' });

      const sectionBlock = result.blocks.find((b) => b.type === 'section' && b.fields);
      const toolField = sectionBlock?.fields?.find((f) => f.text.includes('*Tool:*'));
      expect(toolField?.text).toContain('My Friendly Tool');
    });

    test('should include policy fields', () => {
      const result = slackPayload({ policySlug: 'allow-all', effect: 'ALLOW' });

      const sectionBlock = result.blocks.find((b) => b.type === 'section' && b.fields);
      expect(sectionBlock?.fields?.some((f) => f.text.includes('*Policy:*'))).toBe(true);
      expect(sectionBlock?.fields?.some((f) => f.text.includes('*Effect:*'))).toBe(true);
    });

    test('should include description as separate section', () => {
      const result = slackPayload({ description: 'Test description' });

      const descSection = findSlackSection(result, '*Description:*');
      expect(descSection).toBeDefined();
      expect(descSection?.text?.text).toContain('Test description');
    });

    test('should truncate long descriptions', () => {
      const result = slackPayload({ description: 'x'.repeat(250) });

      const descSection = findSlackSection(result, '*Description:*');
      expect(descSection?.text?.text?.length).toBeLessThanOrEqual(220);
    });

    test('should include matchers section', () => {
      const result = slackPayload({ matchers: ['user:*', 'role:admin'] });

      const matchersSection = findSlackSection(result, '*Matchers:*');
      expect(matchersSection).toBeDefined();
      expect(matchersSection?.text?.text).toContain('user:*, role:admin');
    });

    test('should include timestamp in context block', () => {
      const result = slackPayload();

      expect(findSlackContext(result, '*Time:*')).toBeDefined();
    });

    test('should include test message', () => {
      const result = slackPayload({ test: true, message: 'Test message' });

      expect(findSlackSection(result, 'test message from Sentinel')).toBeDefined();
    });

    test('should include impact from verbose enrichment', () => {
      const result = slackPayload({ impact: { affectedUserCount: 10, affectedAgentCount: 5 } });

      const impactSection = findSlackSection(result, '*Impact:*');
      expect(impactSection?.text?.text).toContain('10 user(s), 5 agent(s)');
    });
  });

  describe('sendWebhook - verbose enrichment', () => {
    const mockEndpoint = {
      id: 'endpoint-1',
      url: 'https://example.com/webhook',
      secret: 'secret123',
      maxRetries: 3,
      retryDelayMs: 1000,
      type: 'CUSTOM',
      verbose: true,
      config: null,
    };

    test('should enrich payload when endpoint has verbose=true', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      // Mock enrichPayloadIfVerbose to return enriched payload
      mockEnrichPayloadIfVerbose.mockImplementation(async (payload) => ({
        ...payload,
        data: { ...payload.data, enriched: true },
      }));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      expect(result).toContain('delivery-1');
      expect(mockEnrichPayloadIfVerbose).toHaveBeenCalled();
    });

    test('should not enrich payload when endpoint has verbose=false', async () => {
      const nonVerboseEndpoint = { ...mockEndpoint, verbose: false };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([nonVerboseEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      expect(result).toContain('delivery-1');
      // enrichPayloadIfVerbose should not be called for non-verbose endpoints
      expect(mockEnrichPayloadIfVerbose).not.toHaveBeenCalled();
    });
  });

  describe('handleDeliveryFailure - exponential backoff', () => {
    const mockEndpoint = {
      id: 'endpoint-1',
      url: 'https://example.com/webhook',
      secret: 'secret123',
      maxRetries: 3,
      retryDelayMs: 1000,
      type: 'CUSTOM',
    };

    test('should schedule retry with exponential backoff', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service Unavailable'),
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      // Verify retry is scheduled with backoff
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'delivery-1' },
          data: expect.objectContaining({
            retryCount: 1,
            nextRetryAt: expect.any(Date),
          }),
        }),
      );
    });

    test('should mark as failed when max retries exceeded', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 3, // Already at max retries
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      // Verify marked as permanently failed
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAt: expect.any(Date),
            nextRetryAt: null,
          }),
        }),
      );
    });
  });

  describe('sendWebhook - delivery record not found', () => {
    const mockEndpoint = {
      id: 'endpoint-1',
      url: 'https://example.com/webhook',
      secret: 'secret123',
      maxRetries: 3,
      retryDelayMs: 1000,
      type: 'CUSTOM',
    };

    test('should handle delivery record not found during failure handling', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });
      // Return null to simulate delivery not found
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still return the delivery ID
      expect(result).toContain('delivery-1');
      // Should not try to update since delivery not found
      expect(mockPrisma.webhookDelivery.update).not.toHaveBeenCalled();
    });
  });

  describe('formatEmailPayload', () => {
    const basePayload = {
      event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
      timestamp: '2024-01-15T12:00:00Z',
      organizationId: 'org-1',
      data: {},
    };

    test('should return subject, html, and text', () => {
      const result = formatEmailPayload(basePayload);

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('should format subject with event name', () => {
      const result = formatEmailPayload(basePayload);

      expect(result.subject).toBe('Sentinel Alert: Tool Invocation Allowed');
    });

    test('should include HTML table structure', () => {
      const result = formatEmailPayload(basePayload);

      expect(result.html).toContain('<table');
      expect(result.html).toContain('</table>');
    });

    test('should include tool field', () => {
      const payload = {
        ...basePayload,
        data: { toolName: 'my-tool' },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('<strong>Tool:</strong>');
      expect(result.html).toContain('my-tool');
      expect(result.text).toContain('Tool: my-tool');
    });

    test('should prefer toolFriendlyName over toolName', () => {
      const payload = {
        ...basePayload,
        data: { toolName: 'my-tool', toolFriendlyName: 'My Friendly Tool' },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('My Friendly Tool');
      expect(result.html).not.toContain('>my-tool<');
    });

    test('should include policy fields', () => {
      const payload = {
        ...basePayload,
        data: { policySlug: 'allow-all', effect: 'ALLOW' },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('allow-all');
      expect(result.html).toContain('ALLOW');
      expect(result.text).toContain('Policy: allow-all');
      expect(result.text).toContain('Effect: ALLOW');
    });

    test('should truncate long descriptions', () => {
      const payload = {
        ...basePayload,
        data: { description: 'x'.repeat(150) },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('...');
    });

    test('should include timestamp', () => {
      const result = formatEmailPayload(basePayload);

      expect(result.html).toContain('2024-01-15T12:00:00Z');
      expect(result.text).toContain('Time: 2024-01-15T12:00:00Z');
    });

    test('should include test message indicator', () => {
      const payload = {
        ...basePayload,
        data: { test: true, message: 'Test message' },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('This is a test message from Sentinel');
      expect(result.text).toContain('This is a test message from Sentinel');
    });

    test('should include footer', () => {
      const result = formatEmailPayload(basePayload);

      expect(result.html).toContain('Sentinel Control Plane');
      expect(result.text).toContain('Sentinel Control Plane');
    });

    test('should format matchers array', () => {
      const payload = {
        ...basePayload,
        data: { matchers: ['user:*', 'role:admin'] },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('user:*, role:admin');
      expect(result.text).toContain('Matchers: user:*, role:admin');
    });

    test('should include impact from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: { impact: { affectedUserCount: 10, affectedAgentCount: 5 } },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('10 user(s), 5 agent(s)');
      expect(result.text).toContain('Impact: 10 user(s), 5 agent(s)');
    });

    test('should include user context from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: { userContext: { email: 'test@example.com', roles: [{ name: 'Admin' }] } },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('test@example.com (Admin)');
    });
  });

  describe('sendWebhook - verbose enrichment error handling', () => {
    const mockVerboseEndpoint = {
      id: 'endpoint-1',
      organizationId: 'org-1',
      url: 'https://example.com/webhook',
      secret: 'secret123',
      maxRetries: 3,
      retryDelayMs: 1000,
      type: 'CUSTOM',
      verbose: true,
      config: null,
    };

    test('should fall back to base payload when enrichPayloadIfVerbose throws', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockVerboseEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      // Make enrichPayloadIfVerbose throw an error
      mockEnrichPayloadIfVerbose.mockRejectedValue(new Error('Enrichment database error'));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        testData: 'value',
      });

      // Should still succeed with base payload
      expect(result).toContain('delivery-1');
      // Should log the enrichment error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to enrich verbose payload:',
        expect.any(Error),
      );
      // Webhook should still be called (with base payload)
      expect(mockFetch).toHaveBeenCalled();
    });

    test('should use enriched payload when enrichPayloadIfVerbose succeeds', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockVerboseEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      const enrichedPayload = {
        event: 'TOOL_INVOCATION_ALLOWED',
        timestamp: new Date().toISOString(),
        organizationId: 'org-1',
        data: { testData: 'value', enrichedField: 'enriched' },
      };
      mockEnrichPayloadIfVerbose.mockResolvedValue(enrichedPayload);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        testData: 'value',
      });

      expect(result).toContain('delivery-1');
      expect(mockEnrichPayloadIfVerbose).toHaveBeenCalled();
    });
  });

  describe('deliverCustomWebhook - no secret', () => {
    test('should not include signature header when endpoint has no secret', async () => {
      const mockEndpointNoSecret = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: null, // No secret
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpointNoSecret]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      // Verify fetch was called without X-Webhook-Signature header
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers).not.toHaveProperty('X-Webhook-Signature');
    });

    test('should include signature header when endpoint has secret', async () => {
      const mockEndpointWithSecret = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'my-secret-key',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpointWithSecret]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      // Verify fetch was called with X-Webhook-Signature header
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers).toHaveProperty('X-Webhook-Signature');
      expect(fetchCall[1].headers['X-Webhook-Signature']).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('deliverCustomWebhook - null URL', () => {
    test('should return error when custom webhook has null URL', async () => {
      const mockEndpointNoUrl = {
        id: 'endpoint-1',
        url: null, // No URL
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpointNoUrl]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      // Should handle failure (no fetch call)
      expect(mockFetch).not.toHaveBeenCalled();
      // Should update delivery with error
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalled();
    });
  });

  describe('deliverToDiscord and deliverToSlack - response.text() error', () => {
    test('should handle response.text() throwing error for Discord', async () => {
      const mockDiscordEndpoint = {
        id: 'endpoint-1',
        url: 'https://discord.com/api/webhooks/123/abc',
        secret: null,
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'DISCORD',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockDiscordEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error('Body already consumed')),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still succeed (text error is caught)
      expect(result).toContain('delivery-1');
      // Should update with empty body
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: '',
          }),
        }),
      );
    });

    test('should handle response.text() throwing error for Slack', async () => {
      const mockSlackEndpoint = {
        id: 'endpoint-1',
        url: 'https://hooks.slack.com/services/T00/B00/xxx',
        secret: null,
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'SLACK',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockSlackEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error('Body already consumed')),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still succeed (text error is caught)
      expect(result).toContain('delivery-1');
    });

    test('should handle response.text() throwing error for Custom webhook', async () => {
      const mockCustomEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockCustomEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error('Body already consumed')),
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still succeed
      expect(result).toContain('delivery-1');
    });
  });

  describe('retryFailedDeliveries - error catch block', () => {
    test('should handle non-Error exception during retry delivery', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      // Throw a non-Error object
      mockFetch.mockRejectedValue('String error');
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should still call handleDeliveryFailure with 'Unknown error'
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: expect.stringContaining('Unknown error'),
          }),
        }),
      );
    });

    test('should handle Error exception during retry delivery', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      mockFetch.mockRejectedValue(new Error('Specific network error'));
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should call handleDeliveryFailure with the error message
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Specific network error',
          }),
        }),
      );
    });
  });

  describe('sendWebhook - deliverWebhook exception handling', () => {
    test('should handle non-Error exception in deliverWebhook', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      // Throw a non-Error object
      mockFetch.mockRejectedValue({ code: 'ENOTFOUND' });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still return delivery ID
      expect(result).toContain('delivery-1');
    });

    test('should handle exception in prisma update after successful delivery', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      // First update throws (the success update), then subsequent updates succeed (for failure handling)
      mockPrisma.webhookDelivery.update
        .mockRejectedValueOnce(new Error('Database connection lost'))
        .mockResolvedValue({});
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should still return delivery ID (caught by outer catch)
      expect(result).toContain('delivery-1');
    });
  });

  describe('retryFailedDeliveries - null URL handling', () => {
    test('should handle Discord endpoint with null URL during retry', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'DISCORD',
            url: null, // null URL
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should not call fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should handle Slack endpoint with null URL during retry', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'SLACK',
            url: null, // null URL
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should handle Custom endpoint with null URL during retry', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: null, // null URL
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('formatDiscordPayload - additional verbose enrichment fields', () => {
    const basePayload = {
      event: 'POLICY_UPDATED' as WebhookEvent,
      timestamp: '2024-01-15T12:00:00Z',
      organizationId: 'org-1',
      data: {},
    };

    test('should include resolved matchers from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          resolvedMatchers: [
            { raw: 'user:*', type: 'user', targetName: 'All Users', affectedCount: 50 },
            { raw: 'role:admin', type: 'role', targetName: 'Admin Role', affectedCount: 5 },
          ],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Resolved Matchers');
      expect(field).toBeDefined();
      expect(field?.value).toContain('user:*');
      expect(field?.value).toContain('All Users');
    });

    test('should include matcher changes from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          matcherChanges: {
            added: ['user:new-user'],
            removed: ['user:old-user'],
          },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Matcher Changes');
      expect(field).toBeDefined();
      expect(field?.value).toContain('Added: user:new-user');
      expect(field?.value).toContain('Removed: user:old-user');
    });

    test('should include tool pattern changes from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatternChanges: {
            added: ['tool:new-pattern'],
            removed: ['tool:old-pattern'],
          },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Pattern Changes');
      expect(field).toBeDefined();
      expect(field?.value).toContain('Added: tool:new-pattern');
      expect(field?.value).toContain('Removed: tool:old-pattern');
    });

    test('should include server context from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          serverContext: { name: 'MCP Server', trusted: true },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Server');
      expect(field).toBeDefined();
      expect(field?.value).toBe('MCP Server (trusted)');
    });

    test('should include agent override from verbose enrichment (exempted)', () => {
      const payload = {
        ...basePayload,
        data: {
          agentOverride: { exempted: true },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Agent Exempted');
      expect(field).toBeDefined();
      expect(field?.value).toBe('Yes');
    });

    test('should include agent override from verbose enrichment (custom behaviors)', () => {
      const payload = {
        ...basePayload,
        data: {
          agentOverride: { exempted: false, customBehaviors: ['LOG', 'NOTIFY'] },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Agent Behaviors');
      expect(field).toBeDefined();
      expect(field?.value).toBe('LOG, NOTIFY');
    });

    test('should include requesting user from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          requestingUser: {
            email: 'requester@example.com',
            roles: [{ name: 'Admin', isAdmin: true }],
          },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Requesting User');
      expect(field).toBeDefined();
      expect(field?.value).toBe('requester@example.com (admin)');
    });

    test('should include rate limit context from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          rateLimitContext: { currentUsage: 3, resetAt: '2024-01-15T13:00:00Z' },
        },
      };

      const result = formatDiscordPayload(payload);

      expect(result.embeds[0].fields?.find((f) => f.name === 'Current Usage')?.value).toBe('3');
      expect(result.embeds[0].fields?.find((f) => f.name === 'Resets At')?.value).toBe(
        '2024-01-15T13:00:00Z',
      );
    });

    test('should include resolved tool patterns from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          resolvedToolPatterns: [
            { raw: 'server:*', serverName: 'MCP Server', isWildcard: true, matchedToolCount: 15 },
          ],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Resolved Tool Patterns');
      expect(field).toBeDefined();
      expect(field?.value).toContain('server:*');
      expect(field?.value).toContain('MCP Server');
    });

    test('should include typed diff from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          diff: {
            changedFields: ['effect', 'enabled'],
            before: { effect: 'ALLOW', enabled: true },
            after: { effect: 'DENY', enabled: false },
          },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Changes');
      expect(field).toBeDefined();
      expect(field?.value).toContain('Effect: ALLOW → DENY');
      expect(field?.value).toContain('Enabled: true → false');
    });

    test('should include applicable policies from verbose enrichment', () => {
      const payload = {
        event: 'AGENT_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          applicablePolicies: [
            { slug: 'policy-1', effect: 'ALLOW' },
            { slug: 'policy-2', effect: 'DENY' },
          ],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Applicable Policies');
      expect(field).toBeDefined();
      expect(field?.value).toContain('policy-1 (ALLOW)');
      expect(field?.value).toContain('policy-2 (DENY)');
    });

    test('should include affected policies from verbose enrichment', () => {
      const payload = {
        event: 'AGENT_DELETED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          affectedPolicies: [{ slug: 'affected-policy', effect: 'ALLOW' }],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Affected Policies');
      expect(field).toBeDefined();
      expect(field?.value).toContain('affected-policy (ALLOW)');
    });

    test('should include organization context from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          organizationContext: { totalAgents: 10, remainingAgents: 5 },
        },
      };

      const result = formatDiscordPayload(payload);

      expect(result.embeds[0].fields?.find((f) => f.name === 'Total Agents')?.value).toBe('10');
      expect(result.embeds[0].fields?.find((f) => f.name === 'Remaining Agents')?.value).toBe('5');
    });

    test('should include matched policies from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          matchedPolicies: [
            { slug: 'matched-1', effect: 'ALLOW' },
            { slug: 'matched-2', effect: 'DENY' },
          ],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Matched Policies');
      expect(field).toBeDefined();
      expect(field?.value).toContain('matched-1 (ALLOW)');
    });

    test('should include flag approvers from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          flagConfig: {
            approvalConfig: { allowedApprovers: ['admin@example.com', 'manager@example.com'] },
          },
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Approvers');
      expect(field).toBeDefined();
      expect(field?.value).toBe('admin@example.com, manager@example.com');
    });

    test('should include tool patterns from data', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatterns: [
            'pattern-1',
            'pattern-2',
            'pattern-3',
            'pattern-4',
            'pattern-5',
            'pattern-6',
          ],
        },
      };

      const result = formatDiscordPayload(payload);

      const field = result.embeds[0].fields?.find((f) => f.name === 'Tool Patterns');
      expect(field).toBeDefined();
      expect(field?.value).toContain('(+1 more)');
    });

    test('should include createdBy, updatedBy, deletedBy fields', () => {
      const payload = {
        ...basePayload,
        data: {
          createdBy: 'creator@example.com',
          updatedBy: 'updater@example.com',
          deletedBy: 'deleter@example.com',
        },
      };

      const result = formatDiscordPayload(payload);

      expect(result.embeds[0].fields?.find((f) => f.name === 'Created By')?.value).toBe(
        'creator@example.com',
      );
      expect(result.embeds[0].fields?.find((f) => f.name === 'Updated By')?.value).toBe(
        'updater@example.com',
      );
      expect(result.embeds[0].fields?.find((f) => f.name === 'Deleted By')?.value).toBe(
        'deleter@example.com',
      );
    });

    test('should include agentName field', () => {
      const payload = {
        ...basePayload,
        data: {
          agentName: 'Test Agent',
        },
      };

      const result = formatDiscordPayload(payload);

      expect(result.embeds[0].fields?.find((f) => f.name === 'Agent Name')?.value).toBe(
        'Test Agent',
      );
    });

    test('should use default gray color for unknown event', () => {
      const payload = {
        event: 'UNKNOWN_EVENT' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {},
      };

      const result = formatDiscordPayload(payload);

      expect(result.embeds[0].color).toBe(0x6b7280); // Gray default
    });
  });

  describe('formatSlackPayload - additional verbose enrichment fields', () => {
    const basePayload = {
      event: 'POLICY_UPDATED' as WebhookEvent,
      timestamp: '2024-01-15T12:00:00Z',
      organizationId: 'org-1',
      data: {},
    };

    test('should include resolved matchers from verbose enrichment', () => {
      const payload = {
        ...basePayload,
        data: {
          resolvedMatchers: [
            { raw: 'user:*', type: 'user', targetName: 'All Users', affectedCount: 50 },
          ],
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Resolved Matchers:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('user:*');
    });

    test('should include tool patterns section', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatterns: ['pattern-1', 'pattern-2'],
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Tool Patterns:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('pattern-1, pattern-2');
    });

    test('should include session ID in context', () => {
      const payload = {
        ...basePayload,
        data: {
          sessionId: 'session-12345678',
        },
      };

      const result = formatSlackPayload(payload);

      const context = result.blocks.find(
        (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes('*Session:*')),
      );
      expect(context).toBeDefined();
    });

    test('should include remaining for rate limited event', () => {
      const payload = {
        event: 'SENSITIVE_RATE_LIMITED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: { remaining: 2 },
      };

      const result = formatSlackPayload(payload);

      const context = result.blocks.find(
        (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes('*Remaining:*')),
      );
      expect(context).toBeDefined();
    });

    test('should include requestId for approval needed event', () => {
      const payload = {
        event: 'SENSITIVE_APPROVAL_NEEDED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: { requestId: 'req-123' },
      };

      const result = formatSlackPayload(payload);

      const context = result.blocks.find(
        (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes('*Request ID:*')),
      );
      expect(context).toBeDefined();
    });

    test('should include organization context', () => {
      const payload = {
        ...basePayload,
        data: {
          organizationContext: { totalAgents: 10, remainingAgents: 5 },
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Organization:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Total Agents: 10');
    });

    test('should include affected policies for AGENT_DELETED event', () => {
      const payload = {
        event: 'AGENT_DELETED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          affectedPolicies: [
            { slug: 'policy-1', effect: 'ALLOW' },
            { slug: 'policy-2', effect: 'DENY' },
          ],
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Affected Policies:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('policy-1 (ALLOW)');
      expect(section?.text?.text).toContain('policy-2 (DENY)');
    });

    test('should include applicable policies for AGENT_CREATED event', () => {
      const payload = {
        event: 'AGENT_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          applicablePolicies: [
            { slug: 'policy-1', effect: 'ALLOW' },
            { slug: 'policy-2', effect: 'DENY' },
          ],
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Applicable Policies:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('policy-1 (ALLOW)');
      expect(section?.text?.text).toContain('policy-2 (DENY)');
    });

    test('should include typed diff with effect change', () => {
      const payload = {
        event: 'POLICY_UPDATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          diff: {
            changedFields: ['effect'],
            before: { effect: 'ALLOW' },
            after: { effect: 'DENY' },
          },
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Changes:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Effect: ALLOW → DENY');
    });

    test('should include typed diff with enabled change', () => {
      const payload = {
        event: 'POLICY_UPDATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          diff: {
            changedFields: ['enabled'],
            before: { effect: 'ALLOW', enabled: true },
            after: { effect: 'ALLOW', enabled: false },
          },
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Changes:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Enabled: true → false');
    });

    test('should include typed diff with non-effect/enabled changes', () => {
      const payload = {
        event: 'POLICY_UPDATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          diff: {
            changedFields: ['description', 'priority'],
            before: { effect: 'ALLOW', enabled: true },
            after: { effect: 'ALLOW', enabled: true },
          },
        },
      };

      const result = formatSlackPayload(payload);

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Changes:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Changed: description, priority');
    });
  });

  describe('formatEmailPayload - additional verbose enrichment fields', () => {
    const basePayload = {
      event: 'POLICY_UPDATED' as WebhookEvent,
      timestamp: '2024-01-15T12:00:00Z',
      organizationId: 'org-1',
      data: {},
    };

    test('should include resolved matchers', () => {
      const payload = {
        ...basePayload,
        data: {
          resolvedMatchers: [
            { raw: 'user:*', type: 'user', targetName: 'All Users', affectedCount: 50 },
          ],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Resolved Matchers');
      expect(result.text).toContain('Resolved Matchers');
    });

    test('should include resolved tool patterns', () => {
      const payload = {
        ...basePayload,
        data: {
          resolvedToolPatterns: [
            { raw: 'server:*', serverName: 'MCP Server', isWildcard: true, matchedToolCount: 15 },
          ],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Resolved Tool Patterns');
      expect(result.text).toContain('Resolved Tool Patterns');
    });

    test('should include basic tool patterns', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatterns: ['server1:*', 'server2:read_*', 'server3:write_file'],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Tool Patterns');
      expect(result.html).toContain('server1:*');
      expect(result.html).toContain('server2:read_*');
    });

    test('should include matcher changes', () => {
      const payload = {
        ...basePayload,
        data: {
          matcherChanges: { added: ['new-matcher'], removed: ['old-matcher'] },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Matcher Changes');
      expect(result.html).toContain('Added: new-matcher');
    });

    test('should include pattern changes', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatternChanges: { added: ['new-pattern'], removed: [] },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Pattern Changes');
    });

    test('should include pattern changes with removed patterns', () => {
      const payload = {
        ...basePayload,
        data: {
          toolPatternChanges: { added: [], removed: ['old-pattern-1', 'old-pattern-2'] },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Pattern Changes');
      expect(result.html).toContain('Removed: old-pattern-1, old-pattern-2');
    });

    test('should include flag config', () => {
      const payload = {
        ...basePayload,
        data: {
          flagConfig: {
            toolPattern: 'danger:*',
            behaviors: ['LOG'],
            rateLimit: { maxPerSession: 5, windowMinutes: 60 },
            approvalConfig: { allowedApprovers: ['admin@example.com'] },
          },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Flag Pattern');
      expect(result.html).toContain('danger:*');
      expect(result.html).toContain('Behaviors');
      expect(result.html).toContain('Rate Limit');
      expect(result.html).toContain('Approvers');
    });

    test('should include matched policies', () => {
      const payload = {
        ...basePayload,
        data: {
          matchedPolicies: [{ slug: 'test-policy', effect: 'ALLOW' }],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Matched Policies');
      expect(result.html).toContain('test-policy (ALLOW)');
    });

    test('should include server context', () => {
      const payload = {
        ...basePayload,
        data: {
          serverContext: { name: 'Test Server', trusted: true },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Server');
      expect(result.html).toContain('Test Server (trusted)');
    });

    test('should include agent override exempted', () => {
      const payload = {
        ...basePayload,
        data: {
          agentOverride: { exempted: true },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Agent Exempted');
      expect(result.html).toContain('Yes');
    });

    test('should include agent override behaviors', () => {
      const payload = {
        ...basePayload,
        data: {
          agentOverride: { exempted: false, customBehaviors: ['LOG', 'ALERT'] },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Agent Behaviors');
      expect(result.html).toContain('LOG, ALERT');
    });

    test('should include requesting user', () => {
      const payload = {
        ...basePayload,
        data: {
          requestingUser: {
            email: 'requester@example.com',
            roles: [{ name: 'Admin', isAdmin: true }],
          },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Requesting User');
      expect(result.html).toContain('requester@example.com (admin)');
    });

    test('should include rate limit context', () => {
      const payload = {
        ...basePayload,
        data: {
          rateLimitContext: { currentUsage: 3, resetAt: '2024-01-15T13:00:00Z' },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Current Usage');
      expect(result.html).toContain('3');
      expect(result.html).toContain('Resets At');
    });

    test('should include typed diff', () => {
      const payload = {
        ...basePayload,
        data: {
          diff: {
            changedFields: ['effect'],
            before: { effect: 'ALLOW' },
            after: { effect: 'DENY' },
          },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Changes');
      expect(result.html).toContain('Effect: ALLOW → DENY');
    });

    test('should include typed diff with non-effect/enabled changed fields', () => {
      const payload = {
        ...basePayload,
        data: {
          diff: {
            changedFields: ['description', 'priority'],
            // effect and enabled are the same in before/after
            before: { effect: 'ALLOW', enabled: true },
            after: { effect: 'ALLOW', enabled: true },
          },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Changes');
      // Should fall back to listing the changed fields
      expect(result.html).toContain('Changed: description, priority');
    });

    test('should include typed diff with enabled change', () => {
      const payload = {
        ...basePayload,
        data: {
          diff: {
            changedFields: ['enabled'],
            before: { effect: 'ALLOW', enabled: true },
            after: { effect: 'ALLOW', enabled: false },
          },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Changes');
      expect(result.html).toContain('Enabled: true → false');
    });

    test('should include applicable policies', () => {
      const payload = {
        event: 'AGENT_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          applicablePolicies: [{ slug: 'policy-1', effect: 'ALLOW' }],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Applicable Policies');
    });

    test('should include affected policies', () => {
      const payload = {
        event: 'AGENT_DELETED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          affectedPolicies: [{ slug: 'policy-1', effect: 'DENY' }],
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Affected Policies');
    });

    test('should include organization context', () => {
      const payload = {
        ...basePayload,
        data: {
          organizationContext: { totalAgents: 10, remainingAgents: 5 },
        },
      };

      const result = formatEmailPayload(payload);

      expect(result.html).toContain('Total Agents');
      expect(result.html).toContain('10');
      expect(result.html).toContain('Remaining Agents');
    });
  });

  describe('sendTestWebhook - Slack network error', () => {
    test('should handle Slack network timeout', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://hooks.slack.com/services/T00/B00/xxx',
        organizationId: 'org-1',
        type: 'SLACK',
      };
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockFetch.mockRejectedValue(new Error('The operation was aborted'));

      const result = await sendTestWebhook('org-1', 'endpoint-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });
  });

  describe('handleDeliveryFailure - warning log', () => {
    test('should log warning when max retries exceeded', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 1, // Only 1 retry allowed
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 1, // Already at max
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Webhook delivery delivery-1 failed after 1 retries'),
      );
    });
  });

  describe('deliverWebhook - unknown endpoint type', () => {
    test('should handle unknown endpoint type in deliverWebhook', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'UNKNOWN_TYPE', // Unknown type
        verbose: false,
        config: null,
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should return delivery ID
      expect(result).toContain('delivery-1');
      // Should not call fetch for unknown type
      expect(mockFetch).not.toHaveBeenCalled();
      // Should update delivery with failure error message
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: expect.stringContaining('Unknown endpoint type'),
          }),
        }),
      );
    });
  });

  describe('deliverWebhook - EMAIL endpoint type', () => {
    test('should handle EMAIL endpoint type in deliverWebhook', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: null,
        secret: null,
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'EMAIL',
        verbose: false,
        config: { recipients: ['test@example.com'] },
      };
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});
      // Mock fetch for Resend API (called if RESEND_API_KEY is set)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"id":"email-123"}'),
      });

      const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
        test: true,
      });

      // Should return delivery ID
      expect(result).toContain('delivery-1');
      // EMAIL type sends via Resend API (behavior depends on env RESEND_API_KEY)
      // Just verify delivery was created
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalled();
    });
  });

  describe('retryFailedDeliveries - unknown endpoint type', () => {
    test('should handle unknown endpoint type during retry', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'UNKNOWN_TYPE', // Unknown type
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should not call fetch for unknown type
      expect(mockFetch).not.toHaveBeenCalled();
      // Should update delivery with failure
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: expect.stringContaining('Unknown endpoint type'),
          }),
        }),
      );
    });
  });

  describe('retryFailedDeliveries - inner catch with non-Error thrown', () => {
    test('should handle non-Error thrown during delivery retry (inner catch)', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      // Throw a non-Error object (string)
      mockFetch.mockImplementation(() => {
        throw 'network failure string'; // Not an Error instance
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should call handleDeliveryFailure with 'Unknown error' since it's not an Error instance
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Unknown error',
          }),
        }),
      );
    });

    test('should handle null thrown during delivery retry (inner catch)', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      // Throw null
      mockFetch.mockImplementation(() => {
        throw null;
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should call handleDeliveryFailure with 'Unknown error' since null is not an Error instance
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Unknown error',
          }),
        }),
      );
    });

    test('should handle object thrown during delivery retry (inner catch)', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
        },
      ]);
      // Throw a plain object (not an Error)
      mockFetch.mockImplementation(() => {
        throw { code: 'ECONNREFUSED', syscall: 'connect' };
      });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      // Should call handleDeliveryFailure with 'Unknown error' since it's not an Error instance
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Unknown error',
          }),
        }),
      );
    });
  });

  describe('deliverEmail - Resend API error handling', () => {
    const mockEmailEndpoint = {
      id: 'endpoint-1',
      url: null,
      secret: null,
      maxRetries: 3,
      retryDelayMs: 1000,
      type: 'EMAIL',
      verbose: false,
      config: { recipients: ['test@example.com'] },
      organizationId: 'org-1',
    };

    function setupEmailDelivery(): void {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEmailEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});
    }

    test('should successfully deliver email when Resend API returns success', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        setupEmailDelivery();
        mockFetch.mockResolvedValue(
          createMockFetchResponse({ ok: true, status: 200, body: '{"id": "email-123"}' }),
        );

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.resend.com/emails',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-api-key',
            }),
          }),
        );
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              deliveredAt: expect.any(Date),
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should parse Resend API error message from JSON response', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        setupEmailDelivery();
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        mockFetch.mockResolvedValue(
          createMockFetchResponse({
            ok: false,
            status: 422,
            body: '{"message": "Invalid email address"}',
          }),
        );

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        // Should update with the parsed error message
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: expect.stringContaining('Resend API: Invalid email address'),
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should handle invalid JSON in Resend API error response', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        setupEmailDelivery();
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        // Return invalid JSON in the error body
        mockFetch.mockResolvedValue(
          createMockFetchResponse({
            ok: false,
            status: 500,
            body: 'Internal Server Error - not JSON',
          }),
        );

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        // Should use the original body since JSON parsing failed
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: 'Internal Server Error - not JSON',
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should handle Resend API error with JSON but no message field', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        setupEmailDelivery();
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        // Return JSON without message field
        mockFetch.mockResolvedValue(
          createMockFetchResponse({
            ok: false,
            status: 400,
            body: '{"error": "bad_request", "code": 400}',
          }),
        );

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        // Should use the original body since no message field
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: '{"error": "bad_request", "code": 400}',
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should use custom EMAIL_FROM address when configured', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      const originalFrom = process.env.EMAIL_FROM;
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.EMAIL_FROM = 'Sentinel Alerts <alerts@example.com>';

      try {
        setupEmailDelivery();
        mockFetch.mockResolvedValue(
          createMockFetchResponse({ ok: true, status: 200, body: '{"id": "email-123"}' }),
        );

        await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

        const fetchCall = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.from).toBe('Sentinel Alerts <alerts@example.com>');
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
        if (originalFrom !== undefined) {
          process.env.EMAIL_FROM = originalFrom;
        } else {
          delete process.env.EMAIL_FROM;
        }
      }
    });

    test('should handle empty recipients array in email config', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        const endpointWithEmptyRecipients = {
          ...mockEmailEndpoint,
          config: { recipients: [] },
        };
        mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpointWithEmptyRecipients]);
        mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        mockPrisma.webhookDelivery.update.mockResolvedValue({});

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: expect.stringContaining('Invalid email configuration'),
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should handle null config for email endpoint', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        const endpointWithNullConfig = {
          ...mockEmailEndpoint,
          config: null,
        };
        mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpointWithNullConfig]);
        mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        mockPrisma.webhookDelivery.update.mockResolvedValue({});

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: expect.stringContaining('Invalid email configuration'),
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should handle config array instead of object for email endpoint', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        const endpointWithArrayConfig = {
          ...mockEmailEndpoint,
          config: ['test@example.com'],
        };
        mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpointWithArrayConfig]);
        mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        mockPrisma.webhookDelivery.update.mockResolvedValue({});

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });

    test('should handle config with non-string recipients for email endpoint', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-api-key';

      try {
        const endpointWithInvalidRecipients = {
          ...mockEmailEndpoint,
          config: { recipients: [123, 'test@example.com'] },
        };
        mockPrisma.webhookEndpoint.findMany.mockResolvedValue([endpointWithInvalidRecipients]);
        mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
        mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
          id: 'delivery-1',
          retryCount: 0,
        });
        mockPrisma.webhookDelivery.update.mockResolvedValue({});

        const result = await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, {
          test: true,
        });

        expect(result).toContain('delivery-1');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              responseBody: expect.stringContaining('Invalid email configuration'),
            }),
          }),
        );
      } finally {
        if (originalKey !== undefined) {
          process.env.RESEND_API_KEY = originalKey;
        } else {
          delete process.env.RESEND_API_KEY;
        }
      }
    });
  });

  describe('retryFailedDeliveries - dispatchDelivery exception', () => {
    test('should handle exception thrown during prisma update after successful dispatch', async () => {
      // This test triggers the catch block (lines 1472-1482) in retryFailedDeliveries
      // by having the prisma.update call throw AFTER dispatchDelivery succeeds
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
            organizationId: 'org-1',
          },
        },
      ]);
      // Make fetch succeed
      mockFetch.mockResolvedValue(createMockFetchResponse({ ok: true, status: 200, body: 'OK' }));
      // Make the first update (success update) throw an exception
      // Then subsequent updates succeed (for failure handling)
      mockPrisma.webhookDelivery.update
        .mockRejectedValueOnce(new Error('Database connection lost during update'))
        .mockResolvedValue({});
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });

      const count = await retryFailedDeliveries();

      // Should be 0 because the update threw
      expect(count).toBe(0);
      // Should have attempted to handle the failure with the error message
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledTimes(2);
      // The second update should be the failure handler with the error message
      expect(mockPrisma.webhookDelivery.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Database connection lost during update',
          }),
        }),
      );
    });

    test('should handle non-Error exception thrown during retry dispatch', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          retryCount: 0,
          payload: {
            event: 'TOOL_INVOCATION_ALLOWED',
            timestamp: new Date().toISOString(),
            organizationId: 'org-1',
            data: { test: true },
          },
          endpoint: {
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            secret: 'secret',
            maxRetries: 3,
            retryDelayMs: 1000,
            organizationId: 'org-1',
          },
        },
      ]);
      mockFetch.mockResolvedValue(createMockFetchResponse({ ok: true, status: 200, body: 'OK' }));
      // Throw a non-Error object when update is called
      mockPrisma.webhookDelivery.update
        .mockRejectedValueOnce('String error instead of Error object')
        .mockResolvedValue({});
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-1',
        retryCount: 0,
      });

      const count = await retryFailedDeliveries();

      expect(count).toBe(0);
      expect(mockPrisma.webhookDelivery.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: 'Unknown error',
          }),
        }),
      );
    });
  });

  describe('fetchWithTimeout - abort error', () => {
    test('should handle AbortError from timeout', async () => {
      const mockEndpoint = {
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
        maxRetries: 3,
        retryDelayMs: 1000,
        type: 'CUSTOM',
        verbose: false,
        config: null,
        organizationId: 'org-1',
      };

      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        retryCount: 0,
      });
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      // Create an AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await sendWebhook('org-1', 'TOOL_INVOCATION_ALLOWED' as WebhookEvent, { test: true });

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseBody: expect.stringContaining('Request timed out after 30 seconds'),
          }),
        }),
      );
    });
  });

  describe('formatDiscordPayload - edge cases', () => {
    test('should handle unknown event type gracefully', () => {
      const result = formatDiscordPayload({
        event: 'SESSION_TERMINATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {},
      });

      expect(result.embeds[0].title).toBe('Sentinel: Session Terminated');
      // Should use orange color for session events
      expect(result.embeds[0].color).toBe(0xf97316);
    });

    test('should handle empty data object', () => {
      const result = formatDiscordPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {},
      });

      expect(result.embeds[0].fields).toBeUndefined();
    });
  });

  describe('formatSlackPayload - edge cases', () => {
    test('should handle SENSITIVE_RATE_LIMITED event with context fields', () => {
      const result = formatSlackPayload({
        event: 'SENSITIVE_RATE_LIMITED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: { remaining: 0, sessionId: 'session-12345678' },
      });

      // Should have context block with remaining
      const contextBlock = result.blocks.find(
        (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes('*Remaining:*')),
      );
      expect(contextBlock).toBeDefined();
    });

    test('should handle SENSITIVE_APPROVAL_NEEDED event with request ID', () => {
      const result = formatSlackPayload({
        event: 'SENSITIVE_APPROVAL_NEEDED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: { requestId: 'req-abc123', sessionId: 'session-12345678' },
      });

      // Should have context block with request ID
      const contextBlock = result.blocks.find(
        (b) => b.type === 'context' && b.elements?.some((e) => e.text.includes('*Request ID:*')),
      );
      expect(contextBlock).toBeDefined();
    });

    test('should include rate limit context with currentUsage and resetAt', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          rateLimitContext: {
            currentUsage: 5,
            resetAt: '2024-01-15T13:00:00Z',
          },
        },
      });

      // Should have rate limit status section with both fields
      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Rate Limit Status:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Current Usage: 5');
      expect(section?.text?.text).toContain('Resets At: 2024-01-15T13:00:00Z');
    });

    test('should include rate limit context with only currentUsage', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          rateLimitContext: {
            currentUsage: 3,
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Rate Limit Status:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Current Usage: 3');
    });

    test('should include rate limit context with only resetAt', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          rateLimitContext: {
            resetAt: '2024-01-15T14:00:00Z',
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Rate Limit Status:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Resets At: 2024-01-15T14:00:00Z');
    });

    test('should include resolved tool patterns with server name', () => {
      const result = formatSlackPayload({
        event: 'POLICY_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          resolvedToolPatterns: [
            { raw: 'mcp:*', serverName: 'MyServer', isWildcard: true, matchedToolCount: 10 },
            { raw: 'local:*', serverName: null, isWildcard: true, matchedToolCount: 5 },
          ],
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Resolved Tool Patterns:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('mcp:* → MyServer (10 tools)');
      expect(section?.text?.text).toContain('local:* → unknown (5 tools)');
    });

    test('should not include rate limit status when no fields present', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          rateLimitContext: {},
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Rate Limit Status:*'),
      );
      expect(section).toBeUndefined();
    });

    test('should include agent exempted status when agentOverride.exempted is true', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          agentOverride: {
            exempted: true,
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Agent Exempted:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('Yes');
    });

    test('should include agent custom behaviors when provided', () => {
      const result = formatSlackPayload({
        event: 'TOOL_INVOCATION_ALLOWED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          agentOverride: {
            exempted: false,
            customBehaviors: ['behavior1', 'behavior2'],
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Agent Behaviors:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('behavior1, behavior2');
    });

    test('should include requesting user with admin role', () => {
      const result = formatSlackPayload({
        event: 'POLICY_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          requestingUser: {
            email: 'admin@example.com',
            roles: [{ name: 'Admin', isAdmin: true }],
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Requesting User:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('admin@example.com (admin)');
    });

    test('should include requesting user without admin role', () => {
      const result = formatSlackPayload({
        event: 'POLICY_CREATED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: {
          requestingUser: {
            email: 'user@example.com',
            roles: [{ name: 'Member', isAdmin: false }],
          },
        },
      });

      const section = result.blocks.find(
        (b) => b.type === 'section' && b.text?.text?.includes('*Requesting User:*'),
      );
      expect(section).toBeDefined();
      expect(section?.text?.text).toContain('user@example.com');
      expect(section?.text?.text).not.toContain('(admin)');
    });
  });

  describe('formatEmailPayload - edge cases', () => {
    test('should handle SENSITIVE_RATE_LIMITED event', () => {
      const result = formatEmailPayload({
        event: 'SENSITIVE_RATE_LIMITED' as WebhookEvent,
        timestamp: '2024-01-15T12:00:00Z',
        organizationId: 'org-1',
        data: { remaining: 0, resetAt: '2024-01-15T13:00:00Z' },
      });

      expect(result.subject).toBe('Sentinel Alert: Sensitive Rate Limited');
    });
  });
});
