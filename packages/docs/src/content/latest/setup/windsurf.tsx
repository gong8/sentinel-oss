import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function SetupWindsurfContent() {
  return (
    <>
      <h1 id="windsurf-setup">Windsurf Setup</h1>
      <p className="lead text-xl text-muted-foreground">
        Connect Windsurf IDE to SENTINEL to manage AI tool access in your development workflow.
      </p>

      <h2 id="overview">What You'll Do</h2>
      <p>
        Windsurf supports MCP (Model Context Protocol) servers for tool access. You'll configure
        Windsurf to connect through SENTINEL, which then manages access to your actual tools.
      </p>

      <h2 id="prerequisites">Before You Start</h2>
      <ul>
        <li>A SENTINEL account with your organization</li>
        <li>Your SENTINEL API key (get it from Settings in the dashboard)</li>
        <li>Windsurf IDE installed</li>
      </ul>

      <h2 id="setup-steps">Setup Steps</h2>

      <Steps>
        <Step number={1} title="Get your SENTINEL API key">
          <p>
            Log in to SENTINEL, go to <strong>Credentials</strong>, and copy your API key.
          </p>
        </Step>

        <Step number={2} title="Open Windsurf settings">
          <p>
            In Windsurf, go to <strong>Settings</strong> &gt; <strong>AI Configuration</strong> &gt;{' '}
            <strong>MCP Servers</strong>.
          </p>
        </Step>

        <Step number={3} title="Add SENTINEL server">
          <p>
            Click <strong>Add MCP Server</strong> and enter:
          </p>
          <ul>
            <li>
              <strong>Name</strong>: SENTINEL
            </li>
            <li>
              <strong>Server URL</strong>: http://localhost:3001/mcp
            </li>
            <li>
              <strong>API Key</strong>: Your SENTINEL API key
            </li>
          </ul>
        </Step>

        <Step number={4} title="Save and restart">
          <p>
            Click <strong>Save</strong> and restart Windsurf for the changes to take effect.
          </p>
        </Step>

        <Step number={5} title="Verify connection">
          <p>
            After restarting, check the MCP status indicator in Windsurf. It should show SENTINEL as
            connected. You can also ask the AI to list available tools.
          </p>
        </Step>
      </Steps>

      <Callout type="tip" title="Multiple workspaces">
        Windsurf settings can be workspace-specific. If you work on multiple projects, you may need
        to configure SENTINEL in each workspace.
      </Callout>

      <h2 id="config-file">JSON Configuration</h2>
      <p>
        You can also configure SENTINEL by editing your Windsurf configuration file. Locate your
        settings file and add:
      </p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`{
  "ai": {
    "mcpServers": [
      {
        "name": "SENTINEL",
        "url": "http://localhost:3001/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    ]
  }
}`}
      </pre>

      <h2 id="using-tools">Using Tools</h2>
      <p>
        Once connected, Windsurf's AI can use any tools you have access to through SENTINEL. The AI
        will automatically use appropriate tools when needed, or you can ask it directly:
      </p>
      <ul>
        <li>"Read the database schema"</li>
        <li>"Create a new component file"</li>
        <li>"Run the test suite"</li>
      </ul>

      <h2 id="approvals">Handling Approvals</h2>
      <p>When a tool requires approval:</p>
      <ol>
        <li>Windsurf will show a message that it's waiting for approval</li>
        <li>Open the SENTINEL dashboard and go to Approvals</li>
        <li>Review the request details and approve or deny</li>
        <li>Windsurf's AI will continue automatically after your decision</li>
      </ol>

      <Callout type="info" title="Desktop notifications">
        Enable browser notifications in SENTINEL to get alerted when approvals are needed, even when
        you're focused on Windsurf.
      </Callout>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>SENTINEL shows as disconnected</h3>
      <ul>
        <li>Verify your API key is correct</li>
        <li>Check that the SENTINEL server is running on localhost:3001</li>
        <li>Try removing and re-adding the server configuration</li>
        <li>Restart Windsurf completely</li>
      </ul>

      <h3>Tools aren't available</h3>
      <ul>
        <li>Check your SENTINEL dashboard to see which tools you have access to</li>
        <li>Your admin may need to grant you access to certain tools</li>
        <li>Verify that tool servers are connected in SENTINEL</li>
      </ul>

      <h3>Slow tool responses</h3>
      <ul>
        <li>Some latency is normal as requests go through SENTINEL</li>
        <li>Tools requiring approval will wait for human response</li>
        <li>Check SENTINEL server status for any issues</li>
      </ul>

      <h2 id="next-steps">Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/users/credentials">Set up your credentials</a> for tools that need them
        </li>
        <li>
          <a href="/docs/users/tools">Browse available tools</a> in SENTINEL
        </li>
        <li>
          <a href="/docs/users/approvals">Learn about the approval process</a>
        </li>
      </ul>
    </>
  );
}
