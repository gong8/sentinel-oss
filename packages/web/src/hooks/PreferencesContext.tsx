import * as React from 'react';
import { z } from 'zod';

const PREFERENCES_STORAGE_KEY = 'sentinel-user-preferences';

const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  sidebarCompact: z.boolean().default(false),
  hiddenNavItems: z.array(z.string()).default([]),
  collapsedNavGroups: z.array(z.string()).default([]),
  defaultPage: z.string().optional(),
  dashboardPanels: z
    .record(z.string(), z.object({ visible: z.boolean(), order: z.number() }))
    .optional(),
  dashboardRefreshRate: z.number().default(1000),
  // Default workspace to open on login - can be workspace ID or 'global' for org owners
  defaultWorkspaceId: z.string().optional(),
  // Enable colored bracket matching in advanced expression editor (default: true)
  bracketMatchingColors: z.boolean().default(true),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

const defaultPreferences: UserPreferences = {
  theme: 'system',
  sidebarCompact: false,
  hiddenNavItems: [],
  collapsedNavGroups: [],
  defaultPage: undefined,
  dashboardPanels: undefined,
  dashboardRefreshRate: 1000,
  bracketMatchingColors: true,
};

interface PreferencesContextValue {
  preferences: UserPreferences;
  setPreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  toggleNavItem: (itemPath: string) => void;
  isNavItemHidden: (itemPath: string) => boolean;
}

const PreferencesContext = React.createContext<PreferencesContextValue | null>(null);

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      const result = userPreferencesSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return defaultPreferences;
}

function savePreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = React.useState<UserPreferences>(() =>
    loadPreferences(),
  );

  React.useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const setPreferences = React.useCallback((updates: Partial<UserPreferences>) => {
    setPreferencesState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetPreferences = React.useCallback(() => {
    setPreferencesState(defaultPreferences);
  }, []);

  const toggleNavItem = React.useCallback((itemPath: string) => {
    setPreferencesState((prev) => {
      const isHidden = prev.hiddenNavItems.includes(itemPath);
      return {
        ...prev,
        hiddenNavItems: isHidden
          ? prev.hiddenNavItems.filter((p) => p !== itemPath)
          : [...prev.hiddenNavItems, itemPath],
      };
    });
  }, []);

  const isNavItemHidden = React.useCallback(
    (itemPath: string) => preferences.hiddenNavItems.includes(itemPath),
    [preferences.hiddenNavItems],
  );

  const value = React.useMemo(
    () => ({
      preferences,
      setPreferences,
      resetPreferences,
      toggleNavItem,
      isNavItemHidden,
    }),
    [preferences, setPreferences, resetPreferences, toggleNavItem, isNavItemHidden],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = React.useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}
