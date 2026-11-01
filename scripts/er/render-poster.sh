#!/usr/bin/env bash
# Renders docs/architecture/er/zynetix-er-overview.svg to .png and a one-page .pdf with headless Chrome.
# Run after: node scripts/er/generate.mjs
set -euo pipefail
cd "$(dirname "$0")/../../docs/architecture/er"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
read -r W H < <(sed -nE 's/^<svg[^>]* width="([0-9]+)" height="([0-9]+)".*/\1 \2/p' zynetix-er-overview.svg)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf '<!doctype html><style>@page{size:%spx %spx;margin:0}html,body{margin:0}img{display:block}</style><img src="file://%s/zynetix-er-overview.svg" width="%s" height="%s">' "$W" "$H" "$PWD" "$W" "$H" > "$TMP/poster.html"
"$CHROME" --headless=new --disable-gpu --user-data-dir="$TMP/profile" --hide-scrollbars --window-size="$W,$H" --screenshot="$PWD/zynetix-er-overview.png" "file://$PWD/zynetix-er-overview.svg" 2>/dev/null
"$CHROME" --headless=new --disable-gpu --user-data-dir="$TMP/profile" --no-pdf-header-footer --print-to-pdf="$PWD/zynetix-er-overview.pdf" "file://$TMP/poster.html" 2>/dev/null
echo "wrote zynetix-er-overview.png and .pdf (${W}x${H})"
