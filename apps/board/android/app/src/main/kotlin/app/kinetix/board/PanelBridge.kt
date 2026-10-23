package app.kinetix.board

import android.app.Activity
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * The panel platform's Android side (lib/core/panel): the panel home's apps (what is installed,
 * launching one, letting allow-listed apps run in kiosk mode) and installing an app update with
 * PackageInstaller (silent as device owner, else the system asks). Answers `kinetix/panel`.
 */
class PanelBridge(private val activity: Activity) {
    private val pm: PackageManager = activity.packageManager
    private val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin = ComponentName(activity, KioskAdminReceiver::class.java)

    private val deviceOwner: Boolean
        get() = dpm.isDeviceOwnerApp(activity.packageName)

    /** Launchable apps (package, label, a small PNG icon), the board itself left out. */
    fun installedApps(): List<Map<String, Any?>> {
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        val found = pm.queryIntentActivities(main, 0)
        return found
            .filter { it.activityInfo.packageName != activity.packageName }
            .distinctBy { it.activityInfo.packageName }
            .map { ri ->
                mapOf(
                    "package" to ri.activityInfo.packageName,
                    "label" to ri.loadLabel(pm).toString(),
                    "icon" to iconPng(ri.loadIcon(pm)),
                )
            }
            .sortedBy { (it["label"] as String).lowercase() }
    }

    private fun iconPng(d: android.graphics.drawable.Drawable): ByteArray? = try {
        val size = 96
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        d.setBounds(0, 0, size, size)
        d.draw(c)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    } catch (e: Exception) {
        null
    }

    fun launchApp(pkg: String): Boolean {
        val intent = pm.getLaunchIntentForPackage(pkg) ?: return false
        activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }

    /** As device owner in kiosk mode: the allow-listed apps may run inside lock task mode too. */
    fun setAllowedApps(packages: List<String>): Boolean {
        if (!deviceOwner) return false
        dpm.setLockTaskPackages(admin, (listOf(activity.packageName) + packages).distinct().toTypedArray())
        return true
    }

    fun installInfo(): Map<String, Any?> {
        val canInstall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) pm.canRequestPackageInstalls() else true
        val prefs = activity.getSharedPreferences(UpdateReceiver.PREFS, Context.MODE_PRIVATE)
        val error = prefs.getString(UpdateReceiver.LAST_ERROR, null)
        prefs.edit().remove(UpdateReceiver.LAST_ERROR).apply()
        return mapOf("deviceOwner" to deviceOwner, "canInstall" to (deviceOwner || canInstall), "lastError" to error)
    }

    fun openInstallSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
        }
    }

    /** Writes the APK into a PackageInstaller session and commits it; the result arrives at [UpdateReceiver]. */
    fun installApk(path: String): String {
        val file = File(path)
        if (!file.exists()) throw IllegalArgumentException("No file at $path")
        if (!deviceOwner && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !pm.canRequestPackageInstalls()) return "needsPermission"
        val installer = pm.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(activity.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            file.inputStream().use { input ->
                session.openWrite("zynetix-board.apk", 0, file.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val intent = Intent(activity, UpdateReceiver::class.java).setAction(UpdateReceiver.ACTION_STATUS)
            val pending = PendingIntent.getBroadcast(activity, id, intent, flags)
            session.commit(pending.intentSender)
        }
        return if (deviceOwner) "silent" else "started"
    }
}
