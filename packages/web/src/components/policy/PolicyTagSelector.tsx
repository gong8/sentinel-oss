/**
 * PolicyTagSelector Component
 * Modal-based multi-select for policy tags with search and nested create modal
 */

import { Check, Globe, Pencil, Pipette, Plus, Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type JSX } from 'react';

import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

export interface PolicyTag {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  workspaceId?: string | null;
  workspace?: { id: string; name: string } | null;
}

export interface PolicyTagSelectorProps {
  /** Available tags to select from */
  tags: PolicyTag[];
  /** Currently selected tag IDs */
  selectedTagIds: string[];
  /** Callback when selection changes */
  onChange: (tagIds: string[]) => void;
  /** Callback to create a new tag inline */
  onCreateTag?: (tag: {
    name: string;
    description?: string;
    color: string;
    workspaceId?: string | null;
  }) => Promise<PolicyTag>;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Optional label */
  label?: string;
  /** Optional description */
  description?: string;
  /** Whether the component is in read-only mode */
  readOnly?: boolean;
  /** Whether a tag is currently being created */
  isCreating?: boolean;
  /** Workspace ID for scoping new tags (null = global, requires org owner) */
  workspaceId?: string | null;
  /** Whether the user is an org owner (can create global tags) */
  isOrgOwner?: boolean;
  /** Available workspaces for scope selection */
  workspaces?: Array<{ id: string; name: string }>;
}

// Preset colors matching settings page
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
 */
function colorDistance(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const hsl1 = rgbToHsl(rgb1.r, rgb1.g, rgb1.b);
  const hsl2 = rgbToHsl(rgb2.r, rgb2.g, rgb2.b);

  let hueDiff = Math.abs(hsl1.h - hsl2.h);
  if (hueDiff > 180) hueDiff = 360 - hueDiff;

  const satDiff = Math.abs(hsl1.s - hsl2.s);
  const lightDiff = Math.abs(hsl1.l - hsl2.l);

  return hueDiff * 2 + satDiff + lightDiff;
}

/**
 * Find the most distinct color from existing colors
 */
