import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import 'kit.dart';

/// A rough standard-normal number from two hashes (Box–Muller).
double _normal(int a, int b) {
  final u = hash01(a, b, 1).clamp(1e-6, 1.0), v = hash01(a, b, 2);
  return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v);
}

// ---------------------------------------------------------- plasmolysis

/// Plasmolysis in Rhoeo leaf peel: cells in salt solutions of rising
/// strength; the strength at which half the cells are plasmolysed
/// (incipient plasmolysis) gives the cell sap's osmotic potential ψs = −iCRT.
class PlasmolysisBench extends LabBench with LabDemo {
  const PlasmolysisBench();

  static const c50 = 0.18, spread = 0.04; // M NaCl
  static const cols = 6, rows = 4;

  @override
  String get kind => 'plasmolysis';

  @override
  LabParams get defaults => {'conc': 0.0, 'field': 1};

  @override
  LabParams get preview => {...defaults, 'conc': 0.25};

  /// The NaCl strength (M) at which cell [i] of [field] starts to plasmolyse.
  static double threshold(int field, int i) => c50 + spread * _normal(field * 97 + 13, i);

  /// How far cell [i] has shrunk from its wall (0 turgid … 1 fully).
  static double shrink(LabParams p, int i) => ((pNum(p, 'conc') - threshold(pInt(p, 'field', 1), i)) / 0.25).clamp(0.0, 1.0);

  static int plasmolysed(LabParams p) => [for (var i = 0; i < cols * rows; i++) if (shrink(p, i) > 0) i].length;

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('conc', tr('NaCl solution'), 0, 0.5, divisions: 20, unit: ' M', decimals: 3),
        LabSlider('field', tr('Field of view'), 1, 6, divisions: 5),
      ];

  @override
  List<LabColumn> get columns => [LabColumn('NaCl (M)', 3), LabColumn(tr('Field'), 0), LabColumn(tr('Cells'), 0), LabColumn(tr('Plasmolysed'), 0), LabColumn(tr('% plasmolysed'), 0)];

  @override
  LabReading read(LabParams p) {
    final n = plasmolysed(p);
    return LabReading.row([pNum(p, 'conc'), pInt(p, 'field', 1), cols * rows, n, 100.0 * n / (cols * rows)]);
  }

  @override
  List<String> live(LabParams p) => ['${pNum(p, 'conc').toStringAsFixed(3)} M NaCl', tr('{n} of {m} cells plasmolysed', {'n': plasmolysed(p), 'm': cols * rows})];

  @override
  LabGraph? graph(LabParams p) => const LabGraph(0, 4, curve: true);

  @override
  List<LabParams> demo(LabParams start) => [for (final c in [0.0, 0.1, 0.15, 0.175, 0.2, 0.225, 0.25, 0.3, 0.4]) {...start, 'conc': c, 'field': 1 + (c * 40).round() % 6}];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.length < 2) return rows.isEmpty ? null : tr('Record at several strengths of salt solution.');
    final pts = [for (final r in rows) ((r[0] as num).toDouble(), (r[4] as num).toDouble())]..sort((a, b) => a.$1.compareTo(b.$1));
    double? c;
    for (var i = 1; i < pts.length; i++) {
      final (x0, y0) = pts[i - 1];
      final (x1, y1) = pts[i];
      if (y0 < 50 && y1 >= 50) {
        c = y1 == y0 ? x1 : x0 + (50 - y0) * (x1 - x0) / (y1 - y0);
        break;
      }
    }
    if (c == null) return tr('Half the cells are not yet plasmolysed: try stronger solutions.');
    final psi = 2 * c * 0.0831 * 298; // bar
    return tr('Incipient plasmolysis (50% of cells) at {c} M NaCl. The cell sap is isotonic with it: ψs = −iCRT = −2 × {c} × 0.0831 × 298 = −{b} bar ({m} MPa).', {
      'c': c.toStringAsFixed(3),
      'b': psi.toStringAsFixed(1),
      'm': (-psi / 10).toStringAsFixed(2),
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final fc = Offset(w * 0.36, h * 0.5), fr = math.min(w * 0.3, h * 0.42);
    final field = pInt(p, 'field', 1);
    Kit.field(canvas, fc, fr, const Color(0xFFF4F0E6), (c) {
      final cw = fr * 2.2 / cols, ch = fr * 2.1 / rows;
      final origin = fc - Offset(fr * 1.1, fr * 1.05);
      for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
          final k = j * cols + i;
          final off = (j.isOdd ? cw * 0.5 : 0.0);
          final r = Rect.fromLTWH(origin.dx + i * cw + off - cw * 0.25, origin.dy + j * ch, cw, ch);
          final jx = (hash01(field, k, 5) - 0.5) * cw * 0.12;
          final cellR = Rect.fromLTRB(r.left + jx, r.top, r.right + jx, r.bottom);
          c.drawRRect(RRect.fromRectAndRadius(cellR.deflate(1), const Radius.circular(6)), fill(const Color(0xFFF7EFF5)));
          c.drawRRect(RRect.fromRectAndRadius(cellR.deflate(1), const Radius.circular(6)), stroke(const Color(0xFF6D4C63), 2.2));
          final s = shrink(p, k);
          final inner = cellR.deflate(4 + s * math.min(cellR.width, cellR.height) * 0.28);
          final proto = s == 0
              ? RRect.fromRectAndRadius(cellR.deflate(4), const Radius.circular(5))
              : RRect.fromRectAndRadius(Rect.fromCenter(center: inner.center + Offset((hash01(k, 2) - 0.5) * s * 10, 0), width: inner.width, height: inner.height), Radius.circular(inner.shortestSide * 0.45));
          c.drawRRect(proto, fill(Color.lerp(const Color(0xCC8E3B8E), const Color(0xEE5E1F6B), s)!));
          c.drawCircle(proto.center + Offset(proto.width * 0.2, -proto.height * 0.15), 4, fill(const Color(0x99FFFFFF)));
        }
      }
    }, caption: tr('Rhoeo leaf peel · ×400 · field {f}', {'f': field}));
    final n = plasmolysed(p);
    Kit.card(canvas, Offset(w * 0.7, h * 0.12), w * 0.27, '${pNum(p, 'conc').toStringAsFixed(3)} M NaCl', [
      tr('{n} of {m} cells plasmolysed', {'n': n, 'm': cols * rows}),
      n == 0 ? tr('Turgid: the purple protoplast fills each cell.') : tr('Water leaves by osmosis: the protoplast pulls away from the wall.'),
    ]);
    // A small graph of the expected curve, for orientation.
    final g = Rect.fromLTWH(w * 0.72, h * 0.52, w * 0.24, h * 0.3);
    canvas.drawRect(g, fill(Colors.white));
    canvas.drawRect(g, stroke(LabInk.faint, 1));
    final path = Path();
    for (var i = 0; i <= 50; i++) {
      final c = i / 50 * 0.5;
      final y = 1 / (1 + math.exp(-(c - c50) / (spread * 0.6)));
      final pt = Offset(g.left + g.width * c / 0.5, g.bottom - g.height * y);
      i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
    }
    canvas.drawPath(path, stroke(LabInk.muted, 1.5));
    final px = g.left + g.width * pNum(p, 'conc') / 0.5;
    canvas.drawLine(Offset(px, g.top), Offset(px, g.bottom), stroke(LabInk.red, 1.5));
    label(canvas, tr('% plasmolysed against NaCl strength'), Offset(g.center.dx, g.bottom + 14), size: 12, color: LabInk.muted);
  }
}

