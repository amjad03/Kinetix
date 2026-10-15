import 'dart:math' as math;
import 'dart:ui';

import '../ink_models.dart';
import 'ink_model.dart' show StrokeTime;
import 'ink_parser.dart' show inkBounds, isPenInk;

/// Handwriting to text, on the board itself.
///
/// The AI pen reads maths with its own symbol recogniser (symbol_recognizer.dart), which
/// works everywhere. Words need a real handwriting model, which the platform provides: ML Kit
/// Digital Ink on Android panels (its language model downloads once from Google; the ink never
/// leaves the board) and the Windows handwriting recogniser on Windows panels (built into
/// Windows, no download). The board app supplies them (apps/board/lib/core/handwriting); where
/// there is none, words stay as ink.

/// Languages the AI pen writes in: the board's languages.
const aiPenLanguages = ['en', 'hi', 'kn'];

/// Text AI's handwriting languages (spec §17), each named in its own script. A language whose
/// model this device lacks shows as unavailable and its words stay as ink.
const textAiLanguages = <String, String>{
  'en': 'English',
  'hi': 'हिन्दी',
  'kn': 'ಕನ್ನಡ',
  'ar': 'العربية',
  'mr': 'मराठी',
  'gu': 'ગુજરાતી',
  'ta': 'தமிழ்',
  'pa': 'ਪੰਜਾਬੀ',
  'te': 'తెలుగు',
  'bn': 'বাংলা',
  'or': 'ଓଡ଼ିଆ',
  'ml': 'മലയാളം',
  'ne': 'नेपाली',
};

/// Whether words in a language can be read now.
enum HandwritingModelState {
  /// Ready: words become text.
  ready,

  /// Supported, but its model must be downloaded first (once).
  needsDownload,

  /// Downloading now.
  downloading,

  /// This device has no handwriting model for the language: words stay as ink.
  unsupported,
}

abstract class HandwritingRecognizer {
  /// Which engine this is ("mlkit", "windows", "none"), for settings and logs.
  String get engine;

  /// False when this device cannot read words at all (maths still works).
  bool get available;

  /// Whether [language] (en, hi, kn) can be read now, or after a download.
  Future<HandwritingModelState> modelState(String language);

  /// Downloads [language]'s model if it needs one. True when it is ready.
  Future<bool> prepare(String language);

  /// Readings of [strokes] as one line of text in [language], most likely first; empty when
  /// nothing could be read. [preContext] is the text written just before, which helps.
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''});
}

/// No handwriting model: words stay as ink.
class NoHandwritingRecognizer implements HandwritingRecognizer {
  const NoHandwritingRecognizer();

  @override
  String get engine => 'none';

  @override
  bool get available => false;

  @override
  Future<HandwritingModelState> modelState(String language) async => HandwritingModelState.unsupported;

  @override
  Future<bool> prepare(String language) async => false;

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async => const [];
}

/// How the AI pen splits a line of writing into pieces (words, expressions): by the space
/// between them, in letter heights, and, when it knows when each stroke was written, by the
/// pause between them.
abstract final class WritingGaps {
  /// A gap this wide always splits (without timing, the only rule).
  static const always = 2.5;

  /// With timing: a gap this wide never splits when the pen went straight on ("x  =  5"
  /// written in one go stays one expression)...
  static const flowing = 4.0;

  /// ... where "straight on" is a pause shorter than this (ms).
  static const flowPause = 700;

  /// With timing: a narrower gap (a word space) splits after a pause this long (ms): the
  /// teacher stopped, then wrote on.
  static const pause = 2500;
  static const pauseGap = 1.0;
}

/// The median height of the ordinary letters in [strokes] (flat strokes such as minus signs and
/// fraction bars left out), in board units.
double medianLetterHeight(List<Stroke> strokes) {
  final hs = <double>[];
  for (final s in strokes) {
    final b = inkBounds([s]);
    if (b.height > b.width * 0.35) hs.add(b.height);
  }
  if (hs.isEmpty) return strokes.isEmpty ? 0 : inkBounds(strokes).height;
  hs.sort();
  return hs[hs.length ~/ 2];
}

/// The typed size (board units) for a line of handwriting: from the median letter height, so
/// tall and short letters, ascenders and descenders all become text of one size. A size [near]
/// (the text written on the line before or above) wins when it is close, so a paragraph stays
/// one size.
double typedFontSize(List<Stroke> line, {double? near}) {
  // A handwritten letter's median height sits between the x-height and the capitals: about
  // 0.62 of the font size in the board's fonts.
  final fs = (medianLetterHeight(line) / 0.62).clamp(16.0, 160.0);
  if (near != null && fs / near > 0.72 && fs / near < 1.38) return near;
  return fs.roundToDouble();
}

