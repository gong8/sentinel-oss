#!/bin/bash
# Test Reminder Hook: Remind to add tests for new service/router files
#
# This hook runs after Edit/Write to check if a corresponding test file exists
# for newly created or modified service/router files.
#
# This is informational only - it outputs reminders but doesn't block.

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Extract file path from tool input
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check service and router files (not test files themselves)
if [[ "$FILE_PATH" == *".test."* ]] || [[ "$FILE_PATH" == *".spec."* ]]; then
  exit 0
fi

# Check for services
if [[ "$FILE_PATH" == *"packages/api/src/services/"* ]]; then
  FILENAME=$(basename "$FILE_PATH" .ts)
  TEST_FILE="test/unit/api/services/${FILENAME}.test.ts"

  if [ ! -f "$CLAUDE_PROJECT_DIR/$TEST_FILE" ]; then
    echo ""
    echo "TEST REMINDER: No test file found for service"
    echo "  Source: packages/api/src/services/${FILENAME}.ts"
    echo "  Expected test: $TEST_FILE"
    echo ""
    echo "Consider creating tests using: /add-tests"
  fi
fi

# Check for tRPC routers (admin)
if [[ "$FILE_PATH" == *"packages/api/src/trpc/admin/"* ]]; then
  FILENAME=$(basename "$FILE_PATH" .ts)
  # Convert camelCase to kebab-case for test file
  KEBAB_NAME=$(echo "$FILENAME" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
  TEST_FILE="test/integration/api/admin-${KEBAB_NAME}.test.ts"

  if [ ! -f "$CLAUDE_PROJECT_DIR/$TEST_FILE" ]; then
    echo ""
    echo "TEST REMINDER: No integration test found for admin router"
    echo "  Source: packages/api/src/trpc/admin/${FILENAME}.ts"
    echo "  Expected test: $TEST_FILE"
    echo ""
    echo "Consider creating tests using: /add-tests"
  fi
fi

# Check for tRPC routers (user)
if [[ "$FILE_PATH" == *"packages/api/src/trpc/user/"* ]]; then
  FILENAME=$(basename "$FILE_PATH" .ts)
  KEBAB_NAME=$(echo "$FILENAME" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
  TEST_FILE="test/integration/api/user-${KEBAB_NAME}.test.ts"

  if [ ! -f "$CLAUDE_PROJECT_DIR/$TEST_FILE" ]; then
    echo ""
    echo "TEST REMINDER: No integration test found for user router"
    echo "  Source: packages/api/src/trpc/user/${FILENAME}.ts"
    echo "  Expected test: $TEST_FILE"
    echo ""
    echo "Consider creating tests using: /add-tests"
  fi
fi

exit 0
