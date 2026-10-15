#!/usr/bin/env bash
# Runs one capture/explore test inside an app: tools/run_one.sh <app> <test file in capture/>
# Copies zz_rec.dart and the test into apps/<app>/test/ as zz_* files and always deletes them.
# The app sees a fixed demo moment: Monday 5 Oct 2026, 10:14 (libfaketime), like the demo tests.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HERE/../../../apps/$1"
SRC="$HERE/capture/$2"
NAME="zz_$(basename "$2")"
FLUTTER="${FLUTTER:-/opt/flutter/bin/flutter}"
cp "$HERE/capture/zz_rec.dart" "$APP/test/zz_rec.dart"
cp "$SRC" "$APP/test/$NAME"
trap 'rm -f "$APP/test/zz_rec.dart" "$APP/test/$NAME"' EXIT
FT="${FAKE_AT:-@2026-10-05 10:14:20}"
LIB=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1
[ -n "${NOFAKE:-}" ] && LIB=""
(cd "$APP" && LD_PRELOAD="$LIB" FAKETIME="$FT" DONT_FAKE_MONOTONIC=1 FAKETIME_ONLY_CMDS=flutter_tester "$FLUTTER" test --no-pub "test/$NAME" 2>&1)
