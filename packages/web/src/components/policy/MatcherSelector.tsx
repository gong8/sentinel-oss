import type { JSX } from 'react';

import type { MatcherEntry, MatcherType } from '../../lib/policyUtils';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ValueOption {
  id: string;
  value: string;
  label: string;
}

function getValueOptions(
  matcherType: MatcherType,
  users?: Array<{ id: string; email: string }>,
  roles?: Array<{ id: string; name: string }>,
  agents?: Array<{ id: string; name: string }>,
): ValueOption[] {
  const wildcardLabel = `All ${matcherType}s`;

  switch (matcherType) {
    case 'user':
      return [
        { id: 'wildcard', value: '*', label: wildcardLabel },
        ...(users?.map((u) => ({ id: u.id, value: u.email, label: u.email })) ?? []),
      ];
    case 'role':
      return [
        { id: 'wildcard', value: '*', label: wildcardLabel },
        ...(roles?.map((r) => ({ id: r.id, value: r.name, label: r.name })) ?? []),
      ];
    case 'agent':
      return [
        { id: 'wildcard', value: '*', label: wildcardLabel },
        ...(agents?.map((a) => ({ id: a.id, value: a.id, label: a.name })) ?? []),
      ];
    default:
      return [];
  }
}

export interface MatcherSelectorProps {
  matchers: MatcherEntry[];
  onChange: (matchers: MatcherEntry[]) => void;
  users?: Array<{ id: string; email: string }>;
  roles?: Array<{ id: string; name: string }>;
  agents?: Array<{ id: string; name: string }>;
  error?: string;
  label?: string;
  description?: string;
  readOnly?: boolean;
}

/**
 * Multi-matcher selector for policy forms
 * Allows selecting multiple users, roles, or agents that a policy applies to
 */
export function MatcherSelector({
  matchers,
  onChange,
  users,
  roles,
  agents,
  error,
  label = 'Applies to',
  description = 'Add multiple users, roles, or agents. The policy will apply if ANY matcher matches.',
  readOnly = false,
}: MatcherSelectorProps): JSX.Element {
  function handleTypeChange(index: number, type: MatcherType): void {
    const updated = [...matchers];
    updated[index] = { type, value: '' };
    onChange(updated);
  }

  function handleValueChange(index: number, value: string): void {
    const updated = [...matchers];
    updated[index] = { ...updated[index], value };
    onChange(updated);
  }

  function handleRemove(index: number): void {
    onChange(matchers.filter((_, i) => i !== index));
  }

  function handleAdd(): void {
    onChange([...matchers, { type: 'role', value: '' }]);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-2">
        {matchers.map((matcher, index) => (
          <div key={index} className="flex gap-2 items-center">
            <Select
              value={matcher.type}
              onValueChange={(type) => handleTypeChange(index, type as MatcherType)}
              disabled={readOnly}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>

            {matcher.type !== 'all' && (
              <Select
                value={matcher.value || undefined}
                onValueChange={(value) => handleValueChange(index, value)}
                disabled={readOnly}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={`Select ${matcher.type}`} />
                </SelectTrigger>
                <SelectContent>
                  {getValueOptions(matcher.type, users, roles, agents).map((option) => (
                    <SelectItem key={option.id} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {matchers.length > 1 && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove matcher"
                onClick={() => handleRemove(index)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}

        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            Add matcher
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
