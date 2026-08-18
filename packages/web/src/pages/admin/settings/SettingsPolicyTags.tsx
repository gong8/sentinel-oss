import { Check, Edit2, Globe, Pipette, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { SettingsCard } from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { Textarea } from '../../../components/ui/textarea';
import { useWorkspace } from '../../../hooks/WorkspaceContext';
import { trpc } from '../../../lib/trpc';

// Preset colors for quick selection
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#78716c', // stone
];

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to HSL for better perceptual distance calculation
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Calculate perceptual color distance using HSL
 * Hue difference is weighted more heavily for distinctiveness
 */
function colorDistance(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const hsl1 = rgbToHsl(rgb1.r, rgb1.g, rgb1.b);
  const hsl2 = rgbToHsl(rgb2.r, rgb2.g, rgb2.b);

  // Circular hue distance (0-180)
  let hueDiff = Math.abs(hsl1.h - hsl2.h);
  if (hueDiff > 180) hueDiff = 360 - hueDiff;

  const satDiff = Math.abs(hsl1.s - hsl2.s);
  const lightDiff = Math.abs(hsl1.l - hsl2.l);

  // Weight hue more heavily for visual distinctiveness
  return hueDiff * 2 + satDiff + lightDiff;
}

/**
 * Find the most distinct color from a list of existing colors
 */
