import type { CredentialEntry, CredentialEntryType } from '../../lib/credentials';
import { createEmptyEntry, inferEntryType, isCredentialEntryType } from '../../lib/credentials';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';

const entryTypes: Array<{ value: CredentialEntryType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'password', label: 'Password' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
];

function getInputType(entryType: CredentialEntryType): 'password' | 'number' | 'text' {
  switch (entryType) {
    case 'password':
      return 'password';
    case 'number':
      return 'number';
    default:
      return 'text';
  }
}

interface ValueInputProps {
  entry: CredentialEntry;
  onValueChange: (value: string) => void;
}

function ValueInput({ entry, onValueChange }: ValueInputProps): React.ReactElement {
  if (entry.type === 'json') {
    return (
      <Textarea
        value={entry.value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder="{}"
        className="min-h-[80px] text-xs font-mono"
      />
    );
  }

  if (entry.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-2">
        <Switch
          checked={entry.value === 'true'}
          onCheckedChange={(checked) => onValueChange(checked ? 'true' : 'false')}
        />
        <span className="text-xs text-muted-foreground">
          {entry.value === 'true' ? 'True' : 'False'}
        </span>
      </div>
    );
  }

  return (
    <Input
      value={entry.value}
      type={getInputType(entry.type)}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={entry.type === 'number' ? '0' : 'value'}
      className={entry.type === 'password' ? 'font-mono text-sm' : 'text-sm'}
    />
  );
}

interface KeyValueEditorProps {
  entries: CredentialEntry[];
  onChange: (entries: CredentialEntry[]) => void;
  title: string;
  description?: string;
  emptyLabel?: string;
  addLabel?: string;
}

export function KeyValueEditor({
  entries,
  onChange,
  title,
  description,
  emptyLabel = 'No entries added yet.',
  addLabel = 'Add entry',
}: KeyValueEditorProps) {
  const updateEntry = (index: number, patch: Partial<CredentialEntry>) => {
    const next = [...entries];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const next = [...entries];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1.2fr_1.2fr_140px_auto]"
            >
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Key</Label>
                <Input
                  value={entry.key}
                  onChange={(event) => {
                    const nextKey = event.target.value;
                    let nextType = entry.type;
                    if (entry.type === 'text' || entry.type === 'password') {
                      const inferred = inferEntryType(nextKey, entry.value);
                      if (inferred === 'text' || inferred === 'password') {
                        nextType = inferred;
                      }
                    }
                    updateEntry(index, { key: nextKey, type: nextType });
                  }}
                  placeholder="credential_key"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Value</Label>
                <ValueInput
                  entry={entry}
                  onValueChange={(value) => updateEntry(index, { value })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select
                  value={entry.type}
                  onValueChange={(value) => {
                    if (isCredentialEntryType(value)) {
                      updateEntry(index, { type: value });
                    }
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {entryTypes.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start justify-end pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEntry(index)}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entries, createEmptyEntry()])}
      >
        {addLabel}
      </Button>
    </div>
  );
}
