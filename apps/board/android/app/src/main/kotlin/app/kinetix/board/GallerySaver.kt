package app.kinetix.board

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * Saves a PNG into the device gallery (Pictures/Zynetix): MediaStore on Android 10 and later (no
 * permission), the public Pictures folder plus a media scan before that. Answers the
 * `kinetix/gallery` channel (lib/core/picture_saver.dart). Returns where it went.
 */
class GallerySaver(private val context: Context) {
    fun savePng(name: String, bytes: ByteArray): String {
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "-")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, safe)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Zynetix")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("The gallery refused the picture")
            try {
                resolver.openOutputStream(uri)!!.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }
            return uri.toString()
        }
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Zynetix")
        if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("Cannot create ${dir.path}")
        val file = File(dir, safe)
        file.writeBytes(bytes)
        MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/png"), null)
        return file.absolutePath
    }
}
