import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Four mixtures and four ways to separate them: a magnet, settling and
/// pouring off, filtering and evaporating. Each works only when the parts
/// of the mixture differ in the property the method uses.
class SeparationBench extends LabBench {
  const SeparationBench();

  static const mixtures = ['sand', 'salt', 'iron', 'oil'];
  static const methods = ['magnet', 'decant', 'filter', 'evaporate'];

  static const _sand = Color(0xFFD2A860), _muddy = Color(0x99B89A62), _iron = Color(0xFF555B63), _sulphur = Color(0xFFE6CF3A), _oil = Color(0xCCE9B840);

  @override
  String get kind => 'separation';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'mixture': 'sand', 'method': 'filter', 'progress': 0.0};

  @override
  LabParams get preview => {'mixture': 'sand', 'method': 'filter', 'progress': 0.75};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('mixture', tr('Mixture'), [for (final m in mixtures) (m, mixtureName(m))]),
        LabChoice('method', tr('Method'), [for (final m in methods) (m, methodName(m))]),
        LabSlider('progress', tr('Time'), 0, 1, divisions: 4, decimals: 2),
      ];

  /// A new mixture or method starts again from the beginning.
  @override
  LabParams act(String action, LabParams p) => action == 'set:mixture' || action == 'set:method' ? {...p, 'progress': 0.0} : p;

  static String mixtureName(String m) => switch (m) {
        'salt' => tr('Salt and water'),
        'iron' => tr('Iron filings and sulphur'),
        'oil' => tr('Oil and water'),
        _ => tr('Sand and water'),
      };

  static String methodName(String m) => switch (m) {
        'magnet' => tr('Magnet'),
        'decant' => tr('Settle and pour off'),
        'evaporate' => tr('Evaporate'),
        _ => tr('Filter'),
      };

  /// 2: separates, 1: only partly, 0: does not.
  static int works(String mixture, String method) => switch ((mixture, method)) {
        ('iron', 'magnet') || ('sand', 'decant') || ('sand', 'filter') || ('oil', 'decant') || ('salt', 'evaporate') => 2,
        ('sand', 'evaporate') || ('oil', 'evaporate') => 1,
        _ => 0,
      };

  /// What the class sees at the end.
  static String outcome(String mixture, String method) => switch ((mixture, method)) {
        ('iron', 'magnet') => tr('The iron filings stick to the magnet; the sulphur is left behind.'),
        (_, 'magnet') => tr('Nothing is pulled to the magnet.'),
        ('iron', _) => tr('This is a dry mixture: there is no liquid.'),
        ('sand', 'decant') => tr('The sand settles at the bottom and the clear water is poured off.'),
        ('sand', 'filter') => tr('The sand stays on the filter paper; clear water drips through.'),
        ('sand', _) => tr('The sand is left, but the water is lost to the air.'),
        ('salt', 'decant') => tr('The salt has dissolved: nothing settles.'),
        ('salt', 'filter') => tr('The dissolved salt passes through the filter paper with the water.'),
        ('salt', _) => tr('The water evaporates and the salt is left in the dish.'),
        ('oil', 'decant') => tr('The oil floats on the water and is poured off from the top.'),
        ('oil', 'filter') => tr('Oil and water both pass through the filter paper.'),
        _ => tr('The oil is left, but the water is lost to the air.'),
      };

  static String _worksName(int w) => switch (w) { 2 => tr('Yes'), 1 => tr('Partly'), _ => tr('No') };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Mixture')), LabColumn(tr('Method')), LabColumn(tr('Separates?')), LabColumn(tr('What we get'))];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'progress', 0) < 1) return LabReading.not(tr('Let the separation finish first.'));
    final m = pStr(p, 'mixture', 'sand'), how = pStr(p, 'method', 'filter');
    return LabReading.row([mixtureName(m), methodName(how), _worksName(works(m, how)), outcome(m, how)]);
  }

  @override
  List<String> live(LabParams p) {
    final m = pStr(p, 'mixture', 'sand'), how = pStr(p, 'method', 'filter');
    return [mixtureName(m), methodName(how), if (pNum(p, 'progress', 0) >= 1) outcome(m, how)];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final best = <String, Set<String>>{};
    for (final r in rows) {
      if (r[2] == tr('Yes')) best.putIfAbsent('${r[0]}', () => {}).add('${r[1]}');
    }
    return [
      for (final e in best.entries) tr('{mixture}: separated by "{method}".', {'mixture': e.key, 'method': e.value.join(', ')}),
      if ({for (final r in rows) r[1]}.length > 1) tr('A method works only when the parts of the mixture differ in the property it uses: being magnetic, settling, dissolving or boiling away.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final m = pStr(p, 'mixture', 'sand'), how = pStr(p, 'method', 'filter');
    final k = pNum(p, 'progress', 0).clamp(0.0, 1.0);
    // The bench top.
    canvas.drawRect(Rect.fromLTWH(0, h * 0.88, w, h * 0.12), fill(const Color(0xFFE9D8B8)));
    switch (how) {
      case 'magnet':
        _magnet(canvas, w, h, m, k);
      case 'decant':
        _decant(canvas, w, h, m, k, t);
      case 'evaporate':
        _evaporate(canvas, w, h, m, k, t);
      default:
        _filter(canvas, w, h, m, k, t);
    }
    label(canvas, '${mixtureName(m)} · ${methodName(how)}', Offset(w / 2, h * 0.06), size: 17, bold: true, color: LabInk.blue);
    if (k >= 1) label(canvas, outcome(m, how), Offset(w / 2, h * 0.94), size: 14, bold: true, halo: LabInk.paper);
  }

  void _beaker(Canvas canvas, Rect b) {
    final glass = stroke(LabInk.ink, 2.5);
    canvas.drawLine(b.topLeft, b.bottomLeft, glass);
    canvas.drawLine(b.bottomLeft, b.bottomRight, glass);
    canvas.drawLine(b.bottomRight, b.topRight, glass);
    canvas.drawLine(b.topRight, b.topRight + const Offset(8, -6), glass);
  }

  /// Specks of powder scattered in [r] (seeded, so the picture is steady).
  void _specks(Canvas canvas, Rect r, int n, List<Color> colours, {int seed = 1, double size = 2.6, bool Function(int i)? skip}) {
    final rnd = math.Random(seed);
    for (var i = 0; i < n; i++) {
      final c = Offset(r.left + rnd.nextDouble() * r.width, r.top + rnd.nextDouble() * r.height);
      final colour = colours[i % colours.length];
      if (skip != null && skip(i)) continue;
      canvas.drawCircle(c, size, fill(colour));
    }
  }

  /// The mixture in a beaker at rest: what is in it and where it sits.
  void _contents(Canvas canvas, Rect b, String m, double level, {double settled = 1}) {
    final top = b.bottom - b.height * level;
    switch (m) {
      case 'oil':
        final split = top + (b.bottom - top) * 0.35;
        canvas.drawRect(Rect.fromLTRB(b.left, top, b.right, split), fill(_oil));
        canvas.drawRect(Rect.fromLTRB(b.left, split, b.right, b.bottom), fill(LabInk.water));
      case 'salt':
        canvas.drawRect(Rect.fromLTRB(b.left, top, b.right, b.bottom), fill(LabInk.water));
      case 'iron':
        final heap = Rect.fromLTRB(b.left + 6, b.bottom - b.height * 0.18, b.right - 6, b.bottom - 3);
        _specks(canvas, heap, 160, [_iron, _sulphur], seed: 4);
      default:
        canvas.drawRect(Rect.fromLTRB(b.left, top, b.right, b.bottom), fill(Color.lerp(_muddy, LabInk.water, settled)!));
        // Sand: spread through the water while stirred, a layer once settled.
        final layer = b.height * 0.16;
        final spread = Rect.fromLTRB(b.left + 4, top + (b.bottom - top - layer) * settled, b.right - 4, b.bottom - 3);
        _specks(canvas, spread, 140, [_sand, const Color(0xFFB88A48)], seed: 3, size: 3);
    }
  }

  void _magnet(Canvas canvas, double w, double h, String m, double k) {
    final dish = Rect.fromCenter(center: Offset(w * 0.45, h * 0.78), width: w * 0.36, height: h * 0.16);
    final liquid = m == 'salt' || m == 'oil' || m == 'sand';
    canvas.drawOval(dish, fill(const Color(0x22A9D3EE)));
    if (liquid) {
      canvas.save();
      canvas.clipPath(Path()..addOval(dish));
      _contents(canvas, Rect.fromLTRB(dish.left, dish.top, dish.right, dish.bottom), m, 0.9);
      canvas.restore();
    }
    // The magnet sweeps over the dish, then lifts.
    final sweep = math.min(1.0, k / 0.5), lift = math.max(0.0, (k - 0.5) / 0.5);
    final mc = Offset(w * 0.12 + (dish.center.dx - w * 0.12) * sweep, dish.top - 30 - lift * h * 0.3);
    final bar = Rect.fromCenter(center: mc, width: w * 0.24, height: 36);
    final pulled = m == 'iron' ? sweep : 0.0;
    if (m == 'iron') {
      // Grey filings leave the dish for the magnet; the yellow sulphur stays.
      _specks(canvas, dish.deflate(12), 200, [_iron, _sulphur], seed: 4, skip: (i) => i.isEven && (i / 200) < pulled);
      _specks(canvas, Rect.fromLTRB(bar.left + 6, bar.bottom, bar.right - 6, bar.bottom + 14), (100 * pulled).round(), [_iron], seed: 9, size: 2.4);
    }
    canvas.drawOval(dish, stroke(LabInk.ink, 2));
    canvas.drawRect(Rect.fromLTRB(bar.left, bar.top, bar.center.dx, bar.bottom), fill(const Color(0xFF2F6FC9)));
    canvas.drawRect(Rect.fromLTRB(bar.center.dx, bar.top, bar.right, bar.bottom), fill(const Color(0xFFD64541)));
    canvas.drawRect(bar, stroke(LabInk.ink, 2));
    label(canvas, 'S', Offset(bar.left + bar.width * 0.25, bar.center.dy), size: 18, bold: true, color: Colors.white);
    label(canvas, 'N', Offset(bar.left + bar.width * 0.75, bar.center.dy), size: 18, bold: true, color: Colors.white);
  }

  /// The corners of beaker [b] tipped clockwise by [tilt] about its
  /// bottom-right corner: top-left, top-right (the lip), bottom-right, bottom-left.
  static List<Offset> _tipped(Rect b, double tilt) {
    final pivot = b.bottomRight;
    Offset turn(Offset q) {
      final d = q - pivot;
      return pivot + Offset(d.dx * math.cos(tilt) - d.dy * math.sin(tilt), d.dx * math.sin(tilt) + d.dy * math.cos(tilt));
    }

    return [turn(b.topLeft), turn(b.topRight), turn(b.bottomRight), turn(b.bottomLeft)];
  }

  /// Area of [poly] below the line y = [y] (screen y grows downwards).
  static double _areaBelow(List<Offset> poly, double y) {
    final cut = <Offset>[];
    for (var i = 0; i < poly.length; i++) {
      final a = poly[i], b = poly[(i + 1) % poly.length];
      if (a.dy >= y) cut.add(a);
      if ((a.dy >= y) != (b.dy >= y)) cut.add(Offset(a.dx + (b.dx - a.dx) * (y - a.dy) / (b.dy - a.dy), y));
    }
    var twice = 0.0;
    for (var i = 0; i < cut.length; i++) {
      final a = cut[i], b = cut[(i + 1) % cut.length];
      twice += a.dx * b.dy - b.dx * a.dy;
    }
    return twice.abs() / 2;
  }

  /// Where the surface stands when [area] of liquid is in the beaker [poly].
  static double _levelFor(List<Offset> poly, double area) {
    var lo = poly.map((q) => q.dy).reduce(math.min), hi = poly.map((q) => q.dy).reduce(math.max);
    for (var k = 0; k < 40; k++) {
      final mid = (lo + hi) / 2;
      if (_areaBelow(poly, mid) > area) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  /// How far to tip beaker [b] so that [area] of liquid just reaches the lip.
  static double _tiltToPour(Rect b, double area) {
    var lo = 0.0, hi = 1.4;
    for (var k = 0; k < 40; k++) {
      final mid = (lo + hi) / 2;
      final poly = _tipped(b, mid);
      if (_areaBelow(poly, poly[1].dy) > area) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  void _decant(Canvas canvas, double w, double h, String m, double k, double t) {
    final left = Rect.fromLTWH(w * 0.2, h * 0.46, w * 0.18, h * 0.4);
    final right = Rect.fromLTWH(w * 0.58, h * 0.52, w * 0.18, h * 0.34);
    if (m == 'iron') {
      _contents(canvas, left, m, 0.2);
      _beaker(canvas, left);
      _beaker(canvas, right);
      return;
    }
    // First the mixture stands and settles; then it is tipped and poured.
    final settle = math.min(1.0, k / 0.25), pour = math.max(0.0, (k - 0.25) / 0.75);
    final pouring = pour > 0 && pour < 1;
    // What gets poured: the clear water, the oil on top, or all the salt water.
    final poured = switch (m) { 'oil' => 0.35, 'salt' => 0.9, _ => 0.72 };
    final start = left.width * left.height * 0.8;
    final remaining = start * (1 - poured * pour);
    // While pouring the liquid stands at the lip; before and after, upright.
    final tilt = pouring ? _tiltToPour(left, remaining) : 0.0;
    final poly = _tipped(left, tilt);
    final surface = pouring ? poly[1].dy : _levelFor(poly, remaining);
    final inside = Path()..addPolygon(poly, true);
    canvas.save();
    canvas.clipPath(inside);
    final below = Rect.fromLTRB(w * 0.05, surface, w * 0.5, h);
    switch (m) {
      case 'oil':
        // Water below, oil floating on it.
        final split = _levelFor(poly, start * 0.65);
        canvas.drawRect(Rect.fromLTRB(below.left, surface, below.right, split), fill(_oil));
        canvas.drawRect(Rect.fromLTRB(below.left, split, below.right, below.bottom), fill(LabInk.water));
      case 'salt':
        canvas.drawRect(below, fill(LabInk.water));
      default:
        canvas.drawRect(below, fill(Color.lerp(_muddy, LabInk.water, settle)!));
    }
    canvas.restore();
    // Settled sand lies on the bottom of the beaker and tips with it.
    if (m == 'sand') {
      final pivot = left.bottomRight;
      canvas.save();
      canvas.translate(pivot.dx, pivot.dy);
      canvas.rotate(tilt);
      canvas.translate(-pivot.dx, -pivot.dy);
      final layer = left.height * 0.16;
      final top = left.bottom - left.height * 0.8;
      _specks(canvas, Rect.fromLTRB(left.left + 4, top + (left.bottom - top - layer) * settle, left.right - 4, left.bottom - 3), 140, [_sand, const Color(0xFFB88A48)], seed: 3, size: 3);
      canvas.restore();
    }
    final glass = stroke(LabInk.ink, 2.5);
    canvas.drawLine(poly[0], poly[3], glass);
    canvas.drawLine(poly[3], poly[2], glass);
    canvas.drawLine(poly[2], poly[1], glass);

    // The receiving beaker fills with what was poured.
    final got = right.height * 0.7 * poured * pour;
    final gotColour = m == 'oil' ? _oil : LabInk.water;
    canvas.drawRect(Rect.fromLTRB(right.left, right.bottom - got, right.right, right.bottom), fill(gotColour));
    _beaker(canvas, right);
    if (pouring) {
      // The stream leaves the lip and runs down a glass rod into the beaker.
      final lip = poly[1];
      final end = Offset(right.center.dx - 10, right.bottom - got);
      final wobble = 2 * math.sin(t * 14);
      final stream = Path()
        ..moveTo(lip.dx, lip.dy)
        ..quadraticBezierTo(lip.dx + 24 + wobble, lip.dy + 6, end.dx, end.dy);
      canvas.drawPath(stream, stroke(gotColour.withValues(alpha: 0.9), 4));
      canvas.drawLine(lip + const Offset(4, -12), end + const Offset(0, 6), stroke(const Color(0x88A9D3EE), 3));
    }
    if (settle > 0.5 && m == 'salt') {
      label(canvas, tr('The salt is still in the water'), Offset(right.center.dx, right.top - 18), size: 13, bold: true, color: LabInk.red, halo: LabInk.paper);
    }
  }

  void _filter(Canvas canvas, double w, double h, String m, double k, double t) {
    // A funnel with a paper cone on a stand, over a beaker.
    final fx = w * 0.42, top = h * 0.16, mouth = w * 0.13, neck = h * 0.46;
    final beaker = Rect.fromLTWH(fx - w * 0.1, h * 0.56, w * 0.2, h * 0.3);
    canvas.drawRect(Rect.fromLTWH(w * 0.7, h * 0.12, 10, h * 0.76), fill(const Color(0xFF5B6168)));
    canvas.drawLine(Offset(w * 0.7, neck), Offset(fx + 6, neck), stroke(const Color(0xFF5B6168), 6));
    final cone = Path()
      ..moveTo(fx - mouth, top)
      ..lineTo(fx + mouth, top)
      ..lineTo(fx + 6, neck - h * 0.06)
      ..lineTo(fx - 6, neck - h * 0.06)
      ..close();
    // Paper cone and what is in the funnel.
    canvas.drawPath(cone, fill(Colors.white));
    final inFunnel = m == 'iron' ? 0.35 : 0.8 * (1 - k);
    canvas.save();
    canvas.clipPath(cone);
    final surface = neck - h * 0.06 - (neck - h * 0.06 - top) * inFunnel;
    if (m != 'iron') {
      final colour = switch (m) { 'oil' => _oil, 'salt' => LabInk.water, _ => _muddy };
      canvas.drawRect(Rect.fromLTRB(fx - mouth, surface, fx + mouth, neck), fill(colour));
    }
    if (m == 'sand' || m == 'iron') {
      // The residue collects in the tip of the paper cone.
      final heap = m == 'iron' ? 0.35 : 0.12 + 0.2 * k;
      final hTop = neck - h * 0.06 - (neck - h * 0.06 - top) * heap;
      _specks(canvas, Rect.fromLTRB(fx - mouth * heap, hTop, fx + mouth * heap, neck - h * 0.06), m == 'iron' ? 180 : 120, m == 'iron' ? [_iron, _sulphur] : [_sand, const Color(0xFFB88A48)], seed: 5, size: 3);
    }
    canvas.restore();
    canvas.drawPath(cone, stroke(LabInk.ink, 2.5));
    canvas.drawRect(Rect.fromLTRB(fx - 5, neck - h * 0.06, fx + 5, neck + h * 0.06), stroke(LabInk.ink, 2));
    label(canvas, tr('Filter paper'), Offset(fx - mouth - 50, top + 30), size: 13, bold: true);

    // The filtrate: clear water, salt water, or oil and water.
    final got = m == 'iron' ? 0.0 : beaker.height * 0.6 * k;
    if (got > 0) {
      if (m == 'oil') {
        canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.bottom - got, beaker.right, beaker.bottom - got * 0.65), fill(_oil));
        canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.bottom - got * 0.65, beaker.right, beaker.bottom), fill(LabInk.water));
      } else {
        canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.bottom - got, beaker.right, beaker.bottom), fill(LabInk.water));
      }
    }
    if (m != 'iron' && k > 0 && k < 1) {
      final d = (t * 90) % (beaker.bottom - got - neck - h * 0.06);
      canvas.drawCircle(Offset(fx, neck + h * 0.06 + d), 3.5, fill(m == 'oil' ? _oil : const Color(0xAA5FA6D6)));
    }
    _beaker(canvas, beaker);
    label(canvas, m == 'salt' && k > 0 ? tr('The salt is still in the water') : tr('Filtrate'), Offset(beaker.center.dx, beaker.bottom + 16), size: 13, bold: true, color: m == 'salt' ? LabInk.red : LabInk.ink);
    if (m == 'sand' && k > 0.25) label(canvas, tr('Residue'), Offset(fx - mouth * 0.6 - 50, neck - h * 0.12), size: 13, bold: true);
  }

  void _evaporate(Canvas canvas, double w, double h, String m, double k, double t) {
    // A china dish on a tripod over a burner.
    final c = Offset(w * 0.45, h * 0.36);
    final dish = Rect.fromCenter(center: c, width: w * 0.3, height: h * 0.3);
    final legs = stroke(const Color(0xFF3A3F46), 4);
    final gauze = dish.bottom + 2;
    canvas.drawLine(Offset(dish.left, gauze), Offset(dish.left - 16, h * 0.88), legs);
    canvas.drawLine(Offset(dish.right, gauze), Offset(dish.right + 16, h * 0.88), legs);
    canvas.drawLine(Offset(dish.left - 14, gauze), Offset(dish.right + 14, gauze), stroke(const Color(0xFF8C929A), 6));
    label(canvas, tr('Wire gauze'), Offset(dish.right + 70, gauze), size: 12, color: LabInk.muted);
    final burner = Rect.fromLTWH(c.dx - 16, h * 0.74, 32, h * 0.14);
    canvas.drawRect(burner, fill(const Color(0xFF8C939B)));
    if (m != 'iron' && k < 1) {
      final tip = gauze + 6 - 4 * math.sin(t * 11);
      final flame = Path()
        ..moveTo(c.dx - 12, burner.top)
        ..quadraticBezierTo(c.dx - 16, (burner.top + tip) / 2, c.dx, tip)
        ..quadraticBezierTo(c.dx + 16, (burner.top + tip) / 2, c.dx + 12, burner.top)
        ..close();
      canvas.drawPath(flame, fill(const Color(0xCC4A7BE0)));
    }
    // The half-round dish; its contents sit in the lower half.
    final bowl = Path()..addArc(dish, 0, math.pi);
    canvas.save();
    canvas.clipPath(bowl);
    final depth = dish.height / 2;
    // Water boils away; oil (which floats on it) stays.
    final oil = m == 'oil' ? 0.14 : 0.0;
    final level = m == 'iron' ? 0.0 : oil + 0.7 * (1 - k);
    if (level > 0) {
      final surface = c.dy + depth * (1 - level);
      canvas.drawRect(Rect.fromLTRB(dish.left, surface, dish.right, dish.bottom), fill(LabInk.water));
      if (oil > 0) canvas.drawRect(Rect.fromLTRB(dish.left, surface, dish.right, surface + depth * oil), fill(_oil));
    }
    switch (m) {
      case 'salt':
        // Crystals appear as the water goes.
        if (k > 0.4) {
          final rnd = math.Random(8);
          for (var n = 0; n < (70 * (k - 0.4) / 0.6).round(); n++) {
            final at = Offset(c.dx + dish.width * (rnd.nextDouble() - 0.5) * 0.6, c.dy + depth * (0.74 + 0.2 * rnd.nextDouble()));
            final cube = Rect.fromCenter(center: at, width: 7, height: 7);
            canvas.drawRect(cube, fill(Colors.white));
            canvas.drawRect(cube, stroke(const Color(0xFF9AA5AF), 1));
          }
        }
      case 'sand':
        _specks(canvas, Rect.fromLTRB(c.dx - dish.width * 0.32, c.dy + depth * 0.72, c.dx + dish.width * 0.32, c.dy + depth * 0.97), 140, [_sand, const Color(0xFFB88A48)], seed: 3, size: 3);
      case 'iron':
        _specks(canvas, Rect.fromLTRB(c.dx - dish.width * 0.3, c.dy + depth * 0.7, c.dx + dish.width * 0.3, c.dy + depth * 0.96), 180, [_iron, _sulphur], seed: 4, size: 3);
    }
    canvas.restore();
    canvas.drawPath(bowl, stroke(LabInk.ink, 3));
    canvas.drawLine(dish.centerLeft, dish.centerRight, stroke(LabInk.ink, 2));
    // Steam while there is water to boil away.
    if (m != 'iron' && k > 0 && k < 1) {
      for (var n = 0; n < 3; n++) {
        final x = c.dx - dish.width * 0.2 + dish.width * 0.2 * n;
        final path = Path()..moveTo(x, c.dy - 4);
        for (var j = 1; j <= 4; j++) {
          path.quadraticBezierTo(x + (j.isOdd ? 9 : -9), c.dy - j * 14 + 7, x, c.dy - j * 14 - ((t * 25) % 14));
        }
        canvas.drawPath(path, stroke(LabInk.muted.withValues(alpha: 0.5), 2));
      }
      label(canvas, tr('Steam'), Offset(c.dx + dish.width * 0.4, c.dy - 50), size: 13, color: LabInk.muted);
    }
    label(canvas, tr('China dish'), Offset(dish.right + 60, c.dy + 20), size: 13, bold: true);
  }
}
