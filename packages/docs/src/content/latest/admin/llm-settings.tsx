import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminLlmSettingsContent() {
  return (
    <>
      <h1 id="llm-settings">LLM Settings</h1>
      <p className="lead text-xl text-muted-foreground">
        Configure the AI model provider used by Sentinel for intelligent features like the Sentinel
        Agent.
      </p>

      <h2 id="overview">Overview</h2>
      <p>
        Sentinel uses a Large Language Model (LLM) for various intelligent features including the
        Sentinel Agent admin assistant. You can configure which LLM provider and model your
        organization uses.
      </p>

      <h2 id="providers">Available Providers</h2>
      <p>Sentinel supports multiple LLM providers:</p>

      <h3>Cloud Providers</h3>
      <ul>
        <li>
          <strong>Anthropic (Claude):</strong> Claude models including Claude 3.5 Sonnet and Claude
          3 Opus.
        </li>
        <li>
          <strong>OpenAI:</strong> GPT-4 and GPT-3.5 models.
        </li>
        <li>
          <strong>Google:</strong> Gemini models.
        </li>
        <li>
          <strong>Amazon Bedrock:</strong> Various models via AWS Bedrock.
        </li>
        <li>
          <strong>Azure OpenAI:</strong> OpenAI models via Azure.
        </li>
      </ul>

      <h3>Local Providers (Self-Hosted Only)</h3>
      <ul>
        <li>
          <strong>Ollama:</strong> Run open-source models locally.
        </li>
        <li>
          <strong>LM Studio:</strong> Local model inference with OpenAI-compatible API.
        </li>
        <li>
          <strong>Custom:</strong> Any OpenAI-compatible API endpoint.
        </li>
      </ul>

      <Callout type="info" title="Managed Mode">
        When running Sentinel in managed mode, local providers (Ollama, LM Studio, Custom) are not
        available. Only cloud providers can be configured.
      </Callout>

      <h2 id="configuration">Configuring LLM Settings</h2>
      <p>
        Navigate to <strong>Settings</strong> in the admin sidebar and select the{' '}
        <strong>LLM</strong> tab.
      </p>

      <Steps>
        <Step number={1} title="Select Provider">
          <p>
            Choose your preferred LLM provider from the dropdown. Select <strong>Auto</strong> to
            let Sentinel automatically select the best available provider.
          </p>
        </Step>

        <Step number={2} title="Configure Authentication">
          <p>For cloud providers, enter your API key. The key is encrypted before storage.</p>
          <Callout type="info" title="API Key Security">
            API keys are encrypted at rest using AES-256. When viewing settings, only the last 4
            characters are displayed for verification.
          </Callout>
        </Step>

        <Step number={3} title="Select Model">
          <p>
            Choose the specific model to use. Available models depend on the selected provider. For
            local providers, Sentinel will fetch the list of available models from your server.
          </p>
        </Step>

        <Step number={4} title="Configure Parameters">
          <p>Optionally adjust model parameters:</p>
          <ul>
            <li>
              <strong>Max Tokens:</strong> Maximum output length (1-128,000 tokens).
            </li>
            <li>
              <strong>Temperature:</strong> Creativity/randomness (0-2, lower is more
              deterministic).
            </li>
          </ul>
        </Step>

        <Step number={5} title="Test Connection">
          <p>
            Click <strong>Test Connection</strong> to verify your configuration works before saving.
          </p>
        </Step>

        <Step number={6} title="Save">
          <p>
            Click <strong>Save</strong> to apply your LLM configuration.
          </p>
        </Step>
      </Steps>

      <h2 id="local-providers">Setting Up Local Providers</h2>

      <h3>Ollama</h3>
      <p>
        <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
          Ollama
        </a>{' '}
        allows you to run open-source models locally.
      </p>
      <ol>
        <li>Install Ollama on your server or local machine.</li>
        <li>Pull a model (e.g., `ollama pull llama2`).</li>
        <li>Ensure Ollama is running and accessible from Sentinel.</li>
        <li>
          Configure the Base URL (default: <code>http://localhost:11434</code>).
        </li>
      </ol>

      <h3>LM Studio</h3>
      <p>LM Studio provides a local OpenAI-compatible API.</p>
      <ol>
        <li>Download and install LM Studio.</li>
        <li>Load a model and start the local server.</li>
        <li>
          Configure the Base URL (default: <code>http://localhost:1234/v1</code>).
        </li>
      </ol>

      <h3>Custom Endpoint</h3>
      <p>Use any OpenAI-compatible API endpoint.</p>
      <ol>
        <li>Enter the full base URL of your API endpoint.</li>
        <li>Provide an API key if required.</li>
        <li>Sentinel will attempt to list available models automatically.</li>
      </ol>

      <h2 id="testing">Testing Your Configuration</h2>
      <p>
        The <strong>Test Connection</strong> feature verifies your LLM configuration:
      </p>
      <ul>
        <li>For cloud providers, it sends a simple test message and verifies a valid response.</li>
        <li>For local providers, it checks connectivity and lists available models.</li>
      </ul>

      <Callout type="warning" title="Test Before Saving">
        Always test your configuration before saving. An invalid LLM configuration will cause
        Sentinel Agent and other AI-powered features to fail.
      </Callout>

      <h2 id="usage-tracking">Usage Tracking</h2>
      <p>
        Sentinel tracks LLM usage for monitoring and cost management. View usage statistics to see:
      </p>
      <ul>
        <li>Total API calls over a date range.</li>
        <li>Token usage (input and output).</li>
        <li>Estimated costs (for supported providers).</li>
      </ul>

      <h2 id="api-reference">API Reference</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 border-b">Endpoint</th>
            <th className="text-left p-2 border-b">Type</th>
            <th className="text-left p-2 border-b">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.getProviders</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List available LLM providers</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.getLlmConfig</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get current LLM configuration</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.updateLlmConfig</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Update LLM configuration</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.testConnection</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Test LLM provider connection</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.listModels</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List available models for a provider</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.llmSettings.getUsageSummary</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get LLM usage statistics</td>
          </tr>
        </tbody>
      </table>

      <h3>Configuration Schema</h3>
      <p>
        <code>admin.llmSettings.updateLlmConfig</code> accepts:
      </p>
      <ul>
        <li>
          <code>llmProvider</code> (string): Provider identifier (e.g., "anthropic", "openai",
          "ollama").
        </li>
        <li>
          <code>llmModel</code> (string | null): Specific model ID.
        </li>
        <li>
          <code>llmApiKey</code> (string | null): API key (will be encrypted).
        </li>
        <li>
          <code>llmBaseUrl</code> (string | null): Custom base URL for local/custom providers.
        </li>
        <li>
          <code>llmMaxTokens</code> (number): Max output tokens (1-128,000).
        </li>
        <li>
          <code>llmTemperature</code> (number): Temperature setting (0-2).
        </li>
      </ul>

      <h3>Test Connection Response</h3>
      <p>
        <code>admin.llmSettings.testConnection</code> returns:
      </p>
      <ul>
        <li>
          <code>success</code>: Boolean indicating if connection succeeded.
        </li>
        <li>
          <code>models</code>: Array of available model IDs (for local providers).
        </li>
        <li>
          <code>response</code>: Test response text (for cloud providers).
        </li>
        <li>
          <code>error</code>: Error message if connection failed.
        </li>
      </ul>
    </>
  );
}
