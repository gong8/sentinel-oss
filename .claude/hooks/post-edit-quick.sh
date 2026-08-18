#!/bin/bash
# Quick Feedback Hook: Fast iteration mode
#
# This hook runs after Edit/Write tools for rapid feedback.
# Flow:
# 1. Format changed file only (silent)
# 2. Lint changed file only (silent)
# 3. pnpm typecheck  → If errors, output for Claude to fix
# 4. Run ONLY tests related to the changed file (if any exist)
#
# For full test suite, use /check command.

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Extract file path from tool input
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

# Step 1: Auto-fix formatting on changed file only (silent)
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  prettier --write "$FILE_PATH" >/dev/null 2>&1 || true
fi

# Step 2: Auto-fix lint on changed file only (silent)
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]] || [[ "$FILE_PATH" == *.js ]] || [[ "$FILE_PATH" == *.jsx ]]; then
    eslint --fix "$FILE_PATH" >/dev/null 2>&1 || true
  fi
fi

# Step 3: Type check (turbo cached)
if ! TYPECHECK_OUTPUT=$(turbo run typecheck 2>&1); then
  echo "TYPE ERRORS - Please fix:"
  echo ""
  echo "$TYPECHECK_OUTPUT"
  exit 0
fi

# Step 4: Find and run only related tests
if [ -n "$FILE_PATH" ]; then
  FILENAME=$(basename "$FILE_PATH" .ts)
  FILENAME="${FILENAME%.tsx}"  # Also handle .tsx

  # Skip if editing a test file itself
  if [[ "$FILE_PATH" == *".test."* ]] || [[ "$FILE_PATH" == *".spec."* ]]; then
    # Run just this test file
    TEST_FILE="$FILE_PATH"
  # Check for service file -> unit test
  elif [[ "$FILE_PATH" == *"packages/api/src/services/"* ]]; then
    TEST_FILE="test/unit/api/services/${FILENAME}.test.ts"
  # Check for tRPC admin router -> unit test
  elif [[ "$FILE_PATH" == *"packages/api/src/trpc/admin/"* ]]; then
    TEST_FILE="test/unit/api/trpc/admin/${FILENAME}.test.ts"
  # Check for tRPC user router -> unit test
  elif [[ "$FILE_PATH" == *"packages/api/src/trpc/user/"* ]]; then
    TEST_FILE="test/unit/api/trpc/user/${FILENAME}.test.ts"
  # Check for lib files
  elif [[ "$FILE_PATH" == *"packages/api/src/lib/"* ]]; then
    TEST_FILE="test/unit/api/lib/${FILENAME}.test.ts"
  # Check for MCP package
  elif [[ "$FILE_PATH" == *"packages/mcp/src/"* ]]; then
    TEST_FILE="test/unit/mcp/${FILENAME}.test.ts"
  else
    TEST_FILE=""
  fi

  # Run the related test if it exists
  if [ -n "$TEST_FILE" ] && [ -f "$CLAUDE_PROJECT_DIR/$TEST_FILE" ]; then
    RESULTS_DIR="$CLAUDE_PROJECT_DIR/test/results"
    if TEST_TYPE=unit vitest run "$TEST_FILE" >/dev/null 2>&1; then
      TOTAL=$(jq -r '.totalPassed // 0' "$RESULTS_DIR"/*.json 2>/dev/null | awk '{s+=$1} END {print s}' || echo "0")
      echo "Typecheck OK, related tests passed ($TOTAL tests in ${FILENAME})"
    else
      echo "RELATED TEST FAILURES - Please fix:"
      echo "Test file: $TEST_FILE"
      echo ""
      for f in "$RESULTS_DIR"/*.json; do
        if [ -f "$f" ]; then
          jq -r '
            .categories[]?.tests[]? |
            select(.failures != null and .failures != []) |
            .failures[] |
            "FAILED: \(.testName)\n\(.error)\n"
          ' "$f" 2>/dev/null || true
        fi
      done
    fi
  else
    echo "Typecheck OK (no related test file found)"
  fi
else
  echo "Typecheck OK"
fi

exit 0
