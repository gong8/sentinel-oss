import { Callout } from '../../../components/Callout';

export default function AdminRequestsContent() {
  return (
    <>
      <h1 id="reviewing-requests">Reviewing Requests</h1>
      <p className="lead text-xl text-muted-foreground">
        Manage user access requests for tools and servers. When users encounter a "Permission
        Denied" error or need access to new capabilities, they can submit a request directly from
        their dashboard.
      </p>

      <h2 id="request-types">Request Types</h2>
      <p>There are two main types of requests you will encounter:</p>
      <ul>
        <li>
          <strong>Tool Access:</strong> A user wants to use specific tools (e.g.,
          `github_create_issue`, `sql_query`).
        </li>
        <li>
          <strong>Restriction Removal:</strong> A user is blocked by a specific DENY policy and is
          requesting its removal or modification.
        </li>
      </ul>

      <h2 id="the-review-workflow">The Review Workflow</h2>
      <p>
        Navigate to <strong>Requests</strong> in the admin sidebar. You will see a list of pending
        requests. Click <strong>Review</strong> on any request to open the decision dialog.
      </p>

      <h3 id="approval-options">The Policy Form Modal</h3>
      <p>
        When you click <strong>Review</strong>, the Policy Form Modal opens with the request details
        pre-filled. This gives you full control over the policy that will be created.
      </p>

      <div className="my-6 border p-4 rounded-lg bg-card">
        <h4 className="font-semibold text-primary mt-0">Configure the Policy</h4>
        <p className="text-sm mt-2">
          The modal pre-populates the user and requested tools from the access request. You can:
        </p>
        <ul className="text-sm mt-2">
          <li>
            <strong>Adjust Matchers:</strong> Change the scope from a single user to a Role if
            others need the same access.
          </li>
          <li>
            <strong>Modify Tool Patterns:</strong> Expand or narrow the tools covered by the policy.
          </li>
          <li>
            <strong>Add Conditions:</strong> Restrict usage with time-based or parameter-based
            conditions (e.g., "only during work hours", "read-only").
          </li>
          <li>
            <strong>Set Expiration:</strong> Create temporary access that automatically revokes.
          </li>
        </ul>
        <p className="text-sm mt-2">
          Once configured, click <strong>Approve</strong> to create the policy and grant access, or{' '}
          <strong>Deny</strong> to reject the request.
        </p>
      </div>

      <h2 id="denying-requests">Denying Requests</h2>
      <p>
        If a request violates security protocols or is unnecessary, click <strong>Deny</strong>.
      </p>
      <ul>
        <li>
          You <strong>must</strong> provide a denial reason.
        </li>
        <li>The user will be notified and see your reason in their dashboard.</li>
        <li>Denied requests are archived but can be referenced later in the "Denied" filter.</li>
      </ul>

      <Callout type="info" title="Audit Trail">
        All decisions—approvals and denials—are logged in the Admin Action Log. You can see who
        approved a request and exactly what policy was created.
      </Callout>

      <h2 id="filtering-and-search">Filtering & Search</h2>
      <p>For organizations with high request volume, use the filter bar to manage the queue:</p>
      <ul>
        <li>
          <strong>Status:</strong> Filter by Pending, Approved, or Denied.
        </li>
        <li>
          <strong>User:</strong> See all requests from a specific developer.
        </li>
        <li>
          <strong>Tool/Server:</strong> Find all users requesting access to "Production DB" or
          "GitHub".
        </li>
      </ul>
    </>
  );
}
