# Zynetix smart board: competitor research and gap analysis

Prepared 17 October 2026 for the founder, to decide what to build next for the Zynetix smart board for Indian schools.

## How to read this report

- **Zynetix** is the board app. The code and the screens still call it **KINETIX**, so feature names taken from the code keep that name (for example "KINETIX AI", "KINETIX Cloud"). Decision 1 in section 6 asks whether to rename.
- **Zynetix status:** **Have** = built and working; **Partial** = some of it exists; **Missing** = not built.
- **Priority:** **P0** = needed to compete now; **P1** = next; **P2** = later, niche, or only if customers ask.
- **Effort (rough sizing):** **S** = small, days of work; **M** = medium, a few weeks; **L** = large, a month or more, or it needs a partner, licence or hardware.
- **Sources:** 52 competitor and source entries were researched (section 3). Where a claim comes from a reseller, a third party or a single source, the profile or the source list says "unverified". The web-search budget ran out during this run, so a few corrections were accepted without a second check. They are listed in decision 19.
- **Zynetix status** comes from reading the board app code (`apps/board`) and the shared packages (`packages/kinetix_ink`, `packages/kinetix_3d`, `packages/kinetix_labs` and others). Key file paths are given in section 2.

## 1. Summary

- **Where we lead: offline.** Inking, the AI pen (handwriting in English, Hindi and Kannada, handwritten maths, shape clean-up), the step-by-step maths solver, the 3D viewer, 51 bundled PhET simulations, virtual labs, live captions and voice commands all work with no internet. Only Navneet TOPclass and Geneo make similar offline claims. Most rivals' AI needs the cloud; the exceptions are BenQ (10 TOPS on-device AI), Seewo (offline education LLM, China only) and Promethean (offline AI Companion, Apple devices only).
- **Where we lead: built for Indian schools.** The board knows the timetable, takes one-tap attendance through an offline outbox, runs exam-room mode, shows principal broadcasts, locks into kiosk mode and lets teachers sign in by QR code without typing a password. It sits inside the KINETIX ERP and the Teacher, Student and Parent apps, which only Teachmint, Navneet and the large Chinese brands match. We also have device-free polls with scanned answer cards, a fuller classroom toolkit than most rivals, college kits (accounts, law, statistics, computer science) that no board rival offers, and a 3D viewer that already has every tool in the competitor photo except a separate Recenter button, plus explode, cut, animate and annotate.
- **Where we lag: things a school sees in a demo.** There is no sketch-to-icon "Did you mean" bar. "Go live" sends ink and one-way audio, not a video class. Recordings replay ink events and are not shareable MP4 videos. The pen cannot write over other apps. Casting works only from our own apps and shows 4 screens, where rivals show 9. There is no game-show quiz with points and a leaderboard. The canvas is paged, while 13 rivals offer an endless canvas. There are no AI-generated multi-page board lessons, AI images or video summaries.
- **Where we lag: scale and reach.** We support 3 languages; Senses claims 15+ Indian languages, Embibe 12, and Teachmint 17 for its interface and 90+ for its AI pen. We have about 58 3D models (no muscular system); Senses claims 5,000+ and Embibe 70,000+. We have no panel of our own, while Indian rivals sell panel plus software for Rs 1.2 to 2.6 lakh. Fleet basics (over-the-air updates, power schedules), Google Drive and Google EDLA certification are missing. AI safety controls and a DPDP compliance pack are thin.
- **Where the market is going.** AI is moving onto the panel itself: BenQ has a 10 TOPS NPU, Seewo 32 TOPS, Teachmint and MAXHUB 6 TOPS, and Samsung 4.8 TOPS. Google Gemini is built into SMART and Samsung boards and is free inside Google Classroom. India-specific AI lesson libraries have arrived (ViewSonic's 900+ editable NCERT, CBSE and ICSE lessons; NavneetAI). Kahoot, Wayground and Lumio have set what students expect from a live quiz.
- **Top 10 gaps to close (all P0):**
  1. Sketch-to-icon "Did you mean" suggestion bar (Missing, M).
  2. Live class with teacher video, board and audio (Partial, L).
  3. Annotate over any app with a floating pen (Missing, L).
  4. Game-show live quiz with points and a leaderboard, launched from a top-bar Live Quiz button (Partial, M).
  5. Screen recording as shareable MP4 video (Partial, M).
  6. Bigger 3D library: muscular system and diaphragm first, then 1,000+ models, with download badges, a "Request a 3D model" link and a Recenter button (Partial, L).
  7. More Indian languages across the interface, handwriting, voice, AI and translation (Partial, L).
  8. Cast from any laptop or phone, up to 9 screens (Partial, M).
  9. Endless canvas with auto-scroll (Partial, M).
  10. AI-generated multi-page board lessons from a topic (Partial, M).
- **Other P0 work to run alongside:** over-the-air app updates, AI safety controls (moderation, audit log, per-school switch), a DPDP compliance pack, NCERT and state-board textbooks on the board, local video and audio playback, and a decision on a hardware partner. Five P0 items are small: the top-bar Live Quiz button, local video playback, 3D download badges, "Request a 3D model" and the Recenter button.
- **Do not build for India:** face-recognition attendance and emotion or attention monitoring (offered by Extramarks, Hitevision, Cybernetyx and MAXHUB). The DPDP Act 2023 restricts tracking and behavioural monitoring of children. Anonymous on-device features such as a headcount or hand-gesture polls may be acceptable with a clear notice (decision 11).

## 2. Features from the competitor photos

The three photos show an interactive panel with an **EKIN** logo on the bezel. No Teachmint logo or About screen is visible. Teachmint X ships its own panels and EKIN sells its own "Ekin AI Whiteboard Software", so the software brand is unconfirmed. This report credits these features to "Photo board (EKIN panel)" (decision 20 asks for an About-screen photo).

### 2.1 At a glance

| Feature in the photos | Zynetix today | What to do |
|---|---|---|
| 3D Library grid of anatomy models (skeletal, muscular I and II, brain, diaphragm, digestive, heart, urinary) | Partial | The browser exists. Add the muscular system and a stand-alone diaphragm. |
| Download / ready badges on model tiles | Partial | Show download state and size; add "Download all for offline". |
| "Request a 3D model" link | Missing | Request form posting to the Node API, visible in ERP. |
| Multi-page board with page counter (1/1) and add page (+) | Have | Check that "1/N +" shows on the main bar. |
| Zoom percentage readout (83%) | Have | Check that it shows on the main bar, as in the photo. |
| Bottom drawing toolbar | Have | Also dockable left or right. |
| "Did you mean" sketch-to-icon bar (palm-tree sketch) | Missing | Highest-visibility gap. Offline classifier plus a licensed icon set. |
| Live Quiz button in the top bar | Partial | Add the top-bar shortcut, points and a leaderboard. |
| Live Class button in the top bar | Partial | Upgrade "Go live" to a video class. |
| Share button in the top bar | Have | Check it sits in the top bar. |
| Record button in the top bar | Partial | Add MP4 export, then true screen capture. |
| 3D viewer: Rotate | Have | One-finger rotate. |
| 3D viewer: Move | Have | Two-finger move. |
| 3D viewer: Zoom | Have | Two-finger zoom. |
| 3D viewer: Select | Have | Tap a part to select, highlight and name it. |
| 3D viewer: Isolate | Have | Called "Show only this". |
| 3D viewer: Hide | Have | Parts tab, Hide/Show. |
| 3D viewer: Recenter | Partial | Add a re-frame button. |
| 3D viewer: Reset | Have | Called "Start again". |
| Side panel listing the model's parts | Have | Parts tab. |
| Operating the 3D model with a stylus | Have | Pen and touch both work in the viewer. |
| EKIN-branded panel hardware | Missing | Needs a hardware partner (decision 6). |

### 2.2 3D Library

**What the photo shows.** A grid of anatomy models (Human Skeletal System, Muscular System I and II, Brain, Diaphragm, Digestive System, Heart, Urinary System). Each tile has a "download" or "ready" badge, so models are fetched on demand. A link invites teachers to "Request a 3D model".

**What we have.** `apps/board/lib/features/search/catalogue_browser.dart` filters the catalogue by subject, topic and class in English, Hindi and Kannada. About 46 GLB models are bundled (`packages/kinetix_3d/assets/viewer3d/models/`): heart, brain, eye, ear, lungs, kidney, nephron, neuron, skeleton, skull, digestive and excretory systems, cells, DNA, atoms, molecules, machines, earth and astronomy models, and Indian monuments. A further 12 download from a configurable server (`apps/board/lib/features/board/model_server.dart`: board setting, then school server, then KINETIX server, then GitHub). There are also procedural chemistry, astronomy and map models and narrated 3D scenes.

**Gaps and how to build them.**
- **Muscular system and diaphragm (P0, M).** Take them from Z-Anatomy (CC BY-SA 4.0, built on BodyParts3D). Share-alike applies to the model files we ship, credit BodyParts3D (DBCLS) and Z-Anatomy, and leave out the parts licensed CC BY-NC-SA (for example the Dundee inner ear). Convert to GLB, split into named parts so Select, Hide and Isolate work, and add catalogue entries in all three languages.
- **Download badges (P0, S).** In the catalogue browser, show a "Ready" tick for bundled or downloaded models and a download icon with the file size for the rest, plus a "Download all for offline" action.
- **Request a 3D model (P0, S).** A link in the catalogue opens a short form (model name, subject, class, note) that posts to the Node API. The content team sees requests with vote counts in ERP, and the teacher is notified when the model is added.
- **Scale (P0, L).** We have about 58 models; Senses claims 5,000+ and Embibe 70,000+. Options are covered in decision 3: license Corinth (white-label, 1,500+ K-12 models, offline bundling rights to confirm), BioDigital (cloud-streamed, metered by page views and users), Visible Body (showing models on a board needs its Classroom or Institutional licence), or build from open sources (Smithsonian CC0, NIH 3D with a licence per model, Z-Anatomy CC BY-SA).

### 2.3 3D viewer tools

**What the photo shows.** A tool strip with Rotate, Move, Zoom, Select, Isolate, Hide, Recenter and Reset, a side panel listing the model's parts, and a teacher using a stylus on a muscular-system model.

**What we have** (`packages/kinetix_3d/lib/src/viewer/viewer.dart`, `protocol.dart`, `annotations.dart`). Every tool in the strip except Recenter: one finger rotates; two fingers zoom and move; tapping a part selects, highlights and names it; the Parts tab offers Hide/Show, "Show only this" and "Show all parts"; "Start again" resets. We also have things the photo does not show: front, side and top views; "Turn slowly" auto-rotate; a "Take apart" explode slider (solids unfold into nets); cut modes (in half, cake slice, thin slab, depth sweep, peel layers); step animations with speed control and read-aloud captions; pinned notes and drawing on the model surface; a laser; "Put on board" snapshots that reopen the model; and a feed to the projector.

**Gaps and how to build them.**
- **Recenter (P0, S).** Add a button that computes the bounding box of the parts still visible and flies the camera to frame them, without undoing Hide or Isolate. Today, "Start again" also clears those.
- **Fade (x-ray) and "hide all others" (P1, S).** Per-part transparency and an inverse of Isolate, as in Visible Body.
- **3D labelling quiz (P1, M).** Hide the labels, highlight a part, and let students answer through Ask the class or answer cards. Part names come from the catalogue data.
- **Measure on models (P2, M)** and **voice control of the model (P2, S)**, such as "rotate" or "show only the heart".

### 2.4 "Did you mean" sketch-to-icon bar

**What the photo shows.** A rough hand-drawn palm tree brings up a row of clean icon suggestions above the bottom toolbar, in the style of Google AutoDraw.

**What we have.** Nothing for sketches. `packages/kinetix_ink/lib/src/pen/ink_parser.dart` already sorts strokes into shapes, writing and sketches, but a sketch stays as ink. The existing "Did you mean…" card (`apps/board/lib/features/board/ai_pen_ui.dart`) offers only other readings of handwriting, maths or shapes.

**Who else has it.** Globus (AI Pen swaps in Google images), ViewSonic (AI Pen via live web search, paid tier), LG (ELGi sketch recognition and SVG converter), Promethean (Recognize Drawings on Apple Intelligence), Senses (AI Magic Pen), Dahua (AI recognition of drawings), BenQ (Circle to Artify), Geneo (sketch-to-image). Most of these need the internet, so an offline version would set Zynetix apart.

**How to build it (P0, M).**
1. **Trigger.** When `ink_parser` tags a group of strokes as "sketch" and the teacher pauses, run the classifier.
2. **Model.** Train a small CNN on the Google Quick, Draw! dataset (CC BY 4.0, commercial use allowed with attribution; 50 million drawings in 345 categories, with ready-made 28x28 bitmaps). Ship it as TensorFlow Lite on Android and ONNX on Windows so it runs offline in a few milliseconds.
3. **Icons.** Map each class to a licensed icon. We already use Fluent Emoji in the picture library; OpenMoji (CC BY-SA) or a commissioned set are alternatives (decision 4).
4. **Interface.** Show a "Did you mean…" bar above the toolbar with the top 5 matches. Tapping one replaces the sketch with the icon at the same position and size. Keep "Back to my ink", as the existing card does.
5. **Indian classes.** Add classes Quick, Draw! lacks (mango, rangoli, auto-rickshaw, diya and so on) using drawings we collect ourselves.
6. **Credit.** Add the CC BY 4.0 attribution for the dataset to the About screen.
7. **Later (P1, M).** An optional online "Turn into a picture" that sends the recognised class and subject to a cloud image model, with child-safety filters and the per-school AI allowance.

### 2.5 Top-bar actions: Live Quiz, Live Class, Share, Record

**Live Quiz (Partial; P0, S for the button, M for the game).** We have quiz present mode with teams and timers (`apps/board/lib/features/ai/quiz_panel.dart`), Ask the class with Student App answers or scanned cards (`apps/board/lib/features/class_check/`), buzzers, a team scoreboard and badges. Missing: a one-tap top-bar button and a game-show mode. Build: the button opens quiz setup with the current topic filled in. Score each answer on correctness plus speed using Student App timestamps; show a leaderboard after each question and a podium at the end; give scanned-card answers accuracy-only scores; keep team mode.

**Live Class (Partial; P0, L).** `apps/board/lib/features/board/live_stream.dart` sends ink frames (not video) to the Student App with a viewer count, and `apps/board/lib/core/class_audio/` streams the board microphone one way. Build: add a WebRTC media server (self-hosted LiveKit or mediasoup, or an India-region provider such as 100ms, Dyte or Agora; decision 5) carrying the board, the teacher's camera and audio. Keep the current ink stream as the low-bandwidth fallback (EKIN advertises under 1 Mbps), and add remote attendance and recording. Two-way student video, raise hand and chat follow as P1.

**Share (Have).** `apps/board/lib/features/board/share_whiteboard.dart` builds a branded PDF and offers a 30-day link, QR code, WhatsApp, email or other apps. Only check that it sits in the top bar.

**Record (Partial; P0, M).** `apps/board/lib/core/recording/` records the board's ink event log plus the teacher's voice, with chapter markers, background upload and notices to absent students. It does not capture 3D models, simulations or other apps, and there is no MP4 file to share. Build in two steps: (1) render the event log to MP4 on the server with ffmpeg so any recording can be shared as a normal video; (2) add optional true screen capture (Android MediaProjection, Windows Graphics Capture). Decision 7 covers storage cost.

### 2.6 Board chrome

Page counter and "+" (Have), zoom percentage (Have, the button with key `zoom-reset` in `apps/board/lib/features/board/layout/page_overview.dart`) and the bottom toolbar dock (Have, `apps/board/lib/features/board/layout/toolbar_layout.dart`) all exist. Only check that the zoom percentage and "1/N +" are visible on the main bottom bar as in the photo, not just in the page overview.

## 3. Competitor profiles

52 entries in five groups: Indian board makers and smart-class vendors (18), global board makers (14), China-focused education boards (3), classroom software and AI platforms (10), and 3D, sketch and content sources (7).

### 3.1 Indian board makers and smart-class vendors

#### Teachmint X (Teachmint Technologies)
- **Region:** India (Bengaluru); also sold in the Middle East, the US and Nepal.
- **Products:** Teachmint X2 panels (Pro, Plus, Neo, Star, Ultra) in 65, 75 and 86 inch; Click X student clickers; earlier Teachmint X / X1. X2 hardware: RK3576 with a 6 TOPS NPU, 8 GB / 128 GB, Android 14 (now Android 16) Google EDLA, 4K 48 MP AI camera, 8-mic array, 40 W speakers, NFC card reader, 40-point touch.
- **Software:** Interactive Whiteboard, EduAI, Connected Classroom app, Vision X (admin and device management), Share X (casting), Click X, Global EduAI.
- **AI features:** EduAI Ask Anything; AI Whiteboards (curriculum-aligned lessons with no planning); Homework Generator; Quiz Generator with solo or team mode; Class Recap; Voice Assistant; LearnBook; AI slide decks from voice or text; page-wise and whole-document or video summaries; class-level detection; OCR Solver for handwritten equations; AI pens; Global EduAI inside third-party apps; automated attendance.
- **Pricing:** No list price (demo only). IndiaMART: X2 Pro 75" Rs 1,48,499 to 1,74,999; X2 Pro 86" Rs 2,11,999 to 2,49,999; X2 Ultra 86" Rs 2,60,000. 3-year on-site warranty.
- **Offline:** Partial. Click X clickers and Vision X (school LAN only) need no internet. Offline use of the whiteboard and EduAI is not documented.
- **Languages:** "17 languages" on the whiteboard page, "90+" for the AI pen. Indian languages are not listed.
- **Standout:** The most AI-first Indian board, with offline clickers and LAN-only campus monitoring (live camera, board and audio). It may be the software in the user's photos, but that is unconfirmed.

#### Senses Electronics (SensePRO / SenseEDGE)
- **Region:** India (Pune). Claims 10,500+ institutions.
- **Products:** SensePRO (65 to 98", Android 16 EDLA, 4K AI camera, noise-cancelling mics, NFC); SenseEDGE and SenseEDGE 2.0 (65" and 75", Android 16 EDLA, 40-point IR touch, Windows 11 OPS).
- **Software:** SenseBoard, SensesAI, SenseConnect, SenseCapture, SenseWatch, SenseManage, SenseTalk, SenseEye.
- **AI features:** AI Magic Pen (rough sketch to clean visual); formula, chemical-formula and handwriting recognition; SensesAI lesson plans, quizzes, summaries, explanations, activities, diagrams and voice; AI curriculum navigator, AI search, AI YouTube, AI book analysis, AI image search; video summaries and MCQs; adaptive assessment; SenseEye face-recognition attendance; AI camera auto-framing.
- **Content:** NCERT, State Board and Balbharati books with AI summaries and flashcards; PhET, GeoGebra, Polypad, digital abacus; 5,000+ animated 3D models.
- **Pricing:** Vendor indicative 2026 prices: 65" Rs 1.2 to 1.4 lakh; 75" Rs 1.3 to 1.5 lakh; 86" Rs 1.8 to 2.1 lakh; 98" Rs 3.7 to 4.0 lakh; 105" Rs 7.5 to 8.0 lakh. Free lifetime software updates, no subscription; 3-year on-site warranty.
- **Offline:** Books can be read offline after download. Nothing else stated.
- **Languages:** 15+ Indian regional languages plus foreign languages; translation and read-aloud.
- **Standout:** The closest feature match to the photographed board: sketch clean-up, a very large 3D library and textbooks on the board.

#### EKIN (Ensonic Computech)
- **Region:** India (Jaipur and Kolkata); Make in India. The bezel in the user's photos is EKIN.
- **Products:** AI Interactive Flat Panel Royal Series (65/75/86", Android 14, 60-point optical touch, optional camera, mic and NFC); DTF Series with AI (55 to 98"); OPS; PTZ and auto-tracking cameras; document visualisers; mics.
- **Software:** Ekin AI Whiteboard Software; EKIN AI Agent.
- **AI features:** NEP 2020 lesson plans with images, videos, outcomes and formative questions; Bloom's-level quiz creation; summaries and quizzes from documents and videos; translation and text-to-speech; AI presentations; self-study course creation; curriculum search; voice commands; a teacher chat assistant that cites sources; a content suggestion engine; handwriting recognition; object and gesture recognition; class recording with automatic summary and questions; live transcription; smart annotation with shape recognition.
- **Other:** Collaborative whiteboard with live cursors and host-controlled writing; live virtual teaching under 1 Mbps with control of remote students' audio and video; AirPlay and Miracast (4 devices); Teams, Zoom and Meet; Office viewer and document scanner.
- **Pricing:** Quote only. IndiaMART: AI panel Rs 1,80,000; DTF-75 Rs 1,45,000; resellers list 75" from Rs 70,000 to Rs 1,39,995.
- **Offline:** Not stated.
- **Languages:** Multilingual translation and text-to-speech; languages not listed.
- **Standout:** A procurement-style spec that includes Unity or Unreal-grade simulations with editable physics. That claim comes from EKIN's own June 2026 PDF and names no product.

#### Globus Infocom
- **Region:** India (Noida).
- **Products:** Interactive displays from 75" (Android 14 EDLA) to 110"; AI camera and webcam variants; G-classic series (Android 11).
- **Software:** Globus Board Software.
- **AI features:** AI Pen: doodle an object and the board recognises it and swaps in a Google-sourced image; drawn text and shape recognition; AI image and internet search; AI camera with auto-framing and voice tracking.
- **Other:** Screen recording, wireless sharing, split screen, QR download of notes, USB/app/screen locks, three-finger menu and five-finger sleep gestures, eye-care screen.
- **Pricing:** Quote only. **Offline:** Not stated. **Languages:** Not stated.
- **Standout:** The closest Indian equivalent to the sketch-to-clipart bar, though it relies on Google image search.

#### Extramarks (Smart Class Plus and Extra Intelligence)
- **Region:** India (Noida); also the Middle East.
- **Products:** Smart Class Plus with EM Smartboard / flat panel; GeM kit (Intel i3, 4 GB, lockable enclosure); Extra Intelligence AI suite (July 2025); Assessment Centre; Teaching App.
- **AI features:** Teacher Assistant (lessons, diagrams, images, animations, activities); editable lesson plans; curriculum setup from a photo of the textbook index; Student Co-pilot (doubts by voice, text or image); AI scoring of handwritten subjective answers with teacher override; question variants and objective-to-subjective conversion; camera auto-attendance; Live Focus Insights and Emotion-Aware Monitoring; one-click translation, syllabus-wide language switch and voiceover; Bloom's reports.
- **Engagement:** Play Together team quizzes, live random student selection, instant practice mode.
- **Pricing:** "Contact us". GeM listing (undated, unverified): Rs 2,00,000 per kit (MRP Rs 2,25,000), minimum 10.
- **Offline:** Offline Pen-Paper Mode: print personalised papers, then scan answer sheets for AI evaluation.
- **Languages:** Regional languages; coverage cites English, Arabic, Marathi and Tamil.
- **Standout:** The deepest AI for assessment and classroom analytics. Its emotion monitoring conflicts with the DPDP Act for children.

#### Geneo (Schoolnet India)
- **Region:** India. Claims 100,000+ schools and 25 million learners.
- **Products:** Geneo AI Panel (65/75/86", 4K, 20 touch points); KYAN classroom device (65,000+ classrooms); Geneo AI apps.
- **AI features:** NEP-aligned lesson plans; summaries of videos and documents; quiz generation; chat with documents; image creation from text or rough sketches; step-by-step maths and chemistry equation solving; AI practice engine; auto-evaluation of objective and subjective answers; homework; progress metrics.
- **Content:** 10,000+ lesson plans, 10 lakh+ question bank, 3D STEM Lab, an 8-step pedagogy.
- **Pricing:** Not public. **Offline:** Works offline and online (a teacher testimonial says "even without internet"). **Languages:** Not stated.
- **Standout:** Big reach, sketch-to-image and a stated offline mode.

#### Next Education (TeachNext)
- **Region:** India (Hyderabad).
- **Products:** TeachNext, TeachNext Hybrid, NextLab (science, maths, robotics, English), NextBooks, Next LMS and Next ERP. No current own-brand AI panel found.
- **AI features:** An "AI-based academic platform" is claimed with no named features (unverified).
- **Content:** 4,000+ hours, 25,000+ modules, 6,000+ experiments and simulations, 540,000+ questions; 2D and 3D animation, stop-motion, papercraft and real-life videos.
- **Pricing:** Not public. **Offline:** Not stated (historically local content on a projector). **Languages:** Eight languages; CBSE, ICSE and 29+ state boards (third-party, unverified).
- **Standout:** A very large curriculum-mapped content library.

#### Tata ClassEdge
- **Region:** India. ClassEdge Platinum (2023) in about 28,000 classrooms in 2,000+ schools.
- **AI features:** AI question generator.
- **Other:** Infinite whiteboard, 3D teaching widgets, NEP-aligned content, e-books, teacher-contributed resources, one-touch share, teaching-behaviour insights, and cloud resume so a lesson continues in any classroom.
- **Pricing, offline, languages:** Not stated.
- **Standout:** Resume the lesson in any classroom in the school.

#### DeltaView
- **Region:** India; Make in India; GeM-listed per vendor.
- **Products:** Blaze Smart Board (shown September 2025): AI-enabled 48 MP camera, zero-bonding IR touch, 4K IPS.
- **Software:** DeltaView Canvas (feature list not published).
- **AI features:** "Interactive AI-powered learning" (no detail).
- **Pricing:** Not public; positioned as affordable. **Offline, languages:** Not stated.
- **Standout:** Budget Make-in-India panel. A possible hardware partner type.

#### LEAD Group (LEAD School)
- **Region:** India (Mumbai); 8,500+ partner schools.
- **Products:** A Smart TV plus teacher tablet in every classroom (not a flat panel); Techbook (2024); Miss Curie AI spoken English.
- **AI features:** IRA reading assistant (fluency and pronunciation feedback); PIE adaptive exercises; Miss Curie conversational English (about 20,000 students in 70 schools).
- **3D / AR:** ARI augmented-reality instructor for science and maths topics.
- **Pricing:** Not public. FY26 operating revenue Rs 387 Cr; Techbook is a Rs 25 to 30 Cr business.
- **Offline:** Not stated. **Languages:** English-focused.
- **Standout:** A low-cost TV-plus-tablet classroom instead of a panel.

#### Educomp Smartclass
- **Region:** India. Parent company in insolvency since 2017; a re-run was ordered in April 2026. The smartclass business moved to Smartclass Educational Services (Ebix bought 60%).
- **Products:** Projector-era Smartclass / Class Transformation System (short-throw projector, green and white board, document camera). No current panel found.
- **AI features:** None found for 2024 to 2026.
- **Pricing:** About Rs 100 to 200 per student per year on a 5-year package (2013 data).
- **Offline:** Content delivered locally (legacy model). **Languages:** Not stated.
- **Standout:** The pioneer of the Indian smart class. A historical benchmark only.

#### BYJU'S (Think & Learn)
- **Region:** India (Bengaluru).
- **Products:** No school smart-board product in 2024 to 2026; consumer learning app and BYJU'S Classes.
- **Status:** In insolvency since 2024 and run by a resolution professional.
- **Standout:** Not a current board competitor.

#### Embibe (Jio Embibe)
- **Region:** India (Bengaluru); Reliance Jio holds 72.69%. Government agreements with Uttar Pradesh (55,000+ schools) and Goa.
- **Products:** No own panel. Embibe TeachLite runs on panels and Android TVs; EMBIBE Classroom teacher app; Jio Embibe for teachers and students.
- **AI features:** AI Doubt Bot; adaptive personalised learning; AI teacher app for homework and class tracking (unverified).
- **Content:** 40,000+ 3D explainers and feature videos; 70,000+ interactive 3D models and animations; augmented reality and virtual experiments; 50,000+ practice tests; JEE, NEET and BITSAT prep (third-party, unverified).
- **Pricing:** One year free for teachers through Jio; free government deployments under agreements.
- **Offline:** Partial and unclear. **Languages:** 12 Indian languages (vendor claim).
- **Standout:** The largest Indian 3D library, free to teachers and deployed at government scale.

#### Navneet TOPclass (Navneet Education / eSense Learning)
- **Region:** India (Mumbai); about 4,000 schools in Maharashtra, Gujarat and CBSE.
- **Products:** No own panel. TopClass comes preinstalled on Brio, Cybernetyx and Hikvision panels. Sister products: TopSchool (LMS), TopAssess, NavneetAI, TOPScorer, Nitya teacher training.
- **AI features:** NavneetAI (February 2025) makes quizzes, homework, slide decks, flashcards and summaries from 50,000+ Navneet resources only, using a set of specialised agents. TopAssess generates and grades assessments.
- **Content:** 2D and 3D animations, 100+ activities, 100+ worksheets with answers, 41,000+ questions (the FAQ says 2 lakh+), a question-paper generator with 60+ templates and Word/PDF export, syllabus-completion tracking. Maharashtra and Gujarat state boards and CBSE.
- **Pricing:** About Rs 65,000 per set (IndiaMART, unverified).
- **Offline:** Yes.
- **Languages:** English, Marathi and Gujarati mediums. Hindi is not listed.
- **Standout:** A textbook publisher's smart class with offline state-medium content and a question-paper generator.

#### Classteacher Learning Systems
- **Region:** India (Gurugram); founded 1999. Claims 1,200 to 2,000+ schools; no 2024 to 2026 news found.
- **Products:** Ultra Prime panel (20 touch points), digital podium, standee, video wall, VR lab, science and English labs, robotics kits.
- **AI features:** An "AI-empowered LMS" with no named features.
- **Pricing:** Panel about Rs 1,20,000 (IndiaMART, unverified). **Offline, languages:** Not stated.
- **Standout:** A full-stack school AV vendor with little verifiable recent activity.

#### Cybernetyx (EyeRIS, BrightClass, Galileo One)
- **Region:** India (Bengaluru). Claims EyeRIS in 120,000+ classrooms. The founder now runs Bird AI (meeting rooms). Hardware partner for Navneet TopClass.
- **Products:** EyeRIS A10 panel, EyeRIS IX, A9; the older any-surface interactive kit; Galileo One clip-on AI whiteboard for TVs (2020).
- **AI features:** Engagement tracking and voice control (EyeRIS OS); BrightClass AI assistants and content search; AI assignment assessment (testimonials only); Galileo One minute-by-minute camera attendance, facial-expression behaviour analysis and a beamforming-mic voice assistant; handwriting and shape recognition (older document).
- **Pricing:** Not published; sold through GeM and dealers. **Offline, languages:** Not stated.
- **Standout:** An early mover in AI classroom sensing. Its behaviour tracking of children would clash with the DPDP Act.

#### Mexus Education
- **Region:** India.
- **Status:** Nothing could be verified. The website's security certificate had expired on 17 October 2026, and the search budget ran out before any independent source was found. Treat it as possibly inactive and check again later.

#### Photo board (EKIN panel; software unconfirmed)
- **Region:** India.
- **What the photos show:** A 3D Library of anatomy models with download/ready badges and "Request a 3D model"; a 3D viewer with Rotate, Move, Zoom, Select, Isolate, Hide, Recenter and Reset plus a parts panel; a "Did you mean" sketch-to-icon bar; Live Quiz, Live Class, Share and Record in the top bar; a page counter, zoom percentage and bottom toolbar.
- **Languages:** The interface lists English, Hindi, Arabic, Bengali, Marathi, Kannada, Tamil and Telugu, and claims 90+ languages.
- **Pricing:** Not public.
- **Standout:** Everything the user asked to match. Section 2 covers it feature by feature.

### 3.2 Global board makers

#### SMART Technologies
- **Region:** Canada; sold in India through smarttech.com/en-in.
- **Products:** SMART Board GX (V4) Plus (Android 14), MX (V5) (Android 13, upgradable to 15), RX (with room environment sensors), T Pro (QLED, no OS); SMART Ultra HD Camera 120.
- **Software:** iQ (on-panel experience), SMART Notebook 25/26 (desktop), Lumio (web lessons and games; Free, Standard and Spark plans), SMART Remote Management, SMART Ink, Admin Portal.
- **AI features:** Built-in Google Gemini through the board microphone (voice commands and content generation); AI ink-to-text (maths conversion coming in 2026); AI translate; AI Select (coming 2026); Lumio AI Assist quiz generation with chosen language and difficulty; prompt-to-full-lesson generation (all users from January 2026); AI activity suggestions with purpose, duration and delivery mode (July 2026); admin switch to turn AI on or off.
- **Other:** Lumio games (Monster Quiz, Team Quiz, Game Show, Speedup, Shout It Out!, Flip Out, Rank Order and more), handouts with live thumbnails, Class Sessions; Notebook shape and table recognition; 3D objects in Notebook (older documentation); annotate over any app; Google Classroom; LTI for Canvas, Schoology and D2L; QR sign-in; remote management with OTA update windows; Tool Explorer physical stamps.
- **Pricing:** MX275-V5 (75") Rs 6,89,765 including GST and import duty at Tanotis (Rs 6,41,481 each for 10+). Lumio Free; Standard about USD 59 per teacher per year (third-party); Spark by quote.
- **Offline:** Partial. Notebook is an installed app; Lumio and the AI features are cloud services.
- **Languages:** Hindi interface in Notebook 25.0 and Lumio (February 2025). No other Indian languages.
- **Standout:** A generative assistant on the panel itself, prompt-to-lesson generation and a Hindi interface.

#### Promethean
- **Region:** UK and US, owned by Mynd.ai, in 126+ countries. No India office, pricing or language pack found.
- **Products:** ActivPanel 10 and 10 Premium (January 2025), ActivPanel LE (Google EDLA), D-Series; OPS-A, OPS-M and Chromebox modules; ActivPen 2; ePTZ camera.
- **Software:** ActivSuite (Whiteboard, Timer, Spinner, Annotate, Screen Share Receiver, Polling); Explain Everything Whiteboard (with AI Companion and Learning Check-in); ActivInspire (desktop flipcharts); Promethean Panel Management.
- **AI features:** AI Companion (30 September 2026): runs fully on the device with no internet; makes lesson plans, quizzes, vocabulary lists, next-step suggestions, audio narration, translations and accessibility descriptions (needs iPadOS/iOS 27 with Apple Intelligence). Image Playground image generation; Recognize Drawings, Scan Text and Isolate Subject; Learning Check-in AI engagement analysis (with Augment Me); ePTZ camera that follows the speaker.
- **Other:** ActivInspire handwriting and shape recognition, Magic Ink, Revealer and Spotlight; 50,000+ teacher-made flipcharts; Screen Share Receiver; split whiteboard; polling; crossword, memory and matching games; OTA updates through Panel Management.
- **Pricing:** US MSRP: ActivPanel 10 75" USD 3,109; ActivPanel LE 75" USD 2,252. UK: ActivPanel 10 75" with OPS-A2 GBP 2,150 incl. VAT. Explain Everything Advanced USD 69 per year; ActivSuite 1-year subscription sold.
- **Offline:** Partial. The AI Companion is offline on Apple devices; an offline mode for Explain Everything is on the roadmap.
- **Languages:** No Indian-language interface.
- **Standout:** On-device, offline generative AI on top of a mature panel stack.

#### Clevertouch (Boxlight)
- **Region:** UK-born, owned by Boxlight (US). No Indian distributor found.
- **Products:** IMPACT Lux 2 (Android 15, first Google EDLA panel), IMPACT Max and Max 2, Pro Series, Core, CleverWall; CleverCam, CleverInk stylus, CleverHub 2.
- **Software:** LYNX Whiteboard (free), LYNX Pro and Organisation, LYNX Activities, LYNX Screen Recorder, LYNX Cloud, Clevershare, CleverLive, Cleverstore, CleverMDM (built with Radix).
- **AI features:** AI Builder (generates multi-page lessons with title and contents pages, summaries, assignments and quizzes, plus media search and text expansion); Quiz Generator AI from keywords or a web page; Create Image (built with MidJourney); AI image upscaling; AI activity generator.
- **Other:** Recognition pens for text, shapes and maths; a fill tool; 85+ PhET simulations; 100+ activities; Clevershare (50 devices connected, 9 on screen, touch-back control, hotspot fallback, phone as document camera); NFC personal profiles; a converter for SMART Notebook, ActivInspire, PowerPoint and MimioStudio files; Google Classroom, Microsoft 365, Drive, OneDrive and Dropbox; CleverMDM (remote view and control, schedules, OTA, app push, allow/block lists, anti-theft, remote wipe).
- **Pricing:** LYNX free (1 GB); LYNX Pro GBP 24 per year (2024) or "from about GBP 1 per week" (10 GB). No public panel or INR prices.
- **Offline:** Not documented; LYNX AI needs the cloud.
- **Languages:** No Indian languages found.
- **Standout:** Whole AI lessons for about GBP 24 a year, plus strong fleet management.

#### Boxlight (Mimio)
- **Region:** US (Georgia). Brands: Clevertouch, Mimio, FrontRow, EOS Education. No verified India presence.
- **Products:** MimioPro 4, ProColor Series 3, Symphonic Series (June 2026, single source), FrontRow classroom audio; legacy MimioVote clickers.
- **Software:** MimioStudio 12.5 (end of life; Boxlight recommends LYNX), MyClass (formerly MimioConnect), MimioMobile, FrontRow Live (beta October 2025), Clevershare, CleverLive, MyStemKits.
- **AI features:** FrontRow Live: hardware-free live captions and up to 10 simultaneous translations of the teacher's speech (vendor claims 128 caption languages); MyClass AI lesson planning (release status unclear).
- **Other:** MyClass question types, Challenge Mode and rewards; video conferencing in MyClass Pro; LMS integrations (Google Classroom, Microsoft 365, Schoology, Canvas, Moodle, Blackboard).
- **Pricing:** MyClass Free, VIP and Pro; no current panel price.
- **Offline:** Weak. **Languages:** FrontRow Live claims many; Indian languages not confirmed.
- **Standout:** Live captions and translation without extra hardware.

#### ViewSonic (ViewBoard, myViewBoard, ClassSwift)
- **Region:** Taiwan and US, global. Strong India presence: IN03 panels made in Gujarat, Noida and Tirupati (August 2025) and the India-only ViewLessons AI Studio (July 2025).
- **Products:** ViewBoard IN04V-N (2026, Android 16 EDLA, 48 MP AI camera, 8-mic array), IN03 (Made in India, Android 14 EDLA), IFP51, IFP52 and older lines.
- **Software:** myViewBoard 3.0, ViewLessons AI Studio, ClassSwift, ViewSonic Manager and Manager Advanced, AirSync.
- **AI features:** ViewLessons AI Studio (900+ editable NCERT, CBSE and ICSE lessons for Grades 1 to 12, AI custom lessons from a prompt, export to PowerPoint and .olf); AI Pen (sketch to clean visual via live web search; paid tiers); Magical Pen and shape recognition; AI text-recognition pen with YouTube/Wikipedia search and AI explanations; ClassSwift AI quiz generator from PDFs or screenshots, AI grading and AI activity building; immersive reader, live captions, text-to-speech and speech-to-text; AI face-tracking camera.
- **Other:** Infinite canvas; multi-file tabs; long-press quick menu; Magic Box widgets; Participate Mode (up to six shared student canvases); Pop Quiz and Polls; students "throw" media to the board; one-way live streaming; recording; import of PPT, PDF, Google Slides, .olf and .iwb; annotate over the Windows desktop; Google Drive, OneDrive, Dropbox and Box; Google and Microsoft sign-in; Manager (QR enrolment, firmware updates, broadcasts, alerts) and Manager Advanced (power schedules, remote desktop, reports).
- **Pricing:** myViewBoard Standard free; Pro USD 6.99 per month or USD 59 per year. Manager free, Advanced paid. India dealer prices about INR 1.0 to 1.6 lakh for 65 to 75" (unofficial).
- **Offline:** Partial. The core whiteboard works before sign-in; AI and engagement tools need an account and network.
- **Languages:** Handwriting recognition only in English and Traditional Chinese. No Indian language confirmed.
- **Standout:** The only global brand with an India-specific AI lesson library, and an AI Pen close to the "Did you mean" bar.

#### BenQ (BenQ Board, EZWrite 6, BenQ AI)
- **Region:** Taiwan, global. India launch of Board Pro RP05 in June 2026.
- **Products:** Board Pro RP05 (65/75/86", MediaTek Genio 720, 10 TOPS NPU, 16 GB / 256 GB, Android 15 EDLA, camera, 8-mic array); Board Master RM05; older RP03 and RE03.
- **Software:** EZWrite 6, the BenQ AI suite, InstaShare 2, AMS (accounts), DMS (device management), IAM, ClassroomCare.
- **AI features (all on the device):** Ask AI; Lasso Search (circle anything to search); AI Lessons; AI Quiz; SummarAI (records the lesson, transcript, screenshots, summary); AI Lens (identifies plants and insects); Circle to Artify (sketch or notes to artwork); style transfer; background remover; EZMath (handwritten formulas and diagrams to clean content, with calculation); handwriting recognition; OCR of printed pages; one-tap translation in 59 languages; AI text-to-speech; AI Guardian (blocks inappropriate images in student casts); camera hand gestures.
- **Other:** Cloud whiteboard for in-class and remote learners; Team Post sections; EZCopy; InstaShare 2 (9 devices); touch-back; floating tool to annotate over any app; import of Word, Excel, PowerPoint, PDF, IWB and SMART Notebook; ClassLink, Clever, Google and Microsoft sign-in; DMS (OTA, app push, power schedules, analytics); QR or NFC teacher login; air-quality sensor; germ-resistant glass.
- **Pricing:** RP05 65" from INR 2,00,000 including taxes; 75" and 86" on request. AI bundled.
- **Offline:** Strong. BenQ says every AI tool runs on the board with no cloud dependency.
- **Languages:** Translation into 59 languages; Indian languages not named.
- **Standout:** A full on-device AI suite at Rs 2 lakh, with child-safety filtering of student casts.

#### Samsung (Interactive Display WAF, WAFX-P)
- **Region:** Korea, global. No India launch or INR price for the education line.
- **Products:** WAF (Android 14 EDLA), WAFX-P (Android 15, 4.8 TOPS NPU, 4K camera, NFC), WEFX (no OS); WAF-S and WAFX-PS (Android 16) announced June 2026. A "WAHX-M" model with on-device AI appears in one announcement only and is unconfirmed. Flip Pro for meeting rooms.
- **Software:** Samsung AI Assistant, Samsung Whiteboard / Note, AMS (accounts), Education Portal, Device Management Solution.
- **AI features:** Circle to Search (built on Google's Gemini API); records and transcribes the lesson, then AI Summary with keywords, headers and timestamps; AI Quiz from the recorded lesson with the class's correct-answer rate; Live Transcript captions; on-device voice commands, AI calculator and text-to-speech (WAHX-M, unconfirmed).
- **Other:** Split Note Mode (4 writing zones); dual-colour pen; always-on annotation; two-way mirroring from 9 devices; Google Classroom and Drive; emergency alerts via InformaCast and Raptor; QR or NFC teacher profiles that follow the teacher (from July 2026).
- **Pricing:** WAF 75" GBP 2,399 (UK); WAF 65" NZD 4,300.85 + GST. No India price.
- **Offline:** Mixed; Circle to Search is cloud. **Languages:** Vary by region; Indian languages not confirmed.
- **Standout:** Record, transcribe, summarise and quiz in one flow, plus teacher profiles by QR or NFC card.

#### LG (LG CreateBoard)
- **Region:** Korea, global. LG named India a key market for the low-cost CreateBoard Core (June 2025).
- **Products:** CreateBoard Pro TR3PN (Android 13 EDLA), Standard TR3DQ, Core TR3BQ (budget), 105" TR5WP (21:9), TR3DK.
- **Software:** CreateBoard Lab, ELGi AI helper, CreateBoard AI, CreateBoard Share, ConnectedCare DMS (sold separately).
- **AI features:** Ask LG (LLM Q&A); Circle to Search; AI Video Summary (downloaded videos only); Calculator Pro and Math Notes; ELGi sketch recognition and SVG converter (sketch to clean vector); handwriting recognition and prediction; signature and writing-structure recognition (spec sheet only); AI Live Subtitle and translation of microphone and system audio within 8 m; read-aloud; an AI on/off switch.
- **Other:** CreateBoard Share (9 screens via a 6-digit code, including from a web page with no app); QR login for Google Drive and OneDrive; "attention" signal with sound; ConnectedCare DMS (remote power, schedules, lock, broadcasts); USB lock.
- **Pricing:** AI free for one year, then paid. 65TR3DK GBP 1,054.84 ex-VAT (UK). India dealer listings (INR 78,500 to 24.2 lakh) are unreliable.
- **Offline:** Partial. **Languages:** Not published; Indian languages not confirmed.
- **Standout:** Sketch-to-vector conversion and live translated subtitles.

#### Newline Interactive
- **Region:** US (Allen, Texas); number one US panel brand with 22% share in 2024. Sold in India through dealers.
- **Products:** Q Pro, Q, Z Pro (with a modular 4K AI camera), C Series (no OS), Elara Elite (2026, Android 16 EDLA), FLEX 27" all-in-one; ModCam+, mic array, document camera, TruLift height-adjustable stand.
- **Software:** Engage Cloud whiteboard, Merlyn AI, Newline AI Remote and Voice Assistant, Newline Cast, Broadcast, NDM+ (display management), Newline Alert, Coirle activities (700+), DisplayNote.
- **AI features:** Merlyn AI (voice control of the whole panel from anywhere in the room, plus generated text and images from an education-specific LLM); AI Remote voice commands; Elara Elite AI whiteboard (handwriting, maths conversion, automatic outlines, smart search, content generation); AI presenter tracking; Engage Cloud handwriting recognition, translation and speech transcription.
- **Other:** Individual student boards with a teacher view of all of them; PDF to individual student workbooks; widgets and a molecule editor; Newline Cast (4 screens); broadcast to student screens; Google and Microsoft sign-in, Classroom, Drive, Teams and OneNote; NDM+ (OTA, apps, power); emergency notifications; NFC login.
- **Pricing:** Merlyn AI 1, 3 or 5-year subscriptions (prices not public); NDM+ free. India dealers: Q Pro 65" about INR 1,05,000; 75" about INR 1.12 to 1.45 lakh; Z 75" about INR 2.02 lakh (unofficial).
- **Offline:** Weak; Engage Cloud and Merlyn are cloud. **Languages:** "Multiple" and "hundreds" claimed, none listed.
- **Standout:** Hands-free voice control of the panel.

#### MAXHUB (CVTE, international)
- **Region:** International, with an India site and sales team.
- **Products:** E3 (65/75/86", Android 14, 6 TOPS NPU), U4 (Android 15, 50 MP camera, 8 mics), F5 (Windows 11 plus Android 15, five cameras), older E2/U3, XBoard V7.
- **Software:** EDU OS, Class Pro and EasiClass (with student whiteboards), MAXHUB Class, EasiNote5, MAXHUB Connect and Share, Pivot (cloud management).
- **AI features:** Class Pro / EasiClass generate courseware and discussion questions; Ask AI; Circle&GO; Video Pilot summaries and chapters; Live Subtitle with translation; smart handwriting that turns notes into subject tools; AI teaching ideas; AI classroom games; quizzes from the lesson; on-device anonymous camera AI for random picks, headcounts and hand-gesture polls (F5); face-recognition attendance (U4); auto-framing and voice enhancement.
- **Other:** Students follow the lesson on their own devices with private notes; THINK&INK (pen tip, pen tail, finger and palm told apart); Miracast, AirPlay, Chromecast and DLNA; ranking and group games; background screen recording.
- **Pricing:** No official list. IndiaMART 75" about INR 1.12 to 1.95 lakh (typically 1.35 to 1.4 lakh); 3-year warranty with advance replacement.
- **Offline:** Partial; the F5 camera AI runs on the device with no cloud upload. **Languages:** English interface; subtitle languages not listed.
- **Standout:** The most AI-dense panel sold in India, including polls that need no student devices.

#### Hikvision (WonderHub, WonderOS 4)
- **Region:** Global (China). WonderOS 4.0 launched in India at PALM Expo, Mumbai, May 2026.
- **Products:** WonderHub Select Series (July 2025); older DS-D5B Value series.
- **Software:** WonderOS 4 (Android 16), Wonder AI (WonderOmi, AI Identify, AI Notes), Whiteboard 2.0, WonderCast, Wonder Seminar, Cloud Teaching Platform, DMS / HikCentral FocSign.
- **AI features:** WonderOmi voice assistant with spoken answers; AI Identify (circle text, a formula or an image to get an explanation, search results and practice questions); AI Notes (live transcription, summary, bilingual speech-to-text); shape, line and handwriting recognition (text, shape and chart modes); auto-framing camera.
- **Other:** Extendable canvas with a minimap; 36 2D and 11 3D shapes; subject templates; auto-save with QR sharing; file browser; WonderCast (9 screens); comparing four screens; Google Workspace, Drive and OneDrive with QR login; NFC, password or USB-key login; 20+ tools including a piano; a gesture eye test (unverified); management of up to 2,048 displays; modular OTA.
- **Pricing:** IndiaMART 75" INR 1,15,000 excluding tax; UK GBP 1,360 to 1,787 ex-VAT.
- **Offline:** Not stated for the AI. **Languages:** Bilingual speech-to-text; Indian languages not named.
- **Standout:** Voice assistant plus circle-to-explain, freshly launched in India.

#### Dahua Technology (DeepHub)
- **Region:** China (Hangzhou), sold worldwide with an India site and resellers.
- **Products:** DeepHub Education Series (ST420-S3, ST430, ST473, ST480, ST470-C) and Lite; MC470-P now discontinued.
- **Software:** No named teaching app; Android 14 or 16 plus an optional Windows OPS.
- **AI features:** Handwriting recognition; AI recognition of drawings; gesture control; voice tracking and auto-framing (MC470 only).
- **Other:** 9-way split screen, QR file sharing, central device management, Google EDLA (ST470-C), NFC and RFID login.
- **Pricing:** IndiaMART 86" Rs 80,000; UK DeepHub Lite 65" GBP 1,229.24.
- **Offline:** Yes for the native whiteboard. **Languages:** No Indian language documented.
- **Standout:** Cheap, modern hardware with no teaching layer. A possible base for a Zynetix bundle.

#### Huawei IdeaHub
- **Region:** Global; India availability not confirmed.
- **Products:** IdeaHub K3 education panels (65 to 98"), Board / Board 2 / Board Edu, ES3 / S3 (2025), IdeaHub Controller, IdeaShare Key.
- **AI features:** Whiteboard recognition of Chinese, letters, numbers, formulas and mind maps; real-time interpretation (S3); AI meeting summaries; AI noise isolation; AI image enhancement.
- **Other:** 16 ms writing latency (K3); app-free projection from Huawei phones; Wi-Fi Direct projection with no network; built-in conferencing; 24-mic array; camera privacy shield; QR take-away of board content.
- **Pricing:** Not public.
- **Offline:** Wi-Fi Direct works with no network; recognition is likely local. **Languages:** Chinese and others; no Indian language.
- **Standout:** Collaboration-first hardware.

#### Horion (Shenzhen Horion Intelligent Technology)
- **Region:** Global, export-focused. Tied to KTC; one reviewer says it is a wholly owned subsidiary of KTC Technology (not re-verified).
- **Products:** SpaceBoard K8A (65/75/86", no built-in camera), M6APro / V2 (AI quad camera), K7A, 135" LED all-in-one, lecterns, cameras, mics.
- **Software:** Horion OS 7.2 (Android 16, Google EDLA), AI Smart Whiteboard, k-sharePro, DisplayNote Launcher, content and meeting management.
- **AI features:** Whiteboard AI that helps organise thoughts, search and build plans; AI auto-framing camera.
- **Other:** Multi-user writing and remote collaboration, annotation over any input, gesture writing, k-sharePro (Miracast, AirPlay, Google Cast, DLNA), separate user accounts on one panel, NFC projection and OTA (both unverified).
- **Pricing:** Not public. **Offline, languages:** Not stated.
- **Standout:** A budget Android 16 EDLA panel. A possible OEM partner.

### 3.3 China-focused education boards

#### Seewo (CVTE)
- **Region:** Mainland China, the market leader. No India presence (CVTE sells abroad as MAXHUB).
- **Products:** 8th-generation panel (32 TOPS on-device compute), 7th generation, AI full-screen X series, smart blackboards, lecture-capture systems, smart lectern, document camera, AI compute and storage servers for schools.
- **Software:** EasiNote 5; Seewo Teaching Large Model 2.0; AI Teaching Space; EasiClass with seewoPad student tablets; EasiCamera; Knowledge Capsule micro-lectures; campus device management.
- **AI features:** Its own education LLM that can run on the device and offline; AI lesson preparation (goals, plans, courseware; the prep assistant uses DeepSeek-R1 and Doubao); handwriting recognition that turns writing into formulas, function graphs and word cards; board-writing beautification that keeps the teacher's handwriting style; AI review of student work under the document camera; classroom feedback reports; student growth tracking; AI teaching evaluation (built with Tsinghua University); AI editing of recorded lessons; AI mistake notebook; batch certificates; an assistant for event plans and report comments.
- **Other:** Subject tools (function grapher, simulated experiments, Chinese characters, geometry), mind maps, phone control of the board, campus management (patrol, restore on reboot, URL filtering).
- **Pricing:** No list price. 2025 government tenders imply about CNY 20,000 to 31,000 for an 86" panel (inferred). EasiNote has a paid membership.
- **Offline:** Strong. **Languages:** Simplified Chinese only.
- **Standout:** An offline education LLM on a 32 TOPS panel.

#### Hitevision (Honghe Technology)
- **Region:** Mainland China; sells abroad mainly through Newline.
- **Products:** AI Smart Blackboard, AI Smart Screen (15T compute, 1+3 AI cameras), interactive panels, eye-care blackboards, document cameras, a naked-eye 3D holographic teaching unit, laser projection, AI PE testing.
- **Software:** Hitevision Whiteboard, π6 and Hongyan teaching software, Lesson+ AI suite, Zhitong camera AI, centralised control, Ark data platform, ClassVision, Hitecloud open platform.
- **AI features:** Lesson+ (smart lesson prep on a knowledge graph, AI teaching assistant with voice, AI handwriting whiteboard, adaptive tests, AI test-paper builder, learning analytics, AI speaking coach); AI classroom analysis; Zhitong camera AI (emotion, behaviour, attention, risky objects, emergency alerts, classroom AI reports); AI patrol alerts.
- **Other:** Lesson recording and remote patrol, virtual micro-lesson kit, phone multi-screen app, glasses-free 3D display, software adapted to Chinese chips.
- **Pricing:** Not public. **Offline:** Built-in compute with local encrypted data (developed with Huawei Ascend). **Languages:** Chinese, plus an English speaking coach.
- **Standout:** A broad AI teaching suite. Its camera behaviour analytics would not be acceptable in India under the DPDP Act.

#### iFLYTEK (SPARK Smart Blackboard, Tongchuang AI Blackboard)
- **Region:** Mainland China (50,000+ schools); Hong Kong via a distributor.
- **Products:** SPARK Smart Blackboard 2.0; Tongchuang AI Blackboard (a dual board shown in April and July 2026: a physical-looking board plus a digital board); SPARK AI Grader P30; Curiosity Window; Liaoyuan AIPC.
- **Software:** SPARK LLM (X1, X1.5); Spark Teacher Assistant (5,000+ subject agents); classroom recording and analytics; Growth Map student evaluation; English listening and speaking products.
- **AI features:** Handwriting tidied and synced to the screen; freehand circles become regular circles with centre and radius labelled; circle a handwritten function to get a live graph; a sketched cube becomes a rotatable 3D solid with edges, area and volume labelled; one-click 3D cross-sections; historical-figure avatars and a teacher digital twin; a virtual teaching assistant; lesson plans and courseware (unit design cut from 2 hours to 25 minutes, vendor claim); graded A/B question papers; AI Grader for subjective answers and essays; recordings turned into micro-lessons and teaching reports; AI lesson consultation; error-cause analysis per student.
- **Pricing:** Not public. **Offline:** Not stated. **Languages:** Chinese and English.
- **Standout:** The deepest board-native AI of any brand researched.

### 3.4 Classroom software and AI platforms

#### ClassPoint (by Inknoe)
- **Region:** Global; a Microsoft PowerPoint add-in on Windows (runs on a panel's Windows OPS).
- **AI features:** Quiz generator that reads the current slide and writes MCQ, short-answer or fill-in-the-blank questions at a chosen Bloom's level, in a chosen language (OpenAI); AI Insights session summary (Pro).
- **Other:** 8 live activity types (including drawing, image, audio and video answers), auto-graded quiz mode, stars, levels, badges and leaderboards, live Q&A, grouping, timer, name picker, draggable slide objects, ad-hoc whiteboard slides, annotation, spotlight.
- **Pricing:** Basic free (25 students, 3 classes); Pro USD 8 per month or USD 96 per year; Premium by quote.
- **Offline:** Not stated; live answers and AI appear to need internet. **Languages:** Chosen output language; Hindi unconfirmed.
- **Standout:** Turns any PowerPoint slide into a live quiz.

#### Microsoft (Whiteboard, Copilot, Teach, Learning Zone)
- **Region:** Global. Teams supports 8 Indian languages.
- **Software:** Microsoft Whiteboard, Copilot in Whiteboard, Teach, Study and Learn, Learning Zone, Immersive Reader and Reading Coach, PowerPoint 3D models.
- **AI features:** Ink to shape and ink to table; Copilot suggests, clusters and summarises sticky notes; Teach builds lesson plans, rubrics, quizzes (Forms), flashcards, standards alignment, differentiation and reading-level changes; Study and Learn for students; Learning Zone builds interactive lessons using an on-device model (Phi Silica) plus the cloud (authoring needs a Copilot+ PC).
- **Pricing:** Teach free for any Microsoft 365 Education teacher; Learning Zone included in A1, A3 and A5; Copilot in Whiteboard needs a Copilot licence; Microsoft 365 Copilot academic USD 18 per user per month.
- **Offline:** Learning Zone is hybrid; the rest is cloud.
- **Languages:** Teach interface in 100+ languages; Hindi in Immersive Reader; 8 Indian languages in Teams.
- **Standout:** Free AI teaching tools for every Microsoft 365 Education teacher.

#### Google for Education (Classroom, Gemini, NotebookLM)
- **Region:** Global, with India-specific programmes announced January 2026.
- **Software:** Google Classroom, Gemini in Classroom, Gemini for Education, NotebookLM, Gems, Gemini in Forms, Class tools (ChromeOS), Camera Studio, Google Vids, Read Along, ATL Saathi.
- **AI features:** 30+ Gemini features in Classroom (50+ more announced in 2026); NotebookLM study guides, audio and video overviews; custom tutor Gems and simulation Gems; infographics, slide decks and images (Nano Banana Pro); audio lessons; file to rubric; writing feedback (coming); quizzes in Forms; free JEE Main practice tests with PhysicsWallah and Careers360 content; Veo 3 video (paid); Read Along reading tutor; ATL Saathi for tinkering-lab teachers.
- **Pricing:** Gemini in Classroom and Gemini for Education free in all Workspace for Education editions; some analytics and annotation features paid.
- **Offline:** Only Read Along (Android). **Languages:** Gemini, NotebookLM and Classroom in several Indian languages; Read Along in Hindi, Bengali, Tamil, Telugu, Marathi and Urdu; ATL Saathi in 8 Indian languages.
- **Standout:** Free top-model AI for every school, with India-specific exam practice.

#### Nearpod (Renaissance)
- **Region:** US, used globally. Software only; also a Google Slides add-on.
- **AI features:** AI Create (Lesson Generator, Activity Generator, Text Leveler); AI Question Generator for lessons, videos and the Time to Climb race.
- **Other:** 22,000+ ready lessons; Nearpod 3D (100 objects in 6 categories); VR field trips; PhET; interactive video; Time to Climb; Draw It, Collaborate Board, matching pairs, drag and drop; maths manipulatives; live or student-paced; live annotation; teacher notes; co-teaching; reports; Google Classroom, Teams, Clever, ClassLink, LTI.
- **Pricing:** Silver free (40 students per session); Gold USD 159 per year; Platinum USD 397 per year; School & District by quote.
- **Offline:** Not stated. **Languages:** No Indian language verified.
- **Standout:** A huge ready-lesson library with VR trips, 3D objects and simulations pushed to student devices.

#### Curipod
- **Region:** Global, with a US state-test focus.
- **AI features:** Instant "Glow & Grow" feedback on student writing during class; scoring against the teacher's rubric; AI interactive lesson generation (2024 review); quick activities.
- **Other:** Open questions, drawing, polls and word clouds with a join code; paste blocking; text-to-speech; translation; bilingual ESL practice; writing reports; SSO.
- **Pricing:** Free; School & District by quote.
- **Offline:** No. **Languages:** The pricing page was served in Hindi; Hindi content unconfirmed.
- **Standout:** Live AI writing feedback scored on the teacher's own rubric.

#### MagicSchool
- **Region:** US, used globally.
- **AI features:** 80+ teacher tools (lesson plans, slide decks including from video, worksheets, quizzes, rubrics, writing feedback, text rewriter, IEP, report-card comments, emails), the Raina chatbot, 50+ student tools with safe settings, an AI instructional coach.
- **Other:** Insight dashboards, district tool controls and moderation, Google and Microsoft exports, SIS/LMS and SSO, custom tools and co-branding.
- **Pricing:** Free; Plus USD 8.33 per month billed annually or USD 12.99 monthly; Enterprise by quote.
- **Offline:** No. **Languages:** 24 interface languages; Hindi is the only Indian one.
- **Standout:** Breadth of tools plus district guardrails.

#### Khan Academy Khanmigo
- **Region:** US non-profit. Free teacher tools in 180+ countries through Microsoft; launched in India in Hindi and English (November 2024).
- **AI features:** 26 free teacher tools (lesson plan, hook, objectives, exit ticket, MCQ, rubric, leveller, text chunking, report comments, newsletters, IEP and more); a Socratic student tutor; role-play with historical figures and literary characters; essay feedback and Writing Coach; Gemini-powered interactive diagrams students can drag; Practice My Knowledge question generation; moderation that flags unsafe chats to teachers, parents and admins; teachers can read and summarise student chats; class snapshot; focus mode.
- **Pricing:** Teacher tools free; learner plan historically USD 4 per month (US); districts pay.
- **Offline:** No. **Languages:** Hindi is one of four fully tested languages; 30+ experimental.
- **Standout:** The safety benchmark for classroom AI.

#### Wayground (formerly Quizizz)
- **Region:** Founded in Bengaluru; rebranded June 2025; used in 150+ countries.
- **AI features:** AI Generation Hub (one file to a quiz, slides and flashcards at once); presentation, question, worksheet and maths generators; lesson and unit plans; rubrics; questions at pause points in a video; flashcards; full AI grading with rubrics (school plan); AI data analysis.
- **Other:** Game or exam modes, live or self-paced; Paper Mode for classes without devices; exit tickets and homework; 40M+ resources; VoyageMath; 20+ accommodations including translation and read-aloud; Classroom Pulse; common assessments; Canvas, Schoology, Clever and ClassLink.
- **Pricing:** Basic free (100 students); School & District by quote. No INR price.
- **Offline:** No; Paper Mode covers classes without devices. **Languages:** AI translation; no Indian list.
- **Standout:** One file into many formats, with a free tier.

#### Kahoot!
- **Region:** Norway, global; private since 2024.
- **AI features:** AI Generator and AI formats (micro lessons, exit tickets, practice tests, presentations) from notes, documents, PDFs, web pages or topics; Kahoot! Assistant; a ChatGPT app; a public MCP server so other AI tools can create kahoots.
- **Other:** Classic, Accuracy, Confidence and Lecture modes; 11 question types (open-ended only for students 16+); Kahootopia and other game modes; a device-free mode (coming); self-paced challenges and flashcards; coding, maths and language apps; US standards alignment; WCAG 2.2 AA accessibility; LMS integrations.
- **Pricing:** Go free; Plus Bronze USD 3, Silver USD 7, Gold USD 12, One USD 19 per month (50 to 800 players); EDU by quote.
- **Offline:** No. **Languages:** 55+ content languages; no Hindi interface.
- **Standout:** The benchmark live game-show quiz.

#### Canva for Education
- **Region:** Australia, global. Free for K-12 teachers and students, including India (50M+ education users).
- **AI features:** Magic Write, Magic Animate, Magic Grab, Magic Switch, Magic Design, AI image generation, Canva Code, Translate (100+ languages), accessibility checker. Canva Shield: admin control of who uses AI, prompt screening, blocked terms, reporting, and no training on education data.
- **Other:** Infinite collaborative whiteboards with named sticky notes and a timer; real-time co-editing with teacher comments; Lesson Suite and 5,000+ free resources; 3D elements (unverified); LMS integrations (unverified).
- **Pricing:** Free for K-12.
- **Offline:** Not confirmed. **Languages:** Translate covers 100+ languages.
- **Standout:** A free, polished canvas with classroom-safe AI controls.

### 3.5 3D, sketch and content sources

#### Google AutoDraw / Quick, Draw!
- **Region:** Global (Google Creative Lab experiment); web app.
- **AI features:** As you draw, a suggestion row guesses the object and swaps your sketch for an artist's drawing (the "Did you mean" pattern).
- **Data:** Quick, Draw! dataset: 50 million drawings in 345 categories under CC BY 4.0 (commercial use allowed with attribution), including 28x28 bitmaps; a TensorFlow tutorial for training a drawing classifier; Sketch-RNN is open source. AutoDraw's own code and trained weights are not published.
- **Pricing:** Free. **Offline:** The web app needs internet, but the dataset can train an offline model.
- **Standout:** The origin of the sketch-to-icon bar, with open data we can train on.

#### BioDigital Human
- **Region:** US. An India listing through Wolters Kluwer exists (unverified).
- **Content:** 1,000+ anatomy, health and treatment models; 8,000+ selectable structures (a later review says 14,000+); dissection by layers; Quiz Builder (500+ 3D questions); Human Studio authoring; guided tours; AR/VR app and SDK; LMS embedding; Viewer API, Content API, iOS and Android SDKs.
- **Pricing:** Personal free (10 model views per month); School and Business plans by quote, metered by users, page views and published models. A third party cites "from USD 15 per student per year" (unverified).
- **Offline:** Not stated; viewing is streamed from the cloud. **Languages:** 8; no Indian language.
- **Standout:** Licensable, embeddable anatomy, but metered per view, which does not suit an offline board.

#### zSpace
- **Region:** US; sold in 50+ countries through resellers.
- **Products:** zSpace Imagine AR/VR laptops (no headset; eye-tracking camera and stylus); Inspire.
- **Software:** zSpace Studio (thousands of models; dissect, measure, annotate, cutting plane, rulers, explode), ScholarLab biology simulations, Imagine Learning Solution, Visible Body for zSpace; import of DAE and STL files.
- **Pricing:** Not public; sold as classroom pods and labs. **Offline, languages:** Not stated.
- **Standout:** Headset-free AR/VR for small groups.

#### Corinth (Lifeliqe)
- **Region:** Czech Republic (Prague), sold globally. One reviewer says Corinth and Lifeliqe are separate sister companies (not re-verified).
- **Content:** 1,500 to 1,600+ curriculum-mapped K-12 STEM 3D models; 120+ 360° videos; AR and VR modes; rotate, highlight and zoom to microscopic level; blind-map labelling quiz; lesson plans and QR codes to models.
- **AI features:** CoriAI: spoken or typed commands such as "rotate" or "zoom" that move the model and answer aloud.
- **Pricing:** Free Microsoft Store version with 5 models; school licences and white-label content licensing by quote (iFrame embeds under the partner's brand, aimed at hardware makers and platforms).
- **Offline:** Not stated. **Languages:** 40+.
- **Standout:** The one 3D library that explicitly licenses to hardware makers under their own brand.

#### Sketchfab (Epic Games / Fab)
- **Region:** Global.
- **Product:** An embeddable 3D/VR viewer, uploads in all major formats, a class showroom for student 3D work.
- **Licences:** Standard licence forbids redistribution and requires the app to stop users extracting the model; Editorial licence forbids commercial use. The store is closed and free licensing is being removed; only CC BY and Fab Standard models can move to Fab.
- **Pricing:** Education Pro USD 99 per year.
- **Standout:** Not a safe long-term source of free models.

#### Visible Body (Cengage)
- **Region:** US.
- **Content:** Full dissectible male and female 3D models with Dissect, Hide, Fade, Select Others and Isolate; AR mode; cross-sections; a gross-anatomy lab view; animations and tours; about 24,000 visual assets; quizzes and flashcards; courseware with progress tracking; screen-reader support and captions.
- **Pricing:** Student USD 34.99 per year (one device); Classroom/Professional USD 199 per year (one device, small-group display rights); Institutional by quote (unlimited lecture display). Human Anatomy Atlas app about USD 24.99 (third-party).
- **Offline:** Not stated. **Languages:** 7; no Indian language.
- **Standout:** Its licences separate personal use from classroom display; anything Zynetix projects needs display rights.

#### Open-licensed 3D sources (Z-Anatomy / BodyParts3D, Smithsonian, NIH 3D)
- **Z-Anatomy:** An open 3D anatomy atlas built on BodyParts3D, for Blender and Android. CC BY-SA 4.0: derivatives must use the same licence and credit BodyParts3D (DBCLS) and Z-Anatomy. Some parts are CC BY-NC-SA and cannot be used commercially.
- **Smithsonian Open Access:** 2,000+ 3D models (OBJ, glTF) under CC0, usable for any purpose without attribution. Items not marked CC0 need permission.
- **NIH 3D:** Downloads without an account; the licence varies by model (GLB, STL, X3D, WRL).
- **Pricing:** Free. **Offline:** Yes, models can be bundled where the licence allows.
- **Standout:** Free models we can ship offline, if we track licence and credit for each one.

## 4. Feature matrix

Each row is one feature. "Who has it" lists the competitors that offer it. Zynetix status, priority and effort use the legend at the top. Rows marked Have are not gaps; they are included to show where we already match the market.

### 4.1 Whiteboard and ink

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Infinite / endless canvas with auto-scroll | Teachmint X, Senses, EKIN, Tata ClassEdge, ViewSonic, Promethean, Clevertouch, BenQ, Hikvision, MAXHUB, Microsoft, Canva, Newline | Partial | P0 | M | Pages pan and zoom but keep a fixed 16:9 size. Add a per-page "endless" mode that grows near the edges, auto-scrolls when writing near the bottom (as Senses does) and skips off-screen strokes with a quadtree. PDF export tiles the used area into 16:9 sheets. |
| Canvas minimap / live overview | Hikvision | Missing | P2 | S | Corner thumbnail of the endless page with a draggable viewport; reuse the thumbnail painter in page_overview.dart. |
| Multi-file tabs (several lessons open at once) | ViewSonic | Missing | P2 | M | Tabs for open "Your whiteboards" items, each with its own pages and undo history. |
| Page navigator (1/N, +), page management, zoom % | Photo board (EKIN panel), ViewSonic, Hikvision, Teachmint X | Have | P0 | S | Page overview supports reorder, duplicate, delete and PDF export; the zoom % button exists. Check that "1/N +" and the % also show on the main bar. |
| Pen types: marker, brush, highlighter, laser, calligraphy, dashed/arrow nibs, two-sided pen | Teachmint X, EKIN, ViewSonic, Hikvision, Globus, Microsoft | Have | P0 | S | Colour, thickness, opacity, smoothing and pressure settings; front and back stylus tips each have their own action. |
| Fading / disappearing ink | SMART, Promethean, ViewSonic | Partial | P2 | S | We have a laser pointer. Add a "fading ink" nib that fades after 3 to 10 seconds. Promethean's Magic Ink matches our covered answers. |
| Pen, finger and palm told apart without switching modes | SMART, Promethean, Clevertouch, EKIN, Newline, MAXHUB, Hikvision, ViewSonic, Horion, Huawei IdeaHub | Have | P0 | S | Auto input mode uses touch-size thresholds; a palm or fist erases; the pen's back tip erases. |
| Pen ID / two pens with their own colours / dual-colour pen | SMART, MAXHUB, Samsung | Have | P1 | S | Two pens with their own colours; each tip can have its own action. |
| Several people writing at the same time | Teachmint X, EKIN, SMART, Boxlight/Mimio, Horion, Globus, Extramarks, Samsung, DeltaView | Have | P0 | S | Multi-touch setting. Test 2 to 4 simultaneous pens on 40-point IR frames. |
| Split writing zones (2 to 4 independent canvases) | Senses, Samsung, BenQ, Promethean, Clevertouch, Hikvision | Have | P1 | S | 2 to 4 zones, each with its own pen and eraser (zones.dart). |
| 2D and 3D shapes with measurements | Teachmint X, EKIN, ViewSonic, Hikvision, Globus | Have | P0 | S | 14 2D shapes with lengths, angles and area in cm, plus live 3D solids. Hikvision lists 36 2D and 11 3D shapes; a custom polygon tool (ViewSonic) is an easy add. |
| Shape recognition (freehand to clean shape) | SMART, Promethean, Clevertouch, ViewSonic, Hikvision, Microsoft, iFLYTEK, Seewo, EKIN, MAXHUB, Dahua, Cybernetyx | Have | P0 | S | Shape AI runs on the device. iFLYTEK also labels the centre and radius of a recognised circle; turn measurements on automatically for recognised circles. |
| Ink to table (draw a grid, get a table) | SMART, Microsoft | Missing | P2 | M | Detect a rectangle crossed by lines in ink_parser and offer "Make a table"; read any handwriting in the cells as cell text. |
| Handwriting to editable text (AI pen) | Teachmint X, Senses, EKIN, SMART, Promethean, Clevertouch, ViewSonic, BenQ, LG, Newline, Seewo, MAXHUB, Hikvision, Huawei IdeaHub, Boxlight/Mimio, Dahua, Cybernetyx, iFLYTEK | Have | P0 | S | English, Hindi and Kannada via ML Kit (Android) and Windows Ink. The gap is language count: ML Kit already has Tamil, Telugu, Bengali, Marathi, Gujarati, Malayalam, Punjabi, Odia and Urdu models. |
| Handwritten maths to typeset equations | Clevertouch, BenQ, SMART, Newline, Huawei IdeaHub, Seewo, Senses | Have | P0 | S | Runs in pure Dart on every platform. SMART lists this as coming in 2026. |
| Handwritten chemical formula recognition | Senses | Partial | P1 | M | A chemical-equation insert exists, but ink is not read as chemistry. Extend the maths parser with element symbols, subscripts, reaction arrows and state symbols. |
| Handwritten equation solving (OCR solver) | Teachmint X, Geneo, EKIN, BenQ, LG | Have | P0 | S | Select the ink, then Solve with the offline step-by-step solver. Make "Solve" a one-tap chip on every converted equation. |
| Chemistry equation balancing, step by step | Geneo | Missing | P2 | M | Offline balancer in the maths panel (solve the element-count matrix). |
| Circle a handwritten function to get a live graph | iFLYTEK, Seewo, LG | Partial | P1 | S | The graph plotter exists. When the AI pen converts "y = ...", add a "Plot it" chip that places a graph with that expression. |
| Handwriting prediction (completes words as you write) | LG | Missing | P2 | M | Combine the recogniser's top guesses with the offline dictionary (about 9,000 words) for a ghost completion. |
| Board-writing beautification that keeps the teacher's style | Seewo, iFLYTEK, Microsoft | Partial | P2 | L | We convert ink to fonts (Default, Kalam, Custom). Keeping each teacher's own style needs stroke synthesis; defer. The Microsoft source is unverified. |
| Writing-structure recognition / automatic outline | LG, Newline | Missing | P2 | M | Group recognised lines by indent, size and bullets into headings and lists, then offer "Make notes". |
| Signature recognition | LG | Missing | P2 | S | Only in LG's spec sheet and of no classroom use. Do not build. |
| Sketch-to-icon "Did you mean" suggestion bar | Photo board (EKIN panel), Globus, ViewSonic, LG, Promethean, Google AutoDraw, Senses, Dahua | Missing | P0 | M | Shown in the photos. ink_parser already tags sketches. Train a small CNN on Quick, Draw! (CC BY 4.0, 345 classes), ship as TFLite (Android) and ONNX (Windows) for offline use, map classes to a licensed icon set, show the bar above the toolbar with "Back to my ink". Add Indian classes (mango, rangoli, auto-rickshaw). |
| Sketch to AI-generated image or artwork | Geneo, BenQ, ViewSonic, Senses | Missing | P1 | M | Cloud image model behind the Node API, prompted with the recognised class and subject; child-safety filters; counts against the AI allowance. Separate from the offline icon bar. |
| Sketch to 3D model (sketched cube becomes a rotatable solid) | iFLYTEK | Missing | P1 | M | Teach Shape AI to recognise sketched cubes, cylinders, cones, spheres and prisms, then swap in the matching live solid with measurements. |
| 3D geometry: rotatable solids, nets, cross-sections | iFLYTEK, ViewSonic, Hikvision, Tata ClassEdge | Have | P1 | S | Live solids rotate, resize, take face colours and unfold into nets. Add a cross-section plane on board solids if teachers ask. |
| Fill tool for enclosed freehand areas | Clevertouch | Missing | P2 | S | Hit-test the tap against closed strokes and add a fill under the ink. |
| Draw straight along the ruler / snap to instruments | Clevertouch | Have | P2 | S | snapEdge and snapToTools in geo_tool.dart. |
| Geometry instruments (ruler, protractor, compass, set squares) | EKIN, Promethean, ViewSonic, Hikvision, MAXHUB, Senses, Extramarks, Newline, SMART | Have | P0 | S | Several at once, with calibration. |
| Dynamic geometry (GeoGebra-style constructions) | Senses, Seewo, SMART | Partial | P1 | M | JSXGraph is bundled; GeoGebra needs a commercial licence. Expose JSXGraph constructions (point, line, perpendicular, circle through points) as a board tool. |
| Backgrounds, subject themes and lesson templates | Teachmint X, SMART, Promethean, Microsoft, Hikvision, BenQ, ViewSonic, Newline, Clevertouch, EKIN | Have | P1 | S | Papers, subject accents, graph templates and organisers exist. Add planner, KWL and pros/cons templates. |
| Personal clipart and templates saved to the cloud | Promethean | Partial | P2 | S | Only a custom background and logo today. Add "Save selection as my sticker / template" synced to KINETIX Cloud. |
| Infinite cloner / drag a copy | Promethean, BenQ | Partial | P2 | S | Duplicate exists. Add a "clone on drag" toggle for counting games. |
| Long-press quick menu | ViewSonic | Missing | P2 | S | Long-press on empty canvas opens a radial menu (ruler, timer, paste, favourites). |
| Movable / floating toolbar | ViewSonic, Clevertouch | Have | P1 | S | Docks left, right or bottom, collapses, custom tool order. |
| Tables, flowcharts, sticky notes | Horion, Hikvision, EKIN, Microsoft, Canva | Have | P1 | S | Insert popover and editors. |
| Mind maps and diagram maker | Seewo, MAXHUB, Huawei IdeaHub, Educomp (historical) | Have | P1 | S | Radial mind maps and organisers. Turning hand-drawn bubbles into a mind map (Huawei) is a P2 extra. |
| AI organise sticky notes (suggest, cluster, summarise) | Microsoft, Canva | Missing | P2 | S | Send note texts to KINETIX AI, get groups and headings back, re-lay out the notes and add a summary. |
| Low-latency inking | Huawei IdeaHub, Samsung, LG, SMART, Dahua | Partial | P1 | M | Vendor figures (16 to 35 ms) depend on panel firmware. Measure our pen-to-pixel latency with a slow-motion camera, then try predicted strokes and front-buffered rendering. |
| Pressure-sensitive pen and eraser tips | SMART | Have | P2 | S | Active-stylus pressure and eraser end. |
| Prepare lessons at home and resume on any board | ViewSonic, MAXHUB, Seewo, Tata ClassEdge, Senses, Teachmint X | Partial | P1 | M | Cloud "Your whiteboards" exist. Add a prepare-at-home editor (Teacher App or web) that pins a board to a period, and "Continue where I left off" on any board. |
| Multi-finger gestures (5-finger blank, 3-finger menu) | EKIN, Globus | Partial | P2 | S | Two-finger undo, three-finger redo and touch lock exist. Add a five-finger hold to blank or freeze. |
| Camera hand-gesture control (change slides, freeze screen) | BenQ, Dahua, ViewSonic, Cybernetyx, MAXHUB | Missing | P2 | M | On-device hand landmarks (MediaPipe) from the panel camera; process frames only, store nothing. |
| Ad-hoc whiteboard page and draggable objects during a presentation | ClassPoint | Partial | P2 | S | A blank page can go between slides, but slides are flat images, so their elements cannot be dragged. |

### 4.2 AI assistant

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Ask-anything AI assistant on the board | Teachmint X, EKIN, BenQ, MAXHUB, LG, SMART, Newline, Hikvision, Senses, Hitevision, MagicSchool, Microsoft | Have | P0 | S | KINETIX AI Ask answers from the syllabus and cites sources (as EKIN and LG do). Offline it falls back to sample answers. |
| Natural-language voice assistant (wake word, spoken answers, opens tools) | Teachmint X, SMART, Newline, Hikvision, EKIN, Senses, Samsung, Cybernetyx, Hitevision, Corinth | Partial | P1 | M | Fixed on-device voice commands in 3 languages, plus spoken questions to AI Ask. Add an intent layer (LLM function calling online, keyword grammar offline), an optional wake word and spoken answers. |
| AI lesson plans (NEP-aligned, outcomes, Bloom's) | EKIN, Senses, Geneo, Extramarks, Seewo, Hitevision, iFLYTEK, Microsoft, MagicSchool, Khanmigo, Wayground, BenQ, Navneet TOPclass, Teachmint X | Have | P0 | S | Add NEP 2020 and Bloom's tags and a learning-outcomes field to match EKIN. |
| AI-generated whiteboard lessons (multi-page board content from a topic) | Teachmint X, Clevertouch, SMART, Microsoft, Nearpod, ViewSonic, Seewo, MAXHUB, Curipod | Partial | P0 | M | "Prepare lecture" returns an outline, board plan and activities as text. Map that JSON onto board elements across pages (titles, text, equations, library pictures, a quiz page). Offline, build pages from the Books topic. |
| Generate a slide deck / export to PPTX | Teachmint X, EKIN, MagicSchool, Canva, Navneet TOPclass, Google for Education, Wayground, ViewSonic | Missing | P1 | M | Export board pages to PPTX on the Node API (for example pptxgenjs). |
| Summarise imported PDFs and documents | Teachmint X, EKIN, Geneo, Microsoft, Google for Education | Partial | P1 | S | Summary AI reads board pages, but imported PDFs become images. Keep the PDF text layer on import and pass it to Summary AI and Quiz. |
| Video summaries, chapters and questions from videos | Teachmint X, EKIN, Geneo, Senses, LG, MAXHUB, Google for Education, Wayground | Missing | P1 | M | Start with KINETIX concept videos, where we own the transcripts. Pulling third-party YouTube transcripts raises terms-of-service issues. |
| Class recap after the lesson | Teachmint X, EKIN, Samsung, BenQ, Hikvision, Huawei IdeaHub, Seewo | Have | P0 | S | Summary AI builds a recap; End class publishes notes to students. |
| AI summary and quiz from the recorded lesson transcript | EKIN, Samsung, BenQ, Hikvision, Huawei IdeaHub, iFLYTEK | Partial | P1 | S | Captions already save a WebVTT transcript. Feed it with the board pages to Summary AI and Quiz, and attach the result to the shared recording. |
| Quiz generator (MCQ, true/false, fill in the blanks, short answer) | Teachmint X, Senses, EKIN, Geneo, SMART, Clevertouch, BenQ, Samsung, MAXHUB, ViewSonic, Microsoft, Nearpod, Wayground, Kahoot!, ClassPoint, Tata ClassEdge, Khanmigo, MagicSchool, Navneet TOPclass | Have | P0 | S | From a topic or a board scan, with past-paper tags and present or homework modes. |
| Quiz from any source (PDF, slide, URL, photo, voice); one file to quiz, slides and flashcards | Senses, ViewSonic, Clevertouch, Kahoot!, ClassPoint, Wayground, Microsoft | Partial | P1 | S | Add imported PDF text, the current slide, a safe-web page, a document-camera photo (OCR) and a spoken topic as sources. |
| Bloom's taxonomy level control and tags | EKIN, ClassPoint, Extramarks | Partial | P1 | S | Difficulty only today. Add a Bloom's selector, tag each item, report by level in ERP. |
| Homework, worksheet and exit-ticket generator | Teachmint X, Geneo, Navneet TOPclass, MagicSchool, Wayground, Khanmigo, Kahoot! | Have | P0 | S | Falls back from AI to offline notes, the question bank, then a template. |
| Rubric generator | Microsoft, MagicSchool, Khanmigo, Google for Education, Wayground | Missing | P2 | S | Better placed in the Teacher App. |
| Differentiate / level text / chunk text | Nearpod, Microsoft, MagicSchool, Khanmigo, Wayground | Partial | P2 | S | Simplify, Expand and Remedial help exist. Add "Rewrite for class N" and "Split into chunks". |
| Real-world examples and class-activity ideas | Khanmigo, Microsoft, MAXHUB, SMART, Clevertouch, MagicSchool, Extramarks | Have | P1 | S | Create example and Class activity actions. Could add a suggested duration and delivery mode, as Lumio does. |
| Class-level detection | Teachmint X | Have | P2 | S | The timetabled period sets class, board and subject. |
| Translate selected text | SMART, BenQ, EKIN, Senses, Extramarks, Canva, Teachmint X, Hikvision | Partial | P0 | M | Translate covers only English, Hindi and Kannada. Add an Indic translation model (IndicTrans2, open licence) or the Bhashini API for the 22 scheduled languages, with a subject glossary. |
| Circle / lasso to search anything on screen | BenQ, MAXHUB, Samsung, LG, Hikvision, ViewSonic | Partial | P1 | S | Lasso then Ask works on board content. Add Search and Explain for selected images (snapshot to a multimodal model), with results from Wikipedia, DIKSHA, the picture library and concept videos. |
| AI content suggestions and image/video search for the topic | EKIN, Senses, Globus, SMART, ViewSonic, Clevertouch | Partial | P1 | M | Videos are suggested each period. Add a Wikimedia Commons search filtered to reusable licences and an allow-listed YouTube search, ranked by the period's topic. |
| AI image generation | Clevertouch, Promethean, Google for Education, Canva, Extramarks, Senses, Seewo, Newline, Geneo | Missing | P1 | M | Cloud model through the Node API with prompt screening, blocked terms and a per-school allowance. For science diagrams, prefer the picture library; generated diagrams are often wrong. |
| AI diagram generation | Senses, Extramarks | Partial | P1 | M | "Create diagram" exists. Output editable flowchart or organiser elements, not a picture. |
| AI video generation | Google for Education | Missing | P2 | L | Too costly for a board. |
| Image tools: background remover, upscaling, style transfer | BenQ, Clevertouch, Promethean, Canva | Missing | P2 | S | ML Kit Subject Segmentation on Android for background removal. Skip style transfer. |
| Object / species identification (AI Lens) | BenQ, EKIN | Missing | P2 | M | On-device labels are generic; species ID needs a cloud model. |
| OCR of printed pages to editable text / document scanner | BenQ, EKIN, Promethean, Extramarks | Partial | P1 | S | Read board covers handwriting only. Add ML Kit Text Recognition v2 (Latin and Devanagari) to the document camera with a "Scan text" crop. |
| Chat with the teacher's own documents | Geneo, Google for Education, Microsoft | Partial | P1 | M | AI Ask uses the syllabus. Add retrieval over the PDFs imported for that class (vector index on the Node API). |
| AI-generated interactive diagrams and simulations | Khanmigo, Google for Education | Missing | P1 | M | Have the AI emit a graph-plotter, JSXGraph or number-line spec so students can drag points. We already render these. |
| Teacher admin writing (report comments, newsletters, certificates) | Seewo, MagicSchool, Khanmigo | Missing | P2 | S | Belongs in the Teacher App and ERP. |
| Student AI tutor / doubt bot | Extramarks, Khanmigo, MagicSchool, Google for Education, Microsoft, Embibe, Hitevision, LEAD | Missing | P2 | L | A Student App feature; needs moderation and a chat audit. |
| AI avatars: historical figures, teacher digital twin | iFLYTEK, Khanmigo | Missing | P2 | L | A role-play mode in AI Ask (for example "Ask Aryabhata") is cheap. A voice-cloned teacher twin carries consent and DPDP risk. |
| AI safety: moderation, prompt/output audit log, admin AI switch, age filters | Khanmigo, Canva, MagicSchool, SMART, LG, Extramarks, Kahoot! | Partial | P0 | M | Today AI needs a signed-in teacher and has a daily school allowance. Add input and output moderation, blocked terms, a per-school and per-feature switch in ERP, an audit log the principal can view, and a "no training on school data" statement. |
| Filter inappropriate content in student casts | BenQ | Missing | P2 | M | Casts come only from our apps and need the teacher's accept, so the risk is lower. Add an on-device classifier if needed. |
| AI inside third-party apps | Teachmint X | Missing | P2 | L | Depends on the annotate-over-any-app overlay. |
| On-device / offline generative AI | BenQ, Seewo, Promethean, Microsoft, Hitevision, Samsung | Partial | P1 | L | Offline AI today is 74 hand-written notes plus the solver. Option: a 1 to 3B model at 4-bit via llama.cpp or MediaPipe on panels with an NPU and 8 GB RAM. Hindi and Kannada quality needs testing. |
| Curriculum search engine | Senses, EKIN, Cybernetyx | Have | P1 | S | Ctrl+K search is typo-tolerant in three languages; Books is organised by syllabus. |
| Flashcards from content | Senses, Microsoft, Google for Education, Wayground, Kahoot!, ViewSonic, Visible Body | Partial | P1 | S | Word cards exist. Add AI flashcards from a topic or the board, a flip/practice mode and sending to the Student App. |
| Curriculum setup from a photo of the textbook index | Extramarks | Missing | P2 | S | OCR plus AI to map chapters to the ERP syllabus. |
| Generated audio lessons / podcast overviews | Google for Education | Missing | P2 | M | Text-to-speech over a Summary AI script; better in the Student App. |
| Self-study course creation | EKIN | Missing | P2 | M | Belongs in the Student App. |

### 4.3 Content library

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Curriculum textbooks on the board (NCERT, state boards) with offline download | Teachmint X, Senses, Navneet TOPclass, Embibe, Tata ClassEdge | Partial | P0 | M | Books shows KINETIX syllabus topics, not textbook pages, and needs the internet. Add official textbook PDFs by class and subject (NCERT via ePathshala, KTBS for Karnataka) after checking reuse terms; open as pages to write on; downloadable for offline use. |
| Ready-made editable lesson library (NCERT, CBSE, ICSE) | ViewSonic, Geneo, Nearpod, Promethean, Next Education, Extramarks, Embibe, SMART, Canva | Partial | P1 | L | We have Books topics and 74 offline notes; ViewSonic has 900+ lessons, Geneo 10,000+. Generate one board lesson per syllabus topic with AI, have subject teachers review, publish as templates. |
| Animated video library (2D/3D animations, real videos) | Next Education, Extramarks, Embibe, Educomp (historical), Navneet TOPclass, Hitevision, Tata ClassEdge | Partial | P1 | L | Concept videos on YouTube plus procedural animations. Embibe claims 40,000+ explainers; scale needs a content partner or a production pipeline. |
| Teacher / school shared lesson library | SMART, Nearpod, Seewo, Tata ClassEdge, Curipod, Canva | Partial | P1 | M | Boards can be shared with a section. Add a school library: publish as template, search by subject and class, copy to my boards. |
| Simulations (PhET and similar) | Senses, Clevertouch, Nearpod, Next Education, EKIN, Google for Education | Have | P0 | S | 51 PhET sims bundled, about 124 more downloadable, plus CircuitJS, JSXGraph and native sims, all offline. |
| Physics simulations with editable variables | EKIN | Have | P2 | S | Our native sims and PhET already let teachers change gravity, mass and length. EKIN's claim is a spec line, not a shipped product. |
| Virtual labs and experiments | Extramarks, Next Education, Embibe, Classteacher, Hitevision | Have | P1 | S | kinetix_labs runs offline in 3 languages. |
| Coding and robotics labs | Next Education, Kahoot!, Canva, Classteacher | Have | P2 | S | Blockly, code lab, CircuitVerse. No physical robotics kit. |
| Digital manipulatives (abacus, base-10 blocks, algebra tiles) | SMART, Newline, Nearpod, ViewSonic, Senses | Partial | P2 | S | Fraction bars, number line, counting and clock exist. Add abacus, base-10 blocks, algebra tiles and a geoboard. |
| Built-in smart tools: periodic table, calculator, dictionary, graph, maps | Teachmint X, Senses, Hikvision | Have | P0 | S | All covered; Hikvision also has a piano. |
| Chemistry molecule builder | Newline, Senses | Partial | P2 | M | Atom and 3D molecule models exist. Add a 2D molecule editor with a valency check that opens in 3D. |
| Safe YouTube search with annotation and saved frames | Senses, SMART, ViewSonic | Partial | P1 | S | Videos play in the privacy-enhanced embed and can be written on. Add search limited to allow-listed channels and "Save frame to board". |
| Play local video and audio files on the board | Teachmint X, BenQ, EKIN, Newline | Missing | P0 | S | Add a video/audio element (media_kit on Windows and Android) with play, pause, scrub, annotate-when-paused and offline playback from USB or storage. |
| Interactive video with embedded questions | Nearpod, Wayground, Senses | Missing | P1 | M | Pause points with MCQs in concept videos; students answer through Ask the class. |
| 360-degree videos and VR field trips | Nearpod, Corinth | Missing | P2 | M | An equirectangular viewer in the 3D panel. |
| Digital-citizenship lessons | Nearpod | Missing | P2 | M | Content work, not a feature. |
| Quick ready-made activities (bell ringers, brain breaks) | Curipod, SMART | Partial | P2 | S | Add a small bank of activity cards. |
| Embedded external content (live web page on the canvas) | SMART, Boxlight/Mimio, ViewSonic | Partial | P2 | S | Safe web places a picture or link, not a live embed. |
| Gamified concept content and an apps area | Globus, Extramarks | Partial | P2 | M | The sim hub and primary activities cover part of this. |
| Standards / syllabus tagging of content | Google for Education, Kahoot!, Wayground, Curipod, Navneet TOPclass | Have | P1 | S | Linked to the syllabus through ERP; rivals' tagging is mostly US-only. |
| Entrance-exam and Olympiad practice banks (JEE, NEET) | Embibe, Google for Education, Navneet TOPclass | Partial | P2 | L | Quiz items carry past-paper frequency. Dedicated banks need content licensing. |

### 4.4 3D, AR and VR

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 3D model library browser with subject, topic and class filters | Teachmint X, Photo board (EKIN panel), Senses, EKIN, Geneo, Embibe, Corinth, Nearpod, Microsoft, BioDigital, Visible Body, zSpace, Tata ClassEdge | Have | P0 | S | catalogue_browser filters in three languages. |
| Large 3D catalogue (1,000+ curriculum models) | Senses, Embibe, Corinth, BioDigital, zSpace, Visible Body | Partial | P0 | L | About 46 bundled, 12 downloadable, plus procedural models; Senses claims 5,000+, Embibe 70,000+. Options: license Corinth (white-label; confirm offline bundling), BioDigital (cloud, metered), Visible Body (needs display licence) or open sources (Smithsonian CC0, NIH 3D, Z-Anatomy CC BY-SA). |
| Anatomy set as photographed (skeletal, muscular I and II, brain, diaphragm, digestive, heart, urinary) | Photo board (EKIN panel), BioDigital, Visible Body, zSpace, Open 3D sources | Partial | P0 | M | We have skeleton, skull, brain, heart, lungs, kidney, digestive and excretory. No muscular system or stand-alone diaphragm. Z-Anatomy (CC BY-SA 4.0) covers muscles; exclude its non-commercial parts. |
| Download state badges on model tiles | Photo board (EKIN panel) | Partial | P0 | S | 12 models download, but no state is shown. Add a "Ready" tick or download icon with size, plus "Download all for offline". |
| Request a 3D model | Photo board (EKIN panel) | Missing | P0 | S | Form (model, subject, class, note) posting to the Node API; requests with votes in ERP; teacher notified when added. |
| 3D viewer: rotate, move, zoom, select, isolate, hide, reset | Photo board (EKIN panel), Visible Body, BioDigital, Senses, zSpace, Corinth | Have | P0 | S | Isolate is "Show only this"; Reset is "Start again". |
| Recenter button | Photo board (EKIN panel) | Partial | P0 | S | Views and "Start again" exist. Add a button that re-frames the visible parts without undoing hide or isolate. |
| Parts list side panel | Photo board (EKIN panel), BioDigital, Visible Body | Have | P0 | S | Parts tab with Hide/Show and "Show all parts". |
| Fade (x-ray) and "select others" | Visible Body | Partial | P1 | S | Add per-part transparency and a "hide all others" inverse. |
| Explode, cutting plane, cross-sections | zSpace, Visible Body, iFLYTEK | Have | P1 | S | "Take apart" plus cut modes (half, wedge, slab, depth sweep, peel). |
| Measure on 3D models | zSpace | Missing | P2 | M | Point-to-point distance using real-world scale data. |
| Annotate and label 3D models | Senses, SMART, zSpace | Have | P1 | S | Pin notes, draw on the surface, label modes. |
| Animated 3D models | Senses, SMART, Microsoft | Have | P1 | S | Steps, play/pause, 0.25 to 3x speed, read-aloud captions. |
| Guided 3D tours | BioDigital, Visible Body | Have | P2 | S | Narrated 3D scenes. |
| 3D labelling quiz (name this part) | BioDigital, Corinth, Visible Body | Missing | P1 | M | Hide labels, highlight a part, students answer by app or card; names from catalogue data. |
| Voice control of 3D models | Corinth | Missing | P2 | S | Add "rotate", "zoom", "show only the heart" to voice commands. |
| Import your own 3D files (GLB, OBJ, STL, DAE, FBX) | zSpace, SMART, Sketchfab, BenQ | Partial | P2 | S | Models load only from servers. Allow GLB/glTF from the device; convert OBJ, STL and FBX on the Node API. |
| AR view on phones and tablets | LEAD, Visible Body, Corinth, BioDigital, Embibe, EKIN | Missing | P2 | M | Fits the Teacher and Student apps: open our GLB files in ARCore Scene Viewer or iOS Quick Look. |
| VR mode and headsets | Corinth, BioDigital, Classteacher, Nearpod | Missing | P2 | L | Low value for a wall board in Indian classrooms. |
| Glasses-free 3D hardware | zSpace, Hitevision | Missing | P2 | L | Hardware, not an app feature. |
| Licensed white-label 3D content via embed or API | Corinth, BioDigital, Sketchfab | Missing | P1 | M | A sourcing decision (decision 3). Sketchfab's free licensing is being removed. |

### 4.5 Assessment and engagement

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Live polls (A to D, true/false, number, word cloud) | Teachmint X, EKIN, ViewSonic, Promethean, Newline, Boxlight/Mimio, Geneo, Curipod, Kahoot!, ClassPoint | Have | P0 | S | Ask the class via the Student App or scanned cards. |
| One-tap "Live Quiz" button in the top bar | Photo board (EKIN panel), Teachmint X | Partial | P0 | S | Quiz present mode and Ask the class sit inside panels. Add a top-bar shortcut that opens quiz setup with the current topic. |
| Game-show quiz with points, leaderboard, podium and speed races | Kahoot!, Wayground, SMART, Extramarks, ClassPoint, Boxlight/Mimio, ViewSonic, Nearpod, MAXHUB, Teachmint X | Partial | P0 | M | Teams, scoreboard, buzzers and badges exist, but no points or leaderboard. Score correctness plus speed from Student App timestamps; leaderboard and podium on the board; accuracy-only scores for scanned cards; team mode. |
| Handheld student clickers (no internet) | Teachmint X, Educomp (historical), Boxlight/Mimio, Promethean | Partial | P1 | L | Scanned answer cards already work with no devices or internet. Clicker hardware needs a partner; a USB-hub clicker could be read by the board app (decision 12). |
| Device-free participation (answer cards, paper mode) | Kahoot!, Wayground, Extramarks | Have | P0 | S | Plickers-style cards with unknown cards flagged. |
| Exit tickets | SMART, Microsoft, Curipod, Wayground, Khanmigo, Kahoot! | Have | P1 | S | Results go to the ERP class record. |
| More response types (short text, drawing, photo/audio/video, ordering, slider, pin on image) | ClassPoint, ViewSonic, Nearpod, Curipod, Kahoot!, Boxlight/Mimio | Partial | P1 | M | Today: A to D, true/false, number, word cloud. Add the rest in the Student App with a thumbnail wall on the board. |
| Individual student boards / live handouts with thumbnails | Newline, SMART, ViewSonic, Nearpod, BenQ, Boxlight/Mimio, Promethean | Missing | P1 | L | One Student App canvas per student over Socket.IO; teacher sees a live grid, pushes one to the board, saves to ERP. |
| Students send photos, media and notes to the board | ViewSonic, SMART, Nearpod, Huawei IdeaHub, Seewo | Partial | P1 | S | Teacher's phone and Student App cast exist. Add a moderated "post to board" queue from the Student App. |
| Live Q&A / student question queue | ClassPoint, EKIN, Geneo | Missing | P2 | S | Anonymous question queue; teacher picks one to show. |
| Students signal "slow down" / "done" | Newline | Missing | P2 | S | Student App button with a counter on the board. |
| Confidence rating on answers | Kahoot! | Missing | P2 | S | Sure/unsure toggle on answers. |
| Classroom toolkit: picker, timers, stopwatch, dice, spinner, scoreboard, groups | SMART, Promethean, BenQ, ViewSonic, ClassPoint, Extramarks, Hikvision, MAXHUB, Newline | Have | P0 | S | Fuller than most rivals; picker answers saved to student profiles. |
| Noise monitor and widget wall | SMART | Have | P2 | S | Noise meter and toolkit mini mode. |
| Revealer, spotlight, screen shade, magnifier | Promethean, BenQ, ClassPoint, EKIN, ViewSonic, SMART | Have | P1 | S | Covered answers, screen shade, spotlight, magnifier. |
| Gamification: badges, stars, levels | ClassPoint, Boxlight/Mimio, Kahoot! | Have | P1 | S | Badges and stars exist; add levels once points ship. |
| Attention grabber (multi-finger tap shows a sign with sound) | LG | Missing | P2 | S | Full-screen overlay plus chime. |
| Camera AI: random pick, headcount, gesture polls (on device, anonymous) | MAXHUB | Missing | P2 | M | Only if faces are never identified and frames never stored; still needs a DPDP notice. |
| Classroom game templates (sort, match, crossword, memory, label) | MAXHUB, SMART, Promethean, Newline, Seewo, Boxlight/Mimio, Nearpod, Clevertouch | Partial | P1 | M | A matching game exists for primary only. Build 4 or 5 general templates filled by AI or the question bank. |
| AI scoring of handwritten / subjective answer sheets | Extramarks, iFLYTEK, Geneo, ViewSonic, Wayground, Navneet TOPclass, Hitevision | Missing | P1 | L | Scan with the document camera or a phone, read handwriting, score against a rubric with an LLM, teacher override, marks to ERP. Hindi and Kannada handwriting accuracy is the risk. |
| Live AI writing feedback with rubric scoring | Curipod, Google for Education, MagicSchool, Khanmigo | Missing | P2 | M | Score Student App short answers with "glow and grow" comments; block pasting. |
| Print personalised papers and scan answer sheets | Extramarks | Partial | P2 | M | Cards and worksheets exist; scan grading follows from AI scoring. |
| AI review of student work under the document camera | Seewo | Missing | P2 | L | Depends on OCR and AI scoring. |
| Adaptive practice and AI mistake notebook | Senses, Geneo, Hitevision, LEAD, Embibe, Khanmigo, Seewo | Missing | P2 | L | Student App feature; the board only launches it. |
| Question variants and objective-to-subjective conversion | Extramarks | Missing | P2 | S | Extra AI action in quiz review. |
| Student-paced / asynchronous activities | SMART, Nearpod, Kahoot! | Partial | P2 | S | Homework covers this; allow sending a quiz as self-paced. |
| Question-paper generator with templates and Word/PDF export | Navneet TOPclass, Extramarks, Senses, iFLYTEK, Hitevision | Missing | P1 | M | Teacher App or ERP: blueprint by chapter and marks, 2 or 3 templates per board. Navneet has 60+. |
| Auto-graded results and class correct-answer rate | ClassPoint, Samsung, Extramarks | Have | P1 | S | Live tally plus results in ERP. |

### 4.6 Live and hybrid class

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Live class streaming to remote students (video, board, audio) | Teachmint X, Photo board (EKIN panel), ViewSonic, EKIN, Extramarks, Geneo, Next Education, Boxlight/Mimio, iFLYTEK | Partial | P0 | L | Go live sends ink frames and one-way audio. Add a WebRTC media server (LiveKit or mediasoup, or an India-region provider) for board, teacher camera and audio; keep the ink stream as a low-bandwidth fallback; add remote attendance and recording. |
| Two-way video, control of remote students, live chat | EKIN, Boxlight/Mimio, ViewSonic, Geneo, Huawei IdeaHub | Missing | P1 | L | Raise hand, teacher unmutes one student, chat in the Student App, on the same media server. |
| Zoom / Meet / Teams on the board | EKIN, Newline, Clevertouch, SMART | Missing | P2 | M | Launch installed apps by intent on Android; native on a Windows OPS. |
| AI camera auto-framing and speaker tracking | Senses, Globus, Promethean, ViewSonic, MAXHUB, Hikvision, Newline, Horion, Dahua, Huawei IdeaHub, Hitevision, Samsung, EKIN | Missing | P2 | M | Hardware-dependent. Software fallback: on-device face detection and a digital crop, no identification. |
| Mic-array noise suppression and voice enhancement | Senses, SMART, Promethean, MAXHUB, Huawei IdeaHub, LG, Newline, Dahua | Missing | P2 | M | Apply WebRTC audio processing (noise suppression, gain, echo cancellation) to class audio and recordings. |
| Face-recognition attendance | Senses, Extramarks, MAXHUB, Cybernetyx | Missing | P2 | L | Children's biometric data needs verifiable parental consent under the DPDP Act; one-tap attendance exists. Do not build for India. |
| Emotion, attention and behaviour monitoring | Extramarks, Hitevision, Cybernetyx, Promethean, Seewo | Missing | P2 | L | DPDP Act section 9 bars tracking and behavioural monitoring of children. Do not build for India. |
| Live camera feed on the canvas | ViewSonic, BenQ | Have | P2 | S | The document camera adds a live feed. |
| Document camera / visualiser, including a phone as camera | EKIN, Hitevision, Seewo, Google for Education, Clevertouch, Newline | Have | P1 | S | Add a live phone-camera stream from the Teacher App; today it sends stills. |
| Attendance from the board | Teachmint X, EKIN, Extramarks | Have | P0 | S | One tap, offline outbox. |
| Broadcast the board to student devices | SMART, Newline, Google for Education, ViewSonic, Hikvision, Samsung, MAXHUB | Have | P1 | S | Go live to the Student App. |
| Students follow the live lesson with private notes | MAXHUB | Partial | P1 | M | Add a private ink layer over the live board in the Student App. |
| Reteach or reassign lessons across sections | SMART | Partial | P2 | S | Boards are saved per class and shareable. |
| Two-teacher / remote specialist teacher model | iFLYTEK, BYJU'S (historical) | Missing | P2 | L | Historical benchmark only. |
| Leaders' live classroom view (board, camera, audio) | Teachmint X, Seewo, Hitevision | Partial | P2 | M | Board-only view with "Being viewed" and an audit log. Camera and microphone viewing is a DPDP and staff-privacy risk; keep it board-only. |

### 4.7 Recording and lecture capture

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Screen recording as video (board, panels, other apps) | Teachmint X, Photo board (EKIN panel), Globus, Extramarks, Senses, Promethean, Clevertouch, ViewSonic, BenQ, MAXHUB, Hitevision, Google for Education | Partial | P0 | M | We record ink events and voice, not pixels, so 3D, sims and other apps are lost and there is no MP4. Add server-side MP4 rendering (ffmpeg) and optional pixel capture (Android MediaProjection, Windows Graphics Capture). |
| Share recordings with absent students | Clevertouch, Extramarks, Teachmint X | Have | P0 | S | Background upload; absent students notified. |
| Live captions / speech-to-text transcription | EKIN, Samsung, BenQ, Hikvision, Newline, LG, MAXHUB, Boxlight/Mimio, ViewSonic | Have | P1 | S | On-device in 3 languages; saved as WebVTT. |
| Live translated captions | LG, MAXHUB, Boxlight/Mimio, Huawei IdeaHub, Google for Education, Extramarks, Wayground | Missing | P1 | M | Pass captions through IndicTrans2 or Bhashini for a second line, for example Kannada speech with English subtitles. |
| Auto chapters and micro-lessons from recordings | Seewo, iFLYTEK | Partial | P1 | M | Manual chapters exist. Add automatic chapters at page changes and topic shifts, and 3 to 5 minute clips per concept. |
| Micro-lecture recording | Seewo, Promethean, Hitevision | Have | P2 | S | Covered by lesson recording. |

### 4.8 Collaboration and casting

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Wireless screen share from any laptop or phone, up to 9 tiles | Teachmint X, Senses, EKIN, Globus, Promethean, Clevertouch, ViewSonic, BenQ, Samsung, LG, Newline, MAXHUB, Hikvision, Huawei IdeaHub, Horion, Dahua, Geneo, Cybernetyx, Boxlight/Mimio | Partial | P0 | M | Only our Teacher and Student apps can cast, up to 4 tiles. Add sending from any laptop's Chrome (open a code page; WebRTC screen capture), as LG does without an app, and raise to 9 tiles with moderator approval. AirPlay, Miracast and Chromecast receivers need OEM firmware or licensing. |
| Touch-back (control the connected laptop from the board) | Clevertouch, BenQ, Promethean, Hikvision, MAXHUB | Missing | P2 | L | Needs a sender agent on the laptop that injects input. |
| Casting with no network (hotspot / Wi-Fi Direct) | Clevertouch, Huawei IdeaHub | Missing | P1 | M | The board starts a hotspot and serves WebRTC signalling from its local server, so casting survives internet outages. |
| Share the lesson by QR code, WhatsApp or email | Teachmint X, Senses, Globus, Dahua, Hikvision, Huawei IdeaHub, ViewSonic, Geneo, LG, ClassPoint | Have | P0 | S | Branded PDF, 30-day link, QR, WhatsApp, email. |
| Split screen / multi-window (browser beside the board) | Teachmint X, Globus, Samsung, BenQ, LG, Promethean, Senses | Have | P1 | S | Split panel (30 to 60% or full width) with "Add to board". |
| Picture-in-picture of HDMI inputs and input switching | LG, Promethean | Missing | P2 | M | OS or firmware level; depends on the partner. |
| Several displays in one room (compare 4 screens, blank or wake displays) | Hikvision | Partial | P2 | S | Four cast tiles side by side; the projector screen can be blanked. |
| Second-screen output (HDMI out) | BenQ, Hikvision | Have | P2 | S | Projector mode hides the teacher's tools. |
| Real-time remote co-authoring of one board (live cursors, host permissions, read-only) | Microsoft, BenQ, EKIN, Promethean, Horion, Canva, Newline | Missing | P1 | L | A shared document model (Yjs-style) over Socket.IO, with the host granting write access per user and a read-only mode. |
| Phone as presenter remote; Bluetooth presenter clickers | Seewo, Hitevision, ViewSonic, Newline, Huawei IdeaHub, Promethean | Have | P1 | S | Phone remote exists. Also map Bluetooth presenter keys (page up/down) to page and slide navigation. |
| Teacher sign-in by QR code; NFC card tap | Clevertouch, BenQ, Samsung, Newline, Dahua, Hikvision, LG, SMART, ViewSonic, Senses | Partial | P2 | S | QR, 6-digit code and PIN switching exist. Add NFC card tap on panels with NFC, bound to the teacher in ERP. |
| Personal profiles that follow the teacher to any board | Samsung, BenQ, Clevertouch, Horion | Have | P1 | S | Each teacher's board and language are kept. Check that settings sync across boards. |
| Co-teaching on one board | Nearpod | Partial | P2 | S | Switch teacher by PIN; no simultaneous co-host. |
| Low-cost Smart TV plus teacher tablet setup | LEAD | Partial | P1 | M | Phone layout and projector mode exist. An Android TV build with the Teacher App as the pen surface would match LEAD's price point. |
| Web version of the board (Chromebook / any browser) | Newline, Promethean, BenQ, Seewo, Microsoft, Canva | Missing | P2 | L | Flutter web build; ML Kit, kiosk and camera need web fallbacks. |
| Teacher monitoring of student devices | Classteacher | Missing | P2 | L | A 2016 feature with unknown status; DPDP-sensitive. |

### 4.9 Annotation and file support

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Annotate over any app (system-wide floating pen) | EKIN, SMART, Promethean, BenQ, Samsung, Horion, Globus, ViewSonic, Google for Education, ClassPoint | Missing | P0 | L | Android: an overlay window (SYSTEM_ALERT_WINDOW) with a Flutter ink layer and a pass-through toggle, plus a MediaProjection screenshot for "Add to board". Windows: a transparent topmost window with click-through. Must work with kiosk mode and allow-listed apps. |
| Annotate over live video | Senses, Extramarks | Partial | P1 | S | "Write on the panel" works over videos. Add pause-and-annotate and save the frame. |
| Screen capture / snipping tool to the board | Promethean, EKIN, ViewSonic, BenQ | Partial | P1 | S | Board screenshot and "Add to board" exist. Add a free-form or rectangle snip of the current view. |
| PDF import and annotation | Teachmint X, Senses, Promethean, SMART, ViewSonic, BenQ, Hikvision, MAXHUB, Boxlight/Mimio | Have | P0 | S | Rendered offline; each page becomes a board page. |
| PowerPoint import and presenter mode | EKIN, SMART, Promethean, ViewSonic, BenQ, MAXHUB, Boxlight/Mimio, Clevertouch | Have | P0 | S | .pptx only; old .ppt not supported. |
| Word, Excel and old .ppt import | EKIN, BenQ, Teachmint X | Missing | P1 | M | Convert to PDF on the Node API with headless LibreOffice, then import. Offline needs a local converter (a Windows OPS can use installed Office). |
| Google Slides import | SMART, ViewSonic | Missing | P2 | S | Needs Google sign-in through the Teacher App. |
| Import other boards' lesson files (SMART Notebook, flipchart, IWB, .ink, .olf) | Clevertouch, SMART, BenQ, ViewSonic, Boxlight/Mimio | Missing | P2 | M | IWB and .notebook are zipped XML/SVG; a server converter helps schools switching boards. |
| Export to PDF, images, PPTX, IWB; print | ViewSonic, BenQ, ClassPoint, Globus | Partial | P2 | S | PDF and PNG exist. Add PPTX export and printing. |
| Embedded safe browser | EKIN, SMART, ViewSonic, LG, BenQ | Have | P1 | S | Institution allow-list with "Add to board". |
| File manager (local, USB and cloud in one place) | Hikvision, SMART, Huawei IdeaHub | Partial | P2 | S | Device files import; no unified browser. |
| Presenter notes visible only to the teacher | Nearpod | Partial | P2 | S | The projector view hides tools; show lesson-plan notes on the teacher's screen only. |
| PDF to individual student workbooks | Newline | Missing | P2 | M | Depends on individual student boards. |

### 4.10 Integrations

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| School ecosystem (ERP, teacher, student and parent apps) | Teachmint X, Next Education, Navneet TOPclass, Seewo, Hitevision, iFLYTEK, Tata ClassEdge | Have | P0 | S | A core strength: KINETIX ERP and the Teacher, Student and Parent apps. |
| Google EDLA certified panel (Play Store, Drive, Meet) | Teachmint X, Senses, SMART, Promethean, Clevertouch, ViewSonic, BenQ, Samsung, LG, Newline, MAXHUB, Horion, Dahua, Hikvision | Missing | P1 | L | Certification belongs to the panel maker. Run Zynetix on an EDLA panel and publish on Google Play. |
| Cloud drives (Google Drive, OneDrive, Dropbox, Box) | SMART, Clevertouch, ViewSonic, LG, Hikvision, BenQ, Samsung, Newline, Boxlight/Mimio | Missing | P1 | M | Sign in on the Teacher App and hand off to the board by QR, so no password is typed on the board. Then import files and save boards. |
| Google Classroom / Microsoft 365 / Teams / OneNote | SMART, Clevertouch, Newline, ViewSonic, Nearpod, Kahoot!, Hikvision, Microsoft, Google for Education | Missing | P2 | M | Most Indian schools use their own ERP. |
| LMS via LTI (Moodle, Canvas) | SMART, Boxlight/Mimio, Google for Education, Nearpod, Wayground, MagicSchool, Kahoot!, Khanmigo | Missing | P2 | M | Relevant for colleges, which mostly use Moodle. |
| SSO (Google, Microsoft, ClassLink, Clever) | ViewSonic, BenQ, Newline, Curipod, MagicSchool, Clevertouch, SMART | Missing | P2 | M | KINETIX accounts with QR sign-in cover most needs. |
| Public API, webhooks, MCP server / ChatGPT app | ClassPoint, ViewSonic, Hitevision, Kahoot! | Partial | P2 | M | The KINETIX Cloud API is internal only. |
| Emergency alert integrations (CAP, InformaCast) | Samsung, Newline | Partial | P2 | S | Principal broadcasts include an emergency takeover. Add a CAP or webhook intake. |
| Digital signage / welcome screen when idle | Newline, Clevertouch, Hikvision, MAXHUB | Partial | P2 | M | Add idle-screen notices, the timetable and festival templates from ERP. |
| PowerPoint / Word add-in | ClassPoint, Corinth | Missing | P2 | M | Optional quiz add-in for teachers who present from PowerPoint. |
| Room booking | Clevertouch | Missing | P2 | S | Belongs in ERP. |

### 4.11 Device and fleet management

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Central device monitoring, health, remote lock, restart and messages | Teachmint X, Senses, SMART, Promethean, Clevertouch, ViewSonic, BenQ, Samsung, LG, Newline, MAXHUB, Hikvision, Seewo, Hitevision, Dahua, Horion | Have | P0 | S | IT console: lock/unlock, message, kiosk policy, restart, rename/move, unpair; health reports. |
| OTA app updates with schedules and staged rollout | SMART, Promethean, Clevertouch, ViewSonic, BenQ, Hikvision, Newline, Horion, Senses, Dahua | Missing | P0 | M | Windows: MSIX with .appinstaller auto-update or updates pushed by the fleet agent. Android: device-owner PackageInstaller from an APK hosted by ERP. Add rings (pilot, then all), an update window and rollback. |
| Remote screen view and control for IT | Clevertouch, ViewSonic, BenQ, Seewo | Missing | P2 | L | On-demand WebRTC capture with an on-screen indicator and audit log, reusing the cast code. |
| Power on/off schedules and energy saving | Clevertouch, ViewSonic, BenQ, LG, Hikvision, Newline | Missing | P1 | M | Screen-off and sleep via device owner or Windows power APIs. True power-on needs the panel maker's RS-232 or firmware API, or Wake-on-LAN. |
| App push, app and website allow/block lists | Clevertouch, Teachmint X, BenQ, Seewo, Hikvision, Newline | Partial | P1 | M | Kiosk locks to our app; the safe-web list comes from ERP. Add allow-listed external apps in kiosk and pushed APK installs. |
| Remote wipe, anti-theft, USB lock, auto-clear files | Clevertouch, LG, Globus | Partial | P2 | S | Full lock, clear PIN profiles and unpair exist. |
| Usage analytics across branches | Teachmint X, Senses, BenQ, ViewSonic, Tata ClassEdge, Hikvision | Partial | P1 | M | Health reports and sessions per class exist. Send feature-usage events to ERP for a branch dashboard. |
| LAN-only / on-premises management server | Teachmint X, BenQ, Samsung | Missing | P1 | L | A self-hosted KINETIX server (Docker) for schools with poor internet or data-location rules. |
| Bulk enrolment, Wi-Fi push, device groups and tags | ViewSonic, Newline, SMART, Samsung, Promethean | Partial | P2 | S | Code enrolment and rename/move exist. |
| Gesture-based eye test | Hikvision | Missing | P2 | S | Single unverified source; low value. |
| Backup and restore-on-reboot | ViewSonic, Seewo | Partial | P2 | S | Autosave and "Set up again" exist. |

### 4.12 Language and accessibility

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Indian languages beyond English, Hindi and Kannada (interface, handwriting, voice, AI) | Teachmint X, Senses, Embibe, Next Education, Google for Education, Microsoft, Navneet TOPclass, Extramarks, Photo board (EKIN panel) | Partial | P0 | L | The photographed board lists English, Hindi, Arabic, Bengali, Marathi, Kannada, Tamil and Telugu. Add Tamil, Telugu, Marathi, Bengali, Gujarati and Malayalam first (string files, ML Kit ink models, Android speech packs); set AI answer language through the LLM; check text-to-speech voices per device. |
| Read aloud | SMART, BenQ, EKIN, Senses, LG, Newline, Khanmigo, Curipod, Kahoot!, Wayground | Have | P1 | S | Device text-to-speech. |
| Immersive reader and tinted overlays | ViewSonic, Boxlight/Mimio, Microsoft, Wayground | Have | P1 | S | Paper, cream, high-contrast and blue-tint themes; line focus. |
| Screen reader, keyboard navigation, alt text, dyslexia font, extended time | Kahoot!, Wayground, SMART, Visible Body, Canva, Promethean | Partial | P2 | M | Audit Flutter semantics labels, add an OpenDyslexic option, generate AI alt text for pictures. |
| Eye care: low blue light, flicker-free, dimming | Teachmint X, Globus, Clevertouch, BenQ, LG, MAXHUB, Hikvision, Huawei IdeaHub, Newline, Hitevision | Have | P1 | S | Software warmth, dimming and schedule. Flicker-free and TÜV certificates are hardware. |
| Auto-brightness from the light sensor | Promethean, LG | Partial | P2 | S | Today it follows the school day, not a sensor. |
| Low-reach mode for young children / height-adjustable stand | Newline | Partial | P1 | S | The toolbar moves. Add a "Low reach" mode that keeps toolbars and popovers in the lower third. |
| Reading and spoken-English coach with pronunciation feedback | LEAD, Hitevision, iFLYTEK, Google for Education, Microsoft | Missing | P1 | M | Read-along on the board: highlight words as the class reads and score fluency with on-device speech recognition. English first, then Hindi and Kannada. |
| Physical stamps recognised on the screen | SMART | Missing | P2 | L | Needs hardware. |

### 4.13 Offline capability

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Offline-first whiteboard, tools and content | Navneet TOPclass, Geneo, Dahua, ViewSonic, Embibe | Have | P0 | S | Our main differentiator. |
| Low-bandwidth live teaching | EKIN, Boxlight/Mimio | Have | P1 | S | The ink-frame stream is far smaller than video. |

### 4.14 Hardware

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Interactive panel hardware bundle (65 to 98", 4K, 40 to 60 touch, NPU, camera, mics, NFC) | Teachmint X, Senses, EKIN, Globus, Geneo, SMART, Promethean, Clevertouch, ViewSonic, BenQ, Samsung, LG, Newline, MAXHUB, Hikvision, Huawei IdeaHub, Dahua, Horion, DeltaView, Classteacher, Cybernetyx | Missing | P0 | L | We are software only; Indian rivals sell panel plus software at Rs 1.2 to 2.6 lakh. Needs a hardware partner (decision 6). |
| Room sensors (air quality, temperature) | SMART, BenQ | Missing | P2 | M | Only if the partner panel exposes sensors. |
| Smart blackboard / dual-board form factor | iFLYTEK, Hitevision, Seewo | Missing | P2 | L | Hardware. |
| Smart lectern, podium, video wall | Horion, Classteacher, Seewo | Missing | P2 | L | Hardware. |
| Any-surface interactive projector / IR touch frame | Cybernetyx, Educomp (historical) | Have | P2 | S | IR touch frame is a supported surface type. |
| Antimicrobial glass and hygienic pens | BenQ, Clevertouch, Newline, MAXHUB | Missing | P2 | L | Hardware. |

### 4.15 Analytics and admin

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| Student progress reports and dashboards | Teachmint X, Geneo, Hitevision, Extramarks, Nearpod, ViewSonic, Wayground, Kahoot!, Microsoft, Khanmigo, Embibe | Partial | P1 | M | Exit tickets and picker answers flow to ERP. Build dashboards in ERP and show a class snapshot on the board before each period. |
| AI teaching-practice analytics (talk time, questions asked, structure) | Seewo, iFLYTEK, Hitevision, Tata ClassEdge | Missing | P2 | L | From the teacher's own recording transcript, visible only to that teacher unless shared; no student data. |
| AI teacher training and coaching | Seewo, MagicSchool | Partial | P2 | M | Guided tour, practice board and training booking exist. |
| Student growth profile and error-cause analysis | iFLYTEK, Seewo, Hitevision | Missing | P2 | L | Belongs in ERP. |
| AI usage insights for admins | Google for Education, MagicSchool, SMART | Partial | P2 | S | The daily AI allowance is already tracked per school. |
| Syllabus completion tracking | Navneet TOPclass | Have | P1 | S | Books shows "N of M taught". |

### 4.16 Business

| Feature | Who has it | Zynetix | Priority | Effort | Notes |
|---|---|---|---|---|---|
| DPDP compliance pack (consent, DPA, data location, no training on school data, audit reports) | ClassPoint, MagicSchool, Canva, Khanmigo | Partial | P0 | M | A recording consent notice and institution policies exist. Add a parental consent flow, a DPA template, an India data-residency statement and a no-training policy. |
| Plan tiers and feature licensing in the app | SMART, Promethean, Clevertouch, ViewSonic, Wayground, Kahoot!, MagicSchool, Seewo, LG | Missing | P1 | M | Only a per-school AI allowance and policies today. Add entitlements from ERP (feature flags per plan). |
| Free teacher tier | Wayground, Kahoot!, Khanmigo, Canva, MagicSchool, Embibe, Microsoft, Google for Education | Partial | P1 | S | Demo mode only. |
| Same-day installation, onboarding, teacher training and certification | Teachmint X, Navneet TOPclass, Newline, zSpace, Boxlight/Mimio | Partial | P1 | S | In-app tour, practice board and training booking exist. Certification and service levels are operational work. |
| Make in India / GeM listing | DeltaView, ViewSonic, EKIN, Extramarks | Missing | P1 | M | A procurement matter, tied to the hardware partner. |
| Warranty, advance replacement, free lifetime updates | Teachmint X, Senses, Samsung, MAXHUB, Newline, LG | Missing | P1 | S | Commercial terms. |
| Custom branding / co-branding | ClassPoint, MagicSchool | Have | P2 | S | Brand name, watermark and logo on exports. |

## 5. Prioritised gap list

Only Partial and Missing rows from section 4 are gaps: 22 at P0, 62 at P1 and 100 at P2. Within P0 the order below is the suggested build order.

### 5.1 P0: needed to compete now (22)

1. **Sketch-to-icon "Did you mean" bar** (Missing, M). The most visible feature in the photos. Train a small classifier on Google's Quick, Draw! dataset (CC BY 4.0, 345 classes), ship it as TFLite on Android and ONNX on Windows so it works offline, map each class to a licensed icon set, and show a top-5 suggestion bar above the toolbar when `ink_parser` tags a sketch, with "Back to my ink". Add Indian classes from our own drawings. Full plan in section 2.4.
2. **Live class with video** (Partial, L). Add a WebRTC media server (self-hosted LiveKit or mediasoup, or an India-region provider) carrying the board, the teacher's camera and audio to the Student App. Keep today's ink stream as the low-bandwidth fallback, and add remote attendance and recording.
3. **Annotate over any app** (Missing, L). Android: an overlay window with a Flutter ink layer, a pass-through toggle and a MediaProjection screenshot for "Add to board". Windows: a transparent topmost window with click-through. Works with kiosk mode for IT-approved apps (decision 9).
4. **Game-show live quiz with points and leaderboard** (Partial, M). Score correctness plus speed from Student App timestamps; show a leaderboard after each question and a podium at the end; scanned-card answers get accuracy-only scores; keep team mode.
5. **One-tap Live Quiz button in the top bar** (Partial, S). Opens quiz setup with the current topic filled in, then the game mode above.
6. **Screen recording as video** (Partial, M). First render existing ink-event recordings to MP4 on the server with ffmpeg so they can be shared anywhere; then add optional true screen capture (Android MediaProjection, Windows Graphics Capture) so 3D, sims and other apps are recorded too.
7. **Large 3D catalogue** (Partial, L). Grow from about 58 to 1,000+ curriculum models. Licence options in decision 3: Corinth (white-label, confirm offline bundling), BioDigital (cloud, metered), Visible Body (display licence), open sources (Smithsonian CC0, NIH 3D, Z-Anatomy CC BY-SA).
8. **Anatomy set as photographed** (Partial, M). Add the muscular system (I and II) and a stand-alone diaphragm from Z-Anatomy, excluding its non-commercial parts, split into named parts so Select, Hide and Isolate work.
9. **More Indian languages** (Partial, L). Add Tamil, Telugu, Marathi, Bengali, Gujarati and Malayalam first: string files, ML Kit handwriting models, Android speech packs, AI answer language through the LLM, and a check of text-to-speech voices on each device.
10. **Translate into more Indian languages** (Partial, M). Add IndicTrans2 (open licence, server or on-device) or the Bhashini API for the 22 scheduled languages, with a subject glossary so terms stay consistent.
11. **Cast from any laptop or phone, up to 9 screens** (Partial, M). A code page in any laptop's Chrome sends the screen over WebRTC; raise the limit from 4 to 9 tiles with moderator approval. AirPlay, Miracast and Chromecast need the panel maker (decision 8).
12. **Endless canvas with auto-scroll** (Partial, M). A per-page "endless" mode that grows near the edges, auto-scrolls when writing near the bottom, skips off-screen strokes with a quadtree, and exports to PDF in 16:9 tiles (decision 16).
13. **AI-generated whiteboard lessons** (Partial, M). Map the "Prepare lecture" JSON onto board elements across pages (titles, text, equations, library pictures, a quiz page). Offline, build the pages from the Books topic.
14. **Over-the-air app updates** (Missing, M). Windows: MSIX with .appinstaller or fleet-agent pushes. Android: device-owner self-update from an APK hosted by ERP. Pilot ring, then everyone; an update window; rollback.
15. **AI safety controls** (Partial, M). Input and output moderation, a blocked-terms list, a per-school and per-feature AI switch in ERP, an audit log of prompts and answers the principal can view, and a "no training on school data" statement.
16. **DPDP compliance pack** (Partial, M). Parental consent flow, a data-processing agreement template, an India data-residency statement and the no-training policy. Pairs with item 15.
17. **Textbooks on the board** (Partial, M). Official NCERT (ePathshala) and state-board (for example KTBS) textbook PDFs by class and subject, opened as pages to write on and downloadable for offline use, after checking reuse terms (decision 13).
18. **Play local video and audio** (Missing, S). A media element (media_kit) with play, pause, scrub and annotate-when-paused, playing offline from USB or storage.
19. **3D download badges** (Partial, S). "Ready" tick or download icon with size on each tile, plus "Download all for offline".
20. **Request a 3D model** (Missing, S). A short form posting to the Node API; requests with votes in ERP; teacher notified when the model is added.
21. **Recenter button in the 3D viewer** (Partial, S). Re-frame the visible parts without undoing Hide or Isolate.
22. **Panel hardware bundle** (Missing, L). Not a coding task: choose a panel partner (decision 6) so schools can buy one box at Rs 1.2 to 2.6 lakh, as they can from Teachmint, Senses, EKIN and others.

**Quick wins** (P0 and small): items 5, 18, 19, 20 and 21.

### 5.2 P1: next (62)

| Gap | Area | Zynetix | Effort | Build approach |
|---|---|---|---|---|
| Handwritten chemical formula recognition | Whiteboard | Partial | M | Extend the maths parser with element symbols, subscripts, arrows and state symbols; output the chemical-equation element. |
| Circle a function to get a live graph | Whiteboard | Partial | S | "Plot it" chip on converted "y = ..." places a graph element. |
| Sketch to AI-generated image | Whiteboard | Missing | M | Cloud image model via the Node API with child-safety filters and the AI allowance. |
| Sketch to 3D model | Whiteboard | Missing | M | Recognise sketched cubes, cylinders, cones, spheres and prisms; swap in live solids. |
| Dynamic geometry constructions | Whiteboard | Partial | M | Expose bundled JSXGraph constructions as a board tool. |
| Low-latency inking | Whiteboard | Partial | M | Measure pen-to-pixel latency on target panels; try predicted strokes and front-buffered rendering. |
| Prepare at home and resume on any board | Whiteboard | Partial | M | Prepare-at-home editor that pins a board to a period; "Continue where I left off". |
| Natural-language voice assistant | AI | Partial | M | Intent layer (LLM online, keyword grammar offline), optional wake word, spoken answers. |
| Slide deck / PPTX export | AI | Missing | M | Server-side PPTX export of board pages. |
| Summarise imported PDFs | AI | Partial | S | Keep the PDF text layer on import; feed Summary AI and Quiz. |
| Video summaries, chapters and questions | AI | Missing | M | Start with our own concept videos and their transcripts. |
| Summary and quiz from the recording transcript | AI | Partial | S | Feed the WebVTT transcript and board pages to Summary AI and Quiz. |
| Quiz from any source | AI | Partial | S | Add PDF text, current slide, web page, camera photo and spoken topic as sources. |
| Bloom's level control and tags | AI | Partial | S | Bloom's selector, per-item tags, reports by level in ERP. |
| Circle to search anything | AI | Partial | S | Search and Explain for selected images via a multimodal model. |
| AI content suggestions and image/video search | AI | Partial | M | Licence-filtered Wikimedia search and allow-listed YouTube search ranked by topic. |
| AI image generation | AI | Missing | M | Cloud model with prompt screening and per-school allowance; prefer the picture library for science. |
| AI diagram generation as editable elements | AI | Partial | M | Output flowchart or organiser elements, not a picture. |
| OCR of printed pages | AI | Partial | S | ML Kit Text Recognition v2 (Latin, Devanagari) in the document camera. |
| Chat with the teacher's own documents | AI | Partial | M | Retrieval over imported PDFs per class on the Node API. |
| AI interactive diagrams and simulations | AI | Missing | M | AI emits graph, JSXGraph or number-line specs we already render. |
| On-device generative AI | AI | Partial | L | 1 to 3B model at 4-bit on NPU panels, with retrieval over offline notes (decision 2). |
| AI flashcards | AI | Partial | S | Generate from topic or board; flip/practice mode; send to Student App. |
| Ready-made editable lesson library | Content | Partial | L | AI-drafted lesson per syllabus topic, teacher-reviewed, published as templates. |
| Animated video library at scale | Content | Partial | L | Content partner or production pipeline. |
| School shared lesson library | Content | Partial | M | Publish as template; search by subject and class; copy to my boards. |
| Safe YouTube search and saved frames | Content | Partial | S | Allow-listed channel search; "Save frame to board". |
| Interactive video with questions | Content | Missing | M | Pause-point MCQs answered through Ask the class. |
| Fade (x-ray) and "hide all others" | 3D | Partial | S | Per-part transparency and an inverse isolate. |
| 3D labelling quiz | 3D | Missing | M | Hide labels, highlight a part, answers by app or card. |
| Licensed white-label 3D content | 3D | Missing | M | Sourcing deal (decision 3). |
| Handheld student clickers | Assessment | Partial | L | Hardware partner; read a USB-hub clicker in the board app (decision 12). |
| More response types | Assessment | Partial | M | Short text, drawing, photo/audio/video, ordering, slider, pin on image; thumbnail wall. |
| Individual student boards | Assessment | Missing | L | One synced canvas per student; live thumbnail grid; push one to the board. |
| Students post media and notes to the board | Assessment | Partial | S | Moderated "post to board" queue from the Student App. |
| Classroom game templates | Assessment | Partial | M | 4 or 5 templates (sort, match, sequence, label, crossword) filled by AI or the question bank. |
| AI scoring of handwritten answer sheets | Assessment | Missing | L | Scan, read handwriting, LLM rubric scoring, teacher override, marks to ERP. |
| Question-paper generator | Assessment | Missing | M | Teacher App or ERP blueprint by chapter and marks; Word/PDF export. |
| Two-way video and student control | Live class | Missing | L | Raise hand, unmute one student, chat, on the same media server. |
| Private student notes over the live board | Live class | Partial | M | Private ink layer in the Student App. |
| Live translated captions | Recording | Missing | M | Captions through IndicTrans2 or Bhashini as a second line. |
| Auto chapters and micro-lessons | Recording | Partial | M | Chapters at page changes and topic shifts; 3 to 5 minute clips. |
| Casting with no network | Casting | Missing | M | Board hotspot plus local WebRTC signalling. |
| Real-time remote co-authoring | Casting | Missing | L | Shared document model over Socket.IO with host permissions and read-only mode. |
| Smart TV plus tablet tier | Casting | Partial | M | Android TV build; Teacher App as the pen surface. |
| Annotate over live video | Annotation | Partial | S | Pause-and-annotate; save the frame. |
| Snipping tool to the board | Annotation | Partial | S | Free-form or rectangle snip of the current view. |
| Word, Excel and .ppt import | Annotation | Missing | M | Headless LibreOffice to PDF on the server; local converter on Windows OPS. |
| Google EDLA panel | Integrations | Missing | L | Run on an EDLA partner panel; publish on Google Play. |
| Cloud drives | Integrations | Missing | M | OAuth in the Teacher App, handed to the board by QR. |
| Power on/off schedules | Fleet | Missing | M | Device-owner or Windows power APIs; OEM API or Wake-on-LAN for power-on. |
| App push and allow/block lists | Fleet | Partial | M | Allow-listed apps in kiosk; pushed APK installs. |
| Usage analytics across branches | Fleet | Partial | M | Feature-usage events to an ERP branch dashboard. |
| On-premises KINETIX server | Fleet | Missing | L | Self-hosted Docker server (decision 15). |
| Low-reach mode for young children | Accessibility | Partial | S | Keep toolbars and popovers in the lower third. |
| Reading and spoken-English coach | Accessibility | Missing | M | Read-along with word highlighting and on-device fluency scoring. |
| Student progress dashboards | Analytics | Partial | M | Dashboards in ERP; class snapshot on the board before each period. |
| Plan tiers and feature licensing | Business | Missing | M | Feature flags per plan from ERP (decision 14). |
| Free teacher tier | Business | Partial | S | Decide scope (decision 14); today only demo mode. |
| Same-day installation and certification | Business | Partial | S | Operational: service levels, certification programme. |
| Make in India / GeM listing | Business | Missing | M | Procurement, tied to the hardware partner. |
| Warranty, replacement, lifetime updates | Business | Missing | S | Commercial terms. |

### 5.3 P2: later or only if asked (100)

| Gap | Area | Zynetix | Effort | Approach |
|---|---|---|---|---|
| Canvas minimap | Whiteboard | Missing | S | Corner thumbnail with draggable viewport. |
| Multi-file tabs | Whiteboard | Missing | M | Tabs for open boards, each with its own undo. |
| Fading ink nib | Whiteboard | Partial | S | Strokes fade after 3 to 10 seconds. |
| Ink to table | Whiteboard | Missing | M | Detect a crossed rectangle in ink_parser; offer "Make a table". |
| Chemistry equation balancing | Whiteboard | Missing | M | Offline matrix solver in the maths panel. |
| Handwriting prediction | Whiteboard | Missing | M | Recogniser guesses plus offline dictionary. |
| Beautification in the teacher's own style | Whiteboard | Partial | L | Defer; needs stroke synthesis. |
| Writing-structure recognition / outline | Whiteboard | Missing | M | Group lines into headings and lists; "Make notes". |
| Signature recognition | Whiteboard | Missing | S | Do not build. |
| Fill tool | Whiteboard | Missing | S | Fill closed strokes under the ink. |
| Personal clipart and templates in the cloud | Whiteboard | Partial | S | "Save selection as my sticker / template". |
| Clone on drag | Whiteboard | Partial | S | Toggle in the selection bar. |
| Long-press quick menu | Whiteboard | Missing | S | Radial menu on empty canvas. |
| AI organise sticky notes | Whiteboard | Missing | S | Cluster, head and summarise notes via KINETIX AI. |
| Five-finger blank / freeze | Whiteboard | Partial | S | Add the gesture. |
| Camera hand-gesture control | Whiteboard | Missing | M | On-device MediaPipe hand landmarks; store nothing. |
| Draggable slide objects during presentations | Whiteboard | Partial | S | Slides are flat images today. |
| Rubric generator | AI | Missing | S | Teacher App. |
| Level and chunk text | AI | Partial | S | "Rewrite for class N", "Split into chunks". |
| AI video generation | AI | Missing | L | Too costly. |
| Image tools (background removal) | AI | Missing | S | ML Kit Subject Segmentation on Android. |
| Object / species identification | AI | Missing | M | Cloud model needed for species. |
| Teacher admin writing | AI | Missing | S | Teacher App and ERP. |
| Student AI tutor | AI | Missing | L | Student App, with moderation and chat audit. |
| AI avatars | AI | Missing | L | Cheap role-play mode first; no voice-cloned twin. |
| Filter inappropriate content in casts | AI | Missing | M | On-device classifier on cast frames if needed. |
| AI inside third-party apps | AI | Missing | L | After the overlay ships. |
| Curriculum setup from a textbook-index photo | AI | Missing | S | OCR plus AI mapping to the ERP syllabus. |
| Audio lessons / podcast overviews | AI | Missing | M | Text-to-speech over a summary; Student App. |
| Self-study course creation | AI | Missing | M | Student App. |
| Digital manipulatives | Content | Partial | S | Abacus, base-10 blocks, algebra tiles, geoboard. |
| 2D molecule builder | Content | Partial | M | Editor with valency check that opens in 3D. |
| 360-degree videos and VR trips | Content | Missing | M | Equirectangular viewer in the 3D panel. |
| Digital-citizenship lessons | Content | Missing | M | Content work. |
| Bell-ringer and brain-break bank | Content | Partial | S | Small card bank. |
| Live web page embed | Content | Partial | S | Live embed instead of picture or link. |
| Gamified concept content | Content | Partial | M | Extend sim hub and primary activities. |
| JEE, NEET and Olympiad banks | Content | Partial | L | Needs content licensing. |
| Measure on 3D models | 3D | Missing | M | Point-to-point distance with real scale. |
| Voice control of 3D models | 3D | Missing | S | Extra voice commands. |
| Import own 3D files | 3D | Partial | S | GLB from device; server conversion of OBJ, STL, FBX. |
| AR view on phones | 3D | Missing | M | ARCore Scene Viewer and iOS Quick Look in the apps. |
| VR mode | 3D | Missing | L | Low value for wall boards. |
| Glasses-free 3D hardware | 3D | Missing | L | Hardware. |
| Live Q&A queue | Assessment | Missing | S | Anonymous question queue. |
| "Slow down" / "done" signals | Assessment | Missing | S | Student App button and counter. |
| Confidence rating | Assessment | Missing | S | Sure/unsure toggle. |
| Attention grabber | Assessment | Missing | S | Overlay plus chime. |
| Anonymous camera AI (headcount, gesture polls) | Assessment | Missing | M | Only with no identification and no storage; DPDP notice (decision 11). |
| Live AI writing feedback | Assessment | Missing | M | Rubric scoring of short answers; paste blocking. |
| Print papers and scan answers | Assessment | Partial | M | Follows AI scoring. |
| AI review of work under the camera | Assessment | Missing | L | Follows OCR and AI scoring. |
| Adaptive practice and mistake notebook | Assessment | Missing | L | Student App. |
| Question variants | Assessment | Missing | S | AI action in quiz review. |
| Self-paced quiz sending | Assessment | Partial | S | Send a quiz as self-paced. |
| Zoom / Meet / Teams on the board | Live class | Missing | M | Launch installed apps; native on Windows OPS. |
| AI camera auto-framing | Live class | Missing | M | On-device face detection and digital crop, no identification. |
| Noise suppression and voice enhancement | Live class | Missing | M | WebRTC audio processing. |
| Face-recognition attendance | Live class | Missing | L | Do not build for India (DPDP). |
| Emotion and attention monitoring | Live class | Missing | L | Do not build for India (DPDP section 9). |
| Reteach across sections | Live class | Partial | S | Already shareable per section. |
| Two-teacher remote model | Live class | Missing | L | Historical benchmark only. |
| Leaders' camera and audio view | Live class | Partial | M | Keep board-only. |
| Touch-back control of laptops | Casting | Missing | L | Sender agent on the laptop. |
| HDMI picture-in-picture | Casting | Missing | M | Partner firmware. |
| Multi-display room control | Casting | Partial | S | Extend projector blanking. |
| NFC card sign-in | Casting | Partial | S | Bind NFC cards in ERP. |
| Simultaneous co-teaching | Casting | Partial | S | Co-host mode. |
| Web version of the board | Casting | Missing | L | Flutter web build with fallbacks. |
| Teacher monitoring of student devices | Casting | Missing | L | DPDP-sensitive; skip. |
| Google Slides import | Annotation | Missing | S | Google sign-in via the Teacher App. |
| Other boards' lesson files | Annotation | Missing | M | Server converter for IWB, .notebook, flipchart. |
| PPTX export and printing | Annotation | Partial | S | Add to export options. |
| Unified file manager | Annotation | Partial | S | Local, USB and cloud in one browser. |
| Teacher-only presenter notes | Annotation | Partial | S | Show plan notes on the teacher's screen only. |
| PDF to student workbooks | Annotation | Missing | M | After individual student boards. |
| Google Classroom / Microsoft 365 | Integrations | Missing | M | Low demand in Indian schools. |
| LTI for Moodle and Canvas | Integrations | Missing | M | For colleges. |
| SSO (Google, Microsoft, ClassLink) | Integrations | Missing | M | QR sign-in covers most needs. |
| Public API and webhooks | Integrations | Partial | M | Open the internal API. |
| Emergency alert intake (CAP) | Integrations | Partial | S | CAP or webhook into broadcasts. |
| Idle-screen signage | Integrations | Partial | M | Notices, timetable, festival templates from ERP. |
| PowerPoint / Word add-in | Integrations | Missing | M | Optional quiz add-in. |
| Room booking | Integrations | Missing | S | ERP. |
| Remote screen view for IT | Fleet | Missing | L | WebRTC capture with indicator and audit log. |
| Remote wipe and USB lock | Fleet | Partial | S | Extend lock and unpair. |
| Bulk enrolment and Wi-Fi push | Fleet | Partial | S | Extend code enrolment. |
| Gesture eye test | Fleet | Missing | S | Unverified source; low value. |
| Backup and restore on reboot | Fleet | Partial | S | Extend autosave and "Set up again". |
| Screen reader, dyslexia font, alt text | Accessibility | Partial | M | Semantics audit, OpenDyslexic, AI alt text. |
| Auto-brightness from sensor | Accessibility | Partial | S | Use the panel light sensor where present. |
| Physical stamps on screen | Accessibility | Missing | L | Hardware. |
| Room sensors | Hardware | Missing | M | Only if the partner panel has them. |
| Smart blackboard form factor | Hardware | Missing | L | Hardware. |
| Smart lectern and video wall | Hardware | Missing | L | Hardware. |
| Antimicrobial glass | Hardware | Missing | L | Hardware. |
| AI teaching-practice analytics | Analytics | Missing | L | Teacher-only, from their own recordings. |
| AI teacher coaching | Analytics | Partial | M | Extend tour and training booking. |
| Student growth profile | Analytics | Missing | L | ERP. |
| AI usage insights for admins | Analytics | Partial | S | Surface the tracked allowance in ERP. |

## 6. Decisions needed from the founder

1. **Product name.** The code and screens say KINETIX; the request says Zynetix. Is Zynetix the new name for the board app (and the other apps)? Should the interface text, branding and exports be renamed?
2. **Where AI runs.** Keep generative AI cloud-only through the KINETIX Node API with per-school allowances, or also ship a small on-device model (1 to 3B, 4-bit, via llama.cpp or MediaPipe) on panels with an NPU? Which LLM provider or providers? Must data stay in India?
3. **3D content source.** License a white-label library (Corinth; confirm offline bundling rights), BioDigital (cloud-streamed, metered by views and users) or Visible Body (needs the Classroom or Institutional display right); build from open models (Smithsonian CC0, NIH 3D per-model licence, Z-Anatomy CC BY-SA for muscles); or commission our own? How many models do we need at launch, given Senses claims 5,000+ and Embibe 70,000+?
4. **Sketch-to-icon.** Is an offline classifier trained on Quick, Draw! (CC BY 4.0, 345 classes) acceptable? Which icon set do we license or commission (Fluent Emoji, OpenMoji CC BY-SA, or our own Indian-context icons)? Should we also offer cloud AI image generation, and if so with which provider and child-safety filters?
5. **Live class technology.** Self-host a WebRTC media server (LiveKit, mediasoup or Jitsi) or use an India-region provider (100ms, Dyte, Agora)? Do we need two-way student video, or only teacher video plus board, with student audio on request? What is the lowest bandwidth it must work at?
6. **Hardware partner.** Stay software-only on other brands' panels, or bundle with a panel maker (EKIN, a Senses-type maker, or a manufacturer such as KTC/Horion or CVTE/MAXHUB)? Must the panel be Google EDLA certified, have an NPU, NFC and a camera, and be Make in India / GeM-listed? What price point (rivals sell at Rs 1.2 to 2.6 lakh)? Do we also want a low-cost Smart TV plus tablet tier like LEAD?
7. **Screen recording.** Keep the light ink-event recordings and add MP4 export, or add true pixel capture of 3D, simulations and other apps? Who pays for video storage?
8. **Wireless casting.** Is sending from any laptop's browser over WebRTC enough, or must we offer AirPlay, Miracast and Chromecast receivers (which need panel firmware or licensing)? Should casting work offline over the board's own hotspot?
9. **Annotate over any app.** May the board leave kiosk mode for IT-approved apps (YouTube, Office, Play Store apps) with a floating pen on top? Which apps may IT allow?
10. **Languages.** After English, Hindi and Kannada, which Indian languages come next, and in what order (Tamil, Telugu, Marathi, Bengali, Gujarati, Malayalam ...)? Do we use Bhashini, IndicTrans2 or a commercial service for translation and translated captions?
11. **Camera AI.** Confirm that face-recognition attendance and emotion or attention monitoring will not be built for India because of the DPDP Act 2023 limits on children's data. May we build anonymous on-device features such as a headcount, a random pick and hand-gesture polls?
12. **Student response hardware.** Are scanned answer cards plus the Student App enough, or do we partner on handheld clickers to answer Teachmint's Click X?
13. **Textbooks.** May we host NCERT and state-board (for example Karnataka KTBS) textbook PDFs on the board, or do we need a publisher partnership (as Navneet has) for licensed textbooks, animations and question banks?
14. **Business model.** Free lifetime software updates (as Senses offers) or a paid AI and content subscription after year one (as LG does)? Do we want a free teacher tier, and which features go in which plan?
15. **Updates and hosting.** Which update channel: MSIX App Installer, Google Play, or device-owner self-update from ERP? Must we offer a self-hosted on-premises KINETIX server for schools with poor internet or data-location rules?
16. **Canvas model.** Should boards default to an endless canvas (as Teachmint, Senses and EKIN do) or stay paged? How should an endless canvas export to PDF and share links?
17. **Student devices.** Can we assume students have phones or tablets (their own or the school's) for individual student boards, live game quizzes and co-authoring, or must every feature also work with no student devices?
18. **Moving schools from older boards.** Do we need importers for SMART Notebook, Promethean flipchart, IWB, Word and Excel files? If so, is conversion on our server acceptable, or must it work offline?
19. **Research follow-up.** These corrections were accepted but not re-checked because the web-search budget ran out: (a) Horion is a wholly owned subsidiary of KTC Technology (SZSE 001308), not a partner; (b) Samsung's "WAHX-M" is unconfirmed, so use WAF/WAFX-P; (c) Corinth and Lifeliqe are separate Czech sister companies; (d) Hikvision's eye test and LG's signature recognition are unverified; (e) EKIN's "Unity/Unreal-grade sims" come from its own spec PDF and name no product; (f) Educomp and BYJU'S are historical benchmarks only. Mexus Education could not be checked at all. Should we re-run verification before sharing this report outside the company?
20. **Photo attribution.** The photos show only an EKIN bezel logo. Do you know which software runs on that panel (EKIN's own AI whiteboard or Teachmint X)? Can you share a photo of its About screen so the screenshot features are credited correctly?

## 7. Sources

Links marked "(unverified)" were not confirmed this session (third-party pages, single sources, blocked pages or old material). Prices and specifications can change; check before quoting them to schools.

**Internal sources**
- Competitor photos supplied by the user: `images/1.png` (3D Library), `images/2.png` (whiteboard with sketch suggestions and top bar), `images/3.png` (3D viewer).
- Zynetix status: the board app code under `apps/board/lib/` and the packages `kinetix_ink`, `kinetix_3d`, `kinetix_labs`, `kinetix_animations`, `kinetix_cs` and `kinetix_cast`.

**Teachmint X**
- <https://www.teachmint.com/teachmint-x>
- <https://www.teachmint.com/teachmintx>
- <https://www.teachmint.com/products/interactive-whiteboard>
- <https://www.teachmint.com/en-us/products/digital-board-for-teaching>
- <https://www.teachmint.com/eduai>
- <https://www.teachmint.com/clickx-student-clickers-for-classroom>
- <https://educationmiddleeast.com/?p=15424>
- <https://apps.apple.com/app/id6761761537>
- <https://apps.apple.com/in/app/teachmint-app-for-schools/id1544210597> (unverified)
- <https://cxotoday.com/press-release/teachmint-launches-teachmint-x2-google-edla-certified-ai-interactive-flat-panel/>
- <https://m.indiamart.com/teachmint-technologies/interactive-white-digital-board.html>
- <https://channeldrive.in/education/teachmint-launches-one-day-ai-transformation-for-classrooms/> (unverified)

**Senses Electronics**
- <https://senseselec.com/?p=26286>
- <https://senseselec.com/?p=27262>
- <https://senseselec.com/blogs/india-first-android-16-smart-board/>
- <https://senseselec.com/blogs/best-smart-board-for-schools-colleges-universities-india/>

**EKIN**
- <https://ekin.net.in/>
- <https://ekin.net.in/interactive-display/interactive-flat-panel-ai-royal-series/>
- <https://ekin.net.in/wp-content/uploads/2026/06/Ekin-Ai-whiteboard-software-june2026.pdf>
- <https://www.indiamart.com/proddetail/ekin-interactive-flat-panel-powered-by-ai-2855255123391.html>

**Globus Infocom**
- <https://www.globusinfocom.com/media/iverve/uploadpdf/1718367695_interactive-display-with-ai-camera.pdf>
- <https://www.globusinfocom.com/display/interactive-display?mode=list>
- <https://cxotoday.com/press-release/globus-infocom-unveils-the-advanced-new-range-of-interactive-display/>

**Extramarks**
- <https://www.extramarks.com/extra-intelligence>
- <https://www.extramarks.com/blogs/schools/smart-classroom-equipment/>
- <https://elearningindustry.com/directory/elearning-software/extramarks-smart-class-plus>
- <https://org.gem.gov.in/cart/cart_global/directBuy/115186> (unverified)

**Geneo**
- <https://www.schoolnetindia.com/blog/geneo-ai-panel-redefining-classrooms-in-india/>
- <https://www.schoolnetindia.com/geneo/>

**Next Education**
- <https://nexteducation.in/classroom-solutions.html>
- <https://www.nexteducation.in/teachnext>
- <https://startuptalky.com/next-education-success-story/> (unverified)
- <https://zee5.com/articles/?p=5845149> (unverified)

**Tata ClassEdge**
- <https://www.devdiscourse.com/article/business/2500927-tata-classedge-launches-classedge-platinum-the-most-powerful-digital-classroom-experience>

**DeltaView**
- <https://www.industrialautomationindia.in/articles/deltaview-technologies-ai-enabled-smart-classroom-blaze-smart-board>
- <https://www.itvoice.in/deltaview-transforming-teaching-collaboration-with-ai-powered-displays>
- <https://www.itvoice.in/deltaview-smart-board-indias-emerging-leader-in-education-and-enterprise> (unverified)

**LEAD Group**
- <https://cxotoday.com/press-release/lead-groups-techbook-set-to-disrupt-student-learning-in-india/>
- <https://www.cxodigitalpulse.com/?p=61087>
- <https://leadschool.in/blog/smart-classes-for-schools.html> (unverified)

**Educomp**
- <https://www.careers360.com/articles/education/educomp-new-digital-learning-for-teachers>
- <https://livelaw.in/ibc-cases/nclt-delhi-approves-resolution-plan-educomp-solutions-limited-240466>
- <https://m.indiamart.com/proddetail/digital-smart-class-solution-20325589612.html> (unverified)

**BYJU'S**
- <https://inc42.com/?p=444046>
- <https://www.edtechreview.in/news/byju-s-classes-launches-two-teacher-model-to-enhance-online-learning-experience/>
- <https://en.wikipedia.org/wiki/Byju%27s> (unverified)

**Embibe**
- <https://www.jio.com/business/solution/jio-smart-school/teacher/>
- <https://startup.outlookindia.com/sector/ed-tech/embibe-partners-with-uttar-pradesh-govt-to-offer-free-nep-aligned-learning-to-state-public-schools-news-9762>
- <https://indiaai.gov.in/news/goa-government-signs-mou-with-jio-embibe-for-ai-based-adaptive-learning>
- <https://alternativeto.net/software/embibe/about> (unverified)
- <https://play.google.com/store/apps/details?id=com.embibe.teachlite> (unverified)
- <https://foxdata.com/fr/app-marketing-analytics/com.jioembibe.assigntrackmobileapp/gp/IN> (unverified)
- <https://tr-web.dev.trustradius.com/products/indiavidual-learning-embibe/details> (unverified)

**Navneet TOPclass**
- <https://www.navneettoptech.com/topclass>
- <https://www.navneettoptech.com/>
- <https://cxotoday.com/press-release/navneet-education-limited-introduces-navneet-ai/>
- <https://m.indiamart.com/esense-learning-pvt-ltd> (unverified)

**Classteacher**
- <https://www.classteacher.com/>
- <https://india.entrepreneur.com/en-in/technology/classteacher-an-interactive-voyage-of-discovery-and/270514> (unverified)
- <https://m.indiamart.com/mind-shapertechnologies/our-products.html> (unverified)

**Cybernetyx**
- <https://www.cybernetyx.com/>
- <https://cxotoday.com/corner-office/bird-ai-revolutionizing-intelligent-collaboration-through-advanced-ai-integration/>
- <https://www.installation-international.com/ise-daily/cybernetyx-brings-ai-to-the-classroom>
- <https://www.slideshare.net/fanky/cybernetyx-introduction> (unverified)
- <https://www.itvoice.in/cybernetyx-announces-the-appointment-of-supertron-electronics-as-national-distributor-in-india-for-educational-product-lines> (unverified)

**Mexus Education**
- <https://www.mexuseducation.com/> (unreachable: certificate expired on 17 October 2026)

**SMART Technologies**
- <https://www.smarttech.com/education/products/software/iq-apps>
- <https://smarttech.com/en-in/education/products/compare-all-products>
- <https://support.smarttech.com/docs/hardware/displays/smart-board-7000/en/about/sbid-7000-specifications/sbid-7286.cshtml>
- <https://downloads.smarttech.com/media/sitecore/en/support/product/smartnotebook/notebook23/releasenotes/releasenotes.pdf>
- <https://techupdates.smarttech.com/article/smart-notebook-25>
- <https://techupdates.smarttech.com/article/smart-notebook-25-1>
- <https://techupdates.smarttech.com/article/smart-notebook-26> (unverified)
- <https://support.smarttech.com/docs/software/lumio/en/whats-new/whats-new.cshtml>
- <https://support.smarttech.com/docs/software/lumio/en/enhancing-lessons/lumio-ai-assist-activities.cshtml>
- <https://thejournal.com/articles/2026/01/13/lumio-updates-speed-ai-powered-lesson-creation.aspx>
- <https://thejournal.com/articles/2025/07/22/lumio-by-smart-technologies-intros-ai-assist-class-sessions-tools.aspx>
- <https://www.smarttech.com/lumio/why-lumio/ecosystem-integrations>
- <https://support.smarttech.com/docs/online-services/remote-management/en/running-other-commands/sending-custom-commands.cshtml>
- <https://support.smarttech.com/docs/accessories/tool-explorer/en/about/default.cshtml>
- <https://brandlibrary.smarttech.com/m/5033947cfd8cb7f2/original/Tech-specs-T-Pro-series.pdf>
- <https://www.tanotis.com/collections/commercial-monitors-displays/products/smart-technologies-smart-board-mx-v5-series-with-iq-75-uhd-4k-touch-screen-commercial-monitor>
- <https://www.slideshare.net/slideshow/notebook-14-factsheet/43390406> (unverified)
- <https://m.cdwg.com/product/smart-notebook-math-tools-license/4151520> (unverified)
- <https://onlinehelp.smarttech.com/english/mac/help/notebook/15_1_0/Content/Product-User/UsingSMARTNotebook3DTools/InsertingAndManipulating3DModels.htm> (unverified)
- <https://slashdot.org/software/comparison/Lumio-by-SMART-vs-Teachmint/> (unverified)

**Promethean**
- <https://learn.prometheanworld.com/articles/discover-the-all-new-activpanel-10-and-activpanel-10-premium/>
- <https://learn.prometheanworld.com/articles/introducing-the-all-new-activpanel-le/>
- <https://learn.prometheanworld.com/articles/operate-it-with-ease/>
- <https://learn.prometheanworld.com/videos/camp-promethean-2026-ai-meets-the-activpanel-gemini-explain-everything/>
- <https://learn.prometheanworld.com/wp-content/uploads/2023/03/Getting-Started-with-ActivInspire_April23.pdf>
- <https://www.prometheanworld.com/wp-content/uploads/pdf/ActivInspire_SS_0722v8.3_EN.pdf>
- <https://www.prometheanworld.com/au/resource-hub/blogs/3-awesome-activities-to-get-you-started-with-activinspire/>
- <https://www.prometheanworld.com/news-article/promethean-partners-with-radix-to-expand-device-management-and-security/>
- <https://finviz.com/news/397431/myndais-promethean-brand-launches-on-device-ai-companion-to-help-teachers-create-lesson-content-in-seconds>
- <https://explaineverything.com/>
- <https://explaineverything.com/blog/news/whats-in-explain-everything-advanced/>
- <https://explaineverything.com/pricing/>
- <https://convergetp.de/wp-content/uploads/2026/04/EE_Advanced_FL_0324v1.9_DE_DE.pdf>
- <https://midwich.us/p/activsuite-1yr-activsuite-1-year-subscription>
- <https://www.shi.com/product/49699170/Promethean-ActivPanel-10>
- <https://www.onedirect.co.uk/promethean> (unverified)

**Clevertouch**
- <https://www.clevertouch.com/software/lynx>
- <https://www.clevertouch.com/latest-stories/blogs/back-to-school-with-lynx-pro>
- <https://www.clevertouch.com/latest-stories/news-articles/clevertouch-unveils-groundbreaking-edtech-solutions-at-bett-2024-allowing-teachers-to-reclaim-their-time-for-what-truly-matters>
- <https://clevertouch.com/max2>
- <https://www.clevertouch.com/us/products/interactive-displays/impact-max>
- <https://tools.clevertouch.com/UploadedSpecSheets/IMPACTMaxFlyerEnglish.pdf>
- <https://www.clevertouch.com/products/collaboration/lynx-screen-recorder>
- <https://clevertouch.com/software/clevershare>
- <https://portal.clevertouch.com/product/clever-software-solutions/CleverMDM/brochure/CleverMDM-brochure-English>
- <https://boxlight.com/news/press-releases/pr-clevertouch-launches-lynx-whiteboard>
- <https://app.alludolearning.com/m/activities/172399-clevertouch-lynx-whiteboard-advanced-features>

**Boxlight (Mimio)**
- <https://boxlight.com/products/apps-for-the-classroom/mimiostudio-educational-software>
- <https://boxlight.com/products/apps-for-the-classroom/mimio-studio>
- <https://boxlight.com/latest-stories/blog-articles/mimioconnect-is-now-myclass>
- <https://boxlight.com/latest-stories/blog-articles/update-required-for-myclass-users>
- <https://boxlight.com/latest-stories/news-articles/boxlight-launches-frontrow-live-beta-hardware-free-real-time-captions-and-translation-for-every-classroom>
- <https://displaydaily.com/boxlight-launches-new-mimiopro-4-interactive-display/>
- <https://mac.softpedia.com/progChangelog/Mimio-Studio-Changelog-392.html>
- <https://www.businesswire.com/news/home/20200618005154/en/Boxlight-Introduces-MimioConnect™-Blending-Learning-Platform>
- <https://www.businesswire.com/news/home/20210302005749/en/Boxlight-Announces-Virtual-Classroom-Experience-and-Connected-Community>
- <https://boxlight.com/products/interactive-displays/boxlight-procolor> (unverified)
- <https://tools.clevertouch.com/UploadedSpecSheets/MimioMobile_A4_SellSheet.pdf> (unverified)
- <https://www.capterra.ca/software/1073698/MyClass> (unverified)
- <https://www.geneonline.com/boxlight-corporation-launches-symphonic-series-interactive-displays-on-june-4-2026/> (unverified)

**ViewSonic**
- <https://cxotoday.com/press-release/viewsonic-unveils-ai-driven-viewlessons-studio-and-newly-enhanced-myviewboard-empowering-indian-educators-with-next-generation-teaching-tools/>
- <https://myviewboard.com/kb/whiteboard-working-area/wb-features-comparison1>
- <https://myviewboard.com/kb/en_US/standard-pro-premium-breakdown>
- <https://myviewboard.com/pricing/>
- <https://www.viewsonic.com/ch/presscenter/content/viewsonic-launches-its-first-viewboard-with-an-integrated-48mp-ai-camera-redefining-hybrid-collaboration-for-meetings-and-classrooms_7908>
- <https://www.viewsonic.com/library/de/bildung/myviewboard-3-neuerungen/>
- <https://www.viewsonic.com/media/wysiwyg/press-room/iste25/myViewBoard_3.0.pdf>
- <https://support.viewsonic.com/en/support/solutions/articles/33000295885-what-is-classswift-and-how-does-it-work->
- <https://www.viewsonic.com/us/blog/viewsonic-class-swift-enhances-language-learning-with-engaging-activities-and-data-driven-insights/>
- <https://www.viewsonic.com/us/whiteboard>
- <https://www.viewsonic.com/eu/business/software/airsync>
- <https://www.viewsonic.com/uk/education/products/viewboard/IFP5551>
- <https://viewsonic.com/edu/viewsonic-manager>
- <https://digitalterminal.in/device/viewsonic-launches-made-in-india-in03-interactive-display-cn01-commercial-display>
- <https://www.systemsintegrationasia.com/viewsonic-launches-new-viewboard-series-in-india> (unverified)

**BenQ**
- <https://www.benq.com/en-us/education/benq-ai.html>
- <https://www.benq.com/en-us/business/ifp/ezwrite-60/education.html>
- <https://www.benq.com/en-in/education/news/benq-launches-the-rp05-interactive-display-in-india--bringing-a-.html>
- <https://www.benq.com/en-au/education/benq-board-interactive-displays/rm05-master-series-board.html>
- <https://www.benq.com/en-me/education/edtech-blog/interactive-display-benq-rp05-ai-classroom.html>
- <https://www.benq.com/en-us/business/support/products/ifp/rp6503/qa.html>
- <https://www.gogi.in/benq-board-pro-rp05-launched-in-india-ai-powered-interactive-display-for-classrooms-prices-start-at-rs-2-lakh.html>

**Samsung**
- <https://news.samsung.com/us/samsung-introduces-new-education-tools-interactive-displays-istelive-26/>
- <https://news.samsung.com/us/samsung-new-ai-class-assistant-for-wad-interactive-display-istelive-2024>
- <https://insights.samsung.com/2025/07/14/7-features-of-samsung-waf-that-support-teaching-and-learning/>
- <https://www.samsung.com/uk/smart-signage/interactive-display/interactive-display-waf-75-inch-lh75wafwlgcxen>
- <https://m.gsmarena.com/samsung_ai_interactive_display_wafx_p-amp-66184.php>
- <https://www.samsung.com/be_fr/business/smart-signage/interactive-display/flip-pro-wm85b-interactive-display-lh85wmbwlgcxen> (unverified)

**LG**
- <https://www.lg.com/global/business/commercial-display/digital-signage/lg-createboard-idb/75tr3pn/>
- <https://lg.com/us/business/download/resources/CT00001837/SPEC_TR3PN_K-12[20241217_050041].pdf>
- <https://www.lg.com/global/newsroom/b2b/product-and-solutions/lg-strengthens-edtech-leadership-with-expanded-lg-createboard-lineup/>
- <https://www.lg.com/us/press-release/LG-ISTE-2026-Overview.pdf>
- <https://dir.indiamart.com/chennai/lg-interactive-digital-board.html> (unverified)

**Newline Interactive**
- <https://newline-interactive.com/wp-content/uploads/2025/04/2025-Education-Catalog.pdf>
- <https://newline-interactive.com/usa/newline-ai-remote/>
- <https://newline-interactive.com/usa/products/newline-engage-cloud/>
- <https://newline-interactive.com/uk/newline-elara-elite-the-premium-interactive-display-with-android-16-and-artificial-intelligence/>
- <https://newline-interactive.com/wp-content/uploads/2023/01/Newline_Engage_Cloud_Specsheet_01.23.pdf>
- <https://m.indiamart.com/bd-computronix-systems/interactive-touch-panel.html> (unverified)

**MAXHUB**
- <https://www.maxhub.com/in/e3_series/>
- <https://www.maxhub.com/en/u4_series/>
- <https://www.maxhub.com/en/f5_series/>
- <https://www.maxhub.com/aus/class>
- <https://maxhub.com/in/en5>
- <https://m.indiamart.com/macktech-solutions/interactive-flat-panel.html>

**Hikvision**
- <https://pro-av.hikvision.com/en/products/software/wonderos/>
- <https://pro-av.hikvision.com/en/products/interactive-flat-panel-display/interactive-flat-panels/select-series/>
- <https://www.itvoice.in/hikvision-india-unveils-wonderos-4-0-interactive-display-panels-active-led-digital-signage-and-audio-products-at-palm-av-icn-expo-2026>
- <https://m.indiamart.com/proddetail/hikvision-interactive-flat-panel-display-2854124313612.html>
- <https://www.hikvision.com/content/dam/hikvision/en/support/regional-materials/egypt/DS-D5B75RD_C_Datasheet_20241118-Egypt.pdf> (unverified)

**Dahua Technology**
- <https://www.dahuasecurity.com/Products/All-Products/Interactive-Whiteboards>
- <https://www.dahuasecurity.com/products/interactive-whiteboards/education-series>
- <https://www.dahuasecurity.com/products/interactive-whiteboards/education-series/st420-s3-series/lph86-st420-s3=s3>
- <https://www.dahuasecurity.com/products/interactive-whiteboards/education-series/st470-c-series/lph75-st470-c-s3>
- <https://www.dahuasecurity.com/products/discontinued-products/interactive-whiteboards/lph75-mc470-p>

**Huawei IdeaHub**
- <https://www.huaweicentral.com/?p=37305>
- <https://kyodonewsprwire.jp/release/202503105479>
- <https://network-switch.com/blogs/news/huawei-and-eros-group-launch-ai-enhanced-ideahub-s3>
- <https://www.pbtech.com/au/product/DGSHUA55151104/Huawei-IdealHub-K3-75---Education-Interactive---4K> (unverified)
- <https://www.huaweicentral.com/huawei-ideahub-board-2-launched-with-65-inch-display/amp/> (unverified)
- <https://www.bh.zain.com/en/business/huawei-ideahub> (unverified)
- <https://e.huawei.com/hk/products/enterprise-collaboration/ideahub/ideahub-k3> (unverified)

**Horion**
- <https://global.horion.com/>
- <https://global.horion.com/k8a/>
- <https://global.horion.com/pages/blog/interactive-smart-panel-reshaping-the-interactive-experience> (unverified)
- <https://global.horion.com/pages/news_blog> (unverified)

**Seewo**
- <https://www.seewo.com/>
- <https://www.seewo.com/product/detail/AI>
- <https://www.seewo.com/product/common/bdjqj>
- <https://www.seewo.com/product/common/JXKJ>
- <https://www.seewo.com/product/common/XXJK>
- <https://easinote.seewo.com/>
- <https://class.seewo.com/>
- <https://capsule.seewo.com/>
- <https://news.pedaily.cn/20250428/106390.shtml>
- <https://ai-bot.cn/sites/24210.html> (unverified)
- <https://obs.gcy.zfcg.gxzf.gov.cn/guangxi-gov-open-doc/1024FPA/450899/10007289533/202512/70a7a366-cb13-4ba0-a5f5-d0dc657b6a9a.pdf> (unverified)

**Hitevision**
- <https://www.hitevision.com/portal/list/index/id/4.html>
- <https://www.hitevision.com/portal/article/index/id/496/cid/4.html>
- <https://m.tech.china.com/hea/articles/20251029/202510291755452.html>
- <https://cn.chinadaily.com.cn/a/202410/28/WS671f41a5a310b59111da0413.html>
- <https://apps.apple.com/py/app/%E9%B8%BF%E5%90%88%E5%A4%9A%E5%B1%8F%E4%BA%92%E5%8A%A8/id1352950110> (unverified)

**iFLYTEK**
- <https://www.iflytek.com/en/news-events/news/297.html>
- <https://www.donews.com/news/detail/4/6637207.html>
- <https://www.eol.cn/chengguo/edc/shuzihua/202604/t20260427_2730938.html>
- <https://www.stdaily.com/web/gdxw/2026-08/07/content_561068.html>
- <https://www.stdaily.com/web/gdxw/2025-04/27/content_332057.html>
- <https://www.homecrux.com/iflytek-tongchuang-ai-blackboard-launched-at-waic-2026-chin/402981/amp/>

**ClassPoint**
- <https://www.classpoint.io/>
- <https://www.classpoint.io/ai-quiz-generator>
- <https://www.classpoint.io/features>
- <https://www.classpoint.io/presentation-tools>
- <https://www.classpoint.io/pricing>

**Microsoft**
- <https://support.microsoft.com/en-US/whiteboard/welcome-to-copilot-in-whiteboard>
- <https://support.microsoft.com/en-US/education/teach-in-the-microsoft-365-copilot-app>
- <https://support.microsoft.com/en-US/Education/learning-zone/microsoft-learning-zone-interactive-lesson-generation>
- <https://support.microsoft.com/en-gb/office/insert-a-3d-image-8ad80db5-fe48-4979-ab86-904e0e33ef36>
- <https://news.microsoft.com/en-in/microsoft-rolls-out-eight-indian-languages-support-in-teams>
- <https://campustechnology.com/articles/2025/10/15/microsoft-intros-new-ai-powered-teaching-and-learning-tools.aspx>
- <https://thejournal.com/articles/2025/07/01/microsoft-launches-ai-tools-for-educators.aspx>
- <https://query.prod.cms.rt.microsoft.com/cms/api/am/binary/RE4GnKl>
- <https://Help.IllinoisState.edu/technology/support-topics/communication-and-collaboration-tools/microsoft-365/microsoft-whiteboard>
- <https://help.ithaca.edu/TDClient/34/Portal/KB/ArticleDet?ID=1255>
- <https://websites.uta.edu/oit/2021/10/12/whiteboard-refresh>
- <https://support.microsoft.com/en-US/whiteboard/use-copilot-in-whiteboard-with-a-screen-reader> (unverified)
- <https://dataperk.com/kb/how-to-effectively-use-microsoft-whiteboard-a-step-by-step-tutorial/> (unverified)
- <https://teachnet.ie/copilots-teach-your-new-classroom-assistant> (unverified)

**Google for Education**
- <https://blog.google/products-and-platforms/products/education/bett-2026-gemini-classroom-updates/>
- <https://9to5google.com/2025/06/30/gemini-education-iste-2025/>
- <https://support.google.com/edu/classroom/answer/16534159>
- <https://workspaceupdates.googleblog.com/2025/09/educators-create-gems-notebooks-google-classroom.html>
- <https://techcrunch.com/2026/01/28/google-turns-gemini-toward-indias-most-competitive-entrance-exam>
- <https://en.wikipedia.org/wiki/Read_Along>
- <https://www.thebridgechronicle.com/tech/google-launches-atl-saathi-gemini-ai-assistant-india-tinkering-lab-teachers-mp99>
- <https://www.controlaltachieve.com/2026/01/bett26.html> (unverified)

**Nearpod**
- <https://nearpod.com/blog/whats-new-with-nearpod-back-to-school-2026/>
- <https://nearpod.com/nearpod-3d>
- <https://nearpod.com/pricing>

**Curipod**
- <https://curipod.com/pricing>
- <https://www.educatorstechnology.com/2024/11/create-interactive-lessons-using-curipod.html>

**MagicSchool**
- <https://www.magicschool.ai/>
- <https://www.magicschool.ai/pricing>
- <https://help.magicschool.ai/en/articles/10604047-what-interface-languages-does-magicschool-support>
- <https://help.magicschool.ai/en/articles/10270820-what-translation-tool-does-magicschool-use-for-its-services>

**Khan Academy Khanmigo**
- <https://blog.khanacademy.org/khanmigo-features/>
- <https://blog.khanacademy.org/?p=22106>
- <https://blog.khanacademy.org/?p=16634>
- <https://www.khanacademy.org/teachers>
- <https://support.khanacademy.org/hc/en-us/articles/14394569357069>
- <https://www.unmc.edu/newsroom/2025/06/02/ai-tool-khanmigo-now-available-through-canvas/>

**Wayground (Quizizz)**
- <https://wayground.com/>
- <https://wayground.com/home/plans>
- <https://thejournal.com/articles/2025/06/24/quizizz-rebrands-as-wayground-announces-new-ai-features.aspx>
- <https://aws.amazon.com/marketplace/pp/prodview-k3xxf27lxntby>

**Kahoot!**
- <https://kahoot.com/schools/>
- <https://kahoot.com/blog/2026/06/23/latest-learning-innovations-istelive-26/>
- <https://kahoot.com/blog/2025/03/18/leveling-up-learning-ai-tools-for-education/>
- <https://support.kahoot.com/hc/en-us/articles/37500117906589>

**Canva for Education**
- <https://edtechchronicle.com/canva-introduces-student-safe-ai-products-customizable-lessons-for-teachers-and-5000-free-classroom-resources-to-50-million-students-and-teachers/>
- <https://www.fenews.co.uk/education/canva-introduces-student-safe-ai-products/>
- <https://venturebeat.com/ai/canva-launches-ai-tools-for-education>
- <https://www.computingatschool.org.uk/forum-news-blogs/2025/may/discovering-what-s-new-with-canva-for-education-highlights-from-the-learning-lab/>
- <https://www.weareteachers.com/canva-tools-for-teachers-iste/>
- <https://blogs.loucoll.ac.uk/learningtechnology/canva-whiteboards-as-a-padlet-alternative/>
- <https://blog.tcea.org/tag/canva-whiteboard/>
- <https://www.canva.com/education/> (unverified; returned 403)
- <https://enochs.mcs4kids.com/o/mcs/page/canva-for-education> (unverified)

**Google AutoDraw / Quick, Draw!**
- <https://github.com/googlecreativelab/quickdraw-dataset>
- <https://techcrunch.com/2017/04/11/googles-autodraw-uses-machine-learning-to-help-you-draw-like-a-pro/amp/>
- <https://www.techradar.com/news/how-googles-autodraw-works>
- <https://newatlas.com/google-autodraw-ai-clipart/48956> (unverified)

**BioDigital Human**
- <https://pricing.biodigital.com/school.html>
- <https://pricing.biodigital.com/business.html>
- <https://www.aip.cz/download/tools/2698-biodigital-fs-ovid-final.pdf>
- <https://wolterskluwer.com/en/solutions/ovid/biodigital-human-15920>
- <https://devsupport.biodigital.com/hc/en-us/articles/234672847>

**zSpace**
- <https://thejournal.com/articles/2025/01/14/zspace-debuts-headset-free-ar-vr-system.aspx>
- <https://guides.cmcc.edu/zSpace>
- <https://help.cengage.com/visible-body/instructor/visible-body/zspace8-interact-3d.html>
- <https://tradersunion.com/news/companies/show/2495283-zspace-studio-upgrade/> (unverified)
- <https://finder.techleap.nl/news/feed/zspace-launches-studio-update-and-16-biology-simulations-for-inspire-device-customers-ahead-of-istelive-2026> (unverified)

**Corinth**
- <https://www.corinth3d.com/>
- <https://www.corinth3d.com/content-licensing>
- <https://www.corinth3d.com/coriai>
- <https://appsource.microsoft.com/en-us/product/office/WA200001486?src=office>
- <https://www.clever.com/app-gallery/corinth>

**Sketchfab**
- <https://sketchfab.com/education>
- <https://sketchfab.com/licenses>
- <https://sketchfab.com/blogs/community/fab-publishing-portal-open-for-sketchfab-migration>
- <https://app.cinevva.com/guides/game-assets-guide.html> (unverified)

**Visible Body**
- <https://www.visiblebody.com/>
- <https://www.visiblebody.com/anatomy-and-physiology-apps/human-anatomy-atlas>
- <https://help.cengage.com/visible-body/student/visible-body/atlas-release-notes-android.html>
- <https://apps.apple.com/eg/app/id1117998129>

**Open-licensed 3D sources**
- <https://github.com/Z-Anatomy/Models-of-human-anatomy>
- <https://3d.si.edu/collections/openaccesshighlights>
- <https://3d.nih.gov/faqs>
