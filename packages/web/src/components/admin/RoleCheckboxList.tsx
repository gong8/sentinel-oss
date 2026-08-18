import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';

interface Role {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface RoleCheckboxListProps {
  /** Available roles to display */
  roles: Role[];
  /** Currently selected role IDs */
  selectedRoleIds: string[];
  /** Called when selection changes */
  onChange: (roleIds: string[]) => void;
  /** Whether any role is disabled */
  disabledRoleIds?: string[];
  /** Show admin exclusivity warning */
  showAdminWarning?: boolean;
  /** Additional warning text (e.g., "You cannot remove your own admin role.") */
  additionalWarning?: string;
}

export function RoleCheckboxList({
  roles,
  selectedRoleIds,
  onChange,
  disabledRoleIds = [],
  showAdminWarning = true,
  additionalWarning,
}: RoleCheckboxListProps): React.ReactElement {
  const hasAdminRole = roles.some((r) => r.isAdmin && selectedRoleIds.includes(r.id));

  function handleRoleChange(role: Role, checked: boolean): void {
    if (role.isAdmin) {
      // Admin role selected - clear all others
      onChange(checked ? [role.id] : []);
    } else {
      // Non-admin role selected - clear admin roles if present
      const hasAnyAdmin = roles.some((r) => r.isAdmin && selectedRoleIds.includes(r.id));

      if (checked && hasAnyAdmin) {
        // Switching from admin to first non-admin
        onChange([role.id]);
      } else {
        // Normal multi-select toggle
        const next = checked
          ? [...selectedRoleIds, role.id]
          : selectedRoleIds.filter((id) => id !== role.id);
        onChange(next);
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-4 space-y-3">
        {roles.map((role) => {
          const isSelected = selectedRoleIds.includes(role.id);
          const isDisabled = disabledRoleIds.includes(role.id);

          return (
            <label
              key={role.id}
              className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'
              }`}
            >
              <Checkbox
                checked={isSelected}
                disabled={isDisabled}
                onCheckedChange={(checked) => handleRoleChange(role, checked === true)}
              />
              <span className="text-sm font-medium">{role.name}</span>
              {role.isAdmin && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  Admin
                </Badge>
              )}
            </label>
          );
        })}
      </div>
      {showAdminWarning && hasAdminRole && (
        <p className="text-xs text-muted-foreground">
          Admin roles are exclusive - users with admin role cannot have other roles.
        </p>
      )}
      {additionalWarning && <p className="text-xs text-muted-foreground">{additionalWarning}</p>}
    </div>
  );
}
