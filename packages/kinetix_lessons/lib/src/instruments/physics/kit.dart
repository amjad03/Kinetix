import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../design.dart';

export '../design.dart';

/// The physics instrument kit: one stateful shell that runs a "mode" (a topic set-up), a
/// labelled graph panel, and the apparatus strokes the physics instruments share.
///
/// Every physics instrument is an [InstrumentSpec] with named modes. A lesson preset picks the
/// mode and overrides any of its values: {"mode": "incline", "theta": 30, "mu": 0.4}.
typedef V = Map<String, double>;

/// Extra apparatus colours, all muted.
abstract final class PX {
  static const violet = Color(0xFF6D28D9);
  static const teal = Color(0xFF0F766E);
  static const rose = Color(0xFFBE123C);
  static const wood = Color(0xFFC8A27A);
  static const woodDark = Color(0xFF9C7650);
  static const water = Color(0xFFBFDBF3);
  static const waterEdge = Color(0xFF6B9DC8);
  static const copper = Color(0xFFB87333);
  static const iron = Color(0xFF6B7280);
  static const glassFill = Color(0xFFEAF2FA);
  static const series = [IX.accent, IX.positive, IX.green, violet, teal, IX.amber];
}

sealed class Ctl {
  const Ctl(this.key, this.label);
  final String key, label;
}

class Sl extends Ctl {
  const Sl(super.key, super.label, this.min, this.max, {this.unit = '', this.div, this.dp});
  final double min, max;
  final String unit;
  final int? div, dp;
  String fmt(double v) {
    final d = dp ?? (max - min >= 50 ? 0 : (max - min >= 5 ? 1 : 2));
    final s = v.abs().toStringAsFixed(d);
    return v < 0 && double.parse(s) != 0 ? '−$s' : s;
  }
}

class Seg extends Ctl {
  const Seg(super.key, super.label, this.options);
  final List<String> options;
}

class ModeSpec {
  const ModeSpec({
    required this.title,
    required this.values,
    required this.controls,
    required this.readouts,
    required this.paint,
    this.formula,
    this.chapter,
    this.presets = const {},
    this.drag,
    this.animate = false,
  });
  final String title;
  final String? formula, chapter;
  final V values;
  final List<Ctl> Function(V v) controls;
  final List<Readout> Function(V v) readouts;

  /// Paints the stage: canvas, size, values, time in seconds since the mode opened.
  final void Function(Canvas c, Size s, V v, double t) paint;

  /// Pan handler: returns true when it changed the values. `start` is true on touch-down.
  final bool Function(V v, Offset p, Size s, bool start)? drag;
  final Map<String, V> presets;
  final bool animate;
}

class InstrumentSpec {
  const InstrumentSpec({required this.id, required this.chapter, required this.modes});
  final String id, chapter;
  final Map<String, ModeSpec> modes;
}

/// Reads a lesson preset into numbers: bools become 1/0, a string picks a segment option.
V presetValues(ModeSpec m, Map<String, dynamic> p) {
  final v = V.of(m.values);
  final segs = {for (final c in m.controls(v)) if (c is Seg) c.key: c};
  for (final e in p.entries) {
    if (e.key == 'mode') continue;
    final x = e.value;
    if (x is num) {
      v[e.key] = x.toDouble();
    } else if (x is bool) {
      v[e.key] = x ? 1 : 0;
    } else if (x is String && segs[e.key] != null) {
      final i = segs[e.key]!.options.indexWhere((o) => o.toLowerCase().replaceAll('\n', ' ') == x.toLowerCase());
      if (i >= 0) v[e.key] = i.toDouble();
    }
  }
  return v;
}

class PhysInstrument extends StatefulWidget {
  const PhysInstrument({super.key, required this.spec, this.preset = const {}});
  final InstrumentSpec spec;
  final Map<String, dynamic> preset;
  @override
  State<PhysInstrument> createState() => _PhysState();
}

class _PhysState extends State<PhysInstrument> with SingleTickerProviderStateMixin {
  late String mode;
  late V v;
  int? active;
  final time = ValueNotifier<double>(0);
  Ticker? _ticker;

  ModeSpec get m => widget.spec.modes[mode]!;

  @override
  void initState() {
    super.initState();
    final want = widget.preset['mode'] as String?;
    mode = widget.spec.modes.containsKey(want) ? want! : widget.spec.modes.keys.first;
    v = presetValues(m, widget.preset);
    if (widget.preset.length <= 1) active = m.presets.isEmpty ? null : -1;
    time.value = v['t0'] ?? 0;
    _ticker = createTicker((e) => time.value = (v['t0'] ?? 0) + e.inMicroseconds / 1e6);
    if (m.animate) _ticker!.start();
  }

  @override
  void dispose() {
    _ticker?.dispose();
    time.dispose();
    super.dispose();
  }

