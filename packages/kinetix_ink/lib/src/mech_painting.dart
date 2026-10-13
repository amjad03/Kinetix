import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'mech_models.dart';

// Drawing the mechanical engineering panels (KitElement) on a white card: the drawing sheet with
// its border, title block, grid, XY line, projectors and miter line; the P-V and T-s charts of a
// cycle with the work area shaded and the state table; and the free-body diagram with its forces,
// components and equilibrium check. Panel words are in English, as in the textbooks.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _grid = Color(0x22000000);
const _good = Color(0xFF0F8A5F);
const _bad = Color(0xFFC62828);

/// Unknown forces (before and after they are found).
const fbdUnknownColor = Color(0xFF7B3FB5);

void _text(Canvas canvas, String t, Offset at, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600, bool italic = false}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontStyle: italic ? FontStyle.italic : FontStyle.normal, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, maxWidth));
  final dx = switch (align) {
    TextAlign.right => at.dx - tp.width,
    TextAlign.center => at.dx - tp.width / 2,
    _ => at.dx,
  };
  tp.paint(canvas, Offset(dx, at.dy - tp.height / 2));
  tp.dispose();
}

Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.butt
  ..strokeJoin = StrokeJoin.round;

/// A line drawn in a pattern of dashes (and gaps) of the given lengths, repeating.
void _pattern(Canvas canvas, Offset a, Offset b, Paint p, List<double> pattern) {
  final len = (b - a).distance;
  if (len == 0) return;
  final dir = (b - a) / len;
  var t = 0.0, i = 0;
  while (t < len) {
    final seg = pattern[i % pattern.length];
    if (i.isEven) canvas.drawLine(a + dir * t, a + dir * math.min(len, t + seg), p);
    t += seg;
    i++;
  }
}

void _arrow(Canvas canvas, Offset from, Offset to, Color c, {double w = 3, double head = 14}) {
  final d = to - from;
  if (d.distance < 0.5) return;
  final u = d / d.distance, n = Offset(-u.dy, u.dx);
  canvas.drawLine(from, to - u * head * 0.6, _stroke(c, w));
  final path = Path()
    ..moveTo(to.dx, to.dy)
    ..lineTo(to.dx - u.dx * head + n.dx * head * 0.45, to.dy - u.dy * head + n.dy * head * 0.45)
    ..lineTo(to.dx - u.dx * head - n.dx * head * 0.45, to.dy - u.dy * head - n.dy * head * 0.45)
    ..close();
  canvas.drawPath(path, Paint()..color = c);
}

/// A figure to [places] decimals, with no "-0".
String mechNum(double v, [int places = 2]) {
  if (!v.isFinite) return '—';
  final s = v.toStringAsFixed(places);
  return double.parse(s) == 0 ? (0).toStringAsFixed(places) : s;
}

/// A figure with about 4 significant digits.
String _sig(double v) {
  if (!v.isFinite) return '—';
  final a = v.abs();
  if (a >= 1000) return mechNum(v, 0);
  if (a >= 100) return mechNum(v, 1);
  if (a >= 1) return mechNum(v, 2);
  if (a >= 0.01) return mechNum(v, 4);
  return v == 0 ? '0' : v.toStringAsExponential(2);
}

// --- Drawing sheet ----------------------------------------------------------------------------

/// The line types of IS 10714 / SP 46 the legend shows: name, use, width, dash pattern.
const drawingLineTypes = [
  ('Continuous thick', 'Visible outlines and edges', 2.6, <double>[]),
  ('Dashed thin', 'Hidden outlines and edges', 1.2, [12.0, 5.0]),
  ('Chain thin (long dash, dot)', 'Centre lines, axes, lines of symmetry', 1.2, [22.0, 4.0, 3.0, 4.0]),
  ('Continuous thin', 'Projectors, dimension and hatching lines', 1.0, <double>[]),
];

