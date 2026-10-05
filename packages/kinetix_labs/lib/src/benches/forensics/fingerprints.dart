import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/biology.dart' show labNoise;
import '../../engines/forensics.dart';

/// Ridge lines of a print, in the print's own 0–1 square.
List<List<Offset>> ridges(String pattern, int seed) {
  final shift = Offset(0.04 * labNoise('cx$seed'), 0.04 * labNoise('cy$seed'));
  final out = <List<Offset>>[];
  const gap = 0.034;
  List<Offset> line(double Function(double x) y) => [for (var x = -0.05; x <= 1.05; x += 0.02) Offset(x, y(x))];
  final mirror = pattern == 'loop-left';
  switch (pattern) {
    case 'arch':
    case 'tented-arch':
      final tented = pattern == 'tented-arch';
      for (var y0 = -0.1; y0 <= 1.15; y0 += gap) {
        final a = (1.1 - y0).clamp(0.0, 1.0) * (tented ? 0.2 : 0.1);
        out.add(line((x) => y0 - a * (tented ? math.exp(-(x - 0.5 - shift.dx).abs() / 0.09) : math.exp(-math.pow((x - 0.5 - shift.dx) / 0.25, 2)))));
      }
    case 'whorl':
      final c = const Offset(0.5, 0.47) + shift;
      for (var k = 1; k <= 9; k++) {
        out.add([for (var a = 0.0; a <= 2 * math.pi + 0.01; a += 0.1) c + Offset(math.cos(a) * gap * k * 1.15, math.sin(a) * gap * k)]);
      }
      final top = c.dy - gap * 9.5, bottom = c.dy + gap * 9.5;
      for (var y0 = top; y0 > -0.1; y0 -= gap) {
        out.add(line((x) => y0 + 0.06 * math.pow((x - c.dx) / 0.6, 2)));
      }
      for (var y0 = bottom; y0 < 1.1; y0 += gap) {
        out.add(line((x) => y0 - 0.05 * math.pow((x - c.dx) / 0.6, 2)));
      }
    default:
      // A loop: nested hairpins opening to one side, arches above, flat ridges below.
      final c = const Offset(0.42, 0.46) + shift;
      for (var k = 1; k <= 8; k++) {
        final r = gap * k;
        out.add([
          for (var x = 1.05; x >= c.dx; x -= 0.02) Offset(x, c.dy - r + 0.03 * (x - c.dx)),
          for (var a = -math.pi / 2; a >= -3 * math.pi / 2; a -= 0.1) c + Offset(math.cos(a) * r, math.sin(a) * r),
          for (var x = c.dx; x <= 1.05; x += 0.02) Offset(x, c.dy + r + 0.05 * (x - c.dx)),
        ]);
      }
      final top = c.dy - gap * 8.6, bottom = c.dy + gap * 8.6;
      for (var y0 = top; y0 > -0.1; y0 -= gap) {
        out.add(line((x) => y0 + 0.05 * math.pow((x - c.dx) / 0.6, 2)));
      }
      for (var y0 = bottom; y0 < 1.1; y0 += gap) {
        out.add(line((x) => y0 - 0.04 * math.pow((x - c.dx) / 0.6, 2)));
      }
  }
  return mirror ? [for (final l in out) [for (final p in l) Offset(1 - p.dx, p.dy)]] : out;
}

