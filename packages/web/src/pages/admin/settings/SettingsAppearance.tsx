import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { OnboardingRestartButton } from '../../../components/onboarding';
import {
  SettingsCard,
  SettingsDivider,
  SettingsItem,
} from '../../../components/settings/SettingsCard';
import { useTheme } from '../../../components/theme/ThemeProvider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { usePreferences } from '../../../hooks/PreferencesContext';
import { useWorkspace } from '../../../hooks/WorkspaceContext';

const THEME_OPTIONS = ['light', 'dark'] as const;
type ThemeOption = (typeof THEME_OPTIONS)[number];

function isValidTheme(value: string): value is ThemeOption {
  return THEME_OPTIONS.includes(value as ThemeOption);
}

export default function SettingsAppearance() {
  const { theme, toggleTheme } = useTheme();
  const { preferences, setPreferences } = usePreferences();
  const { workspaces, isOrgOwner, isLoading: workspacesLoading } = useWorkspace();

  function handleThemeChange(value: string): void {
    if (!isValidTheme(value)) return;
    if (value !== theme) {
      toggleTheme();
    }
    setPreferences({ theme: value });
  }

  function handleDefaultWorkspaceChange(value: string): void {
    setPreferences({ defaultWorkspaceId: value === 'none' ? undefined : value });
  }

  // Check if the stored default workspace is valid
  const isDefaultWorkspaceValid = (): boolean => {
    if (!preferences.defaultWorkspaceId) return true; // 'none' is always valid
    if (preferences.defaultWorkspaceId === 'global') return isOrgOwner;
    if (!workspaces) return true; // Still loading, assume valid
    return workspaces.some((w) => w.id === preferences.defaultWorkspaceId && w.deletedAt === null);
  };

  // Get the effective select value (reset to 'none' if invalid)
  const getSelectValue = (): string => {
    if (!preferences.defaultWorkspaceId) return 'none';
    if (workspacesLoading || !workspaces) return preferences.defaultWorkspaceId;
    if (!isDefaultWorkspaceValid()) return 'none';
    return preferences.defaultWorkspaceId;
  };

  // Get display name for current default workspace
  const getDefaultWorkspaceLabel = (): string => {
    const value = getSelectValue();
    if (value === 'none') return 'None (show selection)';
    if (value === 'global') return 'Global View';
    if (workspacesLoading || !workspaces) return 'Loading...';
    const workspace = workspaces.find((w) => w.id === value);
    return workspace?.name ?? 'None (show selection)';
  };

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        <SettingsCard title="Display" description="Customize how the application looks.">
          <SettingsItem
            label="Theme"
            description="Choose between light and dark mode"
            htmlFor="theme"
          >
            <Select value={theme} onValueChange={handleThemeChange}>
              <SelectTrigger id="theme" className="w-32">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </SettingsItem>

          <SettingsDivider />

          <SettingsItem
            label="Compact Sidebar"
            description="Collapse the sidebar by default"
            htmlFor="compact-mode"
          >
            <Switch
              id="compact-mode"
              checked={preferences.sidebarCompact}
              onCheckedChange={(checked) => setPreferences({ sidebarCompact: checked })}
            />
          </SettingsItem>

          <SettingsDivider />

          <SettingsItem
            label="Bracket Matching Colors"
            description="Colorize nested brackets in advanced condition expressions"
            htmlFor="bracket-colors"
          >
            <Switch
              id="bracket-colors"
              checked={preferences.bracketMatchingColors ?? true}
              onCheckedChange={(checked) => setPreferences({ bracketMatchingColors: checked })}
            />
          </SettingsItem>
        </SettingsCard>

        <SettingsCard title="Startup" description="Configure what happens when you log in.">
          <SettingsItem
            label="Default Workspace"
            description="Automatically open this workspace on login"
            htmlFor="default-workspace"
          >
            <Select
              value={getSelectValue()}
              onValueChange={handleDefaultWorkspaceChange}
              disabled={workspacesLoading}
            >
              <SelectTrigger id="default-workspace" className="w-48">
                <SelectValue>{getDefaultWorkspaceLabel()}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (show selection)</SelectItem>
                {isOrgOwner && <SelectItem value="global">Global View</SelectItem>}
                {workspaces
                  ?.filter((w) => w.deletedAt === null)
                  .map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </SettingsItem>
        </SettingsCard>

        <SettingsCard title="Help" description="Get help and learn how to use Sentinel.">
          <SettingsItem
            label="Product Tour"
            description="Restart the interactive tutorial to learn Sentinel's features"
          >
            <OnboardingRestartButton />
          </SettingsItem>
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
