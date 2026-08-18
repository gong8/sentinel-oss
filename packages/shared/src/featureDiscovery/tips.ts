/**
 * Feature Tips Definitions
 * Hardcoded tips for feature discovery
 */

import type { FeatureTip } from './types.js';

export const FEATURE_TIPS: FeatureTip[] = [
  {
    id: 'sensitive-flags',
    title: 'Flag Sensitive Tools',
    description:
      'Mark high-risk tools to require approval or enforce rate limits before they can be used.',
    docUrl: 'https://docs.sentinel.london/sensitive-flags',
    pageContexts: ['/admin/mcp-servers', '/admin/mcp-servers/*', '/admin/sensitive-flags'],
    prerequisiteFeatures: ['mcp-server'],
    detectUsage: {
      actionTypes: ['SENSITIVE_FLAG_CREATE'],
    },
    priority: 85,
    category: 'intermediate',
  },
  {
    id: 'advanced-conditions',
    title: 'Try Advanced Policy Conditions',
    description:
      'Create time-based rules like "only allow during business hours" or restrict by IP address.',
    docUrl: 'https://docs.sentinel.london/policies/conditions',
    pageContexts: ['/admin/policies', '/admin/policies/*'],
    prerequisiteFeatures: ['basic-policy'],
    detectUsage: {
      customCheck: 'hasAdvancedConditionPolicy',
    },
    priority: 80,
    category: 'intermediate',
  },
  {
    id: 'webhooks-slack',
    title: 'Get Slack Notifications',
    description: 'Send real-time alerts to Slack when policies are triggered or tools are blocked.',
    docUrl: 'https://docs.sentinel.london/webhooks/slack',
    pageContexts: ['/admin/webhooks', '/admin/dashboard'],
    detectUsage: {
      customCheck: 'hasSlackWebhook',
    },
    priority: 75,
    category: 'basic',
  },
  {
    id: 'webhooks-email',
    title: 'Email Alerts for Tool Use',
    description: 'Get email notifications when sensitive tools are used or policies deny access.',
    docUrl: 'https://docs.sentinel.london/webhooks/email',
    pageContexts: ['/admin/webhooks', '/admin/dashboard'],
    detectUsage: {
      customCheck: 'hasEmailWebhook',
    },
    priority: 70,
    category: 'basic',
  },
  {
    id: 'global-variables',
    title: 'Parameterize Policies',
    description:
      'Use global variables to share values across policies and update them in one place.',
    docUrl: 'https://docs.sentinel.london/global-variables',
    pageContexts: ['/admin/policies', '/admin/global-variables'],
    prerequisiteFeatures: ['basic-policy'],
    detectUsage: {
      actionTypes: ['GLOBAL_VARIABLE_CREATE'],
    },
    priority: 65,
    category: 'intermediate',
  },
  {
    id: 'workspaces',
    title: 'Organize with Workspaces',
    description:
      'Create separate workspaces for teams or projects with their own policies and MCP servers.',
    docUrl: 'https://docs.sentinel.london/workspaces',
    pageContexts: ['/admin/workspaces', '/admin/users'],
    detectUsage: {
      actionTypes: ['WORKSPACE_CREATE'],
    },
    priority: 60,
    category: 'advanced',
  },
  {
    id: 'time-conditions',
    title: 'Restrict by Time of Day',
    description: 'Allow tools only during business hours or block risky operations on weekends.',
    docUrl: 'https://docs.sentinel.london/policies/time-conditions',
    pageContexts: ['/admin/policies', '/admin/policies/*'],
    prerequisiteFeatures: ['basic-policy'],
    detectUsage: {
      customCheck: 'hasTimeCondition',
    },
    priority: 55,
    category: 'intermediate',
  },
  {
    id: 'ip-conditions',
    title: 'Restrict by IP Address',
    description: 'Only allow tool access from trusted IP addresses or office networks.',
    docUrl: 'https://docs.sentinel.london/policies/ip-conditions',
    pageContexts: ['/admin/policies', '/admin/policies/*'],
    prerequisiteFeatures: ['basic-policy'],
    detectUsage: {
      customCheck: 'hasIpCondition',
    },
    priority: 50,
    category: 'advanced',
  },
  {
    id: 'oauth-integration',
    title: 'Connect OAuth Providers',
    description: 'Connect MCP servers that require OAuth authentication like GitHub or Google.',
    docUrl: 'https://docs.sentinel.london/oauth',
    pageContexts: ['/admin/mcp-servers', '/admin/mcp-servers/*'],
    prerequisiteFeatures: ['mcp-server'],
    detectUsage: {
      customCheck: 'hasOAuthConnection',
    },
    priority: 45,
    category: 'advanced',
  },
  {
    id: 'admin-mcp',
    title: 'Automate with Admin MCP',
    description: 'Let AI agents manage Sentinel - create policies, manage users, and more via MCP.',
    docUrl: 'https://docs.sentinel.london/admin-mcp',
    pageContexts: ['/admin/dashboard', '/admin/settings'],
    detectUsage: {
      customCheck: 'hasAdminMcpUsage',
    },
    priority: 40,
    category: 'enterprise',
  },
  {
    id: 'approval-workflows',
    title: 'Require Approval for High-Risk Tools',
    description:
      'Set up approval workflows so sensitive operations need human sign-off before execution.',
    docUrl: 'https://docs.sentinel.london/sensitive-flags/approval',
    pageContexts: ['/admin/sensitive-flags'],
    prerequisiteFeatures: ['sensitive-flags'],
    detectUsage: {
      customCheck: 'hasApprovalWorkflow',
    },
    priority: 35,
    category: 'advanced',
  },
  {
    id: 'rate-limiting',
    title: 'Rate Limit Sensitive Operations',
    description:
      'Prevent abuse by limiting how often sensitive tools can be called per hour or day.',
    docUrl: 'https://docs.sentinel.london/sensitive-flags/rate-limiting',
    pageContexts: ['/admin/sensitive-flags'],
    prerequisiteFeatures: ['sensitive-flags'],
    detectUsage: {
      customCheck: 'hasRateLimitConfig',
    },
    priority: 30,
    category: 'advanced',
  },
  {
    id: 'a2a-protocol',
    title: 'Enable Agent-to-Agent',
    description: 'Let your AI agents securely communicate with each other using the A2A protocol.',
    docUrl: 'https://docs.sentinel.london/a2a',
    pageContexts: ['/admin/agents', '/admin/a2a'],
    detectUsage: {
      actionTypes: ['A2A_CREDENTIAL_CREATE'],
    },
    priority: 25,
    category: 'enterprise',
  },
  {
    id: 'policy-assertions',
    title: 'Test Your Policies',
    description: 'Write assertions to verify your policies work correctly before deploying.',
    docUrl: 'https://docs.sentinel.london/policies/assertions',
    pageContexts: ['/admin/policies', '/admin/policy-assertions'],
    prerequisiteFeatures: ['basic-policy'],
    detectUsage: {
      customCheck: 'hasPolicyAssertion',
    },
    priority: 20,
    category: 'intermediate',
  },
  {
    id: 'analytics-dashboard',
    title: 'Explore Usage Analytics',
    description: 'View detailed charts and trends about how your AI agents are using tools.',
    docUrl: 'https://docs.sentinel.london/analytics',
    pageContexts: ['/admin/dashboard'],
    detectUsage: {
      customCheck: 'hasViewedAnalytics',
    },
    priority: 15,
    category: 'basic',
  },
];
