import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminSensitiveFlagsContent() {
  return (
    <>
      <h1 id="tool-flags">Tool Flags</h1>
      <p className="lead text-xl text-muted-foreground">
        Flag sensitive tools for extra scrutiny after policy evaluation passes. Use pattern-based
        matching to apply rate limits, require approvals, or send alerts for critical operations.
      </p>

      <h2 id="what-are-tool-flags">What Are Tool Flags?</h2>
      <p>
        Tool flags add a second layer of security <em>after</em> the policy engine allows a request.
        While policies determine <strong>who</strong> can use <strong>which</strong> tools, flags
        determine <strong>how</strong> those tools should be monitored or controlled.
      </p>

      <p>Flags are useful for:</p>
      <ul>
        <li>
          <strong>High-risk operations</strong> - Require human approval before executing
          destructive actions.
        </li>
        <li>
          <strong>Cost control</strong> - Rate limit expensive API calls per session.
        </li>
        <li>
          <strong>Security monitoring</strong> - Alert your team when sensitive tools are invoked.
        </li>
        <li>
          <strong>Compliance</strong> - Maintain audit trails with enhanced logging for flagged
          tools.
        </li>
      </ul>

      <Callout type="info" title="Policy vs. Flags">
        Policies control access (ALLOW/DENY). Flags control behavior after access is granted. A
        request must first pass all applicable policies before flags are evaluated.
      </Callout>

      <h2 id="flag-behaviors">Flag Behaviors</h2>
      <p>
        Each flag can have one or more behaviors. Behaviors determine what happens when a flagged
        tool is invoked:
      </p>

      <h3>Require Approval</h3>
      <p>
        Pauses the tool invocation and waits for a human to approve or deny the request. The AI
        assistant is blocked until someone reviews the request.
      </p>
      <ul>
        <li>
          <strong>Allowed Approvers:</strong> Choose who can approve requests: the session owner
          (the user who started the AI session), admins, or both.
        </li>
        <li>
          <strong>Timeout:</strong> Set how long to wait for approval (in seconds). If no decision
          is made within the timeout, the request is automatically denied.
        </li>
      </ul>

      <h3>Rate Limit</h3>
      <p>
        Limits how many times a tool can be invoked within a session during a specific time window.
        Once the limit is reached, further invocations are blocked until the window resets.
      </p>
      <ul>
        <li>
          <strong>Max Per Session:</strong> The maximum number of invocations allowed within the
          time window.
        </li>
        <li>
          <strong>Window (Minutes):</strong> The rolling time window for counting invocations.
        </li>
      </ul>

      <h3>Alert</h3>
      <p>
        Sends a webhook notification whenever the flagged tool is invoked. This does not block the
        invocation but ensures your team is notified in real-time.
      </p>
      <ul>
        <li>
          <strong>Webhook Endpoints:</strong> Select which configured webhooks should receive
          alerts. You must first create webhooks in the Webhooks page.
        </li>
      </ul>

      <Callout type="tip" title="Enhanced Audit Logging">
        All flagged tools automatically receive enhanced audit logging, regardless of which
        behaviors are enabled. This includes full parameter capture for compliance and forensics.
      </Callout>

      <h2 id="tool-patterns">Tool Patterns</h2>
      <p>
        Flags use pattern-based matching to target tools. Patterns follow the{' '}
        <code>server::tool</code> syntax:
      </p>
      <ul>
        <li>
          <code>*::*</code> - Matches all tools on all servers.
        </li>
        <li>
          <code>github.com::*</code> - Matches all tools on a specific server.
        </li>
        <li>
          <code>*::delete*</code> - Matches any tool starting with "delete" on any server.
        </li>
        <li>
          <code>github.com::create_issue</code> - Matches a single specific tool.
        </li>
      </ul>

      <p>
        The server portion uses the hostname and port from the MCP server URL. For example, a server
        with URL <code>https://github.com:8080</code> would be matched with{' '}
        <code>github.com:8080::toolname</code>.
      </p>

      <h2 id="creating-a-flag">Creating a Flag</h2>

      <Steps>
        <Step number={1} title="Go to Tool Flags">
          <p>
            Navigate to <strong>Tool Flags</strong> in the admin sidebar.
          </p>
        </Step>

        <Step number={2} title="Click Create Flag">
          <p>
            Click the <strong>Create Flag</strong> button.
          </p>
        </Step>

        <Step number={3} title="Select Tool Pattern">
          <p>
            Choose the server and tool to flag. Use the dropdowns to select from connected MCP
            servers and their available tools, or select "All servers" / "All tools" for wildcards.
          </p>
        </Step>

        <Step number={4} title="Select Behaviors">
          <p>
            Choose one or more behaviors: <strong>Require Approval</strong>,{' '}
            <strong>Rate Limit</strong>, or <strong>Alert</strong>. Each behavior requires its own
            configuration.
          </p>
        </Step>

        <Step number={5} title="Configure Each Behavior">
          <p>Configure the settings for each selected behavior:</p>
          <ul>
            <li>
              <strong>Rate Limit:</strong> Set max invocations per session and window duration.
            </li>
            <li>
              <strong>Require Approval:</strong> Choose allowed approvers and timeout duration.
            </li>
            <li>
              <strong>Alert:</strong> Select which webhook endpoints receive notifications.
            </li>
          </ul>
        </Step>

        <Step number={6} title="Add Description">
          <p>
            Optionally add a description explaining why this tool is flagged. This helps approvers
            understand the context when reviewing requests.
          </p>
        </Step>

        <Step number={7} title="Save">
          <p>
            Click <strong>Create Flag</strong>. The flag is applied immediately to all matching tool
            invocations.
          </p>
        </Step>
      </Steps>

      <h2 id="managing-flags">Managing Flags</h2>
      <p>
        The Tool Flags page displays all configured flags with their patterns, behaviors, and
        status. You can:
      </p>
      <ul>
        <li>
          <strong>Toggle Enable/Disable:</strong> Temporarily pause a flag without deleting it.
          Disabled flags are not evaluated.
        </li>
        <li>
          <strong>Edit:</strong> Modify behaviors, configurations, or descriptions.
        </li>
        <li>
          <strong>View Details:</strong> See agent overrides and full configuration.
        </li>
        <li>
          <strong>Delete:</strong> Permanently remove a flag.
        </li>
      </ul>

      <p>
        Use the search bar to find flags by tool pattern or description. The filter dropdown lets
        you narrow results by status (enabled/disabled) or behavior type.
      </p>

      <h2 id="agent-overrides">Per-Agent Overrides</h2>
      <p>
        Flags apply to all agents by default, but you can create per-agent overrides to customize or
        exempt specific agents from a flag.
      </p>

      <Steps>
        <Step number={1} title="Open Flag Details">
          <p>
            Click <strong>View</strong> on the flag you want to configure overrides for.
          </p>
        </Step>

        <Step number={2} title="Add Override">
          <p>
            In the Agent Overrides section, click <strong>Add Override</strong>.
          </p>
        </Step>

        <Step number={3} title="Select Agent">
          <p>Choose which agent this override applies to from the dropdown.</p>
        </Step>

        <Step number={4} title="Configure Override">
          <p>Choose one of these options:</p>
          <ul>
            <li>
              <strong>Exempt:</strong> Check "Exempt this agent" to completely bypass the flag for
              this agent.
            </li>
            <li>
              <strong>Custom Behaviors:</strong> Select different behaviors than the default flag
              configuration. Leave empty to disable all behaviors for this agent.
            </li>
          </ul>
        </Step>

        <Step number={5} title="Save Override">
          <p>
            Click <strong>Create Override</strong>. The agent-specific configuration takes effect
            immediately.
          </p>
        </Step>
      </Steps>

      <Callout type="danger" title="Exemption Security">
        Exempted agents bypass the flag entirely. Use exemptions sparingly and only for trusted
        automation agents that require uninterrupted operation.
      </Callout>

      <h2 id="reviewing-approvals">Reviewing Approval Requests</h2>
      <p>
        When a flag with the "Require Approval" behavior is triggered, the request appears in the
        pending approvals queue on the <strong>Dashboard</strong>. Approvers receive real-time
        notifications and can:
      </p>
      <ul>
        <li>
          <strong>Approve:</strong> Allow the tool invocation to proceed.
        </li>
        <li>
          <strong>Deny:</strong> Block the invocation with an optional reason.
        </li>
      </ul>

      <p>
        If no decision is made within the configured timeout, the request is automatically denied
        and the AI assistant is notified.
      </p>

      <h2 id="evaluation-order">How Flags Are Evaluated</h2>
      <p>When an AI assistant tries to use a tool, Sentinel follows this evaluation order:</p>
      <ol>
        <li>
          <strong>Policy Engine:</strong> Check if the user/agent is allowed to use the tool.
        </li>
        <li>
          <strong>Flag Matching:</strong> Find all enabled flags matching the tool pattern.
        </li>
        <li>
          <strong>Agent Overrides:</strong> Apply any per-agent override configurations.
        </li>
        <li>
          <strong>Behavior Execution:</strong> Execute each behavior (rate limit check, approval
          request, alert) in order.
        </li>
      </ol>

      <p>
        If multiple flags match the same tool, all of their behaviors are applied. Rate limits are
        checked first, then approvals, then alerts. If any behavior blocks the request (rate limit
        exceeded or approval denied), the invocation is stopped.
      </p>
    </>
  );
}
