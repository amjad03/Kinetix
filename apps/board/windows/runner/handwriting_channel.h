#ifndef RUNNER_HANDWRITING_CHANNEL_H_
#define RUNNER_HANDWRITING_CHANNEL_H_

#include <flutter/binary_messenger.h>
#include <windows.h>

// The AI pen's handwriting reader on Windows panels: the handwriting recogniser built into
// Windows (Windows.UI.Input.Inking), on the panel itself, with no download. Answers the
// "kinetix/handwriting" method channel (lib/core/handwriting/windows_handwriting.dart):
//
//   languages               -> the board languages ("en", "hi", "kn") Windows can read
//   recognize {language,    -> for each word, its readings (best first)
//              strokes}
//
// Recognition finishes on a Windows thread-pool thread; the result is posted back to |window|
// as kHandwritingResultMessage, which the window must pass to HandleHandwritingMessage so the
// reply goes to Dart on the platform thread.

constexpr UINT kHandwritingResultMessage = WM_APP + 0x4B;

void RegisterHandwritingChannel(flutter::BinaryMessenger* messenger, HWND window);

// True when |message| was a handwriting result (and has been answered).
bool HandleHandwritingMessage(UINT message, WPARAM wparam, LPARAM lparam);

void UnregisterHandwritingChannel();

#endif  // RUNNER_HANDWRITING_CHANNEL_H_
