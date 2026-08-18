# ADR-005: AES-256-GCM for Credential Encryption

**Status**: Accepted
**Date**: 2024-01
**Deciders**: Project Team

## Context

SENTINEL stores user credentials for MCP servers (API keys, OAuth tokens). These credentials:

- Are highly sensitive (grant access to user's tools/services)
- Must be stored in database for later use
- Must be encrypted at rest
- Must be decryptable when needed (not just hashed)

Requirements:

- Strong encryption (military-grade)
- Authenticated encryption (tamper-proof)
- Per-credential encryption (not database-level)
- Minimal key management overhead

## Decision

Use **AES-256-GCM** (Galois/Counter Mode) for credential encryption with a single encryption key from environment variable.

### Implementation

```typescript
// packages/api/src/lib/crypto.ts

import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes
const ALGORITHM = 'aes-256-gcm';

export function encrypt(data: any): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted,
    tag: authTag.toString('hex'),
  });
}

export function decrypt(encrypted: string): any {
  const { iv, data, tag } = JSON.parse(encrypted);

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(iv, 'hex'));

  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
```

## Rationale

### Why AES-256-GCM

1. **Strong Encryption**: AES-256 is military-grade, approved by NSA for TOP SECRET
2. **Authenticated Encryption**: GCM mode provides both confidentiality AND integrity
3. **Tamper Detection**: Auth tag ensures credentials weren't modified
4. **Performance**: Hardware-accelerated on modern CPUs
5. **Standard**: Well-studied, widely used, NIST-approved

### Why Single Key

1. **Simplicity**: One key to manage instead of per-user or per-org keys
2. **Sufficient Security**: If key is compromised, database is compromised anyway
3. **Operational**: Easier to rotate single key than many keys

## Consequences

### Positive ✅

- **Strong Security**: AES-256 has no known practical attacks
- **Integrity Protection**: GCM auth tag prevents tampering
- **Simple Implementation**: Node.js crypto module built-in
- **Fast**: Hardware AES acceleration on most servers
- **Auditable**: Encryption/decryption happens in one place

### Negative ❌

- **Single Point of Failure**: If key leaks, all credentials compromised
- **Key Rotation Complexity**: Need to re-encrypt all credentials
- **Environment Variable**: Key in env var (need secure secret management)
- **No Key Hierarchy**: Can't revoke access per user/org without re-encryption

## Alternatives Considered

### Per-User Keys

- **Pros**: Granular revocation, user can change key
- **Cons**: Key management nightmare, where to store user keys?
- **Why Not**: Complexity not worth it

### Per-Organization Keys

- **Pros**: Org-level revocation
- **Cons**: Still need to manage many keys, org admin could access keys
- **Why Not**: Same key management complexity

### Database-Level Encryption

- **Pros**: Transparent, no code changes
- **Cons**: Doesn't protect against DB compromise, all-or-nothing
- **Why Not**: Need application-level encryption

### Envelope Encryption (AWS KMS style)

- **Pros**: Key rotation easier, per-user data encryption keys (DEKs)
- **Cons**: Requires external KMS, more complex, slower
- **Why Not**: Overkill for SENTINEL's current scale

### Libsodium (NaCl)

- **Pros**: Modern, opinionated, hard to misuse
- **Cons**: Extra dependency, not as widely known as AES
- **Why Not**: AES-GCM is standard and sufficient

## Security Considerations

### Key Generation

```bash
# Generate 32-byte (256-bit) key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set in `.env`:

```
ENCRYPTION_KEY=your_generated_key_here
```

### Key Storage

- ❌ **Never commit key to git**
- ✅ Use environment variables
- ✅ In production, use secret manager (AWS Secrets Manager, Vault, etc.)
- ✅ Different keys per environment (dev/staging/prod)

### Key Rotation

**Process** (when needed):

1. Generate new key (ENCRYPTION_KEY_NEW)
2. Deploy code that tries new key first, falls back to old
3. Background job re-encrypts all credentials with new key
4. Remove old key once all credentials migrated

**Frequency**: Annually, or immediately if compromised

## What Gets Encrypted

```prisma
model UserMcpConfig {
  id          String @id
  credentials Json   // ← Encrypted (API keys, OAuth tokens)
}

model IdentityProvider {
  oidcClientSecret String? // ← Encrypted (OIDC client secret)
  scimBearerToken  String? // ← Encrypted (SCIM token)
}
```

## What Does NOT Get Encrypted

- User emails (need to query/index)
- Policy matchers (need to evaluate)
- Tool names (need to search)
- Audit logs (need to query/analyze)

**Principle**: Encrypt secrets, don't encrypt metadata.

## Related Decisions

- ADR-002: Prisma stores encrypted credentials as `Json` type
- See `packages/api/src/lib/crypto.ts` for implementation
- See `test/unit/api/lib/crypto.test.ts` for tests
