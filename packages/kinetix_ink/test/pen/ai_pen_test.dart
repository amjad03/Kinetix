import 'dart:convert';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../lesson_test.dart' show FakeStopwatch;
import 'pen_helpers.dart';

/// Reads successive lines as the next entry of [script], and remembers what it was told.
class ScriptReader implements HandwritingRecognizer {
  ScriptReader(this.script, {this.state = HandwritingModelState.ready});

  final List<List<String>> script;
  final HandwritingModelState state;
  int i = 0;
  final contexts = <String>[];
  final languages = <String>[];

  @override
  String get engine => 'test';
  @override
  bool get available => true;
  @override
  Future<HandwritingModelState> modelState(String language) async => state;
  @override
  Future<bool> prepare(String language) async => true;
  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    contexts.add(preContext);
    languages.add(language);
    return script[i++ % script.length];
  }
}

/// Draws [s] on the board with the current tool, as a pen would.
void draw(WhiteboardController wb, List<Offset> s, {int pointer = 1}) {
  wb.pointerDown(pointer, InkPoint(s.first.dx, s.first.dy));
  for (final p in s.skip(1)) {
    wb.pointerMove(pointer, InkPoint(p.dx, p.dy));
  }
  wb.pointerUp(pointer);
}

void drawAll(WhiteboardController wb, List<Stroke> strokes) {
  for (final s in strokes) {
    draw(wb, [for (final p in s.points) p.offset]);
  }
}