/// Where the sheet's parts sit on a panel of [size]: px per mm, the border, the XY line's left
/// end and length (px), and the miter (X1Y1) line's distance along XY (drawing mm).
({double k, Rect border, Offset xy, double xyLength, double miterMm, Rect titleBlock}) drawingFrame(DrawingSheet s, Size size) {
  final (w, h) = s.sheetMm;
  final k = math.min(size.width / w, size.height / h);
  // IS 10711: 20 mm filing margin on the left, 10 mm elsewhere.
  final border = Rect.fromLTRB(20 * k, 10 * k, size.width - 10 * k, size.height - 10 * k);
  final tb = Rect.fromLTRB(border.right - math.min(170, w * 0.5) * k, border.bottom - 50 * k, border.right, border.bottom);
  final xy = Offset(border.left + 20 * k, border.top + (border.height - 50 * k) * 0.5);
  final xyLength = border.width - 40 * k;
  return (k: k, border: border, xy: xy, xyLength: xyLength, miterMm: xyLength / k * 0.66, titleBlock: tb);
}

void paintDrawingSheet(Canvas canvas, DrawingSheet s, Size size, Color accent) {
  final f = drawingFrame(s, size);
  final k = f.k;
  final thick = _stroke(_ink, 2.4), thin = _stroke(_ink, 1);
  // Grid inside the border.
  final grid = _stroke(const Color(0x1F1565C0), 0.8);
  final g = s.gridMm * k;
  canvas
    ..save()
    ..clipRect(f.border);
  switch (s.grid) {
    case DrawingGrid.square:
      for (var x = f.border.left; x <= f.border.right; x += g) {
        canvas.drawLine(Offset(x, f.border.top), Offset(x, f.border.bottom), grid);
      }
      for (var y = f.border.top; y <= f.border.bottom; y += g) {
        canvas.drawLine(Offset(f.border.left, y), Offset(f.border.right, y), grid);
      }
    case DrawingGrid.isometric:
      // Verticals and lines at 30° each way, [g] apart along the verticals.
      final dx = g * math.cos(math.pi / 6);
      for (var x = f.border.left; x <= f.border.right; x += dx) {
        canvas.drawLine(Offset(x, f.border.top), Offset(x, f.border.bottom), grid);
      }
      final t = math.tan(math.pi / 6), span = f.border.width * t;
      for (var y0 = f.border.top - span; y0 <= f.border.bottom + span; y0 += g) {
        canvas
          ..drawLine(Offset(f.border.left, y0), Offset(f.border.right, y0 + span), grid)
          ..drawLine(Offset(f.border.left, y0 + span), Offset(f.border.right, y0), grid);
      }
    case DrawingGrid.none:
      break;
  }
  canvas.restore();
  canvas
    ..drawRect(Offset.zero & size, thin)
    ..drawRect(f.border, thick);

  // XY (and X1Y1) lines, projectors and the views of the points.
  final xy = f.xy, miterX = f.miterMm;
  final first = s.projection == DrawingProjection.first;
  if (s.showXY) {
    canvas.drawLine(xy, xy + Offset(f.xyLength, 0), _stroke(_ink, 1.6));
    _text(canvas, 'X', xy + const Offset(-14, -12), size: 15, bold: true);
    _text(canvas, 'Y', xy + Offset(f.xyLength + 4, -12), size: 15, bold: true);
    _text(canvas, first ? 'VP (front views above XY)' : 'HP (top views above XY)', xy + Offset(6, -16), size: 12, color: _muted);
    _text(canvas, first ? 'HP (top views below XY)' : 'VP (front views below XY)', xy + const Offset(6, 16), size: 12, color: _muted);
  }
  final mx = xy.dx + miterX * k;
  if (s.showMiter) {
    final chain = _stroke(_ink, 1);
    final top = math.max(f.border.top + 6, xy.dy - 120 * k), bottom = math.min(f.titleBlock.top - 6, xy.dy + 120 * k);
    _pattern(canvas, Offset(mx, top), Offset(mx, bottom), chain, const [22, 4, 3, 4]);
    _text(canvas, 'X₁', Offset(mx + 6, top + 10), size: 13);
    _text(canvas, 'Y₁', Offset(mx + 6, bottom - 10), size: 13);
    // The 45° miter line, on the side the top views are.
    final sgn = first ? 1.0 : -1.0;
    final reach = math.min(110 * k, (sgn > 0 ? f.titleBlock.top - 6 - xy.dy : xy.dy - f.border.top - 6));
    canvas.drawLine(Offset(mx, xy.dy), Offset(mx + reach, xy.dy + sgn * reach), _stroke(accent, 1.2));
    _text(canvas, '45°', Offset(mx + 26 * k, xy.dy + sgn * 10 * k), size: 12, color: accent);
  }
  for (final p in s.points) {
    final v = s.views(p, miterX);
    final x = xy.dx + v.x * k, fy = xy.dy + v.front * k, ty = xy.dy + v.top * k;
    final proj = _stroke(_muted, 0.9);
    canvas.drawLine(Offset(x, fy), Offset(x, ty), proj);
    final dot = Paint()..color = accent;
    canvas
      ..drawCircle(Offset(x, fy), 4, dot)
      ..drawCircle(Offset(x, ty), 4, dot);
    final l = p.label.toLowerCase();
    _text(canvas, "$l′", Offset(x + 7, fy - 10), size: 15, color: accent, bold: true);
    _text(canvas, l, Offset(x + 7, ty + 10), size: 15, color: accent, bold: true);
    if (s.showMiter) {
      final sx = xy.dx + v.sideX * k;
      // Top view → miter line (horizontal), then up or down to the front view's level.
      _pattern(canvas, Offset(x, ty), Offset(sx, ty), proj, const [6, 4]);
      _pattern(canvas, Offset(sx, ty), Offset(sx, fy), proj, const [6, 4]);
      _pattern(canvas, Offset(x, fy), Offset(sx, fy), proj, const [6, 4]);
      canvas.drawCircle(Offset(sx, fy), 4, dot);
      _text(canvas, '$l″', Offset(sx + 7, fy - 10), size: 15, color: accent, bold: true);
    }
  }

  // Line-type legend (bottom left).
  if (s.showLegend) {
    final lg = Rect.fromLTWH(f.border.left + 8, f.border.bottom - 128, 380, 120);
    canvas
      ..drawRect(lg, Paint()..color = const Color(0xF2FFFFFF))
      ..drawRect(lg, thin);
    _text(canvas, 'Lines (IS 10714 / SP 46)', lg.topLeft + const Offset(8, 13), size: 13, bold: true);
    for (final (i, (name, use, width, pattern)) in drawingLineTypes.indexed) {
      final y = lg.top + 36 + i * 22.0;
      final p = _stroke(_ink, width);
      if (pattern.isEmpty) {
        canvas.drawLine(Offset(lg.left + 8, y), Offset(lg.left + 78, y), p);
      } else {
        _pattern(canvas, Offset(lg.left + 8, y), Offset(lg.left + 78, y), p, pattern);
      }
      _text(canvas, '$name: $use', Offset(lg.left + 88, y), size: 11.5, maxWidth: lg.width - 94);
    }
  }

  // Title block (bottom right).
  final tb = f.titleBlock;
  canvas
    ..drawRect(tb, Paint()..color = const Color(0xFFFFFFFF))
    ..drawRect(tb, thick);
  final r1 = tb.top + tb.height * 0.42, colA = tb.left + tb.width * 0.36, colB = tb.left + tb.width * 0.68;
  canvas
    ..drawLine(Offset(tb.left, r1), Offset(tb.right, r1), thin)
    ..drawLine(Offset(colA, r1), Offset(colA, tb.bottom), thin)
    ..drawLine(Offset(colB, r1), Offset(colB, tb.bottom), thin);
  _text(canvas, s.title, Offset(tb.left + 8, tb.top + (r1 - tb.top) / 2), size: 17, bold: true, maxWidth: tb.width - 16);
  final low = (r1 + tb.bottom) / 2;
  _text(canvas, s.name.isEmpty ? 'Name / Roll No.' : s.name, Offset(tb.left + 6, low - 10), size: 12, maxWidth: colA - tb.left - 10, color: s.name.isEmpty ? _muted : _ink);
  _text(canvas, s.institution.isEmpty ? 'Institution' : s.institution, Offset(tb.left + 6, low + 10), size: 12, maxWidth: colA - tb.left - 10, color: s.institution.isEmpty ? _muted : _ink);
  _text(canvas, 'Scale ${s.scale}', Offset(colA + 6, low - 10), size: 13, bold: true);
  _text(canvas, 'Sheet ${s.sheetNo} · ${s.size.name.toUpperCase()}', Offset(colA + 6, low + 10), size: 12);
  _projectionSymbol(canvas, Rect.fromLTRB(colB + 4, r1 + 4, tb.right - 4, tb.bottom - 4), s.projection);
}

