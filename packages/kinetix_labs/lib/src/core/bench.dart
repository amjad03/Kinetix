import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:kinetix_ui/kinetix_ui.dart' show KxFonts;
/// Text laid out for drawing on a bench (Hindi and Kannada come from the
/// bundled Noto fonts).
TextPainter layoutText(String text, double fontSize, Color color, {bool bold = false}) => TextPainter(
      text: TextSpan(
        text: text.isEmpty ? ' ' : text,
        style: TextStyle(
          fontSize: fontSize,
          color: color,
          height: 1.25,
          fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
          fontFamily: KxFonts.family,
          fontFamilyFallback: KxFonts.fallback,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: fontSize * 40);

/// The settings of a bench (plain JSON values, so they can be sent to the
/// projector and saved).
typedef LabParams = Map<String, dynamic>;

/// One column of the observation table. Numbers are shown with [decimals].
class LabColumn {
  final String label;
  final int decimals;
  const LabColumn(this.label, [this.decimals = 2]);

  String format(Object cell) => switch (cell) {
        final int v => '$v',
        final double v => v.toStringAsFixed(decimals),
        _ => '$cell',
      };
}

/// What "Record reading" gets: a row for the table, or why there is none.
class LabReading {
  final List<Object>? row;
  final String? why;
  const LabReading.row(List<Object> this.row) : why = null;
  const LabReading.not(String this.why) : row = null;
}

/// A graph of two numeric columns of the table.
class LabGraph {
  final int x;
  final int y;

  /// Draw the best straight line through the origin (y = kx).
  final bool throughOrigin;

  /// A horizontal line for the value the points should settle to.
  final double? refY;

  /// Only rows this accepts are plotted (null: all).
  final bool Function(List<Object> row)? include;

  /// Axes start at zero (false: they fit the readings, as for a curve
  /// that lives far from the origin).
  final bool fromZero;

  /// Draw the best straight line y = mx + c (least squares, with an intercept).
  final bool line;

  /// Join the points in order of x (a characteristic curve).
  final bool curve;

  const LabGraph(this.x, this.y, {this.throughOrigin = false, this.line = false, this.curve = false, this.refY, this.include, this.fromZero = true});

  List<Offset> points(List<List<Object>> rows) => [
        for (final r in rows)
          if ((include == null || include!(r)) && r.length > math.max(x, y) && r[x] is num && r[y] is num)
            Offset((r[x] as num).toDouble(), (r[y] as num).toDouble()),
      ];

  /// Slope k of the best line y = kx through the origin (least squares).
  static double? slope(List<Offset> pts) {
    var sxy = 0.0, sxx = 0.0;
    for (final p in pts) {
      sxy += p.dx * p.dy;
      sxx += p.dx * p.dx;
    }
    return pts.isEmpty || sxx == 0 ? null : sxy / sxx;
  }

  /// The best line y = mx + c with the standard errors of m and c (null
  /// with fewer than two distinct x values).
  static LinearFit? fit(List<Offset> pts) => LinearFit.of([for (final p in pts) p.dx], [for (final p in pts) p.dy]);
}

/// A least-squares straight line y = slope·x + intercept, with the
/// standard error of each (zero when the points lie exactly on the line or
/// there are only two of them).
class LinearFit {
  final double slope, intercept, slopeSe, interceptSe;

  /// Coefficient of determination (1 = a perfect line).
  final double r2;
  final int n;
  const LinearFit(this.slope, this.intercept, this.slopeSe, this.interceptSe, this.r2, this.n);

  static LinearFit? of(List<double> xs, List<double> ys) {
    final n = math.min(xs.length, ys.length);
    if (n < 2) return null;
    var mx = 0.0, my = 0.0;
    for (var i = 0; i < n; i++) {
      mx += xs[i];
      my += ys[i];
    }
    mx /= n;
    my /= n;
    var sxx = 0.0, sxy = 0.0, syy = 0.0;
    for (var i = 0; i < n; i++) {
      sxx += (xs[i] - mx) * (xs[i] - mx);
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    if (sxx == 0) return null;
    final m = sxy / sxx, c = my - m * mx;
    var ss = 0.0;
    for (var i = 0; i < n; i++) {
      final e = ys[i] - (m * xs[i] + c);
      ss += e * e;
    }
    final s2 = n > 2 ? ss / (n - 2) : 0.0;
    final se = math.sqrt(s2 / sxx);
    var sumX2 = 0.0;
    for (var i = 0; i < n; i++) {
      sumX2 += xs[i] * xs[i];
    }
    final ce = math.sqrt(s2 * sumX2 / (n * sxx));
    return LinearFit(m, c, se, ce, syy == 0 ? 1 : 1 - ss / syy, n);
  }

  double at(double x) => slope * x + intercept;
}

/// The mean of [vs] and its standard error (σ/√n; zero for one value).
({double mean, double se, double sd}) meanSe(List<double> vs) {
  if (vs.isEmpty) return (mean: 0, se: 0, sd: 0);
  final m = vs.reduce((a, b) => a + b) / vs.length;
  if (vs.length < 2) return (mean: m, se: 0, sd: 0);
  var ss = 0.0;
  for (final v in vs) {
    ss += (v - m) * (v - m);
  }
  final sd = math.sqrt(ss / (vs.length - 1));
  return (mean: m, se: sd / math.sqrt(vs.length), sd: sd);
}

/// A value with its uncertainty, rounded together: `pm(9.812, 0.043)` is
/// "9.81 ± 0.04". The uncertainty keeps one significant figure (two when
/// it starts with 1).
String pm(double v, double u, [String unit = '']) {
  final tail = unit.isEmpty ? '' : ' $unit';
  if (u <= 0 || !u.isFinite) return '${_sig(v, 4)}$tail';
  final mag = (math.log(u) / math.ln10).floor();
  final lead = u / math.pow(10, mag);
  final dec = math.max(0, -(mag - (lead < 2 ? 1 : 0)));
  if (dec > 12) return '${_sig(v, 4)}$tail';
  return '${v.toStringAsFixed(dec)} ± ${u.toStringAsFixed(dec)}$tail';
}

String _sig(double v, int n) {
  if (v == 0) return '0';
  final mag = (math.log(v.abs()) / math.ln10).floor();
  final dec = math.max(0, n - 1 - mag);
  return dec > 12 ? v.toStringAsExponential(n - 1) : v.toStringAsFixed(dec);
}

/// A control under the bench. Controls are data; the lab screen draws them.
sealed class LabControl {
  final String key;
  final String label;
  const LabControl(this.key, this.label);
}

class LabSlider extends LabControl {
  final double min, max;
  final int? divisions;
  final String unit;
  final int decimals;
  const LabSlider(super.key, super.label, this.min, this.max, {this.divisions, this.unit = '', this.decimals = 0});
}

class LabChoice extends LabControl {
  final List<(Object, String)> options;
  const LabChoice(super.key, super.label, this.options);
}

class LabToggle extends LabControl {
  const LabToggle(super.key, super.label);
}

/// A button; the bench's [LabBench.act] decides what it does.
class LabAction extends LabControl {
  final IconData icon;
  final bool primary;
  const LabAction(super.key, super.label, this.icon, {this.primary = false});
}

/// An experiment the class can run: its picture, its controls, and the
/// readings it gives. Benches are pure: everything comes from the params,
/// so the projector shows exactly what the teacher sees.
abstract class LabBench {
  const LabBench();

  String get kind;
  LabParams get defaults;

  /// Settings for the library picture (something happening, in focus).
  LabParams get preview => defaults;

  /// Repaint every frame (something swings, bubbles, flows).
  bool get animated => false;

  List<LabControl> controls(LabParams p);
  List<LabColumn> get columns;

  /// The reading the teacher would record now.
  LabReading read(LabParams p);

  /// Meter readings and other values shown under the bench.
  List<String> live(LabParams p) => const [];

  void paint(Canvas canvas, Size size, LabParams p, double t);

  LabGraph? graph(LabParams p) => null;

  /// What the readings so far show, worked out (null: nothing yet).
  String? result(List<List<Object>> rows) => null;

  /// A button was pressed. Changing a choice also comes here (as
  /// 'set:key') so a bench can reset what depends on it.
  LabParams act(String action, LabParams p) => p;
}

/// A small least-recently-used cache for benches that simulate (a
/// simulation is pure in its params, so its result can be kept).
class LabCache<K, V> {
  final int size;
  final _map = <K, V>{};
  LabCache(this.size);

  V? operator [](K k) {
    final v = _map.remove(k);
    if (v != null) _map[k] = v;
    return v;
  }

  void operator []=(K k, V v) {
    _map.remove(k);
    _map[k] = v;
    if (_map.length > size) _map.remove(_map.keys.first);
  }
}

/// Reading params safely (they may come from the projector or a saved file).
double pNum(LabParams p, String k, [double fallback = 0]) => (p[k] as num?)?.toDouble() ?? fallback;
int pInt(LabParams p, String k, [int fallback = 0]) => (p[k] as num?)?.toInt() ?? fallback;
String pStr(LabParams p, String k, [String fallback = '']) => p[k] is String ? p[k] as String : fallback;
bool pBool(LabParams p, String k) => p[k] == true;

// ----------------------------------------------------------------- drawing

/// Colours shared by the benches (drawn on paper, like a textbook figure).
class LabInk {
  static const ink = Color(0xFF1B1F24);
  static const muted = Color(0xFF6B737D);
  static const faint = Color(0xFFB9BFC6);
  static const paper = Color(0xFFFBFAF6);
  static const wire = Color(0xFF3A3F46);
  static const accent = Color(0xFFE8A33D);
  static const blue = Color(0xFF1F5FD6);
  static const red = Color(0xFFD64541);
  static const green = Color(0xFF1E8C4E);
  static const glass = Color(0x3378B7E0);
  static const water = Color(0x5578B7E0);
}

Paint stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

Paint fill(Color c) => Paint()..color = c;

/// Text centred on [at] (or starting at it when [centre] is false).
void label(Canvas canvas, String text, Offset at, {double size = 14, Color color = LabInk.ink, bool bold = false, bool centre = true, Color? halo}) {
  final tp = layoutText(text, size, color, bold: bold);
  final o = centre ? at - Offset(tp.width / 2, tp.height / 2) : at;
  if (halo != null) {
    canvas.drawRRect(RRect.fromRectAndRadius((o & tp.size).inflate(3), const Radius.circular(4)), fill(halo));
  }
  tp.paint(canvas, o);
}

/// A dashed straight line.
void dashed(Canvas canvas, Offset a, Offset b, Paint paint, {double dash = 7, double gap = 5}) {
  final d = b - a;
  final len = d.distance;
  if (len == 0) return;
  final u = d / len;
  for (var s = 0.0; s < len; s += dash + gap) {
    canvas.drawLine(a + u * s, a + u * math.min(s + dash, len), paint);
  }
}

/// An arrow head at [tip] pointing along [dir].
void arrowHead(Canvas canvas, Offset tip, Offset dir, Paint paint, {double size = 10}) {
  final u = dir / (dir.distance == 0 ? 1 : dir.distance);
  final n = Offset(-u.dy, u.dx);
  final path = Path()
    ..moveTo(tip.dx, tip.dy)
    ..lineTo((tip - u * size + n * size * 0.5).dx, (tip - u * size + n * size * 0.5).dy)
    ..lineTo((tip - u * size - n * size * 0.5).dx, (tip - u * size - n * size * 0.5).dy)
    ..close();
  canvas.drawPath(path, Paint()..color = paint.color);
}

/// A resistor drawn as a zigzag from [a] to [b].
void zigzag(Canvas canvas, Offset a, Offset b, Paint paint, {int peaks = 6, double amp = 8}) {
  final d = b - a;
  final u = d / d.distance;
  final n = Offset(-u.dy, u.dx);
  final lead = d.distance * 0.12;
  final path = Path()..moveTo(a.dx, a.dy);
  final s0 = a + u * lead, s1 = b - u * lead;
  path.lineTo(s0.dx, s0.dy);
  final seg = (s1 - s0) / (peaks * 2.0);
  for (var i = 1; i <= peaks * 2; i++) {
    final p = s0 + seg * (i - 0.5) + n * (i.isOdd ? amp : -amp);
    path.lineTo(p.dx, p.dy);
  }
  path.lineTo(s1.dx, s1.dy);
  path.lineTo(b.dx, b.dy);
  canvas.drawPath(path, paint);
}

/// A round meter (ammeter, voltmeter) with a needle and a digital value.
void meter(Canvas canvas, Offset c, double r, String letter, double value, double full, String reading) {
  canvas.drawCircle(c, r, fill(Colors.white));
  canvas.drawCircle(c, r, stroke(LabInk.ink, 2.5));
  // Scale arc in the upper half.
  final arc = Rect.fromCircle(center: c, radius: r * 0.72);
  canvas.drawArc(arc, math.pi * 1.15, math.pi * 0.7, false, stroke(LabInk.muted, 1.5));
  final f = (value / full).clamp(0.0, 1.0);
  final a = math.pi * 1.15 + math.pi * 0.7 * f;
  canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * r * 0.7, stroke(LabInk.red, 2));
  canvas.drawCircle(c, 3, fill(LabInk.ink));
  label(canvas, letter, c + Offset(0, r * 0.38), size: r * 0.42, bold: true);
  label(canvas, reading, c + Offset(0, r + 14), size: 15, bold: true, halo: const Color(0xFFFFF4DC));
}

/// A small table of values drawn on the canvas (used by the report).
double drawTable(Canvas canvas, Offset at, double width, List<String> head, List<List<String>> rows, {double size = 16}) {
  final cols = head.length;
  final colW = width / cols;
  var y = at.dy;
  double rowH(List<String> cells, bool bold) {
    var h = 0.0;
    for (final c in cells) {
      final tp = TextPainter(
        text: TextSpan(text: c, style: TextStyle(fontSize: size, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamilyFallback: KxFonts.fallback)),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: colW - 12);
      h = math.max(h, tp.height);
    }
    return h + 12;
  }

  void row(List<String> cells, bool bold) {
    final h = rowH(cells, bold);
    if (bold) canvas.drawRect(Rect.fromLTWH(at.dx, y, width, h), fill(const Color(0xFFF1ECE0)));
    for (var i = 0; i < cells.length; i++) {
      final tp = TextPainter(
        text: TextSpan(
            text: cells[i],
            style: TextStyle(fontSize: size, color: LabInk.ink, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamilyFallback: KxFonts.fallback)),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: colW - 12);
      tp.paint(canvas, Offset(at.dx + i * colW + 6, y + 6));
    }
    canvas.drawRect(Rect.fromLTWH(at.dx, y, width, h), stroke(LabInk.faint, 1));
    for (var i = 1; i < cols; i++) {
      canvas.drawLine(Offset(at.dx + i * colW, y), Offset(at.dx + i * colW, y + h), stroke(LabInk.faint, 1));
    }
    y += h;
  }

  row(head, true);
  for (final r in rows) {
    row(r, false);
  }
  return y - at.dy;
}

/// Draws [graph] of [rows] into [rect]: axes, points, and the best line or
/// the reference line.
void paintLabGraph(Canvas canvas, Rect rect, LabGraph graph, List<List<Object>> rows, List<LabColumn> columns, {bool dark = false}) {
  final ink = dark ? Colors.white : LabInk.ink;
  final pts = graph.points(rows);
  final area = Rect.fromLTRB(rect.left + 46, rect.top + 10, rect.right - 12, rect.bottom - 38);
  canvas.drawLine(area.bottomLeft, area.topLeft, stroke(ink, 1.5));
  canvas.drawLine(area.bottomLeft, area.bottomRight, stroke(ink, 1.5));
  label(canvas, columns[graph.x].label, Offset(area.center.dx, rect.bottom - 14), size: 13, color: ink);
  canvas.save();
  canvas.translate(rect.left + 12, area.center.dy);
  canvas.rotate(-math.pi / 2);
  label(canvas, columns[graph.y].label, Offset.zero, size: 13, color: ink);
  canvas.restore();
  if (pts.isEmpty) return;
  // The range of each axis: from zero (or below, for negative readings),
  // or fitted to the readings with a margin.
  (double, double) range(Iterable<double> vs, double? extra) {
    var lo = vs.reduce(math.min), hi = vs.reduce(math.max);
    if (extra != null) {
      lo = math.min(lo, extra);
      hi = math.max(hi, extra);
    }
    if (graph.fromZero) {
      lo = math.min(0, lo);
      hi = math.max(0, hi);
      final span = hi - lo == 0 ? 1.0 : hi - lo;
      return (lo < 0 ? lo - span * 0.08 : 0, hi <= 0 ? span * 0.1 : hi + span * 0.12);
    }
    final span = hi - lo == 0 ? math.max(1.0, hi.abs() * 0.2) : hi - lo;
    return (lo - span * 0.15, hi + span * 0.15);
  }

  final (minX, maxX) = range(pts.map((p) => p.dx), null);
  final (minY, maxY) = range(pts.map((p) => p.dy), graph.refY);
  Offset map(double x, double y) => Offset(area.left + area.width * (x - minX) / (maxX - minX), area.bottom - area.height * (y - minY) / (maxY - minY));
  // The x axis sits at y = 0 when zero is in range.
  if (minY < 0 && maxY > 0) canvas.drawLine(map(minX, 0), map(maxX, 0), stroke(ink.withValues(alpha: 0.4), 1));
  // Ticks: 4 on each axis.
  for (var i = 1; i <= 4; i++) {
    final vx = minX + (maxX - minX) * i / 4, vy = minY + (maxY - minY) * i / 4;
    final px = Offset(area.left + area.width * i / 4, area.bottom), py = Offset(area.left, area.bottom - area.height * i / 4);
    canvas.drawLine(px, px + const Offset(0, 5), stroke(ink, 1));
    canvas.drawLine(py, py - const Offset(5, 0), stroke(ink, 1));
    label(canvas, _tick(vx), px + const Offset(0, 14), size: 11, color: ink);
    label(canvas, _tick(vy), py - const Offset(24, 0), size: 11, color: ink);
  }
  if (graph.refY != null) {
    dashed(canvas, map(minX, graph.refY!), map(maxX, graph.refY!), stroke(LabInk.green, 2));
  }
  if (graph.throughOrigin) {
    final k = LabGraph.slope(pts);
    if (k != null) canvas.drawLine(map(math.max(0, minX), k * math.max(0, minX)), map(maxX, k * maxX), stroke(LabInk.blue.withValues(alpha: 0.7), 2.5));
  }
  if (graph.line && pts.length > 1) {
    final f = LabGraph.fit(pts);
    if (f != null) canvas.drawLine(map(minX, f.at(minX)), map(maxX, f.at(maxX)), stroke(LabInk.blue.withValues(alpha: 0.7), 2.5));
  }
  if ((graph.curve || (!graph.throughOrigin && !graph.line && !graph.fromZero)) && pts.length > 1) {
    // A smooth line through the points in order of x.
    final sorted = [...pts]..sort((a, b) => a.dx.compareTo(b.dx));
    final path = Path()..moveTo(map(sorted.first.dx, sorted.first.dy).dx, map(sorted.first.dx, sorted.first.dy).dy);
    for (final p in sorted.skip(1)) {
      final q = map(p.dx, p.dy);
      path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.6), 2));
  }
  for (final p in pts) {
    final c = map(p.dx, p.dy);
    canvas.drawCircle(c, 5, fill(LabInk.accent));
    canvas.drawCircle(c, 5, stroke(ink, 1.5));
  }
}

