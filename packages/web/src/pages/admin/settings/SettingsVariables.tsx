import { ChevronDown, ChevronRight, Edit2, Globe, Plus, Trash2, Undo2, X } from 'lucide-react';
import * as React from 'react';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { SettingsCard } from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { CrudDialog } from '../../../components/ui/crud-dialog';
import { DeleteConfirmDialog } from '../../../components/ui/delete-confirm-dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { Switch } from '../../../components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { useWorkspace } from '../../../hooks/WorkspaceContext';
import { trpc } from '../../../lib/trpc';

type FieldType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'STRING_ARRAY' | 'NUMBER_ARRAY';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  STRING: 'String',
  NUMBER: 'Number',
  BOOLEAN: 'Boolean',
  DATE: 'Date',
  STRING_ARRAY: 'String List',
  NUMBER_ARRAY: 'Number List',
};

interface NamespaceFormData {
  name: string;
  description: string;
  workspaceId: string | null; // null = global
}

interface FieldFormData {
  name: string;
  description: string;
  fieldType: FieldType;
  value: string;
  booleanValue: boolean;
  arrayValues: string[];
}

interface NamespaceField {
  id: string;
  name: string;
  description: string | null;
  fieldType: string;
  value: unknown;
}

interface NamespaceData {
  id: string;
  name: string;
  description: string | null;
  deletedAt: string | null;
  fieldCount: number;
  fields: NamespaceField[];
  workspaceId: string | null;
  workspace: { id: string; name: string } | null;
}

function formatFieldValue(value: unknown, type: FieldType): string {
  if (value === null || value === undefined) return '-';

  switch (type) {
    case 'STRING':
      return String(value);
    case 'NUMBER':
      return String(value);
    case 'BOOLEAN':
      return value ? 'true' : 'false';
    case 'DATE':
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
      }
      return String(value);
    case 'STRING_ARRAY':
    case 'NUMBER_ARRAY':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    default:
      return String(value);
  }
}

function parseFieldValue(formData: FieldFormData): unknown {
  switch (formData.fieldType) {
    case 'STRING':
      return formData.value;
    case 'NUMBER':
      return parseFloat(formData.value);
    case 'BOOLEAN':
      return formData.booleanValue;
    case 'DATE':
      return formData.value;
    case 'STRING_ARRAY':
      return formData.arrayValues.filter((v) => v.trim() !== '');
    case 'NUMBER_ARRAY':
      return formData.arrayValues
        .filter((v) => v.trim() !== '')
        .map((v) => parseFloat(v))
        .filter((n) => !isNaN(n));
    default:
      return formData.value;
  }
}

