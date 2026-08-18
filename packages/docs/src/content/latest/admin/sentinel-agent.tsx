import { Callout } from '../../../components/Callout';
import { CodeBlock } from '../../../components/CodeBlock';

export default function SentinelAgentDocs() {
  return (
    <>
      <h1 id="sentinel-agent">Sentinel Agent</h1>
      <p className="lead text-xl text-muted-foreground">
        Your AI-powered admin assistant. Sentinel Agent allows you to manage the entire platform
        using natural language, either through the dashboard chat interface or by connecting it to
        your favorite MCP client (Cursor, Claude Code, etc.).
      </p>

      <h2 id="what-can-it-do">What can it do?</h2>
      <p>
        Sentinel Agent exposes the full administrative API as a set of MCP tools. This means you can
        ask it to perform complex operations, analyze data, or troubleshoot issues without
        navigating multiple UI pages.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold text-primary mt-0">🔍 Analysis & Auditing</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1 mt-2">
            <li>"Who accessed the production database yesterday?"</li>
            <li>"Show me all denied requests from the engineering team."</li>
            <li>"Analyze policy usage and suggest optimizations."</li>
          </ul>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold text-primary mt-0">🛠️ Management & Config</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1 mt-2">
            <li>"Create a new read-only policy for the intern role."</li>
            <li>"Onboard a new MCP server at https://mcp.linear.app"</li>
            <li>"Rotate the API key for the GitHub integration."</li>
          </ul>
        </div>
      </div>

      <h2 id="how-it-works">How It Works</h2>
      <p>
        Sentinel Agent is built on the same <strong>Admin MCP Server</strong> (`packages/mcp-admin`)
        that powers external admin access.
      </p>
      <ul>
        <li>It operates with your administrator permissions.</li>
        <li>
          It strictly adheres to <strong>Safe Write Operations</strong>.
        </li>
      </ul>

      <Callout type="warning" title="Safety First">
        <strong>Sentinel Agent cannot bypass safety checks.</strong>
        <br />
        Any "Write" operation (creating a policy, deleting a user, etc.) requires explicit{' '}
        <strong>Confirmation</strong>. The agent will prepare the action and present a confirmation
        card in the chat (or a link in CLI) for you to approve before execution.
      </Callout>

      <h2 id="accessing-the-agent">Accessing the Agent</h2>

      <h3>1. Dashboard Chat</h3>
      <p>
        Click the <strong>Sentinel Agent</strong> icon (bottom right) anywhere in the admin
        dashboard.
      </p>
      <ul>
        <li>
          <strong>Context Aware:</strong> It knows which page you are looking at.
        </li>
        <li>
          <strong>Interactive:</strong> It renders interactive widgets for lists, logs, and
          confirmations.
        </li>
      </ul>

      <h3>2. External MCP Client (Meta-Administration)</h3>
      <p>
        You can connect your own AI tools (Cursor, Claude Desktop) to Sentinel's Admin MCP server to
        manage Sentinel itself.
      </p>
      <CodeBlock language="json" filename="claude_desktop_config.json">
        {`{
  "mcpServers": {
    "sentinel-admin": {
      "url": "http://localhost:3003/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ADMIN_TOKEN"
      }
    }
  }
}`}
      </CodeBlock>
      <p>
        <em>Note: The Admin MCP server runs on port 3003 by default.</em>
      </p>

      <h2 id="capabilities">Capabilities & Scopes</h2>
      <p>
        The agent's capabilities are governed by <strong>Admin Scopes</strong> configured in
        Organization Settings. You can restrict what the agent is allowed to touch (e.g., allow it
        to read logs but block it from managing users).
      </p>

      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Scope</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">POLICIES</td>
            <td className="p-2">Manage access rules and policy logic.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">USERS</td>
            <td className="p-2">Manage user accounts and role assignments.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">ROLES</td>
            <td className="p-2">Create, update, and delete roles.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">AGENTS</td>
            <td className="p-2">Register and manage AI agents.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">MCP_SERVERS</td>
            <td className="p-2">Connect and configure MCP tool servers.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">SENSITIVE_FLAGS</td>
            <td className="p-2">Configure sensitive tool flags for approval workflows.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">WEBHOOKS</td>
            <td className="p-2">Configure webhook endpoints for event notifications.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">PERMISSION_REQUESTS</td>
            <td className="p-2">Review and handle permission requests.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">AUDIT</td>
            <td className="p-2">Read audit logs and admin actions.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">ANALYTICS</td>
            <td className="p-2">View usage stats and summaries.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="admin-mcp-settings">Admin MCP Settings</h2>
      <p>
        Configure how the Admin MCP Server behaves for your organization. These settings control
        which administrators can use AI-assisted management and what operations they can perform.
      </p>

      <h3>Configuring Settings</h3>
      <p>
        Navigate to <strong>Settings &gt; Admin MCP</strong> in the dashboard to configure:
      </p>

      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Setting</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-left">Default</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">enabled</td>
            <td className="p-2">Master toggle for the Admin MCP Server feature.</td>
            <td className="p-2">false</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">enabledScopes</td>
            <td className="p-2">
              Which capability scopes are active. Limits what operations the agent can perform.
            </td>
            <td className="p-2">[] (none)</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">allowedAdmins</td>
            <td className="p-2">
              List of admin user IDs permitted to use the Admin MCP Server. Empty means all admins.
            </td>
            <td className="p-2">[] (all admins)</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">rateLimitPerMin</td>
            <td className="p-2">Maximum MCP tool calls per minute per admin. Range: 1-1000.</td>
            <td className="p-2">60</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">confirmationTtlSeconds</td>
            <td className="p-2">
              How long a write operation confirmation remains valid. Range: 60-3600 seconds.
            </td>
            <td className="p-2">300 (5 min)</td>
          </tr>
        </tbody>
      </table>

      <Callout type="info" title="Scope Risk Levels">
        Each scope has an associated risk level (LOW, MEDIUM, HIGH) that indicates the potential
        impact of its write operations. HIGH-risk scopes like USERS and ROLES can modify access
        controls and should be enabled carefully.
      </Callout>

      <h3>Getting Scope Information</h3>
      <p>
        Use the <code>admin.adminMcpSettings.getScopes</code> endpoint to retrieve detailed metadata
        about each scope, including:
      </p>
      <ul>
        <li>
          <strong>label:</strong> Human-readable name
        </li>
        <li>
          <strong>description:</strong> What the scope allows
        </li>
        <li>
          <strong>riskLevel:</strong> LOW, MEDIUM, or HIGH
        </li>
        <li>
          <strong>readTools:</strong> List of read-only tools in this scope
        </li>
        <li>
          <strong>writeTools:</strong> List of write tools (require confirmation)
        </li>
        <li>
          <strong>toolCount:</strong> Total number of tools
        </li>
      </ul>

      <h2 id="confirmation-workflow">Confirmation Workflow</h2>
      <p>
        Write operations performed through the Admin MCP Server require explicit human confirmation.
        This prevents accidental or malicious changes from being executed automatically.
      </p>

      <Callout type="warning" title="Required for All Write Operations">
        Every write operation (create, update, delete) must be confirmed before execution. There are
        no exceptions - this is a core security guarantee.
      </Callout>

      <h3>How Confirmation Works</h3>
      <div className="border p-4 rounded-lg bg-card my-4">
        <ol className="list-decimal pl-4 space-y-2">
          <li>
            <strong>Request:</strong> The AI agent calls a write tool (e.g.,{' '}
            <code>admin_create_policy</code>).
          </li>
          <li>
            <strong>Pending:</strong> Instead of executing, the system creates a confirmation record
            with all parameters.
          </li>
          <li>
            <strong>Review:</strong> The admin sees the pending action in the dashboard or chat
            interface.
          </li>
          <li>
            <strong>Decision:</strong> The admin confirms (execute) or rejects (discard) the action.
          </li>
          <li>
            <strong>Execution:</strong> If confirmed, the action runs with the original parameters.
          </li>
        </ol>
      </div>

      <h3>Confirmation Statuses</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">PENDING</td>
            <td className="p-2">Awaiting admin review and decision.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">CONFIRMED</td>
            <td className="p-2">Admin approved; action is being executed.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">REJECTED</td>
            <td className="p-2">Admin rejected; action will not execute.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">EXECUTED</td>
            <td className="p-2">Action was confirmed and completed successfully.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">FAILED</td>
            <td className="p-2">Action was confirmed but execution failed.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">EXPIRED</td>
            <td className="p-2">Confirmation TTL elapsed without a decision.</td>
          </tr>
        </tbody>
      </table>

      <h3>Managing Confirmations</h3>
      <p>
        Pending confirmations appear in the dashboard chat or on a dedicated confirmations page. You
        can:
      </p>
      <ul>
        <li>
          <strong>View Details:</strong> See the exact tool, parameters, and who requested it.
        </li>
        <li>
          <strong>Confirm:</strong> Execute the action with the shown parameters.
        </li>
        <li>
          <strong>Reject:</strong> Discard the action with an optional reason.
        </li>
        <li>
          <strong>Filter:</strong> View by status, session, or requesting admin.
        </li>
      </ul>

      <Callout type="info" title="Expiration">
        Confirmations automatically expire after the configured TTL (default: 5 minutes). Expired
        confirmations cannot be confirmed - the agent must request the action again.
      </Callout>

      <h3>Audit Integration</h3>
      <p>All confirmation activity is recorded in the admin action log, including:</p>
      <ul>
        <li>Who requested the action (via MCP)</li>
        <li>Who confirmed or rejected it</li>
        <li>The exact parameters and execution result</li>
        <li>Timestamps for each state change</li>
        <li>The MCP session ID for traceability</li>
      </ul>

      <h2 id="api-reference">API Reference</h2>

      <h3>Admin MCP Settings Endpoints</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpSettings.get</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get current Admin MCP settings.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpSettings.update</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Update Admin MCP settings.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpSettings.getScopes</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get all available scopes with metadata.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpSettings.getAdminUsers</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get list of admins that can be added to allowedAdmins.</td>
          </tr>
        </tbody>
      </table>

      <h3>Confirmation Endpoints</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.list</td>
            <td className="p-2">Query</td>
            <td className="p-2">
              List confirmations with optional filters (status, session, admin).
            </td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.get</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get a single confirmation by ID.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.pendingCount</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get count of pending confirmations.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.confirm</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Approve and execute a pending action.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.reject</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Reject a pending action with optional reason.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.adminMcpConfirmation.expireOld</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Expire old confirmations (for cleanup).</td>
          </tr>
        </tbody>
      </table>

      <h3>Confirmation List Parameters</h3>
      <p>
        The <code>list</code> endpoint accepts these filter parameters:
      </p>
      <ul>
        <li>
          <code>status</code>: Filter by confirmation status (PENDING, CONFIRMED, etc.)
        </li>
        <li>
          <code>mcpSessionId</code>: Filter by MCP session
        </li>
        <li>
          <code>adminUserId</code>: Filter by requesting admin
        </li>
        <li>
          <code>limit</code>: Max results (1-100, default 50)
        </li>
        <li>
          <code>offset</code>: Pagination offset
        </li>
      </ul>
    </>
  );
}
