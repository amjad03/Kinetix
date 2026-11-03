#!/usr/bin/env bash
# Fails when a tracked file holds something that looks like a live secret: cloud keys, private keys, live payment keys,
# Google API keys, Slack and GitHub tokens, service-account JSON, or a committed .env. Test fixtures with made-up values
# are allowed by path (ALLOW). Run from the repository root; CI runs it on every push (.github/workflows/ci.yml).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PATTERN='(AKIA[0-9A-Z]{16}|-----BEGIN ((RSA|EC|OPENSSH|DSA) )?PRIVATE KEY-----|rzp_live_[A-Za-z0-9]{14,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{36}|sk-(proj-)?[A-Za-z0-9]{32,}|"private_key": *"-----BEGIN)'
# Made-up keys in tests, and vendored third-party bundles.
ALLOW='^(apps/erp/e2e/|apps/erp/src/lib/payments\.test\.ts|services/api/test/|apps/board/assets/simhub/|.*\.min\.js$)'

hits=$(git ls-files -z | grep -zvE "$ALLOW|pnpm-lock\.yaml$" | xargs -0 grep -nIE "$PATTERN" 2>/dev/null || true)
envs=$(git ls-files | grep -E '(^|/)\.env(\.[a-z]+)?$' | grep -vE '\.env\.example$' || true)
if [ -n "$hits" ] || [ -n "$envs" ]; then
  echo "Possible secrets in tracked files:"
  [ -n "$hits" ] && echo "$hits" | cut -c1-200
  [ -n "$envs" ] && echo "$envs"
  exit 1
fi
echo "No secrets found in $(git ls-files | wc -l) tracked files."