/// A "word": three small letter-like strokes starting at x.
List<List<Offset>> word(double x, double y) => [
  for (var k = 0; k < 3; k++) [Offset(x + k * 18, y), Offset(x + k * 18 + 8, y + 30), Offset(x + k * 18 + 14, y)],
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late WhiteboardController wb;
  late AiPenController pen;

  setUp(() {
    wb = WhiteboardController()..tool = BoardTool.aiPen;
    pen = AiPenController(wb)..mode = AiPenMode.tap;
  });

  tearDown(() {
    pen.dispose();
    wb.dispose();
  });

  test('a rough triangle becomes a clean one; undo brings the ink back, redo the shape', () async {
    draw(wb, sketch(const [Offset(200, 40), Offset(340, 260), Offset(60, 260)]));
    expect(pen.pending, hasLength(1));
    await pen.convertPending();
    final shape = wb.elements.single as Stroke;
    expect(shape.shape, ShapeKind.triangle);
    expect(pen.conversions[shape.id]!.kind, ConversionKind.shape);
    wb.undo();
    final ink = wb.elements.single as Stroke;
    expect(ink.shape, isNull);
    expect(ink.style.tool, InkTool.pen);
    wb.redo();
    expect((wb.elements.single as Stroke).shape, ShapeKind.triangle);
  });

  test('handwritten maths becomes a typeset equation with no handwriting model', () async {
    drawAll(wb, [
      ...write('2', const Offset(100, 100)),
      ...write('+', const Offset(140, 104), h: 32),
      ...write('3', const Offset(186, 100)),
      ...write('=', const Offset(230, 104), h: 32),
      ...write('5', const Offset(276, 100)),
    ]);
    await pen.convertPending();
    final m = wb.elements.single as MathElement;
    expect(m.latex, '2 + 3 = 5');
    expect(pen.solverText(m), '2+3=5');
    // An ordinary element: it moves and undoes like any other.
    wb.select({m.id});
    wb.transformSelection((e) => e.translated(const Offset(50, 0)));
    expect((wb.elements.single as MathElement).position.dx, m.position.dx + 50);
    // Back to ink: where the equation is now.
    pen.revertToInk(m.id);
    final strokes = wb.elements.whereType<Stroke>().toList();
    expect(strokes, hasLength(8));
    expect(inkBounds(strokes).left, closeTo(150, 2));
    wb.undo();
    expect(wb.elements.single, isA<MathElement>());
  });

  test('words become text: the next word joins the line, other readings, back to ink', () async {
    final reader = ScriptReader([
      ['Photosynthesis', 'Photo synthesis'],
      ['needs', 'reeds'],
    ]);
    pen.handwriting = reader;
    for (final s in word(100, 100)) {
      draw(wb, s);
    }
    await pen.convertPending();
    var text = wb.elements.single as TextElement;
    expect(text.text, 'Photosynthesis');
    for (final s in word(text.bounds.right + 20, 100)) {
      draw(wb, s);
    }
    await pen.convertPending();
    text = wb.elements.single as TextElement;
    expect(text.text, 'Photosynthesis needs');
    expect(reader.contexts.last, 'Photosynthesis ');
    expect(reader.languages.last, 'en');
    pen.choose(text.id, 1);
    expect((wb.elements.single as TextElement).text, 'Photosynthesis reeds');
    pen.edit(text.id, 'Photosynthesis needs light');
    expect((wb.elements.single as TextElement).text, 'Photosynthesis needs light');
    pen.revertToInk(text.id);
    expect(wb.elements.whereType<Stroke>(), hasLength(6));
  });

  test('a maths line read by the word model is typeset through the solver\'s parser', () async {
    pen.handwriting = ScriptReader([
      ['2x+5=1S', '2x+5=15'],
    ]);
    for (final s in word(100, 300)) {
      draw(wb, s);
    }
    await pen.convertPending();
    final m = wb.elements.single as MathElement;
    expect(m.latex, '2x + 5 = 15');
    expect(pen.solverText(m), '2x+5=15');
  });

  test('without the language model, words stay ink and the teacher is told once', () async {
    final told = <AiPenNotice>[];
    pen
      ..handwriting = ScriptReader([
        ['hello'],
      ], state: HandwritingModelState.needsDownload)
      ..onNotice = told.add;
    for (final s in word(100, 100)) {
      draw(wb, s);
    }
    await pen.convertPending();
    expect(wb.elements.whereType<Stroke>(), hasLength(3));
    for (final s in word(100, 200)) {
      draw(wb, s);
    }
    await pen.convertPending();
    expect(told, [AiPenNotice.modelNeeded]);
  });

  test('scribbling over ink rubs it out; one undo brings it back without the scribble', () async {
    wb.tool = BoardTool.pen;
    draw(wb, line(const Offset(100, 100), const Offset(200, 110)));
    final kept = wb.elements.single.id;
    wb.tool = BoardTool.aiPen;
    draw(wb, [for (var i = 0; i < 40; i++) Offset((i % 2 == 0 ? 90 : 210) + i * 0.5, 90 + i * 0.6)]);
    expect(wb.elements, isEmpty);
    wb.undo();
    expect(wb.elements.single.id, kept);
  });

  test('a tap with the AI pen on a conversion shows its readings and leaves no dot', () async {
    draw(wb, roughCircle(const Offset(300, 300), 120));
    await pen.convertPending();
    final circle = wb.elements.single;
    draw(wb, [const Offset(300, 180), const Offset(301, 180)]);
    expect(pen.inspecting.value, circle.id);
    expect(wb.elements, [circle]);
  });

  test('the pen tidies shapes only when asked, and never reads words', () async {
    wb.tool = BoardTool.pen;
    draw(wb, roughCircle(const Offset(300, 300), 120));
    await pen.convertPending();
    expect((wb.elements.single as Stroke).shape, isNull);
    pen.snapShapes = true;
    draw(wb, roughCircle(const Offset(700, 300), 120));
    await pen.convertPending();
    expect(wb.elements.whereType<Stroke>().where((s) => s.shape == ShapeKind.circle), hasLength(1));
  });

  test('"it is a shape" and "it is writing" correct the reading and learn the letter size', () async {
    final sizes = <double>[];
    pen
      ..handwriting = ScriptReader([
        ['o'],
      ])
      ..onLetterSize = sizes.add;
    draw(wb, roughCircle(const Offset(300, 300), 120));
    await pen.convertPending();
    final circle = wb.elements.single;
    await pen.toWriting(circle.id);
    expect((wb.elements.single as TextElement).text, 'o');
    expect(pen.letterPx, greaterThan(46));
    expect(pen.toShape(wb.elements.single.id), isTrue);
    expect((wb.elements.single as Stroke).shape, ShapeKind.circle);
    expect(sizes, isNotEmpty);
  });

  test('recordings and the live view show what the AI pen made, and the ink before it', () async {
    final clock = FakeStopwatch();
    // One recorder for the recording, one for the live view (as the board has).
    final rec = LessonRecorder(board: wb, background: BoardBackground.plain, canvas: const Size(1280, 720), stopwatch: clock)..start();
    final stream = LessonRecorder(board: wb, background: BoardBackground.plain, canvas: const Size(1280, 720))..start();
    final live = LessonPlayer.live();
    drawAll(wb, [...write('x', const Offset(400, 100)), ...write('2', const Offset(436, 82), h: 22)]);
    draw(wb, sketch(const [Offset(200, 300), Offset(340, 520), Offset(60, 520)]));
    live.applyLive(stream.drain());
    expect(live.elements.whereType<Stroke>(), hasLength(4), reason: 'the ink as written');
    clock.advance(900);
    await pen.convertPending();
    clock.advance(100);
    live.applyLive(stream.drain());
    List<String> snapshot(List<BoardElement> els) => [for (final e in els) jsonEncode(encodeElement(e))];
    expect(snapshot(live.elements), snapshot(wb.elements));
    expect(live.elements.whereType<MathElement>().single.latex, 'x^{2}');
    expect(live.elements.whereType<Stroke>().single.shape, ShapeKind.triangle);
    final lesson = Lesson.fromJson(jsonDecode(jsonEncode(rec.stop())) as Map<String, dynamic>);
    final player = LessonPlayer(lesson)..seek(lesson.duration);
    expect(snapshot(player.elements), snapshot(wb.elements));
  });

  testWidgets('auto mode converts about a second after the last stroke', (tester) async {
    final board = WhiteboardController()..tool = BoardTool.aiPen;
    final auto = AiPenController(board);
    draw(board, sketch(const [Offset(50, 50), Offset(300, 52), Offset(302, 200), Offset(48, 198)]));
    await tester.pump(const Duration(milliseconds: 500));
    expect((board.elements.single as Stroke).shape, isNull);
    await tester.pump(const Duration(milliseconds: 600));
    expect((board.elements.single as Stroke).shape, ShapeKind.rectangle);
    auto.dispose();
    board.dispose();
  });
}
