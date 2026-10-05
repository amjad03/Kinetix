#include "projector_window.h"

#include <flutter/encodable_value.h>
#include <flutter/flutter_view_controller.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "flutter/generated_plugin_registrant.h"
#include "utils.h"
#include "win32_window.h"

namespace {

using flutter::EncodableList;
using flutter::EncodableMap;
using flutter::EncodableValue;

struct Monitor {
  std::string id;  // the device name, e.g. \\.\DISPLAY2
  RECT rect;
};

std::vector<Monitor> ListMonitors() {
  std::vector<Monitor> out;
  ::EnumDisplayMonitors(
      nullptr, nullptr,
      [](HMONITOR monitor, HDC, LPRECT, LPARAM data) -> BOOL {
        MONITORINFOEXW info = {};
        info.cbSize = sizeof(info);
        if (::GetMonitorInfoW(monitor, &info)) {
          reinterpret_cast<std::vector<Monitor>*>(data)->push_back({Utf8FromUtf16(info.szDevice), info.rcMonitor});
        }
        return TRUE;
      },
      reinterpret_cast<LPARAM>(&out));
  return out;
}

// A borderless window covering one monitor, hosting the projector engine.
class ProjectorWindow : public Win32Window {
 public:
  explicit ProjectorWindow(const flutter::DartProject& project) : project_(project) {}

  flutter::FlutterViewController* controller() { return controller_.get(); }

 protected:
  bool OnCreate() override {
    if (!Win32Window::OnCreate()) return false;
    RECT frame = GetClientArea();
    controller_ = std::make_unique<flutter::FlutterViewController>(frame.right - frame.left, frame.bottom - frame.top, project_);
    if (!controller_->engine() || !controller_->view()) return false;
    // Plugins only; the board's own channels (handwriting) stay with the board's engine.
    RegisterPlugins(controller_->engine());
    SetChildContent(controller_->view()->GetNativeWindow());
    return true;
  }

  void OnDestroy() override {
    controller_ = nullptr;
    Win32Window::OnDestroy();
  }

  LRESULT MessageHandler(HWND hwnd, UINT const message, WPARAM const wparam, LPARAM const lparam) noexcept override {
    if (controller_) {
      std::optional<LRESULT> result = controller_->HandleTopLevelWindowProc(hwnd, message, wparam, lparam);
      if (result) return *result;
    }
    return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
  }

 private:
  flutter::DartProject project_;
  std::unique_ptr<flutter::FlutterViewController> controller_;
};

std::unique_ptr<flutter::MethodChannel<EncodableValue>> g_board;
std::unique_ptr<flutter::MethodChannel<EncodableValue>> g_feed;
std::unique_ptr<ProjectorWindow> g_window;
HWND g_board_window = nullptr;

void Hide() {
  g_feed = nullptr;
  if (g_window) {
    g_window->Destroy();
    g_window = nullptr;
  }
}

bool Show(const std::string& id) {
  for (const Monitor& m : ListMonitors()) {
    if (m.id != id) continue;
    Hide();
    flutter::DartProject project(L"data");
    project.set_dart_entrypoint("projectorMain");
    auto window = std::make_unique<ProjectorWindow>(project);
    // Created at the monitor's corner, then made borderless and stretched over it.
    if (!window->Create(L"KINETIX Projector", Win32Window::Point(m.rect.left, m.rect.top), Win32Window::Size(800, 600))) return false;
    HWND hwnd = window->GetHandle();
    const LONG_PTR style = ::GetWindowLongPtr(hwnd, GWL_STYLE);
    ::SetWindowLongPtr(hwnd, GWL_STYLE, (style & ~static_cast<LONG_PTR>(WS_OVERLAPPEDWINDOW)) | WS_POPUP);
    ::SetWindowPos(hwnd, HWND_TOP, m.rect.left, m.rect.top, m.rect.right - m.rect.left, m.rect.bottom - m.rect.top,
                   SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    // The teacher keeps working on the board; the projector never takes the focus.
    if (g_board_window) ::SetForegroundWindow(g_board_window);

    g_feed = std::make_unique<flutter::MethodChannel<EncodableValue>>(window->controller()->engine()->messenger(), "kinetix/projector_feed",
                                                                      &flutter::StandardMethodCodec::GetInstance());
    g_feed->SetMethodCallHandler([](const auto& call, auto result) {
      if (call.method_name() == "ready" && g_board) g_board->InvokeMethod("ready", nullptr);
      result->Success();
    });
    g_window = std::move(window);
    return true;
  }
  return false;
}

}  // namespace

void RegisterProjectorChannel(flutter::BinaryMessenger* messenger, HWND board_window) {
  g_board_window = board_window;
  g_board = std::make_unique<flutter::MethodChannel<EncodableValue>>(messenger, "kinetix/projector", &flutter::StandardMethodCodec::GetInstance());
  g_board->SetMethodCallHandler([](const flutter::MethodCall<EncodableValue>& call, std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
    const std::string& method = call.method_name();
    if (method == "displays") {
      // Every monitor but the one the board is on.
      HMONITOR own = ::MonitorFromWindow(g_board_window, MONITOR_DEFAULTTOPRIMARY);
      MONITORINFOEXW own_info = {};
      own_info.cbSize = sizeof(own_info);
      ::GetMonitorInfoW(own, &own_info);
      const std::string own_id = Utf8FromUtf16(own_info.szDevice);
      EncodableList list;
      for (const Monitor& m : ListMonitors()) {
        if (m.id == own_id) continue;
        list.push_back(EncodableValue(EncodableMap{
            {EncodableValue("id"), EncodableValue(m.id)},
            {EncodableValue("name"), EncodableValue(m.id)},
            {EncodableValue("width"), EncodableValue(static_cast<int>(m.rect.right - m.rect.left))},
            {EncodableValue("height"), EncodableValue(static_cast<int>(m.rect.bottom - m.rect.top))},
        }));
      }
      result->Success(EncodableValue(list));
    } else if (method == "show") {
      std::string id;
      if (const auto* args = std::get_if<EncodableMap>(call.arguments())) {
        auto it = args->find(EncodableValue("id"));
        if (it != args->end()) {
          if (const auto* s = std::get_if<std::string>(&it->second)) id = *s;
        }
      }
      result->Success(EncodableValue(Show(id)));
    } else if (method == "hide") {
      Hide();
      result->Success();
    } else if (method == "send") {
      if (g_feed && call.arguments()) g_feed->InvokeMethod("frame", std::make_unique<EncodableValue>(*call.arguments()));
      result->Success();
    } else {
      result->NotImplemented();
    }
  });
}

void ProjectorDisplaysChanged() {
  if (g_window) {
    // The projector's monitor may be gone: close the window if so (the board reopens it elsewhere).
    HMONITOR m = ::MonitorFromWindow(g_window->GetHandle(), MONITOR_DEFAULTTONULL);
    if (!m || m == ::MonitorFromWindow(g_board_window, MONITOR_DEFAULTTOPRIMARY)) Hide();
  }
  if (g_board) g_board->InvokeMethod("displaysChanged", nullptr);
}

void UnregisterProjectorChannel() {
  Hide();
  g_board = nullptr;
  g_board_window = nullptr;
}