String _tick(double v) {
  final a = v.abs();
  if (a >= 100) return v.toStringAsFixed(0);
  if (a >= 10) return v.toStringAsFixed(1);
  if (a >= 1) return v.toStringAsFixed(2);
  return v.toStringAsFixed(3);
}

/// A bench drawn at its current settings. [t] runs only for animated benches.
class LabBenchView extends StatefulWidget {
  final LabBench bench;
  final LabParams params;
  const LabBenchView({super.key, required this.bench, required this.params});

  @override
  State<LabBenchView> createState() => _LabBenchViewState();
}

class _LabBenchViewState extends State<LabBenchView> with SingleTickerProviderStateMixin {
  late final _ticker = createTicker(_tick);
  double _t = 0;
  Duration _last = Duration.zero;

  @override
  void initState() {
    super.initState();
    if (widget.bench.animated) _ticker.start();
  }

  @override
  void didUpdateWidget(LabBenchView old) {
    super.didUpdateWidget(old);
    if (widget.bench.animated && !_ticker.isActive) _ticker.start();
    if (!widget.bench.animated && _ticker.isActive) _ticker.stop();
  }

  void _tick(Duration d) {
    final dt = ((d - _last).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _last = d;
    setState(() => _t += dt);
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: LabInk.paper,
        child: ClipRect(child: CustomPaint(painter: _BenchPainter(widget.bench, widget.params, _t), child: const SizedBox.expand())),
      );
}

class _BenchPainter extends CustomPainter {
  final LabBench bench;
  final LabParams p;
  final double t;
  _BenchPainter(this.bench, this.p, this.t);

  @override
  void paint(Canvas canvas, Size size) => bench.paint(canvas, size, p, t);

  @override
  bool shouldRepaint(_BenchPainter old) => old.t != t || old.p != p || old.bench != bench;
}
