# KINETIX Board: specification coverage

Audit of the smartboard specifications against the code, October 2026. Sources:
`02_AUTHORITATIVE_PRODUCT_SPECS/SMARTBOARD/KINETIX_SMARTBOARD_COMPLETE_PRODUCT_REQUIREMENTS_AND_AGENT_HANDOFF_V1.md`
(§7–§88), `01_MASTER_ENGINEERING/04-smartboard/SMARTBOARD_FEATURE_MATRIX.md`, ERP PRD §62
(Smartboard ERP integration) and [docs/product/board-features.md](../product/board-features.md).

Status: **Built** (in the code, with tests), **Partial** (part of it), **Missing**, **Hardware**
(needs a vendor SDK or a sensor, not buildable in software alone). "Now" marks items built in
this pass. Paths are relative to the repository root; `board/` = `apps/board/lib/features/`,
`core/` = `apps/board/lib/core/`.

## Summary

| | Count |
|---|---|
| Features audited (rows below) | 99 |
| Built before this pass | 78 |
| Built now (were Missing or Partial) | 15 |
| Still Missing / Partial (software, belongs to other apps) | 1 |
| Hardware / vendor SDK | 5 |

## Launcher, profile and sign-in (§7, §8, matrix "Launcher")

| Feature | Status | Evidence |
|---|---|---|
| Institution branding (logo, watermark on exports) | Built | `board/board/layout/board_chrome.dart`, `custom_theme_tab.dart` |
| Current teacher, current/next class from the timetable | Built | `core/board_controller.dart` (session), `board/plan/todays_plan_panel.dart` |
| Quick start class, recent lessons, your whiteboards | Built | `board/board/profile_menu.dart`, `board/profiles/profile_boards.dart` |
| Favourites | Built | `board/board/kit/subjects.dart` |
| Cached / offline content | Built | `core/outbox_store.dart`, `board/offline_ai/`, `board/phet/phet_downloads.dart` |
| Device status (online, pending changes) | Built | `board/board/layout/board_chrome.dart` (cloud icon) |
| Pairing with the Teacher App (QR + 6-digit code) | Built | `board/signin/sign_in_dialog.dart`, `services/api/src/pairing` |
| Teacher profiles with PIN, guest | Built | `board/profiles/` |
| PIN fallback on a **shuffled** keypad, school can turn off (`pinShuffle`) | Built now | `board/profiles/profiles_ui.dart` (`PinPad.shuffle`), `test/classroom_plus_test.dart` |
| Idle lock / auto sign-out at period end | Built | `board/profiles/profiles_ui.dart` (idle lock), `core/board_controller.dart` |
| Per-teacher language and preferences at sign-in | Built | `board/profiles/profiles_controller.dart` (`language`), `teacherSettings` in `core/board_controller.dart` |
| Offline pairing (phone proves identity over LAN/Bluetooth with a cloud-signed credential) | Partial | Built: the institution's Ed25519 key signs 15-minute codes (`services/api/src/pairing/offline-code.ts`), the board keeps a day of them (`core/offline_codes.dart`) and shows the current one as a QR when the cloud is unreachable (`signin/sign_in_dialog.dart`, `test/offline_sign_in_test.dart`), and the Teacher App checks it with no network (`apps/teacher/lib/core/offline_pairing.dart`, `features/board/connect_screen.dart`, `test/offline_pairing_test.dart`). external: carrying a board session over LAN or Bluetooth needs two physical devices to build and test |
| NFC card login | Hardware | Needs NFC readers on panels |
| Training (Schedule a training QR), What's new | Built | `board/board/profile_extras.dart` |
| Guided tour, practice board, "Show me" | Built | `board/help/tour.dart`, `practice.dart`, `help_sheet.dart` |
| Simple mode (big labelled tools) | Built | Simple board, `core/board_controller.dart` (`simpleBoard`) |

## Classroom session (§9, §55, §70, matrix "Classroom")

