import { Callout } from '../../../components/Callout';

export default function AuditLoggingDocs() {
  return (
    <>
      <h1 id="audit-logging">Audit Logging & Compliance</h1>
      <p className="lead text-xl text-muted-foreground">
        SENTINEL treats the Audit Log as a source of truth. Every decision made by the system is
        recorded immutably, providing a complete forensic trail of AI activity.
      </p>

      <h2 id="what-is-logged">What is Logged?</h2>
      <p>
        An audit entry is created for every single tool invocation attempt, regardless of whether it
        was allowed, denied, or failed.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        <div className="p-4 border rounded bg-card">
          <h3 className="font-semibold mb-2">Identity Context</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            <li>User ID & Organization ID</li>
            <li>Agent/Client Name</li>
            <li>Impersonation context (if acting on behalf)</li>
          </ul>
        </div>

        <div className="p-4 border rounded bg-card">
          <h3 className="font-semibold mb-2">Action Details</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            <li>Tool Name & Server</li>
            <li>Full Arguments/Parameters</li>
            <li>Timestamp (UTC)</li>
          </ul>
        </div>

        <div className="p-4 border rounded bg-card">
          <h3 className="font-semibold mb-2">Decision Result</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            <li>Outcome (ALLOWED, DENIED)</li>
            <li>Policy ID that triggered the decision</li>
            <li>
              <code>pipelineStage</code> - Which stage of evaluation (e.g., DENY_CHECK, ALLOW_CHECK,
              SENSITIVE_CHECK)
            </li>
            <li>
              <code>interruptedAt</code> - If evaluation was interrupted (e.g., pending approval)
            </li>
            <li>
              <code>evaluationTree</code> - Full tree visualization of policy evaluation showing
              which policies matched and why
            </li>
          </ul>
        </div>
      </div>

      <h3 id="workspace-filtering">Workspace-Scoped Filtering</h3>
      <p>
        Audit logs can be filtered by workspace, allowing workspace admins to view only the activity
        within their scope. This ensures proper access control while maintaining a complete audit
        trail at the organization level.
      </p>

      <h3 id="approval-tracking">Approval Tracking (for Sensitive Tools)</h3>
      <p>When a tool invocation requires approval, additional fields are logged:</p>
      <ul>
        <li>
          <code>approvalRequired</code> - Boolean indicating approval was needed
        </li>
        <li>
          <code>approvalRequestId</code> - Reference to the approval request
        </li>
        <li>
          <code>approvalStatus</code> - APPROVED, DENIED, EXPIRED, or CANCELLED
        </li>
        <li>
          <code>approvalDecidedBy</code> - User who made the approval decision
        </li>
        <li>
          <code>approvalDecidedAt</code> - Timestamp of the approval decision
        </li>
      </ul>

      <h2 id="snapshotting">Policy Snapshotting</h2>
      <p>
        A critical feature of SENTINEL's audit system is <strong>Policy Snapshotting</strong>.
      </p>
      <p>
        When an action is evaluated, the system doesn't just record "Policy #123 allowed this." It
        records a snapshot of <em>what Policy #123 looked like at that exact moment</em>. This
        prevents historical rewriting: if an admin changes a policy today, it does not invalidate or
        confuse the audit logs from yesterday.
      </p>

      <Callout type="info" title="Compliance Ready">
        These logs are designed to meet requirements for SOC2, HIPAA, and ISO 27001 compliance,
        ensuring you can always answer "Who did what, when, and why?"
      </Callout>

      <h2 id="admin-action-logging">Admin Action Logging</h2>
      <p>
        In addition to tool invocation logs, SENTINEL maintains a separate{' '}
        <strong>AdminActionLog</strong> for administrative operations. This provides a complete
        audit trail for:
      </p>
      <ul>
        <li>Policy changes (create, update, delete)</li>
        <li>User and role management</li>
        <li>Credential management</li>
        <li>Session terminations</li>
        <li>Configuration changes</li>
      </ul>
      <p>
        This separation ensures that admin activities are tracked independently from AI agent
        activities, enabling proper oversight of both operational and administrative actions.
      </p>

      <h2 id="data-retention">Data Retention & Security</h2>
      <p>Audit logs are stored in the primary PostgreSQL database.</p>
      <ul>
        <li>
          <strong>Immutability:</strong> The API provides no endpoints to delete or modify audit
          logs. Deletion is only possible via direct database access, which should be restricted.
        </li>
        <li>
          <strong>Redaction:</strong> Sensitive parameters (like passwords or API keys) detected in
          tool arguments are automatically redacted before storage if they match known patterns,
          though we recommend handling secrets via the Credential Manager instead of passing them as
          arguments.
        </li>
      </ul>
    </>
  );
}
