import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function SetupClaudeCodeContent() {
  return (
    <>
      <h1 id="claude-code-setup">Claude Code Setup</h1>
      <p className="lead text-xl text-muted-foreground">
        Connect Claude Code (CLI) or Claude Desktop to SENTINEL to manage tool access.
      </p>

      <h2 id="overview">What You'll Do</h2>
      <p>
        Claude Code and Claude Desktop use the Model Context Protocol (MCP) to connect to tool
        servers. You'll configure them to connect through SENTINEL, which then manages access to
        your actual tools.
      </p>

      <h2 id="prerequisites">Before You Start</h2>
      <ul>
        <li>A SENTINEL account with your organization</li>
        <li>Your SENTINEL API key (get it from Settings in the dashboard)</li>
        <li>Claude Code CLI or Claude Desktop installed</li>
      </ul>

      <h2 id="claude-code-cli">Setting Up Claude Code (CLI)</h2>

      <Steps>
        <Step number={1} title="Get your SENTINEL API key">
          <p>
            Log in to your SENTINEL dashboard, go to <strong>Credentials</strong>, and copy your API
            key.
          </p>
        </Step>

        <Step number={2} title="Open Claude Code settings">
          <p>
            Run <code>claude config</code> or edit your Claude Code configuration file directly.
          </p>
        </Step>

        <Step number={3} title="Add SENTINEL as an MCP server">
          <p>Add SENTINEL to your MCP servers configuration:</p>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
            {`{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
          </pre>
        </Step>

        <Step number={4} title="Restart Claude Code">
          <p>Restart Claude Code for the changes to take effect.</p>
        </Step>

        <Step number={5} title="Verify the connection">
          <p>
            Ask Claude to list available tools. You should see tools from the servers configured in
            your SENTINEL organization.
          </p>
        </Step>
      </Steps>

      <Callout type="tip" title="Environment variables">
        Instead of putting your API key in the config file, you can use an environment variable:
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm mt-2">
          {`"Authorization": "Bearer $SENTINEL_API_KEY"`}
        </pre>
      </Callout>

      <h2 id="claude-desktop">Setting Up Claude Desktop</h2>

      <Steps>
        <Step number={1} title="Get your SENTINEL API key">
          <p>
            Log in to SENTINEL, go to <strong>Credentials</strong>, and copy your API key.
          </p>
        </Step>

        <Step number={2} title="Open Claude Desktop settings">
          <p>
            Open Claude Desktop and go to <strong>Settings</strong> &gt;{' '}
            <strong>MCP Servers</strong>.
          </p>
        </Step>

        <Step number={3} title="Add SENTINEL">
          <p>
            Click <strong>Add Server</strong> and enter:
          </p>
          <ul>
            <li>
              <strong>Name</strong>: SENTINEL
            </li>
            <li>
              <strong>URL</strong>: http://localhost:3001/mcp
            </li>
            <li>
              <strong>API Key</strong>: Your SENTINEL API key
            </li>
          </ul>
        </Step>

        <Step number={4} title="Save and verify">
          <p>
            Click <strong>Save</strong>. Claude Desktop will connect to SENTINEL. You should see a
            green status indicator when connected.
          </p>
        </Step>
      </Steps>

      <h2 id="multiple-servers">Working with Multiple Tool Servers</h2>
      <p>
        When you connect through SENTINEL, you get access to all tool servers configured in your
        organization. You don't need to configure each server separately in Claude - SENTINEL
        handles that.
      </p>

      <p>
        If your admin adds a new tool server to SENTINEL, it becomes available to you automatically.
      </p>

      <h2 id="approvals">Handling Approvals</h2>
      <p>When Claude tries to use a tool that requires approval:</p>
      <ol>
        <li>The request pauses while waiting for approval</li>
        <li>You'll see a notification in SENTINEL (and your configured channels)</li>
        <li>Go to SENTINEL and approve or deny the request</li>
        <li>Claude continues once you respond</li>
      </ol>

      <Callout type="info" title="Keep SENTINEL open">
        For the best experience with approvals, keep the SENTINEL dashboard open in a browser tab
        while working with Claude.
      </Callout>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>Claude can't connect to SENTINEL</h3>
      <ul>
        <li>Check that your API key is correct</li>
        <li>
          Verify the MCP URL points to your SENTINEL instance on the MCP port (default:{' '}
          <code>http://localhost:3001/mcp</code>)
        </li>
        <li>Ensure the SENTINEL server is running and the MCP proxy is listening on port 3001</li>
        <li>Check if there's a firewall blocking the connection</li>
      </ul>

      <h3>No tools appear</h3>
      <ul>
        <li>Verify you're logged into the correct SENTINEL organization</li>
        <li>Check that your admin has configured tool servers</li>
        <li>Make sure you have access to at least one tool (check the Tools page)</li>
      </ul>

      <h3>Tools fail with access denied</h3>
      <ul>
        <li>Check the Tools page to see your access level</li>
        <li>You may need to request access from your admin</li>
        <li>The tool may require approval - check for pending approvals</li>
      </ul>

      <h2 id="next-steps">Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/users/credentials">Set up your credentials</a> for tools that need them
        </li>
        <li>
          <a href="/docs/users/tools">Browse available tools</a> to see what you can use
        </li>
        <li>
          <a href="/docs/users/approvals">Learn about approvals</a> for sensitive tools
        </li>
      </ul>
    </>
  );
}