// --------------------------------------------------------- respiration

/// A simple respirometer: germinating seeds or flower buds in a tube joined
/// to a graduated capillary with a drop of coloured water. With KOH (which
/// absorbs CO₂) the drop moves by the O₂ taken in (x); without it, by
/// O₂ − CO₂ (y). RQ = (x − y)/x.
class RespirationBench extends LabBench with LabDemo {
  const RespirationBench();

  /// O₂ uptake (mL/min) and RQ of each material.
  static const materials = <String, (double, double)>{'wheat': (0.020, 1.0), 'castor': (0.016, 0.7), 'buds': (0.024, 1.0)};
  static const mlPerCm = 0.0785; // capillary of 1 mm bore

  static String materialName(String m) => switch (m) {
        'castor' => tr('Germinating castor seeds'),
        'buds' => tr('Flower buds'),
        _ => tr('Germinating wheat seeds'),
      };

  @override
  String get kind => 'respiration';

  @override
  LabParams get defaults => {'material': 'wheat', 'koh': true, 'time': 0.0};

  @override
  LabParams get preview => {...defaults, 'time': 12.0};

  /// Distance the drop has moved (cm) towards the tube.
  static double moved(LabParams p) {
    final (o2, rq) = materials[pStr(p, 'material', 'wheat')]!;
    final rate = pBool(p, 'koh') ? o2 : o2 * (1 - rq);
    return rate * pNum(p, 'time') / mlPerCm;
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('material', tr('In the tube'), [for (final m in materials.keys) (m, materialName(m))]),
        LabToggle('koh', tr('KOH pellets in the tube (absorb CO₂)')),
        LabSlider('time', tr('Time'), 0, 30, divisions: 15, unit: ' min'),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:material' || action == 'set:koh' ? {...p, 'time': 0.0} : p;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Material')), LabColumn('KOH'), LabColumn(tr('Time (min)'), 0), LabColumn(tr('Drop moved (cm)'), 2), LabColumn(tr('Gas (mL)'), 3)];

  @override
  LabReading read(LabParams p) {
    final d = (moved(p) * 100).round() / 100;
    return LabReading.row([materialName(pStr(p, 'material', 'wheat')), pBool(p, 'koh') ? tr('With') : tr('Without'), pNum(p, 'time'), d, d * mlPerCm]);
  }

  @override
  List<String> live(LabParams p) => ['${pNum(p, 'time').toStringAsFixed(0)} min', tr('Drop moved {d} cm', {'d': moved(p).toStringAsFixed(2)})];

  @override
  LabGraph? graph(LabParams p) => LabGraph(2, 3, line: true, include: (r) => r[0] == materialName(pStr(p, 'material', 'wheat')) && r[1] == (pBool(p, 'koh') ? tr('With') : tr('Without')));

  @override
  List<LabParams> demo(LabParams start) => [
        for (final koh in [true, false])
          for (final t in [5.0, 10.0, 15.0, 20.0]) {...start, 'koh': koh, 'time': t},
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    for (final m in materials.keys) {
      double? rate(String koh) {
        final rs = [for (final r in rows) if (r[0] == materialName(m) && r[1] == koh && (r[2] as num) > 0) (r[4] as num).toDouble() / (r[2] as num).toDouble()];
        return rs.isEmpty ? null : rs.reduce((a, b) => a + b) / rs.length;
      }

      final x = rate(tr('With')), y = rate(tr('Without'));
      if (x == null) continue;
      if (y == null) {
        out.add(tr('{m}: O₂ taken in at {x} mL/min. Now repeat without KOH.', {'m': materialName(m), 'x': x.toStringAsFixed(4)}));
      } else {
        final rq = (x - y) / x;
        out.add(tr('{m}: x = {x} mL/min (O₂), y = {y} mL/min (O₂ − CO₂); RQ = (x − y)/x = {rq}, {what}.', {
          'm': materialName(m),
          'x': x.toStringAsFixed(4),
          'y': y.toStringAsFixed(4),
          'rq': rq.toStringAsFixed(2),
          'what': rq > 0.9 ? tr('so carbohydrate is being respired') : tr('so fat is being respired'),
        }));
      }
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ground = h * 0.88;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.12));
    final m = pStr(p, 'material', 'wheat');
    // Boiling tube in a stand.
    final tube = Rect.fromLTWH(w * 0.14, h * 0.3, w * 0.08, h * 0.5);
    Kit.stand(canvas, Offset(w * 0.08, ground), h * 0.75);
    canvas.drawRect(Rect.fromLTRB(w * 0.06, h * 0.42, tube.left, h * 0.45), fill(const Color(0xFF3A3F46)));
    final body = Path()
      ..moveTo(tube.left, tube.top)
      ..lineTo(tube.left, tube.bottom - tube.width / 2)
      ..arcToPoint(Offset(tube.right, tube.bottom - tube.width / 2), radius: Radius.circular(tube.width / 2), clockwise: false)
      ..lineTo(tube.right, tube.top);
    canvas.drawPath(body, fill(const Color(0x22B3E5FC)));
    canvas.drawPath(body, stroke(const Color(0xFF4A86B0), 1.6));
    // Seeds or buds at the bottom.
    final rnd = math.Random(m.hashCode);
    for (var i = 0; i < 26; i++) {
      final c = Offset(tube.left + 8 + rnd.nextDouble() * (tube.width - 16), tube.bottom - 10 - rnd.nextDouble() * tube.height * 0.3);
      if (m == 'buds') {
        canvas.drawOval(Rect.fromCenter(center: c, width: 12, height: 18), fill(const Color(0xFFE57373)));
        canvas.drawOval(Rect.fromCenter(center: c + const Offset(0, 6), width: 10, height: 6), fill(const Color(0xFF66BB6A)));
      } else {
        canvas.drawOval(Rect.fromCenter(center: c, width: m == 'castor' ? 16 : 9, height: m == 'castor' ? 11 : 14), fill(m == 'castor' ? const Color(0xFF8D6E63) : const Color(0xFFD7B56D)));
        canvas.drawLine(c, c + Offset(4, -8), stroke(const Color(0xFFF5F5DC), 1.6));
      }
    }
    // KOH pellets in a small tube held by cotton.
    if (pBool(p, 'koh')) {
      final k = Rect.fromLTWH(tube.left + tube.width * 0.25, tube.top + tube.height * 0.22, tube.width * 0.5, tube.height * 0.22);
      canvas.drawRect(k, stroke(const Color(0xFF4A86B0), 1.2));
      for (var i = 0; i < 8; i++) {
        canvas.drawCircle(Offset(k.left + 6 + (i % 3) * (k.width - 12) / 2, k.bottom - 6 - (i ~/ 3) * 9), 4, fill(Colors.white));
        canvas.drawCircle(Offset(k.left + 6 + (i % 3) * (k.width - 12) / 2, k.bottom - 6 - (i ~/ 3) * 9), 4, stroke(LabInk.muted, 0.8));
      }
      canvas.drawOval(Rect.fromLTWH(tube.left + 4, tube.top + tube.height * 0.45, tube.width - 8, 16), fill(const Color(0xFFF5F5F5)));
      label(canvas, 'KOH', k.center - Offset(0, k.height * 0.7), size: 13, bold: true);
    }
    // Cork and bent capillary with its scale.
    canvas.drawRect(Rect.fromLTRB(tube.left - 4, tube.top - 18, tube.right + 4, tube.top + 6), fill(const Color(0xFFA1887F)));
    final capY = h * 0.18;
    final capStart = Offset(tube.center.dx, tube.top - 18);
    final capEnd = Offset(w * 0.9, capY);
    canvas.drawPath(
        Path()
          ..moveTo(capStart.dx, capStart.dy)
          ..lineTo(capStart.dx, capY + 16)
          ..quadraticBezierTo(capStart.dx, capY, capStart.dx + 16, capY)
          ..lineTo(capEnd.dx, capEnd.dy),
        stroke(const Color(0xFF4A86B0), 4));
    final s0 = capStart.dx + 60, cm = (capEnd.dx - s0) / 16;
    final scale = Rect.fromLTRB(s0 - 6, capY + 8, capEnd.dx, capY + 40);
    canvas.drawRect(scale, fill(const Color(0xFFF3E3B5)));
    for (var k = 0; k <= 160; k++) {
      final x = capEnd.dx - k * cm / 10;
      if (x < s0 - 1) break;
      canvas.drawLine(Offset(x, capY + 8), Offset(x, capY + 8 + (k % 10 == 0 ? 14 : (k % 5 == 0 ? 10 : 5))), stroke(LabInk.ink, 0.9));
      if (k % 20 == 0) label(canvas, '${k ~/ 10}', Offset(x, capY + 32), size: 13, color: const Color(0xFF3A2A18));
    }
    // The drop starts at the 0 mark (right end) and moves towards the tube.
    final d = moved(p).clamp(0.0, 15.5);
    final dx = capEnd.dx - d * cm;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(dx - 12, capY), width: 24, height: 9), const Radius.circular(4)), fill(LabInk.red));
    arrowHead(canvas, Offset(dx - 34, capY - 14), const Offset(-1, 0), fill(LabInk.red), size: 10);
    label(canvas, tr('Drop moved {d} cm', {'d': moved(p).toStringAsFixed(2)}), Offset(dx - 12, capY - 30), size: 15, bold: true, color: LabInk.red, halo: LabInk.paper);
    label(canvas, materialName(m), Offset(tube.center.dx, ground + 26), size: 15, bold: true);
    Kit.card(canvas, Offset(w * 0.42, h * 0.38), w * 0.4, pBool(p, 'koh') ? tr('With KOH: drop moves by O₂ taken in (x)') : tr('Without KOH: drop moves by O₂ − CO₂ (y)'), [
      tr('Time {t} min', {'t': pNum(p, 'time').toStringAsFixed(0)}),
      tr('Gas {v} mL (1 cm of capillary = 0.0785 mL)', {'v': (moved(p) * mlPerCm).toStringAsFixed(3)}),
      'RQ = CO₂ released ÷ O₂ taken in = (x − y)/x',
    ]);
  }
}

