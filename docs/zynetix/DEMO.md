# Zynetix demo guide

The server runs on the presenter's Mac in Docker; boards, IFPs and phones join over the same Wi-Fi.

## Prerequisites
- Docker Desktop (running), about 8 GB free RAM and 10 GB disk.
- Mac and devices on the same Wi-Fi (no client isolation).

## Start / stop
```
scripts/zynetix-demo.sh          # build, migrate, seed SDMCET, print the LAN URL
scripts/zynetix-demo.sh stop     # stop, keep data
scripts/zynetix-demo.sh reset    # stop and wipe data
```
It prints `API: http://<mac-ip>:4000` and `ERP: http://<mac-ip>:3000`. Re-running is safe. If the macOS firewall asks, allow incoming connections.

## Point the apps at the server
Enter the printed API URL as the server in each app's sign-in/settings screen (apps built with the `api_url` workflow input already have it baked in). Check from a phone browser first: `http://<mac-ip>:4000/docs`.

## Builds
GitHub Actions workflow **Zynetix builds** (`zynetix-builds.yml`; run manually with an optional `api_url`) produces artifacts `zynetix-board|teacher|student|parent-android` (APK) and `zynetix-board-macos` (zipped .app).

## Android IFP / phones
1. Download the APK artifact and copy it to the device (USB: `adb install -r zynetix-board.apk`, or a USB stick / file manager).
2. Allow installs from unknown sources (Settings > Security, or the prompt for the file manager/browser).
3. Open the app and set the server URL.

## macOS board app (unsigned)
Unzip, move to Applications. First launch: right-click the app > Open > Open. If macOS says it is damaged:
`xattr -dr com.apple.quarantine /Applications/<app name>.app`. Allow camera and microphone when asked.

## Demo accounts
_To be filled by the SDMCET seed (logins, roles, passwords)._

## Troubleshooting
- Device cannot connect: same Wi-Fi? Try `curl http://<mac-ip>:4000/docs` from another machine; check the Mac firewall. Guest/campus Wi-Fi often isolates clients; use a phone hotspot or a router.
- Wrong IP printed: `ipconfig getifaddr en0` (en1 on some Macs) and use that manually.
- Port busy: set `API_PORT` / `ERP_PORT` before running the script.
- Build runs out of memory: Docker Desktop > Settings > Resources, give 6 GB or more.
- Logs: `docker compose logs -f api erp`. Clean slate: `scripts/zynetix-demo.sh reset`.
- Seed fails: `docker compose --profile seed-sdmcet run --rm seed-sdmcet` shows the error.
