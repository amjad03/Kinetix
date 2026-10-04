# KINETIX Board: feature specification

Status key: ✅ built in this repo · 🟡 partly built · ⬜ specified, not yet built.
Competitor parity items are tracked in
[teachmint-competitive-analysis.md](../research/teachmint-competitive-analysis.md).

## 1. Hardware & platforms

| Setup | Touch | Notes |
|---|---|---|
| Android tablet + projector/TV (HDMI, USB-C DP Alt or Miracast) | On the tablet (stylus recommended) | The cheapest route. The teacher writes on the tablet; the class sees the projection. |
| TV/projector + **IR touch frame** (USB, 10–20 touch points) + Android box or Windows PC | On the big screen, many touches at once | A cheap retrofit that makes an old TV a multi-touch board. **A KINETIX differentiator.** ✅ Supported: a touch profile in Board settings, plus a [buying and installation guide](../hardware/ir-touch-frames.md). |
| Android interactive flat panel (IFP) | On the panel, 20–40 touch points | Install the KINETIX APK on the panel |
| Windows PC / OPS module / Windows IFP | Mouse, pen or touch | Same app, Windows build |

**Minimum spec (decided):** Android 10 (API 29) or Windows 10 21H2; 4 GB RAM; 64 GB storage;
1080p output. **Recommended for offline AI:** 8 GB RAM, a recent Snapdragon/MediaTek
Dimensity chip or an x64 CPU with AVX2. The app checks the device at first run and switches
offline AI features on or off accordingly.

> Several students writing at once needs a large touch surface (an IFP or a touch frame).
> On a tablet with a projector, only the person holding the tablet can write.

## 2. Sign-in & sessions