// --------------------------------------------------------------- quadrat

/// Population density, frequency and abundance of plants by the quadrat
/// method: throw a 1 m × 1 m quadrat at random in a 10 m × 6 m plot and count
/// the plants of each species inside it.
class QuadratBench extends LabBench with LabDemo {
  const QuadratBench();

  static const plotW = 10.0, plotH = 6.0;
  static const species = ['cynodon', 'tridax', 'parthenium', 'oxalis'];
  static const counts = {'cynodon': 330, 'tridax': 70, 'parthenium': 36, 'oxalis': 95};

  static String speciesName(String s) => switch (s) {
        'cynodon' => tr('Cynodon (doob grass)'),
        'tridax' => tr('Tridax'),
        'parthenium' => tr('Parthenium'),
        _ => tr('Oxalis'),
      };

  static final List<(String, Offset)> plants = () {
    final out = <(String, Offset)>[];
    for (final (si, s) in species.indexed) {
      final n = counts[s]!;
      // Each species grows in a few patches.
      final centres = [for (var k = 0; k < 4; k++) Offset(hash01(si, k, 9) * plotW, hash01(si, k, 10) * plotH)];
      for (var i = 0; i < n; i++) {
        final c = centres[i % centres.length];
        final spreadM = s == 'cynodon' ? 3.2 : 1.8;
        final x = (c.dx + _normal(si * 1000 + i, 1) * spreadM * 0.5).clamp(0.05, plotW - 0.05);
        final y = (c.dy + _normal(si * 1000 + i, 2) * spreadM * 0.4).clamp(0.05, plotH - 0.05);
        out.add((s, Offset(x, y)));
      }
    }
    return out;
  }();

