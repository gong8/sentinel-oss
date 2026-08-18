/**
 * Tool Classification Service
 * Uses LLM to automatically classify MCP tools by risk level, access type, and use cases.
 *
 * Classifications are generated when tools are discovered and can be overridden by users.
 */

import {
  ClassificationSource,
  ClassificationStatus,
  prisma,
  ToolAccessType,
  ToolRiskLevel,
} from '@sentinel/db';
import { z } from 'zod';

import { extractJsonFromResponse } from '../lib/llmUtils.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Configuration
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const CLASSIFICATION_TIMEOUT = 30000; // 30 seconds
const MAX_TOOLS_PER_BATCH = 10;

// ============================================================================
// Types
// ============================================================================

export interface ToolInput {
  id: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
}

export interface ToolClassificationResult {
  toolId: string;
  riskLevel: ToolRiskLevel;
  accessType: ToolAccessType;
  useCases: string;
  confidence: number;
}

// ============================================================================
// Zod Schemas for LLM Output Validation
// ============================================================================

const singleToolClassificationSchema = z.object({
  toolIndex: z.number().int().min(0),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  accessType: z.enum(['READ', 'WRITE', 'READ_WRITE']),
  useCases: z.string(),
  confidence: z.number().min(0).max(1),
});

const batchClassificationResponseSchema = z.object({
  classifications: z.array(singleToolClassificationSchema),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calls Gemini API with structured JSON output
 */
async function callGeminiAPI(
  prompt: string,
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'GEMINI_API_KEY not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFICATION_TIMEOUT);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2, // Low temperature for consistent classification
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gemini API error in tool classification', {
        status: response.status,
        error: errorText,
      });
      return { success: false, error: `Gemini API error ${response.status}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { success: false, error: 'Empty response from Gemini' };
    }

    return { success: true, content: text };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Gemini API timeout' };
    }

    logger.error('Gemini API call failed in tool classification', error);
    return { success: false, error: 'Gemini API call failed' };
  }
}

/**
 * Builds the classification prompt for a batch of tools
 */
function buildClassificationPrompt(tools: ToolInput[]): string {
  const toolDescriptions = tools
    .map((tool, index) => {
      const schemaStr = tool.inputSchema
        ? JSON.stringify(tool.inputSchema, null, 2).slice(0, 500)
        : 'No schema';
      return `[${index}] ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema (truncated): ${schemaStr}`;
    })
    .join('\n\n');

  return `You are a security analyst classifying MCP (Model Context Protocol) tools for an access control system.

For each tool, determine:

1. **Risk Level** (one of: LOW, MEDIUM, HIGH, CRITICAL):
   - LOW: Read-only operations, no sensitive data (e.g., get_time, list_files)
   - MEDIUM: May access sensitive data or make limited modifications (e.g., read_email, search_database)
   - HIGH: Modifies important data or has broad access (e.g., update_user, send_email, create_record)
   - CRITICAL: Deletes data, executes arbitrary code, or accesses secrets/credentials (e.g., delete_all, execute_command, get_api_keys)

2. **Access Type** (one of: READ, WRITE, READ_WRITE):
   - READ: Only retrieves/reads data
   - WRITE: Only creates/updates/deletes data
   - READ_WRITE: Both reads and writes data

3. **Use Cases**: A brief description (1-2 sentences) of what this tool is typically used for.

4. **Confidence**: Your confidence in this classification (0.0 to 1.0).

TOOLS TO CLASSIFY:
${toolDescriptions}

Return a JSON object with this exact structure:
{
  "classifications": [
    {
      "toolIndex": 0,
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "accessType": "READ" | "WRITE" | "READ_WRITE",
      "useCases": "Brief description of use cases",
      "confidence": 0.0 to 1.0
    },
    ...
  ]
}

Respond ONLY with the JSON object, no additional text.`;
}

/**
 * Maps string enum values to Prisma enum types
 */
function mapRiskLevel(level: string): ToolRiskLevel {
  switch (level) {
    case 'LOW':
      return ToolRiskLevel.LOW;
    case 'MEDIUM':
      return ToolRiskLevel.MEDIUM;
    case 'HIGH':
      return ToolRiskLevel.HIGH;
    case 'CRITICAL':
      return ToolRiskLevel.CRITICAL;
    default:
      return ToolRiskLevel.MEDIUM;
  }
}

function mapAccessType(type: string): ToolAccessType {
  switch (type) {
    case 'READ':
      return ToolAccessType.READ;
    case 'WRITE':
      return ToolAccessType.WRITE;
    case 'READ_WRITE':
      return ToolAccessType.READ_WRITE;
    default:
      return ToolAccessType.READ_WRITE;
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Classify a batch of tools using the LLM.
 * Returns classifications for each tool, or null if classification fails.
 */
export async function classifyTools(
  tools: ToolInput[],
): Promise<ToolClassificationResult[] | null> {
  if (tools.length === 0) {
    return [];
  }

  // Batch tools to avoid large prompts
  const results: ToolClassificationResult[] = [];

  for (let i = 0; i < tools.length; i += MAX_TOOLS_PER_BATCH) {
    const batch = tools.slice(i, i + MAX_TOOLS_PER_BATCH);
    const prompt = buildClassificationPrompt(batch);

    const response = await callGeminiAPI(prompt);
    if (!response.success) {
      logger.warn('Tool classification failed for batch', {
        batchStart: i,
        batchSize: batch.length,
        error: response.error,
      });
      continue;
    }

    try {
      const jsonStr = extractJsonFromResponse(response.content);
      const parsed: unknown = JSON.parse(jsonStr);
      const validated = batchClassificationResponseSchema.parse(parsed);

      for (const classification of validated.classifications) {
        const tool = batch[classification.toolIndex];
        if (!tool) {
          logger.warn('Tool index out of bounds in classification response', {
            toolIndex: classification.toolIndex,
            batchSize: batch.length,
          });
          continue;
        }

        results.push({
          toolId: tool.id,
          riskLevel: mapRiskLevel(classification.riskLevel),
          accessType: mapAccessType(classification.accessType),
          useCases: classification.useCases,
          confidence: classification.confidence,
        });
      }
    } catch (error) {
      logger.error('Failed to parse tool classification response', {
        error,
        response: response.content.slice(0, 500),
      });
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Save classifications to the database.
 * Creates or updates McpToolClassification records.
 */
export async function saveClassifications(
  classifications: ToolClassificationResult[],
  llmRawResponse?: string,
): Promise<void> {
  for (const classification of classifications) {
    await prisma.mcpToolClassification.upsert({
      where: { mcpToolId: classification.toolId },
      create: {
        mcpToolId: classification.toolId,
        riskLevel: classification.riskLevel,
        accessType: classification.accessType,
        useCases: classification.useCases,
        source: ClassificationSource.LLM_AUTO,
        llmConfidence: classification.confidence,
        llmRawResponse: llmRawResponse ? JSON.parse(llmRawResponse) : null,
      },
      update: {
        // Only update if source is LLM_AUTO (don't overwrite user overrides)
        riskLevel: classification.riskLevel,
        accessType: classification.accessType,
        useCases: classification.useCases,
        llmConfidence: classification.confidence,
        llmRawResponse: llmRawResponse ? JSON.parse(llmRawResponse) : null,
      },
    });
  }
}

// ============================================================================
// Classification Status Functions
// ============================================================================

/**
 * Update the classification status of an MCP server
 */
async function updateClassificationStatus(
  mcpServerId: string,
  status: ClassificationStatus,
  error?: string,
): Promise<void> {
  const data: {
    classificationStatus: ClassificationStatus;
    classificationStartedAt?: Date | null;
    classificationError?: string | null;
  } = {
    classificationStatus: status,
    classificationError: error ?? null,
  };

  if (status === ClassificationStatus.IN_PROGRESS) {
    data.classificationStartedAt = new Date();
  }

  await prisma.mcpServer.update({
    where: { id: mcpServerId },
    data,
  });
}

/**
 * Start background classification for tools.
 * Updates the server status to IN_PROGRESS, then classifies tools asynchronously.
 * Does not block - returns immediately after starting.
 *
 * @param mcpServerId - The MCP server ID
 * @param tools - Array of discovered tools with their IDs
 */
export function startBackgroundClassification(
  mcpServerId: string,
  tools: Array<{ id: string; name: string; description?: string | null; inputSchema?: unknown }>,
): void {
  if (tools.length === 0) {
    return;
  }

  // Fire and forget - don't await
  void (async () => {
    try {
      await updateClassificationStatus(mcpServerId, ClassificationStatus.IN_PROGRESS);
      await classifyDiscoveredTools(mcpServerId, tools);
      await updateClassificationStatus(mcpServerId, ClassificationStatus.COMPLETED);
    } catch (error) {
      logger.error('Background classification failed', { mcpServerId, error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateClassificationStatus(mcpServerId, ClassificationStatus.FAILED, errorMessage);
    }
  })();
}

/**
 * Classify unclassified tools for an MCP server.
 * This is called when the user clicks "Classify Unclassified" button.
 * Updates status and runs classification.
 */
export async function classifyUnclassifiedTools(mcpServerId: string): Promise<{
  success: boolean;
  classified: number;
  total: number;
  error?: string;
}> {
  try {
    // Get all tools for this server that don't have a classification
    const tools = await prisma.mcpTool.findMany({
      where: {
        mcpServerId,
        classification: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        inputSchema: true,
      },
    });

    if (tools.length === 0) {
      // No unclassified tools - mark as completed
      await updateClassificationStatus(mcpServerId, ClassificationStatus.COMPLETED);
      return { success: true, classified: 0, total: 0 };
    }

    // Update status to IN_PROGRESS
    await updateClassificationStatus(mcpServerId, ClassificationStatus.IN_PROGRESS);

    // Classify tools
    const toolInputs: ToolInput[] = tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const classifications = await classifyTools(toolInputs);
    if (!classifications || classifications.length === 0) {
      await updateClassificationStatus(
        mcpServerId,
        ClassificationStatus.FAILED,
        'No classifications generated',
      );
      return { success: false, classified: 0, total: tools.length, error: 'Classification failed' };
    }

    await saveClassifications(classifications);
    await updateClassificationStatus(mcpServerId, ClassificationStatus.COMPLETED);

    return { success: true, classified: classifications.length, total: tools.length };
  } catch (error) {
    logger.error('Failed to classify unclassified tools', { mcpServerId, error });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateClassificationStatus(mcpServerId, ClassificationStatus.FAILED, errorMessage);
    return {
      success: false,
      classified: 0,
      total: 0,
      error: errorMessage,
    };
  }
}

/**
 * Get classification status for an MCP server
 */
export async function getClassificationStatus(mcpServerId: string): Promise<{
  status: ClassificationStatus;
  startedAt: Date | null;
  error: string | null;
  unclassifiedCount: number;
  totalTools: number;
}> {
  const server = await prisma.mcpServer.findUnique({
    where: { id: mcpServerId },
    select: {
      classificationStatus: true,
      classificationStartedAt: true,
      classificationError: true,
      _count: {
        select: { tools: true },
      },
    },
  });

  if (!server) {
    return {
      status: ClassificationStatus.NOT_STARTED,
      startedAt: null,
      error: null,
      unclassifiedCount: 0,
      totalTools: 0,
    };
  }

  // Count unclassified tools
  const unclassifiedCount = await prisma.mcpTool.count({
    where: {
      mcpServerId,
      classification: null,
    },
  });

  return {
    status: server.classificationStatus,
    startedAt: server.classificationStartedAt,
    error: server.classificationError,
    unclassifiedCount,
    totalTools: server._count.tools,
  };
}

/**
 * Classify and save classifications for tools discovered from an MCP server.
 * This is the main entry point called after tool discovery.
 *
 * @param mcpServerId - The MCP server ID
 * @param tools - Array of discovered tools with their IDs
 */
export async function classifyDiscoveredTools(
  mcpServerId: string,
  tools: Array<{ id: string; name: string; description?: string | null; inputSchema?: unknown }>,
): Promise<void> {
  if (tools.length === 0) {
    return;
  }

  logger.info('Starting tool classification', {
    mcpServerId,
    toolCount: tools.length,
  });

  // Fetch full tool data from database
  const dbTools = await prisma.mcpTool.findMany({
    where: {
      mcpServerId,
      id: { in: tools.map((t) => t.id) },
    },
    select: {
      id: true,
      name: true,
      description: true,
      inputSchema: true,
    },
  });

  if (dbTools.length === 0) {
    logger.warn('No tools found in database for classification', { mcpServerId });
    return;
  }

  // Convert to ToolInput format
  const toolInputs: ToolInput[] = dbTools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  // Classify tools
  const classifications = await classifyTools(toolInputs);
  if (!classifications || classifications.length === 0) {
    logger.warn('No classifications generated for tools', {
      mcpServerId,
      toolCount: toolInputs.length,
    });
    return;
  }

  // Save classifications
  await saveClassifications(classifications);

  logger.success(`Classified ${classifications.length} tools from server`, {
    mcpServerId,
    classified: classifications.length,
    total: toolInputs.length,
  });
}

/**
 * Re-classify all tools for an MCP server.
 * This will overwrite existing LLM classifications but preserve user overrides.
 */
export async function reclassifyServerTools(mcpServerId: string): Promise<{
  success: boolean;
  classified: number;
  total: number;
  error?: string;
}> {
  try {
    const tools = await prisma.mcpTool.findMany({
      where: { mcpServerId },
      select: {
        id: true,
        name: true,
        description: true,
        inputSchema: true,
        classification: {
          select: { source: true },
        },
      },
    });

    if (tools.length === 0) {
      return { success: true, classified: 0, total: 0 };
    }

    // Filter to only tools without user overrides
    const toolsToClassify = tools.filter(
      (t) => !t.classification || t.classification.source === ClassificationSource.LLM_AUTO,
    );

    if (toolsToClassify.length === 0) {
      return { success: true, classified: 0, total: tools.length };
    }

    const toolInputs: ToolInput[] = toolsToClassify.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const classifications = await classifyTools(toolInputs);
    if (!classifications) {
      return { success: false, classified: 0, total: tools.length, error: 'Classification failed' };
    }

    await saveClassifications(classifications);

    return { success: true, classified: classifications.length, total: tools.length };
  } catch (error) {
    logger.error('Failed to reclassify server tools', { mcpServerId, error });
    return {
      success: false,
      classified: 0,
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Override a tool's classification manually.
 * Preserves original LLM classification for reference.
 */
export async function overrideClassification(
  toolId: string,
  userId: string,
  overrides: {
    riskLevel?: ToolRiskLevel;
    accessType?: ToolAccessType;
    useCases?: string;
  },
): Promise<void> {
  const existing = await prisma.mcpToolClassification.findUnique({
    where: { mcpToolId: toolId },
  });

  if (existing) {
    // Preserve original values if this is the first override
    const isFirstOverride = existing.source === ClassificationSource.LLM_AUTO;

    await prisma.mcpToolClassification.update({
      where: { mcpToolId: toolId },
      data: {
        riskLevel: overrides.riskLevel ?? existing.riskLevel,
        accessType: overrides.accessType ?? existing.accessType,
        useCases: overrides.useCases ?? existing.useCases,
        source: ClassificationSource.USER_MANUAL,
        overriddenAt: new Date(),
        overriddenBy: userId,
        // Only set original values on first override
        ...(isFirstOverride
          ? {
              originalRiskLevel: existing.riskLevel,
              originalAccessType: existing.accessType,
              originalUseCases: existing.useCases,
            }
          : {}),
      },
    });
  } else {
    // Create new classification with user override
    await prisma.mcpToolClassification.create({
      data: {
        mcpToolId: toolId,
        riskLevel: overrides.riskLevel ?? null,
        accessType: overrides.accessType ?? null,
        useCases: overrides.useCases ?? null,
        source: ClassificationSource.USER_MANUAL,
        overriddenAt: new Date(),
        overriddenBy: userId,
      },
    });
  }
}

/**
 * Reset a tool's classification back to the LLM-generated values.
 */
export async function resetToAutoClassification(toolId: string): Promise<boolean> {
  const existing = await prisma.mcpToolClassification.findUnique({
    where: { mcpToolId: toolId },
  });

  if (!existing) {
    return false;
  }

  // If there are no original values, we can't reset
  if (!existing.originalRiskLevel && !existing.originalAccessType && !existing.originalUseCases) {
    // Delete the manual classification and trigger reclassification
    await prisma.mcpToolClassification.delete({
      where: { mcpToolId: toolId },
    });

    // Fetch the tool and reclassify it
    const tool = await prisma.mcpTool.findUnique({
      where: { id: toolId },
      select: {
        id: true,
        name: true,
        description: true,
        inputSchema: true,
      },
    });

    if (tool) {
      const classifications = await classifyTools([
        {
          id: tool.id,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
      ]);

      if (classifications && classifications.length > 0) {
        await saveClassifications(classifications);
      }
    }

    return true;
  }

  // Reset to original values
  await prisma.mcpToolClassification.update({
    where: { mcpToolId: toolId },
    data: {
      riskLevel: existing.originalRiskLevel,
      accessType: existing.originalAccessType,
      useCases: existing.originalUseCases,
      source: ClassificationSource.LLM_AUTO,
      overriddenAt: null,
      overriddenBy: null,
      originalRiskLevel: null,
      originalAccessType: null,
      originalUseCases: null,
    },
  });

  return true;
}
