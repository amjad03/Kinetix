# App screen recordings (Teacher, Student, Parent)

Real screen recordings of the three ZYNETIX mobile apps for the principals' demo video. Each clip
is the real app (Flutter, demo-build data: ZYNETIX Demo College) running under `flutter_test` on an
iPhone 14-sized phone, driven by real touch gestures and recorded frame by frame at 30 fps. No
mock-ups or motion graphics.

- **Format:** 1170x2532 (390x844 pt at 3x), 30 fps, H.264 CRF 16, yuv420p, bt709, no audio.
- **Phone chrome:** a status bar (11:20, signal, Wi-Fi, battery; white over dark screens) and the
  home indicator are drawn over the app; view insets are top 47 / bottom 34 pt, light mode.
- **Touches:** a soft grey dot (44 pt, like iOS "show touches") appears ~0.13 s before each tap and
  fades over 0.3 s; scrolls are real eased drags. Typing uses an iPhone-style on-screen keyboard
  (letters or number pad) that slides up and resizes the app, with a dot and key balloon per key.
- **Demo moment:** today at 11:20, so the 11:15 Corporate Accounting period is "Now".
- Each `clips/<id>.json` has `{id, title, duration, marks:[{t, label}]}`: the moments a narrator
  would talk about (screen opened, tap, result shown). `contact.jpg` shows the middle frame of each.

## Clips