/// Paints a fingerprint into [r]: ridges, minutiae as breaks and forks, and
/// (when [mark] is on) the minutiae circled, [matched] ones in green.
void paintPrint(Canvas canvas, Rect r, FingerPrint print, int seed, {bool mark = false, Rect? window, Set<Offset> matched = const {}}) {
  Offset at(Offset u) => Offset(r.left + u.dx * r.width, r.top + u.dy * r.height);
  final oval = Rect.fromCenter(center: r.center, width: r.width * 0.84, height: r.height * 0.92);
  canvas.save();
  canvas.clipPath(Path()..addOval(oval));
  if (window != null) canvas.clipRect(Rect.fromLTRB(at(window.topLeft).dx, at(window.topLeft).dy, at(window.bottomRight).dx, at(window.bottomRight).dy));
  canvas.drawOval(oval, fill(const Color(0xFFFBF7EF)));
  final ink = stroke(const Color(0xFF2B2B33), math.max(1.4, r.width * 0.006));
  for (final l in ridges(print.pattern, seed)) {
    final path = Path()..moveTo(at(l.first).dx, at(l.first).dy);
    for (final p in l.skip(1)) {
      path.lineTo(at(p).dx, at(p).dy);
    }
    canvas.drawPath(path, ink);
  }
  final gapR = r.width * 0.012;
  for (final m in print.minutiae) {
    final o = at(m.at);
    if (m.ending) {
      canvas.drawCircle(o, gapR, fill(const Color(0xFFFBF7EF)));
    } else {
      canvas.drawLine(o, o + Offset(gapR * 2, -gapR * 1.6), ink);
      canvas.drawLine(o, o + Offset(gapR * 2, gapR * 1.6), ink);
    }
  }
  if (mark) {
    for (final m in print.minutiae) {
      final o = at(m.at);
      final hit = matched.contains(m.at);
      final colour = hit ? LabInk.green : (m.ending ? LabInk.red : LabInk.blue);
      if (m.ending) {
        canvas.drawCircle(o, gapR * 2.2, stroke(colour, 2));
      } else {
        canvas.drawRect(Rect.fromCenter(center: o, width: gapR * 4, height: gapR * 4), stroke(colour, 2));
      }
    }
  }
  canvas.restore();
  canvas.drawOval(oval, stroke(LabInk.faint, 1.5));
}

/// Fingerprints: classifying the ten prints of a card (arch, loop, whorl), and
/// comparing a chance print from a scene with suspects' prints.
class FingerprintBench extends LabBench {
  const FingerprintBench();

  /// The ten-print card: finger → pattern.
  static const card = ['whorl', 'arch', 'loop-right', 'whorl', 'loop-right', 'loop-left', 'tented-arch', 'loop-left', 'whorl', 'loop-left'];

  static const suspects = {'s1': ('loop-right', 21), 's2': ('whorl', 22), 's3': ('loop-right', 23), 's4': ('loop-right', 24)};
  static const culprit = 's3';
  static const window = Rect.fromLTWH(0.2, 0.22, 0.6, 0.5);

  /// Points that must agree for an identification here (traditional rule).
  static const points = 12;

  @override
  String get kind => 'fingerprint';

  @override
  LabParams get defaults => {'task': 'classify', 'finger': 1.0, 'call': 'loop', 'suspect': 's1', 'mark': false};

  static String familyName(String f) => switch (f) { 'arch' => tr('Arch'), 'whorl' => tr('Whorl'), _ => tr('Loop') };

  static String fingerName(int i) => tr('{hand} {finger}', {
        'hand': i <= 5 ? tr('Right') : tr('Left'),
        'finger': [tr('thumb'), tr('index'), tr('middle'), tr('ring'), tr('little')][(i - 1) % 5],
      });

  static String suspectName(String s) => tr('Suspect {n}', {'n': s.substring(1)});

  static bool matching(LabParams p) => pStr(p, 'task') == 'match';

  @override
  List<LabControl> controls(LabParams p) => matching(p)
      ? [
          LabChoice('suspect', tr('Compare with'), [for (final s in suspects.keys) (s, suspectName(s))]),
          LabToggle('mark', tr('Mark minutiae')),
        ]
      : [
          LabSlider('finger', tr('Finger'), 1, 10, divisions: 9),
          LabChoice('call', tr('Pattern you see'), [for (final f in ['arch', 'loop', 'whorl']) (f, familyName(f))]),
          LabToggle('mark', tr('Mark minutiae')),
        ];

  static FingerPrint fingerPrint(int i) => Prints.make(card[i - 1], 30 + i);
  static FingerPrint suspectPrint(String s) => Prints.make(suspects[s]!.$1, suspects[s]!.$2);
  static FingerPrint scene() => Prints.lift(suspectPrint(culprit), window, 5);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Print')), LabColumn(tr('Pattern')), LabColumn(tr('Deltas'), 0), LabColumn(tr('Finding'))];

