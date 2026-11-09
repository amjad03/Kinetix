package app.kinetix.board

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Opens the board after a reboot (a power cut) while kiosk mode is on, or while Zynetix
 * Classroom's "Open Zynetix when the board starts" is on (BoardStartup.kt). As device owner or
 * home app the board opens anyway; this covers the rest. Android 10+ lets an app start an
 * activity from the background only with "Display over other apps" (Settings asks for it), so
 * without it a board may stop at the home screen (docs/hardware/kiosk-mode.md).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!Kiosk.bootLaunch(context) && !BoardStartup.openOnBoot(context)) return
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
