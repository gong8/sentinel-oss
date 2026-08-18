/**
 * Sentinel Documentation Search Tool
 * Provides search functionality for Sentinel documentation at docs.sentinel.london
 */

import type { ToolDefinition } from '../agent/llm/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DocsResult {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
}

interface DocsEntry {
  title: string;
  path: string;
  keywords: string[];
  snippet: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DOCS_BASE_URL = 'https://docs.sentinel.london';

/**
 * Static mapping of documentation topics to their pages
 * This provides fast, reliable search without external API dependencies
 */
const DOCS_INDEX: DocsEntry[] = [
  // Policies
  {
    title: 'Policy Configuration',
    path: '/policies/configuration',
    keywords: ['policy', 'policies', 'rule', 'rules', 'access control', 'allow', 'deny'],
    snippet:
      'Configure access control policies to define what actions agents and users can perform. Policies use ALLOW/DENY rules with pattern matching.',
  },
  {
    title: 'Policy Conditions',
    path: '/policies/conditions',
    keywords: [
      'condition',
      'conditions',
      'time',
      'schedule',
      'ip',
      'network',
      'parameter',
      'context',
    ],
    snippet:
      'Add conditions to policies for fine-grained control. Supports time-based, IP-based, and parameter-based conditions.',
  },

  // MCP Servers
  {
    title: 'MCP Server Setup',
    path: '/mcp/setup',
    keywords: ['mcp', 'server', 'setup', 'install', 'configure', 'connection'],
    snippet:
      'Set up and configure MCP (Model Context Protocol) servers to connect AI agents with your tools and services.',
  },
  {
    title: 'MCP Tool Registration',
    path: '/mcp/tools',
    keywords: ['mcp', 'tool', 'tools', 'register', 'registration', 'capability'],
    snippet:
      'Register tools from MCP servers and configure their availability to agents. Manage tool permissions and visibility.',
  },
  {
    title: 'MCP Authentication',
    path: '/mcp/auth',
    keywords: ['mcp', 'auth', 'authentication', 'token', 'api key', 'credentials'],
    snippet:
      'Configure authentication for MCP servers including API keys, tokens, and OAuth integration.',
  },

  // Workspaces
  {
    title: 'Workspace Management',
    path: '/workspaces/management',
    keywords: ['workspace', 'workspaces', 'organization', 'team', 'project'],
    snippet:
      'Create and manage workspaces to organize your agents, policies, and MCP servers. Workspaces provide isolation and access control.',
  },
  {
    title: 'Workspace Members',
    path: '/workspaces/members',
    keywords: ['workspace', 'member', 'members', 'user', 'users', 'invite', 'role'],
    snippet:
      'Invite team members to workspaces and assign roles. Manage permissions and access levels for workspace collaboration.',
  },
  {
    title: 'Workspace Variables',
    path: '/workspaces/variables',
    keywords: ['workspace', 'variable', 'variables', 'environment', 'config', 'secret'],
    snippet:
      'Define workspace-level variables for use in policies and configurations. Supports encrypted secrets.',
  },

  // OAuth
  {
    title: 'OAuth Setup',
    path: '/oauth/setup',
    keywords: ['oauth', 'sso', 'single sign-on', 'authentication', 'login', 'identity'],
    snippet:
      'Configure OAuth providers for single sign-on authentication. Supports Google, GitHub, Microsoft, and custom providers.',
  },
  {
    title: 'OAuth Scopes',
    path: '/oauth/scopes',
    keywords: ['oauth', 'scope', 'scopes', 'permission', 'permissions', 'access'],
    snippet:
      'Manage OAuth scopes to control what permissions are granted to connected applications and services.',
  },

  // Agents
  {
    title: 'Agent Configuration',
    path: '/agents/configuration',
    keywords: ['agent', 'agents', 'ai', 'bot', 'configure', 'settings'],
    snippet:
      'Configure AI agents with custom settings, tool access, and behavioral parameters. Define agent capabilities and restrictions.',
  },
  {
    title: 'Agent Delegation',
    path: '/agents/delegation',
    keywords: ['agent', 'delegation', 'delegate', 'behalf', 'impersonate', 'proxy'],
    snippet:
      'Set up agent delegation to allow agents to act on behalf of users with appropriate permissions and audit trails.',
  },

  // Audit & Monitoring
  {
    title: 'Audit Logs',
    path: '/audit/logs',
    keywords: ['audit', 'log', 'logs', 'history', 'activity', 'track', 'monitor'],
    snippet:
      'View and search audit logs for all actions taken in your organization. Track tool usage, policy changes, and user activity.',
  },
  {
    title: 'Webhooks',
    path: '/webhooks/setup',
    keywords: ['webhook', 'webhooks', 'notification', 'event', 'callback', 'integration'],
    snippet:
      'Configure webhooks to receive real-time notifications about events in your Sentinel organization.',
  },

  // Getting Started
  {
    title: 'Quick Start Guide',
    path: '/getting-started/quickstart',
    keywords: ['start', 'getting started', 'quick', 'begin', 'introduction', 'tutorial'],
    snippet:
      'Get started with Sentinel in minutes. This guide walks through initial setup, creating your first workspace, and connecting agents.',
  },
  {
    title: 'API Reference',
    path: '/api/reference',
    keywords: ['api', 'reference', 'endpoint', 'rest', 'trpc', 'programmatic'],
    snippet:
      'Complete API reference for programmatic access to Sentinel. Includes authentication, endpoints, and code examples.',
  },

  // Security
  {
    title: 'Security Best Practices',
    path: '/security/best-practices',
    keywords: ['security', 'secure', 'best practice', 'hardening', 'protection'],
    snippet:
      'Security best practices for configuring Sentinel. Covers policy design, credential management, and access control patterns.',
  },
  {
    title: 'Encryption',
    path: '/security/encryption',
    keywords: ['encrypt', 'encryption', 'credential', 'secret', 'key', 'secure storage'],
    snippet:
      'How Sentinel encrypts and protects sensitive data including credentials, API keys, and secrets.',
  },
];

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const searchSentinelDocsTool: ToolDefinition = {
  name: 'search_sentinel_docs',
  description:
    'Search Sentinel documentation for help with policies, MCP configuration, workspace setup, and other product features. Use this when the user asks how to do something in Sentinel.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant documentation',
      },
    },
    required: ['query'],
  },
};

