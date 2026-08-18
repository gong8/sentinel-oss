import { Callout } from '../../../components/Callout';

export default function UserDashboardContent() {
  return (
    <>
      <h1 id="your-dashboard">Your Dashboard</h1>
      <p className="lead text-xl text-muted-foreground">
        Your personal hub for managing tool access, handling approvals, and tracking your AI
        assistant's activity.
      </p>

      <h2 id="overview">What You'll See</h2>
      <p>
        When you log in to SENTINEL, your dashboard gives you a quick overview of everything
        relevant to you:
      </p>

      <h3>Quick Stats</h3>
      <p>At the top of the dashboard, you'll see stat cards providing an at-a-glance overview:</p>
      <ul>
        <li>
          <strong>Tool Access</strong> - Shows your access rate as a percentage (e.g., "75% Access
          Rate"), with a breakdown of allowed tools out of total available tools
        </li>
        <li>
          <strong>MCP Servers</strong> - Number of connected servers, showing how many need
          credentials setup
        </li>
        <li>
          <strong>Pending Approvals</strong> - Tool invocations waiting for your approval action
        </li>
        <li>
          <strong>My Requests</strong> - Your access requests pending administrator review
        </li>
      </ul>

      <h3>Overview Cards</h3>
      <p>Below the quick stats, you'll find overview cards with more detail:</p>
      <ul>
        <li>
          <strong>Tool Access Overview</strong> - A visual breakdown of your allowed vs denied
          tools, with quick links to view all tools or request access to denied ones
        </li>
        <li>
          <strong>MCP Servers Overview</strong> - Shows the status of your MCP server connections,
          including which servers are connected, which need credentials, and which require no
          authentication
        </li>
      </ul>

      <h3>Pending Approvals</h3>
      <p>
        If any of your tool calls require approval, they'll appear here. You can also see approvals
        waiting for your decision if you're an approver for certain tools.
      </p>

      <Callout type="info" title="Approvals are real-time">
        When your AI assistant tries to use a tool that needs approval, it waits for your response.
        Approve quickly to keep your workflow moving smoothly.
      </Callout>

      <h3>Recent Activity</h3>
      <p>
        See what your AI assistant has been doing recently. Each entry shows the tool used, when it
        happened, and whether it succeeded.
      </p>

      <h3>Quick Actions</h3>
      <p>
        A set of shortcut buttons to common tasks: managing credentials, requesting access, viewing
        tools, and checking your activity history.
      </p>

      <h2 id="navigation">Getting Around</h2>
      <p>Use the sidebar to navigate to different sections:</p>

      <ul>
        <li>
          <strong>Dashboard</strong> - Return to this overview page
        </li>
        <li>
          <strong>MCP Servers</strong> - View connected MCP servers
        </li>
        <li>
          <strong>Credentials</strong> - Manage your API keys and connections
        </li>
        <li>
          <strong>Tools</strong> - See all available tools and your access level
        </li>
        <li>
          <strong>Audit</strong> - View your complete usage history
        </li>
        <li>
          <strong>Requests</strong> - Track your access requests
        </li>
        <li>
          <strong>Live Approvals</strong> - Manage pending approval requests
        </li>
      </ul>

      <h2 id="notifications">Staying Informed</h2>
      <p>SENTINEL keeps you informed about important events:</p>

      <ul>
        <li>
          <strong>Browser notifications</strong> - Get alerts when approvals are needed
        </li>
        <li>
          <strong>Dashboard badges</strong> - See counts of pending items at a glance
        </li>
      </ul>

      <Callout type="tip" title="Enable notifications">
        Make sure to enable browser notifications so you receive real-time alerts when approvals are
        needed.
      </Callout>

      <h2 id="sentinel-agent">Using the Sentinel Agent</h2>
      <p>
        The Sentinel Agent is your AI-powered assistant that can help you use tools and accomplish
        tasks. To get started:
      </p>
      <ol>
        <li>
          <a href="/docs/users/llm-config">Configure your LLM</a> - Set up your AI provider and API
          key
        </li>
        <li>Open the Agent panel from the sidebar or navigation</li>
        <li>Start chatting to discover and use available tools</li>
      </ol>

      <Callout type="info" title="Workspace-specific">
        Your LLM configuration is specific to each workspace. Set it up once per workspace you use.
      </Callout>

      <h2 id="onboarding">Getting Started Tour</h2>
      <p>
        New to SENTINEL? An interactive onboarding tour will guide you through the key features. The
        tour is tailored to your role:
      </p>
      <ul>
        <li>
          <strong>User Tour</strong> - Learn to use the Sentinel Agent and available tools
        </li>
        <li>
          <strong>Admin Tour</strong> - Learn to manage servers, policies, and audit logs
        </li>
        <li>
          <strong>Org Owner Tour</strong> - Learn to set up workspaces and manage your organization
        </li>
      </ul>
      <p>
        See <a href="/docs/users/onboarding">Onboarding Tours</a> for more details on how tours work
        and how to restart them.
      </p>

      <h2 id="next-steps">What to Do Next</h2>
      <p>Here are the most common things you'll want to do:</p>

      <ol>
        <li>
          <a href="/docs/users/llm-config">Configure your LLM</a> - Set up your AI provider for the
          Sentinel Agent
        </li>
        <li>
          <a href="/docs/users/credentials">Set up your credentials</a> - Add API keys for tools
          you'll use
        </li>
        <li>
          <a href="/docs/users/tools">Browse available tools</a> - See what you can access
        </li>
        <li>
          <a href="/docs/users/workspaces">Explore workspaces</a> - Understand your workspace
          context
        </li>
        <li>
          <a href="/docs/users/approvals">Handle approvals</a> - Approve sensitive tool calls
        </li>
      </ol>
    </>
  );
}