  void _set(String k, double x) => setState(() {
    v[k] = x;
    active = null;
  });

  Widget _control(Ctl c) => switch (c) {
    Sl s => IxSlider(label: s.label, value: (v[s.key] ?? s.min).clamp(s.min, s.max), min: s.min, max: s.max, divisions: s.div, unit: s.unit, format: s.fmt, onChanged: (x) => _set(s.key, x)),
    Seg g => IxSegments<int>(label: g.label, options: {for (var i = 0; i < g.options.length; i++) i: g.options[i]}, value: (v[g.key] ?? 0).round().clamp(0, g.options.length - 1), onChanged: (i) => _set(g.key, i.toDouble())),
  };

  @override
  Widget build(BuildContext context) {
    final presets = m.presets.entries.toList();
    return InstrumentFrame(
      id: widget.spec.id,
      subtitle: m.chapter ?? widget.spec.chapter,
      title: m.title,
      formula: m.formula,
      state: {'mode': mode, ...v},
      readouts: m.readouts(v),
      controls: [for (final c in m.controls(v)) _control(c)],
      presets: [
        for (final (i, e) in presets.indexed)
          Preset(e.key, () => setState(() {
            v = V.of(m.values)..addAll(e.value);
            active = i;
          })),
      ],
      activePreset: active == -1 ? null : active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final paint = CustomPaint(size: size, painter: _ModePainter(m, v, time, m.animate));
        if (m.drag == null) return paint;
        return GestureDetector(
          onPanStart: (d) {
            if (m.drag!(v, d.localPosition, size, true)) setState(() => active = null);
          },
          onPanUpdate: (d) {
            if (m.drag!(v, d.localPosition, size, false)) setState(() => active = null);
          },
          onPanEnd: (_) => v.remove('_drag'),
          child: paint,
        );
      }),
    );
  }
}