| Feature | Status | Evidence |
|---|---|---|
| Roster from ERP, start/end class, session states | Built | `core/board_controller.dart`, `services/api/src/sessions` |
| Attendance on the board, synced through the outbox | Built | `board/board/board_screen.dart` (`_attendance`) |
| Join QR / code for students (live class) | Built | `board/board/live_stream.dart`, Student App live |
| Session state sync / cloud whiteboard sync (§58) | Built | `core/realtime.dart`, `board/board/version_history.dart` |
| Random student picker linked to answers | Built | `board/toolkit/toolkit_controller.dart` |
| Teacher → Board → Student flow, events (§70, §72) | Built | domain-event outbox, `services/api/src/events` |

## Whiteboard (§10–§23, §29–§32, matrix "Whiteboard")

| Feature | Status | Evidence |
|---|---|---|
| Bottom toolbar quick/nav groups, Switch, Hide | Built | `board/board/layout/`, `smartboard_toolbar_test` |
| Pages, intelligent Add Page | Built | `packages/kinetix_ink/lib/src/whiteboard_controller.dart` (`canAddPage`) |
| Infinite / large canvas with pan and zoom | Built | `whiteboard_controller.dart` (view, `visibleArea`) |
| Undo/redo, selection, lasso, grouping, lock, duplicate | Built | `kinetix_ink` `whiteboard_controller.dart`, `pages_paper_test` |
| Multi-touch, two-finger zoom, palm rejection / palm eraser | Built | `whiteboard_controller.dart` (`palmMode`) |
| Pen, highlighter, two-side pen, pressure | Built | `board/board/layout/pen_popover.dart` (`pen-pressure`) |
| Text AI (handwriting), Shape AI, maths recogniser | Built | `packages/kinetix_ink/lib/src/pen/`, `board/board/ai_pen_ui.dart` |
| 2D and 3D shapes with measurements | Built | `kinetix_ink`, `packages/kinetix_3d` |
| Eraser with size, slide to clear | Built | `SlideToClear` |
| Theme templates, backgrounds, custom images | Built | `kinetix_ink/lib/src/board_background.dart` |
| Text, sticky notes, images, tables, flowchart AI | Built | `board/board/editors.dart`, `board/extras/board_table.dart` |
| Geometry tools (ruler, protractor, compass, set squares) | Built | `kinetix_ink/lib/src/geometry_tools.dart` |
| Clipboard | Built | `board/insert/insert_actions.dart` |
| **Multi-user zones** (2–4 zones, own pen, own eraser, clear own zone) | Built now | `board/classroom_plus/zones.dart`, `WhiteboardController.zonePen`, `packages/kinetix_ink/test/zones_test.dart` |
| Save, export PDF/images, share (WhatsApp, email, QR) | Built | `board/board/layout/page_overview.dart`, `share_whiteboard.dart` |
| Version history and restore | Built | `board/board/version_history.dart` |
| Write over anything (system overlay over other apps) | Hardware | Android overlay + MediaProjection / Windows transparent window; platform work per panel vendor. In-app annotation over PDF, PPT, video and web panes is built (`board/insert/presentation_pane.dart`) |

## Content (§24–§28, §33–§37, §51–§53, §64–§66, matrix "Content")

| Feature | Status | Evidence |
|---|---|---|
| PDF, PPT (intelligent split), images, video | Built | `board/insert/` |
| Browser / safe web | Built | `board/safe_web/safe_web.dart` |
| HTML5 simulations (PhET), simulation hub | Built | `board/phet/`, `board/sims/` |
| Virtual labs | Built | `packages/kinetix_labs` |
| 3D learning, glTF loader | Built | `packages/kinetix_3d` |
| Books module, study material, syllabus topics | Built | `board/books/books_panel.dart` |
| Institution content / lesson studio | Built | `board/plan/`, ERP lesson plans |
| Classroom apps, subject tool ecosystem (§33, §50) | Built | `board/board/kit/`, `board/board/classroom_apps.dart` |
| Concept videos (§64, §65) | Built | `board/concept_videos/` |
| Periodic table, graph, calculator, dictionary (§45–§48) | Built | `board/board/kit/`, `board/board/calculator.dart`, `board/language_kit/` |
| Spotlight, curtain, magnifier (§49) | Built | `board/toolkit/toolkit_layer.dart`, `board/classroom/classroom_tools.dart` |
| Document camera (phone or USB) | Built | `board/doc_camera/doc_camera.dart` |

