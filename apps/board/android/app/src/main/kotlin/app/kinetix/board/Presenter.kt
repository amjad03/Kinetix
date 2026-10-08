package app.kinetix.board

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a .pptx to the panel's installed presenter (WPS, PowerPoint, OEM viewer) so animations,
 * transitions and embedded media play as authored, in the window beside the board when the
 * panel supports split screen (FLAG_ACTIVITY_LAUNCH_ADJACENT). Answers `kinetix/presenter`.
 */
class Presenter(private val activity: Activity) {
    /** True when an app opened the file; false when no presenter is installed. */
    fun open(path: String, adjacent: Boolean): Boolean {
        val file = File(path)
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.presenter", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.openxmlformats-officedocument.presentationml.presentation")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            if (adjacent) addFlags(Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
        }
        return try {
            activity.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}
