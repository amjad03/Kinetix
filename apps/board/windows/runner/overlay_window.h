#ifndef RUNNER_OVERLAY_WINDOW_H_
#define RUNNER_OVERLAY_WINDOW_H_

#include <flutter/binary_messenger.h>
#include <windows.h>

// "Write over apps" on Windows (lib/core/panel/app_overlay.dart, DesktopOverlayWindow): the
// board's window becomes a borderless, see-through, always-on-top layer over its monitor.
// Answers the "kinetix/desktop_overlay" method channel:
//
//   enter            -> true once the window is the overlay
//   passThrough {on} -> on: the window shrinks to the pen's toolbar at the right edge, so the
//                       apps underneath can be used; off: it covers the monitor again
//   exit             -> the board's normal window again

void RegisterOverlayChannel(flutter::BinaryMessenger* messenger, HWND window);

void UnregisterOverlayChannel();

#endif  // RUNNER_OVERLAY_WINDOW_H_
