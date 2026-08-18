import { BookOpen, Cog, FileText, Layers, Shield, User, type LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  description?: string;
}

export interface NavSection {
  title: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: 'Getting Started',
    icon: BookOpen,
    items: [
      {
        title: 'Welcome',
        href: '/docs/getting-started/welcome',
        description: 'What is SENTINEL and who is it for',
      },
      {
        title: 'Quick Tour',
        href: '/docs/getting-started/quick-tour',
        description: 'Visual walkthrough of main features',
      },
    ],
  },
  {
    title: 'For Users',
    icon: User,
    items: [
      {
        title: 'Your Dashboard',
        href: '/docs/users/dashboard',
        description: 'Overview of your personal dashboard',
      },
      {
        title: 'Workspaces',
        href: '/docs/users/workspaces',
        description: 'Switch between isolated environments',
      },
      {
        title: 'Managing Credentials',
        href: '/docs/users/credentials',
        description: 'Set up API keys and OAuth connections',
      },
      {
        title: 'Viewing Your Tools',
        href: '/docs/users/tools',
        description: 'See which tools you can access',
      },
      {
        title: 'MCP Servers',
        href: '/docs/users/mcp-servers',
        description: 'View available MCP servers and their status',
      },
      {
        title: 'Requesting Access',
        href: '/docs/users/requesting-access',
        description: 'How to request tool or server access',
      },
      {
        title: 'Approving Tool Calls',
        href: '/docs/users/approvals',
        description: 'Approve or deny sensitive tool usage',
      },
      {
        title: 'Your Activity Log',
        href: '/docs/users/activity',
        description: 'View your personal audit history',
      },
      {
        title: 'LLM Configuration',
        href: '/docs/users/llm-config',
        description: 'Configure your AI provider and API key',
      },
      {
        title: 'Onboarding Tours',
        href: '/docs/users/onboarding',
        description: 'Interactive guided tours for new users',
      },
    ],
  },
  {
    title: 'For Administrators',
    icon: Shield,
    items: [
      {
        title: 'Admin Dashboard',
        href: '/docs/admin/dashboard',
        description: 'Monitor your organization at a glance',
      },
      {
        title: 'Managing Users',
        href: '/docs/admin/users',
        description: 'Add, edit, and remove users',
      },
      {
        title: 'Managing Roles',
        href: '/docs/admin/roles',
        description: 'Create roles and assign users',
      },
      {
        title: 'Creating Access Rules',
        href: '/docs/admin/policies',
        description: 'Control who can use which tools',
      },
      {
        title: 'Setting Up Approvals',
        href: '/docs/admin/sensitive-flags',
        description: 'Require approval for sensitive tools',
      },
      {
        title: 'Managing Workspaces',
        href: '/docs/admin/workspaces',
        description: 'Organize into isolated workspaces',
      },
      {
        title: 'Adding Tool Servers',
        href: '/docs/admin/mcp-servers',
        description: 'Connect new tool servers',
      },
      {
        title: 'Reviewing Requests',
        href: '/docs/admin/requests',
        description: 'Approve user access requests',
      },
      {
        title: 'Sentinel Agent',
        href: '/docs/admin/sentinel-agent',
        description: 'AI-powered admin assistant',
      },
      {
        title: 'Setting Up Alerts',
        href: '/docs/admin/webhooks',
        description: 'Configure Slack, Discord, or email alerts',
      },
      {
        title: 'Viewing Analytics',
        href: '/docs/admin/analytics',
        description: 'Understand usage patterns',
      },
      {
        title: 'Access Review',
        href: '/docs/admin/access-review',
        description: 'SOC2 compliance access reports',
      },
      {
        title: 'Workspace Chat',
        href: '/docs/admin/workspace-chat',
        description: 'Configure AI chat for workspaces',
      },
      {
        title: 'Managing Sessions',
        href: '/docs/admin/sessions',
        description: 'Monitor and control active sessions',
      },
      {
        title: 'LLM Settings',
        href: '/docs/admin/llm-settings',
        description: 'Configure AI model providers',
      },
      {
        title: 'Global Variables',
        href: '/docs/admin/global-variables',
        description: 'Define reusable policy variables',
      },
    ],
  },
  {
    title: 'Technical Setup',
    icon: Cog,
    items: [
      {
        title: 'Deployment Options',
        href: '/docs/setup/deployment',
        description: 'SaaS vs self-hosted deployment',
      },
      {
        title: 'CLI Commands',
        href: '/docs/setup/cli-commands',
        description: 'pnpm commands for setup and management',
      },
      {
        title: 'Claude Code Setup',
        href: '/docs/setup/claude-code',
        description: 'Configure Claude Code or Desktop',
      },
      {
        title: 'Cursor Setup',
        href: '/docs/setup/cursor',
        description: 'Configure Cursor IDE',
      },
      {
        title: 'Windsurf Setup',
        href: '/docs/setup/windsurf',
        description: 'Configure Windsurf',
      },
      {
        title: 'Other MCP Clients',
        href: '/docs/setup/other-clients',
        description: 'Generic MCP client configuration',
      },
    ],
  },
  {
    title: 'Architecture',
    icon: Layers,
    items: [
      {
        title: 'Overview',
        href: '/docs/architecture/overview',
        description: 'System design and component map',
      },
      {
        title: 'Policy Engine',
        href: '/docs/architecture/policy-engine',
        description: 'Evaluation logic and precedence',
      },
      {
        title: 'MCP Proxy',
        href: '/docs/architecture/mcp-proxy',
        description: 'Request interception and handling',
      },
      {
        title: 'Audit Logging',
        href: '/docs/architecture/audit-logging',
        description: 'Compliance and data retention',
      },
    ],
  },
  {
    title: 'Reference',
    icon: FileText,
    items: [
      {
        title: 'Policy Syntax',
        href: '/docs/reference/policy-syntax',
        description: 'Technical policy syntax reference',
      },
      {
        title: 'Troubleshooting',
        href: '/docs/reference/troubleshooting',
        description: 'Common issues and solutions',
      },
    ],
  },
];

export function getNavigation(): NavSection[] {
  return navigation;
}

export function findNavItem(href: string): NavItem | undefined {
  for (const section of navigation) {
    const item = section.items.find((i) => i.href === href);
    if (item) return item;
  }
  return undefined;
}

export function findNavSection(href: string): NavSection | undefined {
  return navigation.find((section) => section.items.some((i) => i.href === href));
}

export function getNextPage(currentHref: string): NavItem | undefined {
  const allItems = navigation.flatMap((s) => s.items);
  const currentIndex = allItems.findIndex((i) => i.href === currentHref);
  return currentIndex >= 0 && currentIndex < allItems.length - 1
    ? allItems[currentIndex + 1]
    : undefined;
}

export function getPreviousPage(currentHref: string): NavItem | undefined {
  const allItems = navigation.flatMap((s) => s.items);
  const currentIndex = allItems.findIndex((i) => i.href === currentHref);
  return currentIndex > 0 ? allItems[currentIndex - 1] : undefined;
}
