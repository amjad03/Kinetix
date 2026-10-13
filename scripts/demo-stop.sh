#!/usr/bin/env bash
# Stops the API and the ERP started by scripts/demo-start.sh (Postgres keeps running).
for name in api erp; do
  f=/tmp/kinetix-$name.pid
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
  rm -f "$f"
done
for port in 4000 3000; do p=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null); [ -n "$p" ] && kill $p 2>/dev/null; done
sleep 1
echo "Stopped the KINETIX API and ERP."
