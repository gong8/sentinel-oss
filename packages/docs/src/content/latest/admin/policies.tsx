import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminPoliciesContent() {
  return (
    <>
      <h1 id="managing-policies">Managing Policies</h1>
      <p className="lead text-xl text-muted-foreground">
        Define granular access rules to govern tool usage. Sentinel follows a "Fail-Closed"
        philosophy: every action is denied by default and requires an explicit ALLOW policy.
      </p>

      <h2 id="what-is-a-policy">What is a Policy?</h2>
      <p>
        A policy is a rule that binds a set of actors to a set of tools with a specific outcome.
        Each policy consists of:
      </p>
      <ul>
        <li>
          <strong>Matchers (Who):</strong> Identifies the users, roles, or agents this policy
          applies to.
        </li>
        <li>
          <strong>Tool Patterns (What):</strong> Defines the tools or servers covered by the policy
          using <code>server::tool</code> syntax.
        </li>
        <li>
          <strong>Effect (Action):</strong> Either <code>ALLOW</code> or <code>DENY</code>.
        </li>
        <li>
          <strong>Conditions (How):</strong> Optional deterministic rules (like time-of-day or
          parameter values) that must pass for the policy to match.
        </li>
      </ul>

      <h2 id="viewing-policies">Viewing Policies</h2>
      <p>
        Navigate to <strong>Policies</strong> in the admin sidebar. The policy list shows:
      </p>
      <ul>
        <li>
          <strong>Status:</strong> Whether the policy is currently Enabled or Disabled.
        </li>
        <li>
          <strong>Description:</strong> A human-readable summary of the rule.
        </li>
        <li>
          <strong>Matchers:</strong> The identities affected.
        </li>
        <li>
          <strong>Effect:</strong> The resulting action (ALLOW/DENY).
        </li>
      </ul>

      <h3 id="workspace-filtering">Workspace Filtering</h3>
      <p>
        Use the workspace filter dropdown to view policies scoped to a specific workspace. This
        helps manage policies in organizations with multiple teams or projects.
      </p>
      <ul>
        <li>
          <strong>All Workspaces:</strong> Shows all policies across the organization.
        </li>
        <li>
          <strong>Specific Workspace:</strong> Shows only policies created within that workspace.
        </li>
      </ul>

      <h3 id="inherited-policies">Inherited from Organization</h3>
      <p>When viewing a workspace, policies are grouped into two sections:</p>
      <ul>
        <li>
          <strong>Workspace Policies:</strong> Policies created specifically for this workspace.
        </li>
        <li>
          <strong>Inherited from Organization:</strong> Organization-level policies that apply to
          all workspaces. These policies cannot be edited from the workspace view—navigate to the
          organization level to modify them.
        </li>
      </ul>
      <Callout type="info" title="Policy Inheritance">
        Organization-level policies always apply alongside workspace-specific policies. Remember
        that DENY policies at any level will block access, even if a workspace policy allows it.
      </Callout>

      <h2 id="creating-a-policy">Creating a Policy</h2>

      <Steps>
        <Step number={1} title="Click Create Policy">
          <p>
            Click the <strong>Create Policy</strong> button.
          </p>
        </Step>

        <Step number={2} title="Define Matchers">
          <p>Specify who this policy applies to using the Matcher Builder:</p>
          <ul>
            <li>
              <code>*</code> - Matches everyone.
            </li>
            <li>
              <code>role:Name</code> - Matches users with a specific role.
            </li>
            <li>
              <code>user:email</code> - Matches a specific user.
            </li>
            <li>
              <code>agent:agentId</code> - Matches a specific MCP Agent.
            </li>
          </ul>
        </Step>

        <Step number={3} title="Define Tool Patterns">
          <p>Select which tools are governed by this rule:</p>
          <ul>
            <li>
              <code>*::*</code> - All tools on all servers.
            </li>
            <li>
              <code>servername::*</code> - All tools on a specific server.
            </li>
            <li>
              <code>servername::toolname</code> - A single specific tool.
            </li>
          </ul>
        </Step>

        <Step number={4} title="Set the Effect">
          <p>
            Choose <code>ALLOW</code> to permit the action or <code>DENY</code> to explicitly block
            it.
          </p>
        </Step>

        <Step number={5} title="Add Conditions (Optional)">
          <p>
            Add deterministic checks like <code>time.hourOfDay</code> or <code>params.query</code>{' '}
            to restrict usage even further.
          </p>
        </Step>

        <Step number={6} title="Save">
          <p>
            Click <strong>Create Policy</strong>. The rule is applied instantly to all incoming
            requests.
          </p>
        </Step>
      </Steps>

      <h2 id="precedence-rules">Precedence Rules</h2>
      <p>Sentinel handles policy conflicts with a simple, high-security logic:</p>

      <Callout type="danger" title="DENY always wins">
        If <strong>any</strong> matching policy has a <code>DENY</code> effect, the request is
        blocked immediately, even if multiple <code>ALLOW</code> policies also match.
      </Callout>

      <p>Evaluation flow:</p>
      <ol>
        <li>Gather all policies matching the user and tool.</li>
        <li>
          If any <code>DENY</code> policies match, return <strong>DENIED</strong>.
        </li>
        <li>
          If at least one <code>ALLOW</code> policy matches (and all its conditions pass), return{' '}
          <strong>ALLOWED</strong>.
        </li>
        <li>
          If no policies match, return <strong>DENIED</strong>.
        </li>
      </ol>

      <h2 id="conditions-note">A Note on Conditions</h2>
      <Callout type="warning" title="DENY Policies Have No Conditions">
        <strong>DENY</strong> policies do <em>not</em> support conditions. They always apply when
        the matcher and tool pattern match. Only <strong>ALLOW</strong> policies can have
        conditions.
      </Callout>
      <p>
        This design ensures that explicit denials cannot be accidentally bypassed by condition
        logic. If you need conditional denial, create a narrower DENY policy with more specific
        matchers or tool patterns.
      </p>

      <h3 id="condition-builder">The Condition Builder</h3>
      <p>
        When adding conditions to ALLOW policies, the Condition Builder provides a visual interface
        for creating rules. The builder dynamically adapts based on your selected tool patterns.
      </p>

      <h4>Dynamic Categories</h4>
      <p>
        The condition builder shows relevant field categories based on the tools you've selected:
      </p>
      <ul>
        <li>
          <strong>Time-based:</strong> Always available. Includes <code>time.hourOfDay</code>,{' '}
          <code>time.dayOfWeek</code>, and <code>time.timestamp</code>.
        </li>
        <li>
          <strong>Network:</strong> Always available. Includes <code>network.sourceIp</code> for
          IP-based restrictions.
        </li>
        <li>
          <strong>Tool Parameters:</strong> Populated from the JSON Schema of selected tools. Shows
          all available parameters with their types.
        </li>
        <li>
          <strong>Extracted Context:</strong> Shown for relevant tools. SQL tools show{' '}
          <code>sql.operation</code> and <code>sql.tables</code>. GitHub tools show{' '}
          <code>github.repository</code> and <code>github.branch</code>. File tools show{' '}
          <code>file.path</code> and <code>file.isSensitivePath</code>.
        </li>
      </ul>

      <h4>Nested Parameters</h4>
      <p>
        For tools with complex parameter schemas, the condition builder supports nested fields. If a
        tool parameter is an object with properties, you can drill down to create conditions on
        nested values:
      </p>
      <ul>
        <li>
          <code>params.data.content</code> - Access nested object properties
        </li>
        <li>
          <code>params.items[]</code> - Reference array elements
        </li>
        <li>
          <code>params.metadata.*</code> - Wildcard for dynamic keys
        </li>
      </ul>

      <h4>Parameter Suggestions</h4>
      <p>
        When entering values for conditions, the builder provides autocomplete suggestions based on
        historical parameter values. This is especially useful for:
      </p>
      <ul>
        <li>Finding valid IDs (page IDs, user IDs, repository names)</li>
        <li>Discovering common parameter values used across your organization</li>
        <li>
          Fuzzy matching - searching for "id" will show all ID-like parameters, and searching by
          display label (like "Applications Tracker") will return the corresponding ID value
        </li>
      </ul>

      <h4>Operators by Type</h4>
      <p>The available operators change based on the field type:</p>
      <ul>
        <li>
          <strong>Strings:</strong> equals, contains, startsWith, endsWith, matches (regex)
        </li>
        <li>
          <strong>Numbers:</strong> equals, lessThan, greaterThan, between
        </li>
        <li>
          <strong>Arrays:</strong> containsAny, containsNone, in, notIn
        </li>
        <li>
          <strong>Any:</strong> exists, notExists
        </li>
      </ul>

      <h2 id="policy-testing">Policy Testing</h2>
      <p>
        Policy testing is integrated directly into the policy creation and editing flow. When you
        create or modify a policy, Sentinel shows a live preview of how the policy will affect
        existing assertions.
      </p>

      <h3>Assertions Preview</h3>
      <p>
        As you configure a policy, the <strong>Assertions Preview</strong> panel shows which policy
        assertions will pass or fail with the current configuration. This immediate feedback helps
        you catch unintended consequences before saving.
      </p>
      <ul>
        <li>
          <strong>Passing Assertions:</strong> Green checkmarks indicate assertions that will
          continue to behave as expected.
        </li>
        <li>
          <strong>Failing Assertions:</strong> Red warnings highlight assertions that would break
          with the proposed changes.
        </li>
        <li>
          <strong>Affected Assertions:</strong> Only assertions relevant to the policy's matchers
          and tool patterns are shown.
        </li>
      </ul>

      <h3>Pre-Save Validation</h3>
      <p>
        Before saving a policy, review the assertions preview to ensure the change aligns with your
        security requirements. If any critical assertions fail, consider adjusting the policy
        configuration or updating the assertions if the new behavior is intentional.
      </p>

      <h2 id="conflict-detection">Conflict Detection</h2>
      <p>
        Sentinel automatically detects potential conflicts between policies. Navigate to{' '}
        <strong>Policies → Detect Conflicts</strong> to run the analysis.
      </p>

      <h3>Conflict Types</h3>
      <ul>
        <li>
          <strong>Contradiction (High Severity):</strong> A DENY and ALLOW policy overlap. The DENY
          will always win, potentially rendering the ALLOW useless.
        </li>
        <li>
          <strong>Overlap (Low Severity):</strong> Multiple policies of the same effect cover the
          same scope. This is redundant but not harmful.
        </li>
      </ul>

      <p>
        Conflict detection checks for overlapping <em>matchers</em> (who) and <em>tool patterns</em>{' '}
        (what). Two policies conflict if both could apply to the same request.
      </p>

      <h2 id="policy-assertions">Policy Assertions</h2>
      <p>
        Policy assertions are automated tests that verify your policies behave as expected. They run
        after policy changes and alert you if expected behaviors change.
      </p>

      <h3>Creating Assertions</h3>
      <p>
        Navigate to <strong>Policies → Assertions</strong> and click{' '}
        <strong>Create Assertion</strong>. Define:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> A descriptive name (e.g., "Engineers can access GitHub").
        </li>
        <li>
          <strong>Test Context:</strong> The user, agent, tool, and parameters to test.
        </li>
        <li>
          <strong>Expected Decision:</strong> Whether the request should be ALLOWED or DENIED.
        </li>
      </ul>

      <h3>Assertion Warnings</h3>
      <p>
        When you create or update a policy, Sentinel runs all affected assertions and shows warnings
        if any fail. This helps catch unintended side effects before they impact users.
      </p>

      <Callout type="warning" title="Non-Blocking">
        Assertion warnings do not prevent policy changes. They are advisory only. Review warnings
        carefully and update assertions if the new behavior is intentional.
      </Callout>

      <h2 id="approvals">A Note on Approvals</h2>
      <p>
        Notice that "Require Approval" is not an effect in the policy engine. Approvals are handled
        by <strong>Sensitive Flags</strong>, which are evaluated <em>after</em> the policy engine
        allows a request. This ensures that even permitted actions on high-risk tools require
        human-in-the-loop confirmation.
      </p>

      <h2 id="disabling-deleting">Disabling vs. Deleting</h2>
      <p>
        You can toggle the <strong>Enabled</strong> switch on a policy to temporarily pause its
        enforcement without losing its configuration. Deleting a policy is a soft-delete; it can be
        restored from the <strong>Deleted Items</strong> page if needed.
      </p>

      <h2 id="policy-exceptions">Policy Exceptions</h2>
      <p>
        Workspace admins can request exceptions to organization-wide DENY policies for their
        workspace. This allows granular flexibility while maintaining central security control.
      </p>

      <h3 id="when-to-request-exception">When to Request an Exception</h3>
      <p>
        Exception requests are appropriate when a global DENY policy blocks legitimate work in a
        specific workspace. For example:
      </p>
      <ul>
        <li>
          A security team creates an org-wide policy blocking <code>DELETE</code> operations on
          production databases.
        </li>
        <li>
          A data migration workspace needs temporary <code>DELETE</code> access to clean up legacy
          records.
        </li>
        <li>The workspace admin requests an exception, providing business justification.</li>
      </ul>

      <h3 id="creating-exception-request">Creating an Exception Request</h3>
      <Steps>
        <Step number={1} title="Navigate to Workspace Settings">
          <p>
            Go to <strong>Workspaces</strong> and select the workspace that needs the exception.
          </p>
        </Step>

        <Step number={2} title="Find the Blocking Policy">
          <p>
            In the Policy Exceptions section, you will see org-wide DENY policies that affect this
            workspace. Click <strong>Request Exception</strong> on the relevant policy.
          </p>
        </Step>

        <Step number={3} title="Provide Justification">
          <p>
            Enter a detailed justification (minimum 10 characters) explaining why this workspace
            needs an exception to the global policy. Include:
          </p>
          <ul>
            <li>The business need driving the request</li>
            <li>Why the global policy is blocking legitimate work</li>
            <li>Any mitigating controls in place</li>
          </ul>
        </Step>

        <Step number={4} title="Submit for Review">
          <p>
            Click <strong>Submit Request</strong>. Organization owners will be notified of the
            pending exception request.
          </p>
        </Step>
      </Steps>

      <h3 id="exception-request-types">Exception Request Types</h3>
      <ul>
        <li>
          <strong>Workspace Exception:</strong> Request an exception to a global DENY policy for
          your specific workspace only. The global policy remains in effect for all other
          workspaces.
        </li>
        <li>
          <strong>Policy Removal:</strong> Request that an org-wide policy be removed entirely. This
          affects all workspaces and requires stronger justification.
        </li>
      </ul>

      <Callout type="info" title="Workspace Scope">
        Workspace exceptions only affect the requesting workspace. Other workspaces continue to be
        governed by the original global policy.
      </Callout>

      <h3 id="exception-lifecycle">Exception Request Lifecycle</h3>
      <p>Exception requests go through the following statuses:</p>
      <ul>
        <li>
          <strong>PENDING:</strong> The request is awaiting review by an organization owner.
        </li>
        <li>
          <strong>APPROVED:</strong> The exception has been granted. A workspace-level ALLOW policy
          is created automatically.
        </li>
        <li>
          <strong>DENIED:</strong> The request was rejected. The reviewer may provide a note
          explaining the decision.
        </li>
        <li>
          <strong>WITHDRAWN:</strong> The requester cancelled the request before it was reviewed.
        </li>
      </ul>

      <h3 id="withdrawing-requests">Withdrawing Requests</h3>
      <p>
        You can withdraw your own pending exception requests at any time. Navigate to your
        workspace's exception requests and click <strong>Withdraw</strong> on any pending request.
      </p>

      <h2 id="policy-proposals">Policy Proposals</h2>
      <p>
        Workspace admins can propose new organization-wide policies. This enables bottom-up security
        improvements while maintaining central governance.
      </p>

      <h3 id="creating-proposal">Creating a Policy Proposal</h3>
      <Steps>
        <Step number={1} title="Navigate to Policy Proposals">
          <p>
            Go to <strong>Policies</strong> and click <strong>Propose New Policy</strong>.
          </p>
        </Step>

        <Step number={2} title="Define the Policy">
          <p>Configure the proposed policy just like a regular policy:</p>
          <ul>
            <li>
              <strong>Matchers:</strong> Who the policy should apply to.
            </li>
            <li>
              <strong>Tool Patterns:</strong> Which tools should be covered.
            </li>
            <li>
              <strong>Effect:</strong> ALLOW or DENY.
            </li>
            <li>
              <strong>Description:</strong> Clear explanation of what the policy does.
            </li>
          </ul>
        </Step>

        <Step number={3} title="Provide Justification">
          <p>
            Explain why this policy should be adopted organization-wide. Include the security
            benefit or business need driving the proposal.
          </p>
        </Step>

        <Step number={4} title="Submit for Review">
          <p>
            Click <strong>Submit Proposal</strong>. Organization owners will review and either
            approve (creating the actual policy) or reject with feedback.
          </p>
        </Step>
      </Steps>

      <h3 id="proposal-review">Proposal Review (Org Owners)</h3>
      <p>
        Organization owners see all pending policy proposals in the{' '}
        <strong>Policies → Proposals</strong> section. When reviewing:
      </p>
      <ul>
        <li>
          <strong>Approve:</strong> Creates the actual org-wide policy with the proposed
          configuration. You can optionally add a review note.
        </li>
        <li>
          <strong>Reject:</strong> Declines the proposal. A review note is required to explain the
          decision.
        </li>
      </ul>

      <Callout type="warning" title="Audit Trail">
        All exception requests and policy proposals are logged in the Admin Action Log, including
        who requested, who reviewed, and the decision made.
      </Callout>
    </>
  );
}
