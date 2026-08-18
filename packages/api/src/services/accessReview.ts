/**
 * Access Review Service
 * Provides access review reporting for SOC2 compliance
 */

import { prisma, type WorkspaceMemberRole } from '@sentinel/db';

// ============================================================================
// Types
// ============================================================================

export interface UserAccessEntry {
  userId: string;
  email: string;
  roles: string[];
  workspaces: Array<{
    id: string;
    name: string;
    role: WorkspaceMemberRole;
  }>;
  isAdmin: boolean;
  isOrgOwner: boolean;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export interface AccessReviewReport {
  generatedAt: string;
  organizationId: string;
  organizationName: string;
  totalUsers: number;
  totalAdmins: number;
  totalOrgOwners: number;
  entries: UserAccessEntry[];
}

// ============================================================================
// Access Review Functions
// ============================================================================

/**
 * Get access review data for an organization
 */
export async function getAccessReviewData(organizationId: string): Promise<AccessReviewReport> {
  const [organization, users, orgOwners] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        lastActivityAt: true,
        createdAt: true,
        userRoles: {
          include: {
            role: {
              select: {
                name: true,
                isAdmin: true,
              },
            },
          },
        },
        workspaceMemberships: {
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: { email: 'asc' },
    }),
    prisma.orgOwner.findMany({
      where: { organizationId },
      select: { userId: true },
    }),
  ]);

  const orgOwnerIds = new Set(orgOwners.map((o) => o.userId));

  const entries: UserAccessEntry[] = users.map((user) => {
    const roles = user.userRoles.map((ur) => ur.role.name);
    const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
    const isOrgOwner = orgOwnerIds.has(user.id);

    // Only include active workspaces
    const workspaces = user.workspaceMemberships
      .filter((wm) => wm.workspace.deletedAt === null)
      .map((wm) => ({
        id: wm.workspace.id,
        name: wm.workspace.name,
        role: wm.role,
      }));

    return {
      userId: user.id,
      email: user.email,
      roles,
      workspaces,
      isAdmin,
      isOrgOwner,
      lastActivityAt: user.lastActivityAt,
      createdAt: user.createdAt,
    };
  });

  const totalAdmins = entries.filter((e) => e.isAdmin).length;
  const totalOrgOwners = entries.filter((e) => e.isOrgOwner).length;

  return {
    generatedAt: new Date().toISOString(),
    organizationId: organization.id,
    organizationName: organization.name,
    totalUsers: entries.length,
    totalAdmins,
    totalOrgOwners,
    entries,
  };
}

/**
 * Export access review data as CSV
 */
export function exportAccessReviewToCsv(report: AccessReviewReport): {
  data: string;
  filename: string;
  contentType: string;
} {
  const lines: string[] = [];

  // Header
  lines.push(
    'userId,email,roles,workspaces,workspaceRoles,isAdmin,isOrgOwner,lastActivityAt,createdAt',
  );

  // Data rows
  for (const entry of report.entries) {
    const roles = entry.roles.join('; ');
    const workspaces = entry.workspaces.map((w) => w.name).join('; ');
    const workspaceRoles = entry.workspaces.map((w) => `${w.name}:${w.role}`).join('; ');

    const row = [
      entry.userId,
      escapeCsv(entry.email),
      escapeCsv(roles),
      escapeCsv(workspaces),
      escapeCsv(workspaceRoles),
      entry.isAdmin ? 'Yes' : 'No',
      entry.isOrgOwner ? 'Yes' : 'No',
      entry.lastActivityAt?.toISOString() ?? '',
      entry.createdAt.toISOString(),
    ].join(',');

    lines.push(row);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: lines.join('\n'),
    filename: `access-review-${timestamp}.csv`,
    contentType: 'text/csv',
  };
}

/**
 * Export access review data as JSON
 */
export function exportAccessReviewToJson(report: AccessReviewReport): {
  data: string;
  filename: string;
  contentType: string;
} {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: JSON.stringify(report, null, 2),
    filename: `access-review-${timestamp}.json`,
    contentType: 'application/json',
  };
}

// ============================================================================
// Helpers
// ============================================================================

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
