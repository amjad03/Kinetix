package app.kinetix.board

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import java.io.File

/**
 * Files the Classroom edition keeps where an uninstall does not remove them: the public
 * Documents folder (Documents/Zynetix/...), through MediaStore on Android 10 and later (no
 * permission), the public folder itself before that. Answers the `zynetix/documents` channel
 * (lib/classroom_edition/backup/public_documents.dart): save, list and prune.
 */
class DocumentSaver(private val context: Context) {
    private fun safe(name: String) = name.replace(Regex("[\\\\/:*?\"<>|]"), "-")

    private fun relative(folder: String) = Environment.DIRECTORY_DOCUMENTS + "/" + folder.trim('/') + "/"

    /** Writes [bytes] as Documents/[folder]/[name] (replacing a file of ours with that name); returns where. */
    fun save(folder: String, name: String, bytes: ByteArray, mime: String): String {
        val file = safe(name)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            for (old in query(folder)) if (old.second == file) resolver.delete(old.first, null, null)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, file)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relative(folder))
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Files.getContentUri("external"), values)
                ?: throw IllegalStateException("Documents refused the file")
            try {
                resolver.openOutputStream(uri)!!.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }
            return "Documents/" + folder.trim('/') + "/" + file
        }
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), folder)
        if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("Cannot create ${dir.path}")
        val out = File(dir, file)
        out.writeBytes(bytes)
        MediaScannerConnection.scanFile(context, arrayOf(out.absolutePath), arrayOf(mime), null)
        return out.absolutePath
    }

    /** The names of this app's files in Documents/[folder]. */
    fun list(folder: String): List<String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return query(folder).map { it.second }
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), folder)
        return dir.listFiles()?.filter { it.isFile }?.map { it.name } ?: emptyList()
    }

    /** Deletes this app's files in Documents/[folder] whose names start with [prefix], but the newest [keep] (by name). */
    fun prune(folder: String, prefix: String, keep: Int): Int {
        val names = list(folder).filter { it.startsWith(prefix) }.sortedDescending()
        val gone = names.drop(keep).toSet()
        if (gone.isEmpty()) return 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            for (f in query(folder)) if (f.second in gone) context.contentResolver.delete(f.first, null, null)
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), folder)
            for (n in gone) File(dir, n).delete()
        }
        return gone.size
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun query(folder: String): List<Pair<Uri, String>> {
        val out = mutableListOf<Pair<Uri, String>>()
        val collection = MediaStore.Files.getContentUri("external")
        context.contentResolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME),
            "${MediaStore.MediaColumns.RELATIVE_PATH} = ?",
            arrayOf(relative(folder)),
            null,
        )?.use { c ->
            val id = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val name = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            while (c.moveToNext()) out.add(ContentUris.withAppendedId(collection, c.getLong(id)) to c.getString(name))
        }
        return out
    }
}
