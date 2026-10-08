package app.kinetix.board

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * The board. Also answers the `kinetix/kiosk` channel (lib/core/kiosk/kiosk_platform.dart):
 * status, enter, exit and openSystemSettings. See docs/hardware/kiosk-mode.md.
 */
class MainActivity : FlutterActivity() {
    private val kiosk by lazy { Kiosk(this) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/kiosk").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "status" -> result.success(kiosk.status())
                    "enter" -> result.success(kiosk.enter())
                    "exit" -> result.success(kiosk.exit(call.argument<Boolean>("keepBootLaunch") ?: false))
                    "openSystemSettings" -> {
                        kiosk.openSystemSettings()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                // e.g. startLockTask while the activity is not in front; the board asks again on resume.
                result.error("kiosk", e.message, null)
            }
        }
        // Projector mode: the board on a second display (Projector.kt).
        val presenter = Presenter(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/presenter").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "open" -> result.success(presenter.open(call.argument<String>("path")!!, call.argument<Boolean>("adjacent") ?: true))
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("presenter", e.message, null)
            }
        }
        val projectorChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/projector")
        val p = Projector(this, projectorChannel)
        projector = p
        projectorChannel.setMethodCallHandler { call, result ->
            try {
                p.handle(call.method, call.arguments, result)
            } catch (e: Exception) {
                result.error("projector", e.message, null)
            }
        }
    }

    private var projector: Projector? = null

    override fun onDestroy() {
        projector?.dispose()
        projector = null
        super.onDestroy()
    }
}
