# Projector mode

A board on a tablet or a Windows PC often drives a projector or TV for the class. Projector
mode shows the class the board, without the teacher's tool rails, panels and dialogs, on that
second screen; when a 3D model or a lab is open next to the board, the class sees it beside the
board. Code: `apps/board/lib/features/projector`.

## How it works

The second screen runs its own Flutter engine at `projectorMain` (`lib/main.dart`), showing
`ProjectorApp`. The board sends it JSON messages over the `kinetix/projector` channel (native
code passes them to the projector engine's `kinetix/projector_feed`):

- board events in the lesson/live-view format (`kinetix_ink`'s `LessonRecorder`), so the class
  sees exactly the part of the endless board the teacher shows, with the laser pointer;
- pictures of the 3D model (through `kinetix_3d`'s `Model3dMirror`, set on the board's
  `Model3dScope`) and of an open lab (a picture of the split pane twice a second);
- blank on/off.

When the projector engine starts it says `ready` and the board sends a full snapshot.
Nothing leaves the device.

## Platforms

| Platform | Second screen |
|---|---|
| Android tablets and panels | An Android `Presentation` on the first presentation display (HDMI, USB-C, Miracast), `android/.../Projector.kt`. `DisplayManager` events open and close it. |
| Windows PCs | A borderless window covering a monitor other than the board's own, `windows/runner/projector_window.cpp`; `WM_DISPLAYCHANGE` triggers a fresh look. |
| Linux, web | Not supported (no displays are listed). |

Neither has run on hardware yet. On Windows the projector engine registers the generated
plugins only (not the handwriting channel); a panel that mirrors (rather than extends) its
desktop shows one screen, so Windows must be set to "Extend these displays".

## Settings

Board settings → Projector: "Use a second screen" (on by default) and "Start when a screen is
connected" (on by default), plus show, stop and blank the class screen. The profile menu has
"Show on second screen" / "Stop showing" when a screen is attached.
