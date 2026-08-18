#!/bin/bash

# Claude Code Stop Hook: Run Tests and Retry on Failure
# Max 5 attempts before giving up

# DISABLED - uncomment the line below to re-enable
exit 0

set -e

ATTEMPT_FILE="$CLAUDE_PROJECT_DIR/.claude/.test-attempts"
SUCCESS_FILE="$CLAUDE_PROJECT_DIR/.claude/.test-passed"
MAX_ATTEMPTS=5

# Check if tests already passed and no code changes since
if [ -f "$SUCCESS_FILE" ]; then
  LAST_HASH=$(cat "$SUCCESS_FILE")
  CURRENT_HASH=$(cd "$CLAUDE_PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|json)$' | sort | md5sum | cut -d' ' -f1)

  if [ "$LAST_HASH" = "$CURRENT_HASH" ]; then
    # No code changes since tests passed - skip
    exit 0
  fi

  # Code changed - remove success marker
  rm -f "$SUCCESS_FILE"
fi

# Read current attempt count
if [ -f "$ATTEMPT_FILE" ]; then
  ATTEMPT=$(cat "$ATTEMPT_FILE")
else
  ATTEMPT=0
fi

# Increment attempt
ATTEMPT=$((ATTEMPT + 1))

# Check if we've exceeded max attempts
if [ "$ATTEMPT" -gt "$MAX_ATTEMPTS" ]; then
  echo "Max retry attempts ($MAX_ATTEMPTS) reached. Stopping test loop."
  rm -f "$ATTEMPT_FILE"
  exit 0
fi

# Save current attempt
echo "$ATTEMPT" > "$ATTEMPT_FILE"

# Run tests
cd "$CLAUDE_PROJECT_DIR"
echo "Running tests (attempt $ATTEMPT/$MAX_ATTEMPTS)..."

# Capture test output
TEST_OUTPUT=$(pnpm test 2>&1) || TEST_EXIT_CODE=$?
TEST_EXIT_CODE=${TEST_EXIT_CODE:-0}

if [ "$TEST_EXIT_CODE" -eq 0 ]; then
  # Tests passed - save state and allow Claude to stop
  echo "All tests passed!"
  rm -f "$ATTEMPT_FILE"

  # Save hash of current code changes so we skip re-running if nothing changes
  CURRENT_HASH=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|json)$' | sort | md5sum | cut -d' ' -f1)
  echo "$CURRENT_HASH" > "$SUCCESS_FILE"

  exit 0
else
  # Tests failed - block Claude and provide feedback
  echo "Tests failed (attempt $ATTEMPT/$MAX_ATTEMPTS)"

  # Truncate output if too long (keep last 200 lines)
  TRUNCATED_OUTPUT=$(echo "$TEST_OUTPUT" | tail -n 200)

  # Output the failure info (this gets shown to Claude)
  cat << EOF

================================================================================
TESTS FAILED - Attempt $ATTEMPT of $MAX_ATTEMPTS
================================================================================

Please fix the failing tests. Here's the test output:

$TRUNCATED_OUTPUT

================================================================================
Continue working to fix these test failures.
================================================================================
EOF

  # Exit with code 2 to BLOCK Claude from stopping
  exit 2
fi
