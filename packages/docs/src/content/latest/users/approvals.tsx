import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function UserApprovalsContent() {
  return (
    <>
      <h1 id="approving-tool-calls">Approving Tool Calls</h1>
      <p className="lead text-xl text-muted-foreground">
        Some tools require approval before they can run. Learn how to review and respond to approval
        requests.
      </p>

      <h2 id="why-approvals">Why Do Some Tools Need Approval?</h2>
      <p>
        Your administrator may mark certain tools as "sensitive." These tools require a human to
        review and approve each use before they run. Common examples include:
      </p>
      <ul>
        <li>Tools that delete or modify important data</li>
        <li>Tools that send messages or emails</li>
        <li>Tools that access sensitive information</li>
        <li>Tools that incur costs (API calls, cloud resources)</li>
      </ul>

      <h2 id="how-approvals-work">How Approvals Work</h2>
      <ol>
        <li>Your AI assistant tries to use a sensitive tool</li>
        <li>SENTINEL pauses the request and notifies you</li>
        <li>You review what the AI wants to do</li>
        <li>You approve or cancel the request</li>
        <li>If approved, the tool runs; if cancelled, the AI is informed</li>
      </ol>

      <Callout type="info" title="Real-time interaction">
        Your AI assistant waits for your response. The faster you approve (or cancel), the faster
        your AI can continue working.
      </Callout>

      <h2 id="reviewing-requests">Reviewing an Approval Request</h2>

      <Steps>
        <Step number={1} title="Get notified">
          <p>
            When an approval is needed, you'll see a notification. You might also see a badge on the{' '}
            <strong>Approvals</strong> menu item showing the count.
          </p>
        </Step>

        <Step number={2} title="Go to Approvals">
          <p>
            Click <strong>Approvals</strong> in the sidebar to see all pending requests.
          </p>
        </Step>

        <Step number={3} title="Review the details">
          <p>For each request, you'll see:</p>
          <ul>
            <li>
              <strong>Tool Name</strong> - Which tool the AI wants to use
            </li>
            <li>
              <strong>Agent</strong> - Which AI agent made the request
            </li>
            <li>
              <strong>Status</strong> - The current status of the request
            </li>
            <li>
              <strong>Requested</strong> - When the request was made
            </li>
            <li>
              <strong>Expires</strong> - When the request will automatically expire
            </li>
          </ul>
        </Step>

        <Step number={4} title="Make your decision">
          <p>
            Click <strong>Approve</strong> to allow the action, or <strong>Cancel</strong> to reject
            it.
          </p>
        </Step>
      </Steps>

      <h2 id="approving">Approving a Request</h2>
      <p>
        When you click <strong>Approve</strong>, the tool runs immediately with the parameters
        shown. The AI assistant receives the result and continues its work.
      </p>

      <Callout type="info" title="Self-approval is permission-based">
        Not all users can self-approve all requests. The <strong>Approve</strong> button only
        appears if the tool's approval configuration includes <code>session_owner</code> in the
        allowed approvers list. If you don't see the Approve button, contact an administrator to
        approve the request on your behalf.
      </Callout>

      <Callout type="tip" title="Review parameters carefully">
        Before approving, make sure the parameters look correct. For example, if a tool is deleting
        a file, verify it's the right file.
      </Callout>

      <h2 id="cancelling">Cancelling a Request</h2>
      <p>
        When you click <strong>Cancel</strong>, the request is cancelled. The AI assistant will be
        informed that the request was not approved and may try a different approach or ask for
        clarification.
      </p>

      <h2 id="expiration">Request Expiration</h2>
      <p>
        Approval requests don't last forever. If you don't respond within the timeout period (set by
        your administrator), the request expires and is automatically denied.
      </p>
      <p>
        The AI assistant will be notified of the timeout and may retry the request or try a
        different approach.
      </p>

      <h2 id="notifications">Getting Notified</h2>
      <p>To make sure you don't miss approval requests:</p>
      <ul>
        <li>
          <strong>Browser notifications</strong> - Enable these for real-time alerts when approvals
          are needed
        </li>
      </ul>

      <Callout type="tip" title="Enable browser notifications">
        Make sure to allow browser notifications from SENTINEL so you receive real-time alerts when
        approvals are pending.
      </Callout>

      <h2 id="history">Viewing Approval History</h2>
      <p>To see past approvals and cancellations:</p>
      <ol>
        <li>
          Go to <strong>Audit</strong> in the sidebar
        </li>
        <li>Filter by decision to see ALLOWED or DENIED entries</li>
      </ol>
    </>
  );
}
