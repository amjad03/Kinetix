package app.kinetix.board

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * The lecture video on Android panels: the screen (what the class sees) and the microphone into
 * an MP4 (H.264 + AAC) with MediaProjection and MediaRecorder. Answers `zynetix/screen_recorder`
 * (lib/core/recording/screen_video_recorder.dart):
 *
 *   start {path, maxSize, fps, bitrate} -> null; error "denied" when the teacher declines the
 *                                          system prompt, "unavailable" otherwise
 *   pause / resume                       -> null
 *   stop                                 -> true when a file was written
 *
 * Android requires a foreground service of type mediaProjection while recording
 * ([ScreenRecordService]); its notification says the board is recording.
 */
class ScreenRecorder(private val activity: Activity) {
    private var pending: MethodChannel.Result? = null
    private var args: Map<String, Any?> = emptyMap()

    fun handle(method: String, arguments: Any?, result: MethodChannel.Result) {
        when (method) {
            "start" -> start(arguments, result)
            "pause" -> {
                ScreenRecordService.instance?.pause()
                result.success(null)
            }
            "resume" -> {
                ScreenRecordService.instance?.resume()
                result.success(null)
            }
            "stop" -> {
                val svc = ScreenRecordService.instance
                if (svc == null) result.success(false) else result.success(svc.finish())
            }
            else -> result.notImplemented()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun start(arguments: Any?, result: MethodChannel.Result) {
        if (pending != null || ScreenRecordService.instance != null) {
            result.error("unavailable", "The board is already recording", null)
            return
        }
        args = (arguments as? Map<String, Any?>) ?: emptyMap()
        pending = result
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
        } else {
            askToCapture()
        }
    }

    private fun askToCapture() {
        val mpm = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_CAPTURE)
    }

    /** From MainActivity.onRequestPermissionsResult. Without the microphone the video is silent. */
    fun onPermissionResult(requestCode: Int): Boolean {
        if (requestCode != REQUEST_MIC) return false
        if (pending != null) askToCapture()
        return true
    }

    /** From MainActivity.onActivityResult. */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CAPTURE) return false
        val result = pending ?: return true
        pending = null
        if (resultCode != Activity.RESULT_OK || data == null) {
            result.error("denied", "Screen recording was not allowed", null)
            return true
        }
        val path = args["path"] as? String
        if (path == null) {
            result.error("unavailable", "No file to record to", null)
            return true
        }
        val metrics = activity.resources.displayMetrics
        ScreenRecordService.onStarted = { error ->
            Handler(Looper.getMainLooper()).post {
                if (error == null) result.success(null) else result.error("unavailable", error, null)
            }
        }
        val intent = Intent(activity, ScreenRecordService::class.java)
            .putExtra("resultCode", resultCode)
            .putExtra("data", data)
            .putExtra("path", path)
            .putExtra("maxSize", (args["maxSize"] as? Number)?.toInt() ?: 1920)
            .putExtra("fps", (args["fps"] as? Number)?.toInt() ?: 15)
            .putExtra("bitrate", (args["bitrate"] as? Number)?.toInt() ?: 2_500_000)
            .putExtra("width", metrics.widthPixels)
            .putExtra("height", metrics.heightPixels)
            .putExtra("dpi", metrics.densityDpi)
            .putExtra("mic", activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(intent) else activity.startService(intent)
        return true
    }

    fun dispose() {
        ScreenRecordService.instance?.finish()
    }

    companion object {
        const val REQUEST_CAPTURE = 7301
        const val REQUEST_MIC = 7302
    }
}

/** Keeps the recording alive (and visible in the notification shade) while the lesson is recorded. */
class ScreenRecordService : Service() {
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var recorder: MediaRecorder? = null
    private var path: String? = null
    private var recording = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        val error = try {
            begin(intent)
            null
        } catch (e: Exception) {
            cleanUp()
            stopSelf()
            e.message ?: "The screen recorder could not start"
        }
        if (error == null) instance = this
        onStarted?.invoke(error)
        onStarted = null
        return START_NOT_STICKY
    }

    private fun startInForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Lesson recording", NotificationManager.IMPORTANCE_LOW))
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder
            .setContentTitle("Zynetix is recording the lesson")
            .setContentText("The board and the microphone are being recorded.")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun begin(intent: Intent) {
        val resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED)
        val data: Intent = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra("data", Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra("data")
        } ?: throw IllegalStateException("No screen capture permission")
        val out = intent.getStringExtra("path") ?: throw IllegalStateException("No file to record to")
        val mic = intent.getBooleanExtra("mic", false)
        val maxSize = intent.getIntExtra("maxSize", 1920)
        var w = intent.getIntExtra("width", 1920)
        var h = intent.getIntExtra("height", 1080)
        val dpi = intent.getIntExtra("dpi", DisplayMetrics.DENSITY_DEFAULT)
        // Encoders want sizes in multiples of 16, and most cannot go past 1080p.
        val scale = minOf(1.0, maxSize.toDouble() / maxOf(w, h))
        w = ((w * scale).toInt() / 16) * 16
        h = ((h * scale).toInt() / 16) * 16

        File(out).parentFile?.mkdirs()
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
        if (mic) r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setVideoSource(MediaRecorder.VideoSource.SURFACE)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setOutputFile(out)
        r.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
        r.setVideoSize(w, h)
        r.setVideoFrameRate(intent.getIntExtra("fps", 15))
        r.setVideoEncodingBitRate(intent.getIntExtra("bitrate", 2_500_000))
        if (mic) {
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(44_100)
            r.setAudioEncodingBitRate(96_000)
        }
        r.prepare()
        recorder = r
        path = out

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val p = mpm.getMediaProjection(resultCode, data) ?: throw IllegalStateException("Screen capture was refused")
        projection = p
        // Android 14 requires a callback before the virtual display is made.
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                Handler(Looper.getMainLooper()).post { finish() }
            }
        }, Handler(Looper.getMainLooper()))
        display = p.createVirtualDisplay("zynetix-lesson", w, h, dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, null)
        r.start()
        recording = true
    }

    fun pause() {
        if (recording && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) recorder?.pause()
    }

    fun resume() {
        if (recording && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) recorder?.resume()
    }

    /** Stops and returns whether a usable file was written. */
    fun finish(): Boolean {
        var ok = false
        if (recording) {
            recording = false
            ok = try {
                recorder?.stop()
                true
            } catch (e: RuntimeException) {
                // Stopped before any frame was written.
                false
            }
        }
        val out = path
        cleanUp()
        if (instance === this) instance = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
        return ok && out != null && File(out).length() > 1024
    }

    private fun cleanUp() {
        try {
            recorder?.reset()
            recorder?.release()
        } catch (e: Exception) {
        }
        recorder = null
        display?.release()
        display = null
        projection?.stop()
        projection = null
    }

    override fun onDestroy() {
        if (recording) finish()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "lesson-recording"
        private const val NOTIFICATION_ID = 7303

        /** The service while it is recording. */
        @Volatile
        var instance: ScreenRecordService? = null

        /** Told once the recorder started (null) or why it could not. */
        var onStarted: ((String?) -> Unit)? = null
    }
}