/// The projection symbol (IS 15021 / ISO 128): a truncated cone's front view and end view. In
/// first angle the end view is drawn on the right of the trapezoid, in third angle on the left.
void _projectionSymbol(Canvas canvas, Rect r, DrawingProjection p) {
  final first = p == DrawingProjection.first;
  final h = math.min(r.height - 14, r.width / 2.8);
  final cy = r.top + h / 2 + 2;
  final w = h * 1.1;
  final trapLeft = first ? r.left + 6 : r.left + 6 + h + 10;
  final circX = first ? trapLeft + w + 10 + h / 2 : r.left + 6 + h / 2;
  final p1 = _stroke(_ink, 1.4);
  // The cone's small end faces left.
  final trap = Path()
    ..moveTo(trapLeft, cy - h * 0.3)
    ..lineTo(trapLeft + w, cy - h / 2)
    ..lineTo(trapLeft + w, cy + h / 2)
    ..lineTo(trapLeft, cy + h * 0.3)
    ..close();
  canvas
    ..drawPath(trap, p1)
    ..drawCircle(Offset(circX, cy), h / 2, p1)
    ..drawCircle(Offset(circX, cy), h * 0.3, p1);
  final chain = _stroke(_ink, 0.8);
  _pattern(canvas, Offset(math.min(trapLeft, circX - h / 2) - 4, cy), Offset(math.max(trapLeft + w, circX + h / 2) + 4, cy), chain, const [8, 2, 2, 2]);
  _text(canvas, first ? 'First angle' : 'Third angle', Offset(r.center.dx, r.bottom - 6), size: 10.5, align: TextAlign.center, color: _muted);
}

