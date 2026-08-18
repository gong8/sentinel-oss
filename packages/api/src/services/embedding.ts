/**
 * Embedding Service
 * Provides text embedding capabilities for semantic search and tool selection
 */

import OpenAI from 'openai';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingProvider {
  computeEmbedding(text: string): Promise<number[]>;
  computeEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelName(): string;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'ollama';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

// ============================================================================
// OPENAI EMBEDDING PROVIDER
// ============================================================================

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config: { apiKey?: string; model?: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = config.model || 'text-embedding-3-small';
    // text-embedding-3-small has 1536 dimensions by default
    this.dimensions = this.model.includes('3-small') ? 1536 : 3072;
  }

  async computeEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async computeEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // OpenAI supports batch embedding
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    // Sort by index to maintain order
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return this.model;
  }
}

// ============================================================================
// OLLAMA EMBEDDING PROVIDER (for local/self-hosted)
// ============================================================================

class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor(config: { baseUrl?: string; model?: string }) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
    // nomic-embed-text has 768 dimensions
    this.dimensions = 768;
  }

  async computeEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  async computeEmbeddings(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch embedding, process sequentially
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.computeEmbedding(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return this.model;
  }
}

// ============================================================================
// FACTORY AND UTILITIES
// ============================================================================

/**
 * Get an embedding provider based on configuration
 */
export function getEmbeddingProvider(config?: Partial<EmbeddingConfig>): EmbeddingProvider | null {
  const provider = config?.provider || process.env.EMBEDDING_PROVIDER || 'openai';

  try {
    switch (provider) {
      case 'openai':
        if (!config?.apiKey && !process.env.OPENAI_API_KEY) {
          logger.debug('OpenAI API key not configured, embeddings disabled');
          return null;
        }
        return new OpenAIEmbeddingProvider({
          apiKey: config?.apiKey,
          model: config?.model,
        });

      case 'ollama':
        return new OllamaEmbeddingProvider({
          baseUrl: config?.baseUrl,
          model: config?.model,
        });

      default:
        logger.warn('Unknown embedding provider', { provider });
        return null;
    }
  } catch (error) {
    logger.error('Failed to create embedding provider', { provider, error });
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Find top-k similar items from a list of embeddings
 */
export function findTopKSimilar<T>(
  queryEmbedding: number[],
  items: Array<{ item: T; embedding: number[] }>,
  k: number,
  minSimilarity = 0,
): Array<{ item: T; similarity: number }> {
  const scored = items.map(({ item, embedding }) => ({
    item,
    similarity: cosineSimilarity(queryEmbedding, embedding),
  }));

  return scored
    .filter(({ similarity }) => similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Check if embeddings are available
 */
export function isEmbeddingAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL);
}
