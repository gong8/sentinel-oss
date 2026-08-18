export default function McpProxyDocs() {
  return (
    <>
      <h1 id="mcp-proxy">MCP Proxy Architecture</h1>
      <p className="lead text-xl text-muted-foreground">
        The MCP Proxy is the gateway that enforces SENTINEL's policies. It sits between the AI
        Client (like Claude or Cursor) and the actual tools.
      </p>

      <h2 id="the-interception-model">The Interception Model</h2>
      <p>
        The Model Context Protocol (MCP) works by clients discovering tools from servers. SENTINEL
        acts as a "Man-in-the-Middle" MCP server.
      </p>

      <ol className="space-y-4 my-6 list-decimal list-inside">
        <li className="pl-2">
          <strong>Discovery Phase:</strong> The AI Client connects to SENTINEL. SENTINEL queries all
          upstream tool servers (GitHub, Postgres, etc.) that the user has access to and presents a
          unified list of tools to the Client.
        </li>
        <li className="pl-2">
          <strong>Call Phase:</strong> When the AI wants to call <code>github_create_issue</code>,
          it sends the request to SENTINEL.
        </li>
        <li className="pl-2">
          <strong>Evaluation Phase:</strong> SENTINEL pauses the request. It extracts the arguments
          and context, then queries the <strong>Policy Engine</strong>.
        </li>
        <li className="pl-2">
          <strong>Execution Phase:</strong>
          <ul className="ml-6 list-disc mt-2">
            <li>
              If <strong>DENIED</strong>: SENTINEL returns a standard MCP error to the AI,
              explaining why.
            </li>
            <li>
              If <strong>ALLOWED</strong>: SENTINEL forwards the request to the real GitHub MCP
              server, waits for the response, logs the result, and returns it to the AI.
            </li>
          </ul>
        </li>
      </ol>

      <h2 id="connection-handling">Connection Handling</h2>
      <p>
        The Proxy connects to upstream MCP servers using HTTP streaming transport (Server-Sent
        Events). Each session maintains a persistent connection to upstream servers. Connections are
        session-scoped and managed via connection registries for efficiency. It handles:
      </p>
      <ul>
        <li>
          <strong>Error Masking:</strong> Hiding internal infrastructure errors from the AI client
          to prevent confusion.
        </li>
        <li>
          <strong>Timeout Management:</strong> Enforcing execution time limits to prevent stalled
          agents.
        </li>
        <li>
          <strong>Session Termination:</strong> Administrators can terminate active sessions through
          the Admin UI. When a session is terminated, the proxy gracefully closes connections to
          both the AI client and upstream servers, and logs the termination event.
        </li>
        <li>
          <strong>OAuth Token Refresh:</strong> For upstream servers requiring OAuth authentication,
          the proxy automatically handles token refresh. When an access token expires, it uses the
          stored refresh token to obtain a new access token without interrupting the session.
        </li>
      </ul>
    </>
  );
}
