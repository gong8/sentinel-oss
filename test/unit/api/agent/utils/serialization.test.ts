/**
 * Serialization Utilities Tests
 * Tests for tool result serialization and content block building
 */

import { describe, expect, test } from 'vitest';

import type {
  AccumulatingToolCall,
  ToolExecutionResult,
} from '../../../../../packages/api/src/agent/unified-types.js';
import {
  buildAssistantContentFromTools,
  buildToolResultContentArray,
  createToolResultContent,
  serializeToolResult,
  toToolUseContent,
} from '../../../../../packages/api/src/agent/utils/serialization.js';

describe('serializeToolResult', () => {
  test('serializes result object to JSON', () => {
    const result = serializeToolResult({ data: 'test' }, undefined);
    expect(result).toBe('{"data":"test"}');
  });

  test('returns error JSON when error is provided', () => {
    const result = serializeToolResult({ data: 'ignored' }, 'Something went wrong');
    expect(result).toBe('{"error":"Something went wrong"}');
  });

  test('handles undefined result by returning null', () => {
    const result = serializeToolResult(undefined, undefined);
    expect(result).toBe('{"result":null}');
  });

  test('handles null result', () => {
    const result = serializeToolResult(null, undefined);
    expect(result).toBe('null');
  });

  test('handles array result', () => {
    const result = serializeToolResult([1, 2, 3], undefined);
    expect(result).toBe('[1,2,3]');
  });

  test('handles string result', () => {
    const result = serializeToolResult('hello', undefined);
    expect(result).toBe('"hello"');
  });

  test('handles number result', () => {
    const result = serializeToolResult(42, undefined);
    expect(result).toBe('42');
  });

  test('handles boolean result', () => {
    const result = serializeToolResult(true, undefined);
    expect(result).toBe('true');
  });

  test('handles empty object result', () => {
    const result = serializeToolResult({}, undefined);
    expect(result).toBe('{}');
  });

  test('prioritizes error over result', () => {
    const result = serializeToolResult({ data: 'test' }, 'Error message');
    expect(result).toBe('{"error":"Error message"}');
    expect(result).not.toContain('data');
  });
});

describe('createToolResultContent', () => {
  test('creates tool_result content block with result', () => {
    const toolCall = {
      id: 'tool-1',
      name: 'list_policies',
      input: {},
      result: { policies: [] },
    };

    const content = createToolResultContent(toolCall);

    expect(content).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: '{"policies":[]}',
    });
  });

  test('creates tool_result content block with error', () => {
    const toolCall = {
      id: 'tool-2',
      name: 'create_policy',
      input: { name: 'Test' },
      error: 'Failed to create',
    };

    const content = createToolResultContent(toolCall);

    expect(content).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-2',
      content: '{"error":"Failed to create"}',
    });
  });

  test('handles undefined result', () => {
    const toolCall = {
      id: 'tool-3',
      name: 'void_action',
      input: {},
    };

    const content = createToolResultContent(toolCall);

    expect(content).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-3',
      content: '{"result":null}',
    });
  });
});

describe('toToolUseContent', () => {
  test('converts tool call to tool_use content block', () => {
    const toolCall = {
      id: 'tool-1',
      name: 'list_policies',
      input: { filter: 'active' },
    };

    const content = toToolUseContent(toolCall);

    expect(content).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'list_policies',
      input: { filter: 'active' },
    });
  });

  test('handles empty input', () => {
    const toolCall = {
      id: 'tool-2',
      name: 'get_status',
      input: {},
    };

    const content = toToolUseContent(toolCall);

    expect(content).toEqual({
      type: 'tool_use',
      id: 'tool-2',
      name: 'get_status',
      input: {},
    });
  });
});

describe('buildAssistantContentFromTools', () => {
  test('builds content blocks from accumulated tools', () => {
    const accumulatingTools = new Map<string, AccumulatingToolCall>([
      ['tool-1', { id: 'tool-1', name: 'list_policies', inputJson: '{"filter":"active"}' }],
      ['tool-2', { id: 'tool-2', name: 'get_user', inputJson: '{"id":"user-1"}' }],
    ]);

    const content = buildAssistantContentFromTools(accumulatingTools);

    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'list_policies',
      input: { filter: 'active' },
    });
    expect(content[1]).toEqual({
      type: 'tool_use',
      id: 'tool-2',
      name: 'get_user',
      input: { id: 'user-1' },
    });
  });

  test('handles empty accumulated tools', () => {
    const accumulatingTools = new Map<string, AccumulatingToolCall>();
    const content = buildAssistantContentFromTools(accumulatingTools);
    expect(content).toEqual([]);
  });

  test('handles invalid JSON input by returning empty object', () => {
    const accumulatingTools = new Map<string, AccumulatingToolCall>([
      ['tool-1', { id: 'tool-1', name: 'bad_json', inputJson: '{invalid json}' }],
    ]);

    const content = buildAssistantContentFromTools(accumulatingTools);

    expect(content[0]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'bad_json',
      input: {},
    });
  });

  test('handles empty inputJson by returning empty object', () => {
    const accumulatingTools = new Map<string, AccumulatingToolCall>([
      ['tool-1', { id: 'tool-1', name: 'empty_input', inputJson: '' }],
    ]);

    const content = buildAssistantContentFromTools(accumulatingTools);

    expect(content[0]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'empty_input',
      input: {},
    });
  });
});

describe('buildToolResultContentArray', () => {
  test('builds tool result content array from execution results', () => {
    const toolResults: ToolExecutionResult[] = [
      {
        id: 'tool-1',
        name: 'list_policies',
        input: {},
        result: { policies: [] },
      },
      {
        id: 'tool-2',
        name: 'get_user',
        input: { id: 'user-1' },
        result: { name: 'Test User' },
      },
    ];

    const content = buildToolResultContentArray(toolResults);

    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: '{"policies":[]}',
    });
    expect(content[1]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-2',
      content: '{"name":"Test User"}',
    });
  });

  test('handles tool results with errors', () => {
    const toolResults: ToolExecutionResult[] = [
      {
        id: 'tool-1',
        name: 'failing_tool',
        input: {},
        error: 'Operation failed',
      },
    ];

    const content = buildToolResultContentArray(toolResults);

    expect(content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: '{"error":"Operation failed"}',
    });
  });

  test('handles empty results array', () => {
    const content = buildToolResultContentArray([]);
    expect(content).toEqual([]);
  });

  test('handles undefined result in execution result', () => {
    const toolResults: ToolExecutionResult[] = [
      {
        id: 'tool-1',
        name: 'void_tool',
        input: {},
        // result is undefined
      },
    ];

    const content = buildToolResultContentArray(toolResults);

    expect(content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: '{"result":null}',
    });
  });
});
