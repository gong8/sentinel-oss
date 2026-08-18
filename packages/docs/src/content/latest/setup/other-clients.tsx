import { Callout } from '../../../components/Callout';

export default function SetupOtherClientsContent() {
  return (
    <>
      <h1 id="other-clients">Other MCP Clients</h1>
      <p className="lead text-xl text-muted-foreground">
        Connect any MCP-compatible client to SENTINEL. This guide covers generic configuration that
        works with most clients.
      </p>

      <h2 id="overview">How It Works</h2>
      <p>
        SENTINEL provides an MCP server endpoint that any compatible client can connect to. Once
        connected, the client can access all tools available in your SENTINEL organization, subject
        to your permissions.
      </p>

      <h2 id="connection-details">Connection Details</h2>
      <p>Use these details to configure your MCP client:</p>

      <h3>Server URL</h3>
      <p>
        SENTINEL is self-hosted, so you'll use your own server's address. The MCP endpoint runs on
        port 3001 by default:
      </p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        http://your-sentinel-host:3001/mcp
      </pre>

      <h3>Authentication</h3>
      <p>
        SENTINEL uses Bearer token authentication. Include your API key in the Authorization header:
      </p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        Authorization: Bearer YOUR_API_KEY
      </pre>

      <h3>Getting Your API Key</h3>
      <ol>
        <li>Log in to SENTINEL</li>
        <li>
          Go to <strong>Credentials</strong>
        </li>
        <li>Copy your existing API key or contact your administrator</li>
      </ol>

      <Callout type="warning" title="Keep your API key secret">
        Your API key provides access to all tools you have permission to use. Never share it or
        commit it to version control.
      </Callout>

      <h2 id="json-config">Standard JSON Configuration</h2>
      <p>Most MCP clients use a JSON configuration format similar to this:</p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`{
  "mcpServers": {
    "sentinel": {
      "url": "http://your-sentinel-host:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
      </pre>

      <p>
        Replace <code>your-sentinel-host</code> with your actual SENTINEL server address. Consult
        your client's documentation for the exact configuration format and location.
      </p>

      <h2 id="transport">Transport Protocol</h2>
      <p>
        SENTINEL uses HTTP streaming transport for the MCP protocol. This provides efficient
        real-time communication over standard HTTP connections without requiring WebSocket support.
      </p>

      <h2 id="testing">Testing Your Connection</h2>
      <p>You can test that the SENTINEL server is running using the health endpoint:</p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`curl http://your-sentinel-host:3000/health`}
      </pre>

      <p>
        Replace <code>your-sentinel-host</code> with your actual SENTINEL server address. The health
        endpoint is on port 3000 (the API server), not port 3001 (the MCP proxy). A successful
        response indicates the server is running. To fully test MCP connectivity and list tools,
        connect your MCP client using the configuration above.
      </p>

      <h2 id="a2a-protocol">A2A Protocol (Agent-to-Agent)</h2>
      <p>
        SENTINEL also supports the A2A (Agent-to-Agent) protocol on port 3002 for agent-to-agent
        communication. This allows AI agents to communicate with each other through SENTINEL.
      </p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        http://your-sentinel-host:3002
      </pre>
      <p>
        Use the A2A protocol when you need agents to collaborate or delegate tasks to other agents
        in your organization.
      </p>

      <h2 id="protocol-version">Protocol Version</h2>
      <p>
        SENTINEL implements the MCP protocol specification. Check your SENTINEL version's release
        notes for specific protocol version compatibility information.
      </p>

      <h2 id="timeouts">Timeout Configuration</h2>
      <p>SENTINEL has the following timeout behaviors:</p>
      <ul>
        <li>
          <strong>Connection timeout</strong>: 30 seconds
        </li>
        <li>
          <strong>Tool execution timeout</strong>: Varies by tool (typically 60-300 seconds)
        </li>
        <li>
          <strong>Approval timeout</strong>: Configurable by your admin (default 5 minutes)
        </li>
      </ul>

      <p>
        Configure your client's timeouts accordingly. For tools that require approval, use longer
        timeouts to allow time for human review.
      </p>

      <h2 id="error-handling">Error Handling</h2>
      <p>SENTINEL returns standard MCP error responses:</p>
      <ul>
        <li>
          <strong>Authentication errors</strong>: Invalid or expired API key
        </li>
        <li>
          <strong>Authorization errors</strong>: You don't have access to the requested tool
        </li>
        <li>
          <strong>Approval required</strong>: The tool needs approval before execution
        </li>
        <li>
          <strong>Approval denied</strong>: An approval request was denied
        </li>
        <li>
          <strong>Approval timeout</strong>: An approval request expired
        </li>
      </ul>

      <p>Your client should handle these gracefully and inform the user of the issue.</p>

      <h2 id="rate-limits">Rate Limits</h2>
      <p>
        SENTINEL can be configured with rate limits to prevent abuse. Rate limit settings depend on
        your deployment configuration. Check with your SENTINEL administrator for specific limits.
      </p>

      <p>
        If rate limits are configured and you exceed them, you'll receive a 429 response. Implement
        exponential backoff in your client to handle this gracefully.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>401 Unauthorized</h3>
      <ul>
        <li>Check that your API key is correct</li>
        <li>Ensure the Authorization header format is exactly "Bearer YOUR_KEY"</li>
        <li>Regenerate your API key if it may have expired</li>
      </ul>

      <h3>403 Forbidden</h3>
      <ul>
        <li>You don't have access to the requested resource</li>
        <li>Check your permissions in the SENTINEL dashboard</li>
        <li>Contact your admin if you need access</li>
      </ul>

      <h3>Connection refused</h3>
      <ul>
        <li>Check your network connectivity</li>
        <li>Verify there's no firewall blocking the connection</li>
        <li>Ensure your SENTINEL server is running and accessible</li>
        <li>Confirm you're using the correct host and port (default: 3001)</li>
      </ul>

      <h2 id="support">Getting Help</h2>
      <p>If you're having trouble connecting your MCP client:</p>
      <ul>
        <li>Check your client's documentation for MCP configuration</li>
        <li>Verify your setup with the curl test above</li>
        <li>Contact your SENTINEL administrator for organization-specific help</li>
        <li>Reach out to SENTINEL support for technical issues</li>
      </ul>
    </>
  );
}
