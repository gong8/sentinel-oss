import { Callout } from '../../../components/Callout';

export default function UserWorkspacesContent() {
  return (
    <>
      <h1 id="workspaces">Workspaces</h1>
      <p className="lead text-xl text-muted-foreground">
        Workspaces organize your tools, policies, and team members into isolated environments.
        Switch between workspaces to access different sets of resources.
      </p>

      <h2 id="what-are-workspaces">What Are Workspaces?</h2>
      <p>
        A workspace is a logical boundary within your organization. Each workspace can have its own:
      </p>
      <ul>
        <li>
          <strong>MCP Servers</strong> - Different tool integrations per workspace
        </li>
        <li>
          <strong>Policies</strong> - Custom access rules for the workspace
        </li>
        <li>
          <strong>Members</strong> - Users assigned to work in this workspace
        </li>
        <li>
          <strong>AI Agent</strong> - A workspace-specific chat assistant (if enabled)
        </li>
        <li>
          <strong>Credentials</strong> - Your personal API keys and OAuth connections are
          workspace-specific
        </li>
        <li>
          <strong>LLM Configuration</strong> - Your AI model settings are stored per-workspace
        </li>
      </ul>

      <Callout type="info" title="Organization Owners">
        If you are an organization owner, you automatically have access to all workspaces in your
        organization with admin privileges. You do not need to be explicitly added as a member.
      </Callout>

      <h2 id="viewing-workspaces">Viewing Your Workspaces</h2>
      <p>
        From the dashboard sidebar, you can see the list of workspaces you have access to. Each
        workspace shows:
      </p>
      <ul>
        <li>
          <strong>Workspace Name</strong> - The display name of the workspace
        </li>
        <li>
          <strong>Your Role</strong> - Whether you are a <code>MEMBER</code> or <code>ADMIN</code>
        </li>
        <li>
          <strong>Members Count</strong> - Total number of users in the workspace
        </li>
        <li>
          <strong>Policies Count</strong> - Number of active access policies
        </li>
        <li>
          <strong>MCP Servers Count</strong> - Number of connected tool servers
        </li>
        <li>
          <strong>Agents Count</strong> - Number of configured agents
        </li>
      </ul>

      <h3>Member vs Admin Role</h3>
      <p>Your role determines what you can do within a workspace:</p>
      <ul>
        <li>
          <strong>MEMBER</strong> - Can use tools, view your activity, manage personal credentials,
          configure your LLM settings, and access the workspace AI assistant
        </li>
        <li>
          <strong>ADMIN</strong> - Full control including managing members, policies, servers,
          organization-level credentials, and workspace settings
        </li>
      </ul>

      <Callout type="tip" title="Workspace Admin Access">
        You receive admin access to a workspace if you are an organization-level admin OR if you
        have been specifically assigned as a workspace admin by another admin.
      </Callout>

      <h2 id="switching-workspaces">Switching Workspaces</h2>
      <p>
        Click on a workspace in the sidebar to switch to it. Your dashboard and available tools will
        update to reflect the selected workspace context.
      </p>

      <h3>What Changes When You Switch</h3>
      <p>When you switch workspaces, several things update automatically:</p>
      <ul>
        <li>
          <strong>Available Tools</strong> - You see only the tools from MCP servers in this
          workspace
        </li>
        <li>
          <strong>Access Policies</strong> - The policies controlling your tool access change
        </li>
        <li>
          <strong>Activity History</strong> - You see only your activity within this workspace
        </li>
        <li>
          <strong>Sentinel Agent</strong> - Uses your LLM configuration for this specific workspace
        </li>
        <li>
          <strong>Credentials</strong> - Your workspace-specific credentials become active
        </li>
        <li>
          <strong>MCP Client</strong> - Your MCP client configuration (Cursor, Claude Code, etc.)
          will automatically connect to the servers available in that workspace
        </li>
      </ul>

      <h2 id="workspace-context">Working in Context</h2>
      <p>
        Everything you do in SENTINEL happens within a workspace context. Understanding this helps
        you work more effectively:
      </p>

      <h3>Credentials and API Keys</h3>
      <p>
        Your credentials (API keys, OAuth connections, JSON credentials) are stored separately for
        each workspace. If you work across multiple workspaces, you may need to:
      </p>
      <ul>
        <li>Set up the same API key in multiple workspaces</li>
        <li>Use different credentials for different workspaces</li>
        <li>Configure OAuth connections per workspace</li>
      </ul>

      <h3>LLM Configuration</h3>
      <p>
        Your AI model preferences (provider, API key, model selection) are also workspace-specific.
        See <a href="/docs/users/llm-config">LLM Configuration</a> for details on setting up your AI
        in each workspace.
      </p>

      <h3>Always-Allow Tools</h3>
      <p>
        The list of tools you've marked as "always allowed" for the Sentinel Agent is maintained
        per-workspace. This allows you to have different trust levels in different workspaces.
      </p>

      <h2 id="workspace-agent">Workspace AI Agent</h2>
      <p>
        If your administrator has enabled it, each workspace can have its own AI chat assistant.
        This assistant can:
      </p>
      <ul>
        <li>Answer questions about the workspace and available tools</li>
        <li>Execute tools on your behalf (with appropriate permissions)</li>
        <li>Help you accomplish tasks using the workspace's MCP servers</li>
      </ul>
      <p>
        To use the workspace agent, look for the chat icon in the workspace view. Your conversations
        are private to you within each workspace.
      </p>

      <Callout type="warning" title="Tool Execution">
        When the AI assistant uses tools, the same policies apply as if you were using them
        directly. Sensitive tools may require your confirmation before execution.
      </Callout>

      <h2 id="workspace-urls">Workspace URLs</h2>
      <p>
        Each workspace has a unique URL slug for direct access. For example:
        <code>/user/engineering</code> or <code>/admin/marketing-tools</code>.
      </p>
      <p>
        You can bookmark workspace URLs for quick access. The URL structure uses the workspace's
        slug identifier, which is unique within your organization.
      </p>

      <Callout type="info" title="URL Validation">
        If you try to access a workspace URL you do not have permission for, you will be redirected
        to your default workspace or shown an error. SENTINEL validates your membership before
        granting access.
      </Callout>

      <h2 id="requesting-workspace-access">Requesting Workspace Access</h2>
      <p>
        If you need access to a workspace you cannot see, contact your organization administrator.
        They can add you as a member through the admin dashboard.
      </p>
      <p>
        Once added, the workspace will appear in your sidebar and you can begin using its tools and
        resources. You may also need to:
      </p>
      <ul>
        <li>Set up credentials for MCP servers in the new workspace</li>
        <li>Configure your LLM settings to use the Sentinel Agent</li>
        <li>Request access to specific tools if policies restrict them</li>
      </ul>

      <h2 id="common-scenarios">Common Scenarios</h2>

      <h3>I Can't See a Workspace</h3>
      <p>If you can't see a workspace you expect to have access to:</p>
      <ul>
        <li>Verify you have been added as a member by an administrator</li>
        <li>Check that you're logged in with the correct account</li>
        <li>Contact your organization owner or workspace admin to request access</li>
      </ul>

      <h3>Tools Missing in a Workspace</h3>
      <p>Each workspace has its own set of MCP servers and tools. If a tool you need is missing:</p>
      <ul>
        <li>The MCP server may not be configured in this workspace</li>
        <li>Ask your workspace admin to add the server</li>
        <li>Check if the tool exists in a different workspace you have access to</li>
      </ul>

      <h3>Credentials Not Working</h3>
      <p>
        Remember that credentials are workspace-specific. If your credentials work in one workspace
        but not another:
      </p>
      <ul>
        <li>Verify you've set up credentials in the current workspace</li>
        <li>
          Check the <a href="/docs/users/credentials">Credentials</a> page for this workspace
        </li>
      </ul>

      <Callout type="tip" title="Stay Organized">
        If you work across many workspaces, bookmark your most frequently used ones and keep track
        of which credentials and configurations you've set up in each.
      </Callout>
    </>
  );
}
