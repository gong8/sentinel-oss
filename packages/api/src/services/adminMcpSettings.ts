/**
 * Admin MCP Settings Service
 *
 * Manages organization-level settings for the Admin MCP Server feature.
 */

import { prisma } from '@sentinel/db';
import { z } from 'zod';
import { AdminMcpScope, type AdminMcpSettings } from '../types/adminMcp.js';

/**
 * Zod schema for validating AdminMcpScope enum values (LOW-003).
 * Uses z.nativeEnum for exhaustive enum validation.
 */
const adminMcpScopeSchema = z.nativeEnum(AdminMcpScope);

/**
 * Validate and parse scope strings into AdminMcpScope enum values.
 * Uses Zod for exhaustive enum validation instead of simple includes check.
 */
function parseScopes(scopes: string[]): AdminMcpScope[] {
  return scopes.filter(
    (scope): scope is AdminMcpScope => adminMcpScopeSchema.safeParse(scope).success,
  );
}

/**
 * Get admin MCP settings for an organization.
 */
export async function getAdminMcpSettings(organizationId: string): Promise<AdminMcpSettings> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      adminMcpEnabled: true,
      adminMcpEnabledScopes: true,
      adminMcpAllowedAdmins: true,
      adminMcpRateLimitPerMin: true,
      adminMcpConfirmationTtl: true,
    },
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  return {
    enabled: org.adminMcpEnabled,
    enabledScopes: parseScopes(org.adminMcpEnabledScopes),
    allowedAdmins: org.adminMcpAllowedAdmins,
    rateLimitPerMin: org.adminMcpRateLimitPerMin,
    confirmationTtlSeconds: org.adminMcpConfirmationTtl,
  };
}

/**
 * Update admin MCP settings for an organization.
 */
export async function updateAdminMcpSettings(
  organizationId: string,
  settings: Partial<AdminMcpSettings>,
): Promise<AdminMcpSettings> {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(settings.enabled !== undefined && {
        adminMcpEnabled: settings.enabled,
      }),
      ...(settings.enabledScopes !== undefined && {
        adminMcpEnabledScopes: settings.enabledScopes,
      }),
      ...(settings.allowedAdmins !== undefined && {
        adminMcpAllowedAdmins: settings.allowedAdmins,
      }),
      ...(settings.rateLimitPerMin !== undefined && {
        adminMcpRateLimitPerMin: settings.rateLimitPerMin,
      }),
      ...(settings.confirmationTtlSeconds !== undefined && {
        adminMcpConfirmationTtl: settings.confirmationTtlSeconds,
      }),
    },
    select: {
      adminMcpEnabled: true,
      adminMcpEnabledScopes: true,
      adminMcpAllowedAdmins: true,
      adminMcpRateLimitPerMin: true,
      adminMcpConfirmationTtl: true,
    },
  });

  return {
    enabled: updated.adminMcpEnabled,
    enabledScopes: parseScopes(updated.adminMcpEnabledScopes),
    allowedAdmins: updated.adminMcpAllowedAdmins,
    rateLimitPerMin: updated.adminMcpRateLimitPerMin,
    confirmationTtlSeconds: updated.adminMcpConfirmationTtl,
  };
}

/**
 * Check if a scope is enabled for an organization.
 */
export function isScopeEnabled(settings: AdminMcpSettings, scope: AdminMcpScope): boolean {
  return settings.enabledScopes.includes(scope);
}

/**
 * Check if an admin is allowed to use admin MCP.
 * Returns true if:
 * - allowedAdmins is empty (all admins allowed)
 * - adminUserId is in the allowedAdmins list
 */
export function isAdminAllowed(settings: AdminMcpSettings, adminUserId: string): boolean {
  if (settings.allowedAdmins.length === 0) {
    return true;
  }
  return settings.allowedAdmins.includes(adminUserId);
}

/**
 * Check if admin MCP is fully enabled and accessible for a given admin.
 */
export async function isAdminMcpAccessible(
  organizationId: string,
  adminUserId: string,
): Promise<{ accessible: boolean; reason?: string }> {
  const settings = await getAdminMcpSettings(organizationId);

  if (!settings.enabled) {
    return { accessible: false, reason: 'Admin MCP is not enabled for this organization' };
  }

  if (!isAdminAllowed(settings, adminUserId)) {
    return { accessible: false, reason: 'Admin is not in the allowed admins list' };
  }

  if (settings.enabledScopes.length === 0) {
    return { accessible: false, reason: 'No scopes are enabled for admin MCP' };
  }

  return { accessible: true };
}
