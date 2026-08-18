/**
 * Tool Validation Service Integration Tests
 * Tests for tool name validation and normalization using server keys (hostname:port from URL)
 *
 * IMPORTANT: Tool patterns use serverKey (hostname:port from URL), not friendly server names
 * Example: "github.com::createPR" not "GitHub::createPR"
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getToolValidationErrorMessage,
  normalizeToolNames,
  validateToolNamesForOrganization,
} from '../../../packages/api/src/services/toolValidation.js';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestMcpServer, createTestOrganization } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';

describe.skipIf(!hasDatabaseUrl())('Tool Validation Service', () => {
  let tenant: TestTenant;

  beforeEach(async () => {
    tenant = await createTestTenant();
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('normalizeToolNames', () => {
    test('should trim whitespace', () => {
      const result = normalizeToolNames(['  github.com::getFile  ', ' api.notion.so::createPage ']);
      expect(result).toEqual(['github.com::getFile', 'api.notion.so::createPage']);
    });

    test('should remove empty strings', () => {
      const result = normalizeToolNames([
        'github.com::getFile',
        '',
        'api.notion.so::createPage',
        '   ',
      ]);
      expect(result).toEqual(['github.com::getFile', 'api.notion.so::createPage']);
    });

    test('should remove duplicates', () => {
      const result = normalizeToolNames([
        'github.com::getFile',
        'api.notion.so::createPage',
        'github.com::getFile',
      ]);
      expect(result).toEqual(['github.com::getFile', 'api.notion.so::createPage']);
    });

    test('should handle empty array', () => {
      const result = normalizeToolNames([]);
      expect(result).toEqual([]);
    });

    test('should preserve order of first occurrence', () => {
      const result = normalizeToolNames([
        'github.com::getFile',
        'api.notion.so::createPage',
        'github.com::getFile',
        'api.notion.so::createPage',
      ]);
      expect(result).toEqual(['github.com::getFile', 'api.notion.so::createPage']);
    });
  });

  describe('validateToolNamesForOrganization', () => {
    test('should validate existing tools using serverKey from URL', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub', // Friendly name
        url: 'https://github.com/mcp', // URL -> serverKey: github.com
      });

      // Create tools for the server
      await prisma.mcpTool.create({
        data: {
          mcpServerId: server.id,
          name: 'getFile',
        },
      });

      // Use serverKey (github.com) NOT friendly name (GitHub)
      const result = await validateToolNamesForOrganization(tenant.orgId, ['github.com::getFile']);

      expect(result.toolNames).toEqual(['github.com::getFile']);
      expect(result.invalidFormat).toHaveLength(0);
      expect(result.unknownServer).toHaveLength(0);
      expect(result.unknownTool).toHaveLength(0);
    });

    test('should detect invalid format', async () => {
      const result = await validateToolNamesForOrganization(tenant.orgId, [
        'invalid-format', // No :: separator
        'github.com::tool', // Valid format
      ]);

      expect(result.invalidFormat).toContain('invalid-format');
      expect(result.toolNames).toContain('github.com::tool');
    });

    test('should detect unknown server (using serverKey)', async () => {
      const result = await validateToolNamesForOrganization(tenant.orgId, [
        'nonexistent.server.com::tool',
      ]);

      expect(result.unknownServer).toContain('nonexistent.server.com::tool');
    });

    test('should detect unknown tool', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
      });

      await prisma.mcpTool.create({
        data: {
          mcpServerId: server.id,
          name: 'getFile',
        },
      });

      const result = await validateToolNamesForOrganization(tenant.orgId, [
        'github.com::unknownTool',
      ]);

      expect(result.unknownTool).toContain('github.com::unknownTool');
    });

    test('should handle server with port in URL', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Local Server 8080', // Friendly name (not used in patterns)
        url: 'http://localhost:8080', // URL -> serverKey: localhost:8080
      });

      await prisma.mcpTool.create({
        data: {
          mcpServerId: server.id,
          name: 'getFile',
        },
      });

      // Use serverKey with port
      const result = await validateToolNamesForOrganization(tenant.orgId, [
        'localhost:8080::getFile',
      ]);

      expect(result.unknownTool).toHaveLength(0);
      expect(result.unknownServer).toHaveLength(0);
    });

    test('should handle empty tool names', async () => {
      const result = await validateToolNamesForOrganization(tenant.orgId, []);

      expect(result.toolNames).toHaveLength(0);
      expect(result.invalidFormat).toContain('<empty>');
    });

    test('should not leak tools from other organizations', async () => {
      // Use tenant.orgId as org1, create a second org for isolation testing
      const org2 = await createTestOrganization({ name: 'Other Org' });

      const server1 = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
      });

      await prisma.mcpTool.create({
        data: {
          mcpServerId: server1.id,
          name: 'getFile',
        },
      });

      // Try to validate tool from tenant's server using org2's context
      const result = await validateToolNamesForOrganization(org2.id, ['github.com::getFile']);

      expect(result.unknownServer).toContain('github.com::getFile');
    });

    test('should handle multiple servers with different URLs', async () => {
      // Server 1: github.com (default port)
      const server1 = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub API',
        url: 'https://github.com/mcp', // serverKey: github.com
      });

      // Server 2: github.com:8080 (custom port)
      const server2 = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub 8080',
        url: 'https://github.com:8080/mcp', // serverKey: github.com:8080
      });

      await prisma.mcpTool.create({
        data: {
          mcpServerId: server1.id,
          name: 'getFile',
        },
      });

      await prisma.mcpTool.create({
        data: {
          mcpServerId: server2.id,
          name: 'createPR',
        },
      });

      // Use serverKeys derived from URLs
      const result = await validateToolNamesForOrganization(tenant.orgId, [
        'github.com::getFile',
        'github.com:8080::createPR',
      ]);

      expect(result.unknownTool).toHaveLength(0);
      expect(result.unknownServer).toHaveLength(0);
    });

    test('should reject friendly names (they are not valid serverKeys)', async () => {
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub', // Friendly name
        url: 'https://github.com/mcp', // serverKey: github.com
      });

      // Trying to use friendly name "GitHub" instead of serverKey "github.com"
      // "GitHub" with capital G looks like a friendly name, not a hostname
      // This will be flagged as invalid format because serverKeys must be valid hostnames
      const result = await validateToolNamesForOrganization(tenant.orgId, ['GitHub::tool']);

      // Capital letters are technically valid in hostnames (case-insensitive)
      // so this will be treated as unknown server, not invalid format
      expect(result.unknownServer).toContain('GitHub::tool');
    });
  });

  describe('getToolValidationErrorMessage', () => {
    test('should return null for valid result', () => {
      const result = {
        toolNames: ['github.com::getFile'],
        invalidFormat: [],
        unknownServer: [],
        unknownTool: [],
      };

      expect(getToolValidationErrorMessage(result)).toBeNull();
    });

    test('should include invalid format message', () => {
      const result = {
        toolNames: ['github.com::getFile'],
        invalidFormat: ['invalid-format'],
        unknownServer: [],
        unknownTool: [],
      };

      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Invalid tool pattern format');
      expect(message).toContain('invalid-format');
    });

    test('should include unknown server message', () => {
      const result = {
        toolNames: ['github.com::getFile'],
        invalidFormat: [],
        unknownServer: ['nonexistent.server.com::tool'],
        unknownTool: [],
      };

      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Unknown MCP server keys');
      expect(message).toContain('nonexistent.server.com::tool');
    });

    test('should include unknown tool message', () => {
      const result = {
        toolNames: ['github.com::getFile'],
        invalidFormat: [],
        unknownServer: [],
        unknownTool: ['github.com::unknownTool'],
      };

      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Unknown tools');
      expect(message).toContain('github.com::unknownTool');
    });

    test('should combine multiple error messages', () => {
      const result = {
        toolNames: ['github.com::getFile'],
        invalidFormat: ['invalid-1', 'invalid-2'],
        unknownServer: ['unknown.server.com::tool'],
        unknownTool: ['github.com::unknown'],
      };

      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Invalid tool pattern format');
      expect(message).toContain('Unknown MCP server keys');
      expect(message).toContain('Unknown tools');
    });
  });
});
