package app.kinetix.board

import android.app.Activity
import android.app.Presentation
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Display
import io.flutter.FlutterInjector
import io.flutter.embedding.android.FlutterView
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor
import io.flutter.plugin.common.MethodChannel

/**
 * Projector mode (docs/hardware/projector-mode.md): the class sees the board on a second display
 * (HDMI, USB-C or wireless) through an Android [Presentation] running a second Flutter engine
 * at `projectorMain` (lib/main.dart). Answers the `kinetix/projector` channel
 * (lib/features/projector/projector_display.dart):
 *
 *   displays        -> the presentation displays attached now
 *   show {id}       -> opens the projector screen there
 *   hide            -> closes it
 *   send <json>     -> passes a message to the projector engine (`kinetix/projector_feed` frame)
 *
 * and calls back `displaysChanged` when a display comes or goes and `ready` when the projector
 * engine has started. Nothing leaves the device.
 */
class Projector(private val activity: Activity, private val board: MethodChannel) : DisplayManager.DisplayListener {
    private val displays = activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    private val main = Handler(Looper.getMainLooper())
    private var presentation: ProjectorPresentation? = null
    private var engine: FlutterEngine? = null
    private var feed: MethodChannel? = null

    init {
        displays.registerDisplayListener(this, main)
    }

    fun handle(method: String, arguments: Any?, result: MethodChannel.Result) {
        when (method) {
            "displays" -> result.success(list())
            "show" -> result.success(show((arguments as? Map<*, *>)?.get("id")?.toString()))
            "hide" -> {
                hide()
                result.success(null)
            }
            "send" -> {
                feed?.invokeMethod("frame", arguments)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun list(): List<Map<String, Any>> =
        displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).map { d ->
            val size = android.graphics.Point()
            @Suppress("DEPRECATION")
            d.getRealSize(size)
            mapOf("id" to d.displayId.toString(), "name" to d.name, "width" to size.x, "height" to size.y)
        }

    private fun show(id: String?): Boolean {
        val display = displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull { it.displayId.toString() == id } ?: return false
        if (presentation?.display?.displayId == display.displayId && presentation?.isShowing == true) return true
        hide()
        val e = FlutterEngine(activity)
        val loader = FlutterInjector.instance().flutterLoader()
        loader.startInitialization(activity)
        loader.ensureInitializationComplete(activity, null)
        e.dartExecutor.executeDartEntrypoint(DartExecutor.DartEntrypoint(loader.findAppBundlePath(), "projectorMain"))
        val channel = MethodChannel(e.dartExecutor.binaryMessenger, "kinetix/projector_feed")
        channel.setMethodCallHandler { call, result ->
            if (call.method == "ready") board.invokeMethod("ready", null)
            result.success(null)
        }
        e.lifecycleChannel.appIsResumed()
        engine = e
        feed = channel
        return try {
            presentation = ProjectorPresentation(activity, display, e).also { it.show() }
            true
        } catch (ex: Exception) {
            // The display went away, or the window manager refused (WindowManager.InvalidDisplayException).
            hide()
            false
        }
    }

    fun hide() {
        presentation?.dismiss()
        presentation = null
        feed?.setMethodCallHandler(null)
        feed = null
        engine?.destroy()
        engine = null
    }

    fun dispose() {
        displays.unregisterDisplayListener(this)
        hide()
    }

    override fun onDisplayAdded(displayId: Int) = board.invokeMethod("displaysChanged", null)

    override fun onDisplayRemoved(displayId: Int) {
        if (presentation?.display?.displayId == displayId) hide()
        board.invokeMethod("displaysChanged", null)
    }

    override fun onDisplayChanged(displayId: Int) {}
}

/** The second display's window: a FlutterView on the projector engine. */
private class ProjectorPresentation(context: Context, display: Display, private val engine: FlutterEngine) : Presentation(context, display) {
    private var view: FlutterView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val v = FlutterView(context)
        v.attachToFlutterEngine(engine)
        setContentView(v)
        view = v
    }

    override fun onStop() {
        view?.detachFromFlutterEngine()
        view = null
        super.onStop()
    }
}
