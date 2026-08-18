import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function SetupCursorContent() {
  return (
    <>
      <h1 id="cursor-setup">Cursor Setup</h1>
      <p className="lead text-xl text-muted-foreground">
        Connect Cursor IDE to SENTINEL to manage AI tool access in your development workflow.
      </p>

      <h2 id="overview">What You'll Do</h2>
      <p>
        Cursor supports MCP (Model Context Protocol) servers for tool access. You'll configure
        Cursor to connect through SENTINEL, which then manages access to your actual tools.
      </p>

      <h2 id="prerequisites">Before You Start</h2>
      <ul>
        <li>A SENTINEL account with your organization</li>
        <li>Your SENTINEL API key (get it from Settings in the dashboard)</li>
        <li>Cursor IDE installed</li>
      </ul>

      <h2 id="setup-steps">Setup Steps</h2>

      <Steps>
        <Step number={1} title="Get your SENTINEL API key">
          <p>
            Log in to SENTINEL, go to <strong>Credentials</strong>, and copy your API key.
          </p>
        </Step>

        <Step number={2} title="Open Cursor settings">
          <p>
            In Cursor, open the Command Palette (Cmd/Ctrl + Shift + P) and search for "MCP" or
            "Model Context Protocol".
          </p>
        </Step>

        <Step number={3} title="Add SENTINEL server">
          <p>Add SENTINEL as an MCP server with these settings:</p>
          <ul>
            <li>
              <strong>Name</strong>: SENTINEL
            </li>
            <li>
              <strong>URL</strong>: http://localhost:3001/mcp (or your deployed URL)
            </li>
            <li>
              <strong>Authentication</strong>: Bearer token with your API key
            </li>
          </ul>
        </Step>

        <Step number={4} title="Save and verify">
          <p>
            Save your settings. Cursor should show a connection status indicator. You can verify by
            asking the AI to list available tools.
          </p>
        </Step>
      </Steps>

      <h2 id="config-file">Configuration File Method</h2>
      <p>
        Alternatively, you can configure SENTINEL by editing your Cursor settings file directly. The
        location varies by operating system:
      </p>
      <ul>
        <li>
          <strong>macOS</strong>:{' '}
          <code>~/Library/Application Support/Cursor/User/settings.json</code>
        </li>
        <li>
          <strong>Linux</strong>: <code>~/.config/Cursor/User/settings.json</code>
        </li>
        <li>
          <strong>Windows</strong>: <code>%APPDATA%\Cursor\User\settings.json</code>
        </li>
      </ul>

      <p>Add the MCP server configuration:</p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`{
  "mcp.servers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
      </pre>

      <Callout type="tip" title="Use environment variables">
        For security, consider using an environment variable for your API key instead of hardcoding
        it in the config file.
      </Callout>

      <h2 id="using-tools">Using Tools</h2>
      <p>
        Once connected, you can ask Cursor's AI to use any tools you have access to through
        SENTINEL. For example:
      </p>
      <ul>
        <li>"Read the contents of package.json"</li>
        <li>"Create a new file called helpers.ts"</li>
        <li>"Search for all files containing 'TODO'"</li>
      </ul>

      <p>
        SENTINEL will check your permissions and either allow the action, require approval, or deny
        it based on your organization's rules.
      </p>

      <h2 id="approvals">Handling Approvals</h2>
      <p>If a tool requires approval:</p>
      <ol>
        <li>The AI will pause and indicate it's waiting for approval</li>
        <li>Open SENTINEL in your browser and go to Approvals</li>
        <li>Review and approve or deny the request</li>
        <li>The AI will continue once you respond</li>
      </ol>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>Connection issues</h3>
      <ul>
        <li>Verify your API key is correct and hasn't expired</li>
        <li>Check that your SENTINEL server is running on port 3001</li>
        <li>Restart Cursor after making configuration changes</li>
      </ul>

      <h3>Tools not working</h3>
      <ul>
        <li>Check your access level in the SENTINEL dashboard</li>
        <li>Look for pending approvals if the tool requires them</li>
        <li>Verify the tool server is connected in SENTINEL</li>
      </ul>

      <h3>Performance issues</h3>
      <ul>
        <li>SENTINEL adds minimal latency for allowed tools</li>
        <li>Approvals require human interaction and will pause execution</li>
        <li>Check your network connection if tools are slow</li>
      </ul>

      <h2 id="next-steps">Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/users/credentials">Set up credentials</a> for tools that need
          authentication
        </li>
        <li>
          <a href="/docs/users/tools">View your available tools</a>
        </li>
        <li>
          <a href="/docs/users/approvals">Learn about handling approvals</a>
        </li>
      </ul>
    </>
  );
}