## AI (§38–§44, §57, §66–§69, matrix "AI")

| Feature | Status | Evidence |
|---|---|---|
| Ask about visible content (Read board, Select & Ask) | Built | `board/ai/read_board_panel.dart`, `smart_panels.dart` |
| Explain, simplify, examples, questions, diagram, board-ready notes | Built | `services/api/src/ai/tasks.ts` (`selectAsk`) |
| **Remedial suggestions** | Built now | `selectAsk` action `remedial`, `board/ai/smart_panels.dart` |
| **Generate activity** | Built now | `selectAsk` action `activity`, `board/ai/smart_panels.dart` |
| Lesson summary, lecture AI, board-to-notes | Built | `board/ai/ai_panel.dart` (Summary, Lecture) |
| Quiz AI, Homework AI, exam frequency from past papers | Built | `board/ai/quiz_panel.dart`, `homework_panel.dart`, `services/api/src/ai/past-exams.ts` |
| Source citations | Built | `AiMeta.sources` in `core/models.dart` |
| AI safety and academic integrity (§69) | Built | `services/api/src/ai/safety.ts` |
| Offline AI topics | Built | `board/offline_ai/` |
| AI grading of homework submissions | Built now | `services/api/src/grading-assist` (`homework/:id/:studentId/suggest`), Teacher App Marking help in `apps/teacher/lib/features/homework/submission_screen.dart` (`test/submissions_test.dart`); scripts in `erp/evaluation/desk`. A draft only: the teacher decides the marks |

## Student interaction (§54, matrix "Collaboration")

| Feature | Status | Evidence |
|---|---|---|
| Poll / quiz (MCQ, true-false, number), answer cards scanned by camera | Built | `board/class_check/`, `services/api/src/polls` |
| Short answer | Built | Quiz AI `shortAnswer` type |
| **Word cloud** (students type 1–3 words, cloud on the board, on to the page) | Built now | poll kind `word`: migration `0112_poll_word_cloud.sql`, `polls.service.ts` (`normaliseWord`), `board/class_check/word_cloud.dart`, `apps/student/lib/features/live/live_question.dart`, `test/class_check_test.dart`, `services/api/test/polls.e2e.spec.ts` |
| Student board input (several students write at once) | Built | multi-touch strokes, multi-user zones |
| Question queue (students ask from the app) | Built | `board/class_check/class_check_panel.dart`, live view |
| Peer review | Built now | `services/api/src/homework/peer-review.controller.ts` (migration `0116`), `apps/student/lib/features/homework/peer_review_screen.dart`: classmates review anonymously on a rubric; the teacher assigns and sees all |
| Buzzer, scoreboard, timer, stopwatch, groups | Built (buzzer now) | `board/classroom_plus/buzzer.dart`, `board/teaching_aids/teaching_aids.dart`, `board/toolkit/` |

## Recording and recap (§56, §57, matrix "Recording/recap")

| Feature | Status | Evidence |
|---|---|---|
| Start, pause, resume, stop, chapter markers | Built | `core/recording/lesson_capture.dart`, `board/recording/recording_ui.dart` |
| **Consent / policy enforcement** (institution can turn recording off; notice first time per class) | Built now | `board/classroom_plus/recording_notice.dart` (`recordingAllowed` config), `board/board/board_screen.dart` |
| **Important moments** (starred chapter) | Built now | hold the chapter marker (`rec-important`) in `board/recording/recording_ui.dart`, `test/lesson_recording_test.dart` |
| Transcript, summary, chapters, resource links | Built | `services/api/src/recordings`, `packages/kinetix_lesson` |
| Share to enrolled students | Built | `recordings.controller.ts` (`:id/share`) |
| Live captions | Built | `board/captions/live_captions.dart` |

