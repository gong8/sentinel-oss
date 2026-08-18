export default function UserMcpServersContent() {
  return (
    <>
      <h1 id="your-mcp-servers">Your MCP Servers</h1>
      <p className="lead text-xl text-muted-foreground">
        View the MCP servers available to you and their connection status.
      </p>

      <h2 id="overview">Overview</h2>
      <p>
        The MCP Servers page shows all Model Context Protocol servers that are available to you
        within your organization. This page helps you understand what tools are accessible and which
        servers may need credential configuration.
      </p>

      <h2 id="server-list">Server List</h2>
      <p>Each server entry in the table displays:</p>
      <ul>
        <li>
          <strong>Server Name</strong> - The identifier for the MCP server
        </li>
        <li>
          <strong>URL</strong> - The server endpoint URL
        </li>
        <li>
          <strong>Auth</strong> - The authentication type required (API Key, OAuth, etc.)
        </li>
        <li>
          <strong>Trusted</strong> - Whether the server is marked as trusted by administrators
        </li>
        <li>
          <strong>Tool Count</strong> - Number of tools available on this server
        </li>
        <li>
          <strong>Credential Status</strong> - Whether credentials are configured (if required)
        </li>
      </ul>

      <h2 id="filtering-servers">Filtering Servers</h2>
      <p>Use the filter controls at the top to narrow down the server list:</p>
      <ul>
        <li>
          <strong>Search</strong> - Filter servers by name
        </li>
        <li>
          <strong>Auth Type</strong> - Show only servers with a specific authentication type
        </li>
        <li>
          <strong>Credential Status</strong> - Filter by whether credentials are configured
        </li>
      </ul>

      <h2 id="managing-servers">Managing Server Credentials</h2>
      <p>
        Click the <strong>Manage</strong> button on any server row to navigate to the credentials
        page where you can configure your authentication for that server.
      </p>

      <h2 id="credential-status">Credential Status Indicators</h2>
      <p>Servers that require authentication show credential status:</p>
      <ul>
        <li>
          <strong>Connected</strong> - Your credentials are set up and ready
        </li>
        <li>
          <strong>Needs credentials</strong> - Server needs credentials but none are configured
        </li>
        <li>
          <strong>No auth required</strong> - Server does not require authentication
        </li>
      </ul>

      <h2 id="setting-up-credentials">Setting Up Credentials</h2>
      <p>
        If a server shows &quot;Needs credentials&quot; status, navigate to the{' '}
        <a href="/user/credentials">Credentials</a> page to configure your authentication, or click
        the <strong>Manage</strong> button on the server row.
      </p>
    </>
  );
}
