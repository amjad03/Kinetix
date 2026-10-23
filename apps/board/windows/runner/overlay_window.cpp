#include "overlay_window.h"

#include <dwmapi.h>
#include <flutter/encodable_value.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>
#include <flutter_windows.h>

#include <memory>
#include <string>

namespace {

using flutter::EncodableMap;
using flutter::EncodableValue;

HWND g_window = nullptr;
std::unique_ptr<flutter::MethodChannel<EncodableValue>> g_channel;
bool g_active = false;
LONG_PTR g_style = 0;
LONG_PTR g_ex_style = 0;
WINDOWPLACEMENT g_placement = {};

// SetWindowCompositionAttribute (user32, undocumented but stable since Windows 10): the accent
// that lets the Flutter view's transparent pixels show the desktop.
struct AccentPolicy {
  int state;
  int flags;
  unsigned int gradient_color;
  int animation_id;
};
struct CompositionAttributeData {
  int attribute;
  void* data;
  SIZE_T size;
};
using SetCompositionAttribute = BOOL(WINAPI*)(HWND, CompositionAttributeData*);

bool SetAccent(int state) {
  HMODULE user32 = ::GetModuleHandleW(L"user32.dll");
  if (!user32) return false;
  auto fn = reinterpret_cast<SetCompositionAttribute>(::GetProcAddress(user32, "SetWindowCompositionAttribute"));
  if (!fn) return false;
  AccentPolicy policy = {state, 2, 0x00000000u, 0};
  CompositionAttributeData data = {19 /* WCA_ACCENT_POLICY */, &policy, sizeof(policy)};
  return fn(g_window, &data) != FALSE;
}

RECT MonitorRect() {
  MONITORINFO info = {};
  info.cbSize = sizeof(info);
  ::GetMonitorInfoW(::MonitorFromWindow(g_window, MONITOR_DEFAULTTONEAREST), &info);
  return info.rcMonitor;
}

void CoverMonitor() {
  const RECT r = MonitorRect();
  ::SetWindowPos(g_window, HWND_TOPMOST, r.left, r.top, r.right - r.left, r.bottom - r.top, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
}

bool Enter() {
  if (!g_window) return false;
  if (!g_active) {
    g_style = ::GetWindowLongPtrW(g_window, GWL_STYLE);
    g_ex_style = ::GetWindowLongPtrW(g_window, GWL_EXSTYLE);
    g_placement.length = sizeof(g_placement);
    ::GetWindowPlacement(g_window, &g_placement);
  }
  ::SetWindowLongPtrW(g_window, GWL_STYLE, WS_POPUP | WS_VISIBLE);
  const MARGINS margins = {-1, -1, -1, -1};
  const bool extended = SUCCEEDED(::DwmExtendFrameIntoClientArea(g_window, &margins));
  const bool accent = SetAccent(2 /* ACCENT_ENABLE_TRANSPARENTGRADIENT */);
  CoverMonitor();
  g_active = true;
  return extended && accent;
}

void Compact(bool on) {
  if (!g_active) return;
  if (!on) {
    CoverMonitor();
    return;
  }
  const RECT r = MonitorRect();
  const UINT dpi = FlutterDesktopGetDpiForMonitor(::MonitorFromWindow(g_window, MONITOR_DEFAULTTONEAREST));
  const int w = ::MulDiv(96, static_cast<int>(dpi), 96);
  const int h = ::MulDiv(240, static_cast<int>(dpi), 96);
  ::SetWindowPos(g_window, HWND_TOPMOST, r.right - w - 16, r.top + (r.bottom - r.top - h) / 2, w, h, SWP_SHOWWINDOW);
}

void Exit() {
  if (!g_active || !g_window) return;
  SetAccent(0);
  const MARGINS margins = {0, 0, 0, 0};
  ::DwmExtendFrameIntoClientArea(g_window, &margins);
  ::SetWindowLongPtrW(g_window, GWL_STYLE, g_style);
  ::SetWindowLongPtrW(g_window, GWL_EXSTYLE, g_ex_style);
  ::SetWindowPos(g_window, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED);
  ::SetWindowPlacement(g_window, &g_placement);
  g_active = false;
}

}  // namespace

void RegisterOverlayChannel(flutter::BinaryMessenger* messenger, HWND window) {
  g_window = window;
  g_channel = std::make_unique<flutter::MethodChannel<EncodableValue>>(messenger, "kinetix/desktop_overlay", &flutter::StandardMethodCodec::GetInstance());
  g_channel->SetMethodCallHandler([](const flutter::MethodCall<EncodableValue>& call, std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
    const std::string& method = call.method_name();
    if (method == "enter") {
      result->Success(EncodableValue(Enter()));
    } else if (method == "passThrough") {
      bool on = false;
      if (const auto* args = std::get_if<EncodableMap>(call.arguments())) {
        auto it = args->find(EncodableValue("on"));
        if (it != args->end()) {
          if (const auto* b = std::get_if<bool>(&it->second)) on = *b;
        }
      }
      Compact(on);
      result->Success();
    } else if (method == "exit") {
      Exit();
      result->Success();
    } else {
      result->NotImplemented();
    }
  });
}

void UnregisterOverlayChannel() {
  Exit();
  g_channel = nullptr;
  g_window = nullptr;
}
