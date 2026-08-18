/**
 * SettingsCard - Clean card wrapper for settings sections
 * SettingsItem - Individual setting row with label, description, and control
 */

import * as React from 'react';

import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';

interface SettingsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function SettingsCard({
  title,
  description,
  children,
  className,
  actions,
}: SettingsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

interface SettingsItemProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  vertical?: boolean;
}

export function SettingsItem({
  label,
  description,
  htmlFor,
  children,
  className,
  vertical = false,
}: SettingsItemProps) {
  if (vertical) {
    return (
      <div className={cn('py-4 first:pt-0 last:pb-0', className)}>
        <div className="space-y-3">
          <div>
            <Label htmlFor={htmlFor} className="text-sm font-medium">
              {label}
            </Label>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-between py-4 first:pt-0 last:pb-0', className)}>
      <div className="space-y-0.5 pr-4">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

interface SettingsDividerProps {
  className?: string;
}

export function SettingsDivider({ className }: SettingsDividerProps) {
  return <div className={cn('border-t border-border', className)} />;
}
