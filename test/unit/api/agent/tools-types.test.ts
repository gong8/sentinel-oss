/**
 * Agent Tool Types Unit Tests
 * Tests for tool definitions and registry
 */

import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  createTool,
  ToolRegistry,
  zodToToolSchema,
  type ToolContext,
} from '../../../../packages/api/src/agent/tools/types.js';

describe('Tool Types', () => {
  describe('createTool', () => {
    test('should create a basic tool definition', () => {
      const tool = createTool(
        'test_tool',
        'A test tool',
        z.object({ name: z.string() }),
        async (input) => ({
          success: true,
          data: { message: `Hello, ${input.name}!` },
        }),
      );

      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.requiresConfirmation).toBeUndefined();
    });

    test('should create tool with requiresConfirmation flag', () => {
      const tool = createTool(
        'write_tool',
        'A write tool',
        z.object({}),
        async () => ({ success: true }),
        { requiresConfirmation: true },
      );

      expect(tool.requiresConfirmation).toBe(true);
    });

    test('should execute tool with parsed input', async () => {
      const executeFn = vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'executed' },
      });

      const tool = createTool(
        'exec_tool',
        'Execute tool',
        z.object({ value: z.number() }),
        executeFn,
      );

      const context: ToolContext = { organizationId: 'org-1' };
      const result = await tool.execute({ value: 42 }, context);

      expect(executeFn).toHaveBeenCalledWith({ value: 42 }, context);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'executed' });
    });

    test('should throw on invalid input schema', async () => {
      const tool = createTool(
        'strict_tool',
        'Strict tool',
        z.object({ required: z.string() }),
        async () => ({ success: true }),
      );

      const context: ToolContext = { organizationId: 'org-1' };

      await expect(tool.execute({}, context)).rejects.toThrow();
    });

    test('should validate nested schemas', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number().min(0),
        }),
        tags: z.array(z.string()),
      });

      const executeFn = vi.fn().mockResolvedValue({ success: true });
      const tool = createTool('nested_tool', 'Nested schema tool', schema, executeFn);

      const context: ToolContext = { organizationId: 'org-1' };
      const validInput = {
        user: { name: 'John', age: 30 },
        tags: ['admin', 'user'],
      };

      await tool.execute(validInput, context);

      expect(executeFn).toHaveBeenCalledWith(validInput, context);
    });

    test('should pass context to execute function', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      const tool = createTool('context_tool', 'Context tool', z.object({}), executeFn);

      const context: ToolContext = {
        organizationId: 'org-1',
        userId: 'user-1',
        agentId: 'agent-1',
        conversationId: 'conv-1',
      };

      await tool.execute({}, context);

      expect(executeFn).toHaveBeenCalledWith({}, context);
    });
  });

  describe('zodToToolSchema', () => {
    test('should convert simple object schema', () => {
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });

      const result = zodToToolSchema(schema);

      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      const props = result.properties;
      expect(props && typeof props === 'object' && 'name' in props).toBe(true);
      expect(props && typeof props === 'object' && 'count' in props).toBe(true);
    });

    test('should include required fields', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const result = zodToToolSchema(schema);

      expect(result.required).toContain('required');
      // Optional fields should not be in required array
    });

    test('should convert nested object schema', () => {
      const schema = z.object({
        nested: z.object({
          value: z.string(),
        }),
      });

      const result = zodToToolSchema(schema);

      expect(result.type).toBe('object');
      const props = result.properties;
      expect(props && typeof props === 'object' && 'nested' in props).toBe(true);
    });

    test('should convert array schema', () => {
      const schema = z.object({
        items: z.array(z.string()),
      });

      const result = zodToToolSchema(schema);

      expect(result.type).toBe('object');
      const props = result.properties;
      expect(props && typeof props === 'object' && 'items' in props).toBe(true);
    });

    test('should convert enum schema', () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive', 'pending']),
      });

      const result = zodToToolSchema(schema);

      expect(result.type).toBe('object');
      const props = result.properties;
      expect(props && typeof props === 'object' && 'status' in props).toBe(true);
    });

    test('should remove $schema metadata', () => {
      const schema = z.object({ value: z.string() });

      const result = zodToToolSchema(schema);

      expect(result).not.toHaveProperty('$schema');
    });

    test('should handle empty object schema', () => {
      const schema = z.object({});

      const result = zodToToolSchema(schema);

      expect(result.type).toBe('object');
      expect(result.properties).toEqual({});
    });
  });

  describe('ToolRegistry', () => {
    test('should register a tool', () => {
      const registry = new ToolRegistry();
      const tool = createTool('reg_tool', 'Registered tool', z.object({}), async () => ({
        success: true,
      }));

      registry.register(tool);

      expect(registry.get('reg_tool')).toBe(tool);
    });

    test('should return undefined for unregistered tool', () => {
      const registry = new ToolRegistry();

      expect(registry.get('nonexistent')).toBeUndefined();
    });

    test('should get all registered tools', () => {
      const registry = new ToolRegistry();
      const tool1 = createTool('tool1', 'First tool', z.object({}), async () => ({
        success: true,
      }));
      const tool2 = createTool('tool2', 'Second tool', z.object({}), async () => ({
        success: true,
      }));

      registry.register(tool1);
      registry.register(tool2);

      const allTools = registry.getAll();

      expect(allTools).toHaveLength(2);
      expect(allTools).toContain(tool1);
      expect(allTools).toContain(tool2);
    });

    test('should overwrite tool with same name', () => {
      const registry = new ToolRegistry();
      const tool1 = createTool('same_name', 'First version', z.object({}), async () => ({
        success: true,
      }));
      const tool2 = createTool('same_name', 'Second version', z.object({}), async () => ({
        success: true,
      }));

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.get('same_name')).toBe(tool2);
      expect(registry.getAll()).toHaveLength(1);
    });

    test('should get tools in LLM format', () => {
      const registry = new ToolRegistry();
      const tool = createTool(
        'generic_tool',
        'Generic tool',
        z.object({
          param: z.string(),
        }),
        async () => ({ success: true }),
      );

      registry.register(tool);

      const tools = registry.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('generic_tool');
      expect(tools[0]?.description).toBe('Generic tool');
      expect(tools[0]?.input_schema.type).toBe('object');
      expect(tools[0]?.input_schema.properties).toBeDefined();
    });

    test('should return empty array for empty registry', () => {
      const registry = new ToolRegistry();

      expect(registry.getAll()).toEqual([]);
      expect(registry.getTools()).toEqual([]);
    });
  });
});
