import 'dart:math' as math;

import '../ink_models.dart';
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

/// Strokes grouped into lines of writing (and separate chunks on one line), each in the order
/// it was written. Strokes much bigger than the writing (drawings) are left out.
List<List<Stroke>> clusterWriting(List<Stroke> strokes) {
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
  final units = unitMap.values.toList()..sort((a, b) => inkBounds(a).center.dy.compareTo(inkBounds(b).center.dy));

  // Rows: a unit joins a row when their heights mostly overlap.
  final rows = <List<List<Stroke>>>[];
  final bands = <({double top, double bottom})>[];
  for (final u in units) {
    final ub = inkBounds(u);
    var placed = false;
    for (var i = 0; i < rows.length; i++) {
      final band = bands[i];
      final overlap = math.min(band.bottom, ub.bottom) - math.max(band.top, ub.top);
      final bandH = band.bottom - band.top;
      if (overlap > math.min(bandH, ub.height) * 0.35 || (ub.center.dy - (band.top + band.bottom) / 2).abs() < median * 0.6) {
        rows[i].add(u);
        bands[i] = (top: math.min(band.top, ub.top), bottom: math.max(band.bottom, ub.bottom));
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.add([u]);
      bands.add((top: ub.top, bottom: ub.bottom));
    }
  }

  // Each row splits where there is a wide gap; within a chunk the strokes keep the order they
  // were written in, which handwriting recognisers rely on.
  final order = {for (final (i, s) in ink.indexed) s.id: i};
  final out = <List<Stroke>>[];
  void emit(List<Stroke> chunk) => out.add(chunk..sort((a, b) => order[a.id]!.compareTo(order[b.id]!)));
  for (final row in rows) {
    row.sort((a, b) => inkBounds(a).left.compareTo(inkBounds(b).left));
    var chunk = <Stroke>[...row.first];
    var right = inkBounds(row.first).right;
    for (final u in row.skip(1)) {
      final ub = inkBounds(u);
      if (ub.left - right > median * 2.5) {
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
