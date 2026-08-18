import { Callout } from '../../../components/Callout';

export default function ReferenceTroubleshootingContent() {
  return (
    <>
      <h1 id="troubleshooting">Troubleshooting</h1>
      <p className="lead text-xl text-muted-foreground">
        Common issues and how to resolve them. If you don't find your issue here, contact your
        administrator or SENTINEL support.
      </p>

      <h2 id="connection-issues">Connection Issues</h2>

      <h3>Can't connect to SENTINEL from my AI client</h3>
      <ul>
        <li>
          <strong>Check your API key</strong> - Make sure it's correct and hasn't expired
        </li>
        <li>
          <strong>Verify the URL</strong> - Should be{' '}
          <code>http://your-sentinel-host:3001/mcp</code> (replace with your actual SENTINEL server
          address)
        </li>
        <li>
          <strong>Check network access</strong> - Ensure you can reach your SENTINEL server on port
          3001
        </li>
        <li>
          <strong>Firewall settings</strong> - Verify port 3001 is open and accessible from your
          client
        </li>
        <li>
          <strong>Restart your client</strong> - Sometimes a restart helps after config changes
        </li>
      </ul>

      <h3>Connection keeps dropping</h3>
      <ul>
        <li>
          <strong>Unstable network</strong> - Check your network connection to the SENTINEL server
        </li>
        <li>
          <strong>Timeout settings</strong> - Your client may need longer timeouts
        </li>
        <li>
          <strong>Server status</strong> - Check that your SENTINEL server is running (verify the
          Docker containers or process are up)
        </li>
        <li>
          <strong>Server logs</strong> - Check SENTINEL server logs for connection errors
        </li>
      </ul>

      <h2 id="access-issues">Access Issues</h2>

      <h3>Tool is blocked but I should have access</h3>
      <ol>
        <li>
          Check the <strong>Tools</strong> page in SENTINEL to see your actual access level
        </li>
        <li>Verify you're logged into the correct organization</li>
        <li>Check if your role has changed recently</li>
        <li>Ask your administrator if access rules have been updated</li>
        <li>
          You may need to <a href="/docs/users/requesting-access">request access</a>
        </li>
      </ol>

      <h3>Getting "approval required" unexpectedly</h3>
      <ul>
        <li>Your administrator may have marked this tool as sensitive</li>
        <li>
          Check the <strong>Tools</strong> page to see which tools need approval
        </li>
        <li>
          Approve the request in the <strong>Approvals</strong> page to continue
        </li>
      </ul>

      <h3>Approval request timed out</h3>
      <ul>
        <li>Approval requests expire after a configured timeout (default 5 minutes)</li>
        <li>Try the action again and approve more quickly</li>
        <li>Enable notifications so you don't miss approval requests</li>
        <li>Ask your admin if the timeout should be longer</li>
      </ul>

      <Callout type="tip" title="Keep the dashboard open">
        For faster approvals, keep the SENTINEL dashboard open in a browser tab while working with
        AI tools.
      </Callout>

      <h2 id="tool-issues">Tool Issues</h2>

      <h3>No tools appearing</h3>
      <ul>
        <li>
          <strong>Check tool servers</strong> - Admins: verify servers are connected
        </li>
        <li>
          <strong>Check permissions</strong> - You may not have access to any tools
        </li>
        <li>
          <strong>Wait a moment</strong> - Tools are discovered asynchronously after connection
        </li>
        <li>
          <strong>Refresh</strong> - Try refreshing the Tools page
        </li>
      </ul>

      <h3>Tool execution fails</h3>
      <ul>
        <li>
          <strong>Check tool server status</strong> - The server may be down
        </li>
        <li>
          <strong>Verify credentials</strong> - Some tools need credentials you haven't set up
        </li>
        <li>
          <strong>Check parameters</strong> - Invalid parameters cause failures
        </li>
        <li>
          <strong>View error details</strong> - Check the Activity page for error messages
        </li>
      </ul>

      <h3>Tools are slow</h3>
      <ul>
        <li>SENTINEL adds minimal latency for allowed tools (typically &lt;100ms)</li>
        <li>Approval-required tools wait for human response</li>
        <li>Slow tools may have slow backend servers</li>
        <li>Check your network connection</li>
      </ul>

      <h2 id="credential-issues">Credential Issues</h2>

      <h3>Credentials not working</h3>
      <ol>
        <li>Verify the credential is for the correct tool server</li>
        <li>Check that the API key/token hasn't expired</li>
        <li>Try removing and re-adding the credential</li>
        <li>Verify the credential has the necessary permissions in the source service</li>
      </ol>

      <h3>OAuth connection failed</h3>
      <ul>
        <li>
          Try reconnecting - click <strong>Reconnect</strong> on the credential
        </li>
        <li>Check that pop-ups aren't blocked in your browser</li>
        <li>The service may be having issues - try again later</li>
        <li>You may need to re-authorize with the service</li>
      </ul>

      <h2 id="admin-issues">Administrator Issues</h2>

      <h3>Tool server won't connect</h3>
      <ul>
        <li>
          <strong>Verify the URL/command</strong> - Check for typos
        </li>
        <li>
          <strong>Check server logs</strong> - Look for error messages
        </li>
        <li>
          <strong>Network access</strong> - Ensure SENTINEL can reach the server
        </li>
        <li>
          <strong>Authentication</strong> - Server may need credentials
        </li>
        <li>
          <strong>Port access</strong> - Firewall may be blocking the port
        </li>
      </ul>

      <h3>Access rules not working as expected</h3>
      <ol>
        <li>Check rule priority - higher priority rules are evaluated first</li>
        <li>Remember DENY rules always take precedence</li>
        <li>Verify the principals (users/roles) are correct</li>
        <li>Check the resource patterns match the intended tools</li>
        <li>
          Use the <strong>Test Rule</strong> feature to verify behavior
        </li>
      </ol>

      <h3>Webhooks not firing</h3>
      <ul>
        <li>Check the webhook is enabled</li>
        <li>Verify the URL is correct and accessible</li>
        <li>Check the delivery history for errors</li>
        <li>Test the webhook manually using the Test button</li>
        <li>Verify the events you want are selected</li>
      </ul>

      <h2 id="performance">Performance Issues</h2>

      <h3>Dashboard is slow</h3>
      <ul>
        <li>Try a different browser</li>
        <li>Clear browser cache</li>
        <li>Reduce date ranges when viewing activity logs</li>
        <li>Check your internet connection</li>
      </ul>

      <h3>Exports time out</h3>
      <ul>
        <li>Use smaller date ranges</li>
        <li>Apply filters to reduce the data size</li>
        <li>Try exporting in chunks</li>
      </ul>

      <h2 id="getting-help">Getting More Help</h2>

      <h3>For Users</h3>
      <ul>
        <li>Contact your SENTINEL administrator for organization-specific issues</li>
        <li>Check if the SENTINEL server is running and accessible</li>
        <li>Review the relevant documentation section</li>
      </ul>

      <h3>For Administrators</h3>
      <ul>
        <li>Check server and webhook logs for detailed error messages</li>
        <li>Review the activity log for patterns</li>
        <li>Contact SENTINEL support with specific error messages and timestamps</li>
      </ul>

      <Callout type="info" title="When contacting support">
        Include: your organization name, the specific error message, when the issue started, and
        steps to reproduce it.
      </Callout>
    </>
  );
}
