/**
 * Milestone Definitions
 * Milestones for celebrating user achievements
 */

import type { Milestone } from './types.js';

export const MILESTONES: Milestone[] = [
  // Policy milestones
  {
    id: 'policy-10',
    metric: 'POLICY_CREATE',
    threshold: 10,
    title: '10 Policies Strong!',
    description: "You've created 10 policies. Your AI agents are well-governed!",
    featureLink: '/admin/analytics',
    emailEligible: true,
  },
  {
    id: 'policy-50',
    metric: 'POLICY_CREATE',
    threshold: 50,
    title: '50 Policies!',
    description:
      'Impressive governance coverage. Consider using Global Variables to parameterize common patterns.',
    featureLink: '/admin/global-variables',
    emailEligible: true,
  },

  // Tool invocation milestones
  {
    id: 'tools-100',
    metric: 'TOOL_INVOCATION',
    threshold: 100,
    title: '100 Tool Calls Governed',
    description: 'Sentinel has protected 100 tool invocations. Peace of mind at scale.',
    emailEligible: false,
  },
  {
    id: 'tools-1000',
    metric: 'TOOL_INVOCATION',
    threshold: 1000,
    title: '1,000 Tools Protected!',
    description: "A thousand tool calls, all governed. You're building something serious.",
    emailEligible: true,
  },
  {
    id: 'tools-10000',
    metric: 'TOOL_INVOCATION',
    threshold: 10000,
    title: '10,000 Tool Calls!',
    description: 'Ten thousand governed operations. Sentinel is working hard for you.',
    emailEligible: true,
  },

  // MCP Server milestones
  {
    id: 'mcp-5',
    metric: 'MCP_SERVER_CREATE',
    threshold: 5,
    title: '5 MCP Servers Connected',
    description:
      'Your AI agents have access to 5 tool providers. Consider setting up Sensitive Flags for high-risk tools.',
    featureLink: '/admin/sensitive-flags',
    emailEligible: true,
  },

  // User milestones
  {
    id: 'users-10',
    metric: 'USER_CREATE',
    threshold: 10,
    title: 'Team of 10!',
    description:
      'Your team is growing. Consider organizing with Workspaces for better access control.',
    featureLink: '/admin/workspaces',
    emailEligible: true,
  },

  // Webhook milestones
  {
    id: 'webhook-first',
    metric: 'WEBHOOK_ENDPOINT_CREATE',
    threshold: 1,
    title: 'Notifications Enabled!',
    description: "You've set up your first webhook. Stay informed about your AI operations.",
    emailEligible: false,
  },

  // Sensitive flag milestones
  {
    id: 'sensitive-5',
    metric: 'SENSITIVE_FLAG_CREATE',
    threshold: 5,
    title: '5 Sensitive Tools Flagged',
    description: 'Great security hygiene! High-risk tools are now under extra scrutiny.',
    emailEligible: false,
  },
];
