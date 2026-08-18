import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function UserLlmConfigContent() {
  return (
    <>
      <h1 id="llm-configuration">LLM Configuration</h1>
      <p className="lead text-xl text-muted-foreground">
        Configure your preferred AI model and API keys to power the Sentinel Agent in your
        workspace.
      </p>

      <h2 id="overview">What is LLM Configuration?</h2>
      <p>
        To use the Sentinel Agent chatbot, you need to configure which Large Language Model (LLM)
        provider to use and provide your API key. This configuration is personal to you and specific
        to each workspace you belong to.
      </p>

      <Callout type="info" title="Your API key is private">
        Your API key is encrypted before being stored. Only you can use it, and administrators
        cannot view the actual key value.
      </Callout>

      <h2 id="supported-providers">Supported Providers</h2>
      <p>SENTINEL supports the following LLM providers:</p>

      <ul>
        <li>
          <strong>Claude (Anthropic)</strong> - Anthropic's Claude models, known for being helpful
          and safe
        </li>
        <li>
          <strong>OpenAI</strong> - GPT models from OpenAI
        </li>
        <li>
          <strong>Gemini (Google)</strong> - Google's Gemini AI models
        </li>
      </ul>

      <p>
        Each provider offers different models with varying capabilities and pricing. Check your
        provider's documentation for model details.
      </p>

      <h2 id="setting-up">Setting Up Your LLM</h2>
      <Steps>
        <Step number={1} title="Navigate to Sentinel Agent">
          <p>
            Go to the Sentinel Agent page by clicking <strong>Agent</strong> in the sidebar, or look
            for the settings button in the Agent interface.
          </p>
        </Step>

        <Step number={2} title="Open LLM Settings">
          <p>
            Click the <strong>Settings</strong> button (gear icon) in the Agent panel to open the
            LLM configuration dialog.
          </p>
        </Step>

        <Step number={3} title="Select your provider">
          <p>
            Choose your preferred LLM provider from the dropdown. Each provider shows its available
            models.
          </p>
        </Step>

        <Step number={4} title="Enter your API key">
          <p>
            Paste your API key from your provider's dashboard. The key format varies by provider:
          </p>
          <ul>
            <li>
              <strong>Anthropic (Claude)</strong> - Keys start with <code>sk-ant-</code>
            </li>
            <li>
              <strong>OpenAI</strong> - Keys start with <code>sk-</code>
            </li>
            <li>
              <strong>Google (Gemini)</strong> - Alphanumeric API key
            </li>
          </ul>
        </Step>

        <Step number={5} title="Select a model (optional)">
          <p>
            Optionally choose a specific model from the provider. If not selected, the default model
            for that provider will be used.
          </p>
        </Step>

        <Step number={6} title="Save">
          <p>
            Click <strong>Save</strong> to store your configuration. Your API key is encrypted
            before being saved.
          </p>
        </Step>
      </Steps>

      <h2 id="always-allow-tools">Always-Allow Tools</h2>
      <p>
        By default, the Sentinel Agent asks for your confirmation before using certain tools. You
        can configure specific tools to be "always allowed" so they run without prompting.
      </p>

      <h3>What are Always-Allow Tools?</h3>
      <p>
        When you mark a tool as "always allowed," the Agent will use it automatically without asking
        for permission. This speeds up your workflow for tools you trust and use frequently.
      </p>

      <Callout type="warning" title="Use with caution">
        Only add tools to the always-allow list if you're comfortable with them running without your
        explicit approval each time. Sensitive or destructive tools should typically require
        confirmation.
      </Callout>

      <h3>Managing Always-Allow Tools</h3>
      <p>You can manage your always-allow list in the Agent settings:</p>
      <ul>
        <li>
          <strong>View current list</strong> - See all tools you've marked as always-allowed
        </li>
        <li>
          <strong>Add tools</strong> - Add new tools to the list when prompted during Agent
          conversations
        </li>
        <li>
          <strong>Remove tools</strong> - Click the remove button next to any tool to require
          confirmation again
        </li>
      </ul>

      <h2 id="workspace-specific">Workspace-Specific Configuration</h2>
      <p>
        Your LLM configuration is specific to each workspace. This means you can use different
        providers or API keys in different workspaces if needed.
      </p>

      <p>Benefits of workspace-specific configuration:</p>
      <ul>
        <li>Use different API keys for personal vs. work projects</li>
        <li>Choose different models based on workspace requirements</li>
        <li>Maintain separate always-allow tool lists per workspace</li>
      </ul>

      <h2 id="updating-config">Updating Your Configuration</h2>
      <p>To update your LLM settings:</p>
      <ol>
        <li>Open the Agent settings dialog</li>
        <li>Modify the provider, model, or API key as needed</li>
        <li>
          Click <strong>Save</strong> to apply changes
        </li>
      </ol>

      <p>Changes take effect immediately for new Agent conversations.</p>

      <h2 id="removing-config">Removing Your Configuration</h2>
      <p>
        To remove your LLM configuration from a workspace, open the settings and click the{' '}
        <strong>Remove Configuration</strong> button. This will:
      </p>
      <ul>
        <li>Delete your encrypted API key</li>
        <li>Clear your model selection</li>
        <li>Remove your always-allow tools list</li>
      </ul>

      <p>After removal, you'll need to reconfigure your LLM to use the Sentinel Agent again.</p>

      <h2 id="api-key-security">API Key Security</h2>
      <p>SENTINEL takes your API key security seriously:</p>
      <ul>
        <li>
          <strong>Encryption</strong> - Keys are encrypted using AES-256 before storage
        </li>
        <li>
          <strong>No visibility</strong> - The UI never displays your actual key after saving
        </li>
        <li>
          <strong>Personal use only</strong> - Your key is only used for your account
        </li>
        <li>
          <strong>Workspace isolation</strong> - Keys are stored per-workspace
        </li>
      </ul>

      <Callout type="tip" title="Rotate your keys regularly">
        For additional security, consider rotating your API keys periodically. Update your key in
        SENTINEL whenever you generate a new one from your provider.
      </Callout>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>Agent not responding</h3>
      <ul>
        <li>Verify your API key is still valid with your provider</li>
        <li>Check that the key has sufficient credits or quota</li>
        <li>Try updating your configuration with a fresh API key</li>
      </ul>

      <h3>Invalid API key error</h3>
      <ul>
        <li>Ensure the key matches the expected format for your provider</li>
        <li>Verify you copied the complete key without extra spaces</li>
        <li>Check that the key has the necessary permissions enabled</li>
      </ul>

      <h3>Model not available</h3>
      <ul>
        <li>Some models may require special access from your provider</li>
        <li>Try selecting a different model or use the default</li>
        <li>Check your provider's documentation for model availability</li>
      </ul>
    </>
  );
}
