import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type ViewAsType = 'none' | 'user' | 'agent' | 'role';

interface ViewAsSelectorProps {
  viewAsType: ViewAsType;
  viewAsId: string;
  onTypeChange: (type: ViewAsType) => void;
  onIdChange: (id: string) => void;
  onReset: () => void;
  users?: Array<{ id: string; email: string }>;
  agents?: Array<{ id: string; name: string }>;
  roles?: Array<{ id: string; name: string }>;
  title?: string;
  description?: string;
}

export function ViewAsSelector({
  viewAsType,
  viewAsId,
  onTypeChange,
  onIdChange,
  onReset,
  users,
  agents,
  roles,
  title = 'View Tool Access',
  description = 'Preview which tools are accessible to a specific user, agent, or role',
}: ViewAsSelectorProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ViewAsTypeSelect value={viewAsType} onChange={onTypeChange} />

          {viewAsType === 'user' && (
            <EntitySelect
              id="viewAsUser"
              label="Select User"
              placeholder="Select user..."
              value={viewAsId}
              onChange={onIdChange}
              items={users?.map((u) => ({ id: u.id, label: u.email }))}
            />
          )}

          {viewAsType === 'agent' && (
            <EntitySelect
              id="viewAsAgent"
              label="Select Agent"
              placeholder="Select agent..."
              value={viewAsId}
              onChange={onIdChange}
              items={agents?.map((a) => ({ id: a.id, label: a.name }))}
            />
          )}

          {viewAsType === 'role' && (
            <EntitySelect
              id="viewAsRole"
              label="Select Role"
              placeholder="Select role..."
              value={viewAsId}
              onChange={onIdChange}
              items={roles?.map((r) => ({ id: r.id, label: r.name }))}
            />
          )}

          {viewAsType !== 'none' && (
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={onReset} className="w-full">
                Reset
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ViewAsTypeSelect({
  value,
  onChange,
}: {
  value: ViewAsType;
  onChange: (value: ViewAsType) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor="viewAsType">View As</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === 'none' || v === 'user' || v === 'agent' || v === 'role') {
            onChange(v);
          }
        }}
      >
        <SelectTrigger id="viewAsType">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None (All Tools)</SelectItem>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="agent">Agent</SelectItem>
          <SelectItem value="role">Role</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function EntitySelect({
  id,
  label,
  placeholder,
  value,
  onChange,
  items,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  items?: Array<{ id: string; label: string }>;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items?.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ViewAsSummaryProps {
  displayName: string;
  userRoles?: Array<{ name: string }>;
  accessCounts: {
    allowed: number;
    denied: number;
    pendingApproval: number;
  };
}

export function ViewAsSummary({
  displayName,
  userRoles,
  accessCounts,
}: ViewAsSummaryProps): React.ReactElement {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">Viewing as: </span>
          <span className="text-muted-foreground">{displayName}</span>
          {userRoles && userRoles.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              (Roles: {userRoles.map((r) => r.name).join(', ')})
            </span>
          )}
        </div>
        <div className="flex gap-4 text-xs">
          <span className="text-green-600">{accessCounts.allowed} allowed</span>
          <span className="text-red-600">{accessCounts.denied} denied</span>
        </div>
      </div>
    </div>
  );
}