  /// Where quadrat [q] lands (its top-left corner, in metres).
  static Offset place(int q) => Offset(hash01(q, 31) * (plotW - 1), hash01(q, 37) * (plotH - 1));

  static Map<String, int> inside(int q) {
    final o = place(q);
    final out = {for (final s in species) s: 0};
    for (final (s, pt) in plants) {
      if (pt.dx >= o.dx && pt.dx < o.dx + 1 && pt.dy >= o.dy && pt.dy < o.dy + 1) out[s] = out[s]! + 1;
    }
    return out;
  }

  @override
  String get kind => 'quadrat';

  @override
  LabParams get defaults => {'q': 1, 'thrown': false};

  @override
  LabParams get preview => {...defaults, 'thrown': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabAction('throw', tr('Throw the quadrat'), Icons.crop_square, primary: true),
        LabToggle('thrown', tr('Show the quadrat')),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'throw' ? {...p, 'q': pInt(p, 'q', 1) + (pBool(p, 'thrown') ? 1 : 0), 'thrown': true} : p;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Quadrat'), 0), for (final s in species) LabColumn(speciesName(s), 0)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'thrown')) return LabReading.not(tr('Throw the quadrat first.'));
    final c = inside(pInt(p, 'q', 1));
    return LabReading.row([pInt(p, 'q', 1), for (final s in species) c[s]!]);
  }

  @override
  List<String> live(LabParams p) => [tr('Quadrat {n}', {'n': pInt(p, 'q', 1)}), '1 m × 1 m'];