function findMostDistinctColor(existingColors: string[]): string {
  if (existingColors.length === 0) {
    return PRESET_COLORS[0];
  }

  let bestColor = PRESET_COLORS[0];
  let bestMinDistance = 0;

  for (const candidate of PRESET_COLORS) {
    let minDistance = Infinity;
    for (const existing of existingColors) {
      const dist = colorDistance(candidate, existing);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
    if (minDistance > bestMinDistance) {
      bestMinDistance = minDistance;
      bestColor = candidate;
    }
  }

  return bestColor;
}

/**
 * Multi-select modal for policy tags with search and inline creation
 */
export function PolicyTagSelector({
  tags,
  selectedTagIds,
  onChange,
  onCreateTag,
  disabled = false,
  label = 'Tags',
  description,
  readOnly = false,
  isCreating = false,
  workspaceId,
  isOrgOwner = false,
  workspaces = [],
}: PolicyTagSelectorProps): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());

  // Create tag form state
  const [newTagName, setNewTagName] = useState('');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [newTagWorkspaceId, setNewTagWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return tags;

    return tags.filter((tag) => {
      const matchesName = tag.name.toLowerCase().includes(query);
      const matchesDescription = tag.description?.toLowerCase().includes(query);
      const matchesWorkspace = tag.workspace?.name.toLowerCase().includes(query);
      return matchesName || matchesDescription || matchesWorkspace;
    });
  }, [tags, searchQuery]);

  // Group tags by workspace
  const groupedTags = useMemo(() => {
    const groups: { label: string; tags: PolicyTag[] }[] = [];
    const globalTags = filteredTags.filter((t) => !t.workspaceId);
    const workspaceTags = filteredTags.filter((t) => t.workspaceId);

    if (globalTags.length > 0) {
      groups.push({ label: 'Global', tags: globalTags });
    }

    const workspaceMap = new Map<string, PolicyTag[]>();
    for (const tag of workspaceTags) {
      const wsName = tag.workspace?.name ?? 'Unknown Workspace';
      if (!workspaceMap.has(wsName)) {
        workspaceMap.set(wsName, []);
      }
      workspaceMap.get(wsName)!.push(tag);
    }

    for (const [wsName, wsTags] of workspaceMap) {
      groups.push({ label: wsName, tags: wsTags });
    }

    return groups;
  }, [filteredTags]);

  // Handle modal open - initialize local state
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setLocalSelectedIds(new Set(selectedTagIds));
        setSearchQuery('');
      }
      setModalOpen(open);
    },
    [selectedTagIds],
  );

  // Toggle tag selection in modal
  function handleToggleTag(tagId: string): void {
    setLocalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  // Handle done - apply selection
  function handleDone(): void {
    onChange(Array.from(localSelectedIds));
    setModalOpen(false);
  }

  // Handle cancel
  function handleCancel(): void {
    setModalOpen(false);
  }

  // Remove tag from selection (from display badge)
  function handleRemoveTag(tagId: string): void {
    onChange(selectedTagIds.filter((id) => id !== tagId));
  }

  // Open create modal
  function handleOpenCreateModal(): void {
    const existingColors = tags.map((t) => t.color);
    const distinctColor = findMostDistinctColor(existingColors);
    setNewTagName('');
    setNewTagDescription('');
    setNewTagColor(distinctColor);
    setNewTagWorkspaceId(workspaceId ?? null);
    setCreateError(null);
    setIsColorPickerOpen(false);
    setCreateModalOpen(true);
  }

  // Create tag
  async function handleCreateTag(): Promise<void> {
    if (!onCreateTag || !newTagName.trim()) return;
    if (!isOrgOwner && !newTagWorkspaceId) return;

    setCreateError(null);
    try {
      const created = await onCreateTag({
        name: newTagName.trim(),
        description: newTagDescription.trim() || undefined,
        color: newTagColor,
        workspaceId: newTagWorkspaceId,
      });
      // Add the new tag to local selection
      setLocalSelectedIds((prev) => new Set([...prev, created.id]));
      setCreateModalOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create tag');
    }
  }

  const canCreateTag = onCreateTag && (isOrgOwner || workspaceId);
  const showWorkspaceSelector = isOrgOwner || workspaces.length > 1;

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {/* Display selected tags + edit button */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-h-9 flex items-center">
          {selectedTags.length === 0 ? (
            <span className="text-sm text-muted-foreground">No tags selected</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="flex items-center gap-1"
                  style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                  {!readOnly && !disabled && (
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={() => handleRemoveTag(tag.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {!readOnly && !disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Tag selection modal */}
      <Dialog open={modalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Select Tags</DialogTitle>
            <DialogDescription>Choose tags to organize this policy</DialogDescription>
          </DialogHeader>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Selection count */}
          <div className="text-sm text-muted-foreground">
            {localSelectedIds.size} of {tags.length} tags selected
          </div>

          {/* Tag list */}
          <ScrollArea className="h-[300px] border rounded-lg">
            <div className="p-2 space-y-3">
              {filteredTags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searchQuery ? 'No tags match your search' : 'No tags available'}
                </p>
              ) : (
                groupedTags.map((group) => (
                  <div key={group.label} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 sticky top-0 bg-background">
                      {group.label}
                    </div>
                    {group.tags.map((tag) => (
                      <label
                        key={tag.id}
                        className={cn(
                          'flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-accent transition-colors',
                          localSelectedIds.has(tag.id) && 'bg-accent',
                        )}
                      >
                        <Checkbox
                          checked={localSelectedIds.has(tag.id)}
                          onCheckedChange={() => handleToggleTag(tag.id)}
                        />
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">{tag.name}</span>
                          {tag.description && (
                            <span className="text-xs text-muted-foreground truncate block">
                              {tag.description}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {canCreateTag && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={handleOpenCreateModal}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Tag
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={handleDone}>
                Done
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create tag modal - matching settings page style */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Policy Tag</DialogTitle>
            <DialogDescription>
              {isOrgOwner
                ? 'Create a new tag. Global tags can be used across all workspaces.'
                : 'Create a new tag for a workspace you have access to.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="create-tag-name">Name</Label>
              <Input
                id="create-tag-name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g., Production, Read-Only, Sensitive"
                maxLength={50}
                disabled={isCreating}
                autoFocus
              />
            </div>

            {/* Scope selector */}
            {showWorkspaceSelector && (
              <div className="space-y-2">
                <Label htmlFor="create-tag-scope">Scope</Label>
                <Select
                  value={newTagWorkspaceId ?? 'global'}
                  onValueChange={(value) => setNewTagWorkspaceId(value === 'global' ? null : value)}
                  disabled={isCreating}
                >
                  <SelectTrigger id="create-tag-scope">
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
                  {newTagWorkspaceId === null
                    ? 'Global tags can be used across all workspaces.'
                    : 'Workspace tags are only available within that workspace.'}
                </p>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="create-tag-description">Description (optional)</Label>
              <Textarea
                id="create-tag-description"
                value={newTagDescription}
                onChange={(e) => setNewTagDescription(e.target.value)}
                placeholder="Describe what this tag is used for..."
                maxLength={200}
                rows={2}
                disabled={isCreating}
              />
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <Label>Color</Label>
              <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    disabled={isCreating}
                  >
                    <div
                      className="h-5 w-5 rounded-md border"
                      style={{ backgroundColor: newTagColor }}
                    />
                    <span className="font-mono text-sm">{newTagColor.toUpperCase()}</span>
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
                            setNewTagColor(color);
                            setIsColorPickerOpen(false);
                          }}
                          disabled={isCreating}
                        >
                          {newTagColor.toLowerCase() === color.toLowerCase() && (
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
                          value={newTagColor.toUpperCase()}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (!val.startsWith('#')) val = '#' + val;
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                              setNewTagColor(val);
                            }
                          }}
                          className="font-mono text-sm pr-10"
                          placeholder="#000000"
                          maxLength={7}
                          disabled={isCreating}
                        />
                        <div
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded border"
                          style={{ backgroundColor: newTagColor }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => colorInputRef.current?.click()}
                        disabled={isCreating}
                      >
                        <Pipette className="h-4 w-4" />
                      </Button>
                      <input
                        ref={colorInputRef}
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="sr-only"
                        disabled={isCreating}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={isCreating || !newTagName.trim() || (!isOrgOwner && !newTagWorkspaceId)}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
