# IR touch frames: turning any TV into a multi-touch KINETIX Board

An **infrared (IR) touch frame** is a bezel that fits around an ordinary TV, or around a wall
used as a projector screen. LEDs and sensors along the edges detect fingers and pens. The
frame connects over USB and reports itself as a standard **HID multi-touch** device. It needs
no driver on Windows 10/11 or on Android 10+.

It is the cheapest way to give a classroom a large surface that several students can write on
at once. Costs are indicative (unverified, 2026):

| Setup | Approx. cost | Touch points |
|---|---|---|
| Existing TV + IR frame + Android box or Windows mini PC | ₹12,000–35,000 | 10–20 |
| Projector + IR frame on the wall or a whiteboard | ₹15,000–40,000 (if a projector exists) | 10–20 |
| Interactive flat panel (IFP) | ₹1–3 lakh | 20–40 |

## How KINETIX supports it

1. **The same app.** KINETIX Board on Windows or Android receives the frame's touches as ordinary
   touch pointers. The ink engine already tracks every pointer separately
   (`apps/board/lib/features/ink/ink_controller.dart`), so ten students can write at once.
2. **Touch profile: "IR touch frame".** In *Profile → Board settings → Touch screen*:

   | Profile | What a large contact does | Why |
   |---|---|---|
   | Tablet | Ignored | A hand resting on a tablet must not draw |
   | Interactive panel | Erases, like a duster | Panels report contact size accurately |
   | **IR touch frame** | Writes, like any touch | IR frames see only a shadow and cannot measure contact size. A fist or sleeve looks like a fat finger, so size-based palm rules misfire |

   The setting is saved on the device (`TouchProfile` in `core/board_controller.dart`) and applies
   to every page.
3. **Erasing on an IR frame** uses the Erase tool, or the eraser end of a pen if the frame
   supports it.

## Buying checklist for schools

- **HID multi-touch, driver-free** on Windows 10/11 *and* Android. Ask the vendor for "HID
  compliant, Windows 10 class driver, Android 10+".
- **At least 10 touch points.** 20 is better for group activities.
- **Accuracy within ±2 mm, response under 10 ms.** Writing should keep up with a fast hand.
- **Ambient-light resistance.** Sunlit classrooms flood IR sensors with false touches. Ask for
  sunlight-resistant models and test near the windows.
- **Size to match the screen exactly.** Frames are sold per diagonal (55", 65", 75", 86") and
  aspect ratio.
- **USB cable length.** The computer is often at the teacher's desk. Use an active USB extension
  beyond 5 m.

## Installation and calibration

1. Mount the frame flush with the screen. A gap between frame and glass causes *parallax*:
   the touch lands a few millimetres from the pen tip.
2. Connect USB to the Android box or PC. On Windows, run **Tablet PC Settings → Calibrate** once
   if touches are offset. Android uses the frame's own mapping (check the vendor's calibration tool).
3. In KINETIX Board, set **Board settings → Touch screen → IR touch frame**.
4. Check with two people writing at the same time on opposite sides of the board.

## Known limitations

- **Ghost touches.** Two touches close together on the same row or column can create a phantom
  third point on cheap frames. Better frames resolve this in firmware. The board cannot fully
  undo it.
- **No pressure.** IR frames don't report pen pressure, so ink is constant width.
- **Sunlight.** See the buying checklist above.

## Future work

- A one-minute "touch test" page in Board settings: draws every active point, counts the maximum
  simultaneous touches, and flags ghost points. This helps installers certify a classroom.
- A recommended-hardware list maintained with tested frame and box combinations.
