import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminOrganizationContent() {
  return (
    <>
      <h1 id="organization-management">Organization Management</h1>
      <p className="lead text-xl text-muted-foreground">
        Configure organization-wide settings, manage ownership, and handle administrative transfers.
      </p>

      <h2 id="organization-settings">Organization Settings</h2>
      <p>
        Organization settings control default behaviors across your entire Sentinel deployment.
        Navigate to <strong>Settings</strong> in the admin sidebar to configure these options.
      </p>

      <h3>Available Settings</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Setting</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-left">Default</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">defaultTimezone</td>
            <td className="p-2">Default timezone for displaying timestamps in the dashboard.</td>
            <td className="p-2">UTC</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">paramHistoryRetentionDays</td>
            <td className="p-2">
              How long to retain parameter history for tool calls. Range: 1-365 days.
            </td>
            <td className="p-2">30 days</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">auditLogRetentionDays</td>
            <td className="p-2">
              How long to retain audit logs. Set to 0 for indefinite retention. Max: 10 years.
            </td>
            <td className="p-2">0 (indefinite)</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">defaultConditionMode</td>
            <td className="p-2">Default mode for policy conditions: SIMPLE or ADVANCED.</td>
            <td className="p-2">SIMPLE</td>
          </tr>
        </tbody>
      </table>

      <h2 id="organization-owners">Organization Owners</h2>
      <p>
        Organization owners have elevated privileges beyond regular administrators. They can manage
        other owners, handle ownership transfers, and make critical organizational decisions.
      </p>

      <Callout type="warning" title="Owner Privileges">
        Organization owners can add or remove other owners. This is a significant privilege - assign
        ownership carefully.
      </Callout>

      <h3>Viewing Owners</h3>
      <p>
        The owners list shows all users with organization owner status, including when they were
        added and who granted them ownership.
      </p>

      <h3>Adding an Owner</h3>
      <Steps>
        <Step number={1} title="Navigate to Owners">
          <p>
            Go to <strong>Settings &gt; Organization Owners</strong>.
          </p>
        </Step>

        <Step number={2} title="Select User">
          <p>
            Click <strong>Add Owner</strong> and select an existing user from your organization.
          </p>
        </Step>

        <Step number={3} title="Confirm">
          <p>Review the selection and confirm. The user immediately gains owner privileges.</p>
        </Step>
      </Steps>

      <h3>Removing an Owner</h3>
      <p>Owners can remove other owners with these restrictions:</p>
      <ul>
        <li>
          <strong>Cannot remove yourself:</strong> You must ask another owner to remove your
          ownership.
        </li>
        <li>
          <strong>Must keep at least one owner:</strong> The last remaining owner cannot be removed.
        </li>
      </ul>

      <Callout type="info" title="Audit Trail">
        All owner additions and removals are logged in the admin action log with full details of who
        made the change.
      </Callout>

      <h2 id="ownership-transfer">Ownership Transfer</h2>
      <p>
        Ownership transfers allow current owners to grant ownership to other users through a secure
        two-step workflow. This is useful for onboarding new administrators or transitioning
        responsibilities.
      </p>

      <h3>Transfer Workflow</h3>
      <div className="border p-4 rounded-lg bg-card my-4">
        <ol className="list-decimal pl-4 space-y-2">
          <li>
            <strong>Initiate:</strong> An owner starts a transfer to a target user.
          </li>
          <li>
            <strong>Pending:</strong> The transfer waits for the recipient to respond.
          </li>
          <li>
            <strong>Resolution:</strong> The recipient accepts or declines, or the initiator
            cancels.
          </li>
        </ol>
      </div>

      <h3>Initiating a Transfer</h3>
      <Steps>
        <Step number={1} title="Select Recipient">
          <p>Choose a user from your organization who is not already an owner.</p>
        </Step>

        <Step number={2} title="Send Transfer">
          <p>
            Click <strong>Initiate Transfer</strong>. The target user will see the pending transfer
            in their dashboard.
          </p>
        </Step>
      </Steps>

      <h3>Responding to a Transfer</h3>
      <p>As the recipient of an ownership transfer, you can:</p>
      <ul>
        <li>
          <strong>Accept:</strong> Gain organization owner status immediately.
        </li>
        <li>
          <strong>Decline:</strong> Reject the transfer without becoming an owner.
        </li>
      </ul>

      <h3>Canceling a Transfer</h3>
      <p>
        The initiating owner can cancel a pending transfer at any time before it is accepted or
        declined. Canceled transfers cannot be reopened.
      </p>

      <Callout type="info" title="Transfer Expiration">
        Ownership transfers have an expiration time. If not accepted or declined before expiry, the
        transfer automatically becomes invalid.
      </Callout>

      <h3>Transfer Status Reference</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">PENDING</td>
            <td className="p-2">Waiting for the recipient to accept or decline.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">ACCEPTED</td>
            <td className="p-2">The recipient accepted and is now an owner.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">DECLINED</td>
            <td className="p-2">The recipient declined the transfer.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">CANCELLED</td>
            <td className="p-2">The initiator cancelled the transfer.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">EXPIRED</td>
            <td className="p-2">The transfer expired before being resolved.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="owner-recovery">Owner Recovery</h2>
      <p>
        Owner recovery is an emergency process for regaining administrative access when all
        organization owners are unavailable. This is typically initiated through support channels.
      </p>

      <Callout type="warning" title="Support Process">
        Owner recovery requires identity verification and cannot be initiated directly through the
        dashboard. Contact Sentinel support to begin the process.
      </Callout>

      <h3>Recovery Request Workflow</h3>
      <div className="border p-4 rounded-lg bg-card my-4">
        <ol className="list-decimal pl-4 space-y-2">
          <li>
            <strong>Request:</strong> An administrator creates a recovery request with
            justification.
          </li>
          <li>
            <strong>Verification:</strong> Support verifies the requester's identity and authority.
          </li>
          <li>
            <strong>Review:</strong> Existing owners (if any) can deny the request.
          </li>
          <li>
            <strong>Execution:</strong> If approved, the target user receives owner status.
          </li>
        </ol>
      </div>

      <h3>Recovery Request Details</h3>
      <p>A recovery request includes:</p>
      <ul>
        <li>
          <strong>Requester Email:</strong> Who is requesting the recovery.
        </li>
        <li>
          <strong>Target User Email:</strong> Who should receive ownership.
        </li>
        <li>
          <strong>Reason:</strong> Justification for the recovery (minimum 10 characters).
        </li>
        <li>
          <strong>Support Ticket ID:</strong> Optional reference to a support ticket.
        </li>
      </ul>

      <h3>Denying a Recovery Request</h3>
      <p>
        Existing organization owners can deny pending recovery requests. This is a safeguard against
        unauthorized access attempts.
      </p>

      <h3>Recovery Status Reference</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">PENDING</td>
            <td className="p-2">Request is awaiting verification and approval.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">APPROVED</td>
            <td className="p-2">Request was approved and ownership was granted.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">DENIED</td>
            <td className="p-2">Request was denied by an existing owner.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">CANCELLED</td>
            <td className="p-2">Request was cancelled by the administrator.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">EXPIRED</td>
            <td className="p-2">Request expired before being resolved.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="api-reference">API Reference</h2>
      <p>
        The following tRPC procedures are available for organization management. All procedures
        require admin or owner authentication.
      </p>

      <h3>Organization Settings</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.orgSettings.get</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get current organization settings.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.orgSettings.update</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Update organization settings.</td>
          </tr>
        </tbody>
      </table>

      <h3>Organization Owners</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.orgOwners.list</td>
            <td className="p-2">Query</td>
            <td className="p-2">List all organization owners.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.orgOwners.add</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Add a user as an organization owner.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.orgOwners.remove</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Remove a user from organization owners.</td>
          </tr>
        </tbody>
      </table>

      <h3>Ownership Transfer</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.initiate</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Start a transfer to another user (owner only).</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.accept</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Accept a pending ownership transfer.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.decline</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Decline a pending ownership transfer.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.cancel</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Cancel a transfer you initiated (owner only).</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.getPendingIncoming</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get transfers you have received.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownershipTransfer.getPendingOutgoing</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get transfers you have initiated (owner only).</td>
          </tr>
        </tbody>
      </table>

      <h3>Owner Recovery</h3>
      <table className="w-full text-sm my-6 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Procedure</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownerRecovery.create</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Create a recovery request.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownerRecovery.get</td>
            <td className="p-2">Query</td>
            <td className="p-2">Get a recovery request by ID.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownerRecovery.list</td>
            <td className="p-2">Query</td>
            <td className="p-2">List recovery requests with optional status filter.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownerRecovery.cancel</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Cancel a pending recovery request.</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">admin.ownerRecovery.deny</td>
            <td className="p-2">Mutation</td>
            <td className="p-2">Deny a recovery request (owner only).</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