// --- Thermodynamic cycles ----------------------------------------------------------------------

const _processNames = {
  ProcessKind.isentropic: 'isentropic',
  ProcessKind.isochoric: 'const. volume',
  ProcessKind.isobaric: 'const. pressure',
  ProcessKind.isothermal: 'isothermal',
  ProcessKind.pump: 'pump',
  ProcessKind.boiler: 'boiler',
  ProcessKind.condenser: 'condenser',
};

/// Round tick values from [lo] to [hi].
List<double> _ticks(double lo, double hi, [int count = 5]) {
  if (!(hi > lo)) return [lo];
  final raw = (hi - lo) / count;
  final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final step = [1, 2, 2.5, 5, 10].map((m) => m * mag).firstWhere((s) => s >= raw, orElse: () => 10 * mag);
  return [for (var v = (lo / step).ceil() * step; v <= hi + step * 1e-6; v += step) double.parse(v.toStringAsFixed(8))];
}

/// One chart: the cycle's paths as (x, y) with the enclosed area shaded and the states numbered.
void _chart(Canvas canvas, Rect r, String xLabel, String yLabel, List<List<Offset>> paths, List<Offset> states, Color accent, {bool shade = true, bool logX = false, List<Offset>? dome}) {
  final all = [for (final p in paths) ...p, ...?dome];
  if (all.isEmpty) return;
  double fx(double x) => logX ? math.log(x) / math.ln10 : x;
  var x0 = all.map((p) => fx(p.dx)).reduce(math.min), x1 = all.map((p) => fx(p.dx)).reduce(math.max);
  var y0 = all.map((p) => p.dy).reduce(math.min), y1 = all.map((p) => p.dy).reduce(math.max);
  final px = (x1 - x0) * 0.08 + 1e-9, py = (y1 - y0) * 0.1 + 1e-9;
  x0 -= px;
  x1 += px;
  y0 = math.max(0, y0 - py);
  y1 += py;
  final plot = Rect.fromLTRB(r.left + 70, r.top + 10, r.right - 12, r.bottom - 46);
  Offset at(Offset p) => Offset(plot.left + (fx(p.dx) - x0) / (x1 - x0) * plot.width, plot.bottom - (p.dy - y0) / (y1 - y0) * plot.height);
  final gridP = _stroke(_grid, 1);
  for (final t in _ticks(y0, y1)) {
    final y = at(Offset(logX ? math.pow(10, x0).toDouble() : x0, t)).dy;
    canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), gridP);
    _text(canvas, _sig(t), Offset(plot.left - 6, y), size: 12, color: _muted, align: TextAlign.right);
  }
  final xt = logX ? [for (var e = x0.ceil(); e <= x1.floor(); e++) e.toDouble()] : _ticks(x0, x1);
  for (final t in xt) {
    final x = plot.left + (t - x0) / (x1 - x0) * plot.width;
    canvas.drawLine(Offset(x, plot.top), Offset(x, plot.bottom), gridP);
    _text(canvas, logX ? _sig(math.pow(10, t).toDouble()) : _sig(t), Offset(x, plot.bottom + 12), size: 12, color: _muted, align: TextAlign.center);
  }
  canvas
    ..drawLine(plot.bottomLeft, plot.topLeft, _stroke(_ink, 1.4))
    ..drawLine(plot.bottomLeft, plot.bottomRight, _stroke(_ink, 1.4));
  _text(canvas, xLabel, Offset(plot.center.dx, r.bottom - 12), size: 13, align: TextAlign.center);
  canvas
    ..save()
    ..translate(r.left + 14, plot.center.dy)
    ..rotate(-math.pi / 2);
  _text(canvas, yLabel, Offset.zero, size: 13, align: TextAlign.center);
  canvas.restore();
  if (dome != null && dome.length > 1) {
    final d = Path()..moveTo(at(dome.first).dx, at(dome.first).dy);
    for (final p in dome.skip(1)) {
      d.lineTo(at(p).dx, at(p).dy);
    }
    canvas.drawPath(d, _stroke(_muted, 1.2));
  }
  final cycle = Path();
  var started = false;
  for (final path in paths) {
    for (final p in path) {
      final q = at(p);
      if (!started) {
        cycle.moveTo(q.dx, q.dy);
        started = true;
      } else {
        cycle.lineTo(q.dx, q.dy);
      }
    }
  }
  cycle.close();
  canvas.save();
  canvas.clipRect(plot);
  if (shade) canvas.drawPath(cycle, Paint()..color = accent.withValues(alpha: 0.18));
  canvas
    ..drawPath(cycle, _stroke(accent, 2.6))
    ..restore();
  for (final (i, s) in states.indexed) {
    final q = at(s);
    canvas
      ..drawCircle(q, 5, Paint()..color = _ink)
      ..drawCircle(q, 5, _stroke(Colors.white, 1.2));
    _text(canvas, '${i + 1}', q + const Offset(9, -11), size: 15, bold: true);
  }
}

