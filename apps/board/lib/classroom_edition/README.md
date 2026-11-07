# Zynetix Board — Classroom edition

The KINETIX Board built for PU colleges that do not use the Zynetix ERP: no AI anywhere, works
offline from the board's own timetable, teachers and classes, and opens on the Simple board.
Same code base as the board; the edition is chosen at build time.

## Building it

```sh
flutter build apk --dart-define=KINETIX_EDITION=classroom      # Android: in.zynetix.classroom, "Zynetix Classroom"
flutter run --dart-define=KINETIX_EDITION=classroom
```

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
| Teachers, classes (roll numbers only), timetable, school PIN (1234) | `local/classroom_store.dart` (shared preferences through `DeviceStore`), `settings/classroom_settings.dart` |
| A class without a server | `local/local_class.dart` → `BoardController.startLocalClass`; `board.localClass`; End class → `showClassroomStart()` |
| Simple board, Show all tools (remembered), What do I do now?, guided tour, practice board | `board/ce_board.dart` + the Classroom edition section of `board_screen.dart` |
| Phones (shortest side < 600 dp): the 1920 × 1080 board scaled to fit, letterboxed | `ui/phone_fit.dart` (wraps the app in `main.dart`) |

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
class ClassToolsHub extends StatelessWidget {
  const ClassToolsHub({super.key, required this.host, this.initialTool});
  final ClassroomHost host;
  final String? initialTool; // 'quiz', 'mock', 'drill', 'teams', 'plan', 'mastery', 'worksheets', 'picker', 'timer'
}
const classTools = <ClassTool>[...]; // ({String id, IconData icon, String title, String line, Color colour})
Widget classToolTile(ClassTool t, {double width, double height, VoidCallback? onTap});
```

The board shows it for `PanelKind.classTools` (the panel's **Class tools** tab). The toolbar's
Class tools button opens Classroom Apps with the `classTools` tiles on top; tapping one opens
the hub with `initialTool` set to its id (the hub is rebuilt with a new key each time).

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

## Tests

`test/classroom_edition/`: the edition switch and Android ids, no AI in any main menu (and the
same walk finding KINETIX AI on the KINETIX Board), the start flow, roster persistence and
Settings, phone scaling with ink under the finger, and Put on board. `ce_shots_test.dart` writes
screenshots when `CE_SHOTS=<dir>` is set.
