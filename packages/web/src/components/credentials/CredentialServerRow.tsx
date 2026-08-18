import { ChevronDown } from 'lucide-react';
import { forwardRef, useState } from 'react';

import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent } from '../ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

type SettingsLevel = 'workspace' | 'org';

interface CredentialServerRowProps {
  serverId: string;
  serverName: string;
  isHighlighted: boolean;
  personalStatus: React.ReactNode;
  workspaceStatus?: React.ReactNode;
  orgStatus: React.ReactNode;
  personalActions: React.ReactNode;
  /** Content to show when workspace settings is expanded */
  workspaceContent?: React.ReactNode;
  /** Content to show when org settings is expanded */
  orgContent?: React.ReactNode;
  /** Whether to show the "Workspace Settings" option */
  showWorkspaceSettings?: boolean;
  /** Whether to show the "Org Settings" option */
  showOrgSettings?: boolean;
}

export const CredentialServerRow = forwardRef<HTMLDivElement, CredentialServerRowProps>(
  function CredentialServerRow(
    {
      serverId,
      serverName,
      isHighlighted,
      personalStatus,
      workspaceStatus,
      orgStatus,
      personalActions,
      workspaceContent,
      orgContent,
      showWorkspaceSettings = false,
      showOrgSettings = false,
    },
    ref,
  ) {
    const [expandedLevel, setExpandedLevel] = useState<SettingsLevel | null>(null);

    const hasAnySettings = showWorkspaceSettings || showOrgSettings;
    const hasBothSettings = showWorkspaceSettings && showOrgSettings;

    const handleToggle = (level: SettingsLevel) => {
      setExpandedLevel((prev) => (prev === level ? null : level));
    };

    return (
      <div
        ref={ref}
        data-server-id={serverId}
        className={`rounded-lg border bg-card transition-colors duration-500 ${
          isHighlighted ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
      >
        <div className="flex items-center p-4">
          <div className="w-40 flex-shrink-0 font-medium">{serverName}</div>
          <div className="w-28 flex-shrink-0 text-sm text-muted-foreground">{personalStatus}</div>
          {workspaceStatus !== undefined && (
            <div className="w-28 flex-shrink-0 text-sm text-muted-foreground">
              {workspaceStatus}
            </div>
          )}
          <div className="w-28 flex-shrink-0 text-sm text-muted-foreground">{orgStatus}</div>
          <div className="ml-auto flex items-center gap-2">
            {personalActions}
            {hasAnySettings && (
              <>
                {hasBothSettings ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Settings
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {showWorkspaceSettings && (
                        <DropdownMenuItem onClick={() => handleToggle('workspace')}>
                          Workspace Settings
                        </DropdownMenuItem>
                      )}
                      {showOrgSettings && (
                        <DropdownMenuItem onClick={() => handleToggle('org')}>
                          Org Settings
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : showWorkspaceSettings ? (
                  <Button variant="ghost" size="sm" onClick={() => handleToggle('workspace')}>
                    Workspace Settings
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleToggle('org')}>
                    Org Settings
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Workspace Settings Content */}
        <Collapsible open={expandedLevel === 'workspace'}>
          <CollapsibleContent>
            <div className="border-t bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <div className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                Workspace Settings
              </div>
              {workspaceContent}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Org Settings Content */}
        <Collapsible open={expandedLevel === 'org'}>
          <CollapsibleContent>
            <div className="border-t bg-muted/30 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Organization Settings
              </div>
              {orgContent}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
);

interface CredentialSectionHeaderProps {
  className?: string;
  showWorkspaceColumn?: boolean;
}

export function CredentialSectionHeader({
  className = '',
  showWorkspaceColumn = false,
}: CredentialSectionHeaderProps): React.ReactElement {
  return (
    <div
      className={`flex items-center px-4 py-2 text-sm font-medium text-muted-foreground ${className}`}
    >
      <div className="w-40 flex-shrink-0">Name</div>
      <div className="w-28 flex-shrink-0">Personal</div>
      {showWorkspaceColumn && <div className="w-28 flex-shrink-0">Workspace</div>}
      <div className="w-28 flex-shrink-0">Organization</div>
      <div className="ml-auto">Actions</div>
    </div>
  );
}