| id | s | what it shows |
|---|---|---|
| teacher_signin_home | 14.1 | Demo sign-in screen → one tap as Anita Sharma → Home (today's 3 classes, quick actions, message badge) → Classes tab (connect to board, day strip, the class happening now) |
| teacher_attendance | 15.3 | Home → Attendance quick action → everyone starts present → Bhavya and Farhan marked absent (10/2) → Submit → "Attendance saved" → Classes shows "Attendance taken" |
| teacher_homework | 23.0 | More → Homework list → "Forfeiture of shares: notes" hand-in summary (handed in / checked / missing, Remind) → Aarav's checked answer with remark → Ananya's hand-in (photo of her notes) → types a remark → Mark as checked → "marked as checked" |
| teacher_marks | 23.9 | More → Marks (draft assignment + published test with class average) → types 12 marks on the number pad → Save (class average 8.2) → Publish → confirm → "published, families notified" |
| teacher_plan_syllabus | 29.6 | Classes → Syllabus for the 11:15 class (4 of 11 topics, 36%) → marks "Re-issue of forfeited shares" taught → Year plan (behind by 1 topic, week by week, late topic flagged) → Lesson plan → Draft with ZYNETIX AI → Save plan |
| teacher_messages | 22.0 | More → Messages → Rajesh Patel (parent of Aarav) → types and sends a message → Rajesh's reply arrives live |
| teacher_connect_board | 11.3 | Home → Start class (11:15) → Scan board QR (dark camera viewfinder) → Enter code instead → 6 digits on the number pad → "You're connected: Room 204 Board is showing your class" |
| teacher_recordings_calendar | 21.1 | More → Recordings (shared, transcript, kept / auto-delete dates) → Share "Pro-rata allotment" with the class (dialog) → shared → Calendar (holidays, exams, events) |
| student_home | 21.0 | Sign-in → one tap as Aarav Patel → Home: live question from the board → answers B → tiles (attendance 88%, 2 pending, exam in 9 days) → homework due → attendance → coming up / ask AI / results |
| student_homework | 26.6 | Home → "Exercise 4.2" → Hand in → types answer → Send → "Handed in" → Past homework → the checked one with the teacher's remark |
| student_marks_attendance | 26.4 | Home results card (published marks, class averages) → Unit test 1: 19/25, class average, highest, teacher's remark → attendance card → history day by day → only absences |
| student_learn | 18.3 | Home → Lesson recordings (missed class flagged) → the missed lesson (board replay, summary, key points) → My Learning → Syllabus coverage → Corporate Accounting (this week in class, topics taught) |
| parent_home | 18.3 | Sign-in → one tap as Rajesh Patel → Home "how Aarav is doing" (88%, 78%, 2 pending) → recent updates → switch child → Diya (98%) → her Academics |
| parent_attendance | 12.4 | Home → Attendance (88%, present/absent/late, recent absences) → attendance history day by day |
| parent_fees | 23.6 | Fees: ₹34,350 due, exam fee overdue, tuition ₹10,000 of ₹42,500 paid, receipts → Pay the exam fee → full/part → demo gateway → Payment successful + receipt → Done (₹32,500 left) |
| parent_reports | 20.9 | Academics → Aarav's results with class averages → Unit test 1 with remark → switch to Diya → library book overdue with fine so far |
| parent_messages | 16.5 | More → Messages → Anita Sharma → types and sends → Anita's reply arrives live |

`teacher_homework_marks` and `parent_reports_messages` from the brief were each over 35 s, so they
are split into `teacher_homework` + `teacher_marks` and `parent_reports` + `parent_messages`.

## Re-recording

```sh
tools/capture_apps.sh                      # all clips, one at a time (~10 min on 4 CPUs)
tools/capture_apps.sh parent_fees          # some clips
PR=2 tools/capture_apps.sh ...             # 780x1688 instead
python3 tools/contact.py                   # contact.jpg
python3 tools/contact.py peek <id> out.png # frames at every mark, to check a clip
```

`capture_apps.sh` copies `capture/zz_rec.dart` (the recorder: phone view, chrome, touches,
keyboard, frame grab) and `capture/<app>_rec_test.dart` into `apps/<app>/test/`, runs one clip
(`CLIP=<id>`), pipes raw RGBA through a FIFO into ffmpeg, and deletes the copies afterwards; the
apps' source is never changed. `tools/explore.sh` + `capture/<app>_explore_test.dart` dump PNGs,
texts and widget keys of screens (how the clips were scripted). `capture/assets/notes_page.jpg`
(made by `tools/make_notes_page.py`) is the handwritten-notes photo on Ananya's hand-in.

## Demo-data workarounds (in the capture tests only, not the apps)

- The teacher demo's hand-in photo is a 1-pixel green placeholder; the clip serves a notebook page
  instead (`submissionFile` override).
- The student and parent in-memory fakes stamp some times with the wall clock or a fixed date
  (student hand-in "4 Oct, 5:00 am"; parent "Today's board" notice, fee receipt date, sent
  message). The capture tests override them to use the demo clock. Worth fixing in the apps'
  `lib/demo/` (`fake_api.dart` `submitHomework`, `boardNotice`, `confirmPayment`, `sendMessage`).
- The family/teacher "reply arrives" is triggered by the clip (same message the demo sends 8 s
  after sign-in) so it lands while the chat is open.
- No camera in tests: the QR scan screen's viewfinder is black (mocked scanner channel).

## Known gaps

- **AI answers are sample text.** The student "Ask a doubt" answer says "Preview answer … this is a
  sample" (also in Hindi), so no student AI clip was made. The teacher lesson-plan AI draft is real
  structured content but shows "Preview: a sample draft, because the ZYNETIX AI server is not
  connected."
- Recording summaries/transcripts read "Sample summary (demo)…"; the board replay in the
  student's missed lesson is a single stroke; the shared class board is nearly empty (not shown).
- Not shown: student Courses tab ("Mathematics 7 B", inconsistent fake data), teacher Student
  insights (other fake students), parent Exams (fake exam timetable inconsistent with the
  calendar), parent bus ("No bus running right now"), Hindi/Kannada UI.
- Data inconsistency visible in clips: Home attendance cards say 4 absent, the 30-day history
  lists 2 absences.
- The status bar clock stays at 11:20 (clips are under a minute of app time). Every screen shows
  the app's own DEMO chip.
- Taps on photos/PDF pickers were not recorded (no picker in tests); the student hand-in is text only.
