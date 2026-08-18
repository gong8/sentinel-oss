import { Callout } from '../../../components/Callout';
import { CodeBlock } from '../../../components/CodeBlock';

export default function ReferencePolicySyntaxContent() {
  return (
    <>
      <h1 id="policy-syntax">Policy Syntax Reference</h1>
      <p className="lead text-xl text-muted-foreground">
        Technical reference for SENTINEL's policy data model. Policies are stored as structured
        objects in the database, typically managed via the Admin Dashboard.
      </p>

      <h2 id="policy-structure">Policy Structure</h2>
      <p>
        A Policy is a flat object containing matchers (Who), tool patterns (What), an effect
        (Allow/Deny), and optional conditions (When/How).
      </p>

      <div className="my-6">
        <h3 className="text-lg font-semibold">Core Fields</h3>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>
            <strong>slug</strong>: Unique identifier (e.g., <code>allow-engineers-github</code>).
          </li>
          <li>
            <strong>matchers</strong>: Array of strings defining who this policy applies to.
          </li>
          <li>
            <strong>toolPatterns</strong>: Array of strings defining which tools are covered.
          </li>
          <li>
            <strong>effect</strong>: <code>ALLOW</code> or <code>DENY</code>.
          </li>
          <li>
            <strong>conditions</strong>: (Optional) JSON array of deterministic rules.
          </li>
        </ul>
      </div>

      <h2 id="matchers">Matchers (The "Who")</h2>
      <p>
        Matchers are simple strings that identify the principal. A policy matches if <em>any</em> of
        its matchers apply to the user/agent.
      </p>

      <table className="w-full text-sm my-4 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Format</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-left">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2 font-mono">role:Name</td>
            <td className="p-2">Matches users with a specific role.</td>
            <td className="p-2 font-mono">role:Engineering</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">user:Email</td>
            <td className="p-2">Matches a specific user by email.</td>
            <td className="p-2 font-mono">user:alice@corp.com</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">agent:ID</td>
            <td className="p-2">Matches a specific MCP Agent ID.</td>
            <td className="p-2 font-mono">agent:claude-desktop</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">role:*</td>
            <td className="p-2">Matches users with any role assigned.</td>
            <td className="p-2 font-mono">role:*</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">user:*</td>
            <td className="p-2">Matches any authenticated user.</td>
            <td className="p-2 font-mono">user:*</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">agent:*</td>
            <td className="p-2">Matches any MCP agent.</td>
            <td className="p-2 font-mono">agent:*</td>
          </tr>
          <tr className="border-t">
            <td className="p-2 font-mono">*</td>
            <td className="p-2">Wildcard. Matches everyone.</td>
            <td className="p-2 font-mono">*</td>
          </tr>
        </tbody>
      </table>

      <h2 id="tool-patterns">Tool Patterns (The "What")</h2>
      <p>Tool patterns identify the resource. The format depends on the protocol (MCP vs A2A).</p>

      <h3 className="text-lg font-semibold mt-4">MCP Tools</h3>
      <p>
        Format: <code>hostname[:port]::toolName</code>
      </p>
      <ul className="list-disc list-inside mt-2 space-y-1 font-mono text-sm">
        <li>github.com::create_issue - Single tool on a server</li>
        <li>localhost:3012::submit_backtest - Server with explicit port</li>
        <li>github.com::* - All tools on a server</li>
        <li>*::* - All tools on all servers</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4">A2A Agents</h3>
      <p>
        Format: <code>a2a::agentId::skillId</code>
      </p>
      <ul className="list-disc list-inside mt-2 space-y-1 font-mono text-sm">
        <li>a2a::claude-desktop::analyze - Single agent skill</li>
        <li>a2a::claude-desktop::* - All skills from an agent</li>
        <li>a2a::*::* - All skills on all A2A agents</li>
      </ul>

      <h2 id="conditions">Conditions (The "Fine Print")</h2>
      <Callout type="warning" title="ALLOW Policies Only">
        Conditions only apply to <strong>ALLOW</strong> policies. DENY policies always apply when
        the matcher and tool pattern match - they cannot be conditionally bypassed.
      </Callout>
      <p>
        Conditions are a JSON array. All conditions in the array must pass (AND logic) for the
        policy to match.
      </p>

      <CodeBlock language="json" filename="Condition Structure">
        {`[
  {
    "field": "time.hourOfDay",
    "operator": "between",
    "value": [9, 17]
  },
  {
    "field": "network.sourceIp",
    "operator": "inCidr",
    "value": "10.0.0.0/8"
  }
]`}
      </CodeBlock>

      <h3 className="mt-4">Available Categories</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border p-4 rounded">
          <strong className="block mb-2">Time & Network</strong>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>
              <code>time.hourOfDay</code> (0-23)
            </li>
            <li>
              <code>time.dayOfWeek</code> (0=Sun, 6=Sat)
            </li>
            <li>
              <code>network.sourceIp</code>
            </li>
          </ul>
        </div>
        <div className="border p-4 rounded">
          <strong className="block mb-2">Parameters</strong>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>
              <code>params.query</code>
            </li>
            <li>
              <code>params.path</code>
            </li>
            <li>(Any tool argument)</li>
          </ul>
        </div>
        <div className="border p-4 rounded">
          <strong className="block mb-2">Extracted Context</strong>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>
              <code>sql.operation</code> (SELECT, DROP...)
            </li>
            <li>
              <code>github.repository</code>
            </li>
            <li>
              <code>file.isSensitivePath</code>
            </li>
          </ul>
        </div>
      </div>

      <h3 className="mt-4">Operators</h3>
      <div className="flex flex-wrap gap-2 mt-2">
        {[
          'equals',
          'notEquals',
          'contains',
          'notContains',
          'startsWith',
          'endsWith',
          'matches',
          'in',
          'notIn',
          'containsAny',
          'containsNone',
          'greaterThan',
          'lessThan',
          'between',
          'inCidr',
          'notInCidr',
          'exists',
          'notExists',
        ].map((op) => (
          <span key={op} className="bg-muted px-2 py-1 rounded text-xs font-mono">
            {op}
          </span>
        ))}
      </div>

      <h2 id="approvals">A Note on Approvals</h2>
      <Callout type="warning" title="Not a Policy Effect">
        Unlike some systems, <strong>Approval is NOT a Policy Effect</strong> in SENTINEL.
      </Callout>
      <p>
        Policies only determine <code>ALLOW</code> or <code>DENY</code>.
      </p>
      <p>
        <strong>Approvals</strong> are handled by <strong>Sensitive Flags</strong>. If you want to
        require approval for "Deploy to Prod", you mark that tool pattern as Sensitive with the{' '}
        <code>REQUIRE_APPROVAL</code> behavior. This check happens <em>after</em> the policy engine
        allows the request.
      </p>

      <h2 id="advanced-conditions">Advanced Conditions</h2>
      <p>
        For complex policy rules, SENTINEL supports an advanced expression syntax that provides
        SQL-like capabilities. Advanced conditions enable boolean logic, nested comparisons, and
        function calls.
      </p>

      <h3 id="advanced-expression-syntax">Expression Syntax</h3>
      <p>
        Advanced conditions are written as string expressions rather than JSON arrays. The syntax
        supports:
      </p>

      <CodeBlock language="sql" filename="Advanced Condition Examples">
        {`-- Boolean operators
params.readOnly = true AND time.hourOfDay >= 9

-- OR conditions (not possible with simple conditions)
params.action = 'read' OR params.action = 'list'

-- Parentheses for grouping
(params.env = 'staging' OR params.env = 'dev') AND network.sourceIp LIKE '10.%'

-- NOT operator
NOT params.isDestructive

-- String matching
params.query CONTAINS 'SELECT' AND NOT params.query CONTAINS 'DROP'

-- Array operations
'admin' IN params.requiredRoles
params.tables CONTAINS_ANY ['users', 'accounts']`}
      </CodeBlock>

      <h3 id="advanced-operators">Supported Operators</h3>
      <table className="w-full text-sm my-4 border rounded-lg overflow-hidden">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Category</th>
            <th className="p-2 text-left">Operators</th>
            <th className="p-2 text-left">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-2">Comparison</td>
            <td className="p-2 font-mono">
              =, !=, {'<'}, {'>'}, {'<'}=, {'>'}=
            </td>
            <td className="p-2 font-mono">time.hourOfDay {'>'}= 9</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Boolean</td>
            <td className="p-2 font-mono">AND, OR, NOT</td>
            <td className="p-2 font-mono">a = 1 AND b = 2</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">String</td>
            <td className="p-2 font-mono">CONTAINS, STARTS_WITH, ENDS_WITH, LIKE, MATCHES</td>
            <td className="p-2 font-mono">params.path STARTS_WITH '/api/'</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Membership</td>
            <td className="p-2 font-mono">IN, NOT IN</td>
            <td className="p-2 font-mono">'prod' IN params.envs</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Array</td>
            <td className="p-2 font-mono">CONTAINS_ANY, CONTAINS_NONE, CONTAINS_ALL</td>
            <td className="p-2 font-mono">params.tables CONTAINS_ANY ['users']</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Existence</td>
            <td className="p-2 font-mono">EXISTS, NOT EXISTS</td>
            <td className="p-2 font-mono">params.apiKey EXISTS</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Network</td>
            <td className="p-2 font-mono">IN_CIDR, NOT IN_CIDR</td>
            <td className="p-2 font-mono">network.sourceIp IN_CIDR '10.0.0.0/8'</td>
          </tr>
          <tr className="border-t">
            <td className="p-2">Range</td>
            <td className="p-2 font-mono">BETWEEN</td>
            <td className="p-2 font-mono">time.hourOfDay BETWEEN 9 AND 17</td>
          </tr>
        </tbody>
      </table>

      <h3 id="built-in-functions">Built-in Functions</h3>
      <p>Advanced conditions support helper functions for common operations:</p>

      <CodeBlock language="sql" filename="Function Examples">
        {`-- String functions
LOWER(params.action) = 'delete'
LENGTH(params.query) < 1000

-- Array functions
SIZE(params.tables) > 0
FIRST(params.envs) = 'production'

-- Type checking
IS_STRING(params.id)
IS_NUMBER(params.limit)`}
      </CodeBlock>

      <h3 id="advanced-type-checking">Type Checking</h3>
      <p>
        The advanced condition editor provides real-time type checking. When you specify tool
        patterns, the editor loads the tool's JSON Schema and validates that:
      </p>
      <ul>
        <li>Field names exist in the tool's parameter schema</li>
        <li>Operators are appropriate for the field's type</li>
        <li>Literal values match expected types</li>
      </ul>
      <p>
        Type errors are highlighted with position information, making it easy to fix issues before
        saving.
      </p>

      <h3 id="advanced-editor-features">Editor Features</h3>
      <ul>
        <li>
          <strong>Autocomplete:</strong> Press Tab or type to get field and operator suggestions
          based on the selected tool patterns.
        </li>
        <li>
          <strong>Signature Help:</strong> When inside a function call, see parameter hints.
        </li>
        <li>
          <strong>Hover Info:</strong> Hover over any symbol to see its type and description.
        </li>
        <li>
          <strong>Validation:</strong> Real-time parsing and type checking with error positions.
        </li>
      </ul>

      <h3 id="converting-simple-to-advanced">Converting Simple to Advanced</h3>
      <p>
        You can convert existing simple conditions to advanced format. The converter generates an
        equivalent expression that can then be extended with boolean logic.
      </p>

      <CodeBlock language="json" filename="Simple Conditions">
        {`[
  { "field": "time.hourOfDay", "operator": "greaterThan", "value": 9 },
  { "field": "time.hourOfDay", "operator": "lessThan", "value": 17 }
]`}
      </CodeBlock>

      <CodeBlock language="sql" filename="Converted to Advanced">
        {`time.hourOfDay > 9 AND time.hourOfDay < 17`}
      </CodeBlock>

      <Callout type="info" title="When to Use Advanced Conditions">
        Use advanced conditions when you need OR logic, nested grouping, or complex boolean
        expressions. For simple AND-only rules, the standard condition builder is often clearer.
      </Callout>
    </>
  );
}
