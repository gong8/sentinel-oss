import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminWorkspacesContent() {
  return (
    <>
      <h1 id="managing-workspaces">Managing Workspaces</h1>
      <p className="lead text-xl text-muted-foreground">
        Organize your organization into separate workspaces with isolated policies, servers, and
        audit logs.
      </p>

      <h2 id="what-are-workspaces">What Are Workspaces?</h2>
      <p>
        Workspaces are logical boundaries within your organization. Each workspace can have its own:
      </p>
      <ul>
        <li>
          <strong>Members:</strong> Users who can access tools in this workspace.
        </li>
        <li>
          <strong>MCP Servers:</strong> Tool servers available to workspace members.
        </li>
        <li>
          <strong>Policies:</strong> Access control rules scoped to this workspace.
        </li>
        <li>
          <strong>Agents:</strong> AI agents configured for this workspace.
        </li>
        <li>
          <strong>Audit Logs:</strong> Activity history for workspace-scoped operations.
        </li>
      </ul>

      <Callout type="info" title="Organization Owners">
        Organization owners automatically have access to all workspaces and can manage workspace
        settings. Regular administrators only see workspaces they are members of.
      </Callout>

      <h2 id="viewing-workspaces">Viewing Workspaces</h2>
      <p>
        Navigate to <strong>Workspaces</strong> in the admin sidebar. The workspace list displays:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> The display name of the workspace.
        </li>
        <li>
          <strong>Slug:</strong> The URL-safe identifier used in routes.
        </li>
        <li>
          <strong>Members:</strong> Count of users assigned to this workspace.
        </li>
        <li>
          <strong>Servers:</strong> Count of MCP servers connected.
        </li>
        <li>
          <strong>Policies:</strong> Count of active access control rules.
        </li>
        <li>
          <strong>Agents:</strong> Count of configured AI agents.
        </li>
      </ul>

      <h2 id="creating-workspaces">Creating a Workspace</h2>
      <p>Only organization owners can create new workspaces.</p>

      <Steps>
        <Step number={1} title="Click Add Workspace">
          <p>
            Click the <strong>Add Workspace</strong> button in the top right of the Workspaces page.
          </p>
        </Step>

        <Step number={2} title="Enter Details">
          <p>
            Provide a <strong>Name</strong> (required) and optional <strong>Description</strong>.
          </p>
          <Callout type="warning" title="Reserved Names">
            Some names are reserved for system routes (e.g., "admin", "api", "settings"). If your
            chosen name conflicts with a reserved slug, you will be prompted to choose a different
            name.
          </Callout>
        </Step>

        <Step number={3} title="Create">
          <p>
            Click <strong>Create</strong>. The workspace is immediately available and you can start
            adding members and servers.
          </p>
        </Step>
      </Steps>

      <h2 id="editing-workspaces">Editing a Workspace</h2>
      <p>
        Click on a workspace row to open the details panel, then click <strong>Edit</strong> to
        modify:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> The display name (changing this will update the URL slug).
        </li>
        <li>
          <strong>Description:</strong> Optional notes about the workspace purpose.
        </li>
      </ul>

      <h2 id="deleting-workspaces">Deleting a Workspace</h2>
      <p>
        Workspace deletion is a soft-delete operation. Before deleting, Sentinel analyzes the
        impact:
      </p>
      <ul>
        <li>
          <strong>Blockers:</strong> Conditions that prevent deletion (e.g., active sessions).
        </li>
        <li>
          <strong>Warnings:</strong> Resources that will be affected (members, policies, servers).
        </li>
      </ul>

      <Callout type="warning" title="Deletion Impact">
        When you delete a workspace, all workspace members are removed immediately. Policies, MCP
        servers, and agents associated with the workspace are soft-deleted and can be restored along
        with the workspace.
      </Callout>

      <h3>Restoring a Deleted Workspace</h3>
      <p>
        Deleted workspaces can be restored from the <strong>Deleted Items</strong> view. If another
        workspace with the same name was created after deletion, you must rename it before
        restoring.
      </p>

      <h2 id="workspace-members">Managing Workspace Members</h2>
      <p>
        Each workspace has its own membership list. Navigate to a workspace and select the{' '}
        <strong>Members</strong> tab to manage who can access tools in this workspace.
      </p>

      <h3>Adding Members</h3>
      <Steps>
        <Step number={1} title="Select a User">
          <p>
            Click <strong>Add Member</strong> and select a user from your organization.
          </p>
        </Step>

        <Step number={2} title="Role Assignment">
          <p>
            The member's workspace role is automatically determined by their organization-level
            admin status:
          </p>
          <ul>
            <li>
              <strong>Admin:</strong> Users with an admin role at the organization level become
              workspace admins.
            </li>
            <li>
              <strong>Member:</strong> Regular users become workspace members.
            </li>
          </ul>
        </Step>
      </Steps>

      <Callout type="info" title="Role Inheritance">
        Workspace roles are derived from organization roles. To change a user's workspace role,
        update their roles in the <strong>Users</strong> page.
      </Callout>

      <h3>Removing Members</h3>
      <p>
        Click the remove button on a member row to revoke their workspace access. This action is
        immediate and the user will no longer be able to access tools in this workspace.
      </p>

      <Callout type="warning" title="Last Admin Protection">
        You cannot remove the last admin from a workspace. Ensure at least one admin remains before
        removing others.
      </Callout>

      <h2 id="workspace-audit-logs">Workspace Audit Logs</h2>
      <p>
        Each workspace maintains its own audit log of tool calls and policy decisions. Navigate to a
        workspace and select the <strong>Audit Logs</strong> tab to view activity.
      </p>

      <h3>Filtering Logs</h3>
      <p>Filter audit logs by:</p>
      <ul>
        <li>
          <strong>Tool Name:</strong> Search for specific tool calls.
        </li>
        <li>
          <strong>Decision:</strong> Filter by ALLOWED or DENIED.
        </li>
        <li>
          <strong>User:</strong> Filter by specific user.
        </li>
        <li>
          <strong>Date Range:</strong> Specify start and end dates.
        </li>
      </ul>

      <h3>Audit Log Details</h3>
      <p>Click on an audit log entry to view detailed information:</p>
      <ul>
        <li>
          <strong>Tool Parameters:</strong> The arguments passed to the tool.
        </li>
        <li>
          <strong>Policy Snapshot:</strong> The policies that were evaluated.
        </li>
        <li>
          <strong>Evaluation Tree:</strong> The decision-making process breakdown.
        </li>
        <li>
          <strong>Approval Status:</strong> If approval was required, who approved/denied and when.
        </li>
      </ul>

      <h3>Audit Statistics</h3>
      <p>
        View aggregated statistics for a workspace including total calls, allowed/denied counts, and
        the most frequently used tools over a configurable time period (up to 90 days).
      </p>

      <h2 id="api-reference">API Reference</h2>

      <h3>Workspace Endpoints</h3>
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
              <code>admin.workspaces.list</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List all workspaces (org owners see all)</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.get</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get workspace by ID with counts</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.getBySlug</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Resolve workspace slug to data</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.create</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Create new workspace (org owners only)</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.update</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Update workspace name/description</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.delete</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Soft delete workspace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.restore</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Restore soft-deleted workspace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaces.getDeletionImpact</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Preview deletion impact</td>
          </tr>
        </tbody>
      </table>

      <h3>Member Endpoints</h3>
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
              <code>admin.workspaceMembers.list</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List members of a workspace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaceMembers.add</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Add user to workspace</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaceMembers.remove</code>
            </td>
            <td className="p-2 border-b">Mutation</td>
            <td className="p-2 border-b">Remove user from workspace</td>
          </tr>
        </tbody>
      </table>

      <h3>Audit Log Endpoints</h3>
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
              <code>admin.workspaceAuditLogs.list</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">List audit logs with pagination and filters</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaceAuditLogs.get</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get detailed audit log entry</td>
          </tr>
          <tr>
            <td className="p-2 border-b">
              <code>admin.workspaceAuditLogs.getStats</code>
            </td>
            <td className="p-2 border-b">Query</td>
            <td className="p-2 border-b">Get workspace audit statistics</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
