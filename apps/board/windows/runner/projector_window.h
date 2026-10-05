#ifndef RUNNER_PROJECTOR_WINDOW_H_
#define RUNNER_PROJECTOR_WINDOW_H_

#include <flutter/binary_messenger.h>
#include <flutter/dart_project.h>
#include <windows.h>

// Projector mode on Windows (docs/hardware/projector-mode.md): the class sees the board on the
// PC's second monitor in a borderless window covering it, running a second Flutter engine at
// `projectorMain` (lib/main.dart). Answers the "kinetix/projector" method channel
// (lib/features/projector/projector_display.dart):
//
//   displays        -> the monitors other than the board's own
//   show {id}       -> opens the projector window on that monitor
//   hide            -> closes it
//   send <json>     -> passes a message to the projector engine ("kinetix/projector_feed" frame)
//
// and calls back "displaysChanged" (WM_DISPLAYCHANGE, passed on by the main window) and "ready"
// when the projector engine has started.

void RegisterProjectorChannel(flutter::BinaryMessenger* messenger, HWND board_window);

// The main window got WM_DISPLAYCHANGE: a monitor was attached or removed.
void ProjectorDisplaysChanged();

void UnregisterProjectorChannel();

#endif  // RUNNER_PROJECTOR_WINDOW_H_
