/**
 * LLM API Response Schemas
 * Zod schemas for validating API responses from various LLM providers
 */

import { z } from 'zod';

// ============================================================================
// GEMINI RESPONSE SCHEMAS
// ============================================================================

/**
 * Gemini function call schema
 */
export const GeminiFunctionCallSchema = z.object({
  name: z.string(),
  args: z.unknown(),
});

/**
 * Gemini content part schema
 */
export const GeminiPartSchema = z.object({
  text: z.string().optional(),
  functionCall: GeminiFunctionCallSchema.optional(),
});

/**
 * Gemini content schema
 */
export const GeminiContentSchema = z.object({
  parts: z.array(GeminiPartSchema).optional(),
});

/**
 * Gemini candidate schema
 */
export const GeminiCandidateSchema = z.object({
  content: GeminiContentSchema.nullable().optional(),
  finishReason: z.string().optional(),
});

/**
 * Gemini usage metadata schema
 */
export const GeminiUsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
});

/**
 * Gemini error schema
 */
export const GeminiErrorSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
  status: z.string().optional(),
  details: z.array(z.unknown()).optional(),
});

/**
 * Gemini API response schema
 */
export const GeminiResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema).optional(),
  usageMetadata: GeminiUsageMetadataSchema.optional(),
  error: GeminiErrorSchema.optional(),
  promptFeedback: z.unknown().optional(),
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
export type GeminiCandidate = z.infer<typeof GeminiCandidateSchema>;
export type GeminiUsageMetadata = z.infer<typeof GeminiUsageMetadataSchema>;

// ============================================================================
// GEMINI TOOL SCHEMAS
// ============================================================================

/**
 * Gemini function declaration schema
 */
export const GeminiFunctionDeclarationSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.object({
    type: z.string(),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

/**
 * Gemini tool schema
 */
export const GeminiToolSchema = z.object({
  functionDeclarations: z.array(GeminiFunctionDeclarationSchema),
});

export type GeminiTool = z.infer<typeof GeminiToolSchema>;

// ============================================================================
// GEMINI CONTENT SCHEMAS
// ============================================================================

/**
 * Gemini content role type
 */
export const GeminiRoleSchema = z.enum(['user', 'model']);

/**
 * Gemini function response schema
 */
export const GeminiFunctionResponseSchema = z.object({
  name: z.string(),
  response: z.unknown(),
});

/**
 * Gemini message part (for request)
 */
export const GeminiMessagePartSchema = z.object({
  text: z.string().optional(),
  functionCall: GeminiFunctionCallSchema.optional(),
  functionResponse: GeminiFunctionResponseSchema.optional(),
});

/**
 * Gemini message content (for request)
 */
export const GeminiMessageContentSchema = z.object({
  role: GeminiRoleSchema,
  parts: z.array(GeminiMessagePartSchema),
});

export type GeminiMessageContent = z.infer<typeof GeminiMessageContentSchema>;

// ============================================================================
// STOP REASON MAPPINGS
// ============================================================================

/**
 * Mapping of Gemini finish reasons to our canonical format
 */
export const GEMINI_STOP_REASON_MAP: Record<string, string> = {
  STOP: 'end_turn',
  MAX_TOKENS: 'max_tokens',
  SAFETY: 'content_filtered',
};

/**
 * Mapping of OpenAI finish reasons to our canonical format
 */
export const OPENAI_STOP_REASON_MAP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'content_filtered',
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Safely parse a Gemini response
 */
export function parseGeminiResponse(data: unknown): GeminiResponse | null {
  const result = GeminiResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Check if a Gemini response has an error
 */
export function hasGeminiError(response: GeminiResponse): boolean {
  return !!response.error && !!response.error.message;
}

/**
 * Get usage stats from Gemini response
 */
export function getGeminiUsageStats(
  response: GeminiResponse,
): { inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
  const usage = response.usageMetadata;
  if (!usage) return undefined;

  const promptTokens = usage.promptTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? totalTokens - promptTokens;

  return {
    inputTokens: promptTokens,
    outputTokens,
    totalTokens,
  };
}
