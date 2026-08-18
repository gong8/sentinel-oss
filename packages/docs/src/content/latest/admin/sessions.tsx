import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminSessionsContent() {
  return (
    <>
      <h1 id="managing-sessions">Managing Sessions</h1>
      <p className="lead text-xl text-muted-foreground">
        Monitor and control active AI agent sessions across your organization.
      </p>

      <h2 id="what-are-sessions">What Are Sessions?</h2>
      <p>
        A session represents an active connection between a user's AI assistant (like Claude or
        Cursor) and Sentinel. Each session tracks:
      </p>
      <ul>
        <li>
          <strong>User:</strong> The authenticated user who initiated the session.
        </li>
        <li>
          <strong>Agent:</strong> The AI agent configuration being used.
        </li>
        <li>
          <strong>Status:</strong> Whether the session is active, terminated, or expired.
        </li>
        <li>
          <strong>Activity:</strong> When the session was created and last used.
        </li>
      </ul>

      <h2 id="viewing-sessions">Viewing Active Sessions</h2>
      <p>
        Navigate to <strong>Sessions</strong> in the admin sidebar to see all currently active
        sessions in your organization.
      </p>
      <p>The session list displays:</p>
      <ul>
        <li>
          <strong>External Session ID:</strong> The identifier used by the MCP client.
        </li>
        <li>
          <strong>User Email:</strong> The authenticated user.
        </li>
        <li>
          <strong>Agent:</strong> The agent configuration in use.
        </li>
        <li>
          <strong>Created At:</strong> When the session was established.
        </li>
        <li>
          <strong>Last Activity:</strong> Timestamp of the most recent tool call.
        </li>
      </ul>

      <Callout type="info" title="Session Visibility">
        Sessions are scoped to your organization. You will only see sessions for users within your
        organization.
      </Callout>

      <h2 id="session-counts">Session Counts</h2>
      <p>
        You can query the number of active sessions for a specific user. This is useful for
        monitoring user activity levels and detecting potential issues like orphaned sessions.
      </p>

      <h2 id="terminating-sessions">Terminating Sessions</h2>
      <p>Administrators can forcefully terminate sessions when needed. Common use cases include:</p>
      <ul>
        <li>Revoking access after a security incident.</li>
        <li>Cleaning up stale or orphaned sessions.</li>
        <li>Forcing users to re-authenticate after policy changes.</li>
      </ul>

      <h3>Terminating a Single Session</h3>
      <Steps>
        <Step number={1} title="Find the Session">
          <p>Locate the session in the sessions list by user email or session ID.</p>
        </Step>

        <Step number={2} title="Click Terminate">
          <p>
            Click the <strong>Terminate</strong> button on the session row.
          </p>
        </Step>

        <Step number={3} title="Confirm">
          <p>
            Confirm the termination. The session will immediately become invalid and any in-progress
            tool calls will fail.
          </p>
        </Step>
      </Steps>

      <Callout type="warning" title="Immediate Effect">
        Session termination is immediate. The user's AI assistant will lose access and need to
        establish a new session (which may require re-authentication depending on your
        configuration).
      </Callout>

      <h3>Terminating All Sessions for a User</h3>
      <p>You can terminate all active sessions for a specific user at once. This is useful when:</p>
      <ul>
        <li>A user reports their token may be compromised.</li>
        <li>A user is leaving the organization.</li>
        <li>You need to force a complete re-authentication.</li>
      </ul>

      <Steps>
        <Step number={1} title="Navigate to the User">
          <p>From the Sessions page, filter by user or navigate to the user's detail page.</p>
        </Step>

        <Step number={2} title="Terminate All Sessions">
          <p>
            Click <strong>Terminate All Sessions</strong> to invalidate all active sessions for this
            user.
          </p>
        </Step>

        <Step number={3} title="Review Results">
          <p>
            The response will indicate how many sessions were terminated. All the user's AI
            assistants will need to re-connect.
          </p>
        </Step>
      </Steps>

      <h2 id="webhooks">Webhook Notifications</h2>
      <p>
        When a session is terminated, Sentinel sends a webhook notification with the{' '}
        <code>SESSION_TERMINATED</code> event. The payload includes:
      </p>
      <ul>
        <li>Session ID and external session ID</li>
        <li>User ID and email (if applicable)</li>
        <li>Agent ID (if applicable)</li>
        <li>Who terminated the session</li>
        <li>Number of sessions terminated (for bulk operations)</li>
      </ul>

      <Callout type="info" title="Configure Webhooks">
        Set up webhook endpoints in the <strong>Alerts</strong> section to receive real-time
        notifications about session terminations.
      </Callout>

      <h2 id="audit-logging">Audit Logging</h2>
      <p>
        All session terminations are recorded in the admin action log with the{' '}
        <code>AGENT_TERMINATE</code> action type. The log entry includes:
      </p>
      <ul>
        <li>The admin who performed the termination.</li>
        <li>Session details before termination.</li>
        <li>Timestamp and request metadata.</li>
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
              <code>admin.sessions.list</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List all active sessions with user info</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.sessions.getActiveCount</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get count of active sessions for a user</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.sessions.terminate</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Terminate a specific session by ID</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.sessions.terminateUserSessions</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Terminate all sessions for a user</td>
          </tr>
        </tbody>
      </table>

      <h3>Input Parameters</h3>
      <h4>
        <code>admin.sessions.getActiveCount</code>
      </h4>
      <ul>
        <li>
          <code>userId</code> (string, required): The CUID of the user.
        </li>
      </ul>

      <h4>
        <code>admin.sessions.terminate</code>
      </h4>
      <ul>
        <li>
          <code>sessionId</code> (string, required): The CUID of the session to terminate.
        </li>
      </ul>

      <h4>
        <code>admin.sessions.terminateUserSessions</code>
      </h4>
      <ul>
        <li>
          <code>userId</code> (string, required): The CUID of the user whose sessions to terminate.
        </li>
      </ul>

      <h3>Response</h3>
      <p>Termination endpoints return:</p>
      <ul>
        <li>
          <code>success</code>: Boolean indicating success.
        </li>
        <li>
          <code>externalSessionId</code>: For single terminations, the external ID of the terminated
          session.
        </li>
        <li>
          <code>count</code>: For bulk terminations, the number of sessions terminated.
        </li>
        <li>
          <code>sessionIds</code>: For bulk terminations, array of terminated session IDs.
        </li>
      </ul>
    </>
  );
}
