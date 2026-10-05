#include <flutter/dart_project.h>
#include <flutter/flutter_view_controller.h>
#include <windows.h>

#include <algorithm>
#include <string>
#include <vector>

#include "flutter_window.h"
#include "utils.h"

// Kiosk mode on Windows (docs/hardware/kiosk-mode.md): Windows has no lock task API for the
// board to call, so Assigned Access (or Shell Launcher) keeps users in the app, and the board,
// started with --kiosk, covers the whole screen without a frame or title bar.
static void EnterFullScreen(HWND window) {
  MONITORINFO info = {};
  info.cbSize = sizeof(info);
  if (!::GetMonitorInfo(::MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST), &info)) {
    return;
  }
  const LONG_PTR style = ::GetWindowLongPtr(window, GWL_STYLE);
  ::SetWindowLongPtr(window, GWL_STYLE, (style & ~static_cast<LONG_PTR>(WS_OVERLAPPEDWINDOW)) | WS_POPUP);
  const RECT& r = info.rcMonitor;
  ::SetWindowPos(window, HWND_TOP, r.left, r.top, r.right - r.left, r.bottom - r.top,
                 SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
}

int APIENTRY wWinMain(_In_ HINSTANCE instance, _In_opt_ HINSTANCE prev,
                      _In_ wchar_t *command_line, _In_ int show_command) {
  // Attach to console when present (e.g., 'flutter run') or create a
  // new console when running with a debugger.
  if (!::AttachConsole(ATTACH_PARENT_PROCESS) && ::IsDebuggerPresent()) {
    CreateAndAttachConsole();
  }

  // Initialize COM, so that it is available for use in the library and/or
  // plugins.
  ::CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

  flutter::DartProject project(L"data");

  std::vector<std::string> command_line_arguments =
      GetCommandLineArguments();
  const bool kiosk = std::find(command_line_arguments.begin(), command_line_arguments.end(),
                               std::string("--kiosk")) != command_line_arguments.end();

  project.set_dart_entrypoint_arguments(std::move(command_line_arguments));

  FlutterWindow window(project);
  Win32Window::Point origin(10, 10);
  Win32Window::Size size(1280, 720);
  if (!window.Create(L"KINETIX Board", origin, size)) {
    return EXIT_FAILURE;
  }
  window.SetQuitOnClose(true);
  if (kiosk) {
    EnterFullScreen(window.GetHandle());
  }

  ::MSG msg;
  while (::GetMessage(&msg, nullptr, 0, 0)) {
    ::TranslateMessage(&msg);
    ::DispatchMessage(&msg);
  }

  ::CoUninitialize();
  return EXIT_SUCCESS;
}
