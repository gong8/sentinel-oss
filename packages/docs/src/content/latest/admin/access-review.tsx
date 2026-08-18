import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminAccessReviewContent() {
  return (
    <>
      <h1 id="access-review">Access Review</h1>
      <p className="lead text-xl text-muted-foreground">
        Conduct periodic access reviews for SOC2 compliance. Generate reports showing who has access
        to what resources across your organization.
      </p>

      <h2 id="what-is-access-review">What is Access Review?</h2>
      <p>
        Access review is a compliance process that helps organizations verify that users have
        appropriate access to resources. SENTINEL provides built-in reporting to support:
      </p>
      <ul>
        <li>
          <strong>SOC2 Compliance:</strong> Demonstrate that access controls are regularly reviewed
          and appropriate.
        </li>
        <li>
          <strong>Audit Readiness:</strong> Generate on-demand reports for auditors.
        </li>
        <li>
          <strong>Security Hygiene:</strong> Identify stale permissions or over-provisioned users.
        </li>
      </ul>

      <h2 id="generating-reports">Generating Access Review Reports</h2>
      <Steps>
        <Step number={1} title="Navigate to Access Review">
          <p>
            From the Admin Dashboard, go to <strong>Settings → Access Review</strong>.
          </p>
        </Step>

        <Step number={2} title="Review Current State">
          <p>
            The Access Review page displays a comprehensive view of access across your organization:
          </p>
          <ul>
            <li>Users and their assigned roles</li>
            <li>Workspaces and their members</li>
            <li>Policies and their effective permissions</li>
            <li>MCP servers and tool access</li>
          </ul>
        </Step>

        <Step number={3} title="Export Report">
          <p>Click one of the export options:</p>
          <ul>
            <li>
              <strong>Export CSV:</strong> Spreadsheet format for analysis in Excel or Google
              Sheets.
            </li>
            <li>
              <strong>Export JSON:</strong> Structured data format for programmatic processing.
            </li>
          </ul>
        </Step>
      </Steps>

      <h2 id="report-contents">Report Contents</h2>
      <p>The access review report includes:</p>

      <h3 id="user-access">User Access Summary</h3>
      <ul>
        <li>User email and name</li>
        <li>Assigned roles</li>
        <li>Workspace memberships</li>
        <li>Admin privileges (organization owner, workspace admin)</li>
        <li>Last activity timestamp</li>
      </ul>

      <h3 id="policy-summary">Policy Summary</h3>
      <ul>
        <li>Active policies and their effects</li>
        <li>Matchers (who is affected)</li>
        <li>Tool patterns (what resources are covered)</li>
        <li>Any conditions or restrictions</li>
      </ul>

      <h3 id="server-access">Server & Tool Access</h3>
      <ul>
        <li>MCP servers and their tools</li>
        <li>Which policies grant or deny access</li>
        <li>Sensitive flag status</li>
      </ul>

      <Callout type="info" title="Point-in-Time Snapshot">
        Access review reports capture the current state at the time of export. For historical
        comparison, archive previous reports or use the audit log for change history.
      </Callout>

      <h2 id="compliance-workflow">Compliance Workflow</h2>
      <p>For SOC2 and other compliance frameworks, follow this recommended workflow:</p>

      <h3>Quarterly Review</h3>
      <ol>
        <li>
          <strong>Generate Report:</strong> Export the access review at the start of each quarter.
        </li>
        <li>
          <strong>Review with Stakeholders:</strong> Share with team leads to verify their team's
          access is appropriate.
        </li>
        <li>
          <strong>Document Findings:</strong> Note any access that needs to be revoked or modified.
        </li>
        <li>
          <strong>Remediate:</strong> Update policies, roles, or user assignments as needed.
        </li>
        <li>
          <strong>Archive:</strong> Store the report as evidence of the review.
        </li>
      </ol>

      <h3>Annual Audit Support</h3>
      <p>When preparing for SOC2 audits:</p>
      <ul>
        <li>Provide historical access review reports showing regular reviews</li>
        <li>Export current state for auditor verification</li>
        <li>Reference the Admin Action Log for change history</li>
      </ul>

      <Callout type="warning" title="Retention">
        SENTINEL does not automatically archive access review reports. Export and store reports in
        your organization's document management system for compliance record-keeping.
      </Callout>

      <h2 id="best-practices">Best Practices</h2>
      <ul>
        <li>
          <strong>Regular Schedule:</strong> Set a recurring calendar reminder for access reviews
          (quarterly is common for SOC2).
        </li>
        <li>
          <strong>Delegation:</strong> Have workspace admins review their own workspace's access and
          report findings.
        </li>
        <li>
          <strong>Least Privilege:</strong> Use the report to identify users with more access than
          needed and tighten permissions.
        </li>
        <li>
          <strong>Offboarding Verification:</strong> After employee departures, generate a report to
          confirm access was revoked.
        </li>
      </ul>
    </>
  );
}
