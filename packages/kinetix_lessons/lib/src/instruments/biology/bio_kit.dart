import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';

/// Textbook colours for living things: muted, printed-plate tones, never neon.
abstract final class BioC {
  static const membrane = Color(0xFFB5577A);
  static const cytoplasm = Color(0xFFFBEFE3);
  static const nucleus = Color(0xFF8C6BB1);
  static const nucleolus = Color(0xFF4B2E7A);
  static const chromatin = Color(0xFF5B3D8F);
  static const chloro = Color(0xFF4E9A45);
  static const chloroDark = Color(0xFF2F6B2A);
  static const mito = Color(0xFFD9824B);
  static const er = Color(0xFF6E8FC7);
  static const golgi = Color(0xFFD6A13C);
  static const vacuole = Color(0xFFCFE6F2);
  static const wall = Color(0xFF9DBB63);
  static const lyso = Color(0xFFB0475A);
  static const ribo = Color(0xFF3D4A7A);
  static const oxy = Color(0xFFC6383B);
  static const deoxy = Color(0xFF4B63B0);
  static const muscle = Color(0xFFC9666A);
  static const tissue = Color(0xFFF2C9B8);
  static const bone = Color(0xFFEFE5CF);
  static const nerve = Color(0xFFE7C35A);
  static const myelin = Color(0xFFF4E3B2);
  static const water = Color(0xFF5B9BD5);
  static const sugar = Color(0xFFE0A030);
  static const leaf = Color(0xFF5F9E3A);
  static const soil = Color(0xFF9A7653);
  static const petal = Color(0xFFE48AA6);
  static const atp = Color(0xFFC2410C);
  static const nadh = Color(0xFF7C3AED);
  static const dnaA = Color(0xFFD9534F);
  static const dnaT = Color(0xFFE6A23C);
  static const dnaG = Color(0xFF3F8F5A);
  static const dnaC = Color(0xFF3F6FB5);
  static const male = Color(0xFF3F6FB5);
  static const female = Color(0xFFC0507A);
}

/// Organic drawing: smooth blobs, soft shading, leader-line labels.
abstract final class Bio {
  /// A smooth closed (or open) Catmull–Rom curve through [pts].
  static Path smooth(List<Offset> pts, {bool closed = true}) {
    final p = Path();
    if (pts.length < 2) return p;
    final n = pts.length;
    Offset at(int i) => closed ? pts[(i + n) % n] : pts[i.clamp(0, n - 1)];
    p.moveTo(pts[0].dx, pts[0].dy);
    final segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      final p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      final c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
      p.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    if (closed) p.close();
    return p;
  }

