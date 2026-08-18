import { useMemo, useState } from 'react';

import { compulsoryNavItems } from '../../../components/layout/nav';
import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { SettingsCard } from '../../../components/settings/SettingsCard';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { usePreferences } from '../../../hooks/PreferencesContext';
import { useNav } from '../../../hooks/useNav';

export default function SettingsNavigation() {
  const { preferences, setPreferences } = usePreferences();
  const { navGroups } = useNav();

  const [draftHiddenItems, setDraftHiddenItems] = useState<string[]>(preferences.hiddenNavItems);

  const hasChanges = useMemo(() => {
    const currentSet = new Set(preferences.hiddenNavItems);
    const draftSet = new Set(draftHiddenItems);
    if (currentSet.size !== draftSet.size) return true;
    for (const item of currentSet) {
      if (!draftSet.has(item)) return true;
    }
    return false;
  }, [preferences.hiddenNavItems, draftHiddenItems]);

  function handleToggleItem(itemPath: string): void {
    setDraftHiddenItems((prev) => {
      const isHidden = prev.includes(itemPath);
      return isHidden ? prev.filter((p) => p !== itemPath) : [...prev, itemPath];
    });
  }

  function handleSave(): void {
    setPreferences({ hiddenNavItems: draftHiddenItems });
  }

  function handleResetDefaults(): void {
    setDraftHiddenItems([]);
  }

  function handleDiscardChanges(): void {
    setDraftHiddenItems(preferences.hiddenNavItems);
  }

  // Filter out empty groups
  const visibleGroups = navGroups.filter((group) => group.items.length > 0);

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        <SettingsCard
          title="Sidebar Items"
          description="Choose which items appear in your navigation sidebar."
          actions={
            <div className="flex gap-2">
              {hasChanges && (
                <Button variant="ghost" size="sm" onClick={handleDiscardChanges}>
                  Discard
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetDefaults}
                disabled={draftHiddenItems.length === 0}
              >
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
                Save
              </Button>
            </div>
          }
        >
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {group.label}
                </p>
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const isCompulsory = compulsoryNavItems.includes(item.to);
                    const isHidden = draftHiddenItems.includes(item.to);
                    return (
                      <label
                        key={item.to}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                          isCompulsory
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          checked={!isHidden}
                          onCheckedChange={() => handleToggleItem(item.to)}
                          disabled={isCompulsory}
                        />
                        <span className="text-sm flex-1">{item.label}</span>
                        {isCompulsory && (
                          <span className="text-xs text-muted-foreground">Required</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
