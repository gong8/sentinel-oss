import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminRolesContent() {
  return (
    <>
      <h1 id="managing-roles">Managing Roles</h1>
      <p className="lead text-xl text-muted-foreground">
        Create roles to group users and manage their access together. Roles make it easy to give
        entire teams the same tool access.
      </p>

      <h2 id="what-are-roles">What Are Roles?</h2>
      <p>
        Roles are groups that users belong to. When you create access rules, you can apply them to
        entire roles instead of individual users. This makes managing access much easier as your
        organization grows.
      </p>

      <p>For example, you might create roles like:</p>
      <ul>
        <li>
          <strong>Engineering</strong> - Developers who need code and infrastructure tools
        </li>
        <li>
          <strong>Design</strong> - Designers who need Figma and asset tools
        </li>
        <li>
          <strong>Support</strong> - Support staff who need customer database access
        </li>
        <li>
          <strong>Admin</strong> - Administrators who manage SENTINEL itself
        </li>
      </ul>

      <h2 id="viewing-roles">Viewing Roles</h2>
      <p>
        Click <strong>Roles</strong> in the admin sidebar. You'll see all roles with:
      </p>
      <ul>
        <li>
          <strong>Name</strong> - The name of the role
        </li>
        <li>
          <strong>Description</strong> - What this role is for
        </li>
        <li>
          <strong>Created</strong> - When the role was created
        </li>
        <li>
          <strong>Actions</strong> - Edit or delete the role
        </li>
      </ul>

      <h2 id="creating-roles">Creating a Role</h2>

      <Steps>
        <Step number={1} title="Click Create Role">
          <p>
            Click the <strong>Create Role</strong> button.
          </p>
        </Step>

        <Step number={2} title="Enter role details">
          <p>Fill in the information:</p>
          <ul>
            <li>
              <strong>Name</strong> - A clear name like "Engineering" or "Finance"
            </li>
            <li>
              <strong>Description</strong> - Explain what this role is for
            </li>
          </ul>
        </Step>

        <Step number={3} title="Save">
          <p>
            Click <strong>Create Role</strong> to save.
          </p>
        </Step>
      </Steps>

      <Callout type="tip" title="Start with roles, then rules">
        It's often easier to create your roles first, then create access rules that apply to those
        roles. This keeps your setup organized.
      </Callout>

      <h2 id="managing-members">Managing Role Membership</h2>
      <p>
        Role assignments are managed from the <strong>Users</strong> page, not from the Roles page.
        This keeps user management centralized.
      </p>
      <ol>
        <li>
          Go to <strong>Users</strong> in the admin sidebar
        </li>
        <li>Click on a user to open their profile</li>
        <li>
          In their profile, find the <strong>Roles</strong> section
        </li>
        <li>
          Click <strong>Edit</strong> to add or remove roles
        </li>
        <li>Save changes</li>
      </ol>

      <Callout type="info" title="Access updates immediately">
        When you add or remove a user from a role, their access updates right away. Any new tool
        calls will use their updated permissions.
      </Callout>

      <h2 id="editing-roles">Editing a Role</h2>
      <ol>
        <li>Click on the role</li>
        <li>
          Click <strong>Edit</strong>
        </li>
        <li>Update the name or description</li>
        <li>
          Click <strong>Save Changes</strong>
        </li>
      </ol>

      <h2 id="deleting-roles">Deleting a Role</h2>

      <Callout type="warning" title="Check access rules first">
        Before deleting a role, check if any access rules apply to it. Those rules will no longer
        match any users after the role is deleted.
      </Callout>

      <ol>
        <li>Open the role</li>
        <li>
          Click <strong>Delete Role</strong>
        </li>
        <li>Confirm by typing the role name</li>
      </ol>

      <p>
        Users who were in the deleted role will lose any access that was granted specifically to
        that role.
      </p>

      <h2 id="admin-role">Admin Role</h2>
      <p>
        Any role named "Admin" (case-insensitive) is treated as an admin role with full access to
        manage SENTINEL. The admin role detection is based on the name, so you can rename it if
        needed - it will lose admin privileges unless the new name also matches "admin"
        (case-insensitive).
      </p>

      <Callout type="info" title="Admin role behavior">
        Users with an admin role cannot have other roles assigned - the admin role is exclusive. The
        edit button is disabled for admin roles to prevent accidental changes.
      </Callout>
    </>
  );
}