/// Strokes grouped into lines of writing (and separate chunks on one line: words or
/// expressions), each in the order it was written. Strokes much bigger than the writing
/// (drawings) are left out. With [times] (when each stroke was written) a line splits at a
/// pause as well as a wide space, and writing done in one go stays together (see
/// [WritingGaps]).
List<List<Stroke>> clusterWriting(List<Stroke> strokes, {Map<String, StrokeTime> times = const {}}) {
  final ink = strokes.where(isPenInk).toList();
  if (ink.isEmpty) return [];
  final boxes = {
    for (final s in ink) s.id: inkBounds([s]),
  };
  // Letter height, without flat strokes (minus signs, fraction bars).
  final tall = [
    for (final s in ink)
      if (boxes[s.id]!.height > boxes[s.id]!.width * 0.35) boxes[s.id]!.height,
  ]..sort();
  final median = math.max(12.0, tall.isEmpty ? boxes[ink.first.id]!.height : tall[tall.length ~/ 2]);
  final letters = ink.where((s) => boxes[s.id]!.height < median * 3.2 && boxes[s.id]!.width < median * 14).toList();
  if (letters.isEmpty) return [];

  // Units: a stacked fraction (a bar and what is written above and below it) stays together.
  final parent = List.generate(letters.length, (i) => i);
  int find(int i) => parent[i] == i ? i : parent[i] = find(parent[i]);
  for (var i = 0; i < letters.length; i++) {
    final bar = boxes[letters[i].id]!;
    if (bar.height > bar.width * 0.3 || bar.width < median * 0.8) continue;
    final y = bar.center.dy;
    final above = <int>[], below = <int>[];
    for (var j = 0; j < letters.length; j++) {
      if (j == i) continue;
      final o = boxes[letters[j].id]!;
      if (o.center.dx < bar.left - 4 || o.center.dx > bar.right + 4) continue;
      if (o.bottom <= y + 2 && y - o.bottom < median * 1.2) above.add(j);
      if (o.top >= y - 2 && o.top - y < median * 1.2) below.add(j);
    }
    if (above.isNotEmpty && below.isNotEmpty) {
      for (final j in [...above, ...below]) {
        parent[find(j)] = find(i);
      }
    }
  }
  final unitMap = <int, List<Stroke>>{};
  for (var i = 0; i < letters.length; i++) {
    unitMap.putIfAbsent(find(i), () => []).add(letters[i]);
  }
  // Full-size symbols find the rows first; small ones (powers, dots) then join them.
  bool small(List<Stroke> u) => inkBounds(u).height < median * 0.95;
  final units = unitMap.values.toList()..sort((a, b) => small(a) != small(b) ? (small(a) ? 1 : -1) : inkBounds(a).center.dy.compareTo(inkBounds(b).center.dy));

  // Rows: a unit joins a row when their heights mostly overlap, or when it is a small symbol
  // raised or lowered just beside the row (a power, a subscript).
  final rows = <List<List<Stroke>>>[];
  final bands = <Rect>[];
  for (final u in units) {
    final ub = inkBounds(u);
    var placed = false;
    for (var i = 0; i < rows.length; i++) {
      final band = bands[i];
      final overlap = math.min(band.bottom, ub.bottom) - math.max(band.top, ub.top);
      final level = overlap > math.min(band.height, ub.height) * 0.35 || (ub.center.dy - band.center.dy).abs() < median * 0.6;
      final script =
          ub.height < median * 0.95 &&
          ub.left < band.right + median &&
          ub.right > band.left &&
          ub.bottom > band.top - median * 0.3 &&
          ub.top < band.bottom + median * 0.3;
      if (level || script) {
        rows[i].add(u);
        bands[i] = band.expandToInclude(ub);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.add([u]);
      bands.add(ub);
    }
  }

  // Each row splits where there is a wide gap; within a chunk the strokes keep the order they
  // were written in, which handwriting recognisers rely on.
  final order = {for (final (i, s) in ink.indexed) s.id: i};
  final byTop = [for (var i = 0; i < rows.length; i++) i]..sort((a, b) => bands[a].center.dy.compareTo(bands[b].center.dy));
  final out = <List<Stroke>>[];
  void emit(List<Stroke> chunk) => out.add(chunk..sort((a, b) => order[a.id]!.compareTo(order[b.id]!)));
  for (final row in [for (final i in byTop) rows[i]]) {
    row.sort((a, b) => inkBounds(a).left.compareTo(inkBounds(b).left));
    var chunk = <Stroke>[...row.first];
    var right = inkBounds(row.first).right;
    for (final u in row.skip(1)) {
      final ub = inkBounds(u);
      final gap = ub.left - right;
      if (_splits(chunk, u, gap / median, times)) {
        emit(chunk);
        chunk = [];
      }
      chunk.addAll(u);
      right = math.max(right, ub.right);
    }
    emit(chunk);
  }
  return out;
}

/// Whether a line splits between [chunk] and the next unit [next], [gap] letter heights apart.
bool _splits(List<Stroke> chunk, List<Stroke> next, double gap, Map<String, StrokeTime> times) {
  final timed = chunk.every((s) => times.containsKey(s.id)) && next.every((s) => times.containsKey(s.id));
  if (!timed) return gap > WritingGaps.always;
  // The pause between the two: from the end of the chunk's last stroke to the start of the next
  // unit's first (either way round, for a word squeezed in later).
  final chunkEnd = chunk.map((s) => times[s.id]!.end).reduce(math.max);
  final chunkStart = chunk.map((s) => times[s.id]!.start).reduce(math.min);
  final nextStart = next.map((s) => times[s.id]!.start).reduce(math.min);
  final nextEnd = next.map((s) => times[s.id]!.end).reduce(math.max);
  final pause = nextStart >= chunkEnd ? nextStart - chunkEnd : (chunkStart >= nextEnd ? chunkStart - nextEnd : 0);
  if (gap > WritingGaps.flowing) return true;
  if (gap > WritingGaps.always) return pause >= WritingGaps.flowPause;
  return gap > WritingGaps.pauseGap && pause >= WritingGaps.pause;
}
