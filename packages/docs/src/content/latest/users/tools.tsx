import { Callout } from '../../../components/Callout';

export default function UserToolsContent() {
  return (
    <>
      <h1 id="viewing-your-tools">Viewing Your Tools</h1>
      <p className="lead text-xl text-muted-foreground">
        See which tools your AI assistant can use and understand your access level for each one.
      </p>

      <h2 id="tools-page">The Tools Page</h2>
      <p>
        Click <strong>Tools</strong> in the sidebar to see all available tools. Tools are organized
        by the server that provides them.
      </p>

      <h2 id="stats-overview">Stats Overview</h2>
      <p>At the top of the Tools page, you'll see three summary cards:</p>
      <ul>
        <li>
          <strong>Total Tools</strong> - The total number of tools available across all servers
        </li>
        <li>
          <strong>Allowed</strong> - Number of tools you have access to use
        </li>
        <li>
          <strong>Denied</strong> - Number of tools you cannot currently access
        </li>
      </ul>

      <h2 id="access-levels">Understanding Access Levels</h2>
      <p>Each tool shows one of these access levels:</p>

      <h3>ALLOWED</h3>
      <p>
        Tools marked <strong>ALLOWED</strong> (green) can be used by your AI assistant. When your AI
        needs to use this tool, it will work according to the configured policies.
      </p>

      <h3>DENIED</h3>
      <p>
        Tools marked <strong>DENIED</strong> (red) cannot be used by your account. If you need
        access, you can request it from your administrator.
      </p>

      <Callout type="info" title="Sensitive tools">
        Some tools may be marked as sensitive. Sensitive tools require approval for each use, even
        when your access level is ALLOWED. When your AI tries to use a sensitive tool, you'll need
        to approve the request before it can proceed.
      </Callout>

      <Callout type="info" title="Why are some tools denied?">
        Administrators set access rules to control which tools different users can access. This is
        usually based on your role, the sensitivity of the tool, or organizational policies.
      </Callout>

      <h2 id="tool-details">Tool Information</h2>
      <p>Each tool in the list displays:</p>

      <ul>
        <li>
          <strong>Tool Name</strong> - The name of the tool
        </li>
        <li>
          <strong>Description</strong> - What the tool does
        </li>
        <li>
          <strong>Server</strong> - Which server provides this tool
        </li>
        <li>
          <strong>Access Level</strong> - Your current access (ALLOWED or DENIED)
        </li>
      </ul>

      <h2 id="filtering-tools">Finding Tools</h2>
      <p>With many tools available, here are ways to find what you need:</p>

      <h3>Search</h3>
      <p>
        Use the search box at the top to find tools by name or description. Type any keyword and the
        list will filter in real-time.
      </p>

      <h3>Filter by Server</h3>
      <p>Use the server dropdown to filter and show only tools from a specific server.</p>

      <h3>Filter by Access</h3>
      <p>Use the access filter dropdown to show:</p>
      <ul>
        <li>
          <strong>ALL</strong> - All tools
        </li>
        <li>
          <strong>ALLOWED</strong> - Tools you can use
        </li>
        <li>
          <strong>DENIED</strong> - Tools you cannot access
        </li>
      </ul>

      <h2 id="tool-servers">Understanding Tool Servers</h2>
      <p>
        Tools come from "servers" - these are the sources that provide tool functionality. Common
        examples include:
      </p>

      <ul>
        <li>
          <strong>File System</strong> - Read and write files on your computer
        </li>
        <li>
          <strong>GitHub</strong> - Interact with GitHub repositories
        </li>
        <li>
          <strong>Database</strong> - Query and modify databases
        </li>
        <li>
          <strong>Slack</strong> - Send messages and read channels
        </li>
      </ul>

      <p>
        Your administrator sets up which servers are available and configures access rules for each.
      </p>

      <h2 id="requesting-access">Need Access to a Tool?</h2>
      <p>
        If you see a tool marked as DENIED that you need for your work, you can request access. See{' '}
        <a href="/docs/users/requesting-access">Requesting Access</a> for details.
      </p>

      <h3 id="request-access-vs-removal">Request Access vs Request Removal</h3>
      <p>Depending on why a tool is denied, you'll see different request buttons:</p>
      <ul>
        <li>
          <strong>Request Access</strong> - Shown when a tool is denied because you don't have an
          ALLOW policy. Submitting this request asks an administrator to grant you access.
        </li>
        <li>
          <strong>Request Removal</strong> - Shown when a tool is explicitly blocked by a DENY
          policy. Submitting this request asks an administrator to remove or modify the blocking
          DENY policy. This is a different type of request because DENY policies take precedence
          over ALLOW policies.
        </li>
      </ul>

      <h2 id="bulk-access-requests">Bulk Access Requests</h2>
      <p>
        If multiple tools on a server are denied, you can request access to all of them at once:
      </p>
      <ol>
        <li>Find the server card with denied tools</li>
        <li>
          Click the <strong>Request All</strong> button on the server header
        </li>
        <li>This creates a single request for all denied tools on that server</li>
        <li>Provide your reason (applies to all tools in the request)</li>
      </ol>

      <Callout type="tip" title="Talk to your admin">
        If you're not sure why a tool is denied or need access quickly, reach out to your SENTINEL
        administrator directly.
      </Callout>
    </>
  );
}