// ============================================================================
// SEARCH IMPLEMENTATION
// ============================================================================

/**
 * Calculate relevance score for a docs entry against a query
 * Uses simple keyword matching with weighting
 */
function calculateRelevance(entry: DocsEntry, queryTerms: string[]): number {
  let score = 0;

  for (const term of queryTerms) {
    const lowerTerm = term.toLowerCase();

    // Title match (highest weight)
    if (entry.title.toLowerCase().includes(lowerTerm)) {
      score += 10;
    }

    // Keyword exact match (high weight)
    if (entry.keywords.some((kw) => kw === lowerTerm)) {
      score += 8;
    }

    // Keyword partial match (medium weight)
    if (entry.keywords.some((kw) => kw.includes(lowerTerm) || lowerTerm.includes(kw))) {
      score += 4;
    }

    // Snippet match (lower weight)
    if (entry.snippet.toLowerCase().includes(lowerTerm)) {
      score += 2;
    }

    // Path match (lower weight)
    if (entry.path.toLowerCase().includes(lowerTerm)) {
      score += 1;
    }
  }

  return score;
}

/**
 * Tokenize query into search terms
 * Removes common stop words and normalizes
 */
function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'and',
    'but',
    'if',
    'or',
    'because',
    'until',
    'while',
    'about',
    'against',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'him',
    'his',
    'she',
    'her',
    'it',
    'its',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'am',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopWords.has(term));
}

/**
 * Search Sentinel documentation for relevant pages
 * Returns results sorted by relevance score
 */
export function searchSentinelDocs(query: string): DocsResult[] {
  const queryTerms = tokenizeQuery(query);

  if (queryTerms.length === 0) {
    return [];
  }

  const results: DocsResult[] = [];

  for (const entry of DOCS_INDEX) {
    const relevance = calculateRelevance(entry, queryTerms);

    if (relevance > 0) {
      results.push({
        title: entry.title,
        url: `${DOCS_BASE_URL}${entry.path}`,
        snippet: entry.snippet,
        relevance,
      });
    }
  }

  // Sort by relevance (descending)
  results.sort((a, b) => b.relevance - a.relevance);

  // Return top 5 results
  return results.slice(0, 5);
}
