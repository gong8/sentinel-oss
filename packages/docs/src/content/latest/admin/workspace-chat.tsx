import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function WorkspaceChatContent() {
  return (
    <>
      <h1 id="workspace-chat">Workspace Chat Configuration</h1>
      <p className="lead text-xl text-muted-foreground">
        Configure AI chat assistants for your workspaces. Control which LLM provider to use, set
        usage quotas, and optionally monitor conversations.
      </p>

      <h2 id="overview">Overview</h2>
      <p>
        Each workspace can have its own AI chat assistant that workspace members can use to interact
        with tools and get help with their work. As an administrator, you control:
      </p>
      <ul>
        <li>
          <strong>Enable/Disable</strong> - Whether chat is available in the workspace
        </li>
        <li>
          <strong>LLM Provider</strong> - Which AI model powers the assistant
        </li>
        <li>
          <strong>System Prompt</strong> - Custom instructions for the AI
        </li>
        <li>
          <strong>Usage Quotas</strong> - Monthly limits on messages and tokens
        </li>
        <li>
          <strong>Admin Visibility</strong> - Whether admins can view user conversations
        </li>
      </ul>

      <h2 id="enabling-chat">Enabling Workspace Chat</h2>
      <p>
        Navigate to <strong>Workspace Settings</strong> and select the <strong>Chat</strong> tab.
      </p>

      <Steps>
        <Step number={1} title="Enable Chat">
          <p>
            Toggle the <strong>Enable Chat</strong> switch to allow workspace members to use the AI
            assistant.
          </p>
        </Step>

        <Step number={2} title="Configure LLM Provider">
          <p>Select the AI provider and model:</p>
          <ul>
            <li>
              <strong>Provider</strong> - Choose from Claude, OpenAI, or other supported providers
            </li>
            <li>
              <strong>Model</strong> - Select the specific model (e.g., claude-3-sonnet, gpt-4)
            </li>
          </ul>
          <Callout type="info" title="Default Provider">
            If not specified, the workspace chat will use the organization's default LLM
            configuration.
          </Callout>
        </Step>

        <Step number={3} title="Set System Prompt (Optional)">
          <p>
            Customize the AI's behavior with a system prompt. This helps the assistant understand
            the workspace context and follow specific guidelines.
          </p>
          <p>Example system prompts:</p>
          <ul>
            <li>
              "You are a helpful assistant for the engineering team. Focus on code-related tasks."
            </li>
            <li>"Always verify before executing destructive operations."</li>
            <li>"Prefer using the internal documentation tool before web searches."</li>
          </ul>
        </Step>

        <Step number={4} title="Save Settings">
          <p>
            Click <strong>Save</strong> to apply your configuration. Changes take effect
            immediately.
          </p>
        </Step>
      </Steps>

      <h2 id="usage-quotas">Usage Quotas</h2>
      <p>Control costs and prevent abuse by setting monthly usage limits per workspace.</p>

      <h3>Available Quota Settings</h3>
      <ul>
        <li>
          <strong>Monthly Message Quota</strong> - Maximum number of messages per month (all users
          combined)
        </li>
        <li>
          <strong>Monthly Token Quota</strong> - Maximum tokens consumed per month
        </li>
      </ul>
      <p>
        Set either or both quotas. When a quota is reached, users will see a friendly error message
        explaining that the limit has been exceeded.
      </p>

      <Callout type="tip" title="Quota Reset">
        Quotas reset automatically at the beginning of each calendar month.
      </Callout>

      <h3>Viewing Usage Statistics</h3>
      <p>The chat settings page displays current usage statistics including:</p>
      <ul>
        <li>Total messages sent this month</li>
        <li>Total tokens consumed</li>
        <li>Usage by user (if admin visibility is enabled)</li>
      </ul>

      <h2 id="admin-visibility">Admin Conversation Visibility</h2>
      <p>
        By default, user conversations are private. Enable <strong>Admin Chat Visibility</strong> to
        allow workspace admins to view all conversations.
      </p>

      <Callout type="warning" title="Privacy Considerations">
        Enabling admin visibility affects user privacy. Consider your organization's policies and
        inform users when this setting is enabled. This feature is intended for compliance,
        troubleshooting, and quality assurance purposes.
      </Callout>

      <h3>What Admins Can See</h3>
      <p>When admin visibility is enabled, administrators can:</p>
      <ul>
        <li>View a list of all conversations in the workspace</li>
        <li>Filter conversations by user</li>
        <li>Read full conversation history including messages, tool calls, and results</li>
        <li>See which tools were executed and their outcomes</li>
      </ul>

      <h3>What Admins Cannot Do</h3>
      <ul>
        <li>Modify or delete user conversations</li>
        <li>Send messages on behalf of users</li>
        <li>Access conversations when visibility is disabled</li>
      </ul>

      <h2 id="tool-execution">Tool Execution in Chat</h2>
      <p>
        The workspace chat assistant can execute tools from the workspace's connected MCP servers.
        Tool execution follows the same policy rules as direct tool usage:
      </p>
      <ul>
        <li>
          <strong>ALLOW policies</strong> - Tool executes automatically
        </li>
        <li>
          <strong>DEFER policies</strong> - User must confirm before execution
        </li>
        <li>
          <strong>DENY policies</strong> - Tool is blocked
        </li>
      </ul>

      <h3>Sensitive Tools</h3>
      <p>
        Tools marked as <strong>Sensitive</strong> require explicit user confirmation before the AI
        assistant can execute them. Users see a confirmation dialog showing:
      </p>
      <ul>
        <li>Tool name and description</li>
        <li>Parameters being passed</li>
        <li>Option to "Always Allow" this tool for future calls</li>
      </ul>

      <h3>Always Allow List</h3>
      <p>
        Users can choose to always allow specific tools. This preference is stored per-user,
        per-workspace and can be managed from user settings.
      </p>

      <h2 id="permission-requests">Permission Requests from Chat</h2>
      <p>
        When users encounter tools they cannot access, they can request permission directly from the
        chat interface:
      </p>
      <ul>
        <li>
          <strong>Tool Access Request</strong> - Request access to a specific tool
        </li>
        <li>
          <strong>Server Access Request</strong> - Request access to all tools from an MCP server
        </li>
      </ul>
      <p>
        These requests appear in the standard <a href="/docs/admin/requests">Permission Requests</a>{' '}
        queue for administrator review.
      </p>

      <h2 id="audit-logging">Audit Logging</h2>
      <p>All chat settings changes are recorded in the admin audit log, including:</p>
      <ul>
        <li>When chat was enabled or disabled</li>
        <li>Changes to LLM provider or model</li>
        <li>Quota modifications</li>
        <li>Admin visibility toggle changes</li>
      </ul>
      <p>
        Each log entry includes a before/after snapshot of the settings for compliance purposes.
      </p>

      <h2 id="workspace-members">Managing Chat Access</h2>
      <p>Chat access is automatically granted to all workspace members. To restrict access:</p>
      <ol>
        <li>Disable chat at the workspace level, or</li>
        <li>Create policies that restrict specific users from using chat-related tools</li>
      </ol>

      <h3>Viewing Workspace Members</h3>
      <p>
        The chat settings page includes a member list showing all users who can access the workspace
        chat. This helps administrators understand who will be affected by settings changes.
      </p>
    </>
  );
}
