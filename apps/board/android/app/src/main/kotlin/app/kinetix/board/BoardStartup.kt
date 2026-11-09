package app.kinetix.board

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Zynetix Classroom opening when the board starts, without device owner
 * (lib/classroom_edition/settings/startup_settings.dart, docs/hardware/kiosk-mode.md): the
 * "Open Zynetix when the board starts" switch read by [BootReceiver], the "Display over other
 * apps" permission Android 10 and later need before an app may open itself after a restart, and
 * the home-app helper (the HOME entry point, an activity-alias that is off until asked for).
 * Answers `zynetix/startup`.
 */
class BoardStartup(private val activity: Activity) {
    private val homeAlias = ComponentName(activity, "app.kinetix.board.KioskHome")

    fun status(): Map<String, Any> = mapOf(
        "openOnBoot" to openOnBoot(activity),
        "sdk" to Build.VERSION.SDK_INT,
        // Android 10+ lets an app start an activity from the background (after BOOT_COMPLETED)
        // only with "Display over other apps".
        "needsOverlay" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q),
        "canOverlay" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(activity)),
        "isHome" to isHome(),
        "homeEntry" to (activity.packageManager.getComponentEnabledSetting(homeAlias) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED),
    )

    fun setOpenOnBoot(on: Boolean) = setOpenOnBoot(activity, on)

    /** Opens this app's "Display over other apps" switch. */
    fun openOverlaySettings() {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /**
     * Offers Zynetix as a home app (turns its HOME entry point on) and opens the system's
     * "Default home app" settings, where the teacher picks it. [on] false turns the entry point
     * off again, so the panel's own launcher comes back.
     */
    fun homeApp(on: Boolean) {
        val state = if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        activity.packageManager.setComponentEnabledSetting(homeAlias, state, PackageManager.DONT_KILL_APP)
        val home = Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(home)
        } catch (e: Exception) {
            // Some panel builds have no "Default home app" screen: the general settings instead.
            activity.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun isHome(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val res = activity.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return res?.activityInfo?.packageName == activity.packageName
    }

    companion object {
        private const val PREFS = "kinetix_kiosk"
        private const val OPEN_ON_BOOT = "open_on_boot"

        /** Read by [BootReceiver]. */
        fun openOnBoot(context: Context): Boolean =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(OPEN_ON_BOOT, false)

        fun setOpenOnBoot(context: Context, on: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(OPEN_ON_BOOT, on).apply()
        }
    }
}
