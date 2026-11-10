import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'design.dart';

enum OpticKind { convexLens, concaveLens, concaveMirror, convexMirror }

/// Ray optics bench (2nd PUC Physics, ch. 9): a lens or mirror on a graduated bench, the
/// object slid along it, the three principal rays, and the image with its magnification.
///
/// Preset: {"element":"convexLens"|"concaveLens"|"concaveMirror"|"convexMirror", "f":15 (cm,
/// magnitude), "u":30 (object distance, cm), "h":5 (object height, cm)}.
class OpticsInstrument extends StatefulWidget {
  const OpticsInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<OpticsInstrument> createState() => _OpticsState();
}

class _OpticsState extends State<OpticsInstrument> {
  OpticKind kind = OpticKind.convexLens;
  double f = 15, d = 30, h = 5;
  int? preset;
  bool _drag = false;

  static final _presets = <String, Map<String, dynamic>>{
    'Beyond 2F': {'element': 'convexLens', 'f': 15, 'u': 40},
    'At 2F': {'element': 'convexLens', 'f': 15, 'u': 30},
    'Between F and 2F': {'element': 'convexLens', 'f': 15, 'u': 22},
    'Inside F (magnifier)': {'element': 'convexLens', 'f': 15, 'u': 9},
    'Concave lens': {'element': 'concaveLens', 'f': 15, 'u': 30},
    'Concave mirror': {'element': 'concaveMirror', 'f': 15, 'u': 25},
    'Convex mirror': {'element': 'convexMirror', 'f': 15, 'u': 25},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Between F and 2F']! : widget.preset);
    if (widget.preset.isEmpty) preset = 2;
  }

  void _apply(Map<String, dynamic> p) {
    kind = OpticKind.values.firstWhere((k) => k.name == p['element'], orElse: () => OpticKind.convexLens);
    f = (p['f'] as num?)?.toDouble() ?? 15;
    d = (p['u'] as num?)?.toDouble() ?? 30;
    h = (p['h'] as num?)?.toDouble() ?? 7;
  }

  bool get mirror => kind == OpticKind.concaveMirror || kind == OpticKind.convexMirror;
  bool get converging => kind == OpticKind.convexLens || kind == OpticKind.concaveMirror;

  /// Real-is-positive power: F > 0 converging.
  double get F => converging ? f : -f;

  /// Image distance (real-is-positive), infinite at the focus.
  double get di => (d - F).abs() < 1e-6 ? double.infinity : 1 / (1 / F - 1 / d);
  double get m => -di / d;

  @override
  Widget build(BuildContext context) {
    final inf = di.isInfinite;
    // NCERT Cartesian convention: distances measured from the pole/optical centre, light from the left.
    final u = -d;
    final v = inf ? double.infinity : (mirror ? -di : di);
    final fc = mirror ? -F : F;
    final real = !inf && di > 0;
    final nature = inf ? 'At infinity' : '${real ? 'Real' : 'Virtual'}, ${m < 0 ? 'inverted' : 'erect'}, ${m.abs() > 1.02 ? 'magnified' : (m.abs() < 0.98 ? 'diminished' : 'same size')}';
    String sgn(double x) => x.isInfinite ? '∞' : '${x > 0 ? '+' : (x < 0 ? '−' : '')}${x.abs().toStringAsFixed(1)}';
    return InstrumentFrame(
      id: 'optics',
      subtitle: '2nd PUC Physics · Ray optics',
      title: mirror ? 'Image formation by a spherical mirror' : 'Image formation by a thin lens',
      formula: mirror ? '1/v + 1/u = 1/f' : '1/v − 1/u = 1/f',
      state: {'element': kind.name, 'f': f, 'u': d, 'h': h},
      readouts: [
        Readout('Object distance u', sgn(u), 'cm'),
        Readout('Image distance v', sgn(v), 'cm', IX.accent),
        Readout('Focal length f', sgn(fc), 'cm'),
        Readout('Magnification m', inf ? '∞' : sgn(mirror ? -v / u : v / u).replaceAll('.0', '.0'), '', IX.positive),
        Readout('Image', nature, ''),
      ],
      controls: [
        IxSegments<OpticKind>(
          label: 'Element',
          options: const {OpticKind.convexLens: 'Convex\nlens', OpticKind.concaveLens: 'Concave\nlens', OpticKind.concaveMirror: 'Concave\nmirror', OpticKind.convexMirror: 'Convex\nmirror'},
          value: kind,
          onChanged: (k) => setState(() { kind = k; preset = null; }),
        ),
        IxSlider(label: 'Object distance |u|', value: d, min: 4, max: 55, unit: 'cm', onChanged: (x) => setState(() { d = x; preset = null; })),
        IxSlider(label: 'Focal length |f|', value: f, min: 8, max: 25, unit: 'cm', onChanged: (x) => setState(() { f = x; preset = null; })),
      ],
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); preset = i; }))],
      activePreset: preset,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final scale = size.width / 128;
        final pole = Offset(size.width * (mirror ? 0.62 : 0.5), size.height * 0.46);
        return GestureDetector(
          onPanStart: (e) => _drag = (e.localPosition.dx - (pole.dx - d * scale)).abs() < 60,
          onPanUpdate: (e) {
            if (_drag) setState(() { d = ((pole.dx - e.localPosition.dx) / scale).clamp(4, 55); preset = null; });
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _BenchPainter(this, scale, pole)),
        );
      }),
    );
  }
}

