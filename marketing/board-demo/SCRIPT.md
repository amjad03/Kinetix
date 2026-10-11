# KINETIX Board product demo — script

Real KINETIX Board app (apps/board) running under flutter_test at 1920x1080 with the built-in demo server
(Soundarya Central School, Class 10 B Science, "Refraction through a glass slab"), driven by a scripted stylus
(stylus pointer events along Hershey-script handwriting paths). Frames stream to `tools/compose.py`, which adds the
stylus graphic, tap ripples, zooms, callouts, captions, chapter cards and app insets. VO: Kokoro af_heart (`tools/tts.py`).
Music: generated ambient bed, ducked under the VO (`tools/audio.py`).

Pipeline: `tools/tts.py` -> `tools/handwriting.py` -> `tools/render.sh` (capture + compose) -> `tools/audio.py` -> `dist/kinetix-board-demo.mp4`.
Preview stills: `ONLY=c1,c2 tools/capture.sh preview` then `tools/pvsheet.py`.

## Cold open

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s00 | This is KINETIX Board, the AI smartboard in every Soundarya classroom. Everything you'll see is the real board app, driven by a stylus, just as a teacher uses it. | Stylus writes "Refraction of light" (Hershey cursive, timed strokes) on the real board; title lower-third. |

## Sign in and start the class

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s10 | Signing in takes one scan. The teacher opens the KINETIX Teacher app and scans this QR code, or types the six digit code. No passwords on a shared screen. | Tap class chip -> real "Sign in to Room 204 Board" dialog (QR + 6-digit code); zoom on dialog. |
| s11 | If the internet is down, the board shows a signed offline code instead, and the phone verifies it without any network. | Network cut in the test client -> dialog shows the cached signed offline QR + validity note; callout. |
| s12 | Teachers can also keep a personal PIN for this board. Set it once, and from then on the board unlocks on a shuffled keypad, so nobody learns it from smudges on the glass. | Set PIN on the PIN pad (tap digits), lock the board, unlock on the shuffled keypad. |
| s13 | The board already knows the class from the timetable: Class 10 B, Science, Refraction through a glass slab. And it suggests concept videos for this period, in English, Hindi and Kannada. | Point at class chip (callout "From the timetable"); zoom on concept-video suggestions (en/hi/kn); Skip. |
| s14 | Today's plan brings the lesson plan from the ERP: objectives, timed steps, materials and homework, with a step timer to keep pace. | Tools drawer -> Today's plan; start step timer. |
| s15 | Books shows the NCERT syllabus and which topics have been taught. And the profile menu holds saved whiteboards, recordings, training and a guided tour. | Books tab (syllabus progress); profile menu. |

## Ink that feels like a pen

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s20 | Now the canvas. The pen panel sets the pen type, thickness and colour, with pressure, smoothing and palm rejection for a real stylus. | Pen popover: pen types, thickness slider drag, colour, pressure; zoomed. |
| s21 | Handwriting flows naturally. The ink keeps up at full writing speed, with no lag, and it's smoothed just enough to stay crisp on a big panel. | Writes "bends towards normal". |
| s22 | The shapes tool draws a clean glass slab. A line marks the normal, and arrows trace the incident ray, the refracted ray, and the emergent ray leaving the slab. | Shapes: rectangle slab, normal line, three arrows (stylus drags). |
| s23 | Labels go on by hand: air, glass, the angle of incidence and the angle of refraction. The highlighter sits behind the ink, so nothing gets covered. | Handwritten labels air/glass/i/r; highlighter under the title. |
| s24 | The eraser removes whole strokes. Undo and redo step back and forth through every change. | Eraser stroke over a label; undo, redo, undo. |
| s25 | Select with a lasso to move, resize, duplicate, group or lock anything on the page. | Lasso around the diagram; drag to move. |
| s26 | Real geometry tools: a ruler and protractor you can move, rotate and draw against, plus a compass and set squares. | Protractor from the drawer; drag it into place. |

## AI pen, maths and diagrams

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s30 | The AI pen turns handwriting into clean, typed text, right where it was written. And with Shape AI switched on, a rough sketch snaps into a perfect circle. | AI pen writes "glass slab" -> converted to text; Shape AI: rough circle -> tidy circle. |
| s31 | Equations are typeset properly. Here is Snell's law, placed straight onto the board. | Add -> Equation, type LaTeX for Snell's law, put on board. |
| s32 | The math solver works offline, and shows every step of the working. | KINETIX AI -> Math solver: 2x + 5 = 17 with steps. |
| s33 | The tools drawer holds the rest: graphs, a periodic table, formulas, circuits, flowcharts, mind maps, code labs, logic gates and more, filtered to the subject being taught. | Tools drawer scrolled by stylus; periodic table in the kit. |

## Pages, backgrounds and saving

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s40 | Add pages as the lesson grows. Here, page two gets Snell's law, written by hand. The page overview shows every page at a glance, to jump between them, reorder or export. | Add page; write n = sin i / sin r; page overview (zoom). |
| s41 | Backgrounds and templates: ruled, grid, graph, a dark board or a chalkboard, for one page or all of them. | Background popover: ruled, grid, dots, chalkboard, back to plain. |
| s42 | Every board is saved for the class, and can be shared with students on WhatsApp, by email, or with a QR code. | Menu -> version history; share whiteboard dialog. |

