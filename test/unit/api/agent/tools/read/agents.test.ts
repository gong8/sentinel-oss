/**
 * Agent Read Tools Unit Tests
 * Tests for agent query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockAgentFindMany, mockAgentFindFirst } = vi.hoisted(() => ({
  mockAgentFindMany: vi.fn(),
  mockAgentFindFirst: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    agent: {
      findMany: mockAgentFindMany,
      findFirst: mockAgentFindFirst,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Agent Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list_agents', () => {
    test('should list agents for organization', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'GitHub Agent',
          protocolType: 'MCP',
          createdAt: new Date('2024-01-10'),
        },
        {
          id: 'agent-2',
          name: 'Notion Agent',
          protocolType: 'A2A',
          createdAt: new Date('2024-01-05'),
        },
      ];

      mockAgentFindMany.mockResolvedValueOnce(mockAgents);

      const result = await executeReadTool('list_agents', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        agents: [
          {
            id: 'agent-1',
            name: 'GitHub Agent',
            protocolType: 'MCP',
            createdAt: '2024-01-10T00:00:00.000Z',
          },
          {
            id: 'agent-2',
            name: 'Notion Agent',
            protocolType: 'A2A',
            createdAt: '2024-01-05T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockAgentFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_agents', {}, context);

      expect(mockAgentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should exclude deleted agents', async () => {
      mockAgentFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_agents', {}, context);

      expect(mockAgentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('should return empty array when no agents exist', async () => {
      mockAgentFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_agents', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        agents: [],
      });
    });
  });

  describe('get_agent', () => {
    test('should get agent by id', async () => {
      const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        protocolType: 'MCP',
        createdAt: new Date('2024-01-10'),
      };

      mockAgentFindFirst.mockResolvedValueOnce(mockAgent);

      const result = await executeReadTool('get_agent', { id: 'agent-123' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'agent-123',
        name: 'Test Agent',
        protocolType: 'MCP',
        createdAt: '2024-01-10T00:00:00.000Z',
      });
    });

    test('should scope query to organizationId', async () => {
      mockAgentFindFirst.mockResolvedValueOnce(null);

      await executeReadTool('get_agent', { id: 'agent-123' }, context);

      expect(mockAgentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            id: 'agent-123',
          }),
        }),
      );
    });

    test('should return not found error for non-existent agent', async () => {
      mockAgentFindFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_agent', { id: 'nonexistent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });
  });
});
