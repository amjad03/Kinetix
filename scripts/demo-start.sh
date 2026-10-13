#!/usr/bin/env bash
# One command for a live demo: Postgres, the API (0.0.0.0:4000) and the ERP (port 3000), in the background.
# Logs: /tmp/kinetix-api.log and /tmp/kinetix-erp.log. Stop with scripts/demo-stop.sh.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4500}"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@18/bin:$PATH"
PGDATA_DIR=/opt/homebrew/var/postgresql@18

say() { printf '\n== %s\n' "$*"; }

# 1. Postgres (clears a stale postmaster.pid left by a crash or power cut).
say "Postgres"
if ! pg_isready -q -h localhost -p 5432; then
  PIDFILE="$PGDATA_DIR/postmaster.pid"
  if [ -f "$PIDFILE" ]; then
    PID=$(head -1 "$PIDFILE")
    if ! kill -0 "$PID" 2>/dev/null; then echo "Removing stale $PIDFILE (pid $PID is not running)"; rm -f "$PIDFILE"; fi
  fi
  brew services restart postgresql@18 >/dev/null
  for _ in $(seq 1 30); do pg_isready -q -h localhost -p 5432 && break; sleep 1; done
fi
pg_isready -h localhost -p 5432 || { echo "Postgres did not start. See: brew services info postgresql@18"; exit 1; }

# 2. Build if needed (one at a time: this Mac has 8 GB).
say "Build"
if [ ! -f "$ROOT/packages/shared/dist/index.js" ] && [ -f "$ROOT/packages/shared/package.json" ]; then (cd "$ROOT/packages/shared" && pnpm build); fi
if [ ! -f "$ROOT/services/api/dist/main.js" ]; then (cd "$ROOT/services/api" && pnpm build) || exit 1; else echo "API build present"; fi
if [ ! -f "$ROOT/apps/erp/.next/BUILD_ID" ]; then (cd "$ROOT/apps/erp" && npx next build) || exit 1; else echo "ERP build present"; fi
(cd "$ROOT/services/api" && pnpm -s db:migrate) || echo "WARNING: migrations failed (see above)"

# 3. Start the API and the ERP (frees the ports first).
free_port() { local p; p=$(lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null); [ -n "$p" ] && { echo "Port $1 busy (pid $p): stopping it"; kill $p 2>/dev/null; sleep 2; kill -9 $p 2>/dev/null; }; true; }
say "Start"
free_port 4000
free_port 3000
(cd "$ROOT/services/api" && exec nohup node --env-file-if-exists=.env dist/main.js) > /tmp/kinetix-api.log 2>&1 < /dev/null &
echo $! > /tmp/kinetix-api.pid
(cd "$ROOT/apps/erp" && KINETIX_API_URL=http://localhost:4000 KINETIX_TIMEZONE=Asia/Kolkata KINETIX_INSECURE_COOKIES=1 exec nohup node_modules/.bin/next start --port 3000 --hostname 0.0.0.0) > /tmp/kinetix-erp.log 2>&1 < /dev/null &
echo $! > /tmp/kinetix-erp.pid

# 4. Health check.
API_OK=no; ERP_OK=no
for _ in $(seq 1 60); do
  [ "$API_OK" = no ] && curl -fs -o /dev/null http://localhost:4000/health && API_OK=yes
  [ "$ERP_OK" = no ] && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login | grep -q 200 && ERP_OK=yes
  [ "$API_OK" = yes ] && [ "$ERP_OK" = yes ] && break
  sleep 1
done
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
say "KINETIX demo"
echo "API health: $API_OK   ERP: $ERP_OK"
echo "This Mac on the Wi-Fi: $IP"
echo "ERP (browser):            http://$IP:3000   (on this Mac: http://localhost:3000)"
echo "Server address for apps:  http://$IP:4000   (smartboard, teacher, student, parent apps)"
echo "Logs: tail -f /tmp/kinetix-api.log /tmp/kinetix-erp.log    Stop: scripts/demo-stop.sh"
[ "$API_OK" = yes ] && [ "$ERP_OK" = yes ] || { echo "Something did not start: check the logs above."; exit 1; }
