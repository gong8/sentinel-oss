# Encrypting Sensitive Data

## When to Use This Pattern

Use this pattern when storing or handling sensitive data such as:

- API keys and tokens
- OAuth credentials (access tokens, refresh tokens)
- MCP server credentials
- User passwords
- LLM provider API keys
- Any PII (Personally Identifiable Information)

## Security Principles

1. **Encrypt at Rest**: All secrets must be encrypted in the database
2. **Decrypt on Demand**: Only decrypt when needed for use
3. **Never Log Secrets**: Don't log decrypted values
4. **Secure Key Management**: Encryption key stored in environment variable
5. **Use Strong Encryption**: AES-256-GCM with random IVs
6. **Minimize Exposure Time**: Decrypt only when needed, don't hold decrypted values

## Encryption Library

**Location**: `packages/api/src/lib/crypto.ts`

### Algorithm Details

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| IV Length | 16 bytes (random per encryption) |
| Auth Tag Length | 16 bytes |
| Key Length | 32 bytes (64 hex characters) |

### Core Functions

```typescript
import {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  encryptObject,
  decryptObject,
  decryptCredentials,
  decryptObjectSafe,
} from '../lib/crypto';

// Encrypt a string (API keys, secrets)
const encrypted = encrypt(plaintext);
// Returns: "iv:authTag:ciphertext" (hex-encoded)

// Decrypt a string
const plaintext = decrypt(encrypted);

// Encrypt an object (credentials, config)
const encryptedObj = encryptObject({ apiKey: 'sk_123', token: 'abc' });

// Decrypt to unknown (caller validates)
const obj = decryptObject(encrypted);

// Decrypt to Record<string, unknown> (validates it's an object)
const credentials = decryptCredentials(encrypted);

// Decrypt with Zod schema validation
import { z } from 'zod';
const schema = z.object({ apiKey: z.string() });
const validated = decryptObjectSafe(encrypted, schema);
```

### Password Hashing

For user passwords, use bcrypt (not encryption):

```typescript
import bcrypt from 'bcryptjs';

// Hash password (12 rounds)
const hash = await bcrypt.hash(password, 12);

// Verify password
const isValid = await bcrypt.compare(password, hash);
```

## Encrypted Fields in Database

The following database fields store encrypted data:

| Model | Field | Purpose |
|-------|-------|---------|
| McpServer | apiKey | Static API key for MCP server |
| McpServer | credentials | Generic credentials JSON |
| McpServer | stdioEnv | Environment variables for STDIO servers |
| UserMcpConfig | apiKey | User-level API key |
| UserMcpConfig | credentials | User credentials JSON |
| UserMcpConfig | accessToken | OAuth access token |
| UserMcpConfig | refreshToken | OAuth refresh token |
| OrgMcpOAuthToken | accessToken | Org-level OAuth token |
| OrgMcpOAuthToken | refreshToken | Org-level refresh token |
| OAuthClientRegistration | clientSecret | OAuth client secret |
| A2ACredential | credentials | A2A agent credentials |
| OrganizationSettings | llmApiKey | LLM provider API key |
| UserLLMConfig | apiKey | User LLM API key |
| PublisherRegistry | publicKey | Agent publisher public key |

## Encryption Pattern

### Storing Encrypted Data

```typescript
import { encrypt, encryptObject } from '../../lib/crypto';
import { adminProcedure, router } from '../init';
import { z } from 'zod';

const createServerInput = z.object({
  name: z.string(),
  type: z.string(),
  apiKey: z.string().optional(),
  credentials: z.record(z.unknown()).optional(),
});

export const create = adminProcedure.input(createServerInput).mutation(async ({ ctx, input }) => {
  // Encrypt individual fields
  const encryptedApiKey = input.apiKey ? encrypt(input.apiKey) : null;

  // Encrypt object fields
  const encryptedCredentials = input.credentials
    ? encryptObject(input.credentials)
    : null;

  return await prisma.mcpServer.create({
    data: {
      name: input.name,
      type: input.type,
      apiKey: encryptedApiKey,
      credentials: encryptedCredentials,
      organizationId: ctx.auth.organizationId,
    },
  });
});
```

