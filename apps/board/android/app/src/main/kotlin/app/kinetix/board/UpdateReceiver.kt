package app.kinetix.board

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * App updates (PanelBridge.installApk): the installer's result, and opening the board again once
 * the new version is in place. When the system needs the user to confirm (not device owner) its
 * prompt is shown; a failure is kept for the board to report on its next start.
 */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_MY_PACKAGE_REPLACED ->
                context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            ACTION_STATUS -> {
                val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    val confirm: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(Intent.EXTRA_INTENT)
                    }
                    confirm?.let { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                } else if (status != PackageInstaller.STATUS_SUCCESS) {
                    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Install failed ($status)"
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(LAST_ERROR, message).apply()
                }
            }
        }
    }

    companion object {
        const val ACTION_STATUS = "app.kinetix.board.UPDATE_STATUS"
        const val PREFS = "kinetix_updates"
        const val LAST_ERROR = "last_error"
    }
}