  @override
  LabReading read(LabParams p) {
    if (matching(p)) {
      final s = suspects.containsKey(pStr(p, 'suspect')) ? pStr(p, 'suspect') : 's1';
      final sp = suspectPrint(s), sc = scene();
      final n = Prints.matches(sc, sp);
      final finding = sp.family != sc.family
          ? tr('Excluded: different pattern')
          : n >= points
              ? tr('{n} of {t} points agree: identified', {'n': '$n', 't': '${sc.minutiae.length}'})
              : n <= 4
                  ? tr('{n} of {t} points agree: excluded', {'n': '$n', 't': '${sc.minutiae.length}'})
                  : tr('{n} of {t} points agree: inconclusive', {'n': '$n', 't': '${sc.minutiae.length}'});
      return LabReading.row([suspectName(s), familyName(sp.family), sp.deltas, finding]);
    }
    final i = pInt(p, 'finger', 1).clamp(1, 10);
    final fp = fingerPrint(i);
    final call = pStr(p, 'call', 'loop');
    return LabReading.row([fingerName(i), familyName(call), fp.deltas, call == fp.family ? '✓' : tr('✗ (it is a {p})', {'p': familyName(fp.family).toLowerCase()})]);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final names = {for (final s in suspects.keys) suspectName(s): s};
    final compared = [for (final r in rows) if (names.containsKey(r[0])) names[r[0]]!];
    if (compared.isNotEmpty) {
      final sc = scene();
      final ids = {for (final s in compared) if (suspectPrint(s).family == sc.family && Prints.matches(sc, suspectPrint(s)) >= points) suspectName(s)};
      return ids.isEmpty
          ? tr('No suspect compared so far shares enough points with the scene print.')
          : tr('The scene print agrees with {s} at {k} or more points, with no unexplained difference: identified. The others are excluded.', {'s': ids.join(', '), 'k': '$points'});
    }
    final right = rows.where((r) => r[3] == '✓').length;
    return tr('{r} of {n} called correctly. Loops are commonest (about 6 in 10 people’s prints), whorls next, arches rare. Count the deltas: 0 for an arch, 1 for a loop, 2 for a whorl.', {'r': '$right', 'n': '${rows.length}'});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final mark = pBool(p, 'mark');
    if (matching(p)) {
      final s = suspects.containsKey(pStr(p, 'suspect')) ? pStr(p, 'suspect') : 's1';
      final side = math.min(w * 0.42, h * 0.8);
      final left = Rect.fromLTWH(w * 0.04, h * 0.1, side, side), right = Rect.fromLTWH(w * 0.54, h * 0.1, side, side);
      final sc = scene(), sp = suspectPrint(s);
      final hits = <Offset>{};
      if (mark && sp.family == sc.family) {
        for (final m in sc.minutiae) {
          for (final c in sp.minutiae) {
            if (c.ending == m.ending && (c.at - m.at).distance < 0.025) {
              hits
                ..add(c.at)
                ..add(m.at);
            }
          }
        }
      }
      canvas.drawRect(left, fill(const Color(0xFFE9E4D8)));
      paintPrint(canvas, left, sc, suspects[culprit]!.$2, mark: mark, window: window, matched: hits);
      paintPrint(canvas, right, sp, suspects[s]!.$2, mark: mark, matched: hits);
      label(canvas, tr('Chance print from the scene'), Offset(left.center.dx, left.bottom + 16), size: 14, bold: true);
      label(canvas, suspectName(s), Offset(right.center.dx, right.bottom + 16), size: 14, bold: true);
      return;
    }
    final i = pInt(p, 'finger', 1).clamp(1, 10);
    final side = math.min(w * 0.5, h * 0.84);
    final r = Rect.fromLTWH(w * 0.08, h * 0.06, side, side);
    paintPrint(canvas, r, fingerPrint(i), 30 + i, mark: mark);
    label(canvas, fingerName(i), Offset(r.center.dx, r.bottom + 14), size: 15, bold: true);
    // The card: small boxes for the ten fingers.
    for (var k = 1; k <= 10; k++) {
      final b = Rect.fromLTWH(w * 0.66 + ((k - 1) % 5) * w * 0.064, h * (k <= 5 ? 0.2 : 0.42), w * 0.056, h * 0.16);
      canvas.drawRect(b, fill(k == i ? const Color(0xFFFFF3C4) : Colors.white));
      canvas.drawRect(b, stroke(LabInk.faint, 1.2));
      label(canvas, '$k', b.center, size: 13, bold: k == i);
    }
    label(canvas, tr('Right hand'), Offset(w * 0.8, h * 0.17), size: 12, color: LabInk.muted);
    label(canvas, tr('Left hand'), Offset(w * 0.8, h * 0.39), size: 12, color: LabInk.muted);
  }
}
