import { Callout } from '../../../components/Callout';

export default function AdminDashboardContent() {
  return (
    <>
      <h1 id="admin-dashboard">Admin Dashboard</h1>
      <p className="lead text-xl text-muted-foreground">
        The central control panel for your Sentinel organization. Monitor security posture, handle
        live approvals, and review recent activity in real-time.
      </p>

      <h2 id="key-metrics">Key Metrics</h2>
      <p>
        The top of the dashboard displays four primary indicators of your organization's scale and
        state:
      </p>
      <ul>
        <li>
          <strong>Users</strong>: Total number of active user accounts.
        </li>
        <li>
          <strong>Active Policies</strong>: Number of enabled access control policies.
        </li>
        <li>
          <strong>MCP Servers</strong>: Total connected tool servers and the sum of all discovered
          tools.
        </li>
        <li>
          <strong>Agents</strong>: Total number of registered automated agents.
        </li>
      </ul>

      <h2 id="live-approvals">Live Approvals</h2>
      <p>
        When tools are marked as <strong>Sensitive</strong> or triggered by{' '}
        <strong>DEFER policies</strong>, they appear here for immediate review.
      </p>
      <ul>
        <li>
          <strong>Real-time:</strong> The dashboard polls the server every second to ensure requests
          are handled without delay.
        </li>
        <li>
          <strong>Direct Action:</strong> Approve or Deny requests directly from the dashboard feed.
        </li>
        <li>
          <strong>Browser Notifications:</strong> You can enable desktop notifications to be alerted
          of new approval requests even when the dashboard is in the background.
        </li>
      </ul>

      <h2 id="mcp-confirmations">MCP Confirmations</h2>
      <p>
        The <strong>MCP Confirmations</strong> section displays pending tool confirmations that
        require user acknowledgment. Unlike Live Approvals (which are admin-controlled), MCP
        Confirmations are user-facing prompts that appear when:
      </p>
      <ul>
        <li>A tool requires explicit user consent before execution.</li>
        <li>The tool's action is irreversible or has significant side effects.</li>
        <li>Additional context or parameters need user verification.</li>
      </ul>
      <p>
        Admins can monitor the confirmation queue to ensure users are responding to prompts in a
        timely manner and to identify tools that frequently require confirmation.
      </p>

      <h2 id="pending-actions">Pending Actions</h2>
      <p>
        This section highlights administrative tasks that require attention, specifically{' '}
        <strong>Access Requests</strong> from users who need new permissions.
      </p>

      <h2 id="recent-audit-activity">Recent Audit Activity</h2>
      <p>
        A scrolling feed of the latest tool invocations across the entire organization. Each entry
        shows:
      </p>
      <ul>
        <li>The tool being called.</li>
        <li>The actor (User or Agent) performing the action.</li>
        <li>The decision (ALLOW/DENY) made by the policy engine.</li>
        <li>A timestamp of the event.</li>
      </ul>

      <Callout type="info" title="Unified Visibility">
        The dashboard provides a combined view of both human and agent activity, ensuring a single
        source of truth for your tool governance.
      </Callout>

      <h2 id="navigation">Navigation</h2>
      <p>The sidebar provides deep links to specialized management interfaces:</p>
      <ul>
        <li>
          <strong>Users & Roles:</strong> Manage identity and access groups.
        </li>
        <li>
          <strong>Policies:</strong> Define the rules governing tool usage.
        </li>
        <li>
          <strong>Servers & Tools:</strong> Configure the backend infrastructure and discover
          capabilities.
        </li>
        <li>
          <strong>Audit Log:</strong> Access the full immutable history of all actions.
        </li>
      </ul>
    </>
  );
}
