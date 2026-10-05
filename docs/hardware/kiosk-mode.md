# Kiosk mode: keeping a board on KINETIX Board

Kiosk mode locks a classroom panel to the KINETIX Board app. Students cannot leave it for the
home screen, Settings, a browser or games, and the board opens again by itself after a power cut.
IT staff leave it with an **IT PIN** that the institution sets in KINETIX ERP.

| Where | What the board does |
| --- | --- |
| Android, board app is **device owner** (or allowed by your MDM) | Full lock (Android *lock task mode*): no home, recents or notification shade, no system prompt, no lock screen, status bar off, the board is the home app, the screen stays on while plugged in |
| Android, not device owner | Falls back to **screen pinning**: Android asks once to pin; a user who knows the key combination can unpin, and the board pins again as soon as it is back in front |
| Windows | No lock API for the app: use **Windows Assigned Access** (below). Started with `--kiosk`, the board covers the whole screen without a frame |
| Demo builds | Never locked. *Board settings → Kiosk mode → Try kiosk (screen pinning)* shows what it is like |

In kiosk mode the board also runs in immersive full screen (Android's bars appear only for a moment
after a swipe from the edge).

## Turning it on: KINETIX ERP

*ERP → Settings → Board kiosk mode* (principal or administrator):

- **Lock boards to KINETIX Board**: on by default. Turning it off unlocks every board the next time
  it is online.
- **IT PIN**: 4 to 8 digits, typed twice. The API keeps only a salted hash (PBKDF2-SHA256); the PIN
  is never shown again, returned by the API or written to the audit log (the log says only "PIN
  set" / "PIN removed"). Boards receive the salt and hash (`GET /v1/devices/me/config`) and check a
  typed PIN themselves, so the PIN works offline.

A board applies the policy on start (from its cache), after enrolment and every time it
reconnects. A board that was never enrolled is never locked.

A short PIN cannot resist someone who extracts the hash from a board and tries every PIN offline.
Treat the IT PIN as a "keep students out" lock, not a secret that protects data, use 6–8 digits,
and change it when IT staff leave.

## Leaving kiosk mode (IT)

1. Press and hold the **clock** in the top bar (or the "KINETIX Board" version line in the profile
   menu) for **3 seconds**.
2. Enter the IT PIN.
3. Choose **Leave kiosk for 10 minutes** (the board locks again by itself after 10 minutes, or when
   it restarts) or **Open Android settings** (also leaves for 10 minutes). *Lock again now* in the
   same dialog ends the pause early.

Five wrong PINs in a row lock the PIN out for 5 minutes, also across a restart. With no PIN set the
dialog says the PIN must first be set in ERP Settings.

**Lost PIN**: the principal or administrator sets a new one in ERP Settings; each board picks it up
the next time it is online. A board that stays offline keeps the old PIN. Alternatively, turn
kiosk mode off in the ERP and let the board come online.

## Android: making KINETIX Board the device owner

Only a device owner can lock fully without a prompt. A device has one owner, set either on a fresh
device (after a factory reset) or through an MDM.

### Pilot: adb

For a few panels. The device must have **no accounts** (remove Google and vendor accounts, or
factory-reset and skip account setup) and only one user.

1. Install the board APK (`adb install app-arm64-v8a-release.apk`).
2. `adb shell dpm set-device-owner in.kinetix.board/app.kinetix.board.KioskAdminReceiver`
3. Open the board, enrol it from *ERP → Boards*. With kiosk mode on in the ERP it locks within
   seconds; *Board settings → Kiosk mode* says "On: this device is locked to KINETIX Board."

A device owner app cannot be uninstalled from Settings. To **remove** it (stop using kiosk mode on
that panel, or hand the panel to another use): turn kiosk mode off in the ERP (or leave with the
PIN), then factory-reset the panel. KINETIX Board does not offer an in-app "give up device owner".

### Fleets: an MDM

For more than a handful of panels, use an Android Enterprise MDM. The MDM's own app becomes the
device owner (QR code or zero-touch enrolment after a factory reset, per the MDM's guide) and you
add `in.kinetix.board` as the kiosk / lock task app. The board then locks fully (it sees that it is
allowed), while the lock screen, status bar, home app and updates follow the MDM's policy.
KINETIX Board itself is not a DPC and cannot be enrolled by QR code on its own.

Options used in India include Scalefusion, ManageEngine Mobile Device Manager Plus, Hexnode,
Microsoft Intune and Esper, as well as the management consoles of some panel makers. Check the
current plans and Android Enterprise support with the vendor; we make no claim about price.

### What to expect without device owner

Screen pinning is a fallback, not a lock: Android shows a "Pin app?" prompt, and a user can unpin
(hold Back and Overview, or swipe up and hold with gesture navigation). The board pins again
whenever it comes back to the front. After a reboot Android 10+ may not let a non-owner app open by
itself, so the panel may stop at the home screen. Device ownership is what makes the board the home
app: its HOME entry point (`KioskHome`) is switched off on ordinary installs, so phones and tablets
that only have the app installed never get a "choose a home app" prompt.

## Windows: Assigned Access

Windows panels (an OPS PC or a mini PC) are locked by Windows, not by the app:

- **Single-app kiosk** (Assigned Access): *Settings → Accounts → Other users → Set up a kiosk*,
  create a local kiosk account and choose KINETIX Board. The account signs in automatically and
  runs only the board.
- **Shell Launcher** (Windows Enterprise / Education) or an MDM (e.g. Intune's kiosk profile, the
  Assigned Access CSP) for fleets, and to pass the board a command line:
  `kinetix_board.exe --kiosk` opens it borderless over the whole screen.

Which app types each Windows edition and version accepts in single-app kiosk mode changes between
releases: try the exact Windows build on one panel first. IT leave the kiosk account with
Ctrl+Alt+Del and sign in as an administrator; the board's IT PIN does not apply on Windows.

## Where it lives

- Board: `apps/board/lib/core/kiosk/` (policy, PIN check, lockout, pause), `lib/features/kiosk/`
  (exit dialog, settings section), Android `android/app/src/main/kotlin/app/kinetix/board/Kiosk.kt`
  (channel `kinetix/kiosk`: `status`, `enter`, `exit`, `openSystemSettings`), `KioskAdminReceiver.kt`,
  `BootReceiver.kt`, `res/xml/kiosk_admin.xml`; Windows `windows/runner/main.cpp` (`--kiosk`).
- API: `services/api/src/common/kiosk-pin.ts`, `PUT /v1/admin/settings` (`boardKiosk`),
  `GET /v1/devices/me/config`.
- ERP: `apps/erp/src/components/settings/KioskSection.tsx`.