  @override
  List<LabParams> demo(LabParams start) => [for (var q = 1; q <= 10; q++) {...start, 'q': q, 'thrown': true}];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final n = rows.length;
    final out = <String>[tr('{n} quadrats of 1 m²:', {'n': n})];
    for (final (i, s) in species.indexed) {
      final vals = [for (final r in rows) (r[i + 1] as num).toInt()];
      final total = vals.fold(0, (a, b) => a + b);
      final present = vals.where((v) => v > 0).length;
      out.add(tr('{s}: density {d}/m², frequency {f}%, abundance {a}.', {
        's': speciesName(s),
        'd': (total / n).toStringAsFixed(1),
        'f': (100 * present / n).toStringAsFixed(0),
        'a': present == 0 ? '0' : (total / present).toStringAsFixed(1),
      }));
    }
    return out.join(' ');
  }

  static void plant(Canvas canvas, String s, Offset c, double k) {
    switch (s) {
      case 'cynodon':
        for (final a in [-0.5, 0.0, 0.5]) {
          canvas.drawLine(c, c + Offset(math.sin(a) * 7 * k, -8 * k), stroke(const Color(0xFF2E7D32), 1.4 * k));
        }
      case 'tridax':
        for (var i = 0; i < 6; i++) {
          final a = i * math.pi / 3;
          canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * 3.2 * k, 2.2 * k, fill(const Color(0xFFFFFDF5)));
        }
        canvas.drawCircle(c, 2.2 * k, fill(const Color(0xFFF9A825)));
      case 'parthenium':
        canvas.drawLine(c + Offset(-5 * k, 3 * k), c + Offset(5 * k, -3 * k), stroke(const Color(0xFF558B2F), 1.4 * k));
        for (var i = 0; i < 4; i++) {
          canvas.drawCircle(c + Offset((i - 1.5) * 2.6 * k, (i.isEven ? -1 : 1) * 1.8 * k), 1.8 * k, fill(Colors.white));
        }
      default:
        for (var i = 0; i < 3; i++) {
          final a = -math.pi / 2 + i * 2 * math.pi / 3;
          canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * 2.6 * k, 2.6 * k, fill(const Color(0xFF7CB342)));
        }
    }
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ppm = math.min(w * 0.58 / plotW, h * 0.8 / plotH);
    final plot = Rect.fromLTWH(w * 0.04, (h - plotH * ppm) / 2, plotW * ppm, plotH * ppm);
    canvas.drawRect(plot, Paint()..shader = LinearGradient(colors: const [Color(0xFFB7C98A), Color(0xFFA9BD7A), Color(0xFFBCC98F)], begin: Alignment.topLeft, end: Alignment.bottomRight).createShader(plot));
    for (var i = 0; i < 30; i++) {
      canvas.drawOval(Rect.fromCenter(center: Offset(plot.left + hash01(i, 3) * plot.width, plot.top + hash01(i, 4) * plot.height), width: 30 + hash01(i, 5) * 40, height: 14 + hash01(i, 6) * 18), fill(const Color(0x22795548)));
    }
    for (final (s, pt) in plants) {
      plant(canvas, s, plot.topLeft + pt * ppm, 0.8);
    }
    canvas.drawRect(plot, stroke(const Color(0xFF5D4037), 2));
    for (var m = 0; m <= plotW; m++) {
      canvas.drawLine(Offset(plot.left + m * ppm, plot.bottom), Offset(plot.left + m * ppm, plot.bottom + 6), stroke(LabInk.ink, 1));
    }
    label(canvas, tr('Plot 10 m × 6 m'), Offset(plot.center.dx, plot.bottom + 20), size: 14, color: LabInk.muted);
    final q = pInt(p, 'q', 1);
    if (pBool(p, 'thrown')) {
      final o = plot.topLeft + place(q) * ppm;
      final qr = Rect.fromLTWH(o.dx, o.dy, ppm, ppm);
      canvas.drawRect(qr, stroke(LabInk.red, 3));
      // Zoomed quadrat.
      final zr = Rect.fromLTWH(w * 0.68, h * 0.1, w * 0.28, w * 0.28);
      canvas.drawRect(zr, Paint()..shader = LinearGradient(colors: const [Color(0xFFB7C98A), Color(0xFFA9BD7A)]).createShader(zr));
      canvas.save();
      canvas.clipRect(zr);
      final placeM = place(q);
      for (final (s, pt) in plants) {
        final rel = pt - placeM;
        if (rel.dx < -0.05 || rel.dy < -0.05 || rel.dx > 1.05 || rel.dy > 1.05) continue;
        plant(canvas, s, zr.topLeft + rel * zr.width, 2.6);
      }
      canvas.restore();
      canvas.drawRect(zr, stroke(LabInk.red, 4));
      canvas.drawLine(qr.topRight, zr.topLeft, stroke(LabInk.red.withValues(alpha: 0.4), 1.2));
      canvas.drawLine(qr.bottomRight, zr.bottomLeft, stroke(LabInk.red.withValues(alpha: 0.4), 1.2));
      label(canvas, tr('Quadrat {n}', {'n': q}), Offset(zr.center.dx, zr.top - 16), size: 16, bold: true);
      final c = inside(q);
      var y = zr.bottom + 18;
      for (final s in species) {
        plant(canvas, s, Offset(zr.left + 14, y + 4), 2);
        label(canvas, '${speciesName(s)}: ${c[s]}', Offset(zr.left + 34, y - 6), size: 15, bold: true, centre: false);
        y += 30;
      }
    }
  }
}

// ---------------------------------------------------------- DNA isolation

/// Isolating DNA from plant tissue: grind it in a salt–detergent buffer,
/// filter, digest the proteins with a protease, then pour ice-cold ethanol
/// down the side. DNA, insoluble in ethanol, collects as white threads at the
/// boundary and is spooled on a glass rod. The wet mass spooled grows in
/// proportion to the tissue used; cold ethanol gives more.
class DnaIsolationBench extends LabBench with LabDemo {
  const DnaIsolationBench();

  /// Wet DNA spooled (mg) per gram of tissue with ice-cold ethanol, and the
  /// filtrate's colour.
  static const materials = <String, (double, Color)>{
    'pea': (3.1, Color(0xCCC5D86D)),
    'spinach': (2.4, Color(0xCC4E8A3A)),
    'papaya': (1.5, Color(0xCCF2A05A)),
  };
  static const stages = 5;

  static String materialName(String m) => switch (m) {
        'spinach' => tr('Spinach leaves'),
        'papaya' => tr('Ripe papaya pulp'),
        _ => tr('Green pea seeds'),
      };

  static String stageName(int s) => switch (s) {
        0 => tr('Grind in salt and detergent'),
        1 => tr('Filter through muslin'),
        2 => tr('Add protease, then RNase'),
        3 => tr('Pour ice-cold ethanol'),
        _ => tr('Spool the DNA'),
      };

  @override
  String get kind => 'dna-isolation';

  @override
  LabParams get defaults => {'material': 'pea', 'mass': 10.0, 'cold': true, 'stage': 0};

  @override
  LabParams get preview => {...defaults, 'stage': 4};

  static int stageOf(LabParams p) => pInt(p, 'stage').clamp(0, stages - 1);

