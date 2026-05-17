#!/bin/bash
# Run this before submitting: bash scripts/preflight.sh

echo "=== Pre-submission preflight check ==="

# 1. TypeScript compiles with no errors
echo "Checking TypeScript..."
npx tsc --noEmit && echo "✓ TypeScript OK" || echo "✗ TypeScript errors found"

# 2. .env is not committed
echo "Checking .env is gitignored..."
git check-ignore -q .env && echo "✓ .env is gitignored" || echo "✗ WARNING: .env may be committed"

# 3. No console.log in src/ (only logger allowed)
echo "Checking for console.log..."
CONSOLE_LOGS=$(grep -r "console\." src/ --include="*.ts" | grep -v "test" | wc -l)
[ "$CONSOLE_LOGS" -eq 0 ] && echo "✓ No console.log found" || echo "✗ Found $CONSOLE_LOGS console.log calls in src/"

# 4. Unit tests pass
echo "Running unit tests..."
npm run test:unit --silent && echo "✓ Unit tests pass" || echo "✗ Unit tests failing"

# 5. TypeCheck passes
echo "Running typecheck..."
npm run typecheck && echo "✓ No type errors" || echo "✗ Type errors found"

# 6. .env.example exists and is committed
echo "Checking .env.example..."
[ -f ".env.example" ] && echo "✓ .env.example exists" || echo "✗ .env.example missing"

# 7. README.md exists
echo "Checking README..."
[ -f "README.md" ] && echo "✓ README.md exists" || echo "✗ README.md missing"

# 8. docker-compose.yml exists
echo "Checking Docker Compose..."
[ -f "docker-compose.yml" ] && echo "✓ docker-compose.yml exists" || echo "✗ docker-compose.yml missing"

echo ""
echo "=== Preflight complete ==="
echo "Fix any ✗ items above before submitting."
