package app.kinetix.board

import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
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
        // Screenshots into the gallery (GallerySaver.kt).
        val gallery = GallerySaver(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/gallery").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "savePng" -> result.success(gallery.savePng(call.argument<String>("name")!!, call.argument<ByteArray>("bytes")!!))
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("gallery", e.message, null)
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
        // The panel home's apps and app updates (PanelBridge.kt).
        val panel = PanelBridge(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/panel").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "installedApps" -> result.success(panel.installedApps())
                    "launchApp" -> result.success(panel.launchApp(call.argument<String>("package")!!))
                    "setAllowedApps" -> result.success(panel.setAllowedApps(call.argument<List<String>>("packages") ?: emptyList()))
                    "installInfo" -> result.success(panel.installInfo())
                    "installApk" -> result.success(panel.installApk(call.argument<String>("path")!!))
                    "openInstallSettings" -> {
                        panel.openInstallSettings()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("panel", e.message, null)
            }
        }
        // Write over apps (OverlayService.kt).
        val overlay = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kinetix/overlay")
        overlayChannel = overlay
        overlay.setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "canDraw" -> result.success(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this))
                    "requestPermission" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                        }
                        result.success(null)
                    }
                    "start" -> {
                        if (call.argument<Boolean>("screenshot") == true) {
                            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                            startActivityForResult(mpm.createScreenCaptureIntent(), PROJECTION_REQUEST)
                        } else {
                            startOverlay(null, null)
                        }
                        result.success(true)
                    }
                    "stop" -> {
                        stopService(Intent(this, OverlayService::class.java))
                        result.success(null)
                    }
                    "takeCapture" -> {
                        val path = OverlayService.pendingCapture
                        OverlayService.pendingCapture = null
                        result.success(path)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("overlay", e.message, null)
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
    private var overlayChannel: MethodChannel? = null

    private fun startOverlay(code: Int?, data: Intent?) {
        val intent = Intent(this, OverlayService::class.java)
        if (code != null && data != null) {
            intent.putExtra(OverlayService.EXTRA_CODE, code).putExtra(OverlayService.EXTRA_DATA, data)
            ContextCompat.startForegroundService(this, intent)
        } else {
            startService(intent)
        }
        // The app underneath shows; the board comes back with the capture or from recents.
        moveTaskToBack(true)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PROJECTION_REQUEST) return
        // Declined: the overlay still works and saves the ink alone.
        if (resultCode == RESULT_OK && data != null) startOverlay(resultCode, data) else startOverlay(null, null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val capture = intent.getStringExtra(OverlayService.EXTRA_CAPTURE)
        if (capture != null) {
            OverlayService.pendingCapture = null
            overlayChannel?.invokeMethod("captured", capture)
        } else if (intent.hasCategory(Intent.CATEGORY_HOME)) {
            // The home button while the board is the home app (kiosk mode): open the panel home.
            overlayChannel?.invokeMethod("home", null)
        }
    }

    override fun onDestroy() {
        projector?.dispose()
        projector = null
        overlayChannel = null
        super.onDestroy()
    }

    companion object {
        private const val PROJECTION_REQUEST = 7302
    }
}