### Retrieving Encrypted Data

```typescript
import { decrypt, decryptCredentials } from '../../lib/crypto';

// For normal display - DON'T decrypt
export const get = adminProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const server = await prisma.mcpServer.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
    });

    if (!server) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Hide credentials from response
    return {
      ...server,
      apiKey: undefined,
      credentials: undefined,
    };
  });

// Separate endpoint for credential retrieval (admin only)
export const getCredentials = adminProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const server = await prisma.mcpServer.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
    });

    if (!server) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Decrypt ONLY when needed
    return {
      apiKey: server.apiKey ? decrypt(server.apiKey) : null,
      credentials: server.credentials ? decryptCredentials(server.credentials) : null,
    };
  });
```

## Sensitive Key Redaction for Logging

**Location**: `packages/mcp/src/redaction.ts`

When logging data that might contain sensitive values, use the redaction utilities:

```typescript
import { sanitizeObject, sanitizeRecord } from '@sentinel/mcp/redaction';

// Automatically redacts keys matching sensitive patterns
const safeToLog = sanitizeObject({
  token: 'secret123',
  apiKey: 'sk_live_xxx',
  data: 'visible',
  nested: {
    password: 'hunter2',
    username: 'john',
  },
});
// Result: {
//   token: '[REDACTED]',
//   apiKey: '[REDACTED]',
//   data: 'visible',
//   nested: {
//     password: '[REDACTED]',
//     username: 'john',
//   },
// }
```

### Sensitive Key Patterns

The following key patterns are automatically redacted (case-insensitive):

- `key` (matches apiKey, api_key, secretKey, etc.)
- `secret`
- `token`
- `password`
- `credential`
- `auth`

Pattern defined in `packages/mcp/src/utils.ts`:

```typescript
export const SENSITIVE_KEY_REGEX = /key|secret|token|password|credential|auth/i;
```

## Database Schema

Store encrypted data as `String` in Prisma:

```prisma
model McpServer {
  id          String  @id @default(cuid())
  name        String
  type        String
  apiKey      String? // Encrypted API key
  credentials String? // Encrypted credentials JSON

  organizationId String
  organization   Organization @relation(...)
}
```

## Environment Setup

### Generate Encryption Key

```bash
# Using openssl
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Configure Environment

Add to `.env`:

```bash
# Must be exactly 64 hex characters (32 bytes)
ENCRYPTION_KEY=your-64-character-hex-key-here
```

### Key Validation

The crypto module validates the key format at runtime:

```typescript
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || '';
  if (!key || key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes). ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return key;
}
```

## Security Best Practices

### DO

- Encrypt before database storage
- Use separate endpoint for credential retrieval
- Require admin role to access credentials
- Use environment variable for encryption key
- Generate random IV for each encryption
- Use authenticated encryption (GCM mode)
- Decrypt only when needed (minimize exposure time)
- Validate decrypted data with Zod schemas
- Use `sanitizeObject()` before logging

### DON'T

- Store plaintext credentials
- Log decrypted values
- Send credentials to frontend unnecessarily
- Hardcode encryption keys
- Reuse IVs across encryptions
- Use weak encryption modes (ECB, CBC without HMAC)
- Store encryption key in code or version control

## Testing

**Location**: `test/unit/api/lib/crypto.test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  decryptObjectSafe,
} from '../../../../packages/api/src/lib/crypto';
import { z } from 'zod';