  /// A gently irregular ellipse, the outline of a cell or organelle.
  static Path blob(Offset c, double rx, double ry, {int seed = 1, double wobble = 0.05, int n = 12, double rot = 0}) {
    final r = math.Random(seed);
    final pts = <Offset>[];
    for (var i = 0; i < n; i++) {
      final a = 2 * math.pi * i / n;
      final k = 1 + wobble * (r.nextDouble() * 2 - 1);
      final x = math.cos(a) * rx * k, y = math.sin(a) * ry * k;
      pts.add(c + Offset(x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)));
    }
    return smooth(pts);
  }

  static Color lighten(Color c, double t) => Color.lerp(c, Colors.white, t)!;
  static Color darken(Color c, double t) => Color.lerp(c, Colors.black, t)!;

  /// Fills [p] like a shaded plate: a soft drop shadow, a radial light from the upper left and
  /// a darker outline.
  static void soft(Canvas c, Path p, Color base, {double stroke = 2, bool shadow = true, Color? edge, double light = 0.45}) {
    final b = p.getBounds();
    if (shadow) c.drawPath(p.shift(const Offset(0, 4)), Paint()..color = const Color(0x1C13165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7));
    final r = math.max(b.width, b.height) * 0.75;
    c.drawPath(p, Paint()..shader = ui.Gradient.radial(b.center + Offset(-b.width * 0.22, -b.height * 0.25), math.max(r, 1), [lighten(base, light), base, darken(base, 0.12)], [0, 0.6, 1]));
    if (stroke > 0) c.drawPath(p, Paint()..color = edge ?? darken(base, 0.35)..style = PaintingStyle.stroke..strokeWidth = stroke..strokeJoin = StrokeJoin.round);
  }

  static void stroke(Canvas c, Path p, Color color, [double w = 2]) =>
      c.drawPath(p, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);

  static void fill(Canvas c, Path p, Color color) => c.drawPath(p, Paint()..color = color);

  /// A textbook leader label: a dot on the part, a thin line, the name at [at]. The text sits to
  /// the left of [at] when the line runs leftwards.
  static void leader(Canvas c, Offset anchor, Offset at, String text, {bool active = false, double size = 18, Color? color}) {
    final col = color ?? (active ? IX.accent : IX.ink);
    final line = Paint()..color = active ? IX.accent : IX.inkSoft.withValues(alpha: 0.85)..strokeWidth = active ? 2.2 : 1.4;
    final left = at.dx < anchor.dx;
    final elbow = Offset(at.dx + (left ? 14 : -14), at.dy);
    c.drawLine(anchor, elbow, line);
    c.drawLine(elbow, at, line);
    c.drawCircle(anchor, active ? 5.5 : 4, Paint()..color = col);
    c.drawCircle(anchor, active ? 5.5 : 4, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 1.5);
    IxPaint.label(c, text, at + Offset(left ? -6 : 6, 0), size: size, color: col, w: active ? FontWeight.w700 : FontWeight.w600, align: left ? Alignment.centerRight : Alignment.centerLeft, halo: true);
  }

  /// A filled pill tag with white text (a molecule, a count).
  static void tag(Canvas c, String s, Offset center, Color color, {double size = 16, Color text = Colors.white}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w600, c: text)), textDirection: TextDirection.ltr)..layout();
    final r = RRect.fromRectAndRadius(Rect.fromCenter(center: center, width: tp.width + 18, height: tp.height + 8), Radius.circular((tp.height + 8) / 2));
    c.drawRRect(r.shift(const Offset(0, 2)), Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
    c.drawRRect(r, Paint()..color = color);
    tp.paint(c, center - Offset(tp.width / 2, tp.height / 2));
  }

  /// A panel heading drawn on the stage.
  static void heading(Canvas c, String s, Offset at, {double size = 22, Alignment align = Alignment.topLeft, Color color = IX.ink}) =>
      IxPaint.label(c, s, at, size: size, color: color, w: FontWeight.w600, align: align);

  static void note(Canvas c, String s, Offset at, {double size = 17, Alignment align = Alignment.topLeft, Color color = IX.inkSoft, double? maxWidth, FontWeight w = FontWeight.w500}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: w, c: color, height: 1.3)), textDirection: TextDirection.ltr)..layout(maxWidth: maxWidth ?? double.infinity);
    final o = at - Offset((align.x + 1) / 2 * tp.width, (align.y + 1) / 2 * tp.height);
    tp.paint(c, o);
  }

  /// A small rounded card painted on the stage (legend, equation, flow box).
  static void card(Canvas c, Rect r, {Color fill = IX.paper, Color edge = IX.rule, double radius = 14}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(radius));
    c.drawRRect(rr.shift(const Offset(0, 3)), Paint()..color = const Color(0x1213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
    c.drawRRect(rr, Paint()..color = fill);
    c.drawRRect(rr, Paint()..color = edge..style = PaintingStyle.stroke..strokeWidth = 1.5);
  }

  /// A labelled box with centred text (flow charts, pathways).
  static void box(Canvas c, Rect r, String s, {Color color = IX.accent, double size = 18, bool filled = false}) {
    card(c, r, fill: filled ? color : Color.alphaBlend(color.withValues(alpha: 0.10), IX.paper), edge: color.withValues(alpha: 0.6));
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w600, c: filled ? Colors.white : Bio.darken(color, 0.25), height: 1.2)), textAlign: TextAlign.center, textDirection: TextDirection.ltr)..layout(maxWidth: r.width - 12);
    tp.paint(c, r.center - Offset(tp.width / 2, tp.height / 2));
  }

  /// A curved arrow from [a] to [b] bowing by [bend] (positive bows to the left of travel).
  static void curvedArrow(Canvas c, Offset a, Offset b, Color color, {double bend = 40, double width = 3}) {
    final m = (a + b) / 2, d = b - a;
    if (d.distance < 1) return;
    final n = Offset(-d.dy, d.dx) / d.distance;
    final ctl = m + n * bend;
    final path = Path()..moveTo(a.dx, a.dy)..quadraticBezierTo(ctl.dx, ctl.dy, b.dx, b.dy);
    stroke(c, path, color, width);
    final t = (b - ctl) / (b - ctl).distance;
    final nn = Offset(-t.dy, t.dx);
    const h = 13.0;
    c.drawPath(Path()..moveTo(b.dx, b.dy)..lineTo((b - t * h + nn * h * 0.45).dx, (b - t * h + nn * h * 0.45).dy)..lineTo((b - t * h - nn * h * 0.45).dx, (b - t * h - nn * h * 0.45).dy)..close(), Paint()..color = color);
  }

  /// A phospholipid bilayer strip from [a] to [b] (heads outward), [h] thick.
  static void bilayer(Canvas c, Offset a, Offset b, {double h = 34, Color head = BioC.membrane}) {
    final d = b - a, len = d.distance;
    final u = d / len, n = Offset(-u.dy, u.dx);
    final band = Path()
      ..moveTo((a + n * h / 2).dx, (a + n * h / 2).dy)
      ..lineTo((b + n * h / 2).dx, (b + n * h / 2).dy)
      ..lineTo((b - n * h / 2).dx, (b - n * h / 2).dy)
      ..lineTo((a - n * h / 2).dx, (a - n * h / 2).dy)
      ..close();
    c.drawPath(band, Paint()..color = const Color(0xFFFFF4D9));
    final tail = Paint()..color = const Color(0xFFD9B36A)..strokeWidth = 1.6;
    for (var s = 6.0; s < len; s += 12) {
      final o = a + u * s;
      for (final side in [1.0, -1.0]) {
        final hc = o + n * side * (h / 2 - 5);
        c.drawLine(hc - n * side * 4, o + n * side * 2, tail);
        c.drawCircle(hc, 5, Paint()..color = head);
      }
    }
  }
}

