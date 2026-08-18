/**
 * Shared Unit Test Mock Helpers
 *
 * Provides common mock utilities and context factories for tRPC unit tests.
 * These helpers reduce duplication across test files and ensure consistent patterns.
 */
import { vi } from 'vitest';

/**
 * Type for test-friendly procedure handlers.
 */
export type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

// ============================================================================
// Context Factories
// ============================================================================

interface AdminContextOverrides {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
  isOrgOwner?: boolean;
  workspaceIds?: string[];
  adminWorkspaceIds?: string[];
  isAdmin?: boolean;
}

interface AdminContext {
  auth: {
    organizationId: string;
    user: { id: string; email: string };
    isOrgOwner: boolean;
    workspaceIds: string[];
    adminWorkspaceIds: string[];
    isAdmin: boolean;
  };
  req: {
    req: { header: (name: string) => string | null };
  };
}

/**
 * Creates a mock admin context for testing admin procedures.
 * Includes IP address and user agent headers for audit logging tests.
 * Defaults to org owner for backward compatibility with existing tests.
 */
export function createAdminContext(overrides: AdminContextOverrides = {}): AdminContext {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'admin-user-123',
        email: overrides.userEmail ?? 'admin@example.com',
      },
      isOrgOwner: overrides.isOrgOwner ?? true,
      workspaceIds: overrides.workspaceIds ?? [],
      adminWorkspaceIds: overrides.adminWorkspaceIds ?? [],
      isAdmin: overrides.isAdmin ?? true,
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'user-agent') return 'test-agent';
          return null;
        }),
      },
    },
  };
}

interface UserContextOverrides {
  organizationId?: string;
  userId?: string;
  workspaceIds?: string[];
  isOrgOwner?: boolean;
}

interface UserContext {
  auth: {
    organizationId: string;
    user: { id: string };
    workspaceIds: string[];
    isOrgOwner: boolean;
  };
}

/**
 * Creates a mock user context for testing user procedures.
 */
export function createUserContext(overrides: UserContextOverrides = {}): UserContext {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
      workspaceIds: overrides.workspaceIds ?? [],
      isOrgOwner: overrides.isOrgOwner ?? false,
    },
  };
}

// ============================================================================
// Mock Prisma Factory
// ============================================================================

interface MockPrismaPermissionRequest {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockPrismaPolicy {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockPrismaMcpServer {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

interface MockPrismaUser {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}

interface MockPrismaAgent {
  findFirst: ReturnType<typeof vi.fn>;
}

interface MockPrismaPolicyTest {
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface MockPrismaPolicyAssertion {
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

export interface MockPrisma {
  permissionRequest: MockPrismaPermissionRequest;
  policy: MockPrismaPolicy;
  mcpServer: MockPrismaMcpServer;
  user: MockPrismaUser;
  agent: MockPrismaAgent;
  policyTest: MockPrismaPolicyTest;
  policyAssertion: MockPrismaPolicyAssertion;
  $transaction: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Prisma client with all common methods.
 * The $transaction mock executes callback functions immediately.
 */
export function createMockPrisma(): MockPrisma {
  const mockPrisma: MockPrisma = {
    permissionRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    policy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
    },
    policyTest: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    policyAssertion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === 'function') {
        return fn(mockPrisma);
      }
      return Promise.resolve([]);
    }),
  };
  return mockPrisma;
}

// ============================================================================
// Mock Logger Factory
// ============================================================================

export interface MockLogger {
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock logger with all common log levels.
 */
export function createMockLogger(): MockLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Helper to expect a TRPCError with a specific code and message.
 * Reduces boilerplate in error testing.
 */
export async function expectTRPCError(
  promise: Promise<unknown>,
  expectedCode: string,
  expectedMessage?: string | RegExp,
): Promise<void> {
  await expect(promise).rejects.toThrow();
  const matcher: { code: string; message?: string | RegExp } = { code: expectedCode };
  if (expectedMessage) {
    matcher.message = expectedMessage;
  }
  await expect(promise).rejects.toMatchObject(matcher);
}

// ============================================================================
// Common Test Data Factories
// ============================================================================

interface BaseMockRequest {
  id: string;
  userId: string;
  type: string;
  toolNames: string[];
  reason: string;
  status: string;
  data: unknown;
  user: {
    email: string;
    organizationId: string;
  };
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

/**
 * Creates a base mock permission request with sensible defaults.
 */
export function createMockPermissionRequest(
  overrides: Partial<BaseMockRequest> = {},
): BaseMockRequest {
  return {
    id: 'request-123',
    userId: 'user-456',
    type: 'TOOL_ACCESS',
    toolNames: ['server::tool1', 'server::tool2'],
    reason: 'Need access to these tools',
    status: 'PENDING',
    data: null,
    user: {
      email: 'requester@example.com',
      organizationId: 'org-123',
    },
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    ...overrides,
  };
}

interface BaseMockPolicy {
  id: string;
  slug: string;
  description: string;
  matchers: string[];
  toolPatterns: string[];
  effect: string;
  enabled: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  organizationId: string;
}

/**
 * Creates a base mock policy with sensible defaults.
 */
export function createMockPolicy(overrides: Partial<BaseMockPolicy> = {}): BaseMockPolicy {
  return {
    id: 'policy-123',
    slug: 'test-policy',
    description: 'Test policy description',
    matchers: ['role:User'],
    toolPatterns: ['domain.com::*'],
    effect: 'ALLOW',
    enabled: true,
    createdAt: new Date(),
    deletedAt: null,
    organizationId: 'org-123',
    ...overrides,
  };
}

interface MockMcpServerRequest {
  name: string;
  url: string;
  authType: string;
  apiKey?: string;
  alsoRequestTools?: boolean;
  workspaceId?: string;
}

/**
 * Creates MCP server request data.
 */
export function createMcpServerRequestData(
  overrides: Partial<MockMcpServerRequest> = {},
): MockMcpServerRequest {
  return {
    name: 'Test MCP',
    url: 'https://mcp.example.com',
    authType: 'NONE',
    ...overrides,
  };
}

interface MockMcpServer {
  id: string;
  name: string;
  url: string;
  authType: string;
  apiKey: string | null;
  trusted: boolean;
  organizationId: string;
}

/**
 * Creates a mock MCP server object.
 */
export function createMockMcpServer(overrides: Partial<MockMcpServer> = {}): MockMcpServer {
  return {
    id: 'mcp-server-123',
    name: 'Test MCP',
    url: 'https://mcp.example.com',
    authType: 'NONE',
    apiKey: null,
    trusted: false,
    organizationId: 'org-123',
    ...overrides,
  };
}

interface MockUserWithRoles {
  id: string;
  email: string;
  organizationId: string;
  userRoles: Array<{ role: { id?: string; name: string } }>;
}

/**
 * Creates a mock user with roles for policy evaluation tests.
 */
export function createMockUserWithRoles(
  overrides: Partial<MockUserWithRoles> = {},
): MockUserWithRoles {
  return {
    id: 'user-123',
    email: 'user@example.com',
    organizationId: 'org-123',
    userRoles: [{ role: { name: 'User' } }],
    ...overrides,
  };
}
