#!/usr/bin/env bash
# Runs the Board's integration test against a freshly seeded local API.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/services/api"
sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS zynetix WITH (FORCE)" -c "CREATE DATABASE zynetix OWNER zynetix_owner"
pnpm -s db:migrate
CODE=$(pnpm -s db:seed | sed -n 's/.*enrolment code for "Room 204 Board": //p')
node --env-file=.env dist/main.js > /tmp/zynetix-api-it.log 2>&1 &
API_PID=$!
trap 'kill $API_PID' EXIT
for _ in $(seq 1 30); do curl -sf http://localhost:4000/health >/dev/null && break; sleep 0.5; done
cd "$ROOT/apps/board"
ZYNETIX_IT_API=http://localhost:4000 ZYNETIX_IT_ENROLL_CODE="$CODE" flutter test test/integration