void paintThermoCycle(Canvas canvas, ThermoCycle c, Size size, Color accent) {
  _text(canvas, c.heading, const Offset(24, 28), size: 22, bold: true, maxWidth: size.width - 48);
  final r = c.solve();
  if (!r.ok) {
    _text(canvas, r.error!, size.center(Offset.zero), size: 18, color: _bad, align: TextAlign.center, maxWidth: size.width - 40);
    return;
  }
  final steam = c.kind == CycleKind.rankine;
  final paths = [for (var i = 0; i < r.processes.length; i++) r.path(i)];
  List<List<Offset>> pick(Offset Function(CycleState) f) => [for (final p in paths) p.map(f).toList()];
  final top = 56.0, chartH = 470.0, half = (size.width - 48) / 2;
  final pv = Rect.fromLTWH(24, top, half - 8, chartH), ts = Rect.fromLTWH(24 + half + 8, top, half - 8, chartH);
  List<Offset>? dome;
  if (steam) {
    dome = [for (final row in steamTable) Offset(row.sf, row.t + 273.15), for (final row in steamTable.reversed) Offset(row.sg, row.t + 273.15)];
  }
  List<Offset>? vDome;
  if (steam) {
    vDome = [for (final row in steamTable) Offset(row.vf, row.p * 100), for (final row in steamTable.reversed) Offset(row.vg, row.p * 100)];
  }
  _chart(canvas, pv, steam ? 'v (m³/kg, log scale)' : 'v (m³/kg)', 'p (kPa)', pick((s) => Offset(s.v, s.p)), [for (final s in r.states) Offset(s.v, s.p)], accent, shade: c.shade, logX: steam, dome: vDome);
  _chart(canvas, ts, 's (kJ/kg·K)', 'T (K)', pick((s) => Offset(s.s, s.t)), [for (final s in r.states) Offset(s.s, s.t)], accent, shade: c.shade, dome: dome);
  _text(canvas, 'P-V', pv.topRight + const Offset(-16, 14), size: 14, bold: true, color: accent, align: TextAlign.right);
  _text(canvas, 'T-s', ts.topRight + const Offset(-16, 14), size: 14, bold: true, color: accent, align: TextAlign.right);

  // State table.
  final y0 = top + chartH + 22;
  final cols = steam ? ['State', 'p (kPa)', 'T (K)', 's (kJ/kg·K)', 'h (kJ/kg)', 'x'] : ['State', 'p (kPa)', 'v (m³/kg)', 'T (K)', 's (kJ/kg·K)'];
  const colW = 104.0, rowH = 26.0;
  for (final (j, h) in cols.indexed) {
    _text(canvas, h, Offset(28 + j * colW, y0), size: 13, bold: true, color: _muted);
  }
  for (final (i, s) in r.states.indexed) {
    final y = y0 + (i + 1) * rowH;
    final cells = steam
        ? ['${i + 1}', _sig(s.p), _sig(s.t), _sig(s.s), _sig(s.h), s.x == null ? '—' : mechNum(s.x!, 3)]
        : ['${i + 1}', _sig(s.p), _sig(s.v), _sig(s.t), _sig(s.s)];
    for (final (j, v) in cells.indexed) {
      _text(canvas, v, Offset(28 + j * colW, y), size: 14, bold: j == 0);
    }
  }
  // Processes, heat and work, efficiency.
  final rx = 28 + cols.length * colW + 20;
  var y = y0;
  for (final (i, p) in r.processes.indexed) {
    final q = p.heatIn > 0 ? '  q_in = ${_sig(p.heatIn)}' : (p.heatOut > 0 ? '  q_out = ${_sig(p.heatOut)}' : '');
    _text(canvas, '${p.from + 1}→${p.to + 1} ${_processNames[p.kind]}$q', Offset(rx, y + i * 22.0), size: 13, maxWidth: size.width - rx - 20);
  }
  y += r.processes.length * 22.0 + 10;
  _text(canvas, 'q_in = ${_sig(r.heatIn)} kJ/kg   q_out = ${_sig(r.heatOut)} kJ/kg   w_net = ${_sig(r.work)} kJ/kg', Offset(rx, y), size: 14, maxWidth: size.width - rx - 20);
  if (r.mep != null) _text(canvas, 'Mean effective pressure = ${_sig(r.mep!)} kPa', Offset(rx, y + 24), size: 14, maxWidth: size.width - rx - 20);
  _text(canvas, 'η = ${mechNum(r.efficiency * 100, 2)} %', Offset(rx, y + 56), size: 22, bold: true, color: _good);
  _text(canvas, r.formula, Offset(rx, y + 84), size: 13, color: _muted, maxWidth: size.width - rx - 20);
  if (!steam) _text(canvas, 'Air: R = 0.287 kJ/kg·K, γ = ${mechNum(c.gamma, 2)}, pv = RT, pv^γ = const. (isentropic)', Offset(rx, y + 106), size: 12, color: _muted, maxWidth: size.width - rx - 20);
}

