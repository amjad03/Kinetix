# Zynetix Board — Classroom edition

The KINETIX Board built for PU colleges that do not use the Zynetix ERP: no AI anywhere, works
offline from the board's own timetable, teachers and classes, and opens on the Simple board.
Same code base as the board; the edition is chosen at build time.

## Building it

```sh
flutter build apk --dart-define=KINETIX_EDITION=classroom      # Android: in.zynetix.classroom, "Zynetix Classroom"
flutter run --dart-define=KINETIX_EDITION=classroom
```

Sizes (arm64-v8a / armeabi-v7a): 1.0.0 was 179.4 / 169.5 MB; 1.1.0 was 90.8 / 90.8 MB (with
Pyodide's core for the code lab, which 1.0.0 lacked); 1.2.0 is 98.9 / 99.2 MB (instruments and
labs in the lessons; the 47 extra PhET sims come in the content pack, not the APK).

A release APK (signed with the Zynetix release key through the `KINETIX_ANDROID_*` variables,
docs/operations/mobile-release.md; build the private assets first, below):

```sh
python3 packages/kinetix_lessons/tool/bundle_puc.py <zynetix-smart-classroom>/content apps/board/assets/lessons/puc --include-school
python3 apps/board/tool/build_class_bank.py <zynetix-smart-classroom>/content/packs
bash packages/kinetix_cs/tool/fetch_pyodide.sh   # Python for the CS lessons' code lab, offline
flutter build apk --release --split-per-abi --target-platform android-arm64,android-arm --dart-define=KINETIX_EDITION=classroom
```

What the Classroom APK leaves out (the KINETIX Board keeps all of it; `android/app/build.gradle.kts`):

* Sims and 3D models no PUC lesson uses: only the PhET sims and 3D viewer models in
  [`classroom_assets.dart`](classroom_assets.dart) go in (16 of 51 PhET sims, 39 of 46 models),
  and no JupyterLite (the CS lessons run Python in the code lab, which needs Pyodide's core,
  fetched above). `test/classroom_edition/classroom_assets_test.dart` works the lists out from the
  lesson files, prints them, and fails when a lesson starts using something left out
  (`CLASSROOM_ASSETS_WRITE=1 flutter test test/classroom_edition/classroom_assets_test.dart`
  rewrites them). Gradle excludes the rest as Flutter's assets are copied into the APK; the Sims
  hub and the 3D library list only what is there (`simIncluded`, `ModelCatalogue.bundledViewerModels`,
  set in `main.dart`).
* The camera, WebRTC (casting), speech-to-text and ML Kit handwriting plugins: their code,
  native libraries and manifest entries. Gradle compiles a copy of Flutter's
  `GeneratedPluginRegistrant.java` without them and drops them from the classpath; the Dart side
  never reaches them in this edition (`Edition.onlineTools` / `Edition.ai`).
* Native libraries are stored compressed (`useLegacyPackaging`): a smaller download, unpacked
  by Android at install.
* R8 stays off (`-Pkinetix.minify=true` turns it on, keep rules in `android/app/proguard-rules.pro`):
  it builds (keep rules cover the plugins, the WebView bridges and package:jni) and takes the
  arm64 APK from 90.8 MB to 79.5 MB, but no minified APK has run on a panel yet.

The edition has its own version, `classroom_version:` in `apps/board/pubspec.yaml` (x.y.z+build;
bump the build for every release; `--dart-define=KINETIX_CLASSROOM_VERSION=…` or
`-Pkinetix.classroomVersion=…` override it). With `--split-per-abi` Flutter adds 1000 × the ABI
to the build: armeabi-v7a 1xxx, arm64-v8a 2xxx (1.0.0 was 1001 / 2001). It needs no
`KINETIX_API_URL`: without it a release starts offline and "Pair with Teacher App" asks for the
server address (`resolveServerUrl` in `core/server_config.dart`).

### Android set-up

