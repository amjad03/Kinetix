#!/usr/bin/env bash
# Runs one capture/explore test inside an app: tools/run_one.sh <app> <test file in capture/>
# Copies zz_rec.dart and the test into apps/<app>/test/ as zz_* files and always deletes them.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HERE/../../../apps/$1"
SRC="$HERE/capture/$2"
NAME="zz_$(basename "$2")"
FLUTTER="${FLUTTER:-/opt/flutter/bin/flutter}"
cp "$HERE/capture/zz_rec.dart" "$APP/test/zz_rec.dart"
cp "$SRC" "$APP/test/$NAME"
trap 'rm -f "$APP/test/zz_rec.dart" "$APP/test/$NAME"' EXIT
(cd "$APP" && "$FLUTTER" test --no-pub "test/$NAME" 2>&1)
