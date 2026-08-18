#!/bin/bash

# Count lines of code in the SENTINEL project
# Excludes: node_modules, dist, build, .git, lock files, generated files

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "================================"
echo "SENTINEL Lines of Code Summary"
echo "================================"
echo ""

# Function to count lines for a file pattern
count_lines() {
    local pattern="$1"
    local label="$2"
    local count=$(find . -type f -name "$pattern" \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/dist/*" \
        -not -path "*/build/*" \
        -not -path "*/.next/*" \
        -not -path "*/coverage/*" \
        -not -path "*/.prisma/*" \
        -not -name "*.lock" \
        -not -name "package-lock.json" \
        -not -name "pnpm-lock.yaml" \
        -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
    printf "%-20s %8s lines\n" "$label:" "$count"
    echo "$count"
}

# Count by file type
ts_count=$(count_lines "*.ts" "TypeScript" | tail -1)
tsx_count=$(count_lines "*.tsx" "TypeScript React" | tail -1)
js_count=$(count_lines "*.js" "JavaScript" | tail -1)
json_count=$(count_lines "*.json" "JSON" | tail -1)
css_count=$(count_lines "*.css" "CSS" | tail -1)
prisma_count=$(count_lines "*.prisma" "Prisma" | tail -1)
md_count=$(count_lines "*.md" "Markdown" | tail -1)
sh_count=$(count_lines "*.sh" "Shell" | tail -1)

echo ""
echo "--------------------------------"

# Calculate totals
code_total=$((ts_count + tsx_count + js_count))
all_total=$((code_total + json_count + css_count + prisma_count + md_count + sh_count))

printf "%-20s %8s lines\n" "Code (TS/TSX/JS):" "$code_total"
printf "%-20s %8s lines\n" "Total:" "$all_total"

echo ""
echo "================================"
echo "By Package"
echo "================================"
echo ""

# Count by package
pkg_total=0
for pkg in packages/*/; do
    if [ -d "$pkg" ]; then
        pkg_name=$(basename "$pkg")
        pkg_count=$(find "$pkg" -type f \( -name "*.ts" -o -name "*.tsx" \) \
            -not -path "*/node_modules/*" \
            -not -path "*/dist/*" \
            -not -path "*/.next/*" \
            -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
        printf "%-20s %8s lines\n" "$pkg_name:" "$pkg_count"
        pkg_total=$((pkg_total + pkg_count))
    fi
done
echo "--------------------------------"
printf "%-20s %8s lines\n" "Total:" "$pkg_total"

# Count test files
echo ""
echo "================================"
echo "Test Files"
echo "================================"
echo ""

test_count=$(find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) \
    -not -path "./node_modules/*" \
    -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
printf "%-20s %8s lines\n" "Test files:" "$test_count"

echo ""
