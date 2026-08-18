/**
 * Server Utilities Unit Tests
 * Tests for MCP server identification functions
 */

import { describe, expect, test } from 'vitest';
import {
  createQualifiedToolName,
  getServerKeyFromUrl,
  parseQualifiedToolName,
} from '../../../../packages/api/src/lib/serverUtils.js';

describe('Server Utilities', () => {
  describe('getServerKeyFromUrl', () => {
    describe('valid URLs', () => {
      test('should extract hostname and port from URL with explicit port', () => {
        const result = getServerKeyFromUrl('http://localhost:3000/mcp');
        expect(result).toBe('localhost:3000');
      });

      test('should extract hostname only for URLs without explicit port', () => {
        const result = getServerKeyFromUrl('https://github.com/api/mcp');
        expect(result).toBe('github.com');
      });

      test('should handle URL with default HTTP port', () => {
        const result = getServerKeyFromUrl('http://api.example.com/path');
        expect(result).toBe('api.example.com');
      });

      test('should handle URL with default HTTPS port', () => {
        const result = getServerKeyFromUrl('https://api.notion.so/v1/mcp');
        expect(result).toBe('api.notion.so');
      });

      test('should handle URL with non-standard port', () => {
        const result = getServerKeyFromUrl('http://192.168.1.100:8080/mcp');
        expect(result).toBe('192.168.1.100:8080');
      });

      test('should handle URL with subdomain', () => {
        const result = getServerKeyFromUrl('https://api.staging.example.com/mcp');
        expect(result).toBe('api.staging.example.com');
      });

      test('should handle URL with query parameters', () => {
        const result = getServerKeyFromUrl('http://localhost:5000?token=abc');
        expect(result).toBe('localhost:5000');
      });

      test('should handle URL with hash fragment', () => {
        const result = getServerKeyFromUrl('http://localhost:3000#section');
        expect(result).toBe('localhost:3000');
      });

      test('should handle URL with authentication', () => {
        const result = getServerKeyFromUrl('http://user:pass@localhost:4000/mcp');
        expect(result).toBe('localhost:4000');
      });

      test('should handle simple domain URL', () => {
        const result = getServerKeyFromUrl('https://slack.com');
        expect(result).toBe('slack.com');
      });

      test('should handle IPv4 address without port', () => {
        const result = getServerKeyFromUrl('http://127.0.0.1/api');
        expect(result).toBe('127.0.0.1');
      });

      test('should handle IPv4 address with port', () => {
        const result = getServerKeyFromUrl('http://127.0.0.1:9000/api');
        expect(result).toBe('127.0.0.1:9000');
      });

      test('should handle IPv6 address', () => {
        const result = getServerKeyFromUrl('http://[::1]:3000/mcp');
        expect(result).toBe('[::1]:3000');
      });

      test('should handle wss protocol', () => {
        const result = getServerKeyFromUrl('wss://websocket.example.com:8443/ws');
        expect(result).toBe('websocket.example.com:8443');
      });
    });

    describe('invalid URLs - graceful degradation', () => {
      test('should return original string for invalid URL', () => {
        const result = getServerKeyFromUrl('not-a-valid-url');
        expect(result).toBe('not-a-valid-url');
      });

      test('should return original string for empty string', () => {
        const result = getServerKeyFromUrl('');
        expect(result).toBe('');
      });

      test('should return original string for malformed URL', () => {
        const result = getServerKeyFromUrl('://missing-protocol.com');
        expect(result).toBe('://missing-protocol.com');
      });

      test('should return original string for relative path', () => {
        const result = getServerKeyFromUrl('/api/mcp');
        expect(result).toBe('/api/mcp');
      });

      test('should return original string for protocol-only', () => {
        const result = getServerKeyFromUrl('http://');
        expect(result).toBe('http://');
      });

      test('should return original string for URL with spaces', () => {
        const result = getServerKeyFromUrl('http://local host:3000');
        expect(result).toBe('http://local host:3000');
      });

      test('should return original string for domain without protocol', () => {
        const result = getServerKeyFromUrl('example.com');
        expect(result).toBe('example.com');
      });

      test('should handle localhost with trailing colon as valid URL', () => {
        // 'localhost:' is a valid URL with empty port, parsed as hostname only
        const result = getServerKeyFromUrl('localhost:');
        expect(result).toBe('');
      });
    });
  });

  describe('createQualifiedToolName', () => {
    describe('with valid URLs', () => {
      test('should create qualified name with hostname and port', () => {
        const result = createQualifiedToolName('http://localhost:3000', 'createPR');
        expect(result).toBe('localhost:3000::createPR');
      });

      test('should create qualified name with hostname only', () => {
        const result = createQualifiedToolName('https://github.com/api', 'createPR');
        expect(result).toBe('github.com::createPR');
      });

      test('should handle complex server URLs', () => {
        const result = createQualifiedToolName('https://api.notion.so/v1/mcp', 'createPage');
        expect(result).toBe('api.notion.so::createPage');
      });

      test('should handle tool names with underscores', () => {
        const result = createQualifiedToolName('http://localhost:8000', 'create_new_issue');
        expect(result).toBe('localhost:8000::create_new_issue');
      });

      test('should handle tool names with hyphens', () => {
        const result = createQualifiedToolName('http://localhost:8000', 'send-message');
        expect(result).toBe('localhost:8000::send-message');
      });

      test('should handle tool names with numbers', () => {
        const result = createQualifiedToolName('http://localhost:8000', 'v2GetUsers');
        expect(result).toBe('localhost:8000::v2GetUsers');
      });

      test('should handle empty tool name', () => {
        const result = createQualifiedToolName('http://localhost:3000', '');
        expect(result).toBe('localhost:3000::');
      });
    });

    describe('with invalid URLs - graceful degradation', () => {
      test('should use original string for invalid URL', () => {
        const result = createQualifiedToolName('not-a-url', 'tool');
        expect(result).toBe('not-a-url::tool');
      });

      test('should handle server key format directly', () => {
        const result = createQualifiedToolName('github.com', 'createPR');
        expect(result).toBe('github.com::createPR');
      });

      test('should handle empty server URL', () => {
        const result = createQualifiedToolName('', 'tool');
        expect(result).toBe('::tool');
      });
    });

    describe('real-world use cases', () => {
      test('should create qualified name for GitHub MCP server', () => {
        const result = createQualifiedToolName('https://api.github.com/mcp', 'create_pull_request');
        expect(result).toBe('api.github.com::create_pull_request');
      });

      test('should create qualified name for local development server', () => {
        const result = createQualifiedToolName('http://localhost:5173/mcp', 'executeQuery');
        expect(result).toBe('localhost:5173::executeQuery');
      });

      test('should create qualified name for Slack MCP server', () => {
        const result = createQualifiedToolName('https://slack.com/api/mcp', 'sendMessage');
        expect(result).toBe('slack.com::sendMessage');
      });
    });
  });

  describe('parseQualifiedToolName', () => {
    describe('valid qualified names', () => {
      test('should parse qualified name with hostname and port', () => {
        const result = parseQualifiedToolName('localhost:3000::createPR');
        expect(result).toEqual({ serverKey: 'localhost:3000', toolName: 'createPR' });
      });

      test('should parse qualified name with hostname only', () => {
        const result = parseQualifiedToolName('github.com::createPR');
        expect(result).toEqual({ serverKey: 'github.com', toolName: 'createPR' });
      });

      test('should parse qualified name with subdomain', () => {
        const result = parseQualifiedToolName('api.notion.so::createPage');
        expect(result).toEqual({ serverKey: 'api.notion.so', toolName: 'createPage' });
      });

      test('should parse qualified name with tool containing underscores', () => {
        const result = parseQualifiedToolName('slack.com::send_direct_message');
        expect(result).toEqual({ serverKey: 'slack.com', toolName: 'send_direct_message' });
      });

      test('should parse qualified name with tool containing hyphens', () => {
        const result = parseQualifiedToolName('api.example.com::get-all-users');
        expect(result).toEqual({ serverKey: 'api.example.com', toolName: 'get-all-users' });
      });

      test('should parse qualified name with IPv4 address and port', () => {
        const result = parseQualifiedToolName('192.168.1.1:8080::healthCheck');
        expect(result).toEqual({ serverKey: '192.168.1.1:8080', toolName: 'healthCheck' });
      });

      test('should parse qualified name with IPv6 address (splits on first ::)', () => {
        // Note: IPv6 addresses contain ::, so splitting on :: gives unexpected results
        // This documents the current behavior - IPv6 support would require different parsing
        const result = parseQualifiedToolName('[::1]:3000::ping');
        // Current implementation splits on '::', which breaks IPv6 parsing
        expect(result).toBeNull();
      });
    });

    describe('invalid qualified names', () => {
      test('should return null for string without separator', () => {
        const result = parseQualifiedToolName('github.com-createPR');
        expect(result).toBeNull();
      });

      test('should return null for single colon separator', () => {
        const result = parseQualifiedToolName('github.com:createPR');
        expect(result).toBeNull();
      });

      test('should return null for empty string', () => {
        const result = parseQualifiedToolName('');
        expect(result).toBeNull();
      });

      test('should return null for string with only separator', () => {
        const result = parseQualifiedToolName('::');
        expect(result).toBeNull();
      });

      test('should return null for missing server key', () => {
        const result = parseQualifiedToolName('::createPR');
        expect(result).toBeNull();
      });

      test('should return null for missing tool name', () => {
        const result = parseQualifiedToolName('github.com::');
        expect(result).toBeNull();
      });

      test('should return null for multiple separators', () => {
        const result = parseQualifiedToolName('github.com::tool::extra');
        expect(result).toBeNull();
      });

      test('should parse triple colon as server key with tool name starting with colon', () => {
        // 'github.com:::createPR' splits into ['github.com', ':createPR'] on first '::'
        const result = parseQualifiedToolName('github.com:::createPR');
        expect(result).toEqual({ serverKey: 'github.com', toolName: ':createPR' });
      });

      test('should parse whitespace-only parts as valid (does not trim)', () => {
        // Current implementation does not trim whitespace
        const result = parseQualifiedToolName('   ::   ');
        expect(result).toEqual({ serverKey: '   ', toolName: '   ' });
      });
    });

    describe('edge cases', () => {
      test('should handle server key with multiple dots', () => {
        const result = parseQualifiedToolName('api.staging.v2.example.com::tool');
        expect(result).toEqual({ serverKey: 'api.staging.v2.example.com', toolName: 'tool' });
      });

      test('should handle tool name with single character', () => {
        const result = parseQualifiedToolName('example.com::x');
        expect(result).toEqual({ serverKey: 'example.com', toolName: 'x' });
      });

      test('should handle server key with single character', () => {
        const result = parseQualifiedToolName('x::tool');
        expect(result).toEqual({ serverKey: 'x', toolName: 'tool' });
      });

      test('should preserve case in server key and tool name', () => {
        const result = parseQualifiedToolName('GitHub.COM::CreatePullRequest');
        expect(result).toEqual({ serverKey: 'GitHub.COM', toolName: 'CreatePullRequest' });
      });

      test('should handle numeric tool names', () => {
        const result = parseQualifiedToolName('example.com::12345');
        expect(result).toEqual({ serverKey: 'example.com', toolName: '12345' });
      });
    });
  });

  describe('round-trip consistency', () => {
    test('should parse what createQualifiedToolName produces', () => {
      const serverUrl = 'http://localhost:3000/mcp';
      const toolName = 'createPR';

      const qualified = createQualifiedToolName(serverUrl, toolName);
      const parsed = parseQualifiedToolName(qualified);

      expect(parsed).not.toBeNull();
      expect(parsed?.serverKey).toBe('localhost:3000');
      expect(parsed?.toolName).toBe(toolName);
    });

    test('should maintain consistency for various server URLs', () => {
      const testCases = [
        { url: 'https://github.com/api', tool: 'createIssue', expectedKey: 'github.com' },
        { url: 'http://localhost:8080', tool: 'runQuery', expectedKey: 'localhost:8080' },
        { url: 'https://api.slack.com/mcp', tool: 'sendMessage', expectedKey: 'api.slack.com' },
        { url: 'http://192.168.1.1:9000', tool: 'deploy', expectedKey: '192.168.1.1:9000' },
      ];

      for (const { url, tool, expectedKey } of testCases) {
        const qualified = createQualifiedToolName(url, tool);
        const parsed = parseQualifiedToolName(qualified);

        expect(parsed).not.toBeNull();
        expect(parsed?.serverKey).toBe(expectedKey);
        expect(parsed?.toolName).toBe(tool);
      }
    });

    test('should handle edge case URLs in round-trip', () => {
      const invalidUrl = 'not-a-url';
      const toolName = 'tool';

      const qualified = createQualifiedToolName(invalidUrl, toolName);
      const parsed = parseQualifiedToolName(qualified);

      expect(qualified).toBe('not-a-url::tool');
      expect(parsed).toEqual({ serverKey: 'not-a-url', toolName: 'tool' });
    });
  });

  describe('integration with tool pattern matching', () => {
    test('should produce consistent server keys for same URL', () => {
      const url = 'http://localhost:3000/mcp';

      const key1 = getServerKeyFromUrl(url);
      const key2 = getServerKeyFromUrl(url);

      expect(key1).toBe(key2);
      expect(key1).toBe('localhost:3000');
    });

    test('should distinguish different ports on same host', () => {
      const url1 = 'http://localhost:3000/mcp';
      const url2 = 'http://localhost:4000/mcp';

      expect(getServerKeyFromUrl(url1)).toBe('localhost:3000');
      expect(getServerKeyFromUrl(url2)).toBe('localhost:4000');
      expect(getServerKeyFromUrl(url1)).not.toBe(getServerKeyFromUrl(url2));
    });

    test('should treat default port URLs consistently', () => {
      const httpUrl = 'http://example.com/path';
      const httpsUrl = 'https://example.com/path';

      expect(getServerKeyFromUrl(httpUrl)).toBe('example.com');
      expect(getServerKeyFromUrl(httpsUrl)).toBe('example.com');
    });
  });
});
