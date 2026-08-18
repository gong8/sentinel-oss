import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminWebhooksContent() {
  return (
    <>
      <h1 id="setting-up-alerts">Webhooks & Alerts</h1>
      <p className="lead text-xl text-muted-foreground">
        Get real-time notifications when important security events occur. Sentinel can send alerts
        to Slack, Discord, Email, or any custom HTTPS endpoint.
      </p>

      <h2 id="event-types">Supported Events</h2>
      <p>
        You can subscribe to specific categories of events to stay informed about your
        organization's AI activity:
      </p>

      <h3>Tool Usage Events</h3>
      <ul>
        <li>
          <code>TOOL_INVOCATION_ALLOWED</code> - A tool call was permitted by policy
        </li>
        <li>
          <code>TOOL_INVOCATION_DENIED</code> - A tool call was blocked by policy
        </li>
      </ul>

      <h3>Sensitive Operations Events</h3>
      <ul>
        <li>
          <code>SENSITIVE_TOOL_INVOKED</code> - A tool marked as sensitive was executed
        </li>
        <li>
          <code>SENSITIVE_APPROVAL_NEEDED</code> - A tool requires human approval before execution
        </li>
        <li>
          <code>SENSITIVE_RATE_LIMITED</code> - A sensitive tool was blocked due to rate limiting
        </li>
      </ul>

      <h3>Policy Events</h3>
      <ul>
        <li>
          <code>POLICY_CREATED</code> - A new policy was created
        </li>
        <li>
          <code>POLICY_UPDATED</code> - An existing policy was modified
        </li>
        <li>
          <code>POLICY_DELETED</code> - A policy was deleted
        </li>
      </ul>

      <h3>Agent Lifecycle Events</h3>
      <ul>
        <li>
          <code>AGENT_CREATED</code> - A new agent was registered
        </li>
        <li>
          <code>AGENT_DELETED</code> - An agent was deleted
        </li>
        <li>
          <code>SESSION_TERMINATED</code> - Fires when an administrator terminates a user session
        </li>
      </ul>

      <h2 id="destination-types">Destination Types</h2>

      <h3>1. Slack & Discord</h3>
      <p>
        Sentinel provides pre-formatted blocks and embeds for Slack and Discord, ensuring alerts are
        readable and actionable in your team's chat channels.
      </p>
      <ul>
        <li>
          <strong>Setup:</strong> Create an "Incoming Webhook" in your Slack or Discord server and
          paste the URL into Sentinel.
        </li>
      </ul>

      <h3>2. Email Notifications</h3>
      <p>
        Receive direct alerts to one or more email addresses. Sentinel uses the Resend API to
        deliver clean, HTML-formatted security notifications.
      </p>

      <h3>3. Custom Webhooks (Raw JSON)</h3>
      <p>
        Send raw event data to your own internal services for custom processing or secondary
        auditing.
      </p>
      <ul>
        <li>
          <strong>Security:</strong> Sentinel signs every payload with an{' '}
          <strong>HMAC-SHA256 signature</strong>. You can retrieve and rotate your webhook secret
          from the settings page to verify that requests are coming from Sentinel.
        </li>
      </ul>

      <h2 id="creating-webhooks">Creating a Webhook</h2>

      <Steps>
        <Step number={1} title="Add Endpoint">
          <p>
            Navigate to <strong>Webhooks</strong> in the admin sidebar and click{' '}
            <strong>Create Webhook</strong>.
          </p>
        </Step>

        <Step number={2} title="Configure Destination">
          <p>
            Select the <strong>Type</strong> (Slack, Discord, Email, or Custom) and provide the
            target URL or address.
          </p>
        </Step>

        <Step number={3} title="Select Events">
          <p>
            Choose the specific events you want this endpoint to receive. We recommend creating
            separate webhooks for "Security Critical" (Denials/Approvals) and "Informational"
            (Config changes) events.
          </p>
        </Step>

        <Step number={4} title="Enable Verbose Mode (Optional)">
          <p>
            Toggle <strong>Verbose Mode</strong> if you want the payload to include full tool
            arguments and execution context. Use this sparingly for high-volume endpoints.
          </p>
        </Step>
      </Steps>

      <h2 id="reliability">Reliability & Retries</h2>
      <p>Sentinel ensures alert delivery through a background worker system:</p>
      <ul>
        <li>
          <strong>Automatic Retries:</strong> If a destination server is down (5xx error), Sentinel
          will retry with an exponential backoff.
        </li>
        <li>
          <strong>Delivery History:</strong> View the status, response code, and payload of every
          delivery attempt directly from the Webhook details page.
        </li>
        <li>
          <strong>Manual Retry:</strong> You can manually re-trigger a failed delivery once you've
          resolved the issue with the destination endpoint.
        </li>
      </ul>

      <Callout type="info" title="Rate Limiting">
        To prevent spam, Sentinel may temporarily throttle webhooks if they exceed a high volume of
        events in a short period.
      </Callout>
    </>
  );
}
