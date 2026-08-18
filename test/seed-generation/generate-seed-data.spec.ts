/**
 * Seed Data Generation Script
 *
 * Uses Playwright to interact with the running SENTINEL app
 * and generate realistic seed data through the UI.
 *
 * Run with:
 *   npx playwright test test/seed-generation/generate-seed-data.spec.ts \
 *     --config=test/seed-generation/playwright.config.ts
 */

import { test, expect } from '@playwright/test';
import {
  type CapturedData,
  initializeCapturedData,
  saveCapturedData,
  savePartialData,
  sendDiscordNotification,
  MCP_SERVERS,
  A2A_AGENTS,
  SEED_ROLES,
  SEED_USERS,
  SEED_AGENTS,
  SEED_SENSITIVE_FLAGS,
  SEED_POLICY_ASSERTIONS,
  generatePolicyTemplates,
  generateSummary,
  checkMcpServerHealth,
} from './helpers';

// Load prisma dynamically to avoid ESM/CJS interop issues
async function getPrisma() {
  const db = await import('@sentinel/db');
  return db.prisma;
}

// ============================================================================
// Globals
// ============================================================================

let capturedData: CapturedData;
let adminToken: string;

// ============================================================================
// Test Suite
// ============================================================================

test.describe('Seed Data Generation', () => {
  // Run tests serially to maintain data consistency
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Initialize capture storage
    capturedData = initializeCapturedData();
    await sendDiscordNotification('Phase 1', 'started', 'Initializing seed generation...');
  });

  test.afterAll(async () => {
    // Save captured data
    saveCapturedData(capturedData);
    const summary = generateSummary(capturedData);
    console.log(summary);
    await sendDiscordNotification('Complete', 'success', summary);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed') {
      savePartialData(capturedData, testInfo.title.replace(/\s+/g, '-'));
      await sendDiscordNotification(
        `Phase Failed: ${testInfo.title}`,
        'error',
        testInfo.error?.message,
      );
    }
  });

  // ==========================================================================
  // Phase 1: Get Admin Access
  // ==========================================================================

  test('Phase 1: Get Admin Access', async ({ page }) => {
    const prisma = await getPrisma();

    // Check if we have an existing admin user
    let adminUser = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: { isAdmin: true },
          },
        },
      },
    });

    if (!adminUser) {
      // Need to create initial data - this means database is empty
      // We'll need to create through the first-run setup or directly
      const org = await prisma.organization.create({
        data: { name: 'Acme Corporation' },
      });

      const adminRole = await prisma.role.create({
        data: {
          organizationId: org.id,
          name: 'Admin',
          isAdmin: true,
          description: 'Full administrative access',
        },
      });

      adminUser = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: 'admin@acme.com',
          accessToken: `cap_admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          userRoles: {
            create: { roleId: adminRole.id },
          },
        },
      });

      capturedData.organization = {
        id: org.id,
        name: org.name,
        createdAt: org.createdAt,
      };

      capturedData.roles.push({
        id: adminRole.id,
        organizationId: org.id,
        name: adminRole.name,
        isAdmin: true,
        description: adminRole.description,
        createdAt: adminRole.createdAt,
      });
    } else {
      // Get existing org
      const org = await prisma.organization.findUnique({
        where: { id: adminUser.organizationId },
      });

      if (org) {
        capturedData.organization = {
          id: org.id,
          name: org.name,
          createdAt: org.createdAt,
        };
      }

      // Get existing roles
      const roles = await prisma.role.findMany({
        where: { organizationId: adminUser.organizationId, deletedAt: null },
      });

      for (const role of roles) {
        capturedData.roles.push({
          id: role.id,
          organizationId: role.organizationId,
          name: role.name,
          isAdmin: role.isAdmin,
          description: role.description,
          createdAt: role.createdAt,
        });
      }
    }

    adminToken = adminUser.accessToken;

    capturedData.users.push({
      id: adminUser.id,
      organizationId: adminUser.organizationId,
      email: adminUser.email,
      accessToken: adminUser.accessToken,
      roleNames: ['Admin'],
      createdAt: adminUser.createdAt,
    });

    // Login as admin
    await page.goto('/login');
    await expect(page.locator('input#token')).toBeVisible();
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);
    await expect(page).toHaveURL(/.*\/admin/);

    console.log('[Phase 1] Admin access established');
  });

  // ==========================================================================
  // Phase 2: Create Roles
  // ==========================================================================

  test('Phase 2: Create Roles', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to roles page
    await page.click('a[href="/admin/roles"]');
    await expect(page).toHaveURL(/.*\/admin\/roles/);

    // Wait for roles table to load
    await expect(page.locator('table').or(page.getByText('No roles yet'))).toBeVisible({
      timeout: 10000,
    });

    for (const roleTemplate of SEED_ROLES) {
      // Check if role already exists
      const existingRole = await prisma.role.findFirst({
        where: { organizationId: orgId, name: roleTemplate.name, deletedAt: null },
      });

      if (existingRole) {
        console.log(`[Phase 2] Role ${roleTemplate.name} already exists, skipping`);
        // Add to captured data if not already there
        if (!capturedData.roles.find((r) => r.id === existingRole.id)) {
          capturedData.roles.push({
            id: existingRole.id,
            organizationId: orgId,
            name: existingRole.name,
            isAdmin: existingRole.isAdmin,
            description: existingRole.description,
            createdAt: existingRole.createdAt,
          });
        }
        continue;
      }

      // Create role via UI
      await page.click('button:has-text("Create role")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator('input#create-name').fill(roleTemplate.name);

      if (roleTemplate.description) {
        await dialog.locator('textarea#create-description').fill(roleTemplate.description);
      }

      if (roleTemplate.isAdmin) {
        const adminCheckbox = dialog.locator('input#create-isAdmin');
        if (!(await adminCheckbox.isChecked())) {
          await adminCheckbox.click();
        }
      }

      // Submit
      const submitButton = dialog.getByRole('button', { name: 'Create role', exact: true });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
          timeout: 15000,
        }),
        submitButton.click(),
      ]);

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Fetch created role from database
      const createdRole = await prisma.role.findFirst({
        where: { organizationId: orgId, name: roleTemplate.name, deletedAt: null },
      });

      if (createdRole) {
        capturedData.roles.push({
          id: createdRole.id,
          organizationId: orgId,
          name: createdRole.name,
          isAdmin: createdRole.isAdmin,
          description: createdRole.description,
          createdAt: createdRole.createdAt,
        });
        console.log(`[Phase 2] Created role: ${roleTemplate.name}`);
      }
    }

    console.log(`[Phase 2] ${capturedData.roles.length} roles ready`);
  });

  // ==========================================================================
  // Phase 3: Create Users
  // ==========================================================================

  test('Phase 3: Create Users', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to users page
    await page.click('a[href="/admin/users"]');
    await expect(page).toHaveURL(/.*\/admin\/users/);
    await expect(page.locator('table').or(page.getByText('No users yet'))).toBeVisible({
      timeout: 10000,
    });

    for (const userTemplate of SEED_USERS) {
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { organizationId: orgId, email: userTemplate.email, deletedAt: null },
      });

      if (existingUser) {
        console.log(`[Phase 3] User ${userTemplate.email} already exists, skipping`);
        // Add to captured data if not already there
        if (!capturedData.users.find((u) => u.id === existingUser.id)) {
          capturedData.users.push({
            id: existingUser.id,
            organizationId: orgId,
            email: existingUser.email,
            accessToken: existingUser.accessToken,
            roleNames: userTemplate.roles,
            createdAt: existingUser.createdAt,
          });
        }
        continue;
      }

      // Create user via UI
      await page.click('button:has-text("Create user")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByRole('heading', { name: 'Create user' })).toBeVisible();

      const emailInput = dialog.locator('input#create-email');
      await expect(emailInput).toBeVisible();
      await emailInput.fill(userTemplate.email);

      // Wait for roles to load
      await expect(
        dialog.locator('label').first().or(dialog.getByText('No roles available')),
      ).toBeVisible({ timeout: 10000 });

      // Select roles
      const checkboxes = dialog.getByRole('checkbox');
      const checkboxCount = await checkboxes.count();

      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        const labelText = await checkbox.locator('xpath=ancestor::label').textContent();

        for (const roleName of userTemplate.roles) {
          if (labelText?.includes(roleName)) {
            if (!(await checkbox.isChecked())) {
              await checkbox.click();
              await expect(checkbox).toBeChecked();
            }
            break;
          }
        }
      }

      // Submit
      const submitButton = dialog.getByRole('button', { name: 'Create user', exact: true });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
          timeout: 15000,
        }),
        submitButton.click(),
      ]);

      // Wait for token dialog
      await expect(dialog.getByText('Invite a new user')).not.toBeVisible({ timeout: 10000 });
      const tokenDialogTitle = page.getByRole('heading', { name: 'New access token' });
      await expect(tokenDialogTitle).toBeVisible({ timeout: 10000 });

      // Get token
      const tokenElement = page.locator('.font-mono');
      await expect(tokenElement).toBeVisible();
      const token = await tokenElement.textContent();

      // Close dialog
      await page.getByRole('button', { name: 'Close', exact: true }).first().click();
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

      // Fetch created user from database
      const createdUser = await prisma.user.findFirst({
        where: { organizationId: orgId, email: userTemplate.email, deletedAt: null },
      });

      if (createdUser) {
        capturedData.users.push({
          id: createdUser.id,
          organizationId: orgId,
          email: createdUser.email,
          accessToken: token?.trim() || createdUser.accessToken,
          roleNames: userTemplate.roles,
          createdAt: createdUser.createdAt,
        });
        console.log(`[Phase 3] Created user: ${userTemplate.email}`);
      }
    }

    console.log(`[Phase 3] ${capturedData.users.length} users ready`);
  });

  // ==========================================================================
  // Phase 4: Add MCP Servers
  // ==========================================================================

  test('Phase 4: Add MCP Servers', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to servers page - expand RESOURCES section first
    await page.waitForTimeout(500);
    const resourcesSection = page.getByText('RESOURCES', { exact: true });
    if (await resourcesSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resourcesSection.click();
      await page.waitForTimeout(500);
    }
    // Click MCP Servers link
    const mcpServersLink = page.getByRole('link', { name: 'MCP Servers' });
    if (await mcpServersLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mcpServersLink.click();
    } else {
      // Fallback - try clicking sidebar link with href
      const serversLink = page.locator('a[href="/admin/mcp-servers"]');
      if (await serversLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await serversLink.click();
      } else {
        // Last resort - use the header quick action "Add MCP Server" to get to the page
        // This might open a dialog, so we'll have to cancel it first
        await page.getByRole('button', { name: /Add MCP server/i }).click();
        // If dialog opens, close it and we should be at the right URL
        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
          await page.keyboard.press('Escape');
        }
      }
    }
    await expect(page).toHaveURL(/.*\/admin\/(mcp-)?servers/);
    await page.waitForTimeout(500);
    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'MCP Servers' })).toBeVisible({
      timeout: 10000,
    });

    for (const serverConfig of MCP_SERVERS) {
      // Ensure we're on the MCP Servers page (might have navigated away after dialog)
      if (!page.url().includes('/admin/mcp-servers')) {
        await page.goto('/admin/mcp-servers');
        await expect(page.getByRole('heading', { name: /MCP Servers/i })).toBeVisible({
          timeout: 10000,
        });
      }

      // Check server health first - skip any unhealthy servers
      const isHealthy = await checkMcpServerHealth(serverConfig.url);
      if (!isHealthy) {
        console.log(
          `[Phase 4] ${serverConfig.name} not available at ${serverConfig.url}, skipping`,
        );
        continue;
      }

      // Check if server already exists
      const existingServer = await prisma.mcpServer.findFirst({
        where: { organizationId: orgId, url: serverConfig.url, deletedAt: null },
        include: { tools: true },
      });

      if (existingServer) {
        console.log(`[Phase 4] Server ${serverConfig.name} already exists, skipping`);
        if (!capturedData.mcpServers.find((s) => s.id === existingServer.id)) {
          capturedData.mcpServers.push({
            id: existingServer.id,
            organizationId: orgId,
            name: existingServer.name,
            url: existingServer.url,
            authType: existingServer.authType,
            trusted: existingServer.trusted,
            tools: existingServer.tools.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
            })),
            createdAt: existingServer.createdAt,
          });
        }
        continue;
      }

      // Create server via UI
      await page.click('button:has-text("Add MCP server")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Fill server details using labels
      await dialog.getByLabel('Name').fill(serverConfig.name);
      await dialog.getByLabel('URL').fill(serverConfig.url);

      // Select auth type - try combobox first, then select
      const authTypeCombo = dialog.getByLabel(/Auth type/i);
      if (await authTypeCombo.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Check if it's a custom select/combobox (click to open, then select option)
        await authTypeCombo.click();
        await page.waitForTimeout(200);
        const option = page.getByRole('option', { name: serverConfig.authType });
        if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
          await option.click();
        } else {
          // Try native select
          await authTypeCombo.selectOption(serverConfig.authType);
        }
      }

      // Set trusted if applicable - look for the switch/toggle
      if (serverConfig.trusted) {
        const trustSwitch = dialog
          .getByRole('switch')
          .or(dialog.locator('[role="switch"]'))
          .or(dialog.getByLabel(/Trust/i));
        if (await trustSwitch.isVisible({ timeout: 1000 }).catch(() => false)) {
          // Check current state and toggle if needed
          const isChecked =
            (await trustSwitch.getAttribute('data-state')) === 'checked' ||
            (await trustSwitch.getAttribute('aria-checked')) === 'true';
          if (!isChecked) {
            await trustSwitch.click();
          }
        }
      }

      // Handle API key if needed
      if (serverConfig.authType === 'API_KEY' && 'apiKeyEnvVar' in serverConfig) {
        await page.waitForTimeout(500); // Wait for API key field to appear
        const apiKeyInput = dialog
          .getByLabel(/API key/i)
          .or(dialog.locator('input[type="password"]'));
        if (await apiKeyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const apiKey = process.env[serverConfig.apiKeyEnvVar] || '';
          await apiKeyInput.fill(apiKey);
        }
      }

      // Submit
      const submitButton = dialog.getByRole('button', { name: /add|create|save/i });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
          timeout: 30000,
        }),
        submitButton.click(),
      ]);

      // Wait for dialog to close - but handle validation errors for OAuth servers
      const dialogClosed = await dialog
        .waitFor({ state: 'hidden', timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (!dialogClosed) {
        // Check if there's a validation error (OAuth servers like Notion may fail)
        const errorMessage = dialog.locator('.text-destructive, .text-red-500, [class*="error"]');
        if (await errorMessage.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log(
            `[Phase 4] Server ${serverConfig.name} failed validation (expected for OAuth servers), cancelling`,
          );
          const cancelButton = dialog.getByRole('button', { name: /cancel/i });
          await cancelButton.click();
          await expect(dialog).not.toBeVisible({ timeout: 5000 });
          continue;
        }
        // If no error but dialog still visible, wait longer
        await expect(dialog).not.toBeVisible({ timeout: 15000 });
      }

      // Wait for tools to be discovered (if server is reachable)
      await page.waitForTimeout(2000);

      // Fetch created server from database
      const createdServer = await prisma.mcpServer.findFirst({
        where: { organizationId: orgId, url: serverConfig.url, deletedAt: null },
        include: { tools: true },
      });

      if (createdServer) {
        capturedData.mcpServers.push({
          id: createdServer.id,
          organizationId: orgId,
          name: createdServer.name,
          url: createdServer.url,
          authType: createdServer.authType,
          trusted: createdServer.trusted,
          tools: createdServer.tools.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
          })),
          createdAt: createdServer.createdAt,
        });
        console.log(
          `[Phase 4] Created server: ${serverConfig.name} (${createdServer.tools.length} tools)`,
        );
      }
    }

    console.log(`[Phase 4] ${capturedData.mcpServers.length} servers ready`);
  });

  // ==========================================================================
  // Phase 5: Create Agents
  // ==========================================================================

  test('Phase 5: Create Agents', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to agents page
    await page.click('a[href="/admin/agents"]');
    await expect(page).toHaveURL(/.*\/admin\/agents/);
    await expect(page.locator('table').or(page.getByText('No agents'))).toBeVisible({
      timeout: 10000,
    });

    for (const agentTemplate of SEED_AGENTS) {
      // Check if agent already exists
      const existingAgent = await prisma.agent.findFirst({
        where: { organizationId: orgId, name: agentTemplate.name, deletedAt: null },
      });

      if (existingAgent) {
        console.log(`[Phase 5] Agent ${agentTemplate.name} already exists, skipping`);
        if (!capturedData.agents.find((a) => a.id === existingAgent.id)) {
          capturedData.agents.push({
            id: existingAgent.id,
            organizationId: orgId,
            name: existingAgent.name,
            protocolType: existingAgent.protocolType,
            createdAt: existingAgent.createdAt,
          });
        }
        continue;
      }

      // Create agent via UI
      await page.click('button:has-text("Create agent")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.getByLabel('Name').fill(agentTemplate.name);

      // Submit
      const submitButton = dialog.getByRole('button', { name: /create|add/i });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
          timeout: 15000,
        }),
        submitButton.click(),
      ]);

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Fetch created agent from database
      const createdAgent = await prisma.agent.findFirst({
        where: { organizationId: orgId, name: agentTemplate.name, deletedAt: null },
      });

      if (createdAgent) {
        capturedData.agents.push({
          id: createdAgent.id,
          organizationId: orgId,
          name: createdAgent.name,
          protocolType: createdAgent.protocolType,
          createdAt: createdAgent.createdAt,
        });
        console.log(`[Phase 5] Created agent: ${agentTemplate.name}`);
      }
    }

    console.log(`[Phase 5] ${capturedData.agents.length} agents ready`);
  });

  // ==========================================================================
  // Phase 5.5: Create A2A Agents
  // ==========================================================================

  test('Phase 5.5: Create A2A Agents', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Wait for session to establish
    await page.waitForTimeout(500);

    // Navigate to A2A agents page - expand RESOURCES section first
    const resourcesSection = page.getByText('RESOURCES', { exact: true });
    if (await resourcesSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resourcesSection.click();
      await page.waitForTimeout(500);
    }
    // Click A2A Agents link
    const a2aAgentsLink = page.getByRole('link', { name: 'A2A Agents' });
    if (await a2aAgentsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await a2aAgentsLink.click();
    } else {
      // Fallback - direct navigation
      await page.goto('/admin/a2a-agents');
    }
    await expect(page).toHaveURL(/.*\/admin\/a2a-agents/);
    await expect(page.locator('table').or(page.getByText('No A2A agents'))).toBeVisible({
      timeout: 10000,
    });

    for (const a2aTemplate of A2A_AGENTS) {
      // Check if A2A agent already exists
      const existingAgent = await prisma.agent.findFirst({
        where: {
          organizationId: orgId,
          name: a2aTemplate.name,
          protocolType: 'A2A',
          deletedAt: null,
        },
      });

      if (existingAgent) {
        console.log(`[Phase 5.5] A2A Agent ${a2aTemplate.name} already exists, skipping`);
        if (!capturedData.agents.find((a) => a.id === existingAgent.id)) {
          capturedData.agents.push({
            id: existingAgent.id,
            organizationId: orgId,
            name: existingAgent.name,
            protocolType: existingAgent.protocolType,
            createdAt: existingAgent.createdAt,
          });
        }
        continue;
      }

      // Check if A2A server is running
      try {
        const response = await fetch(a2aTemplate.agentCardUrl);
        if (!response.ok) {
          console.log(`[Phase 5.5] A2A agent ${a2aTemplate.name} not running, skipping`);
          continue;
        }
      } catch {
        console.log(`[Phase 5.5] A2A agent ${a2aTemplate.name} not reachable, skipping`);
        continue;
      }

      // Create A2A agent via UI
      await page.click('button:has-text("Register A2A Agent")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Use "From URL" tab (default)
      await dialog.locator('input#url-name').fill(a2aTemplate.name);
      await dialog.locator('input#url-card').fill(a2aTemplate.endpointUrl);

      // Submit
      const submitButton = dialog.getByRole('button', { name: /register/i });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
          timeout: 15000,
        }),
        submitButton.click(),
      ]);

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Fetch created agent from database
      const createdAgent = await prisma.agent.findFirst({
        where: {
          organizationId: orgId,
          name: a2aTemplate.name,
          protocolType: 'A2A',
          deletedAt: null,
        },
      });

      if (createdAgent) {
        capturedData.agents.push({
          id: createdAgent.id,
          organizationId: orgId,
          name: createdAgent.name,
          protocolType: createdAgent.protocolType,
          createdAt: createdAgent.createdAt,
        });
        console.log(`[Phase 5.5] Registered A2A agent: ${a2aTemplate.name}`);
      }
    }

    console.log(`[Phase 5.5] A2A agents complete. Total agents: ${capturedData.agents.length}`);
  });

  // ==========================================================================
  // Phase 6: Create Policies
  // ==========================================================================

  test('Phase 6: Create Policies', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to policies page
    await page.getByRole('button', { name: 'Policies' }).click();
    await page.click('a[href="/admin/policies"]');
    await expect(page).toHaveURL(/.*\/admin\/policies/);
    await expect(page.locator('table').or(page.getByText('No policies'))).toBeVisible({
      timeout: 10000,
    });

    const policyTemplates = generatePolicyTemplates(capturedData.mcpServers);

    for (const policyTemplate of policyTemplates) {
      // Create policy via UI
      await page.click('button:has-text("Create policy")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Fill description
      const descInput = dialog.locator('input#create-description');
      await expect(descInput).toBeVisible();
      await descInput.fill(policyTemplate.description);

      // Get all comboboxes/selects in the dialog
      // Order: [matcherType, matcherValue, serverSelect, toolSelect, effectSelect]
      const comboboxes = dialog.getByRole('combobox');

      // ========================================
      // 1. Matcher type (first combobox)
      // ========================================
      const [matcherType, matcherValue] = policyTemplate.matcher.split(':');
      await comboboxes.first().click();

      if (matcherType === 'role') {
        await page.getByRole('option', { name: 'Role', exact: true }).click();
      } else if (matcherType === 'user') {
        await page.getByRole('option', { name: 'User', exact: true }).click();
      } else if (matcherType === 'agent') {
        await page.getByRole('option', { name: 'Agent', exact: true }).click();
      } else {
        // Wildcard or '*' maps to 'Everyone' in the UI
        await page.getByRole('option', { name: 'Everyone', exact: true }).click();
      }

      // ========================================
      // 2. Matcher value (second combobox) - only present when not "Everyone"
      // ========================================
      // When matcherType is '*' (Everyone), there's no matcher value dropdown
      // So combobox indices shift by 1: [type, server, tool, effect] vs [type, value, server, tool, effect]
      const hasMatcherValue = matcherType !== '*';
      const comboboxOffset = hasMatcherValue ? 0 : -1;

      if (hasMatcherValue) {
        await expect(comboboxes.nth(1)).toBeEnabled({ timeout: 5000 });
        await comboboxes.nth(1).click();

        // Find and click the matching option
        const optionName = matcherValue === '*' ? '*' : matcherValue;
        try {
          const option = page.getByRole('option', { name: new RegExp(optionName, 'i') });
          await expect(option).toBeVisible({ timeout: 5000 });
          await option.click();
        } catch {
          // If exact match fails, try clicking first available option
          const firstOption = page.getByRole('option').first();
          await firstOption.click();
        }
      }

      // ========================================
      // 3. Tool pattern - Server select (combobox index adjusted based on matcher presence)
      // ========================================
      const [serverKey, toolName] = policyTemplate.toolPattern.split('::');

      // Only set tool pattern if it's not the default "*::*"
      if (serverKey !== '*' || toolName !== '*') {
        const serverSelectIdx = 2 + comboboxOffset;
        const serverSelect = comboboxes.nth(serverSelectIdx);
        await expect(serverSelect).toBeVisible({ timeout: 5000 });
        await serverSelect.click();

        if (serverKey === '*') {
          await page.getByRole('option', { name: 'All servers' }).click();
        } else {
          // Match server by its key (e.g., "localhost:3012")
          try {
            const serverOption = page.getByRole('option').filter({ hasText: serverKey });
            await expect(serverOption).toBeVisible({ timeout: 3000 });
            await serverOption.click();
          } catch {
            // Fallback: click "All servers" if specific server not found
            console.log(`[Phase 6] Server "${serverKey}" not found, using "All servers"`);
            // Re-open dropdown if it closed
            const allServersOption = page.getByRole('option', { name: 'All servers' });
            if (!(await allServersOption.isVisible({ timeout: 500 }).catch(() => false))) {
              await serverSelect.click();
            }
            await allServersOption.click();
          }
        }

        // ========================================
        // 4. Tool pattern - Tool select (combobox index adjusted based on matcher presence)
        // ========================================
        if (toolName !== '*') {
          const toolSelectIdx = 3 + comboboxOffset;
          const toolSelect = comboboxes.nth(toolSelectIdx);
          await expect(toolSelect).toBeVisible({ timeout: 5000 });
          await toolSelect.click();

          try {
            // Match tool by name (exact or pattern like "get_*")
            if (toolName.includes('*')) {
              // For patterns like "get_*", just select "All tools"
              // (UI doesn't support wildcard patterns for individual tools)
              await page.getByRole('option', { name: 'All tools' }).click();
            } else {
              const toolOption = page.getByRole('option', { name: toolName, exact: true });
              await expect(toolOption).toBeVisible({ timeout: 3000 });
              await toolOption.click();
            }
          } catch {
            // Fallback: click "All tools" if specific tool not found
            console.log(`[Phase 6] Tool "${toolName}" not found, using "All tools"`);
            // Re-open dropdown if it closed
            const allToolsOption = page.getByRole('option', { name: 'All tools' });
            if (!(await allToolsOption.isVisible({ timeout: 500 }).catch(() => false))) {
              await toolSelect.click();
            }
            await allToolsOption.click();
          }
        }
      }

      // ========================================
      // 5. Effect (combobox index adjusted based on matcher presence)
      // ========================================
      const effectSelectIdx = 4 + comboboxOffset;
      const effectSelect = comboboxes.nth(effectSelectIdx);
      await expect(effectSelect).toBeVisible({ timeout: 5000 });
      await effectSelect.click();
      await page.getByRole('option', { name: policyTemplate.effect }).click();

      // Submit
      const submitButton = dialog.locator('button[type="submit"]:has-text("Create policy")');
      await expect(submitButton).toBeEnabled();

      try {
        await Promise.all([
          page.waitForResponse((r) => r.url().includes('/trpc/') && r.status() === 200, {
            timeout: 15000,
          }),
          submitButton.click(),
        ]);
      } catch {
        // Policy creation might trigger assertions dialog
      }

      // Handle policy assertions dialog if it appears
      const createAnyway = page.getByRole('button', { name: 'Create Anyway' });
      try {
        await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
        await createAnyway.click();
      } catch {
        // Assertions dialog didn't appear
      }

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      console.log(`[Phase 6] Created policy: ${policyTemplate.description}`);
    }

    // Fetch all policies from database
    const policies = await prisma.policy.findMany({
      where: { organizationId: orgId, deletedAt: null },
    });

    capturedData.policies = policies.map((p) => ({
      id: p.id,
      organizationId: orgId,
      slug: p.slug,
      matchers: p.matchers as string[],
      toolPatterns: p.toolPatterns as string[],
      effect: p.effect as 'ALLOW' | 'DENY',
      description: p.description,
      enabled: p.enabled,
      createdAt: p.createdAt,
    }));

    console.log(`[Phase 6] ${capturedData.policies.length} policies ready`);
  });

  // ==========================================================================
  // Phase 7: Create Webhook (Discord)
  // ==========================================================================

  test('Phase 7: Create Webhook', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    const discordWebhook = process.env.DISCORD_WEBHOOK;
    if (!discordWebhook) {
      console.log('[Phase 7] DISCORD_WEBHOOK not set, skipping webhook creation');
      return;
    }

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Navigate to webhooks page - expand Monitoring section first
    await page.waitForTimeout(500);
    const monitoringSection = page.getByRole('button', { name: 'Monitoring' });
    if (await monitoringSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await monitoringSection.click();
      await page.waitForTimeout(500);
    }
    // Try to find webhooks link
    const webhooksLink = page.locator('a[href="/admin/webhooks"]');
    if (await webhooksLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await webhooksLink.click();
    } else {
      // Try Configuration section if not in Monitoring
      const configSection = page.getByRole('button', { name: 'Configuration' });
      if (await configSection.isVisible({ timeout: 1000 }).catch(() => false)) {
        await configSection.click();
        await page.waitForTimeout(500);
        await page.locator('a[href="/admin/webhooks"]').click();
      }
    }
    await expect(page).toHaveURL(/.*\/admin\/webhooks/);

    // Wait for page to stabilize - either table, "No webhook" text, or retry if error
    let pageLoaded = false;
    for (let attempt = 0; attempt < 3 && !pageLoaded; attempt++) {
      try {
        await expect(page.locator('table').or(page.getByText('No webhook'))).toBeVisible({
          timeout: 5000,
        });
        pageLoaded = true;
      } catch {
        // Check for error and retry
        const errorAlert = page.locator('[role="alert"]').filter({ hasText: /error|fail/i });
        if (await errorAlert.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log(`[Phase 7] Page error detected, refreshing (attempt ${attempt + 1})`);
          await page.reload();
          await page.waitForTimeout(1000);
        }
      }
    }

    // Check if webhook already exists
    const existingWebhook = await prisma.webhookEndpoint.findFirst({
      where: { organizationId: orgId, url: discordWebhook },
    });

    if (existingWebhook) {
      console.log('[Phase 7] Discord webhook already exists');
      capturedData.webhooks.push({
        id: existingWebhook.id,
        organizationId: orgId,
        name: existingWebhook.name,
        type: existingWebhook.type,
        url: existingWebhook.url ?? '',
        events: existingWebhook.events as string[],
        enabled: existingWebhook.enabled,
      });
      return;
    }

    // Create webhook via UI
    await page.click('button:has-text("Create endpoint")');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill name first
    await dialog.getByLabel('Name').fill('Seed Notifications');

    // Select DISCORD type BEFORE filling URL (label changes based on type)
    let isDiscordType = false;
    const typeCombobox = dialog.getByRole('combobox').first();
    if (await typeCombobox.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await typeCombobox.click();
        const discordOption = page.getByRole('option', { name: /discord/i });
        if (await discordOption.isVisible({ timeout: 1000 }).catch(() => false)) {
          await discordOption.click();
          isDiscordType = true;
          await page.waitForTimeout(300); // Wait for label to update
        } else {
          // Close dropdown by clicking elsewhere
          await dialog.getByLabel('Name').click();
        }
      } catch {
        // DISCORD might not be an option, continue with Custom
      }
    }

    // Fill URL using the correct label based on type selection
    const urlLabel = isDiscordType ? 'Discord Webhook URL' : 'Webhook URL';
    const urlInput = dialog.getByLabel(urlLabel);
    if (await urlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await urlInput.fill(discordWebhook);
    } else {
      // Fallback: try any input with type="url"
      await dialog.locator('input[type="url"]').fill(discordWebhook);
    }

    // Select events (at least one is required)
    await dialog.getByLabel('Tool Allowed').check();
    await dialog.getByLabel('Tool Denied').check();
    await dialog.getByLabel('Policy Created').check();
    await dialog.getByLabel('Policy Updated').check();

    // Submit - don't require status 200, just wait for any tRPC response
    const submitButton = dialog.getByRole('button', { name: /create endpoint/i });
    await submitButton.click();

    // Wait for dialog to close (success) or error message
    try {
      await expect(dialog).not.toBeVisible({ timeout: 15000 });
    } catch {
      // If dialog didn't close, check for error
      const errorText = await dialog.locator('.text-destructive, [role="alert"]').textContent().catch(() => null);
      if (errorText) {
        console.log(`[Phase 7] Webhook creation error: ${errorText}`);
      }
      // Try clicking submit again in case it was a transient error
      await submitButton.click();
      await expect(dialog).not.toBeVisible({ timeout: 10000 });
    }

    // Fetch webhooks from database
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { organizationId: orgId },
    });

    capturedData.webhooks = webhooks.map((w) => ({
      id: w.id,
      organizationId: orgId,
      name: w.name,
      type: w.type,
      url: w.url ?? '',
      events: w.events as string[],
      enabled: w.enabled,
    }));

    console.log(`[Phase 7] ${capturedData.webhooks.length} webhooks ready`);
  });

  // ==========================================================================
  // Phase 7.5: Create Sensitive Flags
  // ==========================================================================

  test('Phase 7.5: Create Sensitive Flags', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Wait for session to establish
    await page.waitForTimeout(500);

    // Navigate to sensitive flags page - expand Configuration section first
    const configSection = page.getByRole('button', { name: 'Configuration' });
    if (await configSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await configSection.click();
      await page.waitForTimeout(500);
    }
    // Try to find sensitive flags link
    const sensitiveFlagsLink = page.locator('a[href="/admin/sensitive-flags"]');
    if (await sensitiveFlagsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sensitiveFlagsLink.click();
    } else {
      // Fallback: direct navigation
      await page.goto('/admin/sensitive-flags');
    }
    await expect(page).toHaveURL(/.*\/admin\/sensitive-flags/);
    await expect(page.locator('table').or(page.getByText('No sensitive flags'))).toBeVisible({
      timeout: 10000,
    });

    // Get webhook ID for alert configs (from previous phase)
    const webhookId = capturedData.webhooks[0]?.id;

    // Track patterns already created (to avoid duplicates from fallbacks)
    const createdPatterns = new Set<string>();

    // Create sensitive flags from templates
    for (const flagTemplate of SEED_SENSITIVE_FLAGS) {
      console.log(`[Phase 7.5] Creating sensitive flag: ${flagTemplate.toolPattern}`);

      // Click "Create flag" button
      await page.click('button:has-text("Create flag")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Parse tool pattern (e.g., "localhost:3012::submit_backtest" or "*::delete_*")
      const [serverKey, toolName] = flagTemplate.toolPattern.split('::');

      // Track actual server/tool selected (may differ from template due to fallbacks)
      let actualServer = serverKey;
      let actualTool = toolName;

      // ========================================
      // 1. Tool Pattern - Server select
      // ========================================
      const serverSelect = dialog.locator('[role="combobox"]').first();
      await serverSelect.click();

      if (serverKey === '*') {
        await page.getByRole('option', { name: 'All servers' }).click();
        actualServer = '*';
      } else {
        try {
          const serverOption = page.getByRole('option').filter({ hasText: serverKey });
          await expect(serverOption).toBeVisible({ timeout: 3000 });
          await serverOption.click();
        } catch {
          console.log(`[Phase 7.5] Server "${serverKey}" not found, using "All servers"`);
          await page.getByRole('option', { name: 'All servers' }).click();
          actualServer = '*';
        }
      }

      // ========================================
      // 2. Tool Pattern - Tool select
      // ========================================
      const toolSelect = dialog.locator('[role="combobox"]').nth(1);
      await toolSelect.click();

      if (toolName === '*' || toolName.includes('*')) {
        await page.getByRole('option', { name: 'All tools' }).click();
        actualTool = '*';
      } else {
        try {
          const toolOption = page.getByRole('option', { name: toolName, exact: true });
          await expect(toolOption).toBeVisible({ timeout: 3000 });
          await toolOption.click();
        } catch {
          console.log(`[Phase 7.5] Tool "${toolName}" not found, using "All tools"`);
          await page.getByRole('option', { name: 'All tools' }).click();
          actualTool = '*';
        }
      }

      // Check if this pattern was already created (skip if duplicate)
      const actualPattern = `${actualServer}::${actualTool}`;
      if (createdPatterns.has(actualPattern)) {
        console.log(`[Phase 7.5] Skipping duplicate pattern: ${actualPattern}`);
        // Close dialog
        const closeButton = dialog.getByRole('button', { name: /cancel/i });
        await closeButton.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
        continue;
      }

      // ========================================
      // 3. Select Behaviors (clickable cards)
      // ========================================
      for (const behavior of flagTemplate.behaviors) {
        const behaviorLabel =
          behavior === 'REQUIRE_APPROVAL'
            ? 'Require Approval'
            : behavior === 'RATE_LIMIT'
              ? 'Rate Limit'
              : 'Alert';

        // Find and click the behavior card
        const behaviorCard = dialog
          .locator('[role="checkbox"]')
          .filter({ hasText: behaviorLabel })
          .first();
        await behaviorCard.click();
      }

      // ========================================
      // 4. Rate Limit Config (if RATE_LIMIT selected)
      // ========================================
      const behaviors = flagTemplate.behaviors as readonly string[];
      if (behaviors.includes('RATE_LIMIT') && flagTemplate.rateLimitConfig) {
        const maxInput = dialog.locator('input#maxPerSession');
        const windowInput = dialog.locator('input#windowMinutes');

        if (await maxInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await maxInput.fill(String(flagTemplate.rateLimitConfig.maxPerSession));
        }
        if (await windowInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await windowInput.fill(String(flagTemplate.rateLimitConfig.windowMinutes));
        }
      }

      // ========================================
      // 5. Approval Config (if REQUIRE_APPROVAL selected)
      // ========================================
      if (behaviors.includes('REQUIRE_APPROVAL') && flagTemplate.approvalConfig) {
        // Check allowed approvers
        for (const approver of flagTemplate.approvalConfig.allowedApprovers) {
          const label = approver === 'session_owner' ? 'Session Owner' : 'Admin';
          const checkbox = dialog.getByLabel(label);
          if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
            await checkbox.check();
          }
        }

        // Set timeout
        const timeoutInput = dialog.locator('input#timeoutSeconds');
        if (await timeoutInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await timeoutInput.fill(String(flagTemplate.approvalConfig.timeoutSeconds));
        }
      }

      // ========================================
      // 6. Alert Config (if ALERT selected)
      // ========================================
      if (behaviors.includes('ALERT') && webhookId) {
        // Find and check the webhook checkbox
        const webhookCheckbox = dialog.locator('label').filter({ hasText: 'Seed Notifications' });
        if (await webhookCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await webhookCheckbox.click();
        }
      }

      // ========================================
      // 7. Description
      // ========================================
      if (flagTemplate.description) {
        const descInput = dialog.locator('textarea#description');
        if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await descInput.fill(flagTemplate.description);
        }
      }

      // Submit - don't require status 200, just wait for dialog to close
      const submitButton = dialog.getByRole('button', { name: /create flag/i });
      await submitButton.click();

      // Wait for dialog to close (success) or error message
      let flagCreated = false;
      try {
        await expect(dialog).not.toBeVisible({ timeout: 15000 });
        flagCreated = true;
      } catch {
        // If dialog didn't close, check for error
        const errorText = await dialog
          .locator('.text-destructive, [role="alert"]')
          .textContent()
          .catch(() => null);
        if (errorText) {
          console.log(`[Phase 7.5] Flag creation error: ${errorText}`);
          // Check if it's a duplicate error - close dialog and continue
          if (errorText.toLowerCase().includes('already exists')) {
            console.log(`[Phase 7.5] Pattern ${actualPattern} already exists in DB, skipping`);
            const closeButton = dialog.getByRole('button', { name: /cancel/i });
            await closeButton.click();
            await expect(dialog).not.toBeVisible({ timeout: 5000 });
            createdPatterns.add(actualPattern); // Mark as "created" to skip future attempts
            continue;
          }
        }
        // Try clicking submit again in case it was a transient error
        await submitButton.click();
        try {
          await expect(dialog).not.toBeVisible({ timeout: 10000 });
          flagCreated = true;
        } catch {
          // Still failed - close dialog and continue
          console.log(`[Phase 7.5] Could not create flag ${actualPattern}, closing dialog`);
          const closeButton = dialog.getByRole('button', { name: /cancel/i });
          await closeButton.click().catch(() => {});
          await expect(dialog).not.toBeVisible({ timeout: 5000 }).catch(() => {});
          continue;
        }
      }

      if (flagCreated) {
        createdPatterns.add(actualPattern);
        console.log(`[Phase 7.5] Created sensitive flag: ${actualPattern}`);
      }
    }

    // Fetch all sensitive flags from database
    const flags = await prisma.sensitiveToolFlag.findMany({
      where: { organizationId: orgId },
    });

    capturedData.sensitiveFlags = flags.map((f) => ({
      id: f.id,
      organizationId: orgId,
      toolPattern: f.toolPattern,
      behaviors: f.behaviors as string[],
      description: f.description,
      enabled: f.enabled,
      rateLimitConfig: f.rateLimitConfig as Record<string, unknown> | null,
      approvalConfig: f.approvalConfig as Record<string, unknown> | null,
      alertConfig: f.alertConfig as Record<string, unknown> | null,
    }));

    console.log(`[Phase 7.5] ${capturedData.sensitiveFlags.length} sensitive flags ready`);
  });

  // ==========================================================================
  // Phase 7.6: Create Policy Assertions
  // ==========================================================================

  test('Phase 7.6: Create Policy Assertions', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Wait for session to establish
    await page.waitForTimeout(500);

    // Navigate to policy assertions page - expand Policies section first
    const policiesSection = page.getByRole('button', { name: 'Policies' });
    if (await policiesSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await policiesSection.click();
      await page.waitForTimeout(500);
    }
    // Try to find policy assertions link
    const assertionsLink = page.locator('a[href="/admin/policy-assertions"]');
    if (await assertionsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await assertionsLink.click();
    } else {
      // Fallback: direct navigation
      await page.goto('/admin/policy-assertions');
    }
    await expect(page).toHaveURL(/.*\/admin\/policy-assertions/);
    await expect(page.locator('table').or(page.getByText('No assertions'))).toBeVisible({
      timeout: 10000,
    });

    // Create policy assertions from templates
    for (const assertionTemplate of SEED_POLICY_ASSERTIONS) {
      console.log(`[Phase 7.6] Creating assertion: ${assertionTemplate.name}`);

      // Click "New Assertion" button
      await page.click('button:has-text("New Assertion")');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // ========================================
      // 1. Name
      // ========================================
      const nameInput = dialog.locator('input#name');
      await nameInput.fill(assertionTemplate.name);

      // ========================================
      // 2. Description (optional)
      // ========================================
      if (assertionTemplate.description) {
        const descInput = dialog.locator('textarea#description');
        await descInput.fill(assertionTemplate.description);
      }

      // ========================================
      // 3. Tool Pattern - Server and Tool selects
      // ========================================
      const [serverKey, toolName] = assertionTemplate.toolPattern.split('::');

      // Server select (first combobox in the form)
      const comboboxes = dialog.locator('[role="combobox"]');
      const serverSelect = comboboxes.first();
      await serverSelect.click();

      if (serverKey === '*') {
        await page.getByRole('option', { name: 'All servers' }).click();
      } else {
        try {
          const serverOption = page.getByRole('option').filter({ hasText: serverKey });
          await expect(serverOption).toBeVisible({ timeout: 3000 });
          await serverOption.click();
        } catch {
          console.log(`[Phase 7.6] Server "${serverKey}" not found, using "All servers"`);
          await page.getByRole('option', { name: 'All servers' }).click();
        }
      }

      // Tool select (second combobox)
      const toolSelect = comboboxes.nth(1);
      await toolSelect.click();

      if (toolName === '*' || toolName.includes('*')) {
        await page.getByRole('option', { name: 'All tools' }).click();
      } else {
        try {
          const toolOption = page.getByRole('option', { name: toolName, exact: true });
          await expect(toolOption).toBeVisible({ timeout: 3000 });
          await toolOption.click();
        } catch {
          console.log(`[Phase 7.6] Tool "${toolName}" not found, using "All tools"`);
          await page.getByRole('option', { name: 'All tools' }).click();
        }
      }

      // ========================================
      // 4. Context Type select (third combobox)
      // ========================================
      const contextTypeSelect = comboboxes.nth(2);
      await contextTypeSelect.click();

      const contextTypeLabel =
        assertionTemplate.contextType === 'ROLE'
          ? 'All Users with Role'
          : assertionTemplate.contextType === 'WILDCARD'
            ? 'Wildcard (*)'
            : assertionTemplate.contextType === 'USER'
              ? 'Specific User'
              : 'Specific Agent';

      await page.getByRole('option', { name: contextTypeLabel }).click();

      // ========================================
      // 5. Context value (if ROLE, select role name)
      // ========================================
      if (assertionTemplate.contextType === 'ROLE' && assertionTemplate.roleName) {
        await page.waitForTimeout(500); // Wait for role select to appear
        const roleSelect = comboboxes.nth(3); // Role select appears as 4th combobox
        await roleSelect.click();
        await page.getByRole('option', { name: assertionTemplate.roleName }).click();
      }

      // ========================================
      // 6. Expected Decision select
      // ========================================
      // Find the expected decision select (position depends on context type)
      const expectedDecisionIndex = assertionTemplate.contextType === 'WILDCARD' ? 3 : 4;
      const decisionSelect = comboboxes.nth(expectedDecisionIndex);
      await decisionSelect.click();

      const decisionLabel = assertionTemplate.expectedDecision === 'ALLOWED' ? 'Allowed' : 'Denied';
      await page.getByRole('option', { name: decisionLabel }).click();

      // Submit - don't require status 200, just wait for dialog to close
      const submitButton = dialog.getByRole('button', { name: /create assertion/i });
      await submitButton.click();

      // Wait for dialog to close (success) or error message
      try {
        await expect(dialog).not.toBeVisible({ timeout: 15000 });
      } catch {
        // If dialog didn't close, check for error
        const errorText = await dialog
          .locator('.text-destructive, [role="alert"]')
          .textContent()
          .catch(() => null);
        if (errorText) {
          console.log(`[Phase 7.6] Assertion creation error: ${errorText}`);
        }
        // Try clicking submit again in case it was a transient error
        await submitButton.click();
        await expect(dialog).not.toBeVisible({ timeout: 10000 });
      }
      console.log(`[Phase 7.6] Created assertion: ${assertionTemplate.name}`);
    }

    // Fetch all policy assertions from database
    const assertions = await prisma.policyAssertion.findMany({
      where: { organizationId: orgId },
    });

    capturedData.policyAssertions = assertions.map((a) => ({
      id: a.id,
      organizationId: orgId,
      name: a.name,
      description: a.description,
      toolPattern: a.toolPattern,
      contextType: a.contextType,
      roleName: a.roleName,
      expectedDecision: a.expectedDecision,
      enabled: a.enabled,
    }));

    console.log(`[Phase 7.6] ${capturedData.policyAssertions.length} policy assertions ready`);
  });

  // ==========================================================================
  // Phase 7.7: Create Permission Requests
  // ==========================================================================

  test('Phase 7.7: Create Permission Requests', async ({ page }) => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Find a non-admin user (Viewer role) to create permission requests
    const viewerUser = capturedData.users.find((u) => u.roleNames.includes('Viewer'));
    if (!viewerUser) {
      console.log('[Phase 7.7] No Viewer user found, skipping permission requests');
      return;
    }

    // Get the viewer's login token
    const viewerDbUser = await prisma.user.findUnique({
      where: { id: viewerUser.id },
    });
    if (!viewerDbUser?.accessToken) {
      console.log('[Phase 7.7] Viewer user has no access token, skipping');
      return;
    }
    const viewerToken = viewerDbUser.accessToken;

    // ========================================
    // 1. Create a TOOL_ACCESS request as Viewer
    // ========================================
    console.log(`[Phase 7.7] Creating permission request as ${viewerUser.email}`);

    // Login as viewer
    await page.goto('/login');
    await page.fill('input#token', viewerToken);
    await Promise.all([page.waitForURL(/.*\/user/), page.click('button[type="submit"]')]);

    // Wait for session to establish
    await page.waitForTimeout(500);

    // Navigate to requests page - try sidebar link first
    const requestsLink = page.locator('a[href="/user/requests"]');
    if (await requestsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await requestsLink.click();
    } else {
      // Fallback: direct navigation
      await page.goto('/user/requests');
    }
    await expect(page).toHaveURL(/.*\/user\/requests/);
    await page.waitForTimeout(1000);

    // Click "Request Tool Access" button
    const requestToolBtn = page.getByRole('button', { name: /request tool access/i });
    if (!(await requestToolBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('[Phase 7.7] Request Tool Access button not found, skipping');
      return;
    }
    await requestToolBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select a server (first available)
    const serverSelect = dialog.locator('[role="combobox"]').first();
    await serverSelect.click();
    await page.waitForTimeout(500);

    // Find a server option that's not "All servers"
    const serverOptions = page.getByRole('option');
    const serverCount = await serverOptions.count();
    if (serverCount > 1) {
      // Skip first option if it's "All servers"
      await serverOptions.nth(1).click();
    } else if (serverCount > 0) {
      await serverOptions.first().click();
    }

    // Select a tool (all tools on that server)
    await page.waitForTimeout(500);
    const toolSelect = dialog.locator('[role="combobox"]').nth(1);
    await toolSelect.click();
    await page.waitForTimeout(500);

    // Select "All tools (*)"
    const allToolsOption = page.getByRole('option', { name: /all tools|\*/i });
    if (await allToolsOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allToolsOption.click();
    } else {
      // Select first available tool
      const toolOptions = page.getByRole('option');
      if ((await toolOptions.count()) > 0) {
        await toolOptions.first().click();
      }
    }

    // Fill in reason
    const reasonTextarea = dialog.locator('textarea');
    await reasonTextarea.fill('I need access to these tools for my daily reporting tasks.');

    // Submit request
    const submitButton = dialog.getByRole('button', { name: /submit|analyze/i });
    await submitButton.click();

    // Wait for dialog to close or show analysis
    await page.waitForTimeout(2000);

    // If there's an "Analyze" step, click submit again after analysis
    const submitAfterAnalysis = dialog.getByRole('button', { name: /submit request/i });
    if (await submitAfterAnalysis.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitAfterAnalysis.click();
    }

    // Wait for dialog to close
    try {
      await expect(dialog).not.toBeVisible({ timeout: 10000 });
    } catch {
      // Dialog might still be open if request was blocked, close it
      const closeButton = dialog.locator('button[aria-label="Close"]');
      if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeButton.click();
      }
    }

    console.log('[Phase 7.7] Created permission request as Viewer');

    // ========================================
    // 2. Admin reviews the request
    // ========================================
    console.log('[Phase 7.7] Admin reviewing permission request');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#token', adminToken);
    await Promise.all([page.waitForURL(/.*\/admin/), page.click('button[type="submit"]')]);

    // Wait for session to establish
    await page.waitForTimeout(500);

    // Navigate to permission requests page - expand Monitoring section first
    const monitoringSection = page.getByRole('button', { name: 'Monitoring' });
    if (await monitoringSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await monitoringSection.click();
      await page.waitForTimeout(500);
    }
    // Try to find permission requests link in sidebar
    const permReqLink = page.locator('a[href="/admin/permission-requests"]');
    if (await permReqLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await permReqLink.click();
    } else {
      // Fallback: direct navigation
      await page.goto('/admin/permission-requests');
    }
    await expect(page).toHaveURL(/.*\/admin\/permission-requests/);
    await page.waitForTimeout(1000);

    // Find pending requests
    const pendingRow = page.locator('tr').filter({ hasText: 'PENDING' }).first();
    if (await pendingRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click the "Review" button
      const reviewBtn = pendingRow.getByRole('button', { name: /review/i });
      if (await reviewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reviewBtn.click();

        const reviewDialog = page.getByRole('dialog');
        await expect(reviewDialog).toBeVisible({ timeout: 5000 });

        // Add a review note
        const noteInput = reviewDialog.locator('textarea');
        if (await noteInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await noteInput.fill('Approved for reporting access.');
        }

        // Click Approve button - don't require status 200, just wait for dialog to close
        const approveBtn = reviewDialog.getByRole('button', { name: /approve/i });
        if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await approveBtn.click();

          // Wait for dialog to close (success)
          try {
            await expect(reviewDialog).not.toBeVisible({ timeout: 15000 });
            console.log('[Phase 7.7] Approved permission request');
          } catch {
            // If dialog didn't close, try again
            await approveBtn.click();
            await expect(reviewDialog).not.toBeVisible({ timeout: 10000 });
            console.log('[Phase 7.7] Approved permission request (retry)');
          }
        }
      }
    } else {
      console.log('[Phase 7.7] No pending permission requests to review');
    }

    // Fetch all permission requests from database
    const requests = await prisma.permissionRequest.findMany({
      where: { user: { organizationId: orgId } },
    });

    capturedData.permissionRequests = requests.map((r) => ({
      id: r.id,
      organizationId: orgId,
      userId: r.userId,
      type: r.type,
      status: r.status,
      reason: r.reason,
      toolNames: r.toolNames as string[],
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
    }));

    console.log(`[Phase 7.7] ${capturedData.permissionRequests.length} permission requests ready`);
  });

  // ==========================================================================
  // Phase 8: Capture Final State
  // ==========================================================================

  test('Phase 8: Capture Final State', async () => {
    const prisma = await getPrisma();
    const orgId = capturedData.organization?.id;
    if (!orgId) throw new Error('Organization not set');

    // Capture audit log entries
    const auditEntries = await prisma.auditLogEntry.findMany({
      where: { organizationId: orgId },
      take: 100,
      orderBy: { timestamp: 'desc' },
    });

    capturedData.auditLogEntries = auditEntries.map((a) => ({
      id: a.id,
      organizationId: orgId,
      userId: a.userId,
      agentId: a.agentId,
      toolName: a.toolName,
      parameters: a.parameters,
      decision: a.decision as 'ALLOWED' | 'DENIED',
      justification: a.justification,
      timestamp: a.timestamp,
    }));

    // Capture permission requests (if not already captured in Phase 7.7)
    if (!capturedData.permissionRequests || capturedData.permissionRequests.length === 0) {
      const requests = await prisma.permissionRequest.findMany({
        where: { user: { organizationId: orgId } },
      });

      capturedData.permissionRequests = requests.map((r) => ({
        id: r.id,
        organizationId: orgId,
        userId: r.userId,
        type: r.type,
        status: r.status,
        reason: r.reason,
        toolNames: r.toolNames as string[],
        reviewedAt: r.reviewedAt,
        reviewNote: r.reviewNote,
      }));
    }

    // Capture sensitive flags (if not already captured in Phase 7.5)
    if (!capturedData.sensitiveFlags || capturedData.sensitiveFlags.length === 0) {
      const flags = await prisma.sensitiveToolFlag.findMany({
        where: { organizationId: orgId },
      });

      capturedData.sensitiveFlags = flags.map((f) => ({
        id: f.id,
        organizationId: orgId,
        toolPattern: f.toolPattern,
        behaviors: f.behaviors as string[],
        description: f.description,
        enabled: f.enabled,
        rateLimitConfig: f.rateLimitConfig as Record<string, unknown> | null,
        approvalConfig: f.approvalConfig as Record<string, unknown> | null,
        alertConfig: f.alertConfig as Record<string, unknown> | null,
      }));
    }

    // Capture policy assertions (if not already captured in Phase 7.6)
    if (!capturedData.policyAssertions || capturedData.policyAssertions.length === 0) {
      const assertions = await prisma.policyAssertion.findMany({
        where: { organizationId: orgId },
      });

      capturedData.policyAssertions = assertions.map((a) => ({
        id: a.id,
        organizationId: orgId,
        name: a.name,
        description: a.description,
        toolPattern: a.toolPattern,
        contextType: a.contextType,
        roleName: a.roleName,
        expectedDecision: a.expectedDecision,
        enabled: a.enabled,
      }));
    }

    // Update timestamp
    capturedData.capturedAt = new Date().toISOString();

    console.log('[Phase 8] Final state captured');
    console.log(generateSummary(capturedData));
  });
});
