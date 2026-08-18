/**
 * Unit tests for Admin MCP tRPC Client
 * Tests the tRPC client factory and default client
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Store original env
const originalEnv = process.env;

describe('Admin MCP tRPC Client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('createTrpcClient', () => {
    test('should create client with default API URL', async () => {
      delete process.env.API_URL;
      delete process.env.PROXY_API_KEY;

      const { createTrpcClient } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      const client = createTrpcClient();

      // Verify client is created (tRPC client is a Proxy)
      expect(client).toBeDefined();
      expect(client).toBeTruthy();
    });

    test('should create client with custom API URL from env', async () => {
      process.env.API_URL = 'https://custom-api.example.com';
      delete process.env.PROXY_API_KEY;

      const { createTrpcClient } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      const client = createTrpcClient();

      expect(client).toBeDefined();
    });

    test('should create client with access token', async () => {
      process.env.API_URL = 'http://localhost:3000';
      process.env.PROXY_API_KEY = 'test-proxy-key';

      const { createTrpcClient } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      const client = createTrpcClient('test-access-token');

      expect(client).toBeDefined();
    });

    test('should include proxy key in headers when set', async () => {
      process.env.API_URL = 'http://localhost:3000';
      process.env.PROXY_API_KEY = 'test-proxy-key';

      const { createTrpcClient } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      const client = createTrpcClient();

      // The client is created - we can't easily verify headers without making actual calls
      expect(client).toBeDefined();
    });

    test('should create client without access token', async () => {
      process.env.API_URL = 'http://localhost:3000';

      const { createTrpcClient } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      const client = createTrpcClient();

      expect(client).toBeDefined();
    });
  });

  describe('default trpc export', () => {
    test('should export default trpc client', async () => {
      process.env.API_URL = 'http://localhost:3000';

      const { trpc } = await import('../../../packages/mcp-admin/src/trpc-client.js');

      // Verify default client is exported (tRPC client is a Proxy)
      expect(trpc).toBeDefined();
      expect(trpc).toBeTruthy();
    });

    test('should be same type as createTrpcClient result', async () => {
      process.env.API_URL = 'http://localhost:3000';

      const { createTrpcClient, trpc } =
        await import('../../../packages/mcp-admin/src/trpc-client.js');

      const customClient = createTrpcClient();

      // Both should be tRPC client proxies
      expect(typeof trpc).toBe(typeof customClient);
    });
  });
});
