/**
 * Admin Advanced Conditions Router
 *
 * Handles advanced SQL-like policy condition expressions.
 * Provides parsing, type checking, autocomplete, and conversion endpoints.
 */

import { advancedConditions } from '@sentinel/shared';
import { z } from 'zod';
import {
  buildTypeEnvironment,
  convertSimpleToAdvanced,
  getAutocompleteSuggestions,
  getHoverInfo,
  parseAdvancedCondition,
} from '../../services/advancedCondition.js';
import { adminProcedure, router } from '../init.js';

export const adminAdvancedConditionsRouter = router({
  /**
   * Parse and type check an advanced condition expression
   * Returns AST, errors with positions, and type information
   */
  parse: adminProcedure
    .input(
      z.object({
        expression: z.string().max(10000),
        toolPatterns: z.array(z.string()).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Build type environment from tool patterns
      const typeEnv = input.toolPatterns
        ? await buildTypeEnvironment(ctx.auth.organizationId, input.toolPatterns)
        : undefined;

      const result = parseAdvancedCondition(input.expression, typeEnv);

      // Convert type map to serializable format
      const typeInfo: Array<{ offset: number; type: string }> = [];
      if (result.typeMap) {
        for (const [offset, type] of result.typeMap) {
          typeInfo.push({
            offset,
            type: formatTypeForDisplay(type),
          });
        }
      }

      return {
        success: result.success,
        errors: result.errors.map((e) => ({
          message: e.message,
          code: e.code,
          line: e.span.start.line,
          column: e.span.start.column,
          endLine: e.span.end.line,
          endColumn: e.span.end.column,
        })),
        typeInfo,
      };
    }),

  /**
   * Get autocomplete suggestions at a cursor position
   */
  autocomplete: adminProcedure
    .input(
      z.object({
        expression: z.string().max(10000),
        cursorOffset: z.number().min(0),
        toolPatterns: z.array(z.string()).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const suggestions = await getAutocompleteSuggestions(
        input.expression,
        input.cursorOffset,
        ctx.auth.organizationId,
        input.toolPatterns ?? [],
      );

      return { suggestions };
    }),

  /**
   * Get signature help when inside a function call
   * Shows function parameters and highlights active parameter
   */
  signatureHelp: adminProcedure
    .input(
      z.object({
        expression: z.string().max(10000),
        cursorOffset: z.number().min(0),
      }),
    )
    .query(({ input }) => {
      const help = advancedConditions.getSignatureHelp(input.expression, input.cursorOffset);
      return { signatureHelp: help };
    }),

  /**
   * Get hover information for a symbol at the cursor position
   */
  hover: adminProcedure
    .input(
      z.object({
        expression: z.string().max(10000),
        cursorOffset: z.number().min(0),
        toolPatterns: z.array(z.string()).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hoverInfo = await getHoverInfo(
        input.expression,
        input.cursorOffset,
        ctx.auth.organizationId,
        input.toolPatterns ?? [],
      );
      return { hover: hoverInfo };
    }),

  /**
   * Convert simple conditions to advanced expression format
   */
  convertToAdvanced: adminProcedure
    .input(
      z.object({
        conditions: z.array(
          z.object({
            field: z.string(),
            operator: z.string(),
            value: z.unknown().optional(),
            valueRef: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(({ input }) => {
      const expression = convertSimpleToAdvanced(input.conditions);
      return { expression };
    }),

  /**
   * Get available functions for documentation/help
   */
  getFunctions: adminProcedure.query(() => {
    return { functions: advancedConditions.getFunctionDocs() };
  }),

  /**
   * Validate an expression without storing it
   * Returns whether the expression is valid and any errors
   */
  validate: adminProcedure
    .input(
      z.object({
        expression: z.string().max(10000),
        toolPatterns: z.array(z.string()).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const typeEnv = input.toolPatterns
        ? await buildTypeEnvironment(ctx.auth.organizationId, input.toolPatterns)
        : undefined;

      const result = parseAdvancedCondition(input.expression, typeEnv);

      return {
        valid: result.success,
        errors: result.errors.map((e) => ({
          message: e.message,
          code: e.code,
          line: e.span.start.line,
          column: e.span.start.column,
        })),
      };
    }),
});

/**
 * Format expression type for display
 */
function formatTypeForDisplay(type: {
  kind: string;
  elementType?: unknown;
  types?: unknown[];
}): string {
  switch (type.kind) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'any':
      return 'any';
    case 'never':
      return 'never';
    case 'array':
      if (type.elementType) {
        return `${formatTypeForDisplay(type.elementType as { kind: string })}[]`;
      }
      return 'array';
    case 'union':
      if (Array.isArray(type.types)) {
        return type.types.map((t) => formatTypeForDisplay(t as { kind: string })).join(' | ');
      }
      return 'union';
    case 'object':
      return 'object';
    default:
      return type.kind;
  }
}
