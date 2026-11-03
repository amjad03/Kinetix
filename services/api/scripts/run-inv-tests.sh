#!/usr/bin/env bash
# Runs the stores, purchase and asset e2e files one at a time against the module's test database.
# Usage: scripts/run-inv-tests.sh [file-stem ...] (defaults to every inventory-related file).
cd "$(dirname "$0")/.."
files=("$@")
[ ${#files[@]} -eq 0 ] && files=(inventory-pass procurement procurement-depth campus-ops campus-ops-depth depth-finance-assets models-assets)
for f in "${files[@]}"; do
  echo "=== $f"
  ZYNETIX_PG_ADMIN_URL=${ZYNETIX_PG_ADMIN_URL:-postgres://root@localhost:5432/postgres} ZYNETIX_TEST_DB=${ZYNETIX_TEST_DB:-zynetix_test_inv} \
    timeout 900 ./node_modules/.bin/vitest run "test/$f.e2e.spec.ts" 2>&1 | grep -E "✓|×|FAIL|Tests |Error:|expected|❯ test" | head -40
done
