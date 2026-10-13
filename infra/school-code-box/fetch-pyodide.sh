#!/usr/bin/env bash
# Puts Python for the boards (Pyodide 0.27.7's core: CPython in WebAssembly, MPL-2.0) in
# ./pyodide, which the gateway serves at /assets/pyodide/0.27.7/. Boards without Python then
# get it from this box, once, instead of the internet. Run it once on the box PC (it needs the
# internet that one time). 5.6 MB download, 13.8 MB on disk. The checksum is pinned.
set -euo pipefail

VERSION=0.27.7
SHA256=9bc8f127db6c590b191b9aee754022cb41b1a36c7bac233776c11c5ecb541be8
URL="https://github.com/pyodide/pyodide/releases/download/${VERSION}/pyodide-core-${VERSION}.tar.bz2"

here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/pyodide"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading Pyodide core $VERSION…"
curl -fsSL -o "$tmp/core.tar.bz2" "$URL"
if command -v sha256sum >/dev/null; then
  echo "$SHA256  $tmp/core.tar.bz2" | sha256sum -c -
else
  echo "$SHA256  $tmp/core.tar.bz2" | shasum -a 256 -c -
fi
tar -xjf "$tmp/core.tar.bz2" -C "$tmp"
mkdir -p "$dest"
for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do
  cp "$tmp/pyodide/$f" "$dest/$f"
done
echo "Pyodide $VERSION is in $dest; boards can now get Python from this box."