// --- Free-body diagrams -----------------------------------------------------------------------

/// Where the body sits on a panel of [size]: its centre, px per metre of the body, and px per
/// newton of force (the largest force drawn about 210 px long).
({Offset centre, double perM, double perN}) fbdFrame(FbdModel m, Size size, {List<FbdForce>? forces}) {
  final list = forces ?? m.forces;
  final big = list.fold<double>(1, (a, f) => math.max(a, f.magnitude.abs()));
  return (centre: Offset(size.width * 0.27, size.height * 0.53), perM: m.body == FbdBody.beam ? 90.0 : 120.0, perN: 210 / big);
}

/// Where a force's arrow starts (its point of application) and ends.
Offset fbdTail(({Offset centre, double perM, double perN}) f, FbdForce force) => f.centre + Offset(force.x, -force.y) * f.perM;
Offset fbdHead(({Offset centre, double perM, double perN}) f, FbdForce force) {
  final a = force.angle * math.pi / 180;
  final len = math.max(force.magnitude.abs() * f.perN, 24.0);
  final sign = force.magnitude < 0 ? -1.0 : 1.0;
  return fbdTail(f, force) + Offset(math.cos(a), -math.sin(a)) * len * sign;
}

void paintFbd(Canvas canvas, FbdModel m, Size size, Color accent, {FbdResult? result}) {
  final r = result ?? m.solve();
  final f = fbdFrame(m, size, forces: r.forces);
  _text(canvas, m.title, const Offset(24, 28), size: 22, bold: true, maxWidth: size.width - 48);
  final c = f.centre;
  final body = Paint()..color = const Color(0xFFDDE3EA);
  final edge = _stroke(_ink, 2);
  // The body (and what it rests on, hatched).
  switch (m.body) {
    case FbdBody.block:
    case FbdBody.incline:
      final th = m.surfaceAngle * math.pi / 180;
      if (m.body == FbdBody.incline) {
        // The wedge under the block: its slope passes under the block's bottom face.
        final along = Offset(math.cos(th), -math.sin(th)), down = Offset(math.sin(th), math.cos(th));
        final contact = c + down * (0.5 * f.perM);
        final a = contact - along * 230, b = contact + along * 150;
        final base = Offset(b.dx, a.dy);
        canvas
          ..drawPath(Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy)..lineTo(base.dx, base.dy)..close(), Paint()..color = const Color(0xFFEFE6D8))
          ..drawPath(Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy)..lineTo(base.dx, base.dy)..close(), edge);
        canvas.drawArc(Rect.fromCircle(center: a, radius: 46), -th, th, false, _stroke(_muted, 1.2));
        _text(canvas, 'θ = ${mechNum(m.theta, 0)}°', a + Offset(52, -12 - 20 * math.sin(th / 2)), size: 14, color: _muted);
      } else {
        final y = c.dy + 0.5 * f.perM;
        canvas.drawLine(Offset(c.dx - 200, y), Offset(c.dx + 200, y), edge);
        for (var x = c.dx - 196; x < c.dx + 200; x += 14) {
          canvas.drawLine(Offset(x, y), Offset(x - 10, y + 10), _stroke(_muted, 1));
        }
      }
      canvas
        ..save()
        ..translate(c.dx, c.dy)
        ..rotate(-th);
      final box = Rect.fromCenter(center: Offset.zero, width: f.perM, height: f.perM);
      canvas
        ..drawRect(box, body)
        ..drawRect(box, edge)
        ..restore();
    case FbdBody.beam:
      final box = Rect.fromCenter(center: c, width: 4 * f.perM, height: 0.2 * f.perM);
      canvas
        ..drawRect(box, body)
        ..drawRect(box, edge);
      for (var x = -2; x <= 2; x++) {
        _text(canvas, '$x', Offset(c.dx + x * f.perM, box.bottom + 14), size: 11, color: _muted, align: TextAlign.center);
      }
      _text(canvas, 'x (m) from the centre', Offset(c.dx, box.bottom + 32), size: 11, color: _muted, align: TextAlign.center);
    case FbdBody.sphere:
      canvas
        ..drawCircle(c, 0.5 * f.perM, body)
        ..drawCircle(c, 0.5 * f.perM, edge);
    case FbdBody.pulley:
      canvas
        ..drawCircle(c, 0.4 * f.perM, body)
        ..drawCircle(c, 0.4 * f.perM, edge)
        ..drawCircle(c, 6, Paint()..color = _ink);
  }
  // Axes.
  final axes = _stroke(_muted, 1);
  _pattern(canvas, c - const Offset(230, 0), c + const Offset(230, 0), axes, const [6, 5]);
  _pattern(canvas, c - const Offset(0, 230), c + const Offset(0, 230), axes, const [6, 5]);
  _text(canvas, 'x', c + const Offset(236, 0), size: 13, color: _muted);
  _text(canvas, 'y', c + const Offset(0, -240), size: 13, color: _muted, align: TextAlign.center);
  // Forces, with their x and y components dashed.
  final colors = [accent, const Color(0xFF1565C0), const Color(0xFFC62828), const Color(0xFF0F8A5F), const Color(0xFFE07A10), const Color(0xFF00838F)];
  for (final (i, force) in r.forces.indexed) {
    final col = force.unknown != FbdUnknown.none ? fbdUnknownColor : colors[i % colors.length];
    final tail = fbdTail(f, force), head = fbdHead(f, force);
    if (m.showComponents && force.magnitude != 0) {
      final cx = Offset(head.dx, tail.dy);
      final p = _stroke(col.withValues(alpha: 0.55), 1.2);
      if ((cx - tail).distance > 6) _pattern(canvas, tail, cx, p, const [5, 4]);
      if ((head - cx).distance > 6) _pattern(canvas, cx, head, p, const [5, 4]);
    }
    _arrow(canvas, tail, head, col);
    final u = head - tail;
    final out = u.distance == 0 ? Offset.zero : u / u.distance * 16;
    final unknown = force.unknown != FbdUnknown.none;
    _text(canvas, '${force.label} = ${_sig(force.magnitude)} N${unknown ? ' ?' : ''}', head + out + const Offset(0, -2), size: 14, bold: true, color: col, maxWidth: 200, align: out.dx < -4 ? TextAlign.right : (out.dx.abs() <= 4 ? TextAlign.center : TextAlign.left));
  }

  // Table: each force resolved, the sums and the verdict.
  final tx = size.width * 0.6;
  const cols = ['Force', 'F (N)', 'θ (°)', 'Fx (N)', 'Fy (N)', 'M (N·m)'];
  final w = (size.width - 24 - tx) / 6;
  var y = 92.0;
  for (final (j, h) in cols.indexed) {
    _text(canvas, h, Offset(tx + j * w, y), size: 13, bold: true, color: _muted);
  }
  for (final force in r.forces) {
    y += 28;
    final col = force.unknown != FbdUnknown.none ? fbdUnknownColor : _ink;
    final cells = [force.label, _sig(force.magnitude), mechNum(force.angle, 1), _sig(force.fx), _sig(force.fy), _sig(force.moment)];
    for (final (j, v) in cells.indexed) {
      _text(canvas, v, Offset(tx + j * w, y), size: 14, color: col, bold: j == 0, maxWidth: w - 6);
    }
  }
  y += 14;
  canvas.drawLine(Offset(tx, y), Offset(size.width - 24, y), _stroke(_ink, 1));
  y += 18;
  _text(canvas, 'Σ', Offset(tx, y), size: 15, bold: true);
  _text(canvas, _sig(r.sumFx), Offset(tx + 3 * w, y), size: 14, bold: true);
  _text(canvas, _sig(r.sumFy), Offset(tx + 4 * w, y), size: 14, bold: true);
  _text(canvas, _sig(r.sumM), Offset(tx + 5 * w, y), size: 14, bold: true);
  y += 40;
  final ok = r.balanced;
  _text(canvas, ok ? 'ΣFx = 0, ΣFy = 0, ΣM = 0: in equilibrium' : 'Not in equilibrium', Offset(tx, y), size: 17, bold: true, color: ok ? _good : _bad, maxWidth: size.width - tx - 24);
  if (!ok) {
    final a = math.atan2(r.sumFy, r.sumFx) * 180 / math.pi;
    _text(canvas, 'Resultant R = ${_sig(r.resultant)} N at ${mechNum(a, 1)}°, ΣM = ${_sig(r.sumM)} N·m', Offset(tx, y + 26), size: 14, maxWidth: size.width - tx - 24);
  }
  if (r.solved != null) {
    final s = r.forces[r.solved!];
    _text(canvas, 'From equilibrium: ${s.label} = ${_sig(s.magnitude)} N at ${mechNum(s.angle, 1)}°', Offset(tx, y + 54), size: 14, color: fbdUnknownColor, bold: true, maxWidth: size.width - tx - 24);
    if (r.note != null) _text(canvas, '${r.note} (left over ${_sig(r.residual)} N)', Offset(tx, y + 78), size: 13, color: _bad, maxWidth: size.width - tx - 24);
  }
  _text(canvas, 'Fx = F cos θ, Fy = F sin θ, M = x·Fy − y·Fx (anticlockwise +), about the centre', Offset(tx, size.height - 30), size: 12, color: _muted, maxWidth: size.width - tx - 24);
}