## 3D models, labs and simulations

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s50 | The side panel brings content in without leaving the board. 3D models render right here: rotate them with the stylus, and read off their measurements as you teach. | Side panel 3D: search "cone", open Frustum of a cone (native renderer), rotate by dragging. |
| s51 | Virtual labs make the lesson hands-on. In the glass slab lab, change the angle and the ray bends in real time. | Labs -> Refraction through a glass slab; drag the incident ray. |
| s52 | There are PhET simulations that work offline, animations, concept videos, and the subject kit with formulas and constants. | Sims (PhET list), Animations, Videos, Kit tabs. |
| s53 | From the Add menu, bring in PDFs, PowerPoint slides, pictures, tables, sticky notes, word cards and covered answers. There's a safe browser and a document camera too. | Add menu; sticky note typed and placed; Web (safe browser) tab. |

## KINETIX AI, built into the lesson

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s60 | KINETIX AI answers questions about the lesson, in the class's language, with sources, and follows the syllabus. | AI tab: type a question, answer with key points + sources callout. |
| s61 | The AI lesson builder drafts a full plan for a topic: objectives, steps, activities and an exit ticket, ready to teach. | AI lesson plan generated for the topic; scroll. |
| s62 | It also writes quick quizzes, homework and lecture notes, summarises the board, and reads whatever has been written on it. | Quick quiz generated; Read board. |

## Live class responses

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s70 | Attendance is taken on the board in seconds and synced to the ERP. | Attendance dialog: mark two absent, save. |
| s71 | Ask the class: pose a multiple choice question, and students answer from the Student app or by holding up printed answer cards that the camera scans. | Ask the class: type question, tag a course outcome, start; answers arrive (zoom on live card). |
| s72 | Answers build live on the board as students respond. End the question to reveal the right answer, and see at a glance who needs help. | More answers; end question / reveal. |
| s73 | Or ask for a word cloud. Students type a word or two from their phones, and the cloud grows as they answer, with the most common words largest. | Word cloud question; words arrive and the cloud grows (zoom). |
| s74 | And there's a full classroom toolkit. A random picker chooses who answers next. There are timers and stopwatches, team scoreboards, badges for good work, a group maker that splits the class in one tap, and multi-user zones, so several students can write on the board at once. Everything a teacher needs is one tap away. | Toolkit montage: picker (Pick), timer, scoreboard, badges, group maker, multi-user zones. |

## Homework, marking and OBE

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s80 | Homework AI turns the lesson into an assignment and sends it to the Student app, with a due date. | Homework AI: generate, send to Student app. |
| s81 | Submissions are reviewed by classmates on a rubric, and AI suggests marks that the teacher approves, in the Teacher app. | Insets: real Teacher and Student app screens (captured from the apps for the promo). |
| s82 | For accreditation, each question is tagged with course outcomes, so every poll and quiz becomes OBE evidence in the ERP. | Ask-the-class dialog: course outcome (CO) chips tapped; callout. |

## Record, cast and share

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s90 | Record the lesson with one tap. The board shows a consent notice, then records with chapter markers. Hold a marker to star an important moment. | Record -> consent notice -> recording; chapter marker; hold for important moment. |
| s91 | Recordings come back with a transcript, a summary and chapters, and can be shared with enrolled students. | Stop & save; Recordings list. |
| s92 | Live captions help every student follow along. Phones can cast to the board after the teacher approves, and the board can project to a second screen, or freeze its display while the teacher sets up the next step. | Live captions (words stream in), Cast tab, Screen projection dialog. |

## Comfort, languages and control

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s100 | Eye comfort warms and dims the panel for long teaching days, with break reminders. And the whole board switches to a dark theme in a single tap. | Eye comfort on/off; dark theme toggle and back. |
| s101 | The whole board speaks English, Hindi and Kannada, and switches instantly. Each teacher's language follows them when they sign in. | Board settings: language Hindi, Kannada, English (whole UI switches). |
| s102 | There are tools for every learner. Voice commands control the board hands free, and the immersive reader reads text aloud. A screen shade, a spotlight and a magnifier focus the class on exactly what matters. | Voice commands ("next page" heard), screen shade, spotlight. |
| s103 | Board settings, a customisable toolbar, simple mode, kiosk lock and device diagnostics keep every panel under the school's control, managed remotely from the IT console. | Customise toolbar; device diagnostics. |

## Works offline, syncs everywhere

| Seg | Voice-over | On screen (stylus) |
|---|---|---|
| s110 | When the network drops, the board keeps working. Changes wait in an outbox and sync as soon as it's back. | Network cut: attendance saved to the outbox, sync callout; network back, outbox syncs. |
| s111 | End the class, and attendance, polls, homework, recordings and lesson evidence flow to the KINETIX ERP, and on to the Teacher, Student and Parent apps. | End class dialog -> End class; insets: Teacher, Student and Parent apps. |
| s112 | KINETIX Board. Every lesson, connected. | End card: KINETIX Board - Every lesson, connected. |

## Simulated in the capture (not live services)

- AI answers (explain, lesson plan, quiz, homework, read board): scripted responses in the API shape; on a real board they come from KINETIX AI.
- Student answers to polls and the word cloud: realtime events fired by the script (as the Student App would).
- Handwriting recognition (AI pen): a scripted recognizer stands in for ML Kit / Windows Ink, which do not run under flutter_test.
- Offline code: a seeded signed-code entry; network loss simulated in the HTTP client. Live captions: scripted speech input.
- Teacher/Student/Parent app screens are real app captures from marketing/promo/shots.