/// A chart on the stage: axes, ticks, gridlines and curves in data coordinates.
class Plot {
  Plot(this.r, this.x0, this.x1, this.y0, this.y1, {this.logY = false});
  final Rect r;
  final double x0, x1, y0, y1;
  final bool logY;

  double _ty(double y) => logY ? math.log(math.max(y, 1e-300)) / math.ln10 : y;
  Offset pt(double x, double y) {
    final ty = (_ty(y) - _ty(y0)) / (_ty(y1) - _ty(y0));
    return Offset(r.left + r.width * (x - x0) / (x1 - x0), r.bottom - r.height * ty.clamp(-0.05, 1.05));
  }

  void frame(Canvas c, {required List<double> xs, required List<double> ys, String? xLabel, String? yLabel, String Function(double)? fx, String Function(double)? fy, String? title}) {
    final g = Paint()..color = IX.grid..strokeWidth = 1;
    for (final x in xs) {
      final p = pt(x, y0);
      c.drawLine(Offset(p.dx, r.top), Offset(p.dx, r.bottom), g);
      IxPaint.label(c, fx?.call(x) ?? _f(x), Offset(p.dx, r.bottom + 14), size: 16, color: IX.inkSoft);
    }
    for (final y in ys) {
      final p = pt(x0, y);
      c.drawLine(Offset(r.left, p.dy), Offset(r.right, p.dy), g);
      IxPaint.label(c, fy?.call(y) ?? _f(y), Offset(r.left - 10, p.dy), size: 16, color: IX.inkSoft, align: Alignment.centerRight);
    }
    final ax = Paint()..color = IX.inkSoft..strokeWidth = 2;
    c.drawLine(r.bottomLeft, r.bottomRight, ax);
    c.drawLine(r.bottomLeft, r.topLeft, ax);
    if (xLabel != null) IxPaint.label(c, xLabel, Offset(r.center.dx, r.bottom + 44), size: 17, color: IX.inkSoft, w: FontWeight.w600);
    if (yLabel != null) {
      c.save();
      c.translate(r.left - 64, r.center.dy);
      c.rotate(-math.pi / 2);
      IxPaint.label(c, yLabel, Offset.zero, size: 17, color: IX.inkSoft, w: FontWeight.w600);
      c.restore();
    }
    if (title != null) Bio.heading(c, title, r.topLeft + const Offset(0, -38), size: 21);
  }