class _BenchPainter extends CustomPainter {
  _BenchPainter(this.s, this.k, this.pole);
  final _OpticsState s;
  final double k;
  final Offset pole;

  Offset px(double x, double y) => pole + Offset(x * k, -y * k);

  @override
  void paint(Canvas c, Size size) {
    _bench(c, size);
    // Optical axis.
    c.drawLine(Offset(0, pole.dy), Offset(size.width, pole.dy), Paint()..color = IX.inkSoft.withValues(alpha: 0.6)..strokeWidth = 1.5);
    _marks(c);
    _element(c, size);
    c.save();
    c.clipRect(Rect.fromLTWH(0, 0, size.width, size.height - 92));
    _rays(c, size);
    _image(c);
    c.restore();
    _object(c);
  }

  void _bench(Canvas c, Size size) {
    // The optical bench rail: a steel bar with a cm scale, the zero at the element.
    final top = size.height - 84;
    final rail = Rect.fromLTWH(24, top, size.width - 48, 44);
    c.drawRRect(RRect.fromRectAndRadius(rail.shift(const Offset(0, 4)), const Radius.circular(8)), Paint()..color = const Color(0x1A13165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
    c.drawRRect(RRect.fromRectAndRadius(rail, const Radius.circular(8)), Paint()..shader = ui.Gradient.linear(rail.topCenter, rail.bottomCenter, [const Color(0xFFF7F8FB), const Color(0xFFD9DEE8), const Color(0xFFC3CAD7)], [0, 0.6, 1]));
    final tick = Paint()..color = IX.inkSoft..strokeWidth = 1.2;
    for (var x = -60; x <= 60; x++) {
      final xx = pole.dx + x * k;
      if (xx < rail.left + 4 || xx > rail.right - 4) continue;
      final len = x % 10 == 0 ? 16.0 : (x % 5 == 0 ? 11.0 : 6.0);
      c.drawLine(Offset(xx, top), Offset(xx, top + len), tick);
      if (x % 10 == 0) IxPaint.label(c, '${x.abs()}', Offset(xx, top + 28), size: 13, color: IX.inkSoft);
    }
    IxPaint.label(c, 'cm', Offset(rail.right - 18, top + 28), size: 13, color: IX.muted);
  }

  void _marks(Canvas c) {
    final F = s.F.abs();
    final marks = s.mirror ? {'F': F, 'C': 2 * F} : {'F': F, '2F': 2 * F};
    for (final e in marks.entries) {
      for (final side in s.mirror ? [s.converging ? -1 : 1] : [-1, 1]) {
        final p = px(side * e.value, 0);
        c.drawCircle(p, 6, Paint()..color = IX.ink);
        IxPaint.label(c, s.mirror ? e.key : (side < 0 ? e.key : "${e.key}′"), p + const Offset(0, 24), size: 20, color: IX.ink, w: FontWeight.w600);
      }
    }
    IxPaint.label(c, s.mirror ? 'P' : 'O', pole + const Offset(14, 22), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  void _element(Canvas c, Size size) {
    final half = 22.0 * k;
    final top = pole.dy - half, bot = pole.dy + half;
    if (!s.mirror) {
      final bulge = 3.2 * k;
      final path = Path();
      if (s.converging) {
        path
          ..moveTo(pole.dx, top)
          ..quadraticBezierTo(pole.dx + bulge * 2, pole.dy, pole.dx, bot)
          ..quadraticBezierTo(pole.dx - bulge * 2, pole.dy, pole.dx, top);
      } else {
        final w = bulge * 1.1;
        path
          ..moveTo(pole.dx - w, top)
          ..lineTo(pole.dx + w, top)
          ..quadraticBezierTo(pole.dx + 0.1 * w, pole.dy, pole.dx + w, bot)
          ..lineTo(pole.dx - w, bot)
          ..quadraticBezierTo(pole.dx - 0.1 * w, pole.dy, pole.dx - w, top);
      }
      c.drawPath(path.shift(const Offset(0, 6)), Paint()..color = const Color(0x1413165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
      c.drawPath(path, Paint()..shader = ui.Gradient.linear(Offset(pole.dx - bulge, top), Offset(pole.dx + bulge, bot), [const Color(0xFFF4F9FD), IX.glass, const Color(0xFFC9DCEB)], [0, 0.5, 1]));
      c.drawPath(path, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 2);
      // Highlight.
      c.drawLine(Offset(pole.dx - bulge * 0.3, top + half * 0.25), Offset(pole.dx - bulge * 0.3, top + half * 0.7), Paint()..color = Colors.white..strokeWidth = 3..strokeCap = StrokeCap.round);
      // Holder post down to the rail.
      final post = Rect.fromLTWH(pole.dx - 7, bot, 14, size.height - 84 - bot);
      c.drawRect(post, Paint()..shader = ui.Gradient.linear(post.centerLeft, post.centerRight, [IX.steel, const Color(0xFFE3E7EE), IX.steel], [0, 0.5, 1]));
    } else {
      // Mirror: a spherical cap, reflective face silvered, back hatched.
      final R = 2 * s.F.abs() * k;
      final concave = s.converging;
      final cx = concave ? pole.dx - R : pole.dx + R;
      final a = math.asin((half / R).clamp(0, 0.95));
      final rect = Rect.fromCircle(center: Offset(cx, pole.dy), radius: R);
      final face = Path()..addArc(rect, concave ? -a : math.pi - a, 2 * a);
      c.drawPath(face, Paint()..color = const Color(0xFF6B7891)..style = PaintingStyle.stroke..strokeWidth = 7);
      c.drawPath(face, Paint()..color = const Color(0xFFE8ECF3)..style = PaintingStyle.stroke..strokeWidth = 2.5);
      final hatch = Paint()..color = IX.inkSoft..strokeWidth = 1.5;
      for (var t = -a; t <= a; t += a / 9) {
        final ang = concave ? t : math.pi + t;
        final p = Offset(cx + R * math.cos(ang), pole.dy + R * math.sin(ang));
        c.drawLine(p + const Offset(4, 0), p + const Offset(16, -10), hatch);
      }
      final bot2 = pole.dy + R * math.sin(a);
      final post = Rect.fromLTWH(pole.dx + 4, bot2, 14, size.height - 84 - bot2);
      c.drawRect(post, Paint()..shader = ui.Gradient.linear(post.centerLeft, post.centerRight, [IX.steel, const Color(0xFFE3E7EE), IX.steel], [0, 0.5, 1]));
    }
  }

  void _object(Canvas c) {
    final base = px(-s.d, 0), tip = px(-s.d, s.h);
    IxPaint.arrow(c, base, tip, IX.ink, width: 6, head: 22);
    IxPaint.label(c, 'Object', base + const Offset(0, 44), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
    IxPaint.handle(c, base, IX.ink, r: 14, active: s._drag);
  }

  void _image(Canvas c) {
    final di = s.di;
    if (di.isInfinite || di.abs() > 200) return;
    final x = s.mirror ? -di : di;
    final hi = s.m * s.h;
    final base = px(x, 0), tip = px(x, hi);
    final real = di > 0;
    if (real) {
      IxPaint.arrow(c, base, tip, IX.accent, width: 6, head: 22);
    } else {
      final p = Paint()..color = IX.accent..strokeWidth = 5..strokeCap = StrokeCap.round;
      final dir = (tip - base);
      IxPaint.dashed(c, base, tip - dir / dir.distance * 14, p, dash: 9, gap: 7);
      IxPaint.arrow(c, tip - dir / dir.distance * 16, tip, IX.accent, width: 5, head: 20);
    }
    IxPaint.label(c, real ? 'Real image' : 'Virtual image', base + Offset(0, hi > 0 ? 26 : -26), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
  }

  void _rays(Canvas c, Size size) {
    final h = s.h, d = s.d, F = s.F;
    final colors = [IX.positive, IX.green, const Color(0xFF7C3AED)];
    final obj = Offset(-d, h);
    // Each ray: the point where it meets the element plane, and its outgoing slope (lens frame).
    final rays = <(double, double)>[(h, -h / F), (0, -h / d)];
    if ((d - F).abs() > 0.8) rays.add((-h * F / (d - F), 0));
    final far = 140.0;
    for (final (i, (y0, slope)) in rays.indexed) {
      final col = colors[i];
      final solid = Paint()..color = col..strokeWidth = 2.6..strokeCap = StrokeCap.round;
      final dash = Paint()..color = col.withValues(alpha: 0.6)..strokeWidth = 2;
      final hit = Offset(0, y0);
      c.drawLine(px(obj.dx, obj.dy), px(hit.dx, hit.dy), solid);
      _mid(c, px(obj.dx, obj.dy), px(hit.dx, hit.dy), col);
      // Outgoing: lens goes right; mirror reflects back to the left.
      final dir = s.mirror ? -1.0 : 1.0;
      final out = Offset(dir * far, y0 + slope * far);
      c.drawLine(px(0, y0), px(out.dx, out.dy), solid);
      _mid(c, px(0, y0), px(dir * 30, y0 + slope * 30), col);
      // Virtual image: extend the outgoing ray backwards (dashed).
      if (s.di < 0 && s.di.isFinite) {
        final back = Offset(-dir * far, y0 - slope * far);
        IxPaint.dashed(c, px(0, y0), px(back.dx, back.dy), dash);
      }
    }
  }

  void _mid(Canvas c, Offset a, Offset b, Color col) {
    final m = Offset.lerp(a, b, 0.5)!, d = b - a;
    if (d.distance < 30) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    c.drawPath(Path()..moveTo((m + u * 9).dx, (m + u * 9).dy)..lineTo((m - u * 7 + n * 7).dx, (m - u * 7 + n * 7).dy)..lineTo((m - u * 7 - n * 7).dx, (m - u * 7 - n * 7).dy)..close(), Paint()..color = col);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
