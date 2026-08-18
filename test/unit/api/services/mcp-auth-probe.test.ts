/**
 * MCP Auth Type Probe Unit Tests
 * Tests for the probeAuthType function that auto-detects MCP server authentication requirements
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { probeAuthType } from '../../../../packages/api/src/services/mcp.ts';

// Store original fetch
const originalFetch = global.fetch;

// Helper to create mock responses with proper Response API
function mockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...headers,
  };

  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

  // Create a proper ReadableStream for the body
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bodyText));
      controller.close();
    },
  });

  const response: Response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    headers: new Headers(defaultHeaders),
    body: stream,
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: '',
    json: async () => body,
    text: async () => bodyText,
    arrayBuffer: async () => new TextEncoder().encode(bodyText).buffer,
    blob: async () => new Blob([bodyText]),
    formData: async () => new FormData(),
    bytes: async () => new TextEncoder().encode(bodyText),
    clone: function (): Response {
      return mockResponse(status, body, headers);
    },
  };
  return response;
}

// Helper to create HTML response
function mockHtmlResponse(status: number = 200): Response {
  const htmlContent = '<!DOCTYPE html><html><body>Not an MCP server</body></html>';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(htmlContent));
      controller.close();
    },
  });

  const response: Response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'text/html' }),
    body: stream,
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: '',
    json: async () => {
      throw new Error('Not JSON');
    },
    text: async () => htmlContent,
    arrayBuffer: async () => new TextEncoder().encode(htmlContent).buffer,
    blob: async () => new Blob([htmlContent]),
    formData: async () => new FormData(),
    bytes: async () => new TextEncoder().encode(htmlContent),
    clone: function (): Response {
      return mockHtmlResponse(status);
    },
  };
  return response;
}

describe('probeAuthType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('URL Validation', () => {
    test('should return unknown for invalid URL format', async () => {
      const result = await probeAuthType('not-a-valid-url');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('low');
      expect(result.reason).toContain('Invalid URL format');
    });

    test('should return unknown for malformed URL', async () => {
      const result = await probeAuthType('http://');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('low');
    });
  });

  describe('Endpoint Validation (Step 1)', () => {
    test('should return unknown for 404 response', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse(404));

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('404');
      expect(result.reason).toContain('path does not exist');
    });

    test('should return unknown for 405 response', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse(405));

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('405');
    });

    test('should return unknown for HTML response (not MCP server)', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockHtmlResponse());

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('HTML');
      expect(result.reason).toContain('does not appear to be an MCP server');
    });

    test('should return unknown for 5xx server error', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse(500));

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('medium');
      expect(result.reason).toContain('500');
      expect(result.reason).toContain('misconfigured');
    });

    test('should return unknown for connection timeout', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('did not respond');
    });

    test('should return unknown for connection refused', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('did not respond');
    });

    test('should return unknown for ENOTFOUND (DNS failure)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));

      const result = await probeAuthType('https://nonexistent.invalid/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.confidence).toBe('high');
    });
  });

  describe('No Auth Detection (Step 2)', () => {
    test('should detect NONE auth when unauthenticated connection succeeds', async () => {
      // Mock fetch to simulate a full MCP handshake without auth
      // The MCP SDK's StreamableHTTPClientTransport:
      // 1. First sends GET to try SSE stream (we return 405 - not supported)
      // 2. Then sends POST with JSON-RPC messages (initialize, tools/list, etc.)
      const fetchCalls: { url: string; method: string; body?: string }[] = [];

      global.fetch = vi
        .fn()
        .mockImplementation(async (input: string | URL | Request, options?: RequestInit) => {
          const url = input.toString();
          const method = options?.method || 'GET';
          const bodyText = typeof options?.body === 'string' ? options.body : '';

          fetchCalls.push({ url, method, body: bodyText });
          console.log(
            `[MOCK] ${method} ${url} body type: ${typeof options?.body}, body: ${bodyText.substring(0, 100)}`,
          );

          // Handle .well-known endpoints (should return 404 - no OAuth)
          if (url.includes('.well-known') || url.endsWith('/authorize')) {
            return mockResponse(404);
          }

          // MCP SDK first tries GET for SSE - return 405 (Method Not Allowed)
          // This tells the SDK that SSE is not supported, which is fine
          if (method === 'GET') {
            return mockResponse(405, {}, { Allow: 'POST' });
          }

          // For POST requests, parse the JSON-RPC body and respond appropriately
          console.log(
            `[MOCK] Checking POST condition: method='${method}', bodyText length=${bodyText.length}`,
          );
          if (method === 'POST' && bodyText) {
            console.log('[MOCK] Entered POST handling block');
            let bodyJson: { method?: string; id?: number } = {};
            try {
              bodyJson = JSON.parse(bodyText);
              console.log('[MOCK] Parsed body:', JSON.stringify(bodyJson).substring(0, 100));
            } catch (e) {
              // If body parsing fails, just return a generic success
              console.log('[MOCK] Parse failed:', e);
            }

            // MCP initialize request
            if (bodyJson.method === 'initialize') {
              const response = {
                jsonrpc: '2.0',
                id: bodyJson.id,
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: { tools: {} },
                  serverInfo: { name: 'test-server', version: '1.0.0' },
                },
              };
              console.log('[MOCK] Returning initialize response:', JSON.stringify(response));
              return mockResponse(200, response);
            }

            // MCP tools/list request
            if (bodyJson.method === 'tools/list') {
              return mockResponse(200, {
                jsonrpc: '2.0',
                id: bodyJson.id,
                result: { tools: [] },
              });
            }

            // MCP notifications/initialized (no response needed but SDK may send it)
            if (bodyJson.method === 'notifications/initialized') {
              return mockResponse(200, {});
            }

            // Any other POST request - return success
            return mockResponse(200, { jsonrpc: '2.0', result: {} });
          }

          return mockResponse(200);
        });

      const result = await probeAuthType('https://example.com/mcp');

      // Debug output
      console.log('Fetch calls:', JSON.stringify(fetchCalls, null, 2));
      console.log('Result:', JSON.stringify(result, null, 2));

      expect(result.detectedAuthType).toBe('none');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('unauthenticated access');
    });
  });

  describe('OAuth Detection - RFC 8414 Metadata (Step 3)', () => {
    test('should detect OAuth via .well-known/oauth-authorization-server', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        // First call: endpoint probe returns 401 (auth required)
        if (callCount === 1) {
          return Promise.resolve(mockResponse(401, {}, { 'www-authenticate': 'Bearer' }));
        }
        // OAuth metadata endpoint
        if (url.includes('.well-known/oauth-authorization-server')) {
          return Promise.resolve(
            mockResponse(200, {
              issuer: 'https://example.com',
              authorization_endpoint: 'https://example.com/authorize',
              token_endpoint: 'https://example.com/token',
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.confidence).toBe('high');
      expect(result.supportsOAuth).toBe(true);
      expect(result.authorizationEndpoint).toBe('https://example.com/authorize');
      expect(result.reason).toContain('oauth-authorization-server');
    });
  });

  describe('OAuth Detection - RFC 9728 WWW-Authenticate (Step 4)', () => {
    test('should detect OAuth via WWW-Authenticate resource parameter', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((_url: string) => {
        callCount++;
        // First call: endpoint probe returns 401 with resource parameter
        if (callCount === 1) {
          return Promise.resolve(
            mockResponse(
              401,
              {},
              {
                'www-authenticate': 'Bearer resource="https://example.com/mcp"',
              },
            ),
          );
        }
        // All other .well-known endpoints return 404
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.confidence).toBe('high');
      expect(result.supportsOAuth).toBe(true);
      expect(result.reason).toContain('WWW-Authenticate');
      expect(result.reason).toContain('RFC 9728');
    });

    test('should parse unquoted resource parameter', async () => {
      // MCP client fails (auth required) - this is the default behavior

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        // Endpoint probe with unquoted resource
        if (options?.method === 'POST') {
          return Promise.resolve(
            mockResponse(
              401,
              {},
              {
                'www-authenticate': 'Bearer resource=https://example.com/mcp',
              },
            ),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.reason).toContain('RFC 9728');
    });
  });

  describe('OAuth Detection - Protected Resource Metadata (Step 5)', () => {
    test('should detect OAuth via .well-known/oauth-protected-resource', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        // First call: endpoint probe returns 401
        if (callCount === 1) {
          return Promise.resolve(mockResponse(401));
        }
        // OAuth authorization server metadata - not found
        if (url.includes('.well-known/oauth-authorization-server')) {
          return Promise.resolve(mockResponse(404));
        }
        // OAuth protected resource metadata
        if (url.includes('.well-known/oauth-protected-resource')) {
          return Promise.resolve(
            mockResponse(200, {
              resource: 'https://example.com/mcp',
              authorization_servers: ['https://auth.example.com'],
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.confidence).toBe('high');
      expect(result.supportsOAuth).toBe(true);
      expect(result.reason).toContain('oauth-protected-resource');
    });

    test('should fetch auth endpoint from authorization server when protected resource has authorization_servers', async () => {
      // This test covers line 680 - when auth server metadata is successfully parsed
      global.fetch = vi.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        const method = options?.method || 'GET';

        // Endpoint probe (POST) returns 401 (auth required)
        if (method === 'POST' && urlStr === 'https://example.com/mcp') {
          return Promise.resolve(mockResponse(401));
        }
        // OAuth authorization server metadata at base URL - not found
        if (urlStr === 'https://example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(mockResponse(404));
        }
        // OAuth protected resource metadata - returns with authorization_servers array
        if (urlStr === 'https://example.com/.well-known/oauth-protected-resource') {
          return Promise.resolve(
            mockResponse(200, {
              resource: 'https://example.com/mcp',
              authorization_servers: ['https://auth.example.com'],
            }),
          );
        }
        // Auth server metadata from authorization_servers URL - this covers line 680
        if (urlStr === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(
            mockResponse(200, {
              authorization_endpoint: 'https://auth.example.com/oauth/authorize',
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.confidence).toBe('high');
      expect(result.supportsOAuth).toBe(true);
      expect(result.authorizationEndpoint).toBe('https://auth.example.com/oauth/authorize');
      expect(result.reason).toContain('oauth-protected-resource');
    });

    test('should handle auth server metadata without authorization_endpoint', async () => {
      // Test when auth server metadata exists but lacks authorization_endpoint
      global.fetch = vi.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        const method = options?.method || 'GET';

        if (method === 'POST' && urlStr === 'https://example.com/mcp') {
          return Promise.resolve(mockResponse(401));
        }
        if (urlStr === 'https://example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(mockResponse(404));
        }
        if (urlStr === 'https://example.com/.well-known/oauth-protected-resource') {
          return Promise.resolve(
            mockResponse(200, {
              resource: 'https://example.com/mcp',
              authorization_servers: ['https://auth.example.com'],
            }),
          );
        }
        // Auth server metadata from authorization_servers URL - no authorization_endpoint
        if (urlStr === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(
            mockResponse(200, {
              issuer: 'https://auth.example.com',
              // No authorization_endpoint
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.authorizationEndpoint).toBeUndefined();
    });

    test('should handle auth server metadata fetch failure', async () => {
      // Test when auth server metadata fails to fetch
      global.fetch = vi.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        const method = options?.method || 'GET';

        if (method === 'POST' && urlStr === 'https://example.com/mcp') {
          return Promise.resolve(mockResponse(401));
        }
        if (urlStr === 'https://example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(mockResponse(404));
        }
        if (urlStr === 'https://example.com/.well-known/oauth-protected-resource') {
          return Promise.resolve(
            mockResponse(200, {
              resource: 'https://example.com/mcp',
              authorization_servers: ['https://auth.example.com'],
            }),
          );
        }
        // Auth server metadata fails
        if (urlStr === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(mockResponse(500));
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.authorizationEndpoint).toBeUndefined();
    });
  });

  describe('OAuth Detection - Fallback /authorize (Step 6)', () => {
    test('should detect OAuth via /authorize endpoint existence', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        callCount++;
        // First call: endpoint probe returns 401
        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }
        // .well-known endpoints - not found
        if (url.includes('.well-known')) {
          return Promise.resolve(mockResponse(404));
        }
        // /authorize endpoint exists (returns 302 redirect or 400 missing params)
        if (url.endsWith('/authorize')) {
          return Promise.resolve(mockResponse(302));
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.confidence).toBe('high');
      expect(result.supportsOAuth).toBe(true);
      expect(result.reason).toContain('/authorize');
      expect(result.reason).toContain('fallback');
    });

    test('should accept /authorize returning 400 (missing params)', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        callCount++;
        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }
        if (url.includes('.well-known')) {
          return Promise.resolve(mockResponse(404));
        }
        if (url.endsWith('/authorize')) {
          return Promise.resolve(mockResponse(400)); // Missing required params
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
      expect(result.authorizationEndpoint).toBe('https://example.com/authorize');
    });
  });

  describe('API Key Detection by Elimination (Step 7)', () => {
    test('should detect API_KEY when auth required but no OAuth indicators', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        callCount++;
        // First call: endpoint probe returns 401/403 (auth required)
        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }
        // All discovery endpoints return 404
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('api_key');
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('elimination');
      expect(result.reason).toContain('no OAuth indicators');
    });

    test('should detect API_KEY for 403 Forbidden response', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        callCount++;
        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(403));
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('api_key');
    });
  });

  describe('Edge Cases', () => {
    test('should use base URL for OAuth discovery, not endpoint path', async () => {
      // MCP client fails (auth required) - this is the default behavior

      const fetchCalls: string[] = [];
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        fetchCalls.push(url);
        callCount++;

        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }

        // Check OAuth metadata is fetched at base URL
        if (url === 'https://example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve(
            mockResponse(200, {
              authorization_endpoint: 'https://example.com/authorize',
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      await probeAuthType('https://example.com/api/v1/mcp');

      // Should probe at base URL, not at /api/v1/mcp/.well-known/...
      expect(fetchCalls).toContain('https://example.com/.well-known/oauth-authorization-server');
      expect(fetchCalls).not.toContain(
        'https://example.com/api/v1/mcp/.well-known/oauth-authorization-server',
      );
    });

    test('should handle URL with port correctly', async () => {
      // MCP client fails (auth required) - this is the default behavior

      const fetchCalls: string[] = [];

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        fetchCalls.push(url);
        if (options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }
        return Promise.resolve(mockResponse(404));
      });

      await probeAuthType('https://example.com:8443/mcp');

      // Should include port in base URL
      expect(fetchCalls).toContain(
        'https://example.com:8443/.well-known/oauth-authorization-server',
      );
    });

    test('should handle 400 JSON-RPC error as valid MCP endpoint', async () => {
      // MCP client fails (auth required) - this is the default behavior

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          // 400 with JSON = JSON-RPC error = valid MCP server
          return Promise.resolve(
            mockResponse(400, {
              jsonrpc: '2.0',
              error: { code: -32600, message: 'Invalid Request' },
            }),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      // Should continue detection, not fail
      expect(result.detectedAuthType).toBe('api_key'); // Falls through to elimination
    });

    test('should handle mixed case WWW-Authenticate header', async () => {
      // MCP client fails (auth required) - this is the default behavior

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return Promise.resolve(
            mockResponse(
              401,
              {},
              {
                'www-authenticate': 'Bearer RESOURCE="https://example.com/mcp"', // uppercase
              },
            ),
          );
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.detectedAuthType).toBe('oauth');
    });
  });

  describe('Confidence Levels', () => {
    test('should return high confidence for definitive NONE detection', async () => {
      // Mock fetch to simulate a full MCP handshake without auth (same as NONE detection test)
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.includes('.well-known') || url.endsWith('/authorize')) {
          return mockResponse(404);
        }
        if (options?.method === 'POST' && options.body) {
          const bodyText = typeof options.body === 'string' ? options.body : '';
          let bodyJson: { method?: string; id?: number } = {};
          try {
            bodyJson = JSON.parse(bodyText);
          } catch {
            // ignore
          }
          if (bodyJson.method === 'initialize') {
            return mockResponse(200, {
              jsonrpc: '2.0',
              id: bodyJson.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'test-server', version: '1.0.0' },
              },
            });
          }
          if (bodyJson.method === 'tools/list') {
            return mockResponse(200, {
              jsonrpc: '2.0',
              id: bodyJson.id,
              result: { tools: [] },
            });
          }
          return mockResponse(200, { jsonrpc: '2.0', result: {} });
        }
        return mockResponse(200);
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.confidence).toBe('high');
    });

    test('should return high confidence for OAuth metadata discovery', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockResponse(401));
        if (url.includes('.well-known/oauth-authorization-server')) {
          return Promise.resolve(mockResponse(200, { authorization_endpoint: 'https://x/auth' }));
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.confidence).toBe('high');
    });

    test('should return high confidence for API_KEY by elimination', async () => {
      // MCP client fails (auth required) - this is the default behavior

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        callCount++;
        if (callCount === 1 && options?.method === 'POST') {
          return Promise.resolve(mockResponse(401));
        }
        return Promise.resolve(mockResponse(404));
      });

      const result = await probeAuthType('https://example.com/mcp');

      expect(result.confidence).toBe('high');
    });
  });

  describe('Timeout Handling', () => {
    test('should handle slow endpoints gracefully', async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 100);
        });
      });

      const result = await probeAuthType('https://slow-server.example.com/mcp');

      expect(result.detectedAuthType).toBe('unknown');
      expect(result.reason).toContain('did not respond');
    });
  });
});
