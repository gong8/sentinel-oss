#!/bin/bash
# Post-edit hook: Auto-fix then check, output errors for Claude to fix
#
# This hook runs after Edit/Write tools complete.
# Flow:
# 1. pnpm format     → Auto-fix (silent)
# 2. pnpm lint:fix   → Auto-fix (silent)
# 3. pnpm typecheck  → If errors, output for Claude to fix
# 4. check:quality   → If violations, output for Claude to fix
# 5. pnpm test       → If failures, output for Claude to fix

cd "$CLAUDE_PROJECT_DIR" || exit 1

RESULTS_DIR="$CLAUDE_PROJECT_DIR/test/results"

# Step 1: Auto-fix formatting (silent)
pnpm format >/dev/null 2>&1 || true

# Step 2: Auto-fix lint issues (silent)
pnpm lint:fix >/dev/null 2>&1 || true

# Step 3: Type check
if ! TYPECHECK_OUTPUT=$(pnpm typecheck 2>&1); then
  echo "TYPE ERRORS - Please fix:"
  echo ""
  echo "$TYPECHECK_OUTPUT"
  exit 0
fi

# Step 4: Quality check (forbidden patterns like 'as any', '@ts-ignore')
if ! QUALITY_OUTPUT=$(pnpm check:quality 2>&1); then
  echo "QUALITY VIOLATIONS - Please fix:"
  echo ""
  echo "$QUALITY_OUTPUT"
  exit 0
fi

# Step 5: Run tests
if pnpm test >/dev/null 2>&1; then
  # All passed - minimal output
  TOTAL=0
  for f in "$RESULTS_DIR"/*.json; do
    [ -f "$f" ] && TOTAL=$((TOTAL + $(jq -r '.totalPassed // 0' "$f" 2>/dev/null || echo 0)))
  done
  echo "All checks passed ($TOTAL tests)"
else
  # Test failures - output from JSON
  echo "TEST FAILURES - Please fix:"
  echo ""
  for f in "$RESULTS_DIR"/*.json; do
    if [ -f "$f" ]; then
      jq -r '
        .categories[]?.tests[]? |
        select(.failures != null and .failures != []) |
        .failures[] |
        "============================================================\nFAILED: \(.file)\nTest: \(.testName)\n============================================================\n\n\(.error)\n" +
        (if .expected != null then "\nExpected: \(.expected)\n" else "" end) +
        (if .actual != null then "Actual: \(.actual)\n" else "" end) +
        (if .stack != "" and .stack != null then "\nStack trace:\n\(.stack)\n" else "" end)
      ' "$f" 2>/dev/null || true
    fi
  done
fi

exit 0
