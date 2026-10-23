import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var overlayChannel: FlutterMethodChannel?
  private var savedFrame: NSRect?
  private var savedLevel: NSWindow.Level = .normal
  private var savedStyle: NSWindow.StyleMask = []
  private var savedBehavior: NSWindow.CollectionBehavior = []

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
