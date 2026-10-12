import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/handwriting/windows_handwriting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The AI pen through the real recogniser adapter ([WindowsHandwriting]): only the platform
/// channel it talks to is a mock. Every symbol and digit a recogniser can answer comes out on the
/// board as written, in a maths class and in language classes.
const _symbols = ['j', ':', ';', "'", '"', '/', '<', '>', ',', '?', '`', '~', '!', '@', r'$', '%', '^', '&', '*', '=', r'\'];
const _digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const _channel = MethodChannel('kinetix/handwriting');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final calls = <MethodCall>[];
  String reading = '';

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(_channel, (call) async {
      calls.add(call);
      return switch (call.method) {
        'languages' => ['en', 'hi', 'kn'],
        // One word, one reading: what the Windows recogniser would answer.
        'recognize' => [
          [reading],
        ],
        _ => null,
      };
    });
  });
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(_channel, null));

  Future<String> read(String symbol, InkDomain domain, String language) async {
    reading = symbol;
    final wb = WhiteboardController()..tool = BoardTool.aiPen;
    final pen = AiPenController(wb)
      ..mode = AiPenMode.tap
      ..domain = domain
      ..language = language
      ..handwriting = WindowsHandwriting(channel: _channel);
    // One small stroke, like a single written mark.
    wb.pointerDown(1, InkPoint(100, 100));
    wb.pointerMove(1, InkPoint(108, 130));
    wb.pointerMove(1, InkPoint(114, 100));
    wb.pointerUp(1);
    await pen.convertPending();
    final e = wb.elements.single;
    final out = e is TextElement ? e.text : (e as MathElement).latex;
    pen.dispose();
    wb.dispose();
    return out;
  }

  final contexts = <(String, InkDomain, String)>[
    ('maths class', InkDomain.maths, 'en'),
    ('English class', InkDomain.language, 'en'),
    ('Hindi class', InkDomain.language, 'hi'),
    ('Kannada class', InkDomain.language, 'kn'),
  ];

  for (final (name, domain, language) in contexts) {
    test('every listed symbol comes out as written ($name)', () async {
      for (final s in _symbols) {
        expect(await read(s, domain, language), s, reason: 'symbol $s in $name');
      }
    });
    test('digits 0-9 come out as written ($name)', () async {
      for (final d in _digits) {
        expect(await read(d, domain, language), d, reason: 'digit $d in $name');
      }
    });
  }

  test('the adapter sends the ink and the class language over the channel', () async {
    expect(await read('5', InkDomain.maths, 'hi'), '5');
    final ask = calls.singleWhere((c) => c.method == 'recognize');
    expect((ask.arguments as Map)['language'], 'hi');
    expect(((ask.arguments as Map)['strokes'] as List).single, isNotEmpty);
  });

  test('a language the platform has no recogniser for stays as ink', () async {
    reading = 'x';
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(_channel, (call) async => call.method == 'languages' ? ['en'] : [[reading]]);
    final wb = WhiteboardController()..tool = BoardTool.aiPen;
    final pen = AiPenController(wb)
      ..mode = AiPenMode.tap
      ..language = 'kn'
      ..handwriting = WindowsHandwriting(channel: _channel);
    wb.pointerDown(1, InkPoint(100, 100));
    wb.pointerMove(1, InkPoint(108, 130));
    wb.pointerUp(1);
    await pen.convertPending();
    expect(wb.elements.single, isA<Stroke>());
    pen.dispose();
    wb.dispose();
  });
}
