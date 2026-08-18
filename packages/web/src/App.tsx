/**
 * Main App Component
 * Sets up routing and tRPC provider
 *
 * Route Structure:
 * - /select-workspace - Workspace selection page
 * - /admin/:workspaceSlug/* - Admin routes scoped to workspace
 * - /admin/:workspaceSlug/agent/* - Agent routes scoped to workspace (nested under admin)
 * - /user/:workspaceSlug/* - User routes scoped to workspace
 * - /global/admin/* - Redirects to /admin/global/* (backwards compat for org owners)
 * - /global/user/* - Redirects to /user/global/* (backwards compat for org owners)
 * - /admin/*, /user/* - Legacy routes, redirect to /select-workspace
 */

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchStreamLink, TRPCClientError } from '@trpc/client';
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { toast, Toaster } from 'sonner';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { WorkspaceProtectedRoute } from './components/auth/WorkspaceProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LegacyRouteRedirect } from './components/LegacyRouteRedirect';
import { OnboardingWidget } from './components/onboarding';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { PreferencesProvider } from './hooks/PreferencesContext';
import { WorkspaceProvider } from './hooks/WorkspaceContext';
import { clearAccessToken, getAccessToken } from './lib/auth';
import { trpc } from './lib/trpc';

// Validate API URL configuration in production
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
if (import.meta.env.PROD && (API_URL.includes('localhost') || API_URL.includes('127.0.0.1'))) {
  console.error(
    '[Sentinel] CRITICAL: VITE_API_URL is set to localhost in production build. ' +
      'The frontend will not be able to communicate with the API server. ' +
      'Set VITE_API_URL during build time to your production API URL.',
  );
}

// Page imports (stubs)
import AdminA2AAgents from './pages/admin/A2AAgents';
import AdminActionLog from './pages/admin/AdminActionLog';
import AdminActionLogDetail from './pages/admin/AdminActionLogDetail';
import AdminMcpConfirmations from './pages/admin/AdminMcpConfirmations';
import AdminAgents from './pages/admin/Agents';
import AdminAnalytics from './pages/admin/Analytics';
import AdminAudit from './pages/admin/Audit';
import AdminAuditDetail from './pages/admin/AuditDetail';
import AdminCredentials from './pages/admin/Credentials';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDeletedItems from './pages/admin/DeletedItems';
import AdminMcpServerRequests from './pages/admin/McpServerRequests';
import AdminMcpServers from './pages/admin/McpServers';
import AdminPermissionRequests from './pages/admin/PermissionRequests';
import AdminPolicies from './pages/admin/Policies';
import AdminPolicyAssertions from './pages/admin/PolicyAssertions';
import AdminPolicyConflicts from './pages/admin/PolicyConflicts';
import AdminPolicyExceptions from './pages/admin/PolicyExceptions';
import AdminPolicyPlayground from './pages/admin/PolicyPlayground';
import AdminPolicyProposals from './pages/admin/PolicyProposals';
import AdminPublishers from './pages/admin/Publishers';
import AdminRoles from './pages/admin/Roles';
import AdminSensitiveFlags from './pages/admin/SensitiveFlags';
import AdminSessions from './pages/admin/Sessions';
import {
  SettingsAdminMcp,
  SettingsAdvanced,
  SettingsAppearance,
  SettingsLLM,
  SettingsNavigation,
  SettingsOrganization,
  SettingsOrgOwners,
  SettingsPolicyTags,
  SettingsSystem,
  SettingsVariables,
} from './pages/admin/settings';
import AdminTools from './pages/admin/Tools';
import AdminUsers from './pages/admin/Users';
import AdminWebhooks from './pages/admin/Webhooks';
import AdminWorkspaceDetail from './pages/admin/WorkspaceDetail';
import AdminWorkspaces from './pages/admin/Workspaces';
import LoginPage from './pages/LoginPage';
import NotFound from './pages/NotFound';
import OAuthResult from './pages/OAuthResult';
import UserApprovals from './pages/user/Approvals';
import UserAudit from './pages/user/Audit';
import UserCredentials from './pages/user/Credentials';
import UserDashboard from './pages/user/Dashboard';
import UserMcpServers from './pages/user/McpServers';
import UserRequests from './pages/user/Requests';
import UserTools from './pages/user/Tools';
import WorkspaceSelectionPage from './pages/WorkspaceSelectionPage';

// Agent pages
import AdminAgentPage from './pages/agent/AdminAgentPage';
import AgentSettingsPage from './pages/agent/AgentSettingsPage';
import UserAgentPage from './pages/agent/UserAgentPage';

// Workspace Chat Settings
import WorkspaceChatSettings from './pages/admin/WorkspaceChatSettings';

