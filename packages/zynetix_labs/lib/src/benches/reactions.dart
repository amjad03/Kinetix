import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Four reactions of four types, each shown as it goes on.
class ReactionsBench extends LabBench {
  const ReactionsBench();

  static const reactions = ['combination', 'decomposition', 'displacement', 'double'];

  @override
  String get kind => 'reactions';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'reaction': 'combination', 'progress': 0.0};

  @override
  LabParams get preview => {'reaction': 'double', 'progress': 1.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('reaction', tr('Reaction'), [for (final r in reactions) (r, reactionName(r))]),
        LabSlider('progress', pStr(p, 'reaction') == 'decomposition' ? tr('Heating') : tr('Time'), 0, 1, divisions: 4, decimals: 2),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:reaction' ? {...p, 'progress': 0.0} : p;

  static String reactionName(String r) => switch (r) {
        'decomposition' => tr('Heating iron(II) sulphate'),
        'displacement' => tr('Iron nails in copper sulphate'),
        'double' => tr('Sodium sulphate + barium chloride'),
        _ => tr('Quicklime + water'),
      };

  static String typeName(String r) => switch (r) {
        'decomposition' => tr('Decomposition'),
        'displacement' => tr('Displacement'),
        'double' => tr('Double displacement'),
        _ => tr('Combination'),
      };

  static String observation(String r) => switch (r) {
        'decomposition' => tr('Green crystals turn white, then reddish-brown; a smell of burning sulphur.'),
        'displacement' => tr('The nails get a reddish-brown coat; the blue solution turns pale green.'),
        'double' => tr('A white precipitate forms at once.'),
        _ => tr('Hissing sound; the beaker becomes very hot; the lumps crumble into a white paste.'),
      };

  static String equation(String r) => switch (r) {
        'decomposition' => '2FeSO₄ → Fe₂O₃ + SO₂ + SO₃',
        'displacement' => 'Fe + CuSO₄ → FeSO₄ + Cu',
        'double' => 'Na₂SO₄ + BaCl₂ → BaSO₄↓ + 2NaCl',
        _ => 'CaO + H₂O → Ca(OH)₂ + heat',
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Reaction')), LabColumn(tr('What we saw')), LabColumn(tr('Type')), LabColumn(tr('Equation'))];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'progress', 0) < 0.5) return LabReading.not(tr('Let the reaction go on a little longer.'));
    final r = pStr(p, 'reaction', 'combination');
    return LabReading.row([reactionName(r), observation(r), typeName(r), equation(r)]);
  }

  @override
  List<String> live(LabParams p) {
    final r = pStr(p, 'reaction', 'combination');
    final k = pNum(p, 'progress', 0);
    return [
      if (k == 0) tr('Not started') else observation(r),
      if (r == 'combination') '${(30 + 50 * k).round()} °C',
      if (k >= 0.5) equation(r),
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    return tr('Types seen: {list}.', {'list': {for (final r in rows) '${r[2]}'}.join(', ')}) +
        (rows.any((r) => r[2] == tr('Combination')) ? ' ${tr('Quicklime and water gave out heat: an exothermic reaction.')}' : '');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final r = pStr(p, 'reaction', 'combination');
    final k = pNum(p, 'progress', 0).clamp(0.0, 1.0);
    switch (r) {
      case 'decomposition':
        _decomposition(canvas, w, h, k, t);
      case 'displacement':
        _displacement(canvas, w, h, k);
      case 'double':
        _double(canvas, w, h, k, t);
      default:
        _combination(canvas, w, h, k, t);
    }
    if (k >= 0.5) label(canvas, equation(r), Offset(w * 0.5, h * 0.08), size: 19, bold: true, color: LabInk.blue, halo: LabInk.paper);
  }

  void _beaker(Canvas canvas, Rect b) {
    canvas.drawLine(b.topLeft, b.bottomLeft, stroke(LabInk.ink, 3));
    canvas.drawLine(b.bottomLeft, b.bottomRight, stroke(LabInk.ink, 3));
    canvas.drawLine(b.bottomRight, b.topRight, stroke(LabInk.ink, 3));
  }

  RRect _tube(Rect r) => RRect.fromRectAndCorners(r, bottomLeft: Radius.circular(r.width / 2), bottomRight: Radius.circular(r.width / 2));

  void _combination(Canvas canvas, double w, double h, double k, double t) {
    final b = Rect.fromLTWH(w * 0.28, h * 0.3, w * 0.3, h * 0.5);
    final level = b.bottom - b.height * (0.15 + 0.45 * k);
    canvas.drawRect(Rect.fromLTRB(b.left, level, b.right, b.bottom), fill(Color.lerp(LabInk.water, const Color(0xCCF4F4F0), k)!));
    // Lumps of quicklime crumbling into paste.
    final rnd = math.Random(2);
    for (var n = 0; n < 7; n++) {
      final c = Offset(b.left + 20 + rnd.nextDouble() * (b.width - 40), b.bottom - 16 - rnd.nextDouble() * 20);
      final s = 26 * (1 - 0.6 * k);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: s, height: s * 0.8), const Radius.circular(6)), fill(const Color(0xFFEDEDE6)));
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: s, height: s * 0.8), const Radius.circular(6)), stroke(LabInk.faint, 1));
    }
    if (k > 0) {
      // Water pouring in from a jug, steam rising.
      final jug = Offset(b.right + 40, b.top - 40);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: jug, width: 60, height: 44), const Radius.circular(8)), fill(const Color(0x6678B7E0)));
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: jug, width: 60, height: 44), const Radius.circular(8)), stroke(LabInk.ink, 1.5));
      if (k < 1) canvas.drawLine(jug - const Offset(30, -10), Offset(b.center.dx + 20, level), stroke(const Color(0xAA78B7E0), 4));
      for (var n = 0; n < 3; n++) {
        final x = b.left + b.width * (0.25 + 0.25 * n);
        final path = Path()..moveTo(x, b.top);
        for (var j = 1; j <= 4; j++) {
          path.quadraticBezierTo(x + (j.isOdd ? 9 : -9), b.top - j * 12 + 6, x, b.top - j * 12 - ((t * 25) % 12));
        }
        canvas.drawPath(path, stroke(LabInk.muted.withValues(alpha: 0.5 * k), 2));
      }
      label(canvas, tr('Hiss!'), Offset(b.left - 40, b.top + 20), size: 18, bold: true, color: LabInk.red);
    }
    _beaker(canvas, b);
    // Thermometer in the beaker.
    final tx = b.right - 24, top = b.top - 50;
    final temp = 30 + 50 * k;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 5, top, tx + 5, b.bottom - 16), const Radius.circular(5)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 5, top, tx + 5, b.bottom - 16), const Radius.circular(5)), stroke(LabInk.ink, 1.2));
    final yT = b.bottom - 16 - (b.bottom - 16 - top) * temp / 110;
    canvas.drawRect(Rect.fromLTRB(tx - 2, yT, tx + 2, b.bottom - 14), fill(LabInk.red));
    canvas.drawCircle(Offset(tx, b.bottom - 12), 7, fill(LabInk.red));
    label(canvas, '${temp.round()} °C', Offset(tx + 50, yT), size: 17, bold: true, color: LabInk.red, halo: LabInk.paper);
    label(canvas, tr('Quicklime + water'), Offset(b.center.dx, b.bottom + 20), size: 14, bold: true);
  }

  void _decomposition(Canvas canvas, double w, double h, double k, double t) {
    // A boiling tube held at a slant, its closed end (with the crystals) in the flame.
    const tilt = 0.35;
    final pivot = Offset(w * 0.45, h * 0.42);
    canvas.save();
    canvas.translate(pivot.dx, pivot.dy);
    canvas.rotate(tilt);
    final tube = Rect.fromLTWH(-w * 0.22, -18, w * 0.36, 36);
    const c0 = Color(0xFF8BC34A), c1 = Color(0xFFF1F1EA), c2 = Color(0xFF9C3D1F);
    final crystals = k < 0.5 ? Color.lerp(c0, c1, k * 2)! : Color.lerp(c1, c2, (k - 0.5) * 2)!;
    canvas.drawRRect(RRect.fromRectAndCorners(tube, topRight: const Radius.circular(18), bottomRight: const Radius.circular(18)), fill(const Color(0x22A9D3EE)));
    final rnd = math.Random(6);
    for (var n = 0; n < 30; n++) {
      canvas.drawCircle(Offset(tube.right - 10 - rnd.nextDouble() * tube.width * 0.3, tube.top + 8 + rnd.nextDouble() * 20), 4, fill(crystals));
    }
    canvas.drawRRect(RRect.fromRectAndCorners(tube, topRight: const Radius.circular(18), bottomRight: const Radius.circular(18)), stroke(LabInk.ink, 2));
    // Wooden holder near the mouth.
    canvas.drawRect(Rect.fromLTWH(tube.left + 20, -30, 14, 80), fill(const Color(0xFFA06A3C)));
    canvas.restore();
    Offset world(double x, double y) => pivot + Offset(x * math.cos(tilt) - y * math.sin(tilt), x * math.sin(tilt) + y * math.cos(tilt));
    final closed = world(w * 0.14 - 26, 18);
    final mouth = world(-w * 0.22, 0);
    // Burner under the crystals; the flame reaches the tube.
    final bx = closed.dx;
    final burnerTop = h * 0.78;
    canvas.drawRect(Rect.fromLTWH(bx - 15, burnerTop, 30, h * 0.16), fill(const Color(0xFF8C939B)));
    final flameTop = closed.dy + 4 - 5 * math.sin(t * 10);
    final flame = Path()
      ..moveTo(bx - 12, burnerTop)
      ..quadraticBezierTo(bx - 16, (burnerTop + flameTop) / 2, bx, flameTop)
      ..quadraticBezierTo(bx + 16, (burnerTop + flameTop) / 2, bx + 12, burnerTop)
      ..close();
    canvas.drawPath(flame, fill(const Color(0xCC4A7BE0)));
    // Fumes leaving the mouth of the tube.
    if (k > 0.25) {
      for (var n = 0; n < 4; n++) {
        final d = (t * 30 + n * 20) % 80;
        canvas.drawCircle(mouth + Offset(-d * 0.8, -d * 0.6), 8 + d * 0.15, fill(LabInk.muted.withValues(alpha: 0.25 * (1 - d / 80))));
      }
      label(canvas, tr('Smell of burning sulphur'), mouth + const Offset(-20, -80), size: 14, bold: true, color: LabInk.muted, halo: LabInk.paper);
    }
    label(canvas, tr('Heating iron(II) sulphate'), Offset(w * 0.45, h * 0.97), size: 14, bold: true);
  }

  void _displacement(Canvas canvas, double w, double h, double k) {
    final tube = Rect.fromLTWH(w * 0.4, h * 0.18, w * 0.12, h * 0.66);
    final level = tube.top + tube.height * 0.25;
    final sol = Color.lerp(const Color(0xAA2F7FE0), const Color(0x559BD58A), k)!;
    canvas.save();
    canvas.clipRRect(_tube(tube));
    canvas.drawRect(Rect.fromLTRB(tube.left, level, tube.right, tube.bottom), fill(sol));
    canvas.restore();
    // Two nails, coated below the surface.
    for (final dx in [-0.18, 0.18]) {
      final x = tube.center.dx + tube.width * dx;
      canvas.drawLine(Offset(x, tube.top - 20), Offset(x, tube.bottom - 30), stroke(const Color(0xFF6E6A66), 5));
      canvas.drawLine(Offset(x, level), Offset(x, tube.bottom - 30), stroke(Color.lerp(const Color(0xFF6E6A66), const Color(0xFF9C4A22), k)!, 6));
      canvas.drawLine(Offset(x - 7, tube.top - 20), Offset(x + 7, tube.top - 20), stroke(const Color(0xFF6E6A66), 4));
    }
    canvas.drawRRect(_tube(tube), stroke(LabInk.ink, 2.5));
    label(canvas, tr('Iron nails in copper sulphate'), Offset(tube.center.dx, tube.bottom + 22), size: 14, bold: true);
  }

  void _double(Canvas canvas, double w, double h, double k, double t) {
    final a = Rect.fromLTWH(w * 0.14, h * 0.25, w * 0.09, h * 0.5);
    final b = Rect.fromLTWH(w * 0.32, h * 0.25, w * 0.09, h * 0.5);
    final mix = Rect.fromLTWH(w * 0.6, h * 0.2, w * 0.12, h * 0.62);
    // The two colourless solutions empty into the mixing tube as k grows.
    for (final (r, name) in [(a, 'Na₂SO₄'), (b, 'BaCl₂')]) {
      canvas.save();
      canvas.clipRRect(_tube(r));
      canvas.drawRect(Rect.fromLTRB(r.left, r.top + r.height * (0.4 + 0.55 * k), r.right, r.bottom), fill(const Color(0x33A9D3EE)));
      canvas.restore();
      canvas.drawRRect(_tube(r), stroke(LabInk.ink, 2));
      label(canvas, name, Offset(r.center.dx, r.bottom + 18), size: 14, bold: true);
    }
    final level = mix.bottom - mix.height * (0.1 + 0.6 * k);
    canvas.save();
    canvas.clipRRect(_tube(mix));
    canvas.drawRect(Rect.fromLTRB(mix.left, level, mix.right, mix.bottom), fill(Color.lerp(const Color(0x33A9D3EE), const Color(0xEEF5F5F5), k)!));
    // The white precipitate settles at the bottom.
    if (k > 0.2) {
      final rnd = math.Random(8);
      for (var n = 0; n < (80 * k).round(); n++) {
        final settle = (t * 12 + rnd.nextDouble() * 60) % 60;
        canvas.drawCircle(Offset(mix.left + 6 + rnd.nextDouble() * (mix.width - 12), math.min(mix.bottom - 6, level + 8 + rnd.nextDouble() * (mix.bottom - level) * 0.7 + settle * 0.2)), 2.2, fill(Colors.white));
      }
    }
    canvas.restore();
    canvas.drawRRect(_tube(mix), stroke(LabInk.ink, 2.5));
    if (k > 0.2) label(canvas, tr('White precipitate'), Offset(mix.right + 70, mix.bottom - 40), size: 15, bold: true, color: LabInk.blue, halo: LabInk.paper);
    label(canvas, tr('Sodium sulphate + barium chloride'), Offset(w * 0.45, h * 0.94), size: 14, bold: true);
  }
}
