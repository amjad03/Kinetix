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
# Docker: install Docker Desktop if missing (Homebrew), start it if stopped, wait until it answers.
# `docker info` can hang while Docker Desktop is half-started, so every check has a time limit.
echo "== Checking Docker"
docker_ok() { docker info >/dev/null 2>&1 & local pid=$!; ( sleep 8; kill "$pid" 2>/dev/null ) & local w=$!; wait "$pid" 2>/dev/null; local rc=$?; kill "$w" 2>/dev/null; return $rc; }
# Prefer Docker Desktop's own CLI and context over any other docker on the PATH (Homebrew, Colima).
export PATH="/Applications/Docker.app/Contents/Resources/bin:$HOME/.docker/bin:$PATH"
if [ "$(uname)" = Darwin ] && docker context ls --format '{{.Name}}' 2>/dev/null | grep -qx desktop-linux; then
  docker context use desktop-linux >/dev/null 2>&1 || true
fi
if [ "$(uname)" = Darwin ] && [ ! -d /Applications/Docker.app ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "== Installing Docker Desktop (Homebrew; it may ask for your Mac password)"
    brew install --cask docker
  else
    ARCH=$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo amd64 )
    echo "Docker Desktop is not installed. Downloading it in your browser:"
    echo "  https://desktop.docker.com/mac/main/$ARCH/Docker.dmg"
    echo "Open the .dmg, drag Docker to Applications, open it once (Accept, Skip), then run this again."
    open "https://desktop.docker.com/mac/main/$ARCH/Docker.dmg" 2>/dev/null || true
    exit 1
  fi
fi
if ! docker_ok; then
  echo "== Starting Docker Desktop (first start: click Accept and Skip in its window; signing in is not needed)"
  open -a Docker 2>/dev/null || true
  echo "   Waiting for Docker (up to 6 minutes)..."
  for i in $(seq 1 45); do docker_ok && break; [ $((i % 6)) -eq 0 ] && echo "   ...still waiting ($((i * 8))s)"; done
  docker_ok || { echo "Docker did not start. Open Docker Desktop from Applications, click Accept / Skip, wait for the whale icon in the menu bar to settle, then run this again."; exit 1; }
fi
echo "== Docker is running"

# Claude as the board's AI: ANTHROPIC_API_KEY=sk-ant-... scripts/zynetix-demo.sh (saved to the git-ignored
# .env.ai, so later starts keep it). Uses Anthropic's OpenAI-compatible endpoint; no key: AI shows previews.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  umask 077
  cat > .env.ai <<EOT
AI_BASE_URL=https://api.anthropic.com/v1
AI_API_KEY=$ANTHROPIC_API_KEY
AI_MODEL=${AI_MODEL:-claude-sonnet-5-5}
AI_FALLBACK_MODELS=${AI_FALLBACK_MODELS:-claude-haiku-5-5}
AI_VISION=true
EOT
  echo "== AI: Claude (${AI_MODEL:-claude-sonnet-5-5}) via .env.ai"
elif [ -f .env.ai ] && ! grep -q 'PASTE_YOUR_ANTHROPIC_KEY_HERE' .env.ai; then
  echo "== AI: Claude, from .env.ai"
else
  rm -f .env.ai
  echo "== AI: add your Claude key in the dashboard: Zynetix > Claude AI (after sign-in as admin)"
fi

# Reachable from boards/phones on the Wi-Fi, not only localhost.
export BIND_ADDR=0.0.0.0
API_PORT="${API_PORT:-4000}"; ERP_PORT="${ERP_PORT:-3000}"
IP="$( (ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}') 2>/dev/null | head -1 || true)"
IP="${IP:-localhost}"

echo "== Starting Postgres, Redis, migrations, API, ERP (first run builds images: several minutes)"
# One image at a time: compiling the API needs ~3 GB, too much alongside the others on an 8 GB Mac.
COMPOSE_PARALLEL_LIMIT=1 $DC build
$DC up -d --wait
echo "== Seeding the SDMCET demo (safe to re-run)"
$DC --profile seed-sdmcet run --rm seed-sdmcet
$DC --profile seed-sdmcet up -d sdmcet-heartbeat

cat <<EOT

Zynetix demo is up.
  ERP / admin : http://$IP:$ERP_PORT   (this Mac: http://localhost:$ERP_PORT)
  API         : http://$IP:$API_PORT   <- enter this as the server URL on boards, IFPs and phones
  Docs        : http://$IP:$API_PORT/docs

Logins: see docs/zynetix/DEMO.md ("Demo accounts") or the seed output above.
Stop: scripts/zynetix-demo.sh stop    Wipe data: scripts/zynetix-demo.sh reset
If the macOS firewall asks, allow incoming connections for Docker.
EOT