function ArrayInput({
  values,
  onChange,
  placeholder,
  type = 'text',
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  const [inputValue, setInputValue] = React.useState('');

  function handleAdd() {
    if (inputValue.trim()) {
      onChange([...values, inputValue.trim()]);
      setInputValue('');
    }
  }

  function handleRemove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type={type}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((value, index) => (
            <Badge key={index} variant="secondary" className="gap-1 pr-1">
              {value}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="rounded-full hover:bg-destructive/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function NamespaceRow({
  namespace,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onCreateField,
  onEditField,
  onDeleteField,
  readOnly,
}: {
  namespace: NamespaceData;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateField: () => void;
  onEditField: (field: {
    id: string;
    name: string;
    description: string | null;
    fieldType: FieldType;
    value: unknown;
  }) => void;
  onDeleteField: (field: { id: string; name: string }) => void;
  readOnly?: boolean;
}) {
  const fields = namespace.fields || [];
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-3">
        <button onClick={onToggle} className="flex items-center gap-3 text-left flex-1">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{namespace.name}</span>
              <Badge variant="secondary" className="text-xs">
                {fields.length} {fields.length === 1 ? 'field' : 'fields'}
              </Badge>
            </div>
            {namespace.description && (
              <p className="text-sm text-muted-foreground">{namespace.description}</p>
            )}
            {namespace.workspace && (
              <p className="text-xs text-muted-foreground">Workspace: {namespace.workspace.name}</p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1">
          {readOnly ? (
            <span className="text-xs text-muted-foreground px-2">Read-only</span>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="border-t p-3 space-y-3 bg-muted/30">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Fields</span>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={onCreateField}>
                <Plus className="mr-2 h-3 w-3" />
                Add Field
              </Button>
            )}
          </div>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No fields defined.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  {!readOnly && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <code className="text-sm">
                        {namespace.name}.{field.name}
                      </code>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {field.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {FIELD_TYPE_LABELS[field.fieldType as FieldType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {formatFieldValue(field.value, field.fieldType as FieldType)}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onEditField(
                                field as {
                                  id: string;
                                  name: string;
                                  description: string | null;
                                  fieldType: FieldType;
                                  value: unknown;
                                },
                              )
                            }
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteField({ id: field.id, name: field.name })}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

function FieldValueInput({
  formData,
  onChange,
}: {
  formData: FieldFormData;
  onChange: (data: Partial<FieldFormData>) => void;
}) {
  switch (formData.fieldType) {
    case 'STRING':
      return (
        <Input
          value={formData.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Enter text value"
        />
      );
    case 'NUMBER':
      return (
        <Input
          type="number"
          value={formData.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Enter number"
          step="any"
        />
      );
    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.booleanValue}
            onCheckedChange={(checked) => onChange({ booleanValue: checked })}
          />
          <span className="text-sm text-muted-foreground">
            {formData.booleanValue ? 'true' : 'false'}
          </span>
        </div>
      );
    case 'DATE':
      return (
        <Input
          type="date"
          value={formData.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
    case 'STRING_ARRAY':
      return (
        <ArrayInput
          values={formData.arrayValues}
          onChange={(arrayValues) => onChange({ arrayValues })}
          placeholder="Enter text and press Enter"
        />
      );
    case 'NUMBER_ARRAY':
      return (
        <ArrayInput
          values={formData.arrayValues}
          onChange={(arrayValues) => onChange({ arrayValues })}
          placeholder="Enter number and press Enter"
          type="number"
        />
      );
    default:
      return null;
  }
}

export default function SettingsVariables() {
  const utils = trpc.useUtils();
  const { selectedWorkspaceId, workspaces, isOrgOwner } = useWorkspace();

  // State
  const [expandedNamespaces, setExpandedNamespaces] = React.useState<Set<string>>(new Set());
  const [namespaceDialog, setNamespaceDialog] = React.useState<{
    open: boolean;
    mode: 'create' | 'edit';
    data: NamespaceFormData;
    id?: string;
  }>({ open: false, mode: 'create', data: { name: '', description: '', workspaceId: null } });
  const [fieldDialog, setFieldDialog] = React.useState<{
    open: boolean;
    mode: 'create' | 'edit';
    namespaceId: string;
    namespaceName: string;
    data: FieldFormData;
    id?: string;
  }>({
    open: false,
    mode: 'create',
    namespaceId: '',
    namespaceName: '',
    data: {
      name: '',
      description: '',
      fieldType: 'STRING',
      value: '',
      booleanValue: false,
      arrayValues: [],
    },
  });
  const [deleteNamespaceDialog, setDeleteNamespaceDialog] = React.useState<{
    open: boolean;
    id: string;
    name: string;
  }>({ open: false, id: '', name: '' });
  const [deleteFieldDialog, setDeleteFieldDialog] = React.useState<{
    open: boolean;
    id: string;
    name: string;
    namespaceName: string;
  }>({ open: false, id: '', name: '', namespaceName: '' });
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Queries
  const namespacesQuery = trpc.admin.globalVariables.listNamespaces.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  // Mutations
  const createNamespaceMutation = trpc.admin.globalVariables.createNamespace.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setNamespaceDialog((d) => ({ ...d, open: false }));
      showSuccess('Namespace created');
    },
  });

  const updateNamespaceMutation = trpc.admin.globalVariables.updateNamespace.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setNamespaceDialog((d) => ({ ...d, open: false }));
      showSuccess('Namespace updated');
    },
  });

  const deleteNamespaceMutation = trpc.admin.globalVariables.deleteNamespace.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setDeleteNamespaceDialog({ open: false, id: '', name: '' });
      showSuccess('Namespace deleted');
    },
  });

  const restoreNamespaceMutation = trpc.admin.globalVariables.restoreNamespace.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      showSuccess('Namespace restored');
    },
  });

  const createFieldMutation = trpc.admin.globalVariables.createField.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setFieldDialog((d) => ({ ...d, open: false }));
      showSuccess('Field created');
    },
  });

  const updateFieldMutation = trpc.admin.globalVariables.updateField.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setFieldDialog((d) => ({ ...d, open: false }));
      showSuccess('Field updated');
    },
  });

  const deleteFieldMutation = trpc.admin.globalVariables.deleteField.useMutation({
    onSuccess: () => {
      utils.admin.globalVariables.listNamespaces.invalidate();
      setDeleteFieldDialog({ open: false, id: '', name: '', namespaceName: '' });
      showSuccess('Field deleted');
    },
  });

  function showSuccess(message: string) {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  }

  function toggleNamespace(id: string) {
    setExpandedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openCreateNamespace() {
    setNamespaceDialog({
      open: true,
      mode: 'create',
      data: { name: '', description: '', workspaceId: selectedWorkspaceId },
    });
  }

  function openEditNamespace(namespace: {
    id: string;
    name: string;
    description: string | null;
    workspaceId: string | null;
  }) {
    setNamespaceDialog({
      open: true,
      mode: 'edit',
      id: namespace.id,
      data: {
        name: namespace.name,
        description: namespace.description ?? '',
        workspaceId: namespace.workspaceId,
      },
    });
  }

  function openCreateField(namespaceId: string, namespaceName: string) {
    setFieldDialog({
      open: true,
      mode: 'create',
      namespaceId,
      namespaceName,
      data: {
        name: '',
        description: '',
        fieldType: 'STRING',
        value: '',
        booleanValue: false,
        arrayValues: [],
      },
    });
  }

  function openEditField(
    namespaceId: string,
    namespaceName: string,
    field: {
      id: string;
      name: string;
      description: string | null;
      fieldType: FieldType;
      value: unknown;
    },
  ) {
    const formData: FieldFormData = {
      name: field.name,
      description: field.description ?? '',
      fieldType: field.fieldType,
      value: '',
      booleanValue: false,
      arrayValues: [],
    };

    switch (field.fieldType) {
      case 'STRING':
      case 'NUMBER':
        formData.value = String(field.value ?? '');
        break;
      case 'BOOLEAN':
        formData.booleanValue = Boolean(field.value);
        break;
      case 'DATE':
        if (typeof field.value === 'string') {
          const date = new Date(field.value);
          formData.value = isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        }
        break;
      case 'STRING_ARRAY':
      case 'NUMBER_ARRAY':
        if (Array.isArray(field.value)) {
          formData.arrayValues = field.value.map(String);
        }
        break;
    }

    setFieldDialog({
      open: true,
      mode: 'edit',
      namespaceId,
      namespaceName,
      id: field.id,
      data: formData,
    });
  }

  function handleNamespaceSubmit() {
    if (namespaceDialog.mode === 'create') {
      createNamespaceMutation.mutate({
        name: namespaceDialog.data.name,
        description: namespaceDialog.data.description || undefined,
        workspaceId: namespaceDialog.data.workspaceId,
      });
    } else if (namespaceDialog.id) {
      updateNamespaceMutation.mutate({
        id: namespaceDialog.id,
        name: namespaceDialog.data.name,
        description: namespaceDialog.data.description || null,
      });
    }
  }

  function handleFieldSubmit() {
    const value = parseFieldValue(fieldDialog.data);

    if (fieldDialog.mode === 'create') {
      createFieldMutation.mutate({
        namespaceId: fieldDialog.namespaceId,
        name: fieldDialog.data.name,
        description: fieldDialog.data.description || undefined,
        fieldType: fieldDialog.data.fieldType,
        value,
      });
    } else if (fieldDialog.id) {
      updateFieldMutation.mutate({
        id: fieldDialog.id,
        name: fieldDialog.data.name,
        description: fieldDialog.data.description || null,
        fieldType: fieldDialog.data.fieldType,
        value,
      });
    }
  }

  // Compute derived data - must be called before any early returns (React hooks rules)
  const namespaces = React.useMemo<NamespaceData[]>(
    () => namespacesQuery.data ?? [],
    [namespacesQuery.data],
  );

  const allActiveNamespaces = React.useMemo(
    () => namespaces.filter((ns) => !ns.deletedAt),
    [namespaces],
  );

  const deletedNamespaces = React.useMemo(
    () => namespaces.filter((ns) => ns.deletedAt),
    [namespaces],
  );

  // Filter namespaces based on selected workspace
  // When a workspace is selected: show global namespaces + that workspace's namespaces
  // When "All Workspaces": show all namespaces
  const activeNamespaces = React.useMemo(() => {
    if (selectedWorkspaceId === null) {
      return allActiveNamespaces;
    }
    return allActiveNamespaces.filter(
      (ns) => ns.workspaceId === null || ns.workspaceId === selectedWorkspaceId,
    );
  }, [allActiveNamespaces, selectedWorkspaceId]);

  // Early returns for loading/error states - after all hooks
  if (namespacesQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96 mt-2" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </SettingsPageLayout>
    );
  }

  if (namespacesQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load variables</AlertTitle>
          <AlertDescription>{namespacesQuery.error.message}</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  // Separate global and workspace namespaces for display
  const globalNsList = activeNamespaces.filter((ns) => ns.workspaceId === null);
  const workspaceNsList = activeNamespaces.filter((ns) => ns.workspaceId !== null);

  const mutationError =
    createNamespaceMutation.error ||
    updateNamespaceMutation.error ||
    deleteNamespaceMutation.error ||
    createFieldMutation.error ||
    updateFieldMutation.error ||
    deleteFieldMutation.error;

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <AlertDescription className="text-green-800 dark:text-green-200">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {mutationError && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{mutationError.message}</AlertDescription>
          </Alert>
        )}

        <SettingsCard
          title="Global Variables"
          description="Define variables that can be referenced in policy conditions using NAMESPACE.fieldName syntax."
          actions={
            <Button size="sm" onClick={openCreateNamespace}>
              <Plus className="mr-2 h-4 w-4" />
              New Namespace
            </Button>
          }
        >
          {activeNamespaces.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No namespaces yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Global Namespaces */}
              {globalNsList.length > 0 && (
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    Global Namespaces
                  </h4>
                  <div className="space-y-2">
                    {globalNsList.map((namespace) => (
                      <NamespaceRow
                        key={namespace.id}
                        namespace={namespace}
                        isExpanded={expandedNamespaces.has(namespace.id)}
                        onToggle={() => toggleNamespace(namespace.id)}
                        onEdit={() => openEditNamespace(namespace)}
                        onDelete={() =>
                          setDeleteNamespaceDialog({
                            open: true,
                            id: namespace.id,
                            name: namespace.name,
                          })
                        }
                        onCreateField={() => openCreateField(namespace.id, namespace.name)}
                        onEditField={(field) => openEditField(namespace.id, namespace.name, field)}
                        onDeleteField={(field) =>
                          setDeleteFieldDialog({
                            open: true,
                            id: field.id,
                            name: field.name,
                            namespaceName: namespace.name,
                          })
                        }
                        readOnly={!isOrgOwner}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace Namespaces */}
              {workspaceNsList.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                    Workspace Namespaces
                  </h4>
                  <div className="space-y-2">
                    {workspaceNsList.map((namespace) => (
                      <NamespaceRow
                        key={namespace.id}
                        namespace={namespace}
                        isExpanded={expandedNamespaces.has(namespace.id)}
                        onToggle={() => toggleNamespace(namespace.id)}
                        onEdit={() => openEditNamespace(namespace)}
                        onDelete={() =>
                          setDeleteNamespaceDialog({
                            open: true,
                            id: namespace.id,
                            name: namespace.name,
                          })
                        }
                        onCreateField={() => openCreateField(namespace.id, namespace.name)}
                        onEditField={(field) => openEditField(namespace.id, namespace.name, field)}
                        onDeleteField={(field) =>
                          setDeleteFieldDialog({
                            open: true,
                            id: field.id,
                            name: field.name,
                            namespaceName: namespace.name,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsCard>

        {/* Deleted Namespaces */}
        {deletedNamespaces.length > 0 && (
          <SettingsCard
            title="Deleted Namespaces"
            description="Namespaces that have been deleted can be restored."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedNamespaces.map((namespace) => {
                  const isGlobalReadOnly = namespace.workspaceId === null && !isOrgOwner;
                  return (
                    <TableRow key={namespace.id}>
                      <TableCell>
                        <code>{namespace.name}</code>
                        {namespace.workspaceId === null && (
                          <Badge variant="secondary" className="ml-2">
                            <Globe className="h-3 w-3 mr-1" />
                            Global
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{namespace.fieldCount}</TableCell>
                      <TableCell>
                        {namespace.deletedAt
                          ? new Date(namespace.deletedAt).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {isGlobalReadOnly ? (
                          <span className="text-xs text-muted-foreground">Read-only</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restoreNamespaceMutation.mutate({ id: namespace.id })}
                            disabled={restoreNamespaceMutation.isPending}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </SettingsCard>
        )}
      </div>

      {/* Namespace Dialog */}
      <CrudDialog
        open={namespaceDialog.open}
        onOpenChange={(open) => setNamespaceDialog((d) => ({ ...d, open }))}
        title={namespaceDialog.mode === 'create' ? 'Create Namespace' : 'Edit Namespace'}
        description={
          namespaceDialog.mode === 'create'
            ? 'Create a new namespace to organize global variables.'
            : 'Edit the namespace name or description.'
        }
        mode={namespaceDialog.mode}
        isLoading={createNamespaceMutation.isPending || updateNamespaceMutation.isPending}
        onSubmit={handleNamespaceSubmit}
      >
        <div className="space-y-4">
          {/* Scope selector - only show when creating */}
          {namespaceDialog.mode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="namespace-scope">Scope</Label>
              <Select
                value={namespaceDialog.data.workspaceId ?? 'global'}
                onValueChange={(value) =>
                  setNamespaceDialog((d) => ({
                    ...d,
                    data: { ...d.data, workspaceId: value === 'global' ? null : value },
                  }))
                }
              >
                <SelectTrigger id="namespace-scope">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  {isOrgOwner && (
                    <SelectItem value="global">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Global (all workspaces)
                      </div>
                    </SelectItem>
                  )}
                  {workspaces?.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {namespaceDialog.data.workspaceId === null
                  ? 'Global namespaces are available to all workspaces.'
                  : 'Workspace-scoped namespaces are only available within that workspace.'}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="namespace-name">Name</Label>
            <Input
              id="namespace-name"
              value={namespaceDialog.data.name}
              onChange={(e) =>
                setNamespaceDialog((d) => ({
                  ...d,
                  data: { ...d.data, name: e.target.value.toUpperCase() },
                }))
              }
              placeholder="e.g., COMPANY"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Must be uppercase letters, numbers, and underscores only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="namespace-description">Description (optional)</Label>
            <Textarea
              id="namespace-description"
              value={namespaceDialog.data.description}
              onChange={(e) =>
                setNamespaceDialog((d) => ({
                  ...d,
                  data: { ...d.data, description: e.target.value },
                }))
              }
              placeholder="Describe what variables this namespace contains..."
              rows={2}
            />
          </div>
        </div>

        {(createNamespaceMutation.error || updateNamespaceMutation.error) && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {createNamespaceMutation.error?.message || updateNamespaceMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}
      </CrudDialog>

      {/* Field Dialog */}
      <CrudDialog
        open={fieldDialog.open}
        onOpenChange={(open) => setFieldDialog((d) => ({ ...d, open }))}
        title={
          fieldDialog.mode === 'create'
            ? `Add Field to ${fieldDialog.namespaceName}`
            : `Edit ${fieldDialog.namespaceName}.${fieldDialog.data.name}`
        }
        description={
          fieldDialog.mode === 'create'
            ? 'Add a new field to store a value.'
            : 'Update the field value or type.'
        }
        mode={fieldDialog.mode}
        isLoading={createFieldMutation.isPending || updateFieldMutation.isPending}
        onSubmit={handleFieldSubmit}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field-name">Field Name</Label>
            <Input
              id="field-name"
              value={fieldDialog.data.name}
              onChange={(e) =>
                setFieldDialog((d) => ({
                  ...d,
                  data: { ...d.data, name: e.target.value },
                }))
              }
              placeholder="e.g., creationDate"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Access as:{' '}
              <code>
                {fieldDialog.namespaceName}.{fieldDialog.data.name || 'fieldName'}
              </code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-type">Type</Label>
            <Select
              value={fieldDialog.data.fieldType}
              onValueChange={(value) =>
                setFieldDialog((d) => ({
                  ...d,
                  data: {
                    ...d.data,
                    fieldType: value as FieldType,
                    value: '',
                    booleanValue: false,
                    arrayValues: [],
                  },
                }))
              }
            >
              <SelectTrigger id="field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Value</Label>
            <FieldValueInput
              formData={fieldDialog.data}
              onChange={(updates) =>
                setFieldDialog((d) => ({
                  ...d,
                  data: { ...d.data, ...updates },
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-description">Description (optional)</Label>
            <Textarea
              id="field-description"
              value={fieldDialog.data.description}
              onChange={(e) =>
                setFieldDialog((d) => ({
                  ...d,
                  data: { ...d.data, description: e.target.value },
                }))
              }
              placeholder="Describe what this field represents..."
              rows={2}
            />
          </div>
        </div>

        {(createFieldMutation.error || updateFieldMutation.error) && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {createFieldMutation.error?.message || updateFieldMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}
      </CrudDialog>

      {/* Delete Namespace Confirmation */}
      <DeleteConfirmDialog
        open={deleteNamespaceDialog.open}
        onOpenChange={(open) => setDeleteNamespaceDialog((d) => ({ ...d, open }))}
        title="Delete Namespace"
        description={`Are you sure you want to delete the "${deleteNamespaceDialog.name}" namespace? This will also remove all fields within it. The namespace can be restored later.`}
        isLoading={deleteNamespaceMutation.isPending}
        onConfirm={() => deleteNamespaceMutation.mutate({ id: deleteNamespaceDialog.id })}
      />

      {/* Delete Field Confirmation */}
      <DeleteConfirmDialog
        open={deleteFieldDialog.open}
        onOpenChange={(open) => setDeleteFieldDialog((d) => ({ ...d, open }))}
        title="Delete Field"
        description={`Are you sure you want to delete "${deleteFieldDialog.namespaceName}.${deleteFieldDialog.name}"? This action cannot be undone.`}
        isLoading={deleteFieldMutation.isPending}
        onConfirm={() => deleteFieldMutation.mutate({ id: deleteFieldDialog.id })}
      />
    </SettingsPageLayout>
  );
}
