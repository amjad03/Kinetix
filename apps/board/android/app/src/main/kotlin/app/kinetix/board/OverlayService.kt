package app.kinetix.board

import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.LinearLayout
import androidx.core.app.NotificationCompat
import java.io.File

/**
 * "Write over apps" on Android panels (lib/core/panel/app_overlay.dart): a transparent ink layer
 * over whatever app is open, with a small floating toolbar: pen (draw) or pass-through (touch the
 * app underneath), clear, save and close. Save takes a screenshot with the ink (MediaProjection,
 * when the teacher allowed it; else the ink alone), opens the board again and hands it the PNG
 * to put on a new page.
 */
class OverlayService : Service() {
    private lateinit var wm: WindowManager
    private var ink: InkView? = null
    private var bar: LinearLayout? = null
    private var inkParams: WindowManager.LayoutParams? = null
    private var projection: MediaProjection? = null
    private var drawing = true

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val code = intent?.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra(EXTRA_DATA)
        }
        if (code == Activity.RESULT_OK && data != null) {
            goForeground()
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projection = mpm.getMediaProjection(code, data)
        }
        if (ink == null) show()
        running = true
        return START_NOT_STICKY
    }

    private fun goForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Zynetix pen", NotificationManager.IMPORTANCE_LOW))
        }
        val n = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentTitle("Zynetix: writing over apps")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTE_ID, n)
        }
    }

    @Suppress("DEPRECATION")
    private fun overlayType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE

    private fun show() {
        val view = InkView(this)
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        )
        wm.addView(view, p)
        ink = view
        inkParams = p

        val b = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.argb(230, 32, 33, 36))
            setPadding(8, 8, 8, 8)
        }
        fun button(icon: Int, label: String, onClick: (ImageButton) -> Unit): ImageButton = ImageButton(this).apply {
            setImageResource(icon)
            contentDescription = label
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { onClick(this) }
            b.addView(this, LinearLayout.LayoutParams(112, 112))
        }
        button(android.R.drawable.ic_menu_edit, "Pen or touch the app") { btn ->
            drawing = !drawing
            btn.alpha = if (drawing) 1f else 0.45f
            setTouchable(drawing)
        }
        button(android.R.drawable.ic_menu_delete, "Clear") { ink?.clear() }
        button(android.R.drawable.ic_menu_save, "Save to the board") { save() }
        button(android.R.drawable.ic_menu_close_clear_cancel, "Close") { finish(null) }
        val bp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL }
        wm.addView(b, bp)
        bar = b
    }

    /** Pass-through: the ink layer stops taking touches, so the app underneath gets them. */
    private fun setTouchable(on: Boolean) {
        val p = inkParams ?: return
        p.flags = if (on) p.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv() else p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        ink?.let { wm.updateViewLayout(it, p) }
    }

    @Suppress("DEPRECATION")
    private fun save() {
        val mp = projection
        if (mp == null) {
            finish(ink?.snapshot())
            return
        }
        bar?.visibility = View.INVISIBLE
        val metrics = DisplayMetrics()
        wm.defaultDisplay.getRealMetrics(metrics)
        val w = metrics.widthPixels
        val h = metrics.heightPixels
        val reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        val handler = Handler(Looper.getMainLooper())
        var display: VirtualDisplay? = null
        var done = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            mp.registerCallback(object : MediaProjection.Callback() {}, handler)
        }
        reader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            if (done) {
                image.close()
                return@setOnImageAvailableListener
            }
            done = true
            val plane = image.planes[0]
            val rowPadding = plane.rowStride - plane.pixelStride * w
            val padded = Bitmap.createBitmap(w + rowPadding / plane.pixelStride, h, Bitmap.Config.ARGB_8888)
            padded.copyPixelsFromBuffer(plane.buffer)
            image.close()
            display?.release()
            reader.close()
            finish(Bitmap.createBitmap(padded, 0, 0, w, h))
        }, handler)
        // A moment for the toolbar to disappear from the screen first.
        handler.postDelayed({
            display = mp.createVirtualDisplay("zynetix-pen", w, h, metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, handler)
        }, 150)
    }

    /** Ends the overlay; with a picture, opens the board with it. */
    private fun finish(picture: Bitmap?) {
        if (picture != null) {
            val file = File(cacheDir, "overlay-${System.currentTimeMillis()}.png")
            file.outputStream().use { picture.compress(Bitmap.CompressFormat.PNG, 100, it) }
            pendingCapture = file.absolutePath
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(EXTRA_CAPTURE, file.absolutePath))
        }
        stopSelf()
    }

    override fun onDestroy() {
        ink?.let { wm.removeView(it) }
        bar?.let { wm.removeView(it) }
        ink = null
        bar = null
        projection?.stop()
        projection = null
        running = false
        super.onDestroy()
    }

    /** The transparent layer the teacher writes on. */
    private class InkView(context: Context) : View(context) {
        private val paths = mutableListOf<Path>()
        private var current: Path? = null
        private val paint = Paint().apply {
            color = Color.RED
            strokeWidth = 8f
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            isAntiAlias = true
        }

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> current = Path().also { it.moveTo(e.x, e.y); paths.add(it) }
                MotionEvent.ACTION_MOVE -> current?.lineTo(e.x, e.y)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> current = null
            }
            invalidate()
            return true
        }

        override fun onDraw(canvas: Canvas) {
            for (p in paths) canvas.drawPath(p, paint)
        }

        fun clear() {
            paths.clear()
            invalidate()
        }

        fun snapshot(): Bitmap {
            val bmp = Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp)
            c.drawColor(Color.WHITE)
            draw(c)
            return bmp
        }
    }

    companion object {
        const val EXTRA_CODE = "projectionCode"
        const val EXTRA_DATA = "projectionData"
        const val EXTRA_CAPTURE = "overlayCapture"
        private const val CHANNEL = "zynetix_pen"
        private const val NOTE_ID = 7301

        @Volatile var running = false

        /** The last capture, until the board has taken it. */
        @Volatile var pendingCapture: String? = null
    }
}
