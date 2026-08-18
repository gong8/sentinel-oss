import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminGlobalVariablesContent() {
  return (
    <>
      <h1 id="global-variables">Global Variables</h1>
      <p className="lead text-xl text-muted-foreground">
        Define reusable variables for dynamic policy conditions across your organization.
      </p>

      <h2 id="overview">Overview</h2>
      <p>
        Global variables allow you to define named values that can be referenced in policy
        conditions. Instead of hardcoding values directly in policies, you can use variables that
        can be updated centrally without modifying individual policies.
      </p>

      <h3>Use Cases</h3>
      <ul>
        <li>
          <strong>Environment Configuration:</strong> Define environment-specific values (e.g.,
          allowed hosts, API endpoints).
        </li>
        <li>
          <strong>Dynamic Limits:</strong> Set configurable limits (e.g., max file size, rate
          limits).
        </li>
        <li>
          <strong>Feature Flags:</strong> Enable/disable features across policies.
        </li>
        <li>
          <strong>Shared Lists:</strong> Maintain lists of allowed/blocked items (e.g., allowed
          domains, blocked users).
        </li>
      </ul>

      <h2 id="namespaces">Namespaces</h2>
      <p>
        Variables are organized into namespaces. Each namespace groups related variables together.
      </p>

      <h3>Namespace Scoping</h3>
      <ul>
        <li>
          <strong>Global Namespaces:</strong> Organization-wide, accessible from all workspaces.
          Only organization owners can create global namespaces.
        </li>
        <li>
          <strong>Workspace Namespaces:</strong> Scoped to a specific workspace, only accessible
          within that workspace.
        </li>
      </ul>

      <Callout type="info" title="Namespace Visibility">
        When viewing variables in a workspace context, you see both global namespaces and
        workspace-specific namespaces. In the "All Workspaces" view, you see all namespaces across
        the organization.
      </Callout>

      <h2 id="creating-namespaces">Creating a Namespace</h2>
      <p>
        Navigate to <strong>Global Variables</strong> in the admin sidebar.
      </p>

      <Steps>
        <Step number={1} title="Click Add Namespace">
          <p>
            Click the <strong>Add Namespace</strong> button.
          </p>
        </Step>

        <Step number={2} title="Enter Details">
          <p>Provide:</p>
          <ul>
            <li>
              <strong>Name:</strong> A unique identifier (alphanumeric, underscores, max 50 chars).
            </li>
            <li>
              <strong>Description:</strong> Optional explanation of the namespace purpose.
            </li>
            <li>
              <strong>Scope:</strong> Global (org-wide) or specific workspace.
            </li>
          </ul>
        </Step>

        <Step number={3} title="Create">
          <p>
            Click <strong>Create</strong> to save the namespace.
          </p>
        </Step>
      </Steps>

      <Callout type="warning" title="Naming Rules">
        Namespace names must be valid identifiers: start with a letter, contain only letters,
        numbers, and underscores. Names are case-sensitive.
      </Callout>

      <h2 id="fields">Fields (Variables)</h2>
      <p>Each namespace contains fields (variables). Fields have a name, type, and value.</p>

      <h3>Supported Field Types</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 border-b">Type</th>
            <th className="text-left p-2 border-b">Description</th>
            <th className="text-left p-2 border-b">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border-b">
              <code>STRING</code>
            </td>
            <td className="p-2 border-b">Single text value</td>
            <td className="p-2 border-b">"production"</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>NUMBER</code>
            </td>
            <td className="p-2 border-b">Numeric value</td>
            <td className="p-2 border-b">1000</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>BOOLEAN</code>
            </td>
            <td className="p-2 border-b">True/false value</td>
            <td className="p-2 border-b">true</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>DATE</code>
            </td>
            <td className="p-2 border-b">Date/time value</td>
            <td className="p-2 border-b">"2024-12-31T23:59:59Z"</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>STRING_ARRAY</code>
            </td>
            <td className="p-2 border-b">List of text values</td>
            <td className="p-2 border-b">["api.example.com", "data.example.com"]</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>NUMBER_ARRAY</code>
            </td>
            <td className="p-2 border-b">List of numeric values</td>
            <td className="p-2 border-b">[80, 443, 8080]</td>
          </tr>
        </tbody>
      </table>

      <h2 id="creating-fields">Creating a Field</h2>
      <Steps>
        <Step number={1} title="Select Namespace">
          <p>Click on a namespace to view its fields.</p>
        </Step>

        <Step number={2} title="Click Add Field">
          <p>
            Click the <strong>Add Field</strong> button.
          </p>
        </Step>

        <Step number={3} title="Configure Field">
          <p>Provide:</p>
          <ul>
            <li>
              <strong>Name:</strong> Unique identifier within the namespace.
            </li>
            <li>
              <strong>Type:</strong> Select the appropriate data type.
            </li>
            <li>
              <strong>Value:</strong> The initial value (must match the selected type).
            </li>
            <li>
              <strong>Description:</strong> Optional explanation.
            </li>
          </ul>
        </Step>

        <Step number={4} title="Create">
          <p>
            Click <strong>Create</strong> to save the field.
          </p>
        </Step>
      </Steps>

      <h2 id="using-variables">Using Variables in Policies</h2>
      <p>
        Reference variables in policy conditions using the <code>namespace.fieldName</code> syntax:
      </p>

      <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
        <code>{`// Check if host is in allowed list
params.host IN @config.allowed_hosts

// Compare against a numeric limit  
params.size <= @limits.max_file_size

// Check a boolean flag
@features.enable_advanced_mode == true`}</code>
      </pre>

      <Callout type="info" title="Variable Reference Syntax">
        Variables are referenced with the <code>@</code> prefix followed by{' '}
        <code>namespace.fieldName</code>. The condition builder will show available variables based
        on the field type needed.
      </Callout>

      <h2 id="condition-builder">Condition Builder Integration</h2>
      <p>
        When building policy conditions, the condition builder provides a list of compatible
        variables based on the expected type. This makes it easy to select variables without
        memorizing names.
      </p>
      <p>The condition builder shows:</p>
      <ul>
        <li>Namespace name and description</li>
        <li>Field name, type, and description</li>
        <li>Current value (for reference)</li>
        <li>Full path for insertion</li>
      </ul>

      <h2 id="deleting">Deleting Namespaces and Fields</h2>

      <h3>Deleting a Field</h3>
      <p>
        Fields are hard-deleted immediately. Policies referencing the deleted field will fail
        evaluation until updated.
      </p>

      <Callout type="warning" title="Field Deletion Impact">
        Before deleting a field, ensure no policies reference it. Policies with invalid variable
        references will produce evaluation errors.
      </Callout>

      <h3>Deleting a Namespace</h3>
      <p>
        Namespaces are soft-deleted and can be restored. All fields within a deleted namespace
        become inaccessible but are preserved for restoration.
      </p>

      <h3>Restoring a Namespace</h3>
      <p>
        Deleted namespaces can be restored from the deleted items view. If another namespace with
        the same name was created after deletion, you must rename it before restoring.
      </p>

      <h2 id="preview">Variables Preview</h2>
      <p>
        The variables preview shows all variables as a flat JSON structure, useful for debugging and
        understanding the current state:
      </p>

      <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "config": {
    "environment": "production",
    "allowed_hosts": ["api.example.com", "data.example.com"]
  },
  "limits": {
    "max_file_size": 10485760,
    "rate_limit": 1000
  },
  "features": {
    "enable_advanced_mode": true
  }
}`}</code>
      </pre>

      <h2 id="api-reference">API Reference</h2>

      <h3>Namespace Endpoints</h3>
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
              <code>admin.globalVariables.listNamespaces</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List all namespaces with fields</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.getNamespace</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get namespace with all fields</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.createNamespace</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Create new namespace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.updateNamespace</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Update namespace name/description</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.deleteNamespace</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Soft delete namespace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.restoreNamespace</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Restore deleted namespace</td>
          </tr>
        </tbody>
      </table>

      <h3>Field Endpoints</h3>
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
              <code>admin.globalVariables.createField</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Create new field in namespace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.updateField</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Update field properties/value</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.deleteField</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Permanently delete field</td>
          </tr>
        </tbody>
      </table>

      <h3>Helper Endpoints</h3>
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
              <code>admin.globalVariables.listVariablesForConditionBuilder</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get variables formatted for condition builder</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.globalVariables.getVariablesPreview</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get all variables as flat JSON map</td>
          </tr>
        </tbody>
      </table>

      <h3>Input Parameters</h3>

      <h4>
        <code>createNamespace</code>
      </h4>
      <ul>
        <li>
          <code>name</code> (string, required): Namespace name (1-50 chars).
        </li>
        <li>
          <code>description</code> (string, optional): Description (max 500 chars).
        </li>
        <li>
          <code>workspaceId</code> (string | null, optional): Workspace ID or null for global.
        </li>
      </ul>

      <h4>
        <code>createField</code>
      </h4>
      <ul>
        <li>
          <code>namespaceId</code> (string, required): Parent namespace ID.
        </li>
        <li>
          <code>name</code> (string, required): Field name (1-50 chars).
        </li>
        <li>
          <code>description</code> (string, optional): Description (max 500 chars).
        </li>
        <li>
          <code>fieldType</code> (enum, required): One of STRING, NUMBER, BOOLEAN, DATE,
          STRING_ARRAY, NUMBER_ARRAY.
        </li>
        <li>
          <code>value</code> (any, required): Initial value matching the field type.
        </li>
      </ul>

      <h4>
        <code>listVariablesForConditionBuilder</code>
      </h4>
      <ul>
        <li>
          <code>compatibleTypes</code> (array, optional): Filter fields by compatible types.
        </li>
      </ul>
    </>
  );
}