- ✅ **Pairing with the Teacher App** (board sign-in dialog, cloud, and the Teacher App's Connect-to-board screen). The Board shows a QR code and a 6-digit code. The teacher scans or types it in the Teacher App and the Board opens their session. Nobody types a PIN on the shared screen. ([design](../architecture/board-pairing.md))
- ⬜ **Offline pairing.** If the internet is down, the teacher's phone proves who they are to the Board over the local network or Bluetooth, using a credential the cloud signed earlier.
- ⬜ **Fallback sign-in.** A PIN on a keypad whose keys are shuffled each time, so no one can learn it by watching. Each school can turn this on or off.
- ✅ The current timetable period opens with its class, subject and next chapter.
- 🟡 Auto sign-out at the end of the period (built) or when the teacher ends the class on their phone (built). Idle timeout is not built yet.
- ⬜ A per-teacher language (English, Hindi, Kannada) and preferences that apply at sign-in.

## 3. Board workspace

- ✅ **Multi-touch writing.** Every finger or pen gets its own stroke, so several students can write at the same time.
- ⬜ **Multi-user zones.** Split the board into 2–4 zones, each with its own toolbar, for group activities and competitions.
- ✅ Pen, highlighter, eraser (stroke and area), colours, thickness, undo/redo, clear.
- ✅ Touch profiles: on a tablet a palm is ignored; on an interactive panel a palm erases like a duster; on an IR frame every touch writes. The stylus eraser end erases. ⬜ Pressure-sensitive ink width is not built yet.
- ✅ Pages (previous, next, new page). ✅ Backgrounds: plain, ruled, 1 cm grid, dots, chalkboard. ⬜ Infinite canvas, music staff.
- ✅ 13 2D shapes (line, arrows, circle, ellipse, triangles, rectangle, parallelogram, trapezium, rhombus, pentagon, hexagon). ✅ Box-select, move and delete, all undoable. ⬜ Text, sticky notes, images, resize, lasso.
- 🟡 **Measurements.** ✅ 2D shapes can show side lengths (cm, on the 1 cm grid), interior angles and a circle's radius. ⬜ Ruler, protractor, compass, set squares, 3D solids, area and volume.
- ✅ **Split screen.** A side panel next to the board, drag-resizable from 30% to 70%, which can sit on either side. 🟡 It can hold a second whiteboard (built) or a PDF/PPT, video, web page, 3D model or lab (coming).
- ⬜ Annotate over any pane (a transparent ink layer).
- ⬜ Save, export as PDF or images, and share to the class (appears in the Student App).

## 4. KINETIX AI on the board

All AI runs on India-hosted infrastructure, or on the device itself. ([design](../architecture/ai-platform.md))

- ⬜ Handwriting cleanup: turns handwriting into typed text in English, Hindi and Kannada, and rough sketches into clean shapes.
- ⬜ **OCR** of photos, documents and the board itself.
- ⬜ A step-by-step maths solver for handwritten or typed problems, offline as well.
- ⬜ Explain a topic at the class's level, in the teacher's language.
- ⬜ Generate quizzes, homework and assignments from the current chapter, then send them to the Student App.
- ⬜ Built-in references: the textbook and course material for the current syllabus, an offline Wikipedia subset, and a dictionary.
- ⬜ Diagram and image generation for concepts.
- ⬜ Lesson summary and notes produced from the recording.

## 5. Content

- ⬜ A ready lesson for the next chapter, for each syllabus: CBSE/NCERT, ICSE, Karnataka State Board and Bangalore University UG/PG.
- ⬜ Global library plus each school's own content. Teachers prepare material in the ERP and it appears on the Board.
- ⬜ 3D models (heart, Earth's layers and so on), some built in-house and some licensed.
- ⬜ Virtual science labs.
- ⬜ PPT, PDF, images and video, with offline cache.

## 6. Classroom tools

- ✅ **Random student picker** using the ERP roster, limited to students marked present. The teacher marks the answer correct, partial or incorrect, and the result goes to the student's profile against the topic.
- ✅ One-tap attendance on the board (present, absent or late), synced to the ERP through the outbox. ⬜ Parents of absent students are notified.
- ✅ Countdown timer (floating, draggable). ⬜ Stopwatch, groups maker, polls, buzzer, scoreboard.
- ⬜ Read-aloud (text-to-speech) and a big-text magnifier.
- ⬜ Screen spotlight, curtain/reveal, zoom.

## 7. Recording

- ⬜ Records canvas strokes, opened documents and pages, and the teacher's microphone (Opus). Files are about 1–3 MB per hour, small enough to upload over 2G.
- ⬜ The Student App replays the lesson exactly as it happened on the board, with transcript and chapter markers. MP4 is rendered on demand.

## 8. Phone as remote & camera

- ⬜ The Teacher App works as a remote: next slide, pointer, pick a student, timer.
- ⬜ The Teacher App works as a document camera: photograph a notebook and it appears on the board.

## 9. School-wide (principal/admin)

- ⬜ **Live classroom view.** The principal can watch any board and listen to its microphone in real time. ([design](../architecture/live-classroom.md))
- ✅ **Circulate a message.** Send to all boards, a grade, or one class. It appears on the board immediately, with optional acknowledgement, and also goes to the Student and Parent apps. Emergency messages fill the screen.
- ⬜ Daily dashboard: classes taught, syllabus coverage against the year plan, attendance, homework.
- ⬜ Device management: health, app version, remote restart, kiosk lock.

## 10. Eye comfort & accessibility

- ✅ **Eye protection mode.** Warm light filter, plus dimming and contrast that change with the time of day.
- ✅ Dark chalkboard theme, which reduces projector glare.
- ⬜ Automatic adjustment from the device's ambient light sensor, where it has one.
- ⬜ Break reminders after long continuous use (20-20-20).
- ✅ High-contrast mode.
- ⬜ Simple mode with big buttons.

## 11. Parity items from the competitor research

These come from [the Teachmint analysis](../research/teachmint-competitive-analysis.md) §5.1 and were missing above.

- ⬜ **Write over anything.** A transparent ink layer over other apps, video, PDF and the web (Android overlay + MediaProjection; a transparent window on Windows).
- ⬜ **Student responses without clickers.** Students answer from phones or tablets through a web link, no install, or with printed QR answer cards that the board camera scans.
- ⬜ **Wireless casting** from teacher and student phones, several at once, with teacher approval and a filter on student content.
- ⬜ **Face-recognition attendance** as an option, with teacher review. Face templates stay on the device and the feature needs consent.
- ⬜ Live or hybrid class via native WebRTC.
- ⬜ AI grading of homework and test submissions.
- ⬜ Voice commands in English, Kannada and Hindi ("next slide", "start a 5-minute timer", "mark attendance").
- ⬜ Live captions of the teacher's speech, plus accessibility: a dyslexia-friendly font and an immersive reader.
- ⬜ Usage analytics for the principal: minutes taught, syllabus coverage, AI use.
- ⬜ NFC card login where the hardware supports it.
- ⬜ MDM: remote updates, kiosk lock, schedules, health.
- ⬜ Tests that autosave every answer locally. This answers a common complaint about a competitor.

## 12. Help for teachers new to technology

- ⬜ Guided tour, and a five-minute practice board that ticks off each task as it is done.
- ⬜ "Show me" help that points at the right button.
- ⬜ Simple mode with bigger buttons and fewer tools.
