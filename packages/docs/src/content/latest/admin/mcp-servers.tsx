import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminMcpServersContent() {
  return (
    <>
      <h1 id="managing-mcp-servers">Managing MCP Servers</h1>
      <p className="lead text-xl text-muted-foreground">
        Connect external Tool Servers to Sentinel. Sentinel acts as a centralized proxy, managing
        authentication and policy enforcement for all your tools.
      </p>

      <h2 id="server-architecture">Server Architecture</h2>
      <p>
        Sentinel connects to MCP servers over <strong>HTTP/HTTPS</strong>. Unlike local MCP clients
        that might spawn processes (like `docker run` or `node server.js`), Sentinel requires
        servers to be running and accessible over the network.
      </p>
      <p>This architecture allows for:</p>
      <ul>
        <li>
          <strong>Centralized Auth:</strong> Sentinel manages API keys and OAuth tokens securely.
        </li>
        <li>
          <strong>Zero-Trust Access:</strong> Users access tools through Sentinel, never connecting
          directly to the backend.
        </li>
        <li>
          <strong>High Availability:</strong> Servers can be load-balanced and scaled independently.
        </li>
      </ul>

      <h2 id="adding-a-server">Adding a Server</h2>
      <p>
        Navigate to <strong>Servers</strong> in the admin sidebar and click{' '}
        <strong>Add Server</strong>.
      </p>

      <Steps>
        <Step number={1} title="Enter Server URL">
          <p>
            Enter the full URL of the MCP endpoint (e.g., <code>https://mcp.github.com/sse</code>).
          </p>
          <Callout type="info" title="Auth Detection">
            Sentinel will attempt to probe the URL while you type to detect the required
            authentication method (API Key vs OAuth). You can always manually override this
            selection.
          </Callout>
        </Step>

        <Step number={2} title="Select Auth Type">
          <p>Choose how Sentinel should authenticate with the upstream server:</p>
          <ul>
            <li>
              <strong>None:</strong> No authentication required.
            </li>
            <li>
              <strong>API Key:</strong> Provide a shared Bearer token.
            </li>
            <li>
              <strong>OAuth 2.1:</strong> Use standard OAuth flows (supports Dynamic Client
              Registration).
            </li>
          </ul>
        </Step>

        <Step number={3} title="Set Trust Level">
          <p>
            Toggle the <strong>Trust server</strong> switch.
            <br />
            <em>
              Untrusted servers are restricted by default DENY policies to prevent accidental
              exposure of new tools.
            </em>
          </p>
        </Step>

        <Step number={4} title="Save & Discover">
          <p>
            Click <strong>Add Server</strong>. Sentinel will immediately attempt to connect and
            synchronize the list of available tools.
          </p>
        </Step>
      </Steps>

      <h2 id="authentication-modes">Authentication Modes</h2>

      <h3>1. Shared API Key</h3>
      <p>
        Administrators provide a single API Key that Sentinel use for <strong>all</strong> requests
        to this server.
      </p>

      <h3>2. OAuth 2.1 (User-Scoped)</h3>
      <p>Sentinel handles the complex OAuth 2.1 handshake, including token rotation and refresh.</p>
      <ul>
        <li>
          <strong>DCR Support:</strong> If the server supports Dynamic Client Registration, Sentinel
          will register itself automatically.
        </li>
        <li>
          <strong>User Connection:</strong> Users must individually "Connect" to the server via
          their personal dashboard to grant permission.
        </li>
      </ul>

      <h2 id="tool-synchronization">Tool Synchronization</h2>
      <p>
        Tool discovery is automatic. When a server is added or updated, Sentinel fetches the latest
        tool definitions. You can manually trigger a re-sync from the server details view at any
        time.
      </p>

      <h2 id="workspace-inheritance">Workspace Inheritance</h2>
      <p>
        MCP servers can be configured at the organization level or scoped to specific workspaces.
        Understanding inheritance is key to managing access effectively.
      </p>

      <h3>Organization-Level Servers</h3>
      <p>
        Servers added at the organization level are automatically available to all workspaces. This
        is ideal for shared infrastructure like company-wide GitHub or Slack integrations.
      </p>

      <h3>Workspace-Scoped Servers</h3>
      <p>
        Servers can be added directly to a workspace, making them available only within that
        workspace. Use this for team-specific tools or isolated environments.
      </p>

      <h3>Inheritance Behavior</h3>
      <ul>
        <li>
          <strong>Visibility:</strong> Workspace members see both organization servers and
          workspace-specific servers.
        </li>
        <li>
          <strong>Policies:</strong> Organization-level policies for a server apply across all
          workspaces. Workspace-specific policies can add additional restrictions but cannot
          override organization DENY policies.
        </li>
        <li>
          <strong>Management:</strong> Organization servers can only be edited by organization
          admins. Workspace servers can be managed by workspace admins.
        </li>
      </ul>

      <Callout type="info" title="Server Scope Display">
        When viewing servers in a workspace, organization-level servers are marked with an
        "Inherited" badge to distinguish them from workspace-specific servers.
      </Callout>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>"Endpoint did not respond"</h3>
      <ul>
        <li>Ensure the server is accessible from the Sentinel instance.</li>
        <li>
          If running Sentinel in Docker, use <code>host.docker.internal</code> to refer to services
          running on your host machine.
        </li>
        <li>
          Verify you are using the full endpoint path (e.g., <code>/mcp</code>), not just the
          domain.
        </li>
      </ul>
    </>
  );
}
