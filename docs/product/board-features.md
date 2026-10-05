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
- 🟡 **Measurements.** ✅ 2D shapes can show side lengths (cm, on the 1 cm grid), interior angles and a circle's radius. ✅ 3D solids (cube to frustum) with live volume, curved and total surface area and slant height, each with its formula and the values substituted. ⬜ Ruler, protractor, compass, set squares.
- ✅ **Split screen.** A side panel next to the board, drag-resizable from 30% to 70%, which can sit on either side. 🟡 It holds a second whiteboard, a 3D model or a virtual lab (built), or a PDF/PPT, video or web page (coming).
- ⬜ Annotate over any pane (a transparent ink layer).
- ✅ Save boards to KINETIX Cloud, reopen them from *Your whiteboards*, and share them with the class: students and parents are notified and can open the board read-only in their apps. End class offers to save and share. ⬜ Export as PDF or images.

## 4. KINETIX AI on the board

All AI runs on India-hosted infrastructure, or on the device itself. ([design](../architecture/ai-platform.md))

- 🟡 **AI pen** (left rail and bottom toolbar; hidden on primary boards). Write or draw as with the pen; after a pause (or word by word, or on *Convert*) rough sketches become clean shapes, handwritten maths a typeset equation and words text. Everything it makes is an ordinary element (select, move, undo; recordings and the live view show it), and a tap on it with the AI pen shows other readings, a box to type the right one, *Solve* for maths, *It's a shape / It's writing* and *Back to my ink*. Scribbling over ink rubs it out. All of it runs on the board: no ink leaves it.
    - ✅ Shapes: line, arrow, circle, ellipse, triangles, rectangle and square, parallelogram, trapezium, rhombus, regular pentagon and hexagon, other polygons (`packages/kinetix_ink/lib/src/pen/shape_fit.dart`, `ink_parser.dart`). Shape or letter is decided by fit, coverage and the teacher's own letter size, which the pen learns. The ordinary pen can tidy shapes too (*Tidy shapes as I draw*), the one part offered on primary boards.
    - ✅ Maths on every platform with no model: a pure-Dart symbol recogniser (digits, + − × ÷ = < > ( ) [ ], x y z a b c n, α β θ π λ μ σ Δ, √ ∫ Σ, fraction bar, decimal point, ^, !) and the layout from where the ink sits (fractions, roots, powers). Templates are generated from vector glyphs by `packages/kinetix_ink/tool/generate_symbol_templates.dart`; on the held-out synthetic test set it reads 91.5 % of symbols right first time and 97.5 % in its top three. Real handwriting will score lower; tune the glyphs with real samples.
    - 🟡 Words: Android panels use ML Kit Digital Ink (each language's model downloads once from Google, from Board settings → AI pen; Hindi is hi-IN and Kannada kn-IN, and a language ML Kit has no model for shows as *Not available*). Windows panels use the Windows handwriting recogniser through `apps/board/windows/runner/handwriting_channel.cpp` (no download; a language needs its handwriting feature added in Windows settings). Elsewhere, or without a model, words stay as ink. Weaker for Hindi and Kannada than for English, as agreed.
    - Verifying on Windows: the *Flutter* workflow's `board-windows` job compiles the runner. On a panel, add Hindi handwriting in Settings → Time & language → Language → Hindi → Options, open Board settings → AI pen (English and Hindi show *Ready*), take the AI pen, write a word and a sum, and check they convert; with no recogniser the board says words stay as ink and maths still converts.
- 🟡 **OCR.** ✅ *Read board*: KINETIX AI reads the handwriting on the open page (text and maths as LaTeX) with a vision model on the India-hosted AI server. ⬜ Photos and documents.
- 🟡 A step-by-step maths solver for handwritten or typed problems, offline as well: ✅ an equation the AI pen typeset (or any equation on the board) opens in the solver with *Solve*.
- ⬜ Explain a topic at the class's level, in the teacher's language.
- ⬜ Generate quizzes, homework and assignments from the current chapter, then send them to the Student App.
- ⬜ Built-in references: the textbook and course material for the current syllabus, an offline Wikipedia subset, and a dictionary.
- ⬜ Diagram and image generation for concepts.
- ⬜ Lesson summary and notes produced from the recording.

## 5. Content

- ⬜ A ready lesson for the next chapter, for each syllabus: CBSE/NCERT, ICSE, Karnataka State Board and Bangalore University UG/PG.
- ⬜ Global library plus each school's own content. Teachers prepare material in the ERP and it appears on the Board.
- 🟡 3D models: ✅ built in-house, offline (solids, water, methane, CO₂, NaCl lattice, the Solar System, Earth's tilt; tap a part to name it) and a glTF (.glb) loader for licensed models. ⬜ More models (heart, Earth's layers, cells…). See [3d-and-labs.md](3d-and-labs.md).
- 🟡 Virtual labs, offline: ✅ Ohm's law, lens and mirror ray diagrams, simple pendulum, break-even chart, graph plotter. Syllabus topics link to them (Books → topic → *On the board*). ⬜ More labs (titration, refraction through a slab, …).
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

- 🟡 **Live classroom view.** ✅ The principal watches any board's ink live from the ERP (audited; 'Being viewed' on the board). ✅ *Go live*: students of the class watch from the Student App. ✅ Class audio (below). ([design](../architecture/live-classroom.md))
  - **Class audio.** A *Class audio* chip next to *Go live* turns the board's microphone on for the live class.
    - *Format:* mono 16 kHz PCM from the microphone (echo cancellation, noise suppression and auto gain where the platform has them), cut into 200 ms chunks and sent as IMA ADPCM (4 bits a sample, base64) on `live.audio`. Each chunk decodes on its own, so a lost chunk is a 200 ms gap. The Student App keeps about 400 ms of jitter buffer and drops audio once more than about 1.5 s backs up, so it stays live rather than drifting behind; it has a mute button and shows "Teacher's mic is on/off".
    - *Bandwidth:* 8 KB/s (64 kbit/s) for each listener, about 29 MB an hour; the board uploads one stream and the server copies it to each listener. The board only captures and sends while audio is on **and** someone may listen (`live.viewers.listeners` > 0); the server drops chunks otherwise.
    - *Privacy:* off at the start of every class, and turned off when the class ends, the teacher stops the live class or signs out (the server also turns it off when the board goes offline; the board turns it back on after a reconnect if the teacher still has it on). While the microphone is actually being sent, a red **Mic on** chip sits at the top right of the board, outside the scrolling chips, so it is always visible. Students of the live class may listen; school leaders watching in the ERP only when the institution turns on `classroomAudioToViewers`. Turning audio on and off is audited (`live_audio.on` / `live_audio.off`).
    - *Microphone shared with lesson recording:* a lesson recording holds the microphone at the same time (to a file). Class audio opens a second capture anyway: Windows and recent Android usually allow it (Android may give one of the two silence), some panels refuse. If the microphone can't be opened, or there is none, or permission is denied, the board says "Class audio isn't available: …" and audio stays off; the recording carries on. Real microphones and speakers have not been tested in CI.
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
