#!/usr/bin/env bash
# Puts Pyodide's core (CPython compiled to WebAssembly, MPL-2.0) in assets/runner/pyodide/, so
# the code lab runs Python on the board with no network. Run it once before building the
# Board or the Student App for release (docs/operations/mobile-release.md); CI's release job
# runs it too. Without it the apps still build, and Python says it is not installed.
#
# Only the core is bundled: the interpreter and the standard library, no numpy or other
# packages (enough for BCA/MCA programming classes).
#   pyodide.asm.wasm 10.1 MB, python_stdlib.zip 2.4 MB, pyodide.asm.js 1.3 MB, the rest 0.1 MB:
#   13.8 MB on disk, about 5.5 MB more in the APK/MSIX after compression.
set -euo pipefail

VERSION=0.27.7
SHA256=9bc8f127db6c590b191b9aee754022cb41b1a36c7bac233776c11c5ecb541be8
URL="https://github.com/pyodide/pyodide/releases/download/${VERSION}/pyodide-core-${VERSION}.tar.bz2"

here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/assets/runner/pyodide"
if [[ -f "$dest/VERSION" && "$(cat "$dest/VERSION")" == "$VERSION" ]]; then
  echo "Pyodide $VERSION is already in $dest"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading Pyodide core $VERSION…"
curl -fsSL -o "$tmp/core.tar.bz2" "$URL"
echo "$SHA256  $tmp/core.tar.bz2" | sha256sum -c -
tar -xjf "$tmp/core.tar.bz2" -C "$tmp"
mkdir -p "$dest"
for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do
  cp "$tmp/pyodide/$f" "$dest/$f"
done
echo "$VERSION" > "$dest/VERSION"
echo "Pyodide $VERSION is in $dest ($(du -sh "$dest" | cut -f1))"
