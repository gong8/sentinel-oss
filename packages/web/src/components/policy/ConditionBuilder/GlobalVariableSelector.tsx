/**
 * GlobalVariableSelector Component
 * Two cascading dropdowns for selecting namespace and field
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import { formatConditionValue } from '../../../lib/format';
import { trpc } from '../../../lib/trpc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { GlobalVariableFieldType } from './typeMapping';

/** Shape of namespace data returned from the query */
interface NamespaceData {
  id: string;
  name: string;
  description: string | null;
  fields: Array<{
    id: string;
    name: string;
    description: string | null;
    fieldType: string;
    fullPath: string;
    value: unknown;
  }>;
}

interface GlobalVariableSelectorProps {
  value: string | undefined;
  onChange: (valueRef: string) => void;
  compatibleTypes: GlobalVariableFieldType[];
  disabled?: boolean;
}

export function GlobalVariableSelector({
  value,
  onChange,
  compatibleTypes,
  disabled = false,
}: GlobalVariableSelectorProps): JSX.Element {
  // Parse current value into namespace (field not used but kept for future reference)
  const selectedNamespace = useMemo(() => {
    if (!value) return undefined;
    const parts = value.split('.');
    return parts.length === 2 ? parts[0] : undefined;
  }, [value]);

  // Track namespace selection (for cascading)
  const [namespaceId, setNamespaceId] = useState<string | undefined>();

  // Fetch namespaces with fields filtered by compatible types
  // Use select to transform and explicitly type the result, avoiding deep type inference
  // Note: workspace scoping is handled automatically via ctx.auth.workspaceIds on the backend
  const { data: namespaces, isLoading } =
    trpc.admin.globalVariables.listVariablesForConditionBuilder.useQuery(
      { compatibleTypes: compatibleTypes.length > 0 ? compatibleTypes : undefined },
      {
        enabled: compatibleTypes.length > 0,
        select: (data): NamespaceData[] => data,
      },
    );

  // Find namespace ID by name when value changes
  const currentNamespaceId = useMemo(() => {
    if (!selectedNamespace || !namespaces) return namespaceId;
    const ns = namespaces.find((n) => n.name === selectedNamespace);
    return ns?.id ?? namespaceId;
  }, [selectedNamespace, namespaces, namespaceId]);

  // Get fields for selected namespace
  const selectedNamespaceData = useMemo(() => {
    if (!currentNamespaceId || !namespaces) return undefined;
    return namespaces.find((n) => n.id === currentNamespaceId);
  }, [currentNamespaceId, namespaces]);

  // Get the selected field's value for preview
  const selectedFieldValue = useMemo(() => {
    if (!value || !selectedNamespaceData) return undefined;
    const field = selectedNamespaceData.fields.find((f) => f.fullPath === value);
    return field?.value;
  }, [value, selectedNamespaceData]);

  const handleNamespaceChange = (nsId: string): void => {
    setNamespaceId(nsId);
    // Clear field selection when namespace changes
    onChange('');
  };

  const handleFieldChange = (fullPath: string): void => {
    onChange(fullPath);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-[140px] h-9 bg-muted animate-pulse rounded" />
        <div className="w-[140px] h-9 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!namespaces || namespaces.length === 0) {
    return (
      <span className="text-sm text-muted-foreground italic">
        No compatible variables available
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* Namespace selector */}
        <Select
          value={currentNamespaceId ?? ''}
          onValueChange={handleNamespaceChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Namespace" />
          </SelectTrigger>
          <SelectContent>
            {namespaces.map((ns) => (
              <SelectItem key={ns.id} value={ns.id}>
                {ns.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground font-medium">.</span>

        {/* Field selector */}
        <Select
          value={value ?? ''}
          onValueChange={handleFieldChange}
          disabled={disabled || !selectedNamespaceData}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Field" />
          </SelectTrigger>
          <SelectContent>
            {selectedNamespaceData?.fields.map((field) => (
              <SelectItem key={field.id} value={field.fullPath}>
                {field.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value preview */}
      {selectedFieldValue !== undefined && (
        <div className="text-xs text-muted-foreground">
          Current value:{' '}
          <span className="font-medium text-foreground">
            {formatConditionValue(selectedFieldValue)}
          </span>
        </div>
      )}
    </div>
  );
}
