#!/usr/bin/env bash
# tools/explore.sh <app> <steps file> <out dir>: runs capture/<app>_explore_test.dart with the steps pasted in.
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$HERE/capture/_x_$1_test.dart"
python3 -c "import sys;s=open(sys.argv[1]).read();print(s.replace('//STEPS',open(sys.argv[2]).read()),end='')" "$HERE/capture/$1_explore_test.dart" "$2" > "$T"
rm -rf "$3"; mkdir -p "$3"
PREVIEW="$3" "$HERE/tools/run_one.sh" "$1" "_x_$1_test.dart" | grep -v '^\s*$' | tail -${TAILN:-8}
rm -f "$T"
cat "$3/errors.txt" 2>/dev/null
