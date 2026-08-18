#!/bin/bash
# Type Guard Pre-Edit Hook: Block forbidden patterns before they're written
#
# This hook runs BEFORE Edit/Write tools to prevent introducing:
# - 'as' type assertions (except 'as const')
# - @ts-ignore comments
# - @ts-expect-error comments
# - 'any' type annotations
# - eslint-disable comments
#
# Exit codes:
# 0 = Allow the edit
# 2 = Block the edit (shows message to Claude)

# Only check TypeScript/JavaScript files
if [[ "$TOOL_INPUT" != *".ts"* ]] && [[ "$TOOL_INPUT" != *".tsx"* ]] && \
   [[ "$TOOL_INPUT" != *".js"* ]] && [[ "$TOOL_INPUT" != *".jsx"* ]]; then
  exit 0
fi

# Skip test files - they may need some flexibility
if [[ "$TOOL_INPUT" == *"/test/"* ]] || [[ "$TOOL_INPUT" == *".test."* ]] || [[ "$TOOL_INPUT" == *".spec."* ]]; then
  exit 0
fi

# Skip config files
if [[ "$TOOL_INPUT" == *"config"* ]] || [[ "$TOOL_INPUT" == *".config."* ]]; then
  exit 0
fi

# Check for forbidden patterns in the new content being written
# Note: TOOL_INPUT contains the tool parameters as JSON

# Extract new_string or content from the tool input
NEW_CONTENT=$(echo "$TOOL_INPUT" | grep -oE '"(new_string|content)"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 || true)

if [ -z "$NEW_CONTENT" ]; then
  # Can't extract content, allow the edit
  exit 0
fi

# Check for 'as' assertions (but allow 'as const')
if echo "$NEW_CONTENT" | grep -qE '\bas\s+[A-Z][a-zA-Z]*' && ! echo "$NEW_CONTENT" | grep -qE '\bas\s+const\b'; then
  echo "BLOCKED: Type assertion detected"
  echo ""
  echo "Found 'as <Type>' assertion which is forbidden."
  echo "Use proper type inference, generics, or Zod validation instead."
  echo ""
  echo "Allowed: 'as const' for literal types"
  echo "Forbidden: 'as string', 'as MyType', etc."
  exit 2
fi

# Check for @ts-ignore
if echo "$NEW_CONTENT" | grep -qE '@ts-ignore'; then
  echo "BLOCKED: @ts-ignore comment detected"
  echo ""
  echo "@ts-ignore is forbidden. Fix the type error properly."
  exit 2
fi

# Check for @ts-expect-error
if echo "$NEW_CONTENT" | grep -qE '@ts-expect-error'; then
  echo "BLOCKED: @ts-expect-error comment detected"
  echo ""
  echo "@ts-expect-error is forbidden. Fix the type error properly."
  exit 2
fi

# Check for 'any' type (but not in comments or strings)
if echo "$NEW_CONTENT" | grep -qE ':\s*any\b|<any>|any\[\]'; then
  echo "BLOCKED: 'any' type detected"
  echo ""
  echo "The 'any' type is forbidden. Use 'unknown' with Zod validation,"
  echo "or define a proper type/interface."
  exit 2
fi

# Check for eslint-disable
if echo "$NEW_CONTENT" | grep -qE 'eslint-disable'; then
  echo "BLOCKED: eslint-disable comment detected"
  echo ""
  echo "eslint-disable is forbidden. Fix the lint issue properly."
  exit 2
fi

# All checks passed
exit 0
