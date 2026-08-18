/**
 * Unit tests for OAuth Discovery Service
 * Tests RFC 9728 OAuth discovery functionality for MCP servers
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuth Discovery Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('discoverOAuthCapability', () => {
    test('should discover OAuth via Protected Resource Metadata', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      // Mock PRM response
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                resource: 'https://api.example.com',
                authorization_servers: ['https://auth.example.com'],
              }),
          });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                issuer: 'https://auth.example.com',
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
                registration_endpoint: 'https://auth.example.com/register',
                revocation_endpoint: 'https://auth.example.com/revoke',
                scopes_supported: ['read', 'write'],
                grant_types_supported: ['authorization_code'],
                code_challenge_methods_supported: ['S256'],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
      expect(result.authorizationEndpoint).toBe('https://auth.example.com/authorize');
      expect(result.tokenEndpoint).toBe('https://auth.example.com/token');
      expect(result.registrationEndpoint).toBe('https://auth.example.com/register');
      expect(result.revocationEndpoint).toBe('https://auth.example.com/revoke');
      expect(result.scopesSupported).toEqual(['read', 'write']);
    });

    test('should discover OAuth via direct Authorization Server Metadata', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://api.example.com/oauth/authorize',
                token_endpoint: 'https://api.example.com/oauth/token',
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
      expect(result.authorizationEndpoint).toBe('https://api.example.com/oauth/authorize');
      expect(result.tokenEndpoint).toBe('https://api.example.com/oauth/token');
    });

    test('should fallback to WWW-Authenticate header on 401', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      // Track which URLs have been called to ensure we handle the fallback path
      const calledUrls: string[] = [];

      mockFetch.mockImplementation((url: string) => {
        calledUrls.push(url);

        // Well-known endpoints return 404
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        // Direct AS metadata on the API server returns 404
        if (url === 'https://api.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve({ ok: false, status: 404 });
        }
        // The main URL returns 401 with WWW-Authenticate
        if (url === 'https://api.example.com') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: {
              get: (name: string) =>
                name === 'WWW-Authenticate'
                  ? 'Bearer realm="api", resource_metadata="https://api.example.com/.well-known/resource"'
                  : null,
            },
          });
        }
        // Resource metadata endpoint
        if (url === 'https://api.example.com/.well-known/resource') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_servers: ['https://auth.example.com'],
              }),
          });
        }
        // Auth server metadata
        if (url === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
      expect(result.authorizationEndpoint).toBe('https://auth.example.com/authorize');
    });

    test('should return supportsOAuth: false when no OAuth detected', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
        });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should normalize URL by removing trailing slash', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        // Check that the URL was normalized (no double slashes)
        expect(url).not.toContain('//.');
        return Promise.resolve({ ok: false, status: 404 });
      });

      await discoverOAuthCapability('https://api.example.com/');

      expect(mockFetch).toHaveBeenCalled();
    });

    test('should try origin URL first then full path', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      const calledUrls: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        calledUrls.push(url);
        return Promise.resolve({ ok: false, status: 404 });
      });

      await discoverOAuthCapability('https://mcp.notion.com/mcp');

      // Should try origin first (https://mcp.notion.com)
      expect(calledUrls[0]).toBe('https://mcp.notion.com/.well-known/oauth-protected-resource');
    });

    test('should handle fetch errors gracefully', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should handle invalid JSON responses', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        }),
      );

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should return supportsOAuth false when AS metadata is missing required endpoints', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                issuer: 'https://auth.example.com',
                // Missing authorization_endpoint and token_endpoint
              }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 200,
          headers: { get: () => null },
        });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should warn when PKCE S256 not supported', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');
      const { logger } = await import('../../../../packages/api/src/lib/logger.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
                code_challenge_methods_supported: ['plain'], // No S256
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await discoverOAuthCapability('https://api.example.com');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('does not support S256'));
    });

    test('should handle PRM without authorization_servers', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                resource: 'https://api.example.com',
                // No authorization_servers
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should use default grant types when not specified', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
                // No grant_types_supported
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
      expect(result.grantTypesSupported).toEqual(['authorization_code']);
    });

    test('should handle WWW-Authenticate with unquoted resource_metadata', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        // Well-known endpoints return 404
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url === 'https://api.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url === 'https://api.example.com') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: {
              get: (name: string) =>
                name === 'WWW-Authenticate'
                  ? 'Bearer resource_metadata=https://api.example.com/.well-known/resource'
                  : null,
            },
          });
        }
        if (url === 'https://api.example.com/.well-known/resource') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_servers: ['https://auth.example.com'],
              }),
          });
        }
        if (url === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
    });

    test('should handle non-401 response in WWW-Authenticate fallback', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        // Return 200 instead of 401
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
        });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should handle 401 without WWW-Authenticate header', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: {
            get: () => null, // No WWW-Authenticate header
          },
        });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should handle failed resource_metadata fetch', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url === 'https://api.example.com') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: {
              get: (name: string) =>
                name === 'WWW-Authenticate'
                  ? 'Bearer resource_metadata="https://api.example.com/.well-known/resource"'
                  : null,
            },
          });
        }
        if (url === 'https://api.example.com/.well-known/resource') {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should handle resource_metadata without authorization_servers', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url === 'https://api.example.com') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: {
              get: (name: string) =>
                name === 'WWW-Authenticate'
                  ? 'Bearer resource_metadata="https://api.example.com/.well-known/resource"'
                  : null,
            },
          });
        }
        if (url === 'https://api.example.com/.well-known/resource') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                // No authorization_servers
                resource: 'https://api.example.com',
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should return supportsOAuth false when AS metadata fetch fails', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_servers: ['https://auth.example.com'],
              }),
          });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(false);
    });

    test('should handle empty scopes_supported', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/.well-known/oauth-authorization-server')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
                // No scopes_supported
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await discoverOAuthCapability('https://api.example.com');

      expect(result.supportsOAuth).toBe(true);
      expect(result.scopesSupported).toEqual([]);
    });

    test('should handle invalid URL gracefully', async () => {
      const { discoverOAuthCapability } =
        await import('../../../../packages/api/src/services/oauthDiscovery.js');

      mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 404 }));

      const result = await discoverOAuthCapability('not-a-valid-url');

      expect(result.supportsOAuth).toBe(false);
    });
  });
});