/**
 * Deprecated Route Error Page
 * Shown when users hit the old route pattern /:workspaceSlug/(admin|user)/*
 * Note: /global/admin/* and /global/user/* are allowed and redirect to new pattern
 */
function DeprecatedRouteError() {
  const { workspaceSlug, '*': rest } = useParams();
  const currentPath = window.location.pathname;

  // Determine if this is an admin or user route based on the path
  const isAdmin = currentPath.includes('/admin');
  const isUser = currentPath.includes('/user');
  const routeType = isAdmin ? 'admin' : isUser ? 'user' : 'unknown';

  // Allow "global" workspace to use old pattern for admin/user - redirect to new pattern
  if (workspaceSlug === 'global' && (isAdmin || isUser)) {
    const newPath = `/${routeType}/global${rest ? `/${rest}` : ''}`;
    return <Navigate to={newPath} replace />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fee2e2',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          backgroundColor: '#dc2626',
          color: 'white',
          padding: '3rem',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          DEPRECATED ROUTE PATTERN
        </h1>
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            fontFamily: 'monospace',
            fontSize: '1.1rem',
          }}
        >
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>Current URL:</strong> {currentPath}
          </p>
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>Pattern detected:</strong> /{workspaceSlug}/{routeType}/...
          </p>
        </div>
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            URL should follow the NEW pattern:
          </p>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#fef08a',
            }}
          >
            /admin/{'{workspace}'}/ or /user/{'{workspace}'}/
          </p>
          <p style={{ fontSize: '1rem', marginTop: '1rem', opacity: 0.9 }}>NOT</p>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              textDecoration: 'line-through',
              opacity: 0.7,
            }}
          >
            /{'{workspace}'}/admin/ or /{'{workspace}'}/user/
          </p>
        </div>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Please update any bookmarks, links, or code referencing the old URL pattern.
        </p>
      </div>
    </div>
  );
}