  /// Wet mass of DNA spooled (mg).
  static double spooled(LabParams p) {
    final m = pStr(p, 'material', 'pea');
    final per = materials[m]?.$1 ?? 3.1;
    final mass = pNum(p, 'mass', 10);
    final scatter = 1 + 0.04 * _normal(mass.round() * 7 + m.length, pBool(p, 'cold') ? 1 : 2);
    return mass * per * (pBool(p, 'cold') ? 1 : 0.55) * scatter;
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('material', tr('Tissue'), [for (final m in materials.keys) (m, materialName(m))]),
        LabSlider('mass', tr('Mass of tissue'), 5, 25, divisions: 4, unit: ' g'),
        LabToggle('cold', tr('Ethanol chilled in ice')),
        LabAction('next', tr('Next step'), Icons.arrow_forward, primary: true),
        LabAction('again', tr('Start again'), Icons.replay),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'next' => {...p, 'stage': math.min(stages - 1, stageOf(p) + 1)},
        'again' || 'set:material' || 'set:mass' || 'set:cold' => {...p, 'stage': 0},
        _ => p,
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Tissue')), LabColumn(tr('Mass (g)'), 0), LabColumn(tr('Ethanol')), LabColumn(tr('DNA spooled (mg, wet)'), 1), LabColumn(tr('mg per g'), 2)];

  static String ethanolName(bool cold) => cold ? tr('Ice-cold') : tr('Room temperature');

  @override
  LabReading read(LabParams p) {
    if (stageOf(p) < stages - 1) return LabReading.not(tr('Finish the steps: the DNA is weighed after it is spooled.'));
    final d = (spooled(p) * 10).round() / 10;
    final mass = pNum(p, 'mass', 10);
    return LabReading.row([materialName(pStr(p, 'material', 'pea')), mass, ethanolName(pBool(p, 'cold')), d, (d / mass * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Step {n} of {m}', {'n': stageOf(p) + 1, 'm': stages}),
        stageName(stageOf(p)),
        if (stageOf(p) == stages - 1) tr('{d} mg of DNA', {'d': spooled(p).toStringAsFixed(1)}),
      ];

  @override
  LabGraph? graph(LabParams p) => LabGraph(1, 3, throughOrigin: true, include: (r) => r[0] == materialName(pStr(p, 'material', 'pea')) && r[2] == ethanolName(pBool(p, 'cold')));

  @override
  List<LabParams> demo(LabParams start) => [
        for (final m in ['spinach', 'papaya', 'pea'])
          for (final g in [5.0, 10.0, 15.0, 20.0, 25.0]) {...start, 'material': m, 'mass': g, 'cold': true, 'stage': stages - 1},
        for (final g in [10.0, 20.0]) {...start, 'material': 'pea', 'mass': g, 'cold': false, 'stage': stages - 1},
        {...start, 'material': 'pea', 'mass': 15.0, 'cold': true, 'stage': stages - 1},
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    double? per(String m, String eth) {
      final vs = [for (final r in rows) if (r[0] == m && r[2] == eth) (r[4] as num).toDouble()];
      return vs.isEmpty ? null : vs.reduce((a, b) => a + b) / vs.length;
    }

    final cold = ethanolName(true), warm = ethanolName(false);
    for (final k in materials.keys) {
      final m = materialName(k);
      final c = per(m, cold), r = per(m, warm);
      if (c != null) out.add(tr('{m}: {y} mg of DNA per g of tissue with ice-cold ethanol.', {'m': m, 'y': c.toStringAsFixed(2)}));
      if (c != null && r != null) {
        out.add(tr('At room temperature only {y} mg/g: DNA comes out of solution best in cold ethanol.', {'y': r.toStringAsFixed(2)}));
      }
    }
    final masses = {for (final r in rows) r[1]};
    if (masses.length >= 3) out.add(tr('The DNA spooled rises in proportion to the mass of tissue.'));
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ground = h * 0.88;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.12));
    final stage = stageOf(p);
    final m = pStr(p, 'material', 'pea');
    final juice = materials[m]?.$2 ?? const Color(0xCCC5D86D);

    // The steps along the top.
    final stepW = w * 0.6 / stages;
    for (var i = 0; i < stages; i++) {
      final r = Rect.fromLTWH(w * 0.03 + i * stepW, h * 0.05, stepW - 10, h * 0.1);
      final now = i == stage, done = i < stage;
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), fill(now ? const Color(0xFFE3ECFB) : (done ? const Color(0xFFF1F5EC) : Colors.white)));
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), stroke(now ? LabInk.blue : LabInk.faint, now ? 2 : 1));
      canvas.drawCircle(Offset(r.left + 22, r.center.dy), 14, fill(now ? LabInk.blue : (done ? LabInk.green : LabInk.faint)));
      label(canvas, done ? '✓' : '${i + 1}', Offset(r.left + 22, r.center.dy), size: 15, bold: true, color: Colors.white);
      final tp = layoutText(stageName(i), 14, now ? LabInk.ink : LabInk.muted, bold: now)..layout(maxWidth: math.max(20, r.width - 50));
      tp.paint(canvas, Offset(r.left + 42, r.center.dy - tp.height / 2));
    }

    // Mortar and pestle with the ground tissue.
    final mc = Offset(w * 0.13, ground - h * 0.08);
    final mortar = Path()
      ..moveTo(mc.dx - w * 0.08, mc.dy - h * 0.08)
      ..quadraticBezierTo(mc.dx - w * 0.08, mc.dy + h * 0.07, mc.dx, mc.dy + h * 0.07)
      ..quadraticBezierTo(mc.dx + w * 0.08, mc.dy + h * 0.07, mc.dx + w * 0.08, mc.dy - h * 0.08)
      ..close();
    canvas.drawPath(mortar, fill(const Color(0xFFF2EFE8)));
    canvas.save();
    canvas.clipPath(mortar);
    canvas.drawRect(Rect.fromLTRB(mc.dx - w * 0.08, mc.dy - h * (stage == 0 ? 0.02 : -0.04), mc.dx + w * 0.08, mc.dy + h * 0.08), fill(juice));
    canvas.restore();
    canvas.drawPath(mortar, stroke(const Color(0xFF8A8478), 2));
    canvas.drawRect(Rect.fromLTWH(mc.dx - w * 0.03, mc.dy + h * 0.07, w * 0.06, h * 0.012), fill(const Color(0xFFCFC8BA)));
    canvas.save();
    canvas.translate(mc.dx + w * 0.02, mc.dy - h * 0.06);
    canvas.rotate(stage == 0 ? -0.35 + 0.08 * math.sin(t * 6) : -0.35);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-w * 0.008, -h * 0.17, w * 0.016, h * 0.19), const Radius.circular(8)), fill(const Color(0xFFE6E1D6)));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-w * 0.008, -h * 0.17, w * 0.016, h * 0.19), const Radius.circular(8)), stroke(const Color(0xFF8A8478), 1.5));
    canvas.restore();
    label(canvas, tr('{g} g of {m} with buffer', {'g': pNum(p, 'mass', 10).round(), 'm': materialName(m).toLowerCase()}), Offset(mc.dx, ground + 24), size: 14, color: LabInk.muted);

    // Boiling tube in a stand, with the filtrate and, later, the ethanol.
    final tx = w * 0.36;
    final tube = Rect.fromLTWH(tx - w * 0.035, h * 0.28, w * 0.07, ground - h * 0.06 - h * 0.28);
    Kit.stand(canvas, Offset(tx - w * 0.09, ground), h * 0.62);
    canvas.drawRect(Rect.fromLTRB(tx - w * 0.09, h * 0.36, tube.left, h * 0.385), fill(const Color(0xFF3A3F46)));
    final body = RRect.fromRectAndCorners(tube, bottomLeft: Radius.circular(tube.width / 2), bottomRight: Radius.circular(tube.width / 2));
    final filtrateTop = tube.bottom - tube.height * 0.38;
    final ethanolTop = tube.bottom - tube.height * 0.7;
    canvas.save();
    canvas.clipRRect(body);
    if (stage >= 1) {
      canvas.drawRect(Rect.fromLTRB(tube.left, filtrateTop, tube.right, tube.bottom), fill(stage >= 2 ? Color.lerp(juice, Colors.white, 0.15)! : juice));
    }
    if (stage >= 3) {
      canvas.drawRect(Rect.fromLTRB(tube.left, ethanolTop, tube.right, filtrateTop), fill(const Color(0x33B3E5FC)));
      // White threads of DNA at the boundary, rising into the ethanol.
      final n = (spooled(p) / 3).clamp(6, 26).round();
      for (var i = 0; i < n; i++) {
        final x0 = tube.left + tube.width * (0.15 + 0.7 * hash01(i, 3));
        final path = Path()..moveTo(x0, filtrateTop + 4);
        final rise = (stage == 3 ? 0.5 : 0.25) * (filtrateTop - ethanolTop) * (0.4 + 0.6 * hash01(i, 4));
        path.cubicTo(x0 - 8, filtrateTop - rise * 0.3, x0 + 10, filtrateTop - rise * 0.6, x0 + (hash01(i, 5) - 0.5) * 14, filtrateTop - rise);
        canvas.drawPath(path, stroke(const Color(0xEEFFFFFF), 2.6));
        canvas.drawPath(path, stroke(const Color(0x55A0A0A0), 0.8));
      }
    }
    canvas.restore();
    canvas.drawRRect(body, stroke(const Color(0xFF4A86B0), 2));
    if (stage >= 3) {
      label(canvas, tr('Ethanol'), Offset(tube.right + 50, (ethanolTop + filtrateTop) / 2), size: 14, color: LabInk.muted);
      label(canvas, tr('Filtrate'), Offset(tube.right + 50, (filtrateTop + tube.bottom) / 2), size: 14, color: LabInk.muted);
    }
    // Funnel with muslin while filtering; dropper for the enzymes; the
    // ethanol poured down the side; the glass rod spooling.
    if (stage == 1) {
      final f = Path()
        ..moveTo(tx - w * 0.05, tube.top - h * 0.1)
        ..lineTo(tx + w * 0.05, tube.top - h * 0.1)
        ..lineTo(tx + 6, tube.top - h * 0.01)
        ..lineTo(tx + 6, tube.top + h * 0.05)
        ..lineTo(tx - 6, tube.top + h * 0.05)
        ..lineTo(tx - 6, tube.top - h * 0.01)
        ..close();
      canvas.drawPath(f, fill(const Color(0x33B3E5FC)));
      canvas.drawPath(f, stroke(const Color(0xFF4A86B0), 1.6));
      canvas.drawLine(Offset(tx - w * 0.045, tube.top - h * 0.095), Offset(tx + w * 0.045, tube.top - h * 0.095), stroke(const Color(0xFFE8E0C8), 6));
      label(canvas, tr('Muslin'), Offset(tx + w * 0.09, tube.top - h * 0.095), size: 14, color: LabInk.muted);
    }
    if (stage == 2) {
      final d = Offset(tx, tube.top - h * 0.06);
      canvas.drawRect(Rect.fromCenter(center: d, width: 10, height: h * 0.08), fill(const Color(0x88FFFFFF)));
      canvas.drawRect(Rect.fromCenter(center: d, width: 10, height: h * 0.08), stroke(LabInk.ink, 1));
      canvas.drawOval(Rect.fromCenter(center: d - Offset(0, h * 0.055), width: 20, height: 26), fill(const Color(0xFF3E2723)));
      canvas.drawCircle(d + Offset(0, h * 0.05 + (t * 60) % 30), 4, fill(const Color(0x99F2CF2E)));
      label(canvas, tr('Protease (pineapple juice or meat tenderiser)'), Offset(tx + w * 0.17, tube.top - h * 0.06), size: 14, color: LabInk.muted);
    }
    if (stage == 3) {
      canvas.drawLine(Offset(tube.right + w * 0.04, tube.top - h * 0.12), Offset(tube.right - 6, tube.top + 6), stroke(const Color(0x8890CAF9), 6));
      label(canvas, pBool(p, 'cold') ? tr('Ice-cold ethanol down the side') : tr('Ethanol at room temperature'), Offset(tx + w * 0.16, tube.top - h * 0.14), size: 14, color: LabInk.muted);
    }
    if (stage == 4) {
      final rod = Offset(tx + 6, filtrateTop - 6);
      canvas.drawLine(rod, Offset(tx + w * 0.03, tube.top - h * 0.14), stroke(const Color(0xAAE0F2FF), 7));
      canvas.drawLine(rod, Offset(tx + w * 0.03, tube.top - h * 0.14), stroke(const Color(0xFF4A86B0), 1));
      final wrapped = (spooled(p) / 8).clamp(2, 8).round();
      for (var i = 0; i < wrapped; i++) {
        canvas.drawOval(Rect.fromCenter(center: rod + Offset(2, -16.0 - i * 9), width: 26, height: 12), stroke(const Color(0xEEFFFFFF), 4));
        canvas.drawOval(Rect.fromCenter(center: rod + Offset(2, -16.0 - i * 9), width: 26, height: 12), stroke(const Color(0x66909090), 0.8));
      }
    }
    // Ice bath with the ethanol bottle.
    final bath = Rect.fromLTWH(w * 0.5, ground - h * 0.16, w * 0.12, h * 0.16);
    canvas.drawRect(bath, fill(pBool(p, 'cold') ? const Color(0x33B3E5FC) : const Color(0x11B3E5FC)));
    canvas.drawRect(bath, stroke(const Color(0xFF4A86B0), 1.6));
    if (pBool(p, 'cold')) {
      for (var i = 0; i < 9; i++) {
        canvas.drawRRect(
            RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(bath.left + bath.width * (0.12 + 0.1 * i), bath.top + bath.height * (0.3 + 0.35 * hash01(i, 9))), width: 18, height: 14), const Radius.circular(3)),
            fill(const Color(0xCCFFFFFF)));
      }
    }
    final bottle = Rect.fromLTWH(bath.center.dx - w * 0.02, bath.top - h * 0.12, w * 0.04, h * 0.22);
    canvas.drawRRect(RRect.fromRectAndRadius(bottle, const Radius.circular(6)), fill(const Color(0x66E0F2FF)));
    canvas.drawRRect(RRect.fromRectAndRadius(bottle, const Radius.circular(6)), stroke(const Color(0xFF4A86B0), 1.4));
    canvas.drawRect(Rect.fromLTWH(bottle.left + bottle.width * 0.25, bottle.top - 14, bottle.width * 0.5, 16), fill(const Color(0xFF37474F)));
    label(canvas, tr('Ethanol'), Offset(bottle.center.dx, bottle.center.dy - h * 0.02), size: 13, bold: true, color: const Color(0xFF1F4E79));
    label(canvas, pBool(p, 'cold') ? tr('Ice bath') : tr('No ice'), Offset(bath.center.dx, ground + 24), size: 14, color: LabInk.muted);

    // What is happening, and a close look at the boundary.
    final why = switch (stage) {
      0 => tr('Detergent breaks the cell and nuclear membranes; salt keeps the DNA in solution.'),
      1 => tr('Muslin holds back the cell debris; the green filtrate carries the DNA.'),
      2 => tr('Protease digests the histones wrapped round the DNA; RNase removes RNA.'),
      3 => tr('DNA does not dissolve in ethanol: it comes out of solution at the boundary.'),
      _ => tr('Fine white threads wind round the rod: a mass of DNA molecules.'),
    };
    Kit.card(canvas, Offset(w * 0.66, h * 0.05), w * 0.32, stageName(stage), [
      why,
      if (stage == stages - 1) tr('Spooled: {d} mg (wet) from {g} g', {'d': spooled(p).toStringAsFixed(1), 'g': pNum(p, 'mass', 10).round()}),
    ]);
    final ic = Offset(w * 0.8, h * 0.62), ir = math.min(w * 0.14, h * 0.21);
    Kit.magnifier(canvas, ic, ir, (c) {
      c.drawRect(Rect.fromCircle(center: ic, radius: ir), fill(stage >= 3 ? const Color(0xFFEAF5FC) : const Color(0xFFF4F1EA)));
      if (stage >= 1) c.drawRect(Rect.fromLTRB(ic.dx - ir, ic.dy + ir * 0.25, ic.dx + ir, ic.dy + ir), fill(juice));
      if (stage >= 3) {
        for (var i = 0; i < 18; i++) {
          final x0 = ic.dx - ir * 0.8 + ir * 1.6 * hash01(i, 11);
          final path = Path()..moveTo(x0, ic.dy + ir * 0.27);
          var pt = Offset(x0, ic.dy + ir * 0.27);
          for (var k = 0; k < 6; k++) {
            final nx = pt + Offset((hash01(i, k, 12) - 0.5) * ir * 0.25, -ir * (0.08 + 0.06 * hash01(i, k, 13)));
            path.quadraticBezierTo(pt.dx + (hash01(i, k, 14) - 0.5) * ir * 0.2, (pt.dy + nx.dy) / 2, nx.dx, nx.dy);
            pt = nx;
          }
          c.drawPath(path, stroke(const Color(0xF2FFFFFF), 3.2));
          c.drawPath(path, stroke(const Color(0x44707070), 0.8));
        }
      } else if (stage >= 1) {
        for (var i = 0; i < 30; i++) {
          c.drawCircle(ic + Offset((hash01(i, 21) - 0.5) * ir * 1.8, ir * (0.3 + 0.6 * hash01(i, 22))), 2 + 3 * hash01(i, 23), fill(const Color(0x33000000)));
        }
      }
    }, caption: stage >= 3 ? tr('DNA threads at the boundary') : tr('The boundary layer'));
  }
}
