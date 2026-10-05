package app.kinetix.board

import android.app.admin.DeviceAdminReceiver

/**
 * Makes the board a device admin, so it can be provisioned as device owner for kiosk mode:
 * `adb shell dpm set-device-owner in.kinetix.board/app.kinetix.board.KioskAdminReceiver`
 * (docs/hardware/kiosk-mode.md). It needs no callbacks.
 */
class KioskAdminReceiver : DeviceAdminReceiver()
