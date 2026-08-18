import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function UserCredentialsContent() {
  return (
    <>
      <h1 id="managing-credentials">Managing Credentials</h1>
      <p className="lead text-xl text-muted-foreground">
        Set up API keys, OAuth connections, and advanced JSON credentials so your AI assistant can
        access the tools you need.
      </p>

      <h2 id="overview">What Are Credentials?</h2>
      <p>
        Many MCP servers require authentication - an API key, access token, or OAuth connection.
        SENTINEL securely stores these credentials so your AI assistant can use them without
        exposing sensitive information.
      </p>

      <Callout type="info" title="Your credentials are private">
        Credentials you add are only used for your account. They're encrypted and stored securely.
        Administrators can see that you have credentials set up, but they cannot view the actual
        values.
      </Callout>

      <h2 id="page-structure">Credentials Page Structure</h2>
      <p>
        The Credentials page is organized into three cards, each handling a different type of
        authentication:
      </p>
      <ul>
        <li>
          <strong>API Key Servers</strong> - For MCP servers that use API key authentication
        </li>
        <li>
          <strong>OAuth Servers</strong> - For MCP servers that use OAuth authentication
        </li>
        <li>
          <strong>Advanced JSON Credentials</strong> - For custom key-value pairs, headers, and tool
          parameter injection
        </li>
      </ul>

      <p>
        Each card displays a table with all relevant MCP servers. The table columns show the server
        name, your credential status, organization credential status, last update time, and action
        buttons.
      </p>

      <h2 id="api-key-servers">API Key Servers</h2>
      <p>
        The API Key Servers card lists all MCP servers configured to use API key authentication.
        Each row shows:
      </p>
      <ul>
        <li>
          <strong>Server</strong> - The MCP server name
        </li>
        <li>
          <strong>User Key</strong> - Your credential status:
          <ul>
            <li>
              <strong>None</strong> - No credential configured
            </li>
            <li>
              <strong>Configured</strong> - Credential is set (actual values are never displayed for
              security)
            </li>
          </ul>
        </li>
        <li>
          <strong>Org Key</strong> - Organization credential status (same indicators as User Key)
        </li>
        <li>
          <strong>Updated</strong> - When the credential was last modified
        </li>
        <li>
          <strong>Actions</strong> - Buttons to add, update, or disconnect the credential
        </li>
      </ul>

      <h3 id="adding-api-key">Adding or Updating an API Key</h3>
      <Steps>
        <Step number={1} title="Find the server">
          <p>Locate the MCP server you want to configure in the API Key Servers table.</p>
        </Step>

        <Step number={2} title="Click Add Key or Update Key">
          <p>
            Click the <strong>Add Key</strong> button if you haven't set a key yet, or{' '}
            <strong>Update Key</strong> if you want to change an existing key.
          </p>
        </Step>

        <Step number={3} title="Enter the API key">
          <p>A dialog opens where you can paste your API key. The key is masked for security.</p>
        </Step>

        <Step number={4} title="Save">
          <p>
            Click <strong>Save API key</strong>. Your key is encrypted and stored. If tool discovery
            is enabled, you'll see feedback about how many tools were discovered.
          </p>
        </Step>
      </Steps>

      <h3 id="removing-api-key">Removing an API Key</h3>
      <p>To remove your personal API key from a server:</p>
      <ol>
        <li>Find the server in the API Key Servers table</li>
        <li>
          Click the <strong>Disconnect</strong> button (only visible if you have a key set)
        </li>
        <li>Confirm the disconnection in the dialog</li>
      </ol>

      <Callout type="info" title="Organization keys remain">
        Disconnecting only removes your personal API key. If an organization-level key is
        configured, it will still be used.
      </Callout>

      <h2 id="oauth-servers">OAuth Servers</h2>
      <p>
        The OAuth Servers card lists all MCP servers configured to use OAuth authentication. Each
        row shows:
      </p>
      <ul>
        <li>
          <strong>Server</strong> - The MCP server name
        </li>
        <li>
          <strong>Status</strong> - Your connection status:
          <ul>
            <li>"Connected" - You have an active OAuth connection</li>
            <li>"Using org" - You're using the organization's OAuth connection</li>
            <li>"Overriding org" - Your personal connection overrides the organization's</li>
            <li>"Not connected" - No OAuth connection exists</li>
          </ul>
        </li>
        <li>
          <strong>Updated</strong> - When the connection was last modified
        </li>
        <li>
          <strong>Actions</strong> - Buttons to check, refresh, connect, reconnect, or disconnect
        </li>
      </ul>

      <h3 id="connecting-oauth">Connecting with OAuth</h3>
      <Steps>
        <Step number={1} title="Find the server">
          <p>Locate the MCP server you want to connect in the OAuth Servers table.</p>
        </Step>

        <Step number={2} title="Click Connect">
          <p>
            Click the <strong>Connect</strong> button for that server. A new browser tab opens with
            the OAuth provider's authorization page.
          </p>
        </Step>

        <Step number={3} title="Authorize">
          <p>
            Log in to the service (if needed) and grant the requested permissions. After
            authorizing, the tab closes automatically.
          </p>
        </Step>

        <Step number={4} title="Confirm">
          <p>
            The Credentials page refreshes automatically. Your connection status changes to
            "Connected".
          </p>
        </Step>
      </Steps>

      <h3 id="oauth-actions">OAuth Connection Actions</h3>
      <p>For connected OAuth servers, you have several action buttons:</p>
      <ul>
        <li>
          <strong>Check</strong> - Verify the connection is still valid and see when the token
          expires
        </li>
        <li>
          <strong>Refresh</strong> - Manually refresh the OAuth token without re-authorizing
        </li>
        <li>
          <strong>Reconnect</strong> - Start a new OAuth flow to replace the existing connection
        </li>
        <li>
          <strong>Disconnect</strong> - Remove your personal OAuth connection
        </li>
      </ul>

      <Callout type="tip" title="Automatic token refresh">
        OAuth tokens are automatically refreshed when they expire, so you typically don't need to
        manually refresh or reconnect.
      </Callout>

      <h2 id="advanced-json-credentials">Advanced JSON Credentials</h2>
      <p>
        The Advanced JSON Credentials card allows you to store custom key-value pairs for any MCP
        server. This is useful for servers that require multiple credentials, custom headers, or
        specialized authentication schemes.
      </p>

      <p>Each row in the table shows:</p>
      <ul>
        <li>
          <strong>Server</strong> - The MCP server name
        </li>
        <li>
          <strong>User JSON</strong> - "Configured" if you have JSON credentials set, otherwise
          "None"
        </li>
        <li>
          <strong>Org JSON</strong> - "Configured" if organization JSON credentials exist, otherwise
          "None"
        </li>
        <li>
          <strong>Updated</strong> - When the credentials were last modified
        </li>
        <li>
          <strong>Actions</strong> - Buttons to add, update, or disconnect
        </li>
      </ul>

      <h3 id="adding-json-credentials">Adding or Updating JSON Credentials</h3>
      <Steps>
        <Step number={1} title="Find the server">
          <p>Locate the MCP server you want to configure in the Advanced JSON Credentials table.</p>
        </Step>

        <Step number={2} title="Click Add JSON or Update JSON">
          <p>
            Click the <strong>Add JSON</strong> button if you haven't set credentials yet, or{' '}
            <strong>Update JSON</strong> to modify existing credentials.
          </p>
        </Step>

        <Step number={3} title="Configure credential fields">
          <p>
            In the dialog, add key-value pairs for your credentials. Click{' '}
            <strong>Add credential field</strong> to add each pair. Enter the key name and its
            value.
          </p>
        </Step>

        <Step number={4} title="Configure tool parameter injection (optional)">
          <p>
            Toggle <strong>Tool parameter injection</strong> if you want credential fields merged
            into every tool call. Disable this if your MCP server uses strict schemas that don't
            accept extra parameters.
          </p>
        </Step>

        <Step number={5} title="Add custom headers (optional)">
          <p>
            Scroll down to the Custom Headers section if your server requires HTTP headers. Click{' '}
            <strong>Add header</strong> to add header name-value pairs.
          </p>
        </Step>

        <Step number={6} title="Save">
          <p>
            Click <strong>Save credentials</strong>. If your keys overlap with organization
            credentials, you'll be prompted to confirm the override.
          </p>
        </Step>
      </Steps>

      <h3 id="json-credential-features">JSON Credential Features</h3>
      <p>The Advanced JSON Credentials editor provides three sections:</p>

      <h4>Credential Fields</h4>
      <p>
        Key-value pairs that are passed to the MCP server. These can include API keys, tokens,
        usernames, or any other authentication data the server requires.
      </p>

      <h4>Tool Parameter Injection</h4>
      <p>
        When enabled, credential fields are automatically merged into every tool call made to the
        server. This is useful for servers that expect credentials as part of tool parameters rather
        than headers.
      </p>

      <h4>Custom Headers</h4>
      <p>
        HTTP headers sent with every MCP request. Useful for servers requiring Bearer tokens, API
        keys in headers, or custom authentication headers.
      </p>

      <h3 id="clearing-json-credentials">Clearing JSON Credentials</h3>
      <p>To remove all JSON credentials for a server:</p>
      <ol>
        <li>Open the credentials editor for the server</li>
        <li>
          Click the <strong>Clear JSON</strong> button
        </li>
        <li>The credentials are removed immediately</li>
      </ol>

      <h3 id="override-conflicts">Handling Override Conflicts</h3>
      <p>
        If you add credential fields that have the same keys as organization-level credentials, a
        confirmation dialog appears. You can:
      </p>
      <ul>
        <li>
          <strong>Cancel</strong> - Go back and change your keys to avoid conflicts
        </li>
        <li>
          <strong>Yes, override</strong> - Confirm that your values should take precedence over the
          organization defaults
        </li>
      </ul>

      <Callout type="info" title="Credential merging">
        Your personal JSON credentials are merged with organization credentials. Your values take
        precedence when there are conflicts.
      </Callout>

      <h2 id="user-vs-org-credentials">User vs. Organization Credentials</h2>
      <p>
        SENTINEL supports both personal (user-level) and organization-level credentials. Here's how
        they interact:
      </p>
      <ul>
        <li>
          <strong>API Keys</strong> - Your personal key takes precedence over the organization key
          when both exist
        </li>
        <li>
          <strong>OAuth</strong> - Your personal connection overrides the organization connection
        </li>
        <li>
          <strong>JSON Credentials</strong> - Personal and organization credentials are merged, with
          your values taking precedence for conflicting keys
        </li>
      </ul>

      <p>
        The credential tables show both "User" and "Org" columns so you can see what credentials
        exist at each level.
      </p>

      <h2 id="troubleshooting">Common Issues</h2>

      <h3>Credential not working</h3>
      <ul>
        <li>Check that the API key or token is still valid in the source service</li>
        <li>Verify the key has the necessary permissions</li>
        <li>For JSON credentials, ensure the key names match what the MCP server expects</li>
      </ul>

      <h3>OAuth connection expired</h3>
      <ul>
        <li>
          Click <strong>Check</strong> to verify the connection status
        </li>
        <li>
          Click <strong>Refresh</strong> to manually refresh the token
        </li>
        <li>
          If refresh fails, click <strong>Reconnect</strong> to start a new OAuth flow
        </li>
      </ul>

      <h3>Tool discovery feedback</h3>
      <p>
        After saving credentials, you may see a feedback alert indicating how many tools were
        discovered from the server. This confirms the credentials are working correctly.
      </p>

      <Callout type="warning" title="Tools may stop working">
        If you disconnect credentials that tools depend on, those tools will fail until you add new
        credentials or an organization-level credential is available.
      </Callout>
    </>
  );
}