  static String _f(double v) {
    if (v == v.roundToDouble()) {
      final a = v.abs();
      if (a >= 10000) return '${(v / 1000).round()}k';
      return v.toStringAsFixed(0);
    }
    return v.toStringAsFixed(v.abs() < 1 ? 2 : 1);
  }

  Path path(double Function(double) f, {double? from, double? to, int n = 240}) {
    final a = from ?? x0, b = to ?? x1;
    final p = Path();
    for (var i = 0; i <= n; i++) {
      final x = a + (b - a) * i / n;
      final y = f(x);
      final q = pt(x, y.isFinite ? y : y1);
      i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
    }
    return p;
  }

  void curve(Canvas c, double Function(double) f, Color color, {double w = 4, double? from, double? to, bool dashed = false, String? label, double? labelX}) {
    c.save();
    c.clipRect(r.inflate(4));
    final p = path(f, from: from, to: to);
    if (dashed) {
      for (final m in p.computeMetrics()) {
        for (var s = 0.0; s < m.length; s += 22) {
          c.drawPath(m.extractPath(s, math.min(s + 12, m.length)), Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round);
        }
      }
    } else {
      c.drawPath(p, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
    }
    c.restore();
    if (label != null) {
      final lx = labelX ?? (x0 + (x1 - x0) * 0.85);
      IxPaint.label(c, label, pt(lx, f(lx)) + const Offset(0, -18), size: 17, color: color, w: FontWeight.w700, halo: true);
    }
  }

  void dot(Canvas c, double x, double y, Color color, {String? label, Alignment align = Alignment.centerLeft}) {
    final p = pt(x, y);
    c.drawCircle(p, 13, Paint()..color = color.withValues(alpha: 0.16));
    c.drawCircle(p, 8, Paint()..color = color);
    c.drawCircle(p, 8, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2.5);
    if (label != null) IxPaint.label(c, label, p + Offset(align.x < 0 ? 16 : (align.x > 0 ? -16 : 0), align.x == 0 ? -26 : 0), size: 17, color: color, w: FontWeight.w600, align: align, halo: true);
  }

  void hline(Canvas c, double y, Color color, {String? label}) {
    final p = pt(x0, y);
    IxPaint.dashed(c, Offset(r.left, p.dy), Offset(r.right, p.dy), Paint()..color = color..strokeWidth = 2);
    if (label != null) IxPaint.label(c, label, Offset(r.right - 6, p.dy - 14), size: 16, color: color, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
  }

  void vline(Canvas c, double x, Color color, {String? label, double w = 2}) {
    final p = pt(x, y0);
    IxPaint.dashed(c, Offset(p.dx, r.top), Offset(p.dx, r.bottom), Paint()..color = color..strokeWidth = w);
    if (label != null) IxPaint.label(c, label, Offset(p.dx + 8, r.top + 12), size: 16, color: color, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
  }

  /// Vertical bars at x = 0..n-1 centred in equal slots (x0 = -0.5, x1 = n - 0.5).
  void bars(Canvas c, List<double> vals, List<Color> colors, {List<String>? labels, String Function(double)? fmt, double width = 0.62}) {
    for (var i = 0; i < vals.length; i++) {
      final top = pt(i - width / 2, vals[i]), bot = pt(i + width / 2, y0);
      final rect = Rect.fromLTRB(top.dx, top.dy, bot.dx, bot.dy);
      final col = colors[i % colors.length];
      c.drawRRect(RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..shader = ui.Gradient.linear(rect.centerLeft, rect.centerRight, [Bio.lighten(col, 0.2), col, Bio.darken(col, 0.1)], [0, 0.5, 1]));
      if (fmt != null) IxPaint.label(c, fmt(vals[i]), Offset(rect.center.dx, rect.top - 16), size: 17, color: IX.ink, w: FontWeight.w600);
      if (labels != null) IxPaint.label(c, labels[i], Offset(rect.center.dx, r.bottom + 18), size: 16, color: IX.inkSoft, w: FontWeight.w600);
    }
  }
}

/// Shared state for biology instruments: a mode, numeric parameters, string choices and the
/// presets row. A lesson preset is a map such as {"mode": "mitosis", "step": 3}.
abstract class BioState<T extends StatefulWidget> extends State<T> {
  String mode = '';
  final v = <String, double>{};
  final s = <String, String>{};
  int? active;

  String get instrumentId;
  Map<String, dynamic> get lessonPreset;
  Map<String, Map<String, dynamic>> get presets;
  List<String> get modes;
  Map<String, Object> defaults(String mode);

  @override
  void initState() {
    super.initState();
    final p = lessonPreset.isEmpty ? presets.values.first : lessonPreset;
    apply(p);
    if (lessonPreset.isEmpty) active = 0;
  }

  void apply(Map<String, dynamic> p) {
    final m = p['mode'] as String?;
    mode = modes.contains(m) ? m! : modes.first;
    v.clear();
    s.clear();
    for (final e in {...defaults(mode), ...p}.entries) {
      if (e.key == 'mode') continue;
      final x = e.value;
      if (x is num) {
        v[e.key] = x.toDouble();
      } else if (x is bool) {
        v[e.key] = x ? 1 : 0;
      } else if (x is String) {
        s[e.key] = x;
      }
    }
  }

  double n(String k, [double d = 0]) => v[k] ?? d;
  int i(String k, [int d = 0]) => (v[k] ?? d).round();
  bool b(String k) => (v[k] ?? 0) > 0.5;
  String str(String k, [String d = '']) => s[k] ?? d;

  void set(String k, Object x) => setState(() {
    if (x is String) {
      s[k] = x;
    } else if (x is bool) {
      v[k] = x ? 1 : 0;
    } else {
      v[k] = (x as num).toDouble();
    }
    active = null;
  });

  Widget slider(String k, String label, double min, double max, {String unit = '', int dp = 0, int? div, String Function(double)? fmt}) =>
      IxSlider(label: label, value: n(k).clamp(min, max), min: min, max: max, unit: unit, divisions: div, format: fmt ?? (x) => x.toStringAsFixed(dp), onChanged: (x) => set(k, dp == 0 && div == null ? x.roundToDouble() : x));

  Widget choice(String k, String label, Map<String, String> options) =>
      IxSegments<String>(label: label, options: options, value: options.containsKey(str(k)) ? str(k) : options.keys.first, onChanged: (x) => set(k, x));

  Widget toggle(String k, String label, {String on = 'On', String off = 'Off'}) =>
      IxSegments<bool>(label: label, options: {false: off, true: on}, value: b(k), onChanged: (x) => set(k, x));

  /// Previous / next through named stages, with the stage name between.
  Widget stepper(String k, List<String> names, {String label = 'Stage'}) {
    final at = i(k).clamp(0, names.length - 1);
    Widget btn(IconData ic, bool en, VoidCallback f) => SizedBox(
      width: 64,
      height: 56,
      child: FilledButton(
        style: FilledButton.styleFrom(padding: EdgeInsets.zero, backgroundColor: IX.accent, disabledBackgroundColor: IX.grid, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        onPressed: en ? f : null,
        child: Icon(ic, size: 30, color: en ? Colors.white : IX.muted),
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('$label ${at + 1} of ${names.length}', style: IX.text(18, w: FontWeight.w500, c: IX.inkSoft)),
        const SizedBox(height: 8),
        Row(children: [
          btn(Icons.chevron_left_rounded, at > 0, () => set(k, at - 1)),
          Expanded(child: Text(names[at], textAlign: TextAlign.center, style: IX.text(21, w: FontWeight.w600), maxLines: 2)),
          btn(Icons.chevron_right_rounded, at < names.length - 1, () => set(k, at + 1)),
        ]),
      ]),
    );
  }

  /// A full-width action button (Stimulate, Next generation).
  Widget action(String label, IconData icon, VoidCallback f, {Color color = IX.accent}) => Padding(
    padding: const EdgeInsets.only(top: 6, bottom: 8),
    child: SizedBox(
      height: 56,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: color, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        onPressed: f,
        icon: Icon(icon, size: 26),
        label: Text(label, style: IX.text(20, w: FontWeight.w600, c: Colors.white)),
      ),
    ),
  );

  Widget frame({required String title, required String subtitle, required List<Readout> readouts, required CustomPainter painter, List<Widget> controls = const [], String? formula, void Function(Offset at, Size size)? onTap}) {
    final names = presets.keys.toList();
    return InstrumentFrame(
      id: instrumentId,
      title: title,
      subtitle: subtitle,
      formula: formula,
      state: {'mode': mode, ...v, ...s},
      readouts: readouts,
      controls: controls,
      presets: [for (var k = 0; k < names.length; k++) Preset(names[k], () => setState(() { apply(presets[names[k]]!); active = k; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final paint = CustomPaint(painter: painter, child: const SizedBox.expand());
        if (onTap == null) return paint;
        return GestureDetector(behavior: HitTestBehavior.opaque, onTapDown: (d) => onTap(d.localPosition, box.biggest), child: paint);
      }),
    );
  }
}

/// A painter that draws through a callback, so each instrument can keep its drawing code in
/// one place with its state.
class BioPainter extends CustomPainter {
  BioPainter(this.draw);
  final void Function(Canvas c, Size size) draw;
  @override
  void paint(Canvas canvas, Size size) => draw(canvas, size);
  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

String f0(double x) => x.toStringAsFixed(0);
String f1(double x) => x.toStringAsFixed(1);
String f2(double x) => x.toStringAsFixed(2);

/// Thousands separated, Indian style is avoided for clarity: 12,000.
String grp(num x) {
  final s = x.round().abs().toString();
  final b = StringBuffer();
  for (var k = 0; k < s.length; k++) {
    if (k > 0 && (s.length - k) % 3 == 0) b.write(',');
    b.write(s[k]);
  }
  return '${x < 0 ? '−' : ''}$b';
}

/// One labelled part of a diagram: where its leader starts, its name and what it does.
class BioPart {
  const BioPart(this.id, this.name, this.anchor, [this.info = '']);
  final String id, name, info;
  final Offset anchor;
}

/// Lays labels out in a left and a right column beside a diagram so they never overlap: each
/// part goes to the side its anchor is on, in the order of height. Returns label positions.
Map<String, Offset> layoutLabels(List<BioPart> parts, {required double midX, required double leftX, required double rightX, required double top, required double bottom, double gap = 44}) {
  final out = <String, Offset>{};
  for (final left in [true, false]) {
    final side = parts.where((p) => (p.anchor.dx < midX) == left).toList()..sort((a, b) => a.anchor.dy.compareTo(b.anchor.dy));
    if (side.isEmpty) continue;
    // Start at each anchor's height, then push apart top-down and pull back inside bottom-up.
    final ys = [for (final p in side) p.anchor.dy.clamp(top, bottom)];
    for (var k = 1; k < ys.length; k++) {
      if (ys[k] < ys[k - 1] + gap) ys[k] = ys[k - 1] + gap;
    }
    if (ys.last > bottom) {
      ys[ys.length - 1] = bottom;
      for (var k = ys.length - 2; k >= 0; k--) {
        if (ys[k] > ys[k + 1] - gap) ys[k] = ys[k + 1] - gap;
      }
    }
    for (var k = 0; k < side.length; k++) {
      out[side[k].id] = Offset(left ? leftX : rightX, ys[k]);
    }
  }
  return out;
}

/// Draws every part's leader label and returns the id under [tap], if any.
void drawLabels(Canvas c, List<BioPart> parts, Map<String, Offset> at, String? activeId, {double size = 18}) {
  for (final p in parts) {
    final pos = at[p.id];
    if (pos == null) continue;
    Bio.leader(c, p.anchor, pos, p.name, active: p.id == activeId, size: size);
  }
}

String? hitPart(List<BioPart> parts, Map<String, Offset> at, Offset tap) {
  String? best;
  var bd = 70.0;
  for (final p in parts) {
    final d = (p.anchor - tap).distance;
    if (d < bd) {
      bd = d;
      best = p.id;
    }
    final l = at[p.id];
    if (l != null && (l.dy - tap.dy).abs() < 20 && ((l.dx < p.anchor.dx && tap.dx < l.dx + 10 && tap.dx > l.dx - 260) || (l.dx >= p.anchor.dx && tap.dx > l.dx - 10 && tap.dx < l.dx + 260))) return p.id;
  }
  return best;
}

/// The info card for the selected part, at the foot of the stage.
void infoCard(Canvas c, Rect r, BioPart? p, {String hint = 'Tap any part of the diagram to read what it does.'}) {
  Bio.card(c, r, fill: p == null ? IX.page : IX.paper, edge: p == null ? IX.rule : IX.accent.withValues(alpha: 0.5));
  if (p == null) {
    Bio.note(c, hint, Offset(r.left + 24, r.center.dy), align: Alignment.centerLeft, size: 18, color: IX.muted);
    return;
  }
  Bio.heading(c, p.name, Offset(r.left + 24, r.top + 16), size: 21, color: IX.accent);
  Bio.note(c, p.info, Offset(r.left + 24, r.top + 48), size: 18, color: IX.ink, maxWidth: r.width - 48, w: FontWeight.w400);
}

/// A shaded leaf from [base] to [tip] with a midrib and side veins.
void drawLeaf(Canvas c, Offset base, Offset tip, double width, {Color color = BioC.leaf, bool veins = true}) {
  final d = tip - base, len = d.distance;
  final u = d / len, n = Offset(-u.dy, u.dx);
  Offset at(double t, double w) => base + u * (len * t) + n * w;
  final p = Path()
    ..moveTo(base.dx, base.dy)
    ..cubicTo(at(0.25, width * 0.9).dx, at(0.25, width * 0.9).dy, at(0.7, width * 0.75).dx, at(0.7, width * 0.75).dy, tip.dx, tip.dy)
    ..cubicTo(at(0.7, -width * 0.75).dx, at(0.7, -width * 0.75).dy, at(0.25, -width * 0.9).dx, at(0.25, -width * 0.9).dy, base.dx, base.dy)
    ..close();
  Bio.soft(c, p, color, stroke: 2, light: 0.35);
  if (!veins) return;
  final v = Paint()..color = Bio.lighten(color, 0.45)..strokeWidth = 2.2..strokeCap = StrokeCap.round;
  c.drawLine(base, at(0.96, 0), v);
  for (var t = 0.18; t < 0.85; t += 0.13) {
    final w = width * 0.62 * math.sin(math.pi * (t * 0.9 + 0.08));
    for (final s in [1.0, -1.0]) {
      c.drawLine(at(t, 0), at(t + 0.12, s * w), v..strokeWidth = 1.5);
    }
  }
}

/// A thin labelled arrow with a molecule tag at its tail (inputs and outputs of a process).
void flowArrow(Canvas c, Offset from, Offset to, String text, Color color) {
  IxPaint.arrow(c, from, to, color, width: 4, head: 16);
  Bio.tag(c, text, from, color, size: 18);
}