// Helper function to handle errors consistently
function handleError(error: Error, _type: 'query' | 'mutation') {
  // Handle UNAUTHORIZED errors by redirecting to login
  if (error instanceof TRPCClientError) {
    if (error.data?.code === 'UNAUTHORIZED') {
      clearAccessToken();
      window.location.href = '/login';
      return;
    }
  }

  // Default: show toast for other errors
  toast.error('Something went wrong', { description: error.message });
}

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => handleError(error, 'query'),
        }),
        mutationCache: new MutationCache({
          onError: (error) => handleError(error, 'mutation'),
        }),
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: `${API_URL}/trpc`,
          headers() {
            const token = getAccessToken();
            return token
              ? {
                  authorization: `Bearer ${token}`,
                }
              : {};
          },
        }),
      ],
    }),
  );

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <PreferencesProvider>
              <BrowserRouter>
                <WorkspaceProvider>
                  <OnboardingProvider>
                    <Routes>
                      <Route path="/" element={<Navigate to="/select-workspace" replace />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/oauth/result" element={<OAuthResult />} />
                      <Route
                        path="/select-workspace"
                        element={
                          <ProtectedRoute>
                            <WorkspaceSelectionPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* ==================== */}
                      {/* Workspace-Scoped Admin Routes: /admin/:workspaceSlug/* */}
                      {/* ==================== */}
                      <Route
                        path="/admin/:workspaceSlug"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminDashboard />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/users"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminUsers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/roles"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminRoles />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/workspaces"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminWorkspaces />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/workspaces/:id"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminWorkspaceDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/policies"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicies />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/mcp-servers"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminMcpServers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/credentials"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminCredentials />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/tools"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminTools />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/agents"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminAgents />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/publishers"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPublishers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/audit"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminAudit />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/audit/:id"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminAuditDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/requests"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPermissionRequests />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/mcp-requests"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminMcpServerRequests />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/analytics"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminAnalytics />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/policy-playground"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicyPlayground />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/policy-conflicts"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicyConflicts />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/policy-assertions"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicyAssertions />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/action-log"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminActionLog />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/action-log/:id"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminActionLogDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/sessions"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminSessions />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/deleted-items"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminDeletedItems />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/sensitive-flags"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminSensitiveFlags />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/webhooks"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminWebhooks />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsAppearance />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/navigation"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsNavigation />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/organization"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsOrganization />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/system"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsSystem />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/variables"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsVariables />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/advanced"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsAdvanced />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/admin-mcp"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsAdminMcp />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/llm"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsLLM />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/chat"
                        element={
                          <WorkspaceProtectedRoute>
                            <WorkspaceChatSettings />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/owners"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsOrgOwners />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/settings/tags"
                        element={
                          <WorkspaceProtectedRoute>
                            <SettingsPolicyTags />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/mcp-confirmations"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminMcpConfirmations />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/a2a-agents"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminA2AAgents />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/proposals"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicyProposals />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/policy-exceptions"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminPolicyExceptions />
                          </WorkspaceProtectedRoute>
                        }
                      />

                      {/* ==================== */}
                      {/* Workspace-Scoped User Routes: /user/:workspaceSlug/* */}
                      {/* ==================== */}
                      <Route
                        path="/user/:workspaceSlug"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserDashboard />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/mcp-servers"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserMcpServers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/credentials"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserCredentials />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/tools"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserTools />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/audit"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserAudit />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/requests"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserRequests />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/approvals"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserApprovals />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/agent"
                        element={
                          <WorkspaceProtectedRoute>
                            <UserAgentPage />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/user/:workspaceSlug/agent/settings"
                        element={
                          <WorkspaceProtectedRoute>
                            <AgentSettingsPage />
                          </WorkspaceProtectedRoute>
                        }
                      />

                      {/* ==================== */}
                      {/* Admin Agent Routes: /admin/:workspaceSlug/agent/* */}
                      {/* ==================== */}
                      <Route
                        path="/admin/:workspaceSlug/agent"
                        element={
                          <WorkspaceProtectedRoute>
                            <AdminAgentPage />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/:workspaceSlug/agent/settings"
                        element={
                          <WorkspaceProtectedRoute>
                            <AgentSettingsPage />
                          </WorkspaceProtectedRoute>
                        }
                      />

                      {/* ==================== */}
                      {/* Global Admin Routes: /global/admin/* (org owners only) */}
                      {/* ==================== */}
                      <Route
                        path="/global/admin"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminDashboard />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/users"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminUsers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/roles"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminRoles />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/workspaces"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminWorkspaces />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/workspaces/:id"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminWorkspaceDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/policies"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicies />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/mcp-servers"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminMcpServers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/credentials"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminCredentials />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/tools"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminTools />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/agents"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminAgents />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/publishers"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPublishers />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/audit"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminAudit />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/audit/:id"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminAuditDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/requests"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPermissionRequests />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/mcp-requests"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminMcpServerRequests />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/analytics"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminAnalytics />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/policy-playground"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicyPlayground />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/policy-conflicts"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicyConflicts />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/policy-assertions"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicyAssertions />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/action-log"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminActionLog />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/action-log/:id"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminActionLogDetail />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/sessions"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminSessions />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/deleted-items"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminDeletedItems />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/sensitive-flags"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminSensitiveFlags />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/webhooks"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminWebhooks />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsAppearance />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/navigation"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsNavigation />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/organization"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsOrganization />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/system"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsSystem />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/variables"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsVariables />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/advanced"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsAdvanced />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/admin-mcp"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsAdminMcp />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/llm"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsLLM />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/owners"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsOrgOwners />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/settings/tags"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <SettingsPolicyTags />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/mcp-confirmations"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminMcpConfirmations />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/a2a-agents"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminA2AAgents />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/proposals"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicyProposals />
                          </WorkspaceProtectedRoute>
                        }
                      />
                      <Route
                        path="/global/admin/policy-exceptions"
                        element={
                          <WorkspaceProtectedRoute requireOrgOwner>
                            <AdminPolicyExceptions />
                          </WorkspaceProtectedRoute>
                        }
                      />

                      {/* ==================== */}
                      {/* DEPRECATED Route Pattern Catch-alls */}
                      {/* These catch the OLD pattern: /:workspaceSlug/(admin|user)/* */}
                      {/* and show a visible error page */}
                      {/* Note: /global/* is excluded - it's a valid pattern for org owners */}
                      {/* ==================== */}
                      <Route path="/:workspaceSlug/admin/*" element={<DeprecatedRouteError />} />
                      <Route path="/:workspaceSlug/admin" element={<DeprecatedRouteError />} />
                      <Route path="/:workspaceSlug/user/*" element={<DeprecatedRouteError />} />
                      <Route path="/:workspaceSlug/user" element={<DeprecatedRouteError />} />

                      {/* ==================== */}
                      {/* Legacy Route Redirects */}
                      {/* Old /admin/* and /user/* routes redirect to workspace selection */}
                      {/* ==================== */}
                      <Route path="/admin/*" element={<LegacyRouteRedirect />} />
                      <Route path="/user/*" element={<LegacyRouteRedirect />} />

                      {/* Catch-all 404 route */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    <OnboardingWidget />
                  </OnboardingProvider>
                </WorkspaceProvider>
              </BrowserRouter>
              <Toaster richColors position="top-right" />
            </PreferencesProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}

export default App;
