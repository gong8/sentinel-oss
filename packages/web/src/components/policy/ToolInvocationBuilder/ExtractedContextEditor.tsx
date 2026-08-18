/**
 * ExtractedContextEditor Component
 * For configuring SQL, GitHub, and File extracted context values
 */

import type { JSX } from 'react';
import { useCallback } from 'react';

import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import type {
  ExtractedContext,
  ExtractedMode,
  FileExtractedContext,
  GithubExtractedContext,
  SqlExtractedContext,
  ToolCategory,
} from './types';

interface ExtractedContextEditorProps {
  value: ExtractedContext;
  onChange: (value: ExtractedContext) => void;
  mode: ExtractedMode;
  onModeChange: (mode: ExtractedMode) => void;
  toolCategory: ToolCategory;
  disabled?: boolean;
}

const SQL_OPERATIONS = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
];

export function ExtractedContextEditor({
  value,
  onChange,
  mode,
  onModeChange,
  toolCategory,
  disabled = false,
}: ExtractedContextEditorProps): JSX.Element {
  // SQL context handlers
  const updateSql = useCallback(
    (
      field: keyof SqlExtractedContext,
      fieldValue: SqlExtractedContext[keyof SqlExtractedContext],
    ) => {
      onChange({
        ...value,
        sql: { ...value.sql, [field]: fieldValue },
      });
    },
    [value, onChange],
  );

  // GitHub context handlers
  const updateGithub = useCallback(
    (
      field: keyof GithubExtractedContext,
      fieldValue: GithubExtractedContext[keyof GithubExtractedContext],
    ) => {
      onChange({
        ...value,
        github: { ...value.github, [field]: fieldValue },
      });
    },
    [value, onChange],
  );

  // File context handlers
  const updateFile = useCallback(
    (
      field: keyof FileExtractedContext,
      fieldValue: FileExtractedContext[keyof FileExtractedContext],
    ) => {
      onChange({
        ...value,
        file: { ...value.file, [field]: fieldValue },
      });
    },
    [value, onChange],
  );

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Extraction Mode</Label>
          <p className="text-xs text-muted-foreground">
            {mode === 'auto'
              ? 'Context is automatically extracted from parameters'
              : 'Manually specify extracted context values'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${mode === 'auto' ? 'font-medium' : 'text-muted-foreground'}`}>
            Auto
          </span>
          <Switch
            checked={mode === 'manual'}
            onCheckedChange={(checked) => onModeChange(checked ? 'manual' : 'auto')}
            disabled={disabled}
          />
          <span
            className={`text-sm ${mode === 'manual' ? 'font-medium' : 'text-muted-foreground'}`}
          >
            Manual
          </span>
        </div>
      </div>

      {mode === 'manual' && (
        <div className="space-y-6 pt-2">
          {/* SQL Context */}
          {(toolCategory === 'sql' || toolCategory === null) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">SQL Context</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sqlOperation">Operation</Label>
                  <Select
                    value={value.sql?.sqlOperation ?? '__none__'}
                    onValueChange={(v) =>
                      updateSql('sqlOperation', v === '__none__' ? undefined : v)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id="sqlOperation">
                      <SelectValue placeholder="Select operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      {SQL_OPERATIONS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sqlTables">Tables (comma-separated)</Label>
                  <Input
                    id="sqlTables"
                    value={value.sql?.sqlTables?.join(', ') ?? ''}
                    onChange={(e) => {
                      const tables = e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean);
                      updateSql('sqlTables', tables.length > 0 ? tables : undefined);
                    }}
                    placeholder="users, orders"
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center gap-2 col-span-full">
                  <Switch
                    id="hasSqlComment"
                    checked={value.sql?.hasSqlComment ?? false}
                    onCheckedChange={(checked) => updateSql('hasSqlComment', checked || undefined)}
                    disabled={disabled}
                  />
                  <Label htmlFor="hasSqlComment">Has SQL Comment</Label>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Context */}
          {(toolCategory === 'github' || toolCategory === null) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">GitHub Context</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gitRepository">Repository</Label>
                  <Input
                    id="gitRepository"
                    value={value.github?.gitRepository ?? ''}
                    onChange={(e) => updateGithub('gitRepository', e.target.value || undefined)}
                    placeholder="my-repo"
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gitBranch">Branch</Label>
                  <Input
                    id="gitBranch"
                    value={value.github?.gitBranch ?? ''}
                    onChange={(e) => updateGithub('gitBranch', e.target.value || undefined)}
                    placeholder="main"
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gitOwner">Owner</Label>
                  <Input
                    id="gitOwner"
                    value={value.github?.gitOwner ?? ''}
                    onChange={(e) => updateGithub('gitOwner', e.target.value || undefined)}
                    placeholder="organization"
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="isProtectedBranch"
                    checked={value.github?.isProtectedBranch ?? false}
                    onCheckedChange={(checked) =>
                      updateGithub('isProtectedBranch', checked || undefined)
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor="isProtectedBranch">Protected Branch</Label>
                </div>
              </div>
            </div>
          )}

          {/* File Context */}
          {(toolCategory === 'file' || toolCategory === null) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">File Context</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="filePath">File Path</Label>
                  <Input
                    id="filePath"
                    value={value.file?.filePath ?? ''}
                    onChange={(e) => updateFile('filePath', e.target.value || undefined)}
                    placeholder="/path/to/file.txt"
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fileExtension">File Extension</Label>
                  <Input
                    id="fileExtension"
                    value={value.file?.fileExtension ?? ''}
                    onChange={(e) => updateFile('fileExtension', e.target.value || undefined)}
                    placeholder="txt"
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center gap-2 col-span-full">
                  <Switch
                    id="isSensitivePath"
                    checked={value.file?.isSensitivePath ?? false}
                    onCheckedChange={(checked) =>
                      updateFile('isSensitivePath', checked || undefined)
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor="isSensitivePath">Sensitive Path</Label>
                </div>
              </div>
            </div>
          )}

          {toolCategory === null && (
            <p className="text-xs text-muted-foreground">
              All context categories shown. Select a specific tool to show relevant context only.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
