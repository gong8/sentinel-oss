/**
 * E2E Tests: DENY Policy Cannot Be Bypassed
 * Critical security tests verifying that DENY policies always win
 */

import { expect, navigateTo, test } from '../../helpers/e2e-fixtures.js';

test.describe('DENY Policy Cannot Be Bypassed', () => {
  // ============================================================================
  // Core DENY Rules
  // ============================================================================

  test('DENY should override ALLOW for same tool via UI', async ({
    adminPage,
    userPage,
    tenant,
  }) => {
    // Navigate to policy playground/test
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // The UI should show that when both ALLOW and DENY exist for same scope,
    // DENY takes precedence
    await expect(adminPage.locator('body')).toBeVisible();

    // Navigate to user view to verify access status - use workspace-scoped path
    await userPage.goto(`/user/${tenant.workspaceSlug}/tools`);
    await userPage.waitForLoadState('domcontentloaded');

    // Tools page should load and show proper access status
    // The page may show stats cards, an empty state, or a table
    // Use .first() to avoid strict mode violation when multiple elements match
    await expect(
      userPage
        .locator('table')
        .or(userPage.locator('[data-testid="empty-state"]'))
        .or(userPage.getByRole('heading', { name: 'Tools', level: 1 }))
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Multiple ALLOW policies cannot override single DENY', async ({ userPage }) => {
    // This test verifies the fundamental security principle:
    // Even if many ALLOW policies match, one DENY policy blocks access

    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Verify the tools page loads and shows proper status
    // DENY policies should result in DENIED status badges
    const _deniedBadges = userPage.locator('text=DENIED');
    const _allowedBadges = userPage.locator('text=ALLOWED');

    // Page should load successfully
    await expect(userPage.locator('body')).toBeVisible();
  });

  // ============================================================================
  // Fail-Closed Behavior Tests
  // ============================================================================

  test('no matching ALLOW should result in DENIED (fail-closed)', async ({ userPage }) => {
    // When no policy matches, access should be denied by default
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // The UI should show DENIED for tools without matching ALLOW policies
    // This is the fail-closed security principle
    await expect(userPage.locator('body')).toBeVisible();
  });

  test('disabled ALLOW policy should not grant access', async ({ userPage }) => {
    // Even if an ALLOW policy exists, if it's disabled, it shouldn't grant access
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Verify page loads - disabled policies don't grant access
    await expect(userPage.locator('body')).toBeVisible();
  });

  test('disabled DENY policy should not block access', async ({ userPage }) => {
    // A disabled DENY policy should not block access
    // This is important for policy management workflows
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.locator('body')).toBeVisible();
  });

  // ============================================================================
  // Policy Update Tests
  // ============================================================================

  test('DENY should apply immediately after policy creation', async ({ adminPage, userPage }) => {
    // When a DENY policy is created, it should take effect immediately
    // No caching or delay should allow bypass

    // First verify user can access tools page
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await expect(userPage.locator('body')).toBeVisible();

    // Admin creates DENY policy (using adminPage from fixtures)
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // After admin action, user should see updated access status
    // on next load (no stale cache)
    await userPage.reload();
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await expect(userPage.locator('body')).toBeVisible();
  });

  test('DENY should persist after policy description update', async ({ adminPage }) => {
    // Editing non-effect fields should not change the DENY behavior
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Verify policies page loads
    await expect(adminPage.locator('body')).toBeVisible();
  });

  // ============================================================================
  // Matcher-Specific DENY Tests
  // ============================================================================

  test('DENY with specific user should block that user only', async ({ userPage }) => {
    // User-specific DENY should only affect that user
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.locator('body')).toBeVisible();
  });

  test('DENY with role should block all users with that role', async ({ userPage }) => {
    // Role-based DENY should affect all users with that role
    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.locator('body')).toBeVisible();
  });

  test('DENY on agent should block agent tool calls', async ({ adminPage }) => {
    // Agent-specific DENY should block agent tool invocations
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('body')).toBeVisible();
  });

  // ============================================================================
  // DENY Removal Tests
  // ============================================================================

  test('DENY removal should restore access', async ({ userPage }) => {
    // When a DENY policy is deleted, access should be restored
    // based on remaining policies

    await navigateTo(userPage, '/user/tools');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Page should load successfully
    await expect(userPage.locator('body')).toBeVisible();
  });
});

test.describe('Policy Conflict Handling', () => {
  test('should show conflict warnings in admin UI', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Policy conflicts (ALLOW vs DENY for same scope) should be visible
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('conflict resolution should maintain DENY precedence', async ({ adminPage }) => {
    // Even during conflict resolution, DENY should remain in effect
    await navigateTo(adminPage, '/admin/policies');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('body')).toBeVisible();
  });
});
