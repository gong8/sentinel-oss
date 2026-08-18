import { Callout } from '../../../components/Callout';
import { Step, Steps } from '../../../components/Steps';

export default function AdminUsersContent() {
  return (
    <>
      <h1 id="managing-users">Managing Users</h1>
      <p className="lead text-xl text-muted-foreground">
        Provision and manage identities in your Sentinel organization.
      </p>

      <h2 id="viewing-users">Viewing Users</h2>
      <p>
        Navigate to <strong>Users</strong> in the admin sidebar. The user table provides an overview
        of:
      </p>
      <ul>
        <li>
          <strong>Email</strong>: The primary identifier for the user.
        </li>
        <li>
          <strong>Roles</strong>: The security groups the user belongs to.
        </li>
        <li>
          <strong>Last Active</strong>: The timestamp of the user's most recent tool call or API
          request.
        </li>
      </ul>

      <h2 id="adding-users">Provisioning a User</h2>
      <p>
        Sentinel does not use a traditional email invitation flow. Instead, administrators create
        accounts and generate access tokens directly.
      </p>

      <Steps>
        <Step number={1} title="Click Add User">
          <p>
            Click the <strong>Add User</strong> button in the top right of the Users page.
          </p>
        </Step>

        <Step number={2} title="Configure Account">
          <p>
            Enter the user's <strong>Email Address</strong> and assign their initial{' '}
            <strong>Roles</strong>.
          </p>
        </Step>

        <Step number={3} title="Secure the Token">
          <p>
            Upon clicking <strong>Create</strong>, Sentinel will display a one-time{' '}
            <strong>Access Token</strong>.
          </p>
          <Callout type="warning" title="Save this token">
            The token is only shown once. You must copy it and securely provide it to the user.
            Users will use this token to authenticate their AI assistants (like Claude or Cursor).
          </Callout>
        </Step>
      </Steps>

      <h2 id="managing-access">Managing Access</h2>

      <h3>Assigning Roles</h3>
      <p>
        Click <strong>Edit</strong> on a user row to modify their roles. Role changes are effective
        immediately for all new tool calls.
      </p>

      <h3>Refreshing Tokens</h3>
      <p>
        If a user's token is compromised or needs to be rotated, use the{' '}
        <strong>Refresh Token</strong> action. This invalidates the old token and generates a new
        one instantly.
      </p>

      <h3>Revoking Access</h3>
      <p>
        If you need to block a user immediately without deleting their record, use{' '}
        <strong>Revoke Token</strong>. This will force all their active AI assistant connections to
        fail authentication.
      </p>

      <h2 id="removing-users">Removing a User</h2>
      <p>
        Deleting a user is a soft-delete operation. The user loses all access immediately, but their
        identity and past activity logs are preserved for auditing. You can restore a deleted user
        from the <strong>Deleted Items</strong> page.
      </p>

      <Callout type="info" title="User History">
        Audit logs always display the user email as it was at the time of the action, even if the
        user record is later deleted or modified.
      </Callout>
    </>
  );
}