class _ModePainter extends CustomPainter {
  _ModePainter(this.m, this.v, this.time, bool anim) : super(repaint: anim ? time : null);
  final ModeSpec m;
  final V v;
  final ValueNotifier<double> time;
  @override
  void paint(Canvas c, Size size) {
    c.clipRect(Offset.zero & size);
    m.paint(c, size, v, time.value);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

// ───────────────────────────── numbers ─────────────────────────────

/// Fixed decimals with a true minus sign.
String fx(double v, [int dp = 2]) {
  if (v.isNaN || v.isInfinite) return '—';
  final s = v.abs().toStringAsFixed(dp);
  return v < 0 && double.parse(s) != 0 ? '−$s' : s;
}

/// Signed: +1.20 / −1.20.
String sg(double v, [int dp = 2]) => v > 0 ? '+${fx(v, dp)}' : fx(v, dp);

/// [sci] with a true minus sign.
String sc(double v, {int sig = 3}) => sci(v, sig: sig).replaceFirst('-', '−');

double deg(double r) => r * 180 / math.pi;
double rad(double d) => d * math.pi / 180;

/// A "nice" step for about [n] ticks over [span].
double niceStep(double span, [int n = 5]) {
  final raw = span / n;
  final p = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

String tick(double x, double step) {
  final dp = step >= 1 ? 0 : (-(math.log(step) / math.ln10).floor()).clamp(0, 4);
  return fx(x, dp);
}

// ───────────────────────────── graph panel ─────────────────────────────

/// A graph drawn inside [r]: framed card, light grid, ticks, axis names and curves.
class Plot {
  Plot(Rect outer, this.x0, this.x1, this.y0, this.y1, {this.xl = '', this.yl = '', this.title})
    : r = Rect.fromLTRB(outer.left + 78, outer.top + (title == null ? 22 : 58), outer.right - 26, outer.bottom - 62),
      outer = outer;
  final Rect r, outer;
  final double x0, x1, y0, y1;
  final String xl, yl;
  final String? title;

  Offset p(double x, double y) => Offset(r.left + (x - x0) / (x1 - x0) * r.width, r.bottom - (y - y0) / (y1 - y0) * r.height);
  double px(double x) => p(x, 0).dx;
  double py(double y) => p(0, y).dy;
  double xAt(double pxv) => x0 + (pxv - r.left) / r.width * (x1 - x0);
  double yAt(double pyv) => y0 + (r.bottom - pyv) / r.height * (y1 - y0);

  void frame(Canvas c, {bool card = true}) {
    if (card) {
      c.drawRRect(RRect.fromRectAndRadius(outer, const Radius.circular(16)), Paint()..color = const Color(0xFFFAFBFE));
      c.drawRRect(RRect.fromRectAndRadius(outer, const Radius.circular(16)), Paint()..color = IX.rule..style = PaintingStyle.stroke..strokeWidth = 1.5);
    }
    if (title != null) IxPaint.label(c, title!, Offset(outer.left + 24, outer.top + 18), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
    final gx = niceStep(x1 - x0, (r.width / 120).clamp(3, 8).round()), gy = niceStep(y1 - y0, (r.height / 80).clamp(3, 7).round());
    final grid = Paint()..color = IX.grid..strokeWidth = 1.2;
    for (var x = (x0 / gx).ceil() * gx; x <= x1 + gx * 1e-6; x += gx) {
      c.drawLine(Offset(px(x), r.top), Offset(px(x), r.bottom), grid);
      IxPaint.label(c, tick(x, gx), Offset(px(x), r.bottom + 16), size: 15, color: IX.inkSoft);
    }
    for (var y = (y0 / gy).ceil() * gy; y <= y1 + gy * 1e-6; y += gy) {
      c.drawLine(Offset(r.left, py(y)), Offset(r.right, py(y)), grid);
      IxPaint.label(c, tick(y, gy), Offset(r.left - 10, py(y)), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    }
    final axis = Paint()..color = IX.inkSoft..strokeWidth = 2;
    final ay = (y0 <= 0 && y1 >= 0) ? py(0) : r.bottom;
    final ax = (x0 <= 0 && x1 >= 0) ? px(0) : r.left;
    c.drawLine(Offset(r.left, ay), Offset(r.right, ay), axis);
    c.drawLine(Offset(ax, r.top), Offset(ax, r.bottom), axis);
    IxPaint.label(c, xl, Offset(r.right, r.bottom + 42), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
    IxPaint.label(c, yl, Offset(r.left + 8, r.top + 2), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
  }

  /// Plots y = f(x) over the panel (or [a]..[b]); breaks where the curve leaves far outside.
  Path path(double Function(double) f, {double? a, double? b, int n = 300}) {
    final path = Path();
    var on = false;
    final lo = a ?? x0, hi = b ?? x1;
    final span = y1 - y0;
    for (var i = 0; i <= n; i++) {
      final x = lo + (hi - lo) * i / n;
      final y = f(x);
      if (y.isNaN || y.isInfinite || y > y1 + span * 2 || y < y0 - span * 2) {
        on = false;
        continue;
      }
      final q = p(x, y);
      on ? path.lineTo(q.dx, q.dy) : path.moveTo(q.dx, q.dy);
      on = true;
    }
    return path;
  }

  void fn(Canvas c, double Function(double) f, Color col, {double w = 3.5, double? a, double? b, bool dash = false, String? label, double? labelAt}) {
    c.save();
    c.clipRect(r.inflate(2));
    final pth = path(f, a: a, b: b);
    final pa = Paint()..color = col..strokeWidth = w..style = PaintingStyle.stroke..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round;
    if (dash) {
      for (final m in pth.computeMetrics()) {
        for (var s = 0.0; s < m.length; s += 18) {
          c.drawPath(m.extractPath(s, math.min(s + 10, m.length)), pa);
        }
      }
    } else {
      c.drawPath(pth, pa);
    }
    c.restore();
    if (label != null) {
      final lx = labelAt ?? (x0 + (x1 - x0) * 0.82);
      final ly = f(lx).clamp(y0, y1);
      IxPaint.label(c, label, p(lx, ly) + const Offset(0, -20), size: 17, color: col, w: FontWeight.w600, halo: true);
    }
  }

  void poly(Canvas c, List<Offset> data, Color col, {double w = 3.5}) {
    if (data.length < 2) return;
    c.save();
    c.clipRect(r.inflate(2));
    final path = Path()..moveTo(p(data[0].dx, data[0].dy).dx, p(data[0].dx, data[0].dy).dy);
    for (final d in data.skip(1)) {
      final q = p(d.dx, d.dy);
      path.lineTo(q.dx, q.dy);
    }
    c.drawPath(path, Paint()..color = col..strokeWidth = w..style = PaintingStyle.stroke..strokeJoin = StrokeJoin.round);
    c.restore();
  }

  void area(Canvas c, double Function(double) f, double a, double b, Color col, {double base = 0}) {
    c.save();
    c.clipRect(r);
    final path = Path()..moveTo(px(a), py(base));
    for (var i = 0; i <= 120; i++) {
      final x = a + (b - a) * i / 120;
      final q = p(x, f(x));
      path.lineTo(q.dx, q.dy);
    }
    path..lineTo(px(b), py(base))..close();
    c.drawPath(path, Paint()..color = col.withValues(alpha: 0.16));
    c.restore();
  }

  void dot(Canvas c, double x, double y, Color col, {String? label, Offset off = const Offset(14, -18), double rr = 8}) {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    final q = p(x, y);
    c.drawCircle(q, rr + 3, Paint()..color = Colors.white);
    c.drawCircle(q, rr, Paint()..color = col);
    if (label != null) IxPaint.label(c, label, q + off, size: 17, color: col, w: FontWeight.w600, align: off.dx >= 0 ? Alignment.centerLeft : Alignment.centerRight, halo: true);
  }

  void vline(Canvas c, double x, Color col, {String? label}) {
    if (x < x0 || x > x1) return;
    IxPaint.dashed(c, Offset(px(x), r.top), Offset(px(x), r.bottom), Paint()..color = col.withValues(alpha: 0.8)..strokeWidth = 2, dash: 8, gap: 6);
    if (label != null) IxPaint.label(c, label, Offset(px(x), r.top + 14), size: 16, color: col, w: FontWeight.w600, halo: true);
  }

  void hline(Canvas c, double y, Color col, {String? label}) {
    if (y < y0 || y > y1) return;
    IxPaint.dashed(c, Offset(r.left, py(y)), Offset(r.right, py(y)), Paint()..color = col.withValues(alpha: 0.8)..strokeWidth = 2, dash: 8, gap: 6);
    if (label != null) IxPaint.label(c, label, Offset(r.right - 8, py(y) - 16), size: 16, color: col, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
  }

  /// Small legend row in the top-right of the panel.
  void legend(Canvas c, List<(String, Color)> items) {
    var x = r.right - 6;
    for (final (s, col) in items.reversed) {
      final tp = TextPainter(text: TextSpan(text: s, style: IX.text(16, w: FontWeight.w600, c: col)), textDirection: TextDirection.ltr)..layout();
      x -= tp.width;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x - 32, r.top + 2, tp.width + 40, 28), const Radius.circular(8)), Paint()..color = const Color(0xE6FFFFFF));
      tp.paint(c, Offset(x, r.top + 6));
      c.drawLine(Offset(x - 26, r.top + 16), Offset(x - 8, r.top + 16), Paint()..color = col..strokeWidth = 4..strokeCap = StrokeCap.round);
      x -= 52;
    }
  }
}

// ───────────────────────────── layout ─────────────────────────────

/// Stage layouts: apparatus on the left, graph on the right (or below).
abstract final class Lay {
  static (Rect, Rect) split(Size s, [double f = 0.52]) => (Rect.fromLTWH(0, 0, s.width * f, s.height), Rect.fromLTRB(s.width * f + 4, 26, s.width - 26, s.height - 26));
  static (Rect, Rect) stack(Size s, [double f = 0.52]) => (Rect.fromLTWH(0, 0, s.width, s.height * f), Rect.fromLTRB(26, s.height * f, s.width - 26, s.height - 22));
}

// ───────────────────────────── apparatus strokes ─────────────────────────────

abstract final class Draw {
  static Paint stroke(Color c, [double w = 3]) => Paint()..color = c..strokeWidth = w..style = PaintingStyle.stroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
  static Paint fill(Color c) => Paint()..color = c;

  static void text(Canvas c, String s, Offset at, {double size = 19, Color color = IX.ink, FontWeight w = FontWeight.w600, Alignment align = Alignment.center, bool halo = false}) =>
      IxPaint.label(c, s, at, size: size, color: color, w: w, align: align, halo: halo);

  static void shadow(Canvas c, RRect r, {double blur = 8, Offset off = const Offset(0, 5)}) =>
      c.drawRRect(r.shift(off), Paint()..color = const Color(0x2213165A)..maskFilter = MaskFilter.blur(BlurStyle.normal, blur));

  /// A shaded block (cart body, mass) with an optional centred label.
  static void block(Canvas c, Rect r, Color col, {String? label, double radius = 8, Color? textColor}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(radius));
    shadow(c, rr);
    c.drawRRect(rr, Paint()..shader = ui.Gradient.linear(r.topCenter, r.bottomCenter, [Color.lerp(col, Colors.white, 0.28)!, col, Color.lerp(col, Colors.black, 0.14)!], [0, 0.55, 1]));
    c.drawRRect(rr, stroke(Color.lerp(col, Colors.black, 0.3)!, 1.5));
    if (label != null) text(c, label, r.center, size: math.min(22, r.height * 0.42), color: textColor ?? Colors.white);
  }

  /// A cart: block on two wheels.
  static void cart(Canvas c, Rect body, Color col, {String? label}) {
    for (final x in [body.left + body.width * 0.24, body.right - body.width * 0.24]) {
      final w = Offset(x, body.bottom + 4);
      c.drawCircle(w, 13, fill(const Color(0xFF3B3F5C)));
      c.drawCircle(w, 5, fill(IX.steel));
    }
    block(c, body.shift(const Offset(0, -10)), col, label: label);
  }

  /// A side-view car: wheels resting on [at] (bottom-centre), facing [dir] (±1).
  static void car(Canvas c, Offset at, Color col, {double w = 110, double dir = 1, String? label}) {
    final rw = w * 0.11;
    final body = Rect.fromLTWH(at.dx - w / 2, at.dy - rw * 0.9 - w * 0.2, w, w * 0.2);
    final cy = body.top, ch = w * 0.17;
    final cab = Path()
      ..moveTo(at.dx - w * 0.32 * dir, cy)
      ..lineTo(at.dx - w * 0.2 * dir, cy - ch)
      ..lineTo(at.dx + w * 0.14 * dir, cy - ch)
      ..lineTo(at.dx + w * 0.3 * dir, cy)
      ..close();
    c.drawPath(cab, fill(Color.lerp(col, Colors.black, 0.08)!));
    final win = Path()
      ..moveTo(at.dx - w * 0.26 * dir, cy - 1)
      ..lineTo(at.dx - w * 0.17 * dir, cy - ch + 5)
      ..lineTo(at.dx + w * 0.11 * dir, cy - ch + 5)
      ..lineTo(at.dx + w * 0.23 * dir, cy - 1)
      ..close();
    c.drawPath(win, fill(const Color(0xFFDCE8F5)));
    c.drawLine(Offset(at.dx - w * 0.03 * dir, cy - ch + 4), Offset(at.dx - w * 0.03 * dir, cy), stroke(Color.lerp(col, Colors.black, 0.08)!, 4));
    final rr = RRect.fromRectAndRadius(body, Radius.circular(w * 0.06));
    shadow(c, rr, blur: 5, off: const Offset(0, 3));
    c.drawRRect(rr, Paint()..shader = ui.Gradient.linear(body.topCenter, body.bottomCenter, [Color.lerp(col, Colors.white, 0.25)!, col, Color.lerp(col, Colors.black, 0.18)!], [0, 0.5, 1]));
    c.drawCircle(Offset(at.dx + (w / 2 - 6) * dir, body.top + 7), 4, fill(const Color(0xFFFDE68A)));
    for (final x in [-0.29, 0.29]) {
      final wc = Offset(at.dx + w * x, at.dy - rw);
      c.drawCircle(wc, rw, fill(const Color(0xFF2E3250)));
      c.drawCircle(wc, rw * 0.42, fill(IX.steel));
    }
    if (label != null) text(c, label, body.center, size: math.min(18, w * 0.17), color: Colors.white);
  }

  /// A road strip from x0 to x1 with its top at [y], and metre marks from [m0] at [ppm] px/m.
  static void road(Canvas c, double x0, double x1, double y, {double? origin, double ppm = 10, double every = 10, String unit = 'm'}) {
    final r = Rect.fromLTRB(x0, y, x1, y + 34);
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), fill(const Color(0xFF4B5068)));
    IxPaint.dashed(c, Offset(x0 + 10, y + 17), Offset(x1 - 10, y + 17), stroke(const Color(0xFFE5E7EB), 2.5), dash: 22, gap: 18);
    if (origin == null) return;
    final m0 = ((x0 - origin) / ppm / every).ceil() * every;
    for (var m = m0; origin + m * ppm <= x1; m += every) {
      final x = origin + m * ppm;
      c.drawLine(Offset(x, y + 34), Offset(x, y + 46), stroke(IX.inkSoft, 2));
      text(c, '${fx(m, 0)} $unit', Offset(x, y + 62), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    }
  }

  /// A shaded sphere.
  static void ball(Canvas c, Offset at, double r, Color col) {
    c.drawCircle(at + Offset(r * 0.12, r * 0.18), r, Paint()..color = const Color(0x2613165A)..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.25 + 1));
    c.drawCircle(at, r, Paint()..shader = ui.Gradient.radial(at - Offset(r * 0.35, r * 0.4), r * 1.4, [Color.lerp(col, Colors.white, 0.45)!, col, Color.lerp(col, Colors.black, 0.3)!], [0, 0.5, 1]));
  }

  /// Hatched ground or wall: the solid line along a→b, hatch on the side of [n].
  static void ground(Canvas c, Offset a, Offset b, {Offset n = const Offset(0, 1), double depth = 16}) {
    c.drawLine(a, b, stroke(IX.inkSoft, 3));
    final d = b - a, len = d.distance;
    final u = d / len;
    final hp = stroke(IX.muted, 1.6);
    for (var s = 8.0; s < len; s += 16) {
      final p = a + u * s;
      c.drawLine(p, p + n * depth - u * depth * 0.7, hp);
    }
  }

  /// A coil spring from a to b.
  static void spring(Canvas c, Offset a, Offset b, {int coils = 12, double width = 22, Color color = IX.inkSoft, double w = 3}) {
    final d = b - a, len = d.distance;
    if (len < 1) return;
    final u = d / len, n = Offset(-u.dy, u.dx);
    final lead = math.min(18.0, len * 0.12);
    final path = Path()..moveTo(a.dx, a.dy);
    final p0 = a + u * lead;
    path.lineTo(p0.dx, p0.dy);
    final body = len - 2 * lead;
    final k = coils * 2;
    for (var i = 1; i < k; i++) {
      final q = p0 + u * (body * i / k) + n * (i.isOdd ? width / 2 : -width / 2);
      path.lineTo(q.dx, q.dy);
    }
    final p1 = b - u * lead;
    path..lineTo(p1.dx, p1.dy)..lineTo(b.dx, b.dy);
    c.drawPath(path, stroke(color, w));
  }

  /// Force arrow with a label at its head.
  static void force(Canvas c, Offset from, Offset to, Color col, String label, {double w = 5, Offset off = Offset.zero}) {
    if ((to - from).distance < 4) return;
    IxPaint.arrow(c, from, to, col, width: w, head: 20);
    final d = to - from;
    final u = d / d.distance;
    text(c, label, to + u * 26 + off, size: 20, color: col, halo: true);
  }

  /// A dimension line with end ticks and a centred label.
  static void dim(Canvas c, Offset a, Offset b, String label, {Color color = IX.inkSoft, double off = 0}) {
    final d = b - a;
    if (d.distance < 2) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final p = stroke(color, 1.8);
    c.drawLine(a, b, p);
    for (final e in [a, b]) {
      c.drawLine(e - n * 8, e + n * 8, p);
    }
    text(c, label, Offset.lerp(a, b, 0.5)! + n * (off == 0 ? -18 : off), size: 17, color: color, halo: true);
  }

  /// An angle arc at [o] from angle a0 to a1 (screen radians), labelled.
  static void angle(Canvas c, Offset o, double a0, double a1, double r, String label, {Color color = IX.inkSoft}) {
    c.drawArc(Rect.fromCircle(center: o, radius: r), a0, a1 - a0, false, stroke(color, 2));
    final m = (a0 + a1) / 2;
    text(c, label, o + Offset(math.cos(m), math.sin(m)) * (r + 20), size: 17, color: color, halo: true);
  }

  /// A rounded readout tag drawn on the stage.
  static void tag(Canvas c, String s, Offset at, {Color color = IX.ink, Alignment align = Alignment.center, double size = 18}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w600, c: color)), textDirection: TextDirection.ltr)..layout();
    final o = at - Offset((align.x + 1) / 2 * (tp.width + 24), (align.y + 1) / 2 * (tp.height + 14));
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(o.dx, o.dy, tp.width + 24, tp.height + 14), const Radius.circular(10));
    c.drawRRect(r, fill(Colors.white));
    c.drawRRect(r, stroke(color.withValues(alpha: 0.45), 1.5));
    tp.paint(c, o + const Offset(12, 7));
  }

  /// Stage caption at the top-left.
  static void caption(Canvas c, String s, {Offset at = const Offset(28, 24), double size = 19}) => text(c, s, at, size: size, color: IX.inkSoft, w: FontWeight.w500, align: Alignment.topLeft);

  // ── circuit symbols ──

  static Paint wire([Color c = IX.ink]) => stroke(c, 3.2);

  static void line(Canvas c, List<Offset> pts, [Color col = IX.ink]) {
    final p = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (final q in pts.skip(1)) {
      p.lineTo(q.dx, q.dy);
    }
    c.drawPath(p, wire(col));
  }

  /// Resistor (zig-zag) between a and b.
  static void resistor(Canvas c, Offset a, Offset b, {String? label, Color color = IX.ink, Offset labelOff = const Offset(0, -30)}) {
    final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
    final body = math.min(80.0, len * 0.6);
    final s = a + u * ((len - body) / 2), e = s + u * body;
    final path = Path()..moveTo(a.dx, a.dy)..lineTo(s.dx, s.dy);
    for (var i = 1; i <= 6; i++) {
      final q = s + u * (body * (i - 0.5) / 6) + n * (i.isOdd ? 12 : -12);
      path.lineTo(q.dx, q.dy);
    }
    path..lineTo(e.dx, e.dy)..lineTo(b.dx, b.dy);
    c.drawPath(path, wire(color));
    if (label != null) text(c, label, Offset.lerp(a, b, 0.5)! + labelOff, size: 19, color: color, halo: true);
  }

  /// Cell / battery: long plate +, short plate −, between a and b (a is +).
  static void cell(Canvas c, Offset a, Offset b, {String? label, int n = 1, Offset labelOff = const Offset(0, -40)}) {
    final d = b - a, len = d.distance, u = d / len, nn = Offset(-u.dy, u.dx);
    final gap = 14.0, w = n * 2 * gap - gap;
    final s = a + u * ((len - w) / 2);
    c.drawLine(a, s, wire());
    for (var i = 0; i < n; i++) {
      final p = s + u * (i * 2 * gap), q = p + u * gap;
      c.drawLine(p - nn * 22, p + nn * 22, stroke(IX.ink, 3.5));
      c.drawLine(q - nn * 11, q + nn * 11, stroke(IX.ink, 6));
    }
    c.drawLine(s + u * w, b, wire());
    if (label != null) text(c, label, Offset.lerp(a, b, 0.5)! + labelOff, size: 19, halo: true);
  }

  /// Capacitor symbol between a and b.
  static void capacitor(Canvas c, Offset a, Offset b, {String? label, Offset labelOff = const Offset(0, -40)}) {
    final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
    final m = Offset.lerp(a, b, 0.5)!;
    c.drawLine(a, m - u * 8, wire());
    c.drawLine(m + u * 8, b, wire());
    c.drawLine(m - u * 8 - n * 22, m - u * 8 + n * 22, stroke(IX.ink, 4.5));
    c.drawLine(m + u * 8 - n * 22, m + u * 8 + n * 22, stroke(IX.ink, 4.5));
    if (label != null) text(c, label, m + labelOff, size: 19, halo: true);
  }

  /// Inductor (loops) between a and b.
  static void inductor(Canvas c, Offset a, Offset b, {String? label, Offset labelOff = const Offset(0, -34)}) {
    final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
    final body = math.min(90.0, len * 0.7);
    final s = a + u * ((len - body) / 2);
    final path = Path()..moveTo(a.dx, a.dy)..lineTo(s.dx, s.dy);
    for (var i = 0; i < 4; i++) {
      final p0 = s + u * (body * i / 4);
      final p1 = p0 + u * (body / 4);
      final cp1 = p0 - n * 26, cp2 = p1 - n * 26;
      path.cubicTo(cp1.dx, cp1.dy, cp2.dx, cp2.dy, p1.dx, p1.dy);
    }
    path.lineTo(b.dx, b.dy);
    c.drawPath(path, wire());
    if (label != null) text(c, label, Offset.lerp(a, b, 0.5)! + labelOff, size: 19, halo: true);
  }

  /// A round meter (G, A, V) with an optional needle deflection in [-1, 1].
  static void meter(Canvas c, Offset at, String letter, {double r = 30, double? needle, Color color = IX.ink}) {
    c.drawCircle(at, r, fill(Colors.white));
    c.drawCircle(at, r, stroke(color, 3));
    if (needle != null) {
      final a = -math.pi / 2 + needle.clamp(-1.0, 1.0) * 0.9;
      c.drawLine(at + const Offset(0, 10), at + const Offset(0, 10) + Offset(math.cos(a), math.sin(a)) * (r * 0.95), stroke(IX.positive, 2.5));
      text(c, letter, at + Offset(0, r * 0.45), size: r * 0.5, color: color);
    } else {
      text(c, letter, at, size: r * 0.8, color: color);
    }
  }

  /// A filament bulb glowing with [glow] in 0..1.
  static void bulb(Canvas c, Offset at, double glow, {double r = 30}) {
    if (glow > 0.01) c.drawCircle(at, r * (1.6 + glow), Paint()..shader = ui.Gradient.radial(at, r * (1.6 + glow), [const Color(0xFFFDE68A).withValues(alpha: 0.85 * glow), const Color(0x00FDE68A)]));
    c.drawCircle(at, r, fill(Color.lerp(const Color(0xFFF3F4F6), const Color(0xFFFDE68A), glow.clamp(0, 1))!));
    c.drawCircle(at, r, stroke(IX.inkSoft, 2.5));
    final f = Path()..moveTo(at.dx - r * 0.45, at.dy + r * 0.3);
    for (var i = 0; i < 4; i++) {
      f.relativeQuadraticBezierTo(r * 0.11, -r * 0.5, r * 0.225, 0);
    }
    c.drawPath(f, stroke(Color.lerp(IX.inkSoft, IX.amber, glow)!, 2.5));
  }

  /// A junction dot.
  static void node(Canvas c, Offset at, [String? label, Offset off = const Offset(0, -24)]) {
    c.drawCircle(at, 6, fill(IX.ink));
    if (label != null) text(c, label, at + off, size: 20);
  }

  /// A small bar chart in [r]: signed values (a zero line in the middle when any are negative),
  /// each bar labelled underneath and valued at its end.
  static void bars(Canvas c, Rect r, List<(String, double, Color)> items, {double? max, String unit = '', String? title, int dp = 1}) {
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), fill(const Color(0xFFFAFBFE)));
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), stroke(IX.rule, 1.5));
    if (title != null) text(c, title, Offset(r.left + 20, r.top + 16), size: 18, align: Alignment.topLeft);
    final top = r.top + (title == null ? 46 : 80), bot = r.bottom - 44;
    final neg = items.any((e) => e.$2 < -1e-9);
    final m = math.max(1e-9, max ?? items.fold<double>(0, (a, e) => math.max(a, e.$2.abs())));
    final zero = neg ? (top + bot) / 2 : bot;
    final scale = (neg ? (bot - top) / 2 : bot - top) / m;
    final n = items.length;
    final slot = (r.width - 40) / n, bw = math.min(70.0, slot * 0.55);
    c.drawLine(Offset(r.left + 16, zero), Offset(r.right - 16, zero), stroke(IX.inkSoft, 2));
    for (var i = 0; i < n; i++) {
      final (lab, val, col) = items[i];
      final cx = r.left + 20 + slot * (i + 0.5);
      final h = (val * scale).clamp(-(zero - top + 10), bot - top + 10);
      final rect = Rect.fromLTRB(cx - bw / 2, math.min(zero, zero - h), cx + bw / 2, math.max(zero, zero - h));
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(5)), fill(col.withValues(alpha: 0.85)));
      text(c, '${fx(val, dp)}${unit.isEmpty ? '' : ' $unit'}', Offset(cx, val >= 0 ? rect.top - 14 : rect.bottom + 14), size: 16, color: col);
      text(c, lab, Offset(cx, r.bottom - 22), size: 16, color: IX.inkSoft, w: FontWeight.w500);
    }
  }

  /// An inclined plane: the triangle with its right angle at bottom-right... returns the
  /// slope's bottom and top points.
  static (Offset, Offset) incline(Canvas c, Offset bottomLeft, double base, double theta, {Color col = const Color(0xFFDCE1EA)}) {
    final top = bottomLeft + Offset(base, -base * math.tan(theta));
    final br = bottomLeft + Offset(base, 0);
    final tri = Path()..moveTo(bottomLeft.dx, bottomLeft.dy)..lineTo(top.dx, top.dy)..lineTo(br.dx, br.dy)..close();
    c.drawPath(tri, Paint()..shader = ui.Gradient.linear(top, bottomLeft, [Color.lerp(col, Colors.white, 0.4)!, col]));
    c.drawPath(tri, stroke(IX.inkSoft, 2.5));
    return (bottomLeft, top);
  }

  /// A spinning sun-like glow used for light sources.
  static void lamp(Canvas c, Offset at, Color col, {double r = 26}) {
    c.drawCircle(at, r * 2.2, Paint()..shader = ui.Gradient.radial(at, r * 2.2, [col.withValues(alpha: 0.35), col.withValues(alpha: 0)]));
    ball(c, at, r, col);
  }

  /// A smooth wave path y = amp sin(k x + phase) along a horizontal line.
  static Path wave(double x0, double x1, double y, double amp, double lambdaPx, double phase, {double step = 3}) {
    final p = Path();
    for (var x = x0; x <= x1; x += step) {
      final yy = y - amp * math.sin(2 * math.pi * (x - x0) / lambdaPx + phase);
      x == x0 ? p.moveTo(x, yy) : p.lineTo(x, yy);
    }
    return p;
  }

  /// Visible-light colour for a wavelength in nm (muted, for drawing).
  static Color spectral(double nm) {
    double r = 0, g = 0, b = 0;
    if (nm < 380) {
      return const Color(0xFF6D28D9);
    } else if (nm < 440) {
      r = -(nm - 440) / 60;
      b = 1;
    } else if (nm < 490) {
      g = (nm - 440) / 50;
      b = 1;
    } else if (nm < 510) {
      g = 1;
      b = -(nm - 510) / 20;
    } else if (nm < 580) {
      r = (nm - 510) / 70;
      g = 1;
    } else if (nm < 645) {
      r = 1;
      g = -(nm - 645) / 65;
    } else if (nm <= 780) {
      r = 1;
    } else {
      return const Color(0xFF7F1D1D);
    }
    final col = Color.fromARGB(255, (r * 235).round(), (g * 215).round(), (b * 235).round());
    return Color.lerp(col, const Color(0xFF13165A), 0.12)!;
  }
}

/// Drag helper: picks the nearest named handle within [reach] px on touch-down and remembers it
/// in v['_drag'] (index into [handles]); returns the index being dragged, or null.
int? pick(V v, Offset p, bool start, List<Offset> handles, {double reach = 70}) {
  if (start) {
    var best = -1;
    var bd = reach;
    for (var i = 0; i < handles.length; i++) {
      final d = (handles[i] - p).distance;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) {
      v.remove('_drag');
      return null;
    }
    v['_drag'] = best.toDouble();
  }
  final d = v['_drag'];
  return d?.round();
}
