#!/usr/bin/env bash
# One-command Zynetix demo server (macOS/Linux, needs Docker). Idempotent.
#   scripts/zynetix-demo.sh          start (build, migrate, seed SDMCET, print URLs)
#   scripts/zynetix-demo.sh stop     stop (data kept)    |  reset  stop and wipe data
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose"
case "${1:-start}" in
  stop)  $DC --profile seed --profile seed-sdmcet down; exit 0 ;;
  reset) $DC --profile seed --profile seed-sdmcet down -v; exit 0 ;;
  start) ;;
  *) echo "usage: $0 [start|stop|reset]"; exit 2 ;;
esac
docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop first."; exit 1; }

# Reachable from boards/phones on the Wi-Fi, not only localhost.
export BIND_ADDR=0.0.0.0
API_PORT="${API_PORT:-4000}"; ERP_PORT="${ERP_PORT:-3000}"
IP="$( (ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}') 2>/dev/null | head -1 || true)"
IP="${IP:-localhost}"

echo "== Starting Postgres, Redis, migrations, API, ERP (first run builds images: several minutes)"
$DC up -d --build --wait
echo "== Seeding the SDMCET demo (safe to re-run)"
$DC --profile seed-sdmcet run --rm seed-sdmcet

cat <<EOT

Zynetix demo is up.
  ERP / admin : http://$IP:$ERP_PORT   (this Mac: http://localhost:$ERP_PORT)
  API         : http://$IP:$API_PORT   <- enter this as the server URL on boards, IFPs and phones
  Docs        : http://$IP:$API_PORT/docs

Logins: see docs/zynetix/DEMO.md ("Demo accounts") or the seed output above.
Stop: scripts/zynetix-demo.sh stop    Wipe data: scripts/zynetix-demo.sh reset
If the macOS firewall asks, allow incoming connections for Docker.
EOT
