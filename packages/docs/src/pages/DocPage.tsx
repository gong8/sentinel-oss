import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findNavItem, findNavSection, getNextPage, getPreviousPage } from '../lib/navigation';
import { cn } from '../lib/utils';

// Import all content pages
// Getting Started
import QuickTourContent from '../content/latest/getting-started/quick-tour';
import WelcomeContent from '../content/latest/getting-started/welcome';

// For Users
import UserActivityContent from '../content/latest/users/activity';
import UserApprovalsContent from '../content/latest/users/approvals';
import UserCredentialsContent from '../content/latest/users/credentials';
import UserDashboardContent from '../content/latest/users/dashboard';
import UserMcpServersContent from '../content/latest/users/mcp-servers';
import UserRequestingAccessContent from '../content/latest/users/requesting-access';
import UserToolsContent from '../content/latest/users/tools';

// For Administrators
import AdminAnalyticsContent from '../content/latest/admin/analytics';
import AdminDashboardContent from '../content/latest/admin/dashboard';
import AdminMcpServersContent from '../content/latest/admin/mcp-servers';
import AdminPoliciesContent from '../content/latest/admin/policies';
import AdminRequestsContent from '../content/latest/admin/requests';
import AdminRolesContent from '../content/latest/admin/roles';
import AdminSensitiveFlagsContent from '../content/latest/admin/sensitive-flags';
import AdminUsersContent from '../content/latest/admin/users';
import AdminWebhooksContent from '../content/latest/admin/webhooks';

// Technical Setup
import SetupClaudeCodeContent from '../content/latest/setup/claude-code';
import SetupCLICommandsContent from '../content/latest/setup/cli-commands';
import SetupCursorContent from '../content/latest/setup/cursor';
import SetupDeploymentContent from '../content/latest/setup/deployment';
import SetupOtherClientsContent from '../content/latest/setup/other-clients';
import SetupWindsurfContent from '../content/latest/setup/windsurf';

// Architecture
import ArchitectureAuditLoggingContent from '../content/latest/architecture/audit-logging';
import ArchitectureMcpProxyContent from '../content/latest/architecture/mcp-proxy';
import ArchitectureOverviewContent from '../content/latest/architecture/overview';
import ArchitecturePolicyEngineContent from '../content/latest/architecture/policy-engine';

// Features
import SentinelAgentContent from '../content/latest/admin/sentinel-agent';

// Reference
import ReferencePolicySyntaxContent from '../content/latest/reference/policy-syntax';
import ReferenceTroubleshootingContent from '../content/latest/reference/troubleshooting';

// Content mapping
const contentMap: Record<string, Record<string, React.ComponentType>> = {
  'getting-started': {
    welcome: WelcomeContent,
    'quick-tour': QuickTourContent,
  },
  users: {
    dashboard: UserDashboardContent,
    credentials: UserCredentialsContent,
    tools: UserToolsContent,
    'mcp-servers': UserMcpServersContent,
    'requesting-access': UserRequestingAccessContent,
    approvals: UserApprovalsContent,
    activity: UserActivityContent,
  },
  admin: {
    dashboard: AdminDashboardContent,
    users: AdminUsersContent,
    roles: AdminRolesContent,
    policies: AdminPoliciesContent,
    'sensitive-flags': AdminSensitiveFlagsContent,
    'mcp-servers': AdminMcpServersContent,
    requests: AdminRequestsContent,
    webhooks: AdminWebhooksContent,
    analytics: AdminAnalyticsContent,
    'sentinel-agent': SentinelAgentContent,
  },
  setup: {
    deployment: SetupDeploymentContent,
    'cli-commands': SetupCLICommandsContent,
    'claude-code': SetupClaudeCodeContent,
    cursor: SetupCursorContent,
    windsurf: SetupWindsurfContent,
    'other-clients': SetupOtherClientsContent,
  },
  architecture: {
    overview: ArchitectureOverviewContent,
    'policy-engine': ArchitecturePolicyEngineContent,
    'mcp-proxy': ArchitectureMcpProxyContent,
    'audit-logging': ArchitectureAuditLoggingContent,
  },
  reference: {
    'policy-syntax': ReferencePolicySyntaxContent,
    troubleshooting: ReferenceTroubleshootingContent,
  },
};

export function DocPage() {
  const {
    section,
    slug,
    version: _version,
  } = useParams<{
    section: string;
    slug: string;
    version?: string;
  }>();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section, slug]);

  if (!section || !slug) {
    return <NotFoundMessage />;
  }

  const Content = contentMap[section]?.[slug];
  if (!Content) {
    return <NotFoundMessage />;
  }

  const currentHref = `/docs/${section}/${slug}`;
  const navItem = findNavItem(currentHref);
  const navSection = findNavSection(currentHref);
  const prevPage = getPreviousPage(currentHref);
  const nextPage = getNextPage(currentHref);

  return (
    <div>
      {/* Breadcrumb */}
      {navSection && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <span>/</span>
          <span>{navSection.title}</span>
          <span>/</span>
          <span className="text-foreground">{navItem?.title}</span>
        </div>
      )}

      {/* Page content */}
      <Content />

      {/* Navigation footer */}
      <div className="mt-16 pt-8 border-t border-border">
        <div className="flex items-center justify-between">
          {prevPage ? (
            <Link
              to={prevPage.href}
              className={cn(
                'flex items-center gap-2 text-sm text-muted-foreground',
                'hover:text-foreground transition-colors',
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              <div>
                <span className="block text-xs uppercase tracking-wider">Previous</span>
                <span className="font-medium text-foreground">{prevPage.title}</span>
              </div>
            </Link>
          ) : (
            <div />
          )}

          {nextPage && (
            <Link
              to={nextPage.href}
              className={cn(
                'flex items-center gap-2 text-sm text-muted-foreground text-right',
                'hover:text-foreground transition-colors',
              )}
            >
              <div>
                <span className="block text-xs uppercase tracking-wider">Next</span>
                <span className="font-medium text-foreground">{nextPage.title}</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function NotFoundMessage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-display font-bold mb-4">Page Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The documentation page you're looking for doesn't exist.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to docs
      </Link>
    </div>
  );
}
