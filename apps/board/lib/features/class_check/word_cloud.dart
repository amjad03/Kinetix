import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'class_poll.dart';

/// The colours of a word cloud's words, readable on white and on the board's dark chrome.
const wordCloudColours = [Color(0xFF1A73E8), Color(0xFF1E8E3E), Color(0xFFE37400), Color(0xFFA142F4), Color(0xFFD93025), Color(0xFF12A4AF)];

/// The font size for a word given [n] answers out of [most]: 18 for one answer up to 56 for the
/// most common, growing with the square root so one popular word does not drown the rest.
double wordCloudSize(int n, int most) => most <= 1 ? 28 : 18 + 38 * math.sqrt((n - 1) / (most - 1));

/// The words of a word-cloud question, most common first (ties A to Z), at most [max].
List<(String, int)> wordCloudWords(List<(String, int)> tally, {int max = 40}) {
  final words = [...tally]..sort((a, b) => b.$2 != a.$2 ? b.$2.compareTo(a.$2) : a.$1.compareTo(b.$1));
  return words.take(max).toList();
}

/// A word-cloud question's answers on the board: each word sized by how many students typed it.
class WordCloud extends StatelessWidget {
  const WordCloud({super.key, required this.poll, required this.emptyText});

  final ClassPoll poll;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    final words = wordCloudWords(poll.tally);
    if (words.isEmpty) return Text(emptyText, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant));
    final most = words.first.$2;
    // Biggest in the middle: alternate the words either side of the most common one.
    final ordered = <(String, int)>[];
    for (final (i, w) in words.indexed) {
      i.isEven ? ordered.add(w) : ordered.insert(0, w);
    }
    return Wrap(
      key: const Key('word-cloud'),
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 12,
      runSpacing: 4,
      children: [
        for (final (word, n) in ordered)
          Tooltip(
            message: '$n',
            child: Text(
              word,
              key: Key('word-$word'),
              style: TextStyle(fontSize: wordCloudSize(n, most), fontWeight: n == most ? FontWeight.w700 : FontWeight.w500, color: wordCloudColours[word.hashCode.abs() % wordCloudColours.length]),
            ),
          ),
      ],
    );
  }
}

/// The word cloud as a picture for the board: the question, how many answered, then the words in
/// centred lines.
Future<Uint8List> wordCloudPng(ClassPoll poll, {required String answered}) async {
  const w = 720.0, pad = 24.0;
  final words = wordCloudWords(poll.tally);
  final most = words.isEmpty ? 1 : words.first.$2;
  TextPainter paint(String s, double size, {Color color = const Color(0xFF202124), FontWeight weight = FontWeight.w500}) => TextPainter(
    text: TextSpan(text: s, style: TextStyle(fontSize: size, color: color, fontWeight: weight)),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: w - 2 * pad);
  // Flow the words into lines.
  final lines = <List<TextPainter>>[[]];
  var x = 0.0;
  for (final (word, n) in words) {
    final tp = paint(word, wordCloudSize(n, most), color: wordCloudColours[word.hashCode.abs() % wordCloudColours.length], weight: n == most ? FontWeight.w700 : FontWeight.w500);
    if (x > 0 && x + tp.width > w - 2 * pad) {
      lines.add([]);
      x = 0;
    }
    lines.last.add(tp);
    x += tp.width + 16;
  }
  const top = 96.0;
  final heights = [for (final l in lines) l.fold<double>(0, (m, t) => math.max(m, t.height))];
  final h = top + heights.fold<double>(0, (a, b) => a + b + 6) + pad;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, w, h), const Radius.circular(16)), Paint()..color = Colors.white);
  paint(poll.question, 26, weight: FontWeight.w600).paint(canvas, const Offset(pad, 18));
  paint(answered, 18, color: const Color(0xFF5F6368)).paint(canvas, const Offset(pad, 58));
  var y = top;
  for (final (i, line) in lines.indexed) {
    final lineW = line.fold<double>(0, (a, t) => a + t.width) + 16 * math.max(0, line.length - 1);
    var lx = (w - lineW) / 2;
    for (final tp in line) {
      tp.paint(canvas, Offset(lx, y + (heights[i] - tp.height) / 2));
      lx += tp.width + 16;
    }
    y += heights[i] + 6;
  }
  final img = await rec.endRecording().toImage(w.toInt(), h.ceil());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}