function findMostDistinctColor(existingColors: string[]): string {
  if (existingColors.length === 0) {
    return PRESET_COLORS[0];
  }

  let bestColor = PRESET_COLORS[0];
  let bestMinDistance = 0;

  for (const candidate of PRESET_COLORS) {
    // Find minimum distance to any existing color
    let minDistance = Infinity;
    for (const existing of existingColors) {
      const dist = colorDistance(candidate, existing);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
    // Keep the candidate with the highest minimum distance
    if (minDistance > bestMinDistance) {
      bestMinDistance = minDistance;
      bestColor = candidate;
    }
  }

  return bestColor;
}

interface PolicyTag {
  id: string;
  name: string;
  description: string | null;
  color: string;
  workspaceId: string | null;
  workspace?: { name: string } | null;
  _count?: { policies: number };
}

interface TagFormData {
  name: string;
  description: string;
  color: string;
  workspaceId: string | null;
}

export default function SettingsPolicyTags() {
  const utils = trpc.useUtils();
  const { isOrgOwner, workspaces, selectedWorkspaceId } = useWorkspace();
  const tagsQuery = trpc.admin.policyTags.list.useQuery();

  const createMutation = trpc.admin.policyTags.create.useMutation({
    onSuccess: () => {
      utils.admin.policyTags.list.invalidate();
      setIsCreateOpen(false);
      resetForm();
      setSuccessMessage('Tag created successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const updateMutation = trpc.admin.policyTags.update.useMutation({
    onSuccess: () => {
      utils.admin.policyTags.list.invalidate();
      setEditingTag(null);
      resetForm();
      setSuccessMessage('Tag updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const deleteMutation = trpc.admin.policyTags.delete.useMutation({
    onSuccess: () => {
      utils.admin.policyTags.list.invalidate();
      setDeletingTag(null);
      setSuccessMessage('Tag deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingTag, setEditingTag] = React.useState<PolicyTag | null>(null);
  const [deletingTag, setDeletingTag] = React.useState<PolicyTag | null>(null);
  // For org-owners in a workspace context, default to that workspace; otherwise global
  // For non-org-owners, default to their first workspace
  const defaultWorkspaceId = isOrgOwner ? selectedWorkspaceId : (workspaces?.[0]?.id ?? null);

  const [formData, setFormData] = React.useState<TagFormData>({
    name: '',
    description: '',
    color: PRESET_COLORS[0],
    workspaceId: defaultWorkspaceId,
  });

  function resetForm(): void {
    setFormData({
      name: '',
      description: '',
      color: PRESET_COLORS[0],
      workspaceId: defaultWorkspaceId,
    });
  }

  function handleOpenCreate(): void {
    const existingColors = (tagsQuery.data || []).map((t) => t.color);
    const distinctColor = findMostDistinctColor(existingColors);
    setFormData({
      name: '',
      description: '',
      color: distinctColor,
      workspaceId: defaultWorkspaceId,
    });
    setIsCreateOpen(true);
  }

  function handleOpenEdit(tag: PolicyTag): void {
    setFormData({
      name: tag.name,
      description: tag.description || '',
      color: tag.color,
      workspaceId: tag.workspaceId,
    });
    setEditingTag(tag);
  }

  function handleCreate(): void {
    if (!formData.name.trim()) return;
    // Non-org-owners must select a workspace
    if (!isOrgOwner && !formData.workspaceId) return;
    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      workspaceId: formData.workspaceId,
    });
  }

  function handleUpdate(): void {
    if (!editingTag || !formData.name.trim()) return;
    updateMutation.mutate({
      id: editingTag.id,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      color: formData.color,
    });
  }

  function handleDelete(): void {
    if (!deletingTag) return;
    deleteMutation.mutate({ id: deletingTag.id });
  }

  if (tagsQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="Policy Tags" description="Loading...">
            <Skeleton className="h-32 w-full" />
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  if (tagsQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load tags</AlertTitle>
          <AlertDescription>{tagsQuery.error.message}</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  const tags = tagsQuery.data || [];
  const globalTags = tags.filter((t) => t.workspaceId === null);
  const workspaceTags = tags.filter((t) => t.workspaceId !== null);

  const mutationError = createMutation.error || updateMutation.error || deleteMutation.error;

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
          title="Policy Tags"
          description="Manage tags to organize and categorize your policies. Global tags can be used across all workspaces."
          actions={
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Tag
            </Button>
          }
        >
          {tags.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No policy tags yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Global Tags */}
              {globalTags.length > 0 && (
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    Global Tags
                  </h4>
                  <div className="space-y-2">
                    {globalTags.map((tag) => (
                      <TagRow
                        key={tag.id}
                        tag={tag}
                        onEdit={() => handleOpenEdit(tag)}
                        onDelete={() => setDeletingTag(tag)}
                        canEdit={isOrgOwner}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace Tags */}
              {workspaceTags.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">Workspace Tags</h4>
                  <div className="space-y-2">
                    {workspaceTags.map((tag) => (
                      <TagRow
                        key={tag.id}
                        tag={tag}
                        onEdit={() => handleOpenEdit(tag)}
                        onDelete={() => setDeletingTag(tag)}
                        canEdit={
                          isOrgOwner || (workspaces ?? []).some((ws) => ws.id === tag.workspaceId)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Policy Tag</DialogTitle>
            <DialogDescription>
              {isOrgOwner
                ? 'Create a new tag. Global tags can be used across all workspaces.'
                : 'Create a new tag for a workspace you have access to.'}
            </DialogDescription>
          </DialogHeader>
          <TagForm
            data={formData}
            onChange={setFormData}
            isPending={createMutation.isPending}
            showWorkspaceSelector
            isOrgOwner={isOrgOwner}
            workspaces={workspaces}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !formData.name.trim() ||
                (!isOrgOwner && !formData.workspaceId)
              }
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Policy Tag</DialogTitle>
            <DialogDescription>Update the tag name, description, or color.</DialogDescription>
          </DialogHeader>
          <TagForm data={formData} onChange={setFormData} isPending={updateMutation.isPending} />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditingTag(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formData.name.trim()}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTag} onOpenChange={(open) => !open && setDeletingTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Policy Tag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the tag &quot;{deletingTag?.name}&quot;? This will
              remove it from all policies that use it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeletingTag(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
}

interface TagRowProps {
  tag: PolicyTag;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}

function TagRow({ tag, onEdit, onDelete, canEdit }: TagRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{tag.name}</span>
            {tag._count?.policies !== undefined && tag._count.policies > 0 && (
              <Badge variant="secondary" className="text-xs">
                {tag._count.policies} {tag._count.policies === 1 ? 'policy' : 'policies'}
              </Badge>
            )}
          </div>
          {tag.description && <p className="text-sm text-muted-foreground">{tag.description}</p>}
          {tag.workspace && (
            <p className="text-xs text-muted-foreground">Workspace: {tag.workspace.name}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {canEdit ? (
          <>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Read-only
          </Badge>
        )}
      </div>
    </div>
  );
}

interface Workspace {
  id: string;
  name: string;
}

interface TagFormProps {
  data: TagFormData;
  onChange: (data: TagFormData) => void;
  isPending: boolean;
  showWorkspaceSelector?: boolean;
  isOrgOwner?: boolean;
  workspaces?: Workspace[];
}

function TagForm({
  data,
  onChange,
  isPending,
  showWorkspaceSelector = false,
  isOrgOwner = false,
  workspaces = [],
}: TagFormProps) {
  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tag-name">Name</Label>
        <Input
          id="tag-name"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g., Production, Read-Only, Sensitive"
          maxLength={50}
          disabled={isPending}
        />
      </div>
      {showWorkspaceSelector && (
        <div className="space-y-2">
          <Label htmlFor="tag-scope">Scope</Label>
          <Select
            value={data.workspaceId ?? 'global'}
            onValueChange={(value) =>
              onChange({ ...data, workspaceId: value === 'global' ? null : value })
            }
            disabled={isPending}
          >
            <SelectTrigger id="tag-scope">
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
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {data.workspaceId === null
              ? 'Global tags can be used across all workspaces.'
              : 'Workspace tags are only available within that workspace.'}
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="tag-description">Description (optional)</Label>
        <Textarea
          id="tag-description"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Describe what this tag is used for..."
          maxLength={200}
          rows={2}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label>Color</Label>
        <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-3" disabled={isPending}>
              <div className="h-5 w-5 rounded-md border" style={{ backgroundColor: data.color }} />
              <span className="font-mono text-sm">{data.color.toUpperCase()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              {/* Preset colors grid */}
              <div className="grid grid-cols-6 gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="group relative h-7 w-7 rounded-md border border-border transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      onChange({ ...data, color });
                      setIsColorPickerOpen(false);
                    }}
                    disabled={isPending}
                  >
                    {data.color.toLowerCase() === color.toLowerCase() && (
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-popover px-2 text-muted-foreground">or custom</span>
                </div>
              </div>

              {/* Custom color picker */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    value={data.color.toUpperCase()}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (!val.startsWith('#')) val = '#' + val;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        onChange({ ...data, color: val });
                      }
                    }}
                    className="font-mono text-sm pr-10"
                    placeholder="#000000"
                    maxLength={7}
                    disabled={isPending}
                  />
                  <div
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded border"
                    style={{ backgroundColor: data.color }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => colorInputRef.current?.click()}
                  disabled={isPending}
                >
                  <Pipette className="h-4 w-4" />
                </Button>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={data.color}
                  onChange={(e) => onChange({ ...data, color: e.target.value })}
                  className="sr-only"
                  disabled={isPending}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
