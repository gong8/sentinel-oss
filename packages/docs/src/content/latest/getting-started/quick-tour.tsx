import { Callout } from '../../../components/Callout';

export default function QuickTourContent() {
  return (
    <>
      <h1 id="quick-tour">Quick Tour</h1>
      <p className="lead text-xl text-muted-foreground">
        A visual walkthrough of SENTINEL's main features. See how the dashboard works and what you
        can do with it.
      </p>

      <h2 id="the-dashboard">The Dashboard</h2>
      <p>
        When you log in to SENTINEL, you'll see your personalized dashboard. What you see depends on
        your role - regular users see their own tools and activity, while administrators see
        organization-wide information.
      </p>

      <h3>For Regular Users</h3>
      <p>Your dashboard shows:</p>
      <ul>
        <li>
          <strong>Your Tools</strong> - A list of tools you can use, organized by server
        </li>
        <li>
          <strong>Pending Approvals</strong> - Any tool calls waiting for your approval
        </li>
        <li>
          <strong>Recent Activity</strong> - Your recent tool usage
        </li>
        <li>
          <strong>Your Credentials</strong> - API keys and connections you've set up
        </li>
      </ul>

      <h3>For Administrators</h3>
      <p>The admin dashboard adds:</p>
      <ul>
        <li>
          <strong>Organization Stats</strong> - Total users, active tools, and usage metrics
        </li>
        <li>
          <strong>All Pending Approvals</strong> - Approval requests across the organization
        </li>
        <li>
          <strong>Access Requests</strong> - Users requesting access to new tools
        </li>
        <li>
          <strong>Recent Alerts</strong> - Important events that need attention
        </li>
      </ul>

      <h2 id="key-features">Key Features</h2>

      <h3>Tools and Access</h3>
      <p>
        The <strong>Tools</strong> page shows all available tools organized by their source server.
        For each tool, you can see:
      </p>
      <ul>
        <li>Whether you can use it (allowed, blocked, or needs approval)</li>
        <li>What the tool does</li>
        <li>Who else has access (for admins)</li>
      </ul>

      <h3>Approvals</h3>
      <p>
        When a tool is marked as sensitive, it requires approval before it can run. The{' '}
        <strong>Approvals</strong> page shows:
      </p>
      <ul>
        <li>Pending requests waiting for your decision</li>
        <li>What the AI is trying to do</li>
        <li>Who made the request</li>
        <li>Approve or deny buttons</li>
      </ul>

      <Callout type="info" title="Real-time approvals">
        Approvals happen in real-time. When you approve or deny a request, the AI assistant gets the
        result immediately and can continue its work.
      </Callout>

      <h3>Activity Log</h3>
      <p>
        The <strong>Activity</strong> page shows a complete history of tool usage. You can filter
        by:
      </p>
      <ul>
        <li>User (who made the request)</li>
        <li>Tool (which tool was used)</li>
        <li>Status (allowed, denied, approved, etc.)</li>
        <li>Date range</li>
      </ul>

      <h3>Access Rules (Administrators)</h3>
      <p>
        The <strong>Access Rules</strong> page lets admins control who can use which tools. Each
        rule specifies:
      </p>
      <ul>
        <li>Who it applies to (everyone, a role, or specific users)</li>
        <li>Which tools it covers (all, from a server, or specific tools)</li>
        <li>What happens (allow, block, or require approval)</li>
      </ul>

      <h2 id="typical-workflow">A Typical Workflow</h2>

      <h3>For a Developer</h3>
      <ol>
        <li>Log in to SENTINEL and check your dashboard</li>
        <li>Set up any credentials you need (API keys, OAuth connections)</li>
        <li>Use your AI coding assistant normally</li>
        <li>When the AI needs a sensitive tool, approve or deny from the dashboard</li>
        <li>Review your activity log to see what the AI has done</li>
      </ol>

      <h3>For an Administrator</h3>
      <ol>
        <li>Set up tool servers that your team needs</li>
        <li>Create roles for different teams (Engineering, Design, etc.)</li>
        <li>Create access rules to control who can use what</li>
        <li>Mark sensitive tools that need approval</li>
        <li>Monitor activity and review access requests</li>
      </ol>

      <Callout type="tip" title="Next steps">
        Now that you've seen the overview, explore the detailed guides:
        <ul className="mt-2">
          <li>
            <a href="/docs/users/dashboard">User Guide</a> - For developers using SENTINEL
          </li>
          <li>
            <a href="/docs/admin/dashboard">Admin Guide</a> - For organization administrators
          </li>
        </ul>
      </Callout>
    </>
  );
}
