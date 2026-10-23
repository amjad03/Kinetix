import AVFoundation
import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var overlayChannel: FlutterMethodChannel?
  private var savedFrame: NSRect?
  private var savedLevel: NSWindow.Level = .normal
  private var savedStyle: NSWindow.StyleMask = []
  private var savedBehavior: NSWindow.CollectionBehavior = []
  private var screenRecorder: LessonScreenRecorder?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)

    // Write over apps (lib/core/panel/app_overlay.dart, DesktopOverlayWindow): the board's window
    // as a see-through, always-on-top layer over the whole screen.
    let channel = FlutterMethodChannel(name: "kinetix/desktop_overlay", binaryMessenger: flutterViewController.engine.binaryMessenger)
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(nil)
        return
      }
      switch call.method {
      case "enter":
        result(self.enterOverlay(flutterViewController))
      case "passThrough":
        let on = (call.arguments as? [String: Any])?["on"] as? Bool ?? false
        self.compactOverlay(on)
        result(nil)
      case "exit":
        self.exitOverlay(flutterViewController)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    overlayChannel = channel
    // The lecture video: this window and the microphone into a movie
    // (lib/core/recording/screen_video_recorder.dart).
    let recorder = LessonScreenRecorder(window: self)
    screenRecorder = recorder
    FlutterMethodChannel(name: "zynetix/screen_recorder", binaryMessenger: flutterViewController.engine.binaryMessenger)
      .setMethodCallHandler { call, result in recorder.handle(call, result: result) }

    super.awakeFromNib()
  }

  private func setViewBackground(_ vc: FlutterViewController, _ color: NSColor) {
    // FlutterViewController.backgroundColor where the engine has it; the layer otherwise.
    let setter = NSSelectorFromString("setBackgroundColor:")
    if vc.responds(to: setter) {
      vc.perform(setter, with: color)
    }
    vc.view.wantsLayer = true
    vc.view.layer?.backgroundColor = color.cgColor
  }

  private func enterOverlay(_ vc: FlutterViewController) -> Bool {
    guard let screen = self.screen ?? NSScreen.main else { return false }
    if savedFrame == nil {
      savedFrame = frame
      savedLevel = level
      savedStyle = styleMask
      savedBehavior = collectionBehavior
    }
    styleMask = [.borderless]
    isOpaque = false
    hasShadow = false
    backgroundColor = .clear
    setViewBackground(vc, .clear)
    level = .floating
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    setFrame(screen.frame, display: true)
    makeKeyAndOrderFront(nil)
    return true
  }

  /// The window shrinks to the pen's toolbar at the right edge so the apps underneath can be used.
  private func compactOverlay(_ on: Bool) {
    guard savedFrame != nil, let screen = self.screen ?? NSScreen.main else { return }
    if on {
      let w: CGFloat = 96
      let h: CGFloat = 240
      let f = screen.visibleFrame
      setFrame(NSRect(x: f.maxX - w - 16, y: f.midY - h / 2, width: w, height: h), display: true)
    } else {
      setFrame(screen.frame, display: true)
    }
  }

  private func exitOverlay(_ vc: FlutterViewController) {
    guard let frame = savedFrame else { return }
    styleMask = savedStyle
    level = savedLevel
    collectionBehavior = savedBehavior
    isOpaque = true
    hasShadow = true
    backgroundColor = .windowBackgroundColor
    setViewBackground(vc, .black)
    setFrame(frame, display: true)
    savedFrame = nil
  }
}

/// Records the board window (AVCaptureScreenInput cropped to it) and the default microphone into
/// a QuickTime movie. macOS asks the teacher once for Screen Recording permission; until it is
/// given, `start` answers "denied" and the board records ink and voice only.
///
///   start {path, fps} -> nil, or FlutterError denied/unavailable
///   pause / resume    -> nil
///   stop              -> Bool (a file was written)
final class LessonScreenRecorder: NSObject, AVCaptureFileOutputRecordingDelegate {
  private weak var window: NSWindow?
  private var session: AVCaptureSession?
  private var output: AVCaptureMovieFileOutput?
  private var stopResult: FlutterResult?
  private var path: String?

  init(window: NSWindow) {
    self.window = window
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "start":
      let args = call.arguments as? [String: Any] ?? [:]
      start(path: args["path"] as? String, fps: args["fps"] as? Int ?? 15, result: result)
    case "pause":
      output?.pauseRecording()
      result(nil)
    case "resume":
      output?.resumeRecording()
      result(nil)
    case "stop":
      stop(result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func start(path: String?, fps: Int, result: @escaping FlutterResult) {
    guard session == nil else {
      result(FlutterError(code: "unavailable", message: "The board is already recording", details: nil))
      return
    }
    guard let path = path, let window = window, let screen = window.screen ?? NSScreen.main else {
      result(FlutterError(code: "unavailable", message: "The screen recorder could not start", details: nil))
      return
    }
    if #available(macOS 10.15, *) {
      if !CGPreflightScreenCaptureAccess() {
        CGRequestScreenCaptureAccess()
        result(FlutterError(code: "denied", message: "Allow Zynetix Board in System Settings > Privacy & Security > Screen Recording", details: nil))
        return
      }
    }
    let displayId = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? CGMainDisplayID()
    guard let input = AVCaptureScreenInput(displayID: displayId) else {
      result(FlutterError(code: "unavailable", message: "The screen recorder could not start", details: nil))
      return
    }
    // The window in the display's coordinates (both bottom-left based).
    let frame = window.frame
    input.cropRect = CGRect(x: frame.minX - screen.frame.minX, y: frame.minY - screen.frame.minY, width: frame.width, height: frame.height)
    input.minFrameDuration = CMTime(value: 1, timescale: CMTimeScale(max(1, fps)))
    input.capturesCursor = false
    input.capturesMouseClicks = false

    let session = AVCaptureSession()
    session.sessionPreset = .high
    guard session.canAddInput(input) else {
      result(FlutterError(code: "unavailable", message: "The screen recorder could not start", details: nil))
      return
    }
    session.addInput(input)
    if AVCaptureDevice.authorizationStatus(for: .audio) != .denied,
      let mic = AVCaptureDevice.default(for: .audio),
      let micInput = try? AVCaptureDeviceInput(device: mic),
      session.canAddInput(micInput)
    {
      session.addInput(micInput)
    }
    let output = AVCaptureMovieFileOutput()
    guard session.canAddOutput(output) else {
      result(FlutterError(code: "unavailable", message: "The screen recorder could not start", details: nil))
      return
    }
    session.addOutput(output)
    session.startRunning()
    let url = URL(fileURLWithPath: path)
    try? FileManager.default.removeItem(at: url)
    output.startRecording(to: url, recordingDelegate: self)
    self.session = session
    self.output = output
    self.path = path
    result(nil)
  }

  private func stop(result: @escaping FlutterResult) {
    guard let output = output, output.isRecording else {
      cleanUp()
      result(false)
      return
    }
    stopResult = result
    output.stopRecording()
  }

  func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
    let size = (try? FileManager.default.attributesOfItem(atPath: outputFileURL.path)[.size] as? NSNumber)?.intValue ?? 0
    let ok = size > 1024
    DispatchQueue.main.async {
      self.cleanUp()
      self.stopResult?(ok)
      self.stopResult = nil
    }
  }

  private func cleanUp() {
    session?.stopRunning()
    session = nil
    output = nil
    path = nil
  }
}
