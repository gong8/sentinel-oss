#!/bin/bash
# Security Check Hook: Verify security patterns in service/router files
#
# This hook runs after Edit/Write on API service and router files to verify:
# - organizationId scoping in database queries
# - Zod validation usage
# - Encryption for credential storage
# - Audit logging for sensitive operations
#
# This is a warning hook - it outputs reminders but doesn't block.

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Only check service and router files
if [[ "$TOOL_INPUT" != *"packages/api/src/services"* ]] && \
   [[ "$TOOL_INPUT" != *"packages/api/src/trpc"* ]]; then
  exit 0
fi

# Extract file path from tool input
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

WARNINGS=""

# Check for organizationId in database queries
if grep -qE '\.(findMany|findFirst|findUnique|create|update|delete|upsert)\(' "$FILE_PATH"; then
  if ! grep -q 'organizationId' "$FILE_PATH"; then
    WARNINGS="$WARNINGS
- Missing organizationId scoping: Database queries should filter by organizationId"
  fi
fi

# Check for Zod validation in router files
if [[ "$FILE_PATH" == *"/trpc/"* ]]; then
  if grep -qE '\.input\(' "$FILE_PATH" && ! grep -qE 'z\.' "$FILE_PATH"; then
    WARNINGS="$WARNINGS
- Missing Zod validation: Router inputs should use Zod schemas (z.object, z.string, etc.)"
  fi
fi

# Check for encryption when handling credentials
if grep -qiE '(credential|secret|apiKey|token|password)' "$FILE_PATH"; then
  if ! grep -qE '(encrypt|decrypt|encryptionService)' "$FILE_PATH"; then
    WARNINGS="$WARNINGS
- Potential unencrypted credentials: Consider using encryptionService for sensitive data"
  fi
fi

# Check for audit logging on sensitive operations
if grep -qE '(delete|remove|revoke|update.*credential|update.*policy)' "$FILE_PATH"; then
  if ! grep -qE '(auditLog|createAuditLog|logAdminAction)' "$FILE_PATH"; then
    WARNINGS="$WARNINGS
- Missing audit logging: Sensitive operations should be logged"
  fi
fi

# Output warnings if any
if [ -n "$WARNINGS" ]; then
  echo "SECURITY REMINDERS for $(basename "$FILE_PATH"):"
  echo "$WARNINGS"
  echo ""
  echo "Please verify these patterns are correctly implemented."
fi

exit 0
