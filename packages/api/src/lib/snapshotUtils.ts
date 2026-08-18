/**
 * Snapshot Utilities
 * Helper functions to extract data from snapshots when resources are deleted
 */

/**
 * Type guard for plain objects from snapshots
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract email from admin action log snapshots
 */
export function extractEmailFromSnapshot(
  beforeSnapshot: unknown,
  afterSnapshot: unknown,
): string | null {
  // Try beforeSnapshot first
  if (isPlainObject(beforeSnapshot) && typeof beforeSnapshot.email === 'string') {
    return beforeSnapshot.email;
  }

  // Try afterSnapshot
  if (isPlainObject(afterSnapshot) && typeof afterSnapshot.email === 'string') {
    return afterSnapshot.email;
  }

  return null;
}

/**
 * Extract resource name from admin action log snapshots
 */
export function extractResourceNameFromSnapshot(
  beforeSnapshot: unknown,
  afterSnapshot: unknown,
): string | null {
  const snapshot = beforeSnapshot || afterSnapshot;
  if (!isPlainObject(snapshot)) {
    return null;
  }

  // Try common name fields
  const nameFields = ['name', 'email', 'slug', 'description'] as const;

  for (const field of nameFields) {
    const value = snapshot[field];
    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
}

/**
 * Type guard for objects with roleName property
 */
function hasRoleName(value: unknown): value is { roleName: string } {
  return isPlainObject(value) && typeof value.roleName === 'string';
}

/**
 * Type guard for objects with name property
 */
function hasName(value: unknown): value is { name: string } {
  return isPlainObject(value) && typeof value.name === 'string';
}

/**
 * Type guard for objects with role property containing name
 */
function hasRoleWithName(value: unknown): value is { role: { name: string } } {
  return isPlainObject(value) && isPlainObject(value.role) && typeof value.role.name === 'string';
}

/**
 * Extract roles from snapshot
 */
export function extractRolesFromSnapshot(snapshot: unknown): string[] {
  if (!isPlainObject(snapshot)) {
    return [];
  }

  // Check for roles array
  if (Array.isArray(snapshot.roles)) {
    return snapshot.roles
      .map((r) => {
        if (typeof r === 'string') return r;
        if (hasRoleName(r)) return r.roleName;
        if (hasName(r)) return r.name;
        return null;
      })
      .filter((r): r is string => r !== null);
  }

  // Check for userRoles array
  if (Array.isArray(snapshot.userRoles)) {
    return snapshot.userRoles
      .map((ur) => {
        if (typeof ur === 'string') return ur;
        if (hasRoleWithName(ur)) return ur.role.name;
        return null;
      })
      .filter((r): r is string => r !== null);
  }

  return [];
}

/**
 * Check if user or resource is deleted based on foreign key and snapshot
 */
export function isDeletedResource(
  foreignKeyId: string | null,
  snapshotEmailOrName: string | null,
): boolean {
  // If foreign key is null but we have snapshot data, resource is deleted
  return foreignKeyId === null && snapshotEmailOrName !== null;
}