## Screen share, freeze, sharing (§60–§63)

| Feature | Status | Evidence |
|---|---|---|
| Screen share (casting from phones, approval) | Built | `board/cast/cast_panel.dart`, `core/cast/` |
| Screen freeze | Built | Menu → Freeze screen |
| Whiteboard sharing, export pipeline | Built | `share_whiteboard.dart`, server PDF |
| Live / hybrid class (watch + class audio) | Built | `board/board/live_stream.dart`, `core/class_audio/` |

## Device management and settings (§73–§75, matrix "Device management")

| Feature | Status | Evidence |
|---|---|---|
| Registration, tenant binding, device token | Built | `board/enrollment/enroll_screen.dart`, `services/api/src/devices/devices.controller.ts` |
| Heartbeat, version, storage, battery to IT console | Built | `core/fleet/fleet_agent.dart`, `fleet.controller.ts` (`me/health`) |
| Policy, remote lock / unlock / restart / unpair, kiosk | Built | `fleet.controller.ts` actions, `board/fleet/device_lock.dart`, `board/kiosk/` |
| **Diagnostics on the board** (version, server, connection, pending, storage, battery, screen, server check, copy report) | Built now | `board/classroom_plus/diagnostics.dart`, `ApiClient.ping` |
| Remote wipe | Built | `clear_pin_profiles` / `unpair` actions, kiosk wipe |
| Device certificate / hardware-backed keys | Hardware | Device token today; key attestation needs Android Keystore / TPM work per panel |
| Classroom management console (§74) | Built | ERP fleet pages |

## Comfort, accessibility, languages (§79–§82)

| Feature | Status | Evidence |
|---|---|---|
| Eye protection, chalkboard theme, high contrast | Built | `board/comfort/eye_comfort.dart` |
| **Break reminders (20-20-20)** | Built now | `board/classroom_plus/break_reminder.dart`, Eye comfort → Break reminders |
| **Easy read** (dyslexia-friendly: Andika, wider spacing) in the immersive reader | Built now | `board/reader/read_aloud.dart` (`readerTextStyle`) |
| Read aloud, immersive reader | Built | `board/reader/read_aloud.dart` |
| **Voice commands** in English, Hindi, Kannada (pages, slides, timer, picker, attendance, undo) | Built now | `board/classroom_plus/voice_commands.dart` |
| UI in English, Hindi, Kannada | Built | `apps/board/lib/l10n/`, `test/l10n_test.dart` |
| Ambient light sensor auto-adjust | Hardware | Needs a light sensor on the panel and a sensor plugin |
| Face-recognition attendance | Hardware | Needs a camera ML vendor model and consent flow; not built |

## ERP integration (ERP PRD §62, spec §71)

| Direction | Item | Status | Evidence |
|---|---|---|---|
| ERP → Board | Timetable, classroom, teacher, students, subject, curriculum, lesson | Built | `core/board_controller.dart` session + roster, `board/books/`, `board/plan/` |
| Board → ERP | Attendance | Built | outbox `markAttendance` |
| Board → ERP | Assessment, homework | Built | `board/assessment/`, Homework AI publish |
| Board → ERP | Lesson evidence, recordings, activities | Built | recordings API, participation events, `board/plan/plan_timer.dart` |
| Board → ERP | OBE evidence where configured | Built | Participation and assessment flow to the ERP; the ERP OBE module tags board polls and quizzes with course outcomes (`erp/obe/classroom`) and `services/api/src/obe/obe.service.ts` (`classroomEvidence`) counts them as direct evidence |
| No duplicate master data | Built | the board reads ERP masters only |

## Not built (and why)

- **Software, other apps:** offline pairing (Teacher App + board handshake), peer review (Student App),
  AI grading (Teacher App / ERP), OBE mapping of board activities (ERP).
- **Hardware / vendor SDKs:** NFC login, face-recognition attendance, ambient light sensor,
  device certificates (Keystore/TPM attestation), write over other apps (system overlay per
  vendor). IR touch frames are supported through touch profiles.