`minSdk` 28 (Android 9) and `targetSdk` 36, pinned in `build.gradle.kts` for this edition (the
KINETIX Board follows Flutter's). No Android backup to the cloud (`allowBackup="false"`, and
`res/xml/classroom_data_extraction_rules.xml` on Android 12+): the settings file holds the school
PIN's hash; the college's backups are its own (Backup & restore). A device-to-device transfer
takes everything but the secure storage. The APK asks for INTERNET, RECEIVE_BOOT_COMPLETED,
WRITE_EXTERNAL_STORAGE (Android 9 only), REQUEST_INSTALL_PACKAGES and SYSTEM_ALERT_WINDOW, and
none of CAMERA or RECORD_AUDIO (`test/classroom_edition/android_config_test.dart`; check a
release with `aapt2 dump permissions`).

### Updates without the Play Store

Settings → This board → App updates (`update/`): **Check for update** reads
`https://raw.githubusercontent.com/amjad03/zynetix-smart-classroom/apk-builds/classroom-update.json`,
shows the version and its notes (English / Kannada), downloads the APK for the board's ABI with
progress, checks its size and SHA-256 (a damaged file is deleted), and opens Android's installer
(`android/…/Updater.kt`: ACTION_VIEW on a FileProvider URI, `REQUEST_INSTALL_PACKAGES`, the
teacher's "Install unknown apps" switch). **Install from USB…** picks an APK, checks that it is
`in.zynetix.classroom`, newer than the board's and signed with the same certificate, then
installs it. Android itself refuses a different signature or an older version. The start
screen's Settings button shows a small dot while a newer version waits: checked at most once a
day, only when the board is online; nothing is ever installed without the teacher.

With every release, publish the manifest beside the APKs:

```sh
python3 apps/board/tool/classroom_update_manifest.py --version 1.1.0+2 --notes-en "…" --notes-kn "…" \
  --base-url https://media.githubusercontent.com/media/amjad03/zynetix-smart-classroom/apk-builds \
  --out classroom-update.json zynetix-classroom-1.1.0-arm64-v8a.apk zynetix-classroom-1.1.0-armeabi-v7a.apk
```

(`media.githubusercontent.com` serves the Git LFS file itself; `raw.githubusercontent.com` would
give its pointer.) `test/classroom_edition/app_update_test.dart` covers the manifest, the daily
check, the SHA-256 check, USB APKs and the screens.

`android/app/build.gradle.kts` reads `KINETIX_EDITION` from Flutter's dart-defines (or
`-Pkinetix.edition=classroom`, or the `KINETIX_EDITION` environment variable) and gives the app
its own application id and label, so it installs next to the KINETIX Board. Without the define
the build is the KINETIX Board, unchanged.

In Dart, [`Edition`](edition.dart) says which edition runs: `Edition.classroom`, and
`Edition.ai` (false in the Classroom edition). Tests set `Edition.classroom = true` before
pumping the app and put it back in `tearDown`.

## What the edition changes

