/**
 * TagFilterSelector Component
 * Modal-based multi-select for filtering policies by tags
 */

import { Search, X } from 'lucide-react';
import { useCallback, useMemo, useState, type JSX } from 'react';

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
import { ScrollArea } from '../ui/scroll-area';

export interface FilterTag {
  id?: string;
  name?: string;
  description?: string | null;
  color?: string;
  workspaceId?: string | null;
  workspace?: { id: string; name: string } | null;
}

export interface TagFilterSelectorProps {
  /** Available tags to filter by */
  tags: FilterTag[];
  /** Currently selected tag IDs for filtering */
  selectedTagIds: string[];
  /** Callback when selection changes */
  onChange: (tagIds: string[]) => void;
  /** Optional label */
  label?: string;
  /** Optional description */
  description?: string;
}

/**
 * Modal-based multi-select for filtering by tags
 */
// Type guard to filter out tags without required fields
interface ValidTag extends FilterTag {
  id: string;
  name: string;
  color: string;
}

function isValidTag(tag: FilterTag): tag is ValidTag {
  return Boolean(tag.id && tag.name && tag.color);
}

export function TagFilterSelector({
  tags,
  selectedTagIds,
  onChange,
  label = 'Tags',
  description,
}: TagFilterSelectorProps): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());

  // Filter to only valid tags
  const validTags = useMemo(() => tags.filter(isValidTag), [tags]);

  const selectedTags = validTags.filter((t) => selectedTagIds.includes(t.id));

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return validTags;

    return validTags.filter((tag) => {
      const matchesName = tag.name.toLowerCase().includes(query);
      const matchesDescription = tag.description?.toLowerCase().includes(query);
      return matchesName || matchesDescription;
    });
  }, [validTags, searchQuery]);

  // Group tags by workspace
  const groupedTags = useMemo(() => {
    const groups: { label: string; tags: ValidTag[] }[] = [];
    const globalTags = filteredTags.filter((t) => !t.workspaceId);
    const workspaceTags = filteredTags.filter((t) => t.workspaceId);

    if (globalTags.length > 0) {
      groups.push({ label: 'Global', tags: globalTags });
    }

    const workspaceMap = new Map<string, ValidTag[]>();
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

  // Clear all selections
  function handleClearAll(): void {
    setLocalSelectedIds(new Set());
  }

  // Select all visible tags
  function handleSelectAll(): void {
    setLocalSelectedIds(new Set(filteredTags.map((t) => t.id)));
  }

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
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
          Edit
        </Button>
      </div>

      {/* Tag selection modal */}
      <Dialog open={modalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Filter by Tags</DialogTitle>
            <DialogDescription>
              Select tags to filter policies. Policies with any selected tag will be shown.
            </DialogDescription>
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

          {/* Selection count and quick actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {localSelectedIds.size} of {validTags.length} tags selected
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSelectAll}
                disabled={filteredTags.length === 0}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClearAll}
                disabled={localSelectedIds.size === 0}
              >
                Clear
              </Button>
            </div>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDone}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
