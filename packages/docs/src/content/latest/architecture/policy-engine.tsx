import { CodeBlock } from '../../../components/CodeBlock';

export default function PolicyEngineDocs() {
  return (
    <>
      <h1 id="policy-engine">Policy Engine Architecture</h1>
      <p className="lead text-xl text-muted-foreground">
        The heart of SENTINEL is its Policy Engine, a deterministic system that evaluates every tool
        call against a set of hierarchical rules.
      </p>

      <h2 id="evaluation-model">Evaluation Model</h2>
      <p>
        The Policy Engine follows a strict <strong>Fail-Closed</strong> evaluation model. When a
        request comes in, the engine collects all applicable policies and evaluates them.
      </p>

      <div className="my-6 p-4 bg-muted/30 rounded-lg">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          The Decision Flow
        </h3>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            <strong>Gather Policies:</strong> Fetch all active policies that match the Principal
            (User/Role).
          </li>
          <li>
            <strong>Check DENY Rules:</strong> If <em>any</em> matching rule has a DENY effect, the
            request is blocked immediately.
          </li>
          <li>
            <strong>Check ALLOW Rules:</strong> If an ALLOW rule matches <em>and</em> all its
            conditions pass, the request is permitted.
          </li>
          <li>
            <strong>Default Fallback:</strong> If no rules match (or no ALLOW conditions pass), the
            request is <strong>DENIED</strong>.
          </li>
          <li>
            <strong>Sensitive Flags Check:</strong> After a request is ALLOWED, check if the tool is
            marked as Sensitive. If so, apply additional behaviors:
            <ul className="ml-6 mt-2 list-disc">
              <li>
                <code>REQUIRE_APPROVAL</code> - Pauses execution until a human approves the action
              </li>
              <li>
                <code>RATE_LIMIT</code> - Enforces call frequency limits per user/agent
              </li>
              <li>
                <code>ALERT</code> - Triggers webhook notifications to configured endpoints
              </li>
              <li>
                <code>ENHANCED_AUDIT</code> - Always-on detailed logging with full request/response
                capture
              </li>
            </ul>
          </li>
        </ol>
      </div>

      <h2 id="policy-anatomy">Anatomy of a Policy</h2>
      <p>A Policy is a single, atomic rule stored in the database.</p>

      <h3>Matchers (The "Who")</h3>
      <p>Matchers are strings that identify the principal.</p>
      <ul>
        <li>
          <code>role:admin</code> - Matches users with the 'admin' role.
        </li>
        <li>
          <code>user:alice@corp.com</code> - Matches a specific user.
        </li>
        <li>
          <code>workspace:workspaceId</code> - Matches all members of a workspace.
        </li>
        <li>
          <code>workspace-admin:workspaceId</code> - Matches only admins of a workspace.
        </li>
        <li>
          <code>*</code> - Matches everyone.
        </li>
      </ul>

      <h3>Conditions (The "Fine Print")</h3>
      <p>
        ALLOW policies can have a list of <strong>Conditions</strong> that must all pass. These are
        JSON objects defining deterministic checks.
      </p>

      <CodeBlock language="typescript" filename="Evaluation Logic">
        {`// Conceptual logic
function evaluateConditions(context, conditions) {
  for (const condition of conditions) {
    // Extract value (e.g., from params.query)
    const actual = extractValue(context, condition.field);
    
    // Check against operator (e.g., "contains", "inCidr")
    if (!checkOperator(actual, condition.operator, condition.value)) {
      return false; // Condition failed
    }
  }
  return true; // All passed
}`}
      </CodeBlock>

      <h2 id="resolution-precedence">Resolution Precedence</h2>
      <p>Conflict resolution is handled with clear priority:</p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Decision</th>
              <th className="text-left py-2">Priority</th>
              <th className="text-left py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-red-50/50 dark:bg-red-950/20">
              <td className="py-2 font-mono text-red-600">DENIED</td>
              <td className="py-2">Highest</td>
              <td>
                Blocks immediately. DENY policies cannot have conditions - they always apply when
                matcher and tool pattern match.
              </td>
            </tr>
            <tr className="border-b bg-green-50/50 dark:bg-green-950/20">
              <td className="py-2 font-mono text-green-600">ALLOWED</td>
              <td className="py-2">Lowest</td>
              <td>Permits execution only if no DENY rules match.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="delegation-mode">Delegation Mode</h2>
      <p>
        When an agent acts on behalf of a user (delegation), both the agent AND the delegated user
        must have permission. This uses AND logic:
      </p>
      <ul>
        <li>
          The agent must match via agent matchers (e.g., <code>agent:agentId</code>)
        </li>
        <li>
          The delegated user must match via user/role matchers (e.g., <code>user:email</code> or{' '}
          <code>role:name</code>)
        </li>
        <li>If either party is denied, the request is denied</li>
        <li>Both parties must have at least one matching ALLOW policy</li>
      </ul>
      <p>
        This ensures that agents cannot exceed the permissions of the user they represent, and users
        cannot grant agents more access than the agents are permitted.
      </p>

      <h3>A2A (Agent-to-Agent) Delegation</h3>
      <p>
        For agent-to-agent communication, SENTINEL uses a special tool pattern format to identify
        delegated skills:
      </p>
      <CodeBlock language="text" filename="A2A Tool Pattern Format">
        {`a2a::agentId::skillId`}
      </CodeBlock>
      <p>This format allows policies to be scoped to specific agent skills. For example:</p>
      <ul>
        <li>
          <code>a2a::*::*</code> - Matches all A2A delegations
        </li>
        <li>
          <code>a2a::code-assistant::*</code> - Matches all skills from the code-assistant agent
        </li>
        <li>
          <code>a2a::code-assistant::review</code> - Matches only the review skill from
          code-assistant
        </li>
      </ul>
    </>
  );
}
