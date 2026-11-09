#!/usr/bin/env python3
"""Writes classroom-update.json, the manifest Zynetix Classroom's "Check for update" reads
(lib/classroom_edition/update/app_update.dart), for a release's split APKs.

    python3 apps/board/tool/classroom_update_manifest.py \\
        --version 1.1.0+2 --notes-en "…" --notes-kn "…" \\
        --base-url https://media.githubusercontent.com/media/amjad03/zynetix-smart-classroom/apk-builds \\
        --out classroom-update.json \\
        zynetix-classroom-1.1.0-arm64-v8a.apk zynetix-classroom-1.1.0-armeabi-v7a.apk

Each APK's ABI is read from its file name; its versionCode is 1000 x the ABI's number plus the
build (as Flutter's --split-per-abi gives it), its size and SHA-256 from the file.
"""
import argparse
import hashlib
import json
import os
import re
import sys

ABI_CODES = {"armeabi-v7a": 1, "arm64-v8a": 2, "x86_64": 4}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="x.y.z+build")
    ap.add_argument("--notes-en", required=True)
    ap.add_argument("--notes-kn", required=True)
    ap.add_argument("--base-url", required=True, help="https URL the APK file names are added to")
    ap.add_argument("--app", default="in.zynetix.classroom")
    ap.add_argument("--out", required=True)
    ap.add_argument("apks", nargs="+")
    a = ap.parse_args()

    m = re.fullmatch(r"(\d+\.\d+\.\d+)\+(\d+)", a.version)
    if not m or not 1 <= int(m.group(2)) <= 999:
        sys.exit("--version must be x.y.z+build with a build of 1 to 999")
    if not a.base_url.startswith("https://"):
        sys.exit("--base-url must be https")
    name, build = m.group(1), int(m.group(2))

    apks = {}
    for path in a.apks:
        abi = next((x for x in ABI_CODES if x in os.path.basename(path)), None)
        if abi is None:
            sys.exit(f"no ABI in the file name: {path}")
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        apks[abi] = {
            "versionCode": ABI_CODES[abi] * 1000 + build,
            "url": f"{a.base_url.rstrip('/')}/{os.path.basename(path)}",
            "sha256": h.hexdigest(),
            "size": os.path.getsize(path),
        }

    manifest = {
        "app": a.app,
        "versionCode": build,
        "versionName": name,
        "notes": {"en": a.notes_en, "kn": a.notes_kn},
        "apks": apks,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
