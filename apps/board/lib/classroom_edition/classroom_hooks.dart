import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../core/board_controller.dart';
import '../core/models.dart';
import 'local/classroom_store.dart';
import 'local/local_class.dart';

/// Seams the Classroom edition's Lessons and Class tools (phase 2) plug into (README.md).
abstract final class ClassroomHooks {
  /// The start screen's line under the class ("Next lesson: Coulomb's law · step 3 of 8"),
  /// from the Lessons (null: only the number of students shows).
  static String? Function(CeClass cls, String subject)? nextLessonLine;

  /// The "What do I do now?" tip while the Lessons or Class tools panel is open (null: the
  /// board's own tip). Set by those panels; read whenever the pill rebuilds.
  static String? Function()? panelTip;
}

/// What the Lessons and Class tools panels may use on the board: the open class (roll numbers
/// only), the college's classes, and "Put on board". The board screen makes one and hands it to
/// `LessonsPanel` and `ClassToolsHub`.
class ClassroomHost {
  ClassroomHost({required this.board, required this.wb, required this.closePanel, required this.openLessons, required this.openClassTools, required this.showMessage});

  final BoardController board;

  /// The main board.
  final WhiteboardController wb;

  /// Closes the split panel (the board takes the whole screen again).
  final VoidCallback closePanel;

  /// Opens the Lessons or the Class tools in the split panel.
  final VoidCallback openLessons, openClassTools;

  /// A short message at the bottom of the board.
  final void Function(String message) showMessage;

  // --- The local roster ---------------------------------------------------------------------

  /// The college's teachers, classes and timetable on this board (a [ChangeNotifier]).
  ClassroomStore get store => board.classroom;

  /// The class being taught (null on a board paired with the ERP, or before a class starts).
  CeClass? get currentClass => store.currentClass;
  CeTeacher? get currentTeacher => store.currentTeacher;

  /// The subject of the open class ("Physics"), else the session's.
  String? get subject => store.currentSubject ?? board.session?.subjectName;

  /// Roll numbers of the open class, 1 … n.
  List<int> get rolls => currentClass?.rolls ?? [for (final s in board.roster) ?int.tryParse(s.rollNo)];

  /// Roll numbers marked absent in today's attendance.
  Set<int> get absentRolls => {
    for (final s in board.roster)
      if (board.attendance[s.id] == AttendanceMark.absent) ?(rollOf(s) ?? int.tryParse(s.rollNo)),
  };

  /// Roll numbers not marked absent (who can be asked, picked or put in a team).
  List<int> get presentRolls => [
    for (final r in rolls)
      if (!absentRolls.contains(r)) r,
  ];

  // --- Put on board ------------------------------------------------------------------------

  /// Puts [elements] (drawn around 0, 0) on the current page in a free spot in view, as one
  /// group. The board's tool stays as it was (the pen keeps writing) unless [select].
  List<BoardElement> putElements(List<BoardElement> elements, {Offset? at, bool select = false}) {
    if (elements.isEmpty) return const [];
    final tool = wb.tool;
    final placed = wb.insert(elements, at: at);
    if (!select) {
      wb.clearSelection();
      wb.tool = tool;
    }
    return placed;
  }

  /// Puts a picture (PNG or JPEG bytes) on the board, [width] wide on the board (its own width
  /// up to 900 when null), with an optional [title] above it.
  Future<List<BoardElement>> putImage(Uint8List bytes, {double? width, String? title, Offset? at}) async {
    final size = await imageSize(bytes);
    final w = width ?? (size.width > 900 ? 900.0 : size.width);
    final h = size.width == 0 ? w : w * size.height / size.width;
    final top = title == null ? 0.0 : 72.0;
    return putElements([
      if (title != null) TextElement(id: newElementId(), position: Offset.zero, text: title, color: _ink, fontSize: 44, bold: true, size: measureBoardText(title, 44, bold: true)),
      ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, top, w, h), bytes: bytes),
    ], at: at);
  }

  /// Draws [widget] at [size] (logical pixels, off screen) and puts the picture on the board —
  /// a diagram, a result chart, a question card. [context] lends its theme and fonts.
  Future<List<BoardElement>> putWidget(Widget widget, {required Size size, BuildContext? context, double pixelRatio = 2, String? title, Offset? at}) async {
    final png = await renderWidgetToPng(widget, size: size, context: context, pixelRatio: pixelRatio);
    return putImage(png, width: size.width, title: title, at: at);
  }

  /// Typed text on the board (a heading, a question, a key idea).
  List<BoardElement> putText(String text, {double fontSize = 40, bool bold = false, Color? color, Offset? at}) => putElements([
    TextElement(id: newElementId(), position: Offset.zero, text: text, color: color ?? _ink, fontSize: fontSize, bold: bold, size: measureBoardText(text, fontSize, bold: bold)),
  ], at: at);

  /// A sticky note on the board.
  List<BoardElement> putNote(String text, {Size size = const Size(360, 160), Color color = const Color(0xFFFFF4CC), double fontSize = 28, Offset? at}) =>
      putElements([NoteElement(id: newElementId(), rect: Offset.zero & size, text: text, color: color, fontSize: fontSize)], at: at);

  /// A new blank page after this one, and goes to it (to put a lesson step on a fresh page).
  void newPage() => wb.addPage(force: true);

  Color get _ink => wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
}

/// The pixel size of an encoded picture.
Future<Size> imageSize(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  final s = Size(frame.image.width.toDouble(), frame.image.height.toDouble());
  frame.image.dispose();
  codec.dispose();
  return s;
}

/// Draws [widget] off screen at [size] and answers it as PNG bytes. Only what paints at once is
/// drawn (text, shapes, CustomPaint, memory images already decoded); [context] lends its theme,
/// text direction and fonts.
Future<Uint8List> renderWidgetToPng(Widget widget, {required Size size, BuildContext? context, double pixelRatio = 2}) async {
  final view = ui.PlatformDispatcher.instance.implicitView ?? ui.PlatformDispatcher.instance.views.first;
  final boundary = RenderRepaintBoundary();
  final renderView = RenderView(
    view: view,
    child: RenderPositionedBox(alignment: Alignment.center, child: boundary),
    configuration: ViewConfiguration(logicalConstraints: BoxConstraints.tight(size), devicePixelRatio: 1),
  );
  final pipeline = PipelineOwner()..rootNode = renderView;
  renderView.prepareInitialFrame();
  final build = BuildOwner(focusManager: FocusManager());
  Widget child = MediaQuery(
    data: MediaQueryData(size: size),
    child: Directionality(textDirection: TextDirection.ltr, child: Material(type: MaterialType.transparency, child: widget)),
  );
  if (context != null && context.mounted) child = InheritedTheme.captureAll(context, child);
  final root = RenderObjectToWidgetAdapter<RenderBox>(container: boundary, child: SizedBox.fromSize(size: size, child: child)).attachToRenderTree(build);
  build
    ..buildScope(root)
    ..finalizeTree();
  pipeline
    ..flushLayout()
    ..flushCompositingBits()
    ..flushPaint();
  final image = await boundary.toImage(pixelRatio: pixelRatio);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}