| Area | Where |
| --- | --- |
| No AI: AI pen, KINETIX AI button and tab, Text/Shape AI, tidy shapes, Read with AI, solver, ink conversion, AI quiz/homework/class prep, AI help and tour steps, dictionary meanings, Books' Explain/Quiz, worksheets, live captions, voice commands, flowchart "Suggested next" | `Edition.ai` checks in `features/board/board_screen.dart`, `layout/pen_*.dart`, `panel/split_panel.dart`, `kit/kit_panel.dart`, `profile_menu.dart`, `extras/board_extras.dart`, `books/`, `language_kit/`, `help/`, `search/`, `ai/ai_controller.dart` (`canUseAi`), `kinetix_ink`'s `flowSuggestionsEnabled` |
| Start screen and "Who's teaching" (no enrolment) | `start/classroom_start.dart`, shown by `main.dart` for `BoardStage.needsEnrollment`. "Pair with Teacher App" shows the usual `EnrollScreen`. |
| Teachers, classes (roll numbers only), timetable, school PIN (1234 until the first set-up changes it) | `local/classroom_store.dart` (shared preferences through `DeviceStore`), `settings/classroom_settings.dart` |
| A class without a server | `local/local_class.dart` → `BoardController.startLocalClass`; `board.localClass`; End class → `showClassroomStart()` |
| Simple board, Show all tools (remembered), What do I do now?, guided tour, practice board | `board/ce_board.dart` + the Classroom edition section of `board_screen.dart` |
| Phones (shortest side < 600 dp): the 1920 × 1080 board scaled to fit, letterboxed | `ui/phone_fit.dart` (wraps the app in `main.dart`) |
| 4K panels that report a pixel ratio under 1.5 (shortest side over 1300 px): laid out at 1920 across and scaled up; College settings → This board → Screen size (Smaller / Normal / Larger, saved on the board) on top | `ui/screen_fit.dart` (wraps the app in `main.dart`), `ClassroomStore.screenSize` |
| Boards saved on the board, per teacher and class (Save names it class · subject · date; Open: thumbnails, Recent, search, delete after asking); no sharing or version history in a local class; an autosave slot per teacher and class | `boards/board_library.dart`, `boards/board_library_ui.dart`, `_ceSave`/`_ceOpen` in `board_screen.dart`, `ceAutosaveSlot` |
| Settings → Backup & restore: Back up now (one versioned zip: app storage, Documents/Zynetix, Copy to a USB drive), a daily backup kept 14 days, restore after a preview and the PIN, marks as CSV and PDF | `backup/` (`backup.dart`, `backup_page.dart`, `marks_export.dart`, `public_documents.dart` + `android/…/DocumentSaver.kt`) |
| Timetable editing: bell times (ready sets or the college's own, Monday to Saturday, `CeSetup.bells`), a touch time picker instead of typing HH:MM, clashes (same teacher or class at an overlapping time) shown in the period dialog and on the timetable and saved only after asking, Copy this day to… and Clear day with confirmation and Undo | `settings/timetable_editor.dart`, `settings/classroom_settings.dart`, `ClassroomStore.clashesWith` / `copyDay` / `clearDay` |
| First-run set-up wizard while nobody has set the board up (no college name, no teachers, never finished): 1 college, 2 classes (1st/2nd PUC, section, stream, roll numbers by − / + buttons), 3 teachers (name, subject chips), 4 bell times for Monday to Saturday, 5 the school PIN (the forced change from 1234 and the recovery code; not skippable while 1234), 6 done with the short tour on the practice board. Back on every step, Skip where safe, saved step by step; run again from Settings → This board | `start/setup_wizard.dart`, `ClassroomStore.needsSetup` / `setupDone` |
| Help (start screen, Settings, the board's menu): nine short how-tos (teach a class, lessons, put on board, class quiz, mock test, save and open boards, backup, timetable, PIN), each step with a picture of the control drawn from widgets, in English and Kannada; Print the quick-start sheet: one A4 page with all of them | `help/ce_help.dart`, `help/quick_start_pdf.dart` |
| A damaged set-up is kept (`classroom.setup.bad-<ms>`), the copy before the last change (`classroom.setup.prev`) comes back, and the start screen asks: keep it, or restore a backup | `local/classroom_store.dart`, `start/setup_problem.dart` |
| School PIN: PBKDF2 (old SHA-256 hashes migrate), a number pad, a forced change from 1234 at first set-up, 5 tries then a lockout that doubles, a recovery code shown once (Print, Save) | `local/school_pin.dart`, `settings/pin_pad.dart` |
| Changing or removing a teacher needs the PIN; Remove sits apart from Save, asks what will be lost, and offers Undo for 10 s (teachers, classes, periods) | `start/classroom_start.dart`, `settings/classroom_settings.dart`, `ui/ce_confirm.dart` |
| No camera or online tools: no Camera, Videos, Web or Cast tab or tool, no 3D or handwriting downloads (`Edition.onlineTools`); the Android build removes CAMERA, RECORD_AUDIO and the speech-recognition query (`android/app/src/classroom/AndroidManifest.xml`, merged by `build.gradle.kts`) | `edition.dart`, `split_panel.dart`, `board_screen.dart`, `board_extras.dart`, `mlkit_handwriting.dart`, `kinetix_3d` `ModelCatalogue.downloads` |
| Crashes: the autosave is written first, then a rotating crash log in app storage (in every backup); a friendly card instead of a red screen, "Something went wrong – Back to start" | `core/crash/` (installed in `main.dart`) |
| English and Kannada: every word of the edition in `l10n/ce_strings.dart` (`context.ce('Start my class')`, `ceTr` without a context, `{name}` placeholders) with the Kannada in `l10n/ce_kannada.dart`, keyed by the English. The start screen's big ಕನ್ನಡ / English switch sets the board's language (saved; a class keeps it). PDFs (marks, the recovery code, the quick-start sheet) draw Kannada through `ui/ce_pdf_text.dart`: the pdf package cannot shape Kannada, so Flutter's text engine lays it out with the bundled OFL Noto Sans Kannada and it goes in as a picture. Question papers and worksheets print in English (English-medium exam papers). `test/classroom_edition/ce_strings_test.dart` fails on a missing Kannada string or a bare `Text('…')` | `l10n/`, `start/language_switch.dart`, `ui/ce_pdf_text.dart` |
| Settings → This board → When the board starts: "Open Zynetix when the board starts" (the `BOOT_COMPLETED` receiver, no device owner; Android 10+ also needs "Display over other apps", which it asks for) and "Make Zynetix the home app" (turns on the HOME entry point and opens Android's Default home app screen). Panel limits: docs/hardware/kiosk-mode.md | `settings/startup_settings.dart`, `android/…/BoardStartup.kt`, `BootReceiver.kt` |
| Start-up on slow panels: the lessons' catalogue is not read while the app starts, only when the Lessons panel or the start screen's "Next lesson" line first needs it (the start screen draws again when it is in, `LessonLibrary.loadedCount`); chapters, School overlays and the question bank are unzipped and decoded off the UI isolate (`Isolate.run`; widget tests decode in place, `OffThread.enabled`). `test/classroom_edition/startup_test.dart` prints the stalls and the cold start on the test harness | `local/off_thread.dart`, `lessons/lesson_library.dart`, `class_tools/bank.dart`, `installLessonHooks` |
| Demo build (`KINETIX_DEMO=true`): the sample PU college seeded into the board's own store, roll numbers only (no ERP demo server) | `local/sample_college.dart`, `classroomDemoBoard` in `main.dart` |

## Seams for phase 2

### Lessons — `lessons/lessons_panel.dart`

```dart
class LessonsPanel extends StatelessWidget {
  const LessonsPanel({super.key, required this.host});
  final ClassroomHost host;
}
```

Replace the placeholder body; keep the class name and constructor. The board shows it for
`PanelKind.lessons` (the panel's **Lessons** tab, the toolbar's Lessons button, Classroom Apps →
Lessons). Optional hooks in `classroom_hooks.dart`:

* `ClassroomHooks.nextLessonLine = (CeClass cls, String subject) => 'Next lesson: Coulomb’s law · step 3 of 8';`
  — the start screen's line under the class (the number of students is added after it).
* `ClassroomHooks.panelTip = () => 'Explain the picture, then tap Next for step 4.';`
  — the "What do I do now?" tip while Lessons or Class tools is open (null: the board's own).

### Class tools — `class_tools/class_tools_hub.dart`

```dart
class ClassToolsHub extends StatefulWidget {
  const ClassToolsHub({super.key, required this.host, this.initialTool});
  final ClassroomHost host;
  final String? initialTool; // 'quiz', 'mock', 'drill', 'teams', 'plan', 'mastery', 'worksheets', 'picker', 'timer', 'papers'
}
const classTools = <ClassTool>[...]; // ({String id, IconData icon, String title, String line, Color colour})
Widget classToolTile(ClassTool t, {double width, double height, VoidCallback? onTap});
```

The board shows it for `PanelKind.classTools` (the panel's **Class tools** tab). The toolbar's
Class tools button opens Classroom Apps with the `classTools` tiles on top; tapping one opens
the hub with `initialTool` set to its id (the hub is rebuilt with a new key each time).

## Class tools (phase 2b)

All offline, no AI, and by roll number only. `class_tools/`:

| Tool | File | What it does |
| --- | --- | --- |
| Class quiz | `quiz_view.dart` | Chapter and topics, 3/5/10 questions; each question goes on a new board page; tap a roll number once for right, twice for wrong (absent ones greyed out and skipped); Mark all right; Show result on board; marks saved per question |
| Mock test | `mock_view.dart` | PUC board pattern with the board's internal choice (chapter test 25, unit test 35, the subject's annual paper: 70, Mathematics 80, with Part E for Chemistry, Mathematics and Biology; multiple choice) or an entrance pattern from the bank; parts editable; paper preview with Roll No.; Print *n* copies (set A/B for neighbouring benches), Export PDF, answer key on its own page; marks entered per roll number |
| Formula drill | `drill_teams_plan.dart` | One formula at a time, hidden until shown (typeset TeX); Put on board as an equation |
| Teams | `drill_teams_plan.dart` | Present roll numbers by benches or mixed into 2–6 teams (Karnataka's rivers); points; scoreboard on the board |
| Class plan | `drill_teams_plan.dart` | The subject's chapters spread to the exam date with revision weeks; on track or behind; this week's chapter |
| Mastery map | `mastery_view.dart` | Topics × roll numbers from class quizzes and mock tests; class score; Revisit / Strongest / Small group cards; Print; Make a revision quiz |
| Worksheets | `worksheets_view.dart` | From the bank: chapter, topics, how many MCQs, short answers and problems; Print / Export PDF with key; Put on board |
| Pick a roll no., Timer | `drill_teams_plan.dart` | Fair random pick of present roll numbers; big countdown |
| Past papers | `../past_papers/` | KCET, NEET, JEE, COMEDK, PUC and CBSE papers from a USB stick (PIN) or a paper pack; filters, full-screen viewer, answer key, exam timer, Put page on board, practice and a class quiz with the exam's marking ([README](past_papers/README.md)) |

How a mock paper is made (`paper.dart`, `buildPaper`): Part A takes multiple-choice questions;
Parts B, C and D take only written questions the bank sized for 2, 3 and 5 marks
(`BankChapter.shorts`, `mediums`, `longs`) and problems sized for the part (`BankProblem.size`;
Mathematics mixes theory and problems in every part, as its papers do; other subjects fall back to
a problem only when the theory runs out). Every written prompt must pass `examPromptProblem` (no
flash-card stems like "Flux Φ = ?", no "Explain: …" glue, no multiple-choice stems or option
letters, no missing figures) and none is asked twice or repeats a Part A stem. Each part prints
its instruction ("Answer any FIVE of the following questions.") and marks line ("(5 × 2 = 10)");
when the chapters cannot fill a part it offers fewer questions with the same number spare, and a
part with none is left out, so the paper is shorter rather than padded. The annual patterns follow
the shape of the KSEAB model papers (parts, marks per question and choice); compare the question
counts with the current year's blueprint before relying on them for a board rehearsal.

Logic without widgets (tested): `class_logic.dart` (quiz marks, mastery, teams, plan),
`paper.dart` (patterns and paper generation, set B shuffling), `paper_pdf.dart` (PDFs with the
board's Inter font; `ClassToolsOut.print` / `.share` use `printing`). Records:
`class_records.dart` keeps `ClassRecords` per class in the board's settings
(`setting.classTools.<classId>`): quiz marks, mock tests and marks, teams, plans.

### The question bank (private, built at build time)

The question, formula and mock-pattern bank comes from the owner's private Zynetix School
content and is **never committed**. Before building the app:

```sh
python3 apps/board/tool/build_class_bank.py <zynetix-smart-classroom>/content/packs
# reads puc1-*/puc2-* packs (+ ../syllabus and the board's patterns.json when present) and
# writes apps/board/assets/private/class_tools/{index.json,puc<y>-<subject>.json.gz}
# The year of each chapter comes from its id and must agree with the pack folder and the
# syllabus (the build stops otherwise). Written questions are made conservatively from the
# lessons: objectives that already read as exam questions (Define, State, Distinguish between,
# Derive…), the recap's real questions and homework, and worked examples sized 2/3/5 marks.
```

That folder is gitignored (only its `README.txt` is committed) and listed in `pubspec.yaml`, so
the bank is bundled when present. `bank.dart` (`ClassBank.load`) reads the class's year and
subject from it; without it the tools use the Lessons' bundled questions (each chapter's
`assets/lessons/puc/<chapterId>.json.gz`, plus the School overlay's questions from
`assets/private/lessons/<chapterId>.json.gz` when built; single-answer MCQs, assertion–reason
and case-based), else show an empty state (Teams, Pick a roll
no., Timer still work). Tests use small invented fixtures, never the bank.

### The board and the roster — `classroom_hooks.dart`

`ClassroomHost` (one per board screen, handed to both panels):

```dart
// The local roster (roll numbers only; never a student's name)
ClassroomStore get store;          // teachers, classes, slots (timetable); a ChangeNotifier
CeClass? get currentClass;         // the class being taught (null on an ERP-paired board)
CeTeacher? get currentTeacher;
String? get subject;
List<int> get rolls;               // 1 … rollCount
Set<int> get absentRolls;          // from today's attendance
List<int> get presentRolls;

// Put on board (the current page, a free spot in view, one group; the pen keeps writing)
List<BoardElement> putElements(List<BoardElement> elements, {Offset? at, bool select = false});
Future<List<BoardElement>> putImage(Uint8List bytes, {double? width, String? title, Offset? at});
Future<List<BoardElement>> putWidget(Widget widget, {required Size size, BuildContext? context, double pixelRatio = 2, String? title, Offset? at});
List<BoardElement> putText(String text, {double fontSize = 40, bool bold = false, Color? color, Offset? at});
List<BoardElement> putNote(String text, {Size size, Color color, double fontSize = 28, Offset? at});
void newPage();

// The board around the panel
final BoardController board;  final WhiteboardController wb;
final VoidCallback closePanel, openLessons, openClassTools;
final void Function(String) showMessage;
```

`renderWidgetToPng(widget, size: …)` (same file) draws any widget off screen to PNG bytes.

`ClassroomStore` (`local/classroom_store.dart`) also has `classById`, `rollsOf(classId)`,
`teacher(id)`, `slotNow()`, `slotNowOrNext()`, `today()`, `classesOf(teacherId)`. In a local
class the board's roster is `rollRoster(cls)`: ids `roll-N`, names "Roll N" (`rollOf(student)`
gives N back), so attendance, the name picker and groups show roll numbers.

Styles for the edition's surfaces (navy, pastels, pills, big buttons): `ui/ce_style.dart`.

## Lessons (phase 2a) — `lessons/`

The PUC lessons from the Zynetix chapter packs, bundled offline: 337 chapters (1st and 2nd PUC,
every subject), 1,518 lessons, about 18,300 steps. The panel (`lessons_panel.dart`) has level
and subject chips, pastel chapter cards ("x of n taught"), the chapter's lessons, and the lesson
step by step: the step's picture, sim or lab, its line (Read aloud with the board's own voice),
Back / Next, English / ಕನ್ನಡ where the lesson has Kannada, and **Put on board** (the title, the
picture — a whiteboard scene as editable lines, shapes, text and equations, anything else as a
picture — the key formula as an equation and the key point as a note, one group on the page).

| Piece | Where |
| --- | --- |
| The Zynetix lesson blocks (ported from the Zynetix board: whiteboard scenes, interactives, activities, challenges, worked examples, cards, quick checks; labs, 3D, animations and CS players from the Kinetix packages) | `packages/kinetix_lessons` |
| Catalogue and chapters (`assets/lessons/puc/catalogue.json`, `<chapterId>.json.gz`) | `lessons/lesson_library.dart` |
| Progress per class (step reached, taught, last lesson; shared preferences `ce.lessons.<classId>`) | `lessons/lesson_progress.dart` |
| Put on board | `lessons/lesson_board.dart` |
| PhET sims (the Simulations hub's offline copies), concept-video card (opens only online; "Needs internet" offline) | `lessons/lesson_embeds.dart` |
| `ClassroomHooks.nextLessonLine` and `panelTip` | `installLessonHooks()` (called from `main.dart`), `LessonsPanelState._tip` |

### Building the lesson assets

```sh
# Our own lesson blocks only; these are committed (about 7.4 MB gzipped).
python3 packages/kinetix_lessons/tool/bundle_puc.py <zynetix-smart-classroom>/content apps/board/assets/lessons/puc
```

The parts imported from the Zynetix School site (explainer and concept-video blocks, formula
sheets, mock-test patterns and the imported exam questions) are **never committed** to this
repository. A build that should carry them runs, before `flutter build`:

```sh
python3 packages/kinetix_lessons/tool/bundle_puc.py <zynetix-smart-classroom>/content apps/board/assets/lessons/puc --include-school
```

which also writes one overlay per chapter (and `patterns.json`) to the gitignored
`apps/board/assets/private/lessons/` (about 0.5 MB). The board merges an overlay into its chapter
when it is there and works without it (`LessonLibrary(school: false)` ignores it).

`test/classroom_edition/lessons_test.dart` covers the catalogue, the overlay merge, progress,
the start-screen line, steps and Put on board; `lessons_sweep_test.dart` draws every step of
every bundled lesson (`LESSONS_SWEEP=physics` narrows it); `lessons_shots_test.dart` writes
screenshots when `LESSONS_SHOTS=<dir>` is set.

## Tests

`test/classroom_edition/`: the edition switch and Android ids, no AI in any main menu (and the
same walk finding KINETIX AI on the KINETIX Board), the start flow, roster persistence and
Settings, phone scaling with ink under the finger, and Put on board. `ce_shots_test.dart` writes
screenshots when `CE_SHOTS=<dir>` is set. `release_flow_test.dart` walks the whole edition (start,
Who's teaching, Simple board, Lessons, Put on board, Class tools, quiz, mastery map, mock test,
all tools) at 1920 × 1080 and on a phone (844 × 390) on the real lessons and bank, writing
screenshots when `RELEASE_SHOTS=<dir>` is set; a few are in `apps/board/screenshots/classroom-edition/`
(never more than one bank question in a picture). `class_tools_test.dart`: quiz marking and persistence,
mastery, mock tests and their PDF, teams, plan, worksheets, and the board without the bank;
`mock_papers_test.dart` makes about 2,000 papers from the real bank (every subject and year,
every chapter, unit and annual, several seeds) and fails on any awkward prompt, repeated question,
wrong choice line or marks that do not add up (skipped without the bank); `puc_years_test.dart`
checks every Physics, Chemistry, Mathematics and Biology chapter against the NCERT Class 11/12
lists (1st/2nd PUC), the bank's years, how a year is read, and the sample timetable;
`ce_tools_shots_test.dart` writes the Class tools' screenshots (`tools-*.png`) from the real bank
when it is built.
