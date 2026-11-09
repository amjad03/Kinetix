package app.kinetix.board

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.security.MessageDigest

/**
 * Zynetix Classroom's updates without the Play Store (lib/classroom_edition/update/): what is
 * installed, what an APK file is (package, version, signing certificate), and installing one
 * with the system installer (ACTION_VIEW on a FileProvider URI; the app needs
 * REQUEST_INSTALL_PACKAGES and the teacher's "Install unknown apps" permission). Android itself
 * refuses an APK signed with another certificate or an older version. Answers `zynetix/update`.
 */
class Updater(private val activity: Activity) {
    private val pm get() = activity.packageManager
    private val pkg get() = activity.packageName

    /** The installed app: package, versionCode, versionName, signing certificates, the device's ABIs. */
    fun installed(): Map<String, Any?> {
        val info = packageInfo(pkg)
        return mapOf(
            "packageName" to pkg,
            "versionCode" to PackageInfoCompat.getLongVersionCode(info),
            "versionName" to info.versionName,
            "certificates" to certificates(info),
            "abis" to Build.SUPPORTED_ABIS.toList(),
        )
    }

    /** An APK file's package, versionCode, versionName and signing certificates; null when it is not an APK. */
    fun inspect(path: String): Map<String, Any?>? {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val info = pm.getPackageArchiveInfo(path, flags) ?: return null
        return mapOf(
            "packageName" to info.packageName,
            "versionCode" to PackageInfoCompat.getLongVersionCode(info),
            "versionName" to info.versionName,
            "certificates" to certificates(info),
        )
    }

    /** Whether the teacher has allowed this app to install apps ("Install unknown apps"). */
    fun canInstall(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || pm.canRequestPackageInstalls()

    /** Opens this app's "Install unknown apps" switch. */
    fun openInstallPermission() {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /**
     * Hands [path] to the system installer, which asks the teacher to confirm. The file is first
     * copied into the cache's updates/ folder (the only place the FileProvider shares).
     */
    fun install(path: String) {
        val updates = File(activity.cacheDir, "updates").apply { mkdirs() }
        var file = File(path)
        if (file.parentFile?.canonicalPath != updates.canonicalPath) {
            val copy = File(updates, "install.apk")
            file.copyTo(copy, overwrite = true)
            file = copy
        }
        val uri = FileProvider.getUriForFile(activity, "$pkg.presenter", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }

    private fun packageInfo(name: String): PackageInfo {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        return pm.getPackageInfo(name, flags)
    }

    /** SHA-256 of each signing certificate, lower-case hex. */
    private fun certificates(info: PackageInfo): List<String> {
        val sigs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val s = info.signingInfo ?: return emptyList()
            if (s.hasMultipleSigners()) s.apkContentsSigners else s.signingCertificateHistory
        } else {
            @Suppress("DEPRECATION") info.signatures
        } ?: return emptyList()
        return sigs.map { sig -> MessageDigest.getInstance("SHA-256").digest(sig.toByteArray()).joinToString("") { "%02x".format(it) } }
    }
}
