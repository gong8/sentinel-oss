import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function UserRequestingAccessContent() {
  return (
    <>
      <h1 id="requesting-access">Requesting Access</h1>
      <p className="lead text-xl text-muted-foreground">
        Need access to a tool or server that's currently blocked? Here's how to request it.
      </p>

      <h2 id="when-to-request">When to Request Access</h2>
      <p>You might need to request access when:</p>
      <ul>
        <li>A tool you need is marked as "DENIED" in your tools list</li>
        <li>Your AI assistant fails to use a tool due to access restrictions</li>
        <li>You're starting a new project that requires different tools</li>
        <li>A new tool server has been added that you need to use</li>
      </ul>

      <h2 id="requesting-tool-access">Requesting Access to a Tool</h2>

      <Steps>
        <Step number={1} title="Find the denied tool">
          <p>
            Go to the <strong>Tools</strong> page and find the tool you need access to. It will be
            marked as "DENIED" in red.
          </p>
        </Step>

        <Step number={2} title="Click Request Access">
          <p>
            Click the <strong>Request Access</strong> button on the tool card or in the tool details
            page.
          </p>
        </Step>

        <Step number={3} title="Fill in the request form">
          <p>Complete the access request form with the following fields:</p>
          <ul>
            <li>
              <strong>Server</strong> - Select the server from the dropdown
            </li>
            <li>
              <strong>Tool</strong> - Select the specific tool from the dropdown
            </li>
            <li>
              <strong>Reason</strong> - Provide a brief explanation of why you need access (minimum
              8 characters). This helps your administrator make a decision.
            </li>
          </ul>
        </Step>

        <Step number={4} title="Submit your request">
          <p>
            Click <strong>Submit Request</strong>. Your administrator will be notified.
          </p>
        </Step>
      </Steps>

      <Callout type="info" title="Be specific">
        The more context you provide about why you need access, the faster your request can be
        reviewed.
      </Callout>

      <h2 id="requesting-policy-removal">Requesting Policy Removal</h2>
      <p>
        If a tool is blocked by a DENY policy (not just missing an ALLOW policy), you'll see a{' '}
        <strong>Request Removal</strong> button instead of "Request Access".
      </p>

      <h3 id="when-youll-see-this">When You'll See This</h3>
      <ul>
        <li>Tool shows "DENIED" access level</li>
        <li>A specific DENY policy is blocking your access</li>
        <li>You need an administrator to modify or remove the blocking policy</li>
      </ul>

      <h3 id="request-removal-flow">Request Removal Flow</h3>
      <Steps>
        <Step number={1} title="Click Request Removal">
          <p>
            Click <strong>Request Removal</strong> on the blocked tool.
          </p>
        </Step>

        <Step number={2} title="Provide a reason">
          <p>Explain why you need the DENY policy modified.</p>
        </Step>

        <Step number={3} title="Submit your request">
          <p>Submit your request for administrator review.</p>
        </Step>

        <Step number={4} title="Administrator review">
          <p>The administrator reviews and decides whether to modify the blocking policy.</p>
        </Step>
      </Steps>

      <h2 id="requesting-server-access">Requesting a New Tool Server</h2>
      <p>
        If you need access to a server that hasn't been added to SENTINEL yet, you can request it:
      </p>

      <Steps>
        <Step number={1} title="Go to the Requests page">
          <p>
            Click <strong>Requests</strong> in the sidebar navigation.
          </p>
        </Step>

        <Step number={2} title="Click Request New Server">
          <p>
            Click the <strong>Request New Server</strong> button.
          </p>
        </Step>

        <Step number={3} title="Provide server details">
          <p>Fill in the server request form:</p>
          <ul>
            <li>
              <strong>Name</strong> - The name of the server (e.g., "Jira", "Linear", "Custom API")
            </li>
            <li>
              <strong>URL</strong> - The server URL or endpoint
            </li>
            <li>
              <strong>Auth Type</strong> - The authentication method required. The system will
              attempt to auto-detect the auth type based on the URL (e.g., GitHub URLs default to
              OAuth, standard API endpoints default to API Key). You can override this detection by
              manually selecting a different auth type from the dropdown.
            </li>
            <li>
              <strong>API Key</strong> - Optional API key if you have one
            </li>
            <li>
              <strong>Reason</strong> - Why your team needs this server
            </li>
          </ul>
        </Step>

        <Step number={4} title="Submit">
          <p>
            Click <strong>Submit Request</strong>.
          </p>
        </Step>
      </Steps>

      <h2 id="tracking-requests">Tracking Your Requests</h2>
      <p>To see the status of your access requests:</p>

      <ol>
        <li>
          Go to <strong>Requests</strong> in the sidebar
        </li>
        <li>You'll see all your pending and past requests listed on this page</li>
      </ol>

      <p>Each request shows:</p>
      <ul>
        <li>
          <strong>Status</strong> - Pending, Approved, Modified, Denied, or Withdrawn
        </li>
        <li>
          <strong>Requested</strong> - When you submitted the request
        </li>
        <li>
          <strong>Response</strong> - Any message from the administrator
        </li>
      </ul>

      <h2 id="request-statuses">Understanding Request Status</h2>

      <h3>Pending</h3>
      <p>
        Your request is waiting for administrator review. You'll be notified when there's an update.
      </p>

      <h3>Approved</h3>
      <p>
        Your request was approved. You should now have access to the tool or server. You may need to
        refresh the Tools page to see the change.
      </p>

      <h3>Denied</h3>
      <p>
        Your request was not approved. Check the administrator's response for an explanation. You
        may be able to submit a new request with additional information.
      </p>

      <h3>Modified</h3>
      <p>
        Your request was approved with modifications. The administrator granted access but may have
        adjusted the scope or added conditions. Check the review note for details on what was
        changed.
      </p>
      <p>
        <strong>Note:</strong> In the request list, MODIFIED status is displayed as "APPROVED" with
        a modifications note indicator. Click on the request to see the full details of what was
        modified.
      </p>

      <h3>Withdrawn</h3>
      <p>
        You cancelled this request before it was reviewed. You can submit a new request if you still
        need access.
      </p>

      <Callout type="tip" title="Follow up if needed">
        If your request is urgent or you haven't heard back, reach out to your SENTINEL
        administrator directly through your organization's communication channels.
      </Callout>

      <h2 id="tips">Tips for Getting Approved</h2>
      <ul>
        <li>
          <strong>Be specific</strong> - Explain exactly what project or task requires the tool
        </li>
        <li>
          <strong>Explain the business need</strong> - Help admins understand why this is important
        </li>
        <li>
          <strong>Mention alternatives</strong> - Note if you've tried other tools that didn't work
        </li>
        <li>
          <strong>Follow up in person</strong> - For urgent needs, combine your request with a
          direct message
        </li>
      </ul>
    </>
  );
}
