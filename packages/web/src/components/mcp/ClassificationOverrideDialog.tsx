/**
 * Classification Override Dialog
 * Allows admins to manually override tool classifications
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import type { ToolAccessType, ToolClassification, ToolRiskLevel } from './ToolClassificationBadges';

const RISK_LEVELS: { value: ToolRiskLevel; label: string; description: string }[] = [
  { value: 'LOW', label: 'Low', description: 'Read-only, no sensitive data' },
  { value: 'MEDIUM', label: 'Medium', description: 'May access sensitive data' },
  { value: 'HIGH', label: 'High', description: 'Modifies important data' },
  { value: 'CRITICAL', label: 'Critical', description: 'Executes code, accesses secrets' },
];

const ACCESS_TYPES: { value: ToolAccessType; label: string; description: string }[] = [
  { value: 'READ', label: 'Read', description: 'Only retrieves data' },
  { value: 'WRITE', label: 'Write', description: 'Only modifies data' },
  { value: 'READ_WRITE', label: 'Read/Write', description: 'Both reads and writes' },
];

const overrideSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable(),
  accessType: z.enum(['READ', 'WRITE', 'READ_WRITE']).nullable(),
  useCases: z.string().nullable(),
});

type OverrideFormValues = z.infer<typeof overrideSchema>;

interface ClassificationOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  currentClassification: ToolClassification | null;
  onSubmit: (values: {
    riskLevel?: ToolRiskLevel;
    accessType?: ToolAccessType;
    useCases?: string;
  }) => void;
  onReset?: () => void;
  isSubmitting: boolean;
  isResetting?: boolean;
}

export function ClassificationOverrideDialog({
  open,
  onOpenChange,
  toolName,
  currentClassification,
  onSubmit,
  onReset,
  isSubmitting,
  isResetting,
}: ClassificationOverrideDialogProps): React.ReactElement {
  const form = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideSchema),
    defaultValues: {
      riskLevel: null,
      accessType: null,
      useCases: null,
    },
  });

  // Reset form when dialog opens with current classification
  useEffect(() => {
    if (open && currentClassification) {
      form.reset({
        riskLevel: currentClassification.riskLevel,
        accessType: currentClassification.accessType,
        useCases: currentClassification.useCases,
      });
    } else if (open) {
      form.reset({
        riskLevel: null,
        accessType: null,
        useCases: null,
      });
    }
  }, [open, currentClassification, form]);

  const handleSubmit = form.handleSubmit((values) => {
    const updates: {
      riskLevel?: ToolRiskLevel;
      accessType?: ToolAccessType;
      useCases?: string;
    } = {};

    if (values.riskLevel) {
      updates.riskLevel = values.riskLevel;
    }
    if (values.accessType) {
      updates.accessType = values.accessType;
    }
    if (values.useCases) {
      updates.useCases = values.useCases;
    }

    onSubmit(updates);
  });

  const canReset =
    currentClassification?.source === 'USER_MANUAL' &&
    onReset &&
    (currentClassification.originalRiskLevel ||
      currentClassification.originalAccessType ||
      currentClassification.originalUseCases);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Override Classification</DialogTitle>
          <DialogDescription>
            Manually set the risk level and access type for <strong>{toolName}</strong>
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Risk Level</Label>
            <Controller
              control={form.control}
              name="riskLevel"
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={(value) => field.onChange(value as ToolRiskLevel)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex flex-col">
                          <span>{level.label}</span>
                          <span className="text-xs text-muted-foreground">{level.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Access Type</Label>
            <Controller
              control={form.control}
              name="accessType"
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={(value) => field.onChange(value as ToolAccessType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select access type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Use Cases</Label>
            <Textarea
              placeholder="Describe typical use cases for this tool..."
              {...form.register('useCases')}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Brief description of what this tool is typically used for
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {canReset && (
              <Button
                type="button"
                variant="outline"
                onClick={onReset}
                disabled={isResetting}
                className="sm:mr-auto"
              >
                {isResetting ? 'Resetting...' : 'Reset to Auto'}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Override'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
