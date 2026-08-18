/**
 * ContextOverridesEditor Component
 * For overriding context values like time, day, and IP address
 */

import type { JSX } from 'react';
import { useCallback } from 'react';

import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { ContextOverrides } from './types';

interface ContextOverridesEditorProps {
  value: ContextOverrides;
  onChange: (value: ContextOverrides) => void;
  disabled?: boolean;
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${i.toString().padStart(2, '0')}:00`,
}));

export function ContextOverridesEditor({
  value,
  onChange,
  disabled = false,
}: ContextOverridesEditorProps): JSX.Element {
  const updateField = useCallback(
    <K extends keyof ContextOverrides>(field: K, fieldValue: ContextOverrides[K]) => {
      onChange({ ...value, [field]: fieldValue });
    },
    [value, onChange],
  );

  const clearField = useCallback(
    (field: keyof ContextOverrides) => {
      const newValue = { ...value };
      delete newValue[field];
      onChange(newValue);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Override runtime context values for testing time-based and IP-based conditions.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Hour of Day */}
        <div className="space-y-2">
          <Label htmlFor="hourOfDay">Hour of Day</Label>
          <Select
            value={value.hourOfDay !== undefined ? String(value.hourOfDay) : '__none__'}
            onValueChange={(v) => {
              if (v === '__none__') {
                clearField('hourOfDay');
              } else {
                updateField('hourOfDay', parseInt(v, 10));
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="hourOfDay">
              <SelectValue placeholder="Current time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Use current time</SelectItem>
              {HOURS_OF_DAY.map((hour) => (
                <SelectItem key={hour.value} value={hour.value}>
                  {hour.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            For testing <code className="bg-muted px-1 py-0.5 rounded">time.hourOfDay</code>
          </p>
        </div>

        {/* Day of Week */}
        <div className="space-y-2">
          <Label htmlFor="dayOfWeek">Day of Week</Label>
          <Select
            value={value.dayOfWeek !== undefined ? String(value.dayOfWeek) : '__none__'}
            onValueChange={(v) => {
              if (v === '__none__') {
                clearField('dayOfWeek');
              } else {
                updateField('dayOfWeek', parseInt(v, 10));
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="dayOfWeek">
              <SelectValue placeholder="Current day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Use current day</SelectItem>
              {DAYS_OF_WEEK.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            For testing <code className="bg-muted px-1 py-0.5 rounded">time.dayOfWeek</code>
          </p>
        </div>

        {/* Source IP */}
        <div className="space-y-2">
          <Label htmlFor="sourceIp">Source IP</Label>
          <Input
            id="sourceIp"
            value={value.sourceIp ?? ''}
            onChange={(e) => {
              if (e.target.value === '') {
                clearField('sourceIp');
              } else {
                updateField('sourceIp', e.target.value);
              }
            }}
            placeholder="e.g., 192.168.1.100"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            For testing <code className="bg-muted px-1 py-0.5 rounded">network.sourceIp</code> and
            CIDR conditions
          </p>
        </div>

        {/* Timestamp */}
        <div className="space-y-2">
          <Label htmlFor="timestamp">Timestamp</Label>
          <Input
            id="timestamp"
            type="datetime-local"
            value={value.timestamp ? value.timestamp.slice(0, 16) : ''}
            onChange={(e) => {
              if (e.target.value === '') {
                clearField('timestamp');
              } else {
                // Convert to ISO string
                updateField('timestamp', new Date(e.target.value).toISOString());
              }
            }}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            For testing <code className="bg-muted px-1 py-0.5 rounded">time.timestamp</code>{' '}
            conditions
          </p>
        </div>
      </div>
    </div>
  );
}