describe('encrypt/decrypt', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    // Set test encryption key
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  test('encrypts and decrypts strings', () => {
    const original = 'secret-password-123';

    const encrypted = encrypt(original);
    expect(encrypted).not.toContain('secret-password-123');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('encrypts and decrypts objects', () => {
    const original = {
      apiKey: 'sk_test_123',
      token: 'abc123',
    };

    const encrypted = encryptObject(original);
    expect(encrypted).not.toContain('sk_test_123');

    const decrypted = decryptObject(encrypted);
    expect(decrypted).toEqual(original);
  });

  test('validates with Zod schema', () => {
    const schema = z.object({
      apiKey: z.string(),
      token: z.string(),
    });

    const original = { apiKey: 'sk_123', token: 'abc' };
    const encrypted = encryptObject(original);

    const decrypted = decryptObjectSafe(encrypted, schema);
    expect(decrypted).toEqual(original);
  });

  test('produces different ciphertext each time (random IV)', () => {
    const data = 'test-secret';

    const encrypted1 = encrypt(data);
    const encrypted2 = encrypt(data);

    expect(encrypted1).not.toEqual(encrypted2);

    // Both decrypt to same value
    expect(decrypt(encrypted1)).toEqual(data);
    expect(decrypt(encrypted2)).toEqual(data);
  });

  test('throws on invalid encrypted data', () => {
    expect(() => decrypt('invalid-data')).toThrow();
  });

  test('throws when ENCRYPTION_KEY not set', () => {
    delete process.env.ENCRYPTION_KEY;

    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
  });

  test('throws when ENCRYPTION_KEY is wrong length', () => {
    process.env.ENCRYPTION_KEY = 'too-short';

    expect(() => encrypt('test')).toThrow('64 hex characters');
  });
});
```

## Key Rotation

When rotating encryption keys:

1. **Add new key to environment** (as `ENCRYPTION_KEY_NEW`)
2. **Create migration script** to re-encrypt all values:

```typescript
async function rotateEncryptionKey() {
  const oldKey = process.env.ENCRYPTION_KEY;
  const newKey = process.env.ENCRYPTION_KEY_NEW;

  // Get all records with encrypted data
  const servers = await prisma.mcpServer.findMany({
    where: { credentials: { not: null } },
  });

  for (const server of servers) {
    // Decrypt with old key
    process.env.ENCRYPTION_KEY = oldKey;
    const plaintext = decrypt(server.credentials!);

    // Encrypt with new key
    process.env.ENCRYPTION_KEY = newKey;
    const newCiphertext = encrypt(plaintext);

    // Update record
    await prisma.mcpServer.update({
      where: { id: server.id },
      data: { credentials: newCiphertext },
    });
  }
}
```

3. **Update environment** to use new key as `ENCRYPTION_KEY`
4. **Remove old key** from environment

## Common Mistakes

### Storing Plaintext

```typescript
// BAD
await prisma.mcpServer.create({
  data: {
    credentials: input.credentials, // Plaintext!
  },
});

// GOOD
await prisma.mcpServer.create({
  data: {
    credentials: encryptObject(input.credentials),
  },
});
```

### Exposing Secrets in Responses

```typescript
// BAD - Sends encrypted credentials to frontend
return await prisma.mcpServer.findMany();

// GOOD - Filter sensitive fields
return await prisma.mcpServer.findMany({
  select: {
    id: true,
    name: true,
    type: true,
    // credentials: NOT included
  },
});
```

### Logging Decrypted Values

```typescript
// BAD
const creds = decryptCredentials(server.credentials);
console.log('Credentials:', creds); // Exposes secrets!

// GOOD
const creds = decryptCredentials(server.credentials);
console.log('Credentials loaded for server:', server.id);
// Or use redaction
console.log('Credentials:', sanitizeObject(creds));
```

### Using Type Assertions

```typescript
// BAD - Bypasses type safety
const creds = decryptObject(encrypted) as { apiKey: string };

// GOOD - Validates with Zod
const schema = z.object({ apiKey: z.string() });
const creds = decryptObjectSafe(encrypted, schema);
```

## See Also

- [ADR-005: Credential Encryption Strategy](../decisions/005-credential-encryption.md)
- [Security Considerations](../spec/08-security.md)
- [Anti-Patterns: Storing Credentials in Plaintext](../ANTI-PATTERNS.md)

## Next Steps

After implementing encryption:

1. Verify credentials stored encrypted in database
2. Test encryption/decryption with various data types
3. Ensure encryption key is properly secured
4. Add audit logging for credential access
5. Set up key rotation procedures
