import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

import 'ai_pen_test.dart' show ScriptReader, draw, word;

const _symbols = ['j', ':', ';', "'", '"', '/', '<', '>', ',', '?', '`', '~', '!', '@', r'$', '%', '^', '&', '*', '=', r'\'];
const _digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

Future<String> _read(String reading, InkDomain domain, {List<String> more = const []}) async {
  final wb = WhiteboardController()..tool = BoardTool.aiPen;
  final pen = AiPenController(wb)
    ..mode = AiPenMode.tap
    ..domain = domain
    ..handwriting = ScriptReader([
      [reading, ...more],
    ]);
  draw(wb, word(100, 100).first);
  await pen.convertPending();
  final e = wb.elements.single;
  final out = e is TextElement ? e.text : (e as MathElement).latex;
  pen.dispose();
  wb.dispose();
  return out;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final domain in InkDomain.values) {
    test('every listed symbol survives the pipeline (${domain.name})', () async {
      for (final s in _symbols) {
        expect(await _read(s, domain), s, reason: 'symbol $s in ${domain.name}');
      }
    });
    test('digits 0-9 survive the pipeline (${domain.name})', () async {
      for (final d in _digits) {
        expect(await _read(d, domain), d, reason: 'digit $d in ${domain.name}');
      }
    });
  }

  test('maths class: letters a model reads for digits become the digit', () {
    const slips = {'O': '0', 'l': '1', 'I': '1', '|': '1', 'Z': '2', 'S': '5', 'G': '6', 'T': '7', 'B': '8'};
    slips.forEach((slip, digit) {
      expect(InkVocabulary.refine([slip], InkDomain.maths), [digit]);
    });
    // A variable stays a variable.
    expect(InkVocabulary.refine(['x'], InkDomain.maths), ['x']);
    expect(InkVocabulary.refine(['z'], InkDomain.maths), ['z']);
  });

  test('look-alike quotes and full-width marks become plain characters', () {
    expect(InkVocabulary.refine(['‘', '“', '：', '；'], InkDomain.general), ["'", '"', ':', ';']);
  });

  test('the subject picks the reading that fits it', () {
    expect(InkVocabulary.refine(['H_O', 'H2O'], InkDomain.chemistry).first, 'H2O');
    expect(InkVocabulary.refine(['I', '1'], InkDomain.maths).first, '1');
    expect(InkVocabulary.refine(['x¿', 'x;'], InkDomain.code).first, 'x;');
    expect(InkVocabulary.refine(['4', 'four'], InkDomain.language).first, 'four');
    // A model's fitting first choice is never overruled.
    expect(InkVocabulary.refine(['l', '1'], InkDomain.general), ['l', '1']);
  });

  test('code and language lines keep their punctuation instead of becoming an equation', () async {
    expect(await _read('x = 5;', InkDomain.code), 'x = 5;');
    expect(await _read('a < b && c > d', InkDomain.code), 'a < b && c > d');
    expect(await _read('He said: "Yes!"', InkDomain.language), 'He said: "Yes!"');
    expect(await _read('2H2 + O2 -> 2H2O', InkDomain.chemistry), '2H2 + O2 -> 2H2O');
  });

  test('the model is seeded with a line typical of the subject', () async {
    final wb = WhiteboardController()..tool = BoardTool.aiPen;
    final reader = ScriptReader([
      ['5'],
    ]);
    final pen = AiPenController(wb)
      ..mode = AiPenMode.tap
      ..domain = InkDomain.maths
      ..handwriting = reader;
    draw(wb, word(100, 100).first);
    await pen.convertPending();
    expect(reader.contexts.single, InkVocabulary.seed(InkDomain.maths));
    pen.dispose();
    wb.dispose();
  });
}
