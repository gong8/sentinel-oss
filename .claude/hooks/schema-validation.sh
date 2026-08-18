#!/bin/bash
# Schema Validation Hook: Auto-validate Prisma schema changes
#
# This hook runs after Edit/Write on schema.prisma to:
# 1. Validate the schema syntax
# 2. Generate the Prisma client
# 3. Run typecheck to catch type drift
#
# This ensures schema changes are valid and types stay in sync.

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Only run for schema.prisma changes
if [[ "$TOOL_INPUT" != *"schema.prisma"* ]]; then
  exit 0
fi

echo "Prisma schema changed - validating..."

# Step 1: Validate schema syntax
if ! VALIDATE_OUTPUT=$(pnpm --filter @sentinel/db exec prisma validate 2>&1); then
  echo "SCHEMA VALIDATION ERROR:"
  echo ""
  echo "$VALIDATE_OUTPUT"
  exit 0
fi

# Step 2: Generate Prisma client
if ! GENERATE_OUTPUT=$(pnpm db:generate 2>&1); then
  echo "PRISMA GENERATE ERROR:"
  echo ""
  echo "$GENERATE_OUTPUT"
  exit 0
fi

# Step 3: Quick typecheck to ensure types are in sync
if ! TYPECHECK_OUTPUT=$(pnpm typecheck 2>&1); then
  echo "TYPE ERRORS after schema change:"
  echo ""
  echo "$TYPECHECK_OUTPUT"
  echo ""
  echo "Schema was generated but caused type errors. Please fix."
  exit 0
fi

echo "Schema validated and client generated successfully"
exit 0
