import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'ece_models.dart';
import 'ece_pins.dart';
import 'logic_models.dart';

// Drawing the electronics and communication panels (KitElement) on a white card: a logic
// circuit with its live signals and output expressions, a timing diagram, a signal with its FFT
// spectrum, a Bode plot (actual and asymptotic) and a microcontroller pin diagram. The circuit
// painter is shared with the logic gates lab. Panel words are in English, as in the textbooks.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _grid = Color(0x22000000);
const _bad = Color(0xFFC62828);

void _text(Canvas canvas, String t, Offset at, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
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
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

void _dashed(Canvas canvas, Offset a, Offset b, Paint p, {double dash = 8, double gap = 6}) {
  final len = (b - a).distance;
  if (len == 0) return;
  final dir = (b - a) / len;
  for (var t = 0.0; t < len; t += dash + gap) {
    canvas.drawLine(a + dir * t, a + dir * math.min(len, t + dash), p);
  }
}

String _fmt(double v, [int sig = 3]) {
  if (!v.isFinite) return '—';
  final a = v.abs();
  if (a >= 1e6) return '${_fmt(v / 1e6, sig)}M';
  if (a >= 1e4) return '${_fmt(v / 1e3, sig)}k';
  final s = double.parse(v.toStringAsPrecision(sig));
  return s == s.roundToDouble() ? s.toStringAsFixed(0) : '$s';
}

// --- Logic circuits ---------------------------------------------------------------------------

/// The colours the circuit is drawn in: the lab passes its theme's, the board panel a light set.
class LogicPalette {
  const LogicPalette({this.ink = _ink, this.surface = Colors.white, this.body = const Color(0xFFF1F3F6), this.raised = const Color(0xFFE4E8EE), this.primary = const Color(0xFF1565C0)});
  final Color ink, surface, body, raised, primary;
  static const on = Color(0xFF2E9E4F), off = Color(0xFF8A8F98), lit = Color(0xFFFFC107), segment = Color(0xFFE53935);
}

/// Draws [c]'s wires (green for 1, grey for 0), then its parts: gate symbols, switches, clocks,
/// LEDs, flip-flops and 7-segment displays, with their pins. [rubber] is a wire being dragged.
void paintLogicParts(Canvas canvas, LogicCircuit c, Map<String, bool> v, LogicPalette pal, {String? selected, (Offset, Offset)? rubber}) {
  void wire(Offset a, Offset b, Color color) {
    final dx = (b.dx - a.dx).abs().clamp(30, 200) / 2;
    final path = Path()
      ..moveTo(a.dx, a.dy)
      ..cubicTo(a.dx + dx, a.dy, b.dx - dx, b.dy, b.dx, b.dy);
    canvas.drawPath(path, _stroke(color, 4));
  }

  for (final w in c.wires) {
    final a = c.part(w.from), b = c.part(w.to);
    if (a == null || b == null) continue;
    wire(a.outPinAt(w.fromPin), b.inPin(w.pin), (v[outKey(w.from, w.fromPin)] ?? false) ? LogicPalette.on : LogicPalette.off);
  }
  if (rubber case (final a, final b)) wire(a, b, pal.primary);
  for (final p in c.parts) {
    _part(canvas, c, p, v, pal, p.id == selected);
  }
}

void _part(Canvas canvas, LogicCircuit c, LogicPart p, Map<String, bool> v, LogicPalette pal, bool sel) {
  final line = _stroke(pal.ink, 3);
  final r = p.rect;
  final high = v[p.id] ?? false;
  if (sel) canvas.drawRRect(RRect.fromRectAndRadius(r.inflate(8), const Radius.circular(10)), Paint()..color = pal.primary.withValues(alpha: 0.18));
  switch (p.kind) {
    case PartKind.gate:
      _gate(canvas, p, line, pal);
    case PartKind.input:
    case PartKind.clock:
      final body = RRect.fromRectAndRadius(r, const Radius.circular(22));
      canvas.drawRRect(body, Paint()..color = high ? LogicPalette.on : pal.raised);
      canvas.drawRRect(body, line);
      if (p.kind == PartKind.clock) {
        // A small square wave under the name.
        final y = r.bottom - 9, x = r.left + 18;
        final path = Path()..moveTo(x, y);
        for (var i = 0; i < 3; i++) {
          path
            ..lineTo(x + i * 12, y - 6)
            ..lineTo(x + i * 12 + 6, y - 6)
            ..lineTo(x + i * 12 + 6, y)
            ..lineTo(x + i * 12 + 12, y);
        }
        canvas.drawPath(path, _stroke(high ? Colors.white : pal.ink, 1.5));
      }
      _text(canvas, '${p.label} ${high ? 1 : 0}', r.center - Offset(0, p.kind == PartKind.clock ? 5 : 0), size: 16, bold: true, color: high ? Colors.white : pal.ink, align: TextAlign.center, maxWidth: r.width - 6);
    case PartKind.led:
      canvas.drawCircle(r.center, 18, Paint()..color = high ? LogicPalette.lit : pal.raised);
      if (high) canvas.drawCircle(r.center, 26, Paint()..color = const Color(0x55FFC107));
      canvas.drawCircle(r.center, 18, line);
      _text(canvas, p.label, r.center + const Offset(0, 34), size: 13, bold: true, color: pal.ink, align: TextAlign.center);
    case PartKind.flipFlop:
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = pal.body);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), line);
      final names = flipFlopPins(p.flipFlop!);
      for (var i = 0; i < names.length; i++) {
        final at = p.inPin(i);
        if (names[i] == '>') {
          canvas.drawPath(Path()..moveTo(at.dx, at.dy - 8)..lineTo(at.dx + 12, at.dy)..lineTo(at.dx, at.dy + 8), _stroke(pal.ink, 2));
        } else {
          _text(canvas, names[i], at + const Offset(16, 0), size: 14, bold: true, color: pal.ink);
        }
      }
      _text(canvas, 'Q', p.outPinAt(0) - const Offset(16, 0), size: 14, bold: true, color: pal.ink, align: TextAlign.right);
      _text(canvas, "Q'", p.outPinAt(1) - const Offset(16, 0), size: 14, bold: true, color: pal.ink, align: TextAlign.right);
      _text(canvas, '${flipFlopName(p.flipFlop!)} ${p.state ? 1 : 0}', Offset(r.center.dx, r.top - 12), size: 13, bold: true, color: p.state ? LogicPalette.on : pal.ink, align: TextAlign.center);
      _text(canvas, p.label, Offset(r.center.dx, r.bottom + 12), size: 12, color: pal.ink, align: TextAlign.center);
    case PartKind.segment7:
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = const Color(0xFF20242A));
      final segs = sevenSegments(c.digitOf(p, v));
      final x0 = r.left + 26, x1 = r.right - 14, y0 = r.top + 14, ym = r.center.dy, y1 = r.bottom - 14;
      final lines = [
        (Offset(x0, y0), Offset(x1, y0)), // a
        (Offset(x1, y0), Offset(x1, ym)), // b
        (Offset(x1, ym), Offset(x1, y1)), // c
        (Offset(x0, y1), Offset(x1, y1)), // d
        (Offset(x0, ym), Offset(x0, y1)), // e
        (Offset(x0, y0), Offset(x0, ym)), // f
        (Offset(x0, ym), Offset(x1, ym)), // g
      ];
      for (final (i, (a, b)) in lines.indexed) {
        canvas.drawLine(a, b, _stroke(segs[i] ? LogicPalette.segment : const Color(0xFF3A3F47), 6));
      }
      for (final (i, n) in ['8', '4', '2', '1'].indexed) {
        _text(canvas, n, p.inPin(i) + const Offset(10, 0), size: 10, color: const Color(0xFFB0B6BE));
      }
      _text(canvas, p.label, Offset(r.center.dx, r.bottom + 12), size: 12, color: pal.ink, align: TextAlign.center);
  }
  final pin = Paint()..color = pal.primary;
  for (var i = 0; i < p.inputCount; i++) {
    canvas.drawCircle(p.inPin(i), 6, pin);
  }
  for (var k = 0; k < p.outputCount; k++) {
    canvas.drawCircle(p.outPinAt(k), 6, pin);
  }
}

void _gate(Canvas canvas, LogicPart p, Paint line, LogicPalette pal) {
  final r = p.rect;
  final g = p.gate!;
  final inverted = g == GateType.nand || g == GateType.nor || g == GateType.xnor || g == GateType.not;
  final bodyRight = inverted ? r.right - 10 : r.right;
  final path = Path();
  switch (g) {
    case GateType.and || GateType.nand:
      path
        ..moveTo(r.left, r.top)
        ..lineTo((r.left + bodyRight) / 2, r.top)
        ..arcToPoint(Offset((r.left + bodyRight) / 2, r.bottom), radius: Radius.elliptical((bodyRight - r.left) / 2, r.height / 2))
        ..lineTo(r.left, r.bottom)
        ..close();
    case GateType.or || GateType.nor || GateType.xor || GateType.xnor:
      path
        ..moveTo(r.left, r.top)
        ..quadraticBezierTo((r.left + bodyRight) / 2 + 8, r.top, bodyRight, r.center.dy)
        ..quadraticBezierTo((r.left + bodyRight) / 2 + 8, r.bottom, r.left, r.bottom)
        ..quadraticBezierTo(r.left + 18, r.center.dy, r.left, r.top)
        ..close();
    case GateType.not || GateType.buffer:
      path
        ..moveTo(r.left, r.top + 6)
        ..lineTo(bodyRight, r.center.dy)
        ..lineTo(r.left, r.bottom - 6)
        ..close();
  }
  canvas.drawPath(path, Paint()..color = pal.body);
  canvas.drawPath(path, line);
  if (g == GateType.xor || g == GateType.xnor) {
    canvas.drawPath(Path()..moveTo(r.left - 8, r.top)..quadraticBezierTo(r.left + 10, r.center.dy, r.left - 8, r.bottom), line);
  }
  if (inverted) {
    canvas.drawCircle(Offset(r.right - 5, r.center.dy), 5, Paint()..color = pal.surface);
    canvas.drawCircle(Offset(r.right - 5, r.center.dy), 5, line);
  }
  final n = p.inputCount;
  _text(canvas, n > 2 ? '${gateName(g)}$n' : gateName(g), r.center + const Offset(-2, 0), size: g == GateType.buffer || g == GateType.xnor ? 10 : 12, bold: true, color: pal.ink, align: TextAlign.center);
}

/// Where a circuit's parts sit, labels and all.
Rect logicBounds(LogicCircuit c) {
  if (c.parts.isEmpty) return const Rect.fromLTWH(0, 0, 400, 200);
  var b = c.parts.first.rect;
  for (final p in c.parts) {
    b = b.expandToInclude(p.rect);
  }
  return b.inflate(28);
}

/// The circuit panel: its title, the circuit fitted to the card with live values, and each
/// LED's expression.
void paintLogicCircuit(Canvas canvas, LogicCircuit c, Size size, Color accent) {
  _text(canvas, c.title.isEmpty ? 'Logic circuit' : c.title, const Offset(24, 36), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final leds = c.leds;
  final lines = [
    for (final l in leds.take(4)) '${l.label} = ${c.expressionOf(l.id)}',
  ];
  final area = Rect.fromLTRB(24, 72, size.width - 24, size.height - 24 - lines.length * 30 - (c.sequential ? 30 : 0));
  final b = logicBounds(c);
  final k = math.min(1.6, math.min(area.width / b.width, area.height / b.height));
  final v = c.evaluate();
  canvas
    ..save()
    ..translate(area.center.dx - b.center.dx * k, area.center.dy - b.center.dy * k)
    ..scale(k);
  paintLogicParts(canvas, c, v, const LogicPalette());
  canvas.restore();
  var y = area.bottom + 22;
  for (final t in lines) {
    _text(canvas, t, Offset(32, y), size: 20, maxWidth: size.width - 64);
    y += 30;
  }
  if (c.sequential) {
    final ffs = c.flipFlops;
    _text(canvas, 'State: ${[for (final f in ffs) '${f.label}=${f.state ? 1 : 0}'].join('  ')}', Offset(32, y), size: 18, color: _muted, maxWidth: size.width - 64);
  }
}

// --- Timing diagrams --------------------------------------------------------------------------

/// The timing diagram's frame on a panel of [size]: the names column ends at [left], row i starts
/// at [top] + i·[rowH], step j at [left] + j·[stepW].
({double left, double top, double stepW, double rowH}) timingGeometry(TimingDiagram d, Size size) {
  const left = 190.0, top = 96.0;
  final rows = math.max(1, d.signals.length);
  return (left: left, top: top, stepW: (size.width - left - 32) / math.max(1, d.steps), rowH: math.min(76.0, (size.height - top - 48) / rows));
}

const _signalColors = [Color(0xFF1565C0), Color(0xFF0F8A5F), Color(0xFF8E5FB5), Color(0xFFD98A2B), Color(0xFFC62828), Color(0xFF00838F)];

void paintTiming(Canvas canvas, TimingDiagram d, Size size, Color accent) {
  _text(canvas, d.title, const Offset(24, 36), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final g = timingGeometry(d, size);
  final bottom = g.top + g.rowH * d.signals.length;
  // Step grid.
  for (var j = 0; j <= d.steps; j++) {
    final x = g.left + j * g.stepW;
    canvas.drawLine(Offset(x, g.top - 8), Offset(x, bottom), Paint()..color = _grid);
    if (j < d.steps && (d.steps <= 32 || j % 2 == 0)) _text(canvas, '$j', Offset(x + g.stepW / 2, g.top - 18), size: 12, color: _muted, align: TextAlign.center);
  }
  for (final (i, s) in d.signals.indexed) {
    final y0 = g.top + i * g.rowH;
    final hi = y0 + g.rowH * 0.22, lo = y0 + g.rowH * 0.78, mid = (hi + lo) / 2;
    final color = _signalColors[i % _signalColors.length];
    _text(canvas, s.name, Offset(24, mid), size: 18, bold: true, maxWidth: g.left - 36);
    canvas.drawLine(Offset(g.left, y0 + g.rowH), Offset(g.left + d.steps * g.stepW, y0 + g.rowH), Paint()..color = const Color(0x11000000));
    final pen = _stroke(color, 3);
    if (s.bus) {
      for (final (start, len, value) in TimingDiagram.runs(s)) {
        final a = g.left + start * g.stepW, b = g.left + (start + len) * g.stepW;
        const e = 6.0;
        final shape = Path()
          ..moveTo(a, mid)
          ..lineTo(a + e, hi)
          ..lineTo(b - e, hi)
          ..lineTo(b, mid)
          ..lineTo(b - e, lo)
          ..lineTo(a + e, lo)
          ..close();
        if (value == 'x' || value.isEmpty) canvas.drawPath(shape, Paint()..color = const Color(0x22C62828));
        canvas.drawPath(shape, pen);
        _text(canvas, value, Offset((a + b) / 2, mid), size: 15, bold: true, align: TextAlign.center, maxWidth: b - a - 2 * e);
      }
      continue;
    }
    String? prev;
    for (var j = 0; j < s.values.length; j++) {
      final a = g.left + j * g.stepW, b = a + g.stepW;
      final v = s.values[j];
      switch (v) {
        case '1':
          canvas.drawLine(Offset(a, hi), Offset(b, hi), pen);
        case '0':
          canvas.drawLine(Offset(a, lo), Offset(b, lo), pen);
        case 'z':
          _dashed(canvas, Offset(a, mid), Offset(b, mid), _stroke(const Color(0xFFD98A2B), 3), dash: 6, gap: 4);
        default: // x: unknown, hatched
          final r = Rect.fromLTRB(a, hi, b, lo);
          canvas.drawRect(r, Paint()..color = const Color(0x22C62828));
          canvas.save();
          canvas.clipRect(r);
          for (var x = a - (lo - hi); x < b; x += 10) {
            canvas.drawLine(Offset(x, lo), Offset(x + (lo - hi), hi), _stroke(const Color(0x88C62828), 1.5));
          }
          canvas.restore();
          canvas.drawLine(Offset(a, hi), Offset(b, hi), _stroke(_bad, 1.5));
          canvas.drawLine(Offset(a, lo), Offset(b, lo), _stroke(_bad, 1.5));
      }
      if (prev != null && prev != v) {
        double yOf(String l) => l == '1' ? hi : (l == '0' ? lo : mid);
        canvas.drawLine(Offset(a, prev == 'x' ? hi : yOf(prev)), Offset(a, v == 'x' ? lo : yOf(v)), pen);
      }
      prev = v;
    }
  }
  for (final m in d.markers) {
    final x = g.left + m.at * g.stepW;
    _dashed(canvas, Offset(x, g.top - 30), Offset(x, bottom + 8), _stroke(_bad, 2));
    _text(canvas, m.label, Offset(x + 4, g.top - 40), size: 14, bold: true, color: _bad, maxWidth: 160);
  }
}

// --- Signal and spectrum ----------------------------------------------------------------------

/// The plots of the signal panel on [size]: time, magnitude and (when shown) phase.
List<Rect> signalPlots(SignalPanel s, Size size) {
  final top = 128.0, bottom = size.height - 40;
  final n = s.showPhase ? 3 : 2;
  final h = (bottom - top) / n;
  return [for (var i = 0; i < n; i++) Rect.fromLTRB(96, top + i * h + 24, size.width - 36, top + (i + 1) * h - 18)];
}

void _axes(Canvas canvas, Rect r, String yLabel, String xLabel, double ylo, double yhi, double xlo, double xhi, {bool zero = true}) {
  canvas.drawRect(r, _stroke(_grid, 1));
  for (var i = 0; i <= 4; i++) {
    final y = r.bottom - r.height * i / 4;
    canvas.drawLine(Offset(r.left, y), Offset(r.right, y), Paint()..color = _grid);
    _text(canvas, _fmt(ylo + (yhi - ylo) * i / 4), Offset(r.left - 8, y), size: 12, color: _muted, align: TextAlign.right);
  }
  for (var i = 0; i <= 8; i++) {
    final x = r.left + r.width * i / 8;
    canvas.drawLine(Offset(x, r.top), Offset(x, r.bottom), Paint()..color = _grid);
    _text(canvas, _fmt(xlo + (xhi - xlo) * i / 8), Offset(x, r.bottom + 12), size: 12, color: _muted, align: TextAlign.center);
  }
  if (zero && ylo < 0 && yhi > 0) {
    final y = r.bottom - r.height * (0 - ylo) / (yhi - ylo);
    canvas.drawLine(Offset(r.left, y), Offset(r.right, y), _stroke(const Color(0x55000000), 1));
  }
  _text(canvas, yLabel, Offset(r.left, r.top - 12), size: 14, bold: true, color: _muted);
  _text(canvas, xLabel, Offset(r.right, r.top - 12), size: 13, color: _muted, align: TextAlign.right);
}

String signalKindName(SignalKind k) => switch (k) {
  SignalKind.sine => 'Sine',
  SignalKind.sumOfSines => 'Sum of sines',
  SignalKind.square => 'Square wave',
  SignalKind.am => 'AM',
  SignalKind.fm => 'FM',
  SignalKind.noise => 'White noise',
};

String windowName(WindowKind w) => switch (w) {
  WindowKind.rectangular => 'Rectangular',
  WindowKind.hann => 'Hann',
  WindowKind.hamming => 'Hamming',
  WindowKind.blackman => 'Blackman',
};

void paintSignal(Canvas canvas, SignalPanel s, Size size, Color accent) {
  _text(canvas, s.title, const Offset(24, 36), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final df = s.fs / s.n;
  _text(canvas, '${signalKindName(s.kind)} · fs = ${_fmt(s.fs)} Hz · N = ${s.n} · Δf = ${_fmt(df)} Hz · Nyquist ${_fmt(s.nyquist)} Hz · ${windowName(s.window)} window', const Offset(24, 76), size: 17, maxWidth: size.width - 48);
  final al = s.aliased;
  if (al.isNotEmpty) {
    _text(canvas, 'Aliasing: ${al.map((f) => '${_fmt(f)} Hz shows at ${_fmt(s.aliasOf(f))} Hz').join(', ')}', const Offset(24, 104), size: 17, bold: true, color: _bad, maxWidth: size.width - 48);
  } else if (s.tones.isNotEmpty) {
    _text(canvas, 'Every tone is below fs/2: no aliasing.', const Offset(24, 104), size: 16, color: _muted);
  }
  final plots = signalPlots(s, size);
  final x = s.samples();
  // Time.
  final peak = math.max(1e-9, [for (final v in x) v.abs()].fold(0.0, math.max) * 1.15);
  final t = plots[0];
  _axes(canvas, t, 'x(t)', 't (s)', -peak, peak, 0, s.duration);
  double ty(double v) => t.center.dy - v / peak * t.height / 2;
  if (!s.noisy || s.kind != SignalKind.noise) {
    final path = Path();
    const dense = 900;
    for (var i = 0; i <= dense; i++) {
      final tt = s.duration * i / dense;
      final p = Offset(t.left + t.width * i / dense, ty(s.at(tt)));
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path, _stroke(accent.withValues(alpha: 0.35), 2));
  }
  final samples = Path();
  for (var k = 0; k < x.length; k++) {
    final p = Offset(t.left + t.width * k / s.n, ty(x[k]));
    k == 0 ? samples.moveTo(p.dx, p.dy) : samples.lineTo(p.dx, p.dy);
  }
  canvas.drawPath(samples, _stroke(accent, 1.5));
  if (s.n <= 256) {
    for (var k = 0; k < x.length; k++) {
      canvas.drawCircle(Offset(t.left + t.width * k / s.n, ty(x[k])), 3, Paint()..color = accent);
    }
  }
  // Magnitude.
  final spec = s.spectrum();
  final top = math.max(1e-9, spec.map((b) => b.mag).fold(0.0, math.max) * 1.15);
  final m = plots[1];
  _axes(canvas, m, '|X(f)|', 'f (Hz)', 0, top, 0, s.nyquist);
  final barW = math.max(1.5, m.width / spec.length * 0.6);
  for (final b in spec) {
    final px = m.left + m.width * b.f / s.nyquist;
    canvas.drawLine(Offset(px, m.bottom), Offset(px, m.bottom - m.height * b.mag / top), _stroke(accent, barW));
  }
  for (final f in s.tones) {
    final a = s.aliasOf(f);
    final px = m.left + m.width * a / s.nyquist;
    final c = f > s.nyquist ? _bad : _muted;
    canvas.drawPath(Path()..moveTo(px, m.top + 2)..lineTo(px - 6, m.top - 8)..lineTo(px + 6, m.top - 8)..close(), Paint()..color = c);
  }
  // Phase.
  if (s.showPhase) {
    final p = plots[2];
    _axes(canvas, p, '∠X(f) (°)', 'f (Hz)', -180, 180, 0, s.nyquist);
    for (final b in spec) {
      final px = p.left + p.width * b.f / s.nyquist;
      canvas.drawLine(Offset(px, p.center.dy), Offset(px, p.center.dy - p.height / 2 * b.phase / 180), _stroke(const Color(0xFF8E5FB5), barW));
    }
  }
}

// --- Bode plots -------------------------------------------------------------------------------

String filterName(FilterKind f) => switch (f) {
  FilterKind.lowPass1 => 'First-order low pass',
  FilterKind.highPass1 => 'First-order high pass',
  FilterKind.lowPass2 => 'Second-order low pass',
  FilterKind.highPass2 => 'Second-order high pass',
  FilterKind.bandPass2 => 'Second-order band pass',
};

/// The magnitude and phase plots of the Bode panel on [size].
(Rect, Rect) bodePlots(Size size) {
  final h = (size.height - 150 - 60) / 2;
  return (Rect.fromLTRB(110, 150, size.width - 40, 150 + h - 30), Rect.fromLTRB(110, 150 + h + 30, size.width - 40, size.height - 60));
}

void paintBode(Canvas canvas, BodePanel b, Size size, Color accent) {
  _text(canvas, b.title, const Offset(24, 36), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final scale = b.hz ? 1 / (2 * math.pi) : 1.0;
  final unit = b.hz ? 'Hz' : 'rad/s';
  _text(canvas, b.mode == BodeMode.standard ? '${filterName(b.filter)} · fc = ${_fmt(b.fc)} Hz${b.filter.index >= 2 ? ' · ζ = ${_fmt(b.zeta)}' : ''} · K = ${_fmt(b.k)}' : 'Poles: ${b.poles.isEmpty ? '—' : rootsText(b.poles)} · Zeros: ${b.zeros.isEmpty ? '—' : rootsText(b.zeros)} · K = ${_fmt(b.k)}', const Offset(24, 76), size: 18, maxWidth: size.width - 48);
  _text(canvas, b.formula, const Offset(24, 104), size: 17, color: _muted, maxWidth: size.width - 48);
  final pts = b.sweep();
  final (lo, hi) = b.range;
  final (mr, pr) = bodePlots(size);
  double lg(double x) => math.log(x) / math.ln10;
  double px(Rect r, double w) => r.left + r.width * (lg(w) - lg(lo)) / (lg(hi) - lg(lo));
  // Magnitude range: round 20 dB steps around the curve.
  final dbs = [for (final p in pts) p.db, if (b.showAsymptotes) for (final p in pts) p.asymDb].where((v) => v.isFinite);
  var dbLo = (dbs.fold(double.infinity, math.min) / 20).floorToDouble() * 20, dbHi = (dbs.fold(-double.infinity, math.max) / 20).ceilToDouble() * 20;
  dbLo = math.max(dbLo, dbHi - 160);
  if (dbHi - dbLo < 40) dbLo = dbHi - 40;
  final phs = [for (final p in pts) p.phase, if (b.showAsymptotes) for (final p in pts) p.asymPhase];
  var phLo = (phs.fold(double.infinity, math.min) / 45).floorToDouble() * 45, phHi = (phs.fold(-double.infinity, math.max) / 45).ceilToDouble() * 45;
  if (phHi - phLo < 90) phHi = phLo + 90;
  void frame(Rect r, String label, double ylo, double yhi, double step) {
    canvas.drawRect(r, _stroke(_grid, 1));
    for (var v = ylo; v <= yhi + 1e-9; v += step) {
      final y = r.bottom - r.height * (v - ylo) / (yhi - ylo);
      canvas.drawLine(Offset(r.left, y), Offset(r.right, y), Paint()..color = _grid);
      _text(canvas, _fmt(v), Offset(r.left - 8, y), size: 12, color: _muted, align: TextAlign.right);
    }
    for (var e = lg(lo).round(); e <= lg(hi).round(); e++) {
      final dec = math.pow(10, e).toDouble();
      for (var m = 1; m < 10; m++) {
        final w = dec * m;
        if (w < lo * 0.999 || w > hi * 1.001) continue;
        final x = px(r, w);
        canvas.drawLine(Offset(x, r.top), Offset(x, r.bottom), Paint()..color = m == 1 ? const Color(0x33000000) : const Color(0x14000000));
        if (m == 1) _text(canvas, _fmt(w * scale), Offset(x, r.bottom + 12), size: 12, color: _muted, align: TextAlign.center);
      }
    }
    _text(canvas, label, Offset(r.left, r.top - 14), size: 14, bold: true, color: _muted);
    _text(canvas, 'frequency ($unit)', Offset(r.right, r.top - 14), size: 13, color: _muted, align: TextAlign.right);
  }

  frame(mr, '|H| (dB)', dbLo, dbHi, (dbHi - dbLo) > 100 ? 40 : 20);
  frame(pr, '∠H (°)', phLo, phHi, (phHi - phLo) > 270 ? 90 : 45);
  void curve(Rect r, double Function(BodePoint) y, double ylo, double yhi, Paint paint) {
    canvas.save();
    canvas.clipRect(r.inflate(2));
    Offset? last;
    for (final p in pts) {
      final v = y(p);
      if (!v.isFinite) continue;
      final o = Offset(px(r, p.w), r.bottom - r.height * (v - ylo) / (yhi - ylo));
      if (last != null) canvas.drawLine(last, o, paint);
      last = o;
    }
    canvas.restore();
  }

  for (final c in b.corners) {
    for (final r in [mr, pr]) {
      _dashed(canvas, Offset(px(r, c), r.top), Offset(px(r, c), r.bottom), _stroke(const Color(0x66C62828), 1.5));
    }
    _text(canvas, '${_fmt(c * scale)} $unit', Offset(px(mr, c) + 4, mr.top + 12), size: 12, color: _bad);
  }
  if (b.showAsymptotes) {
    final asym = _stroke(const Color(0xFFD98A2B), 2.5);
    curve(mr, (p) => p.asymDb, dbLo, dbHi, asym);
    curve(pr, (p) => p.asymPhase, phLo, phHi, asym);
  }
  curve(mr, (p) => p.db, dbLo, dbHi, _stroke(accent, 3));
  curve(pr, (p) => p.phase, phLo, phHi, _stroke(accent, 3));
  _text(canvas, b.showAsymptotes ? 'actual (accent) · asymptotic (orange)' : 'actual', Offset(size.width - 40, 36), size: 15, color: _muted, align: TextAlign.right);
}

// --- Pin diagrams -----------------------------------------------------------------------------

const pinTypeColors = {
  PinType.power: Color(0xFFC62828),
  PinType.ground: Color(0xFF263238),
  PinType.gpio: Color(0xFF607D8B),
  PinType.adc: Color(0xFF2E7D32),
  PinType.pwm: Color(0xFF6A1B9A),
  PinType.uart: Color(0xFF1565C0),
  PinType.spi: Color(0xFFEF6C00),
  PinType.i2c: Color(0xFF00838F),
  PinType.timer: Color(0xFFAD1457),
  PinType.interrupt: Color(0xFFF9A825),
  PinType.clock: Color(0xFF4E342E),
  PinType.reset: Color(0xFFD84315),
  PinType.control: Color(0xFF5D4037),
};

/// The chip's body and each pin's box (keyed by pin number) on a panel of [size].
({Rect body, Map<int, Rect> pins}) pinoutGeometry(McuChip chip, Size size) {
  final rows = chip.rows;
  const top = 150.0;
  final rowH = math.min(44.0, (size.height - top - 150) / rows);
  final bodyW = 220.0;
  final body = Rect.fromLTWH(size.width / 2 - bodyW / 2, top, bodyW, rowH * rows + 16);
  final pins = <int, Rect>{};
  for (final (i, p) in chip.pins.indexed) {
    final left = i < rows;
    final row = left ? i : (chip.dip ? chip.pins.length - 1 - i : i - rows);
    final y = top + 8 + row * rowH;
    pins[p.number] = left ? Rect.fromLTWH(body.left - 34, y + 3, 34, rowH - 6) : Rect.fromLTWH(body.right, y + 3, 34, rowH - 6);
  }
  return (body: body, pins: pins);
}

/// The pin under [p] on a panel of [size], if any (its box or its name beside it).
int? pinoutHit(McuChip chip, Size size, Offset p) {
  final g = pinoutGeometry(chip, size);
  for (final MapEntry(key: n, value: r) in g.pins.entries) {
    final left = r.right <= g.body.left + 1;
    final reach = left ? Rect.fromLTRB(24, r.top, r.right, r.bottom) : Rect.fromLTRB(r.left, r.top, size.width - 24, r.bottom);
    if (reach.contains(p)) return n;
  }
  return null;
}

void paintPinout(Canvas canvas, McuPinout m, Size size, Color accent) {
  final chip = m.device;
  _text(canvas, m.heading, const Offset(24, 36), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  _text(canvas, '${chip.package}${m.filter == null ? '' : ' · showing ${pinTypeName(m.filter!)}'}${m.query.isEmpty ? '' : ' · "${m.query}"'}', const Offset(24, 74), size: 17, color: _muted, maxWidth: size.width - 48);
  final sel = m.selected == null ? null : chip.pin(m.selected!);
  if (sel != null) {
    _text(canvas, 'Pin ${sel.number} · ${sel.name}: ${sel.functions.join(', ')}  [${sel.types.map(pinTypeName).join(', ')}]', const Offset(24, 108), size: 18, bold: true, maxWidth: size.width - 48);
  }
  final g = pinoutGeometry(chip, size);
  canvas.drawRRect(RRect.fromRectAndRadius(g.body, const Radius.circular(10)), Paint()..color = const Color(0xFF2B2F36));
  if (chip.dip) {
    canvas.drawArc(Rect.fromCircle(center: Offset(g.body.center.dx, g.body.top), radius: 18), 0, math.pi, false, Paint()..color = const Color(0xFF555B64));
    canvas.drawCircle(g.body.topLeft + const Offset(26, 26), 6, Paint()..color = const Color(0xFF555B64));
  }
  _text(canvas, chip.name, g.body.center - const Offset(0, 14), size: 18, bold: true, color: Colors.white, align: TextAlign.center, maxWidth: g.body.width - 60);
  _text(canvas, chip.package, g.body.center + const Offset(0, 14), size: 14, color: const Color(0xFFB0B6BE), align: TextAlign.center, maxWidth: g.body.width - 60);
  final any = m.filter != null || m.query.trim().isNotEmpty;
  for (final p in chip.pins) {
    final r = g.pins[p.number]!;
    final left = r.right <= g.body.left + 1;
    final shown = !any || m.shows(p);
    final c = pinTypeColors[p.primary]!.withValues(alpha: shown ? 1 : 0.18);
    final textC = shown ? _ink : const Color(0x44000000);
    if (p.number == m.selected) canvas.drawRect(Rect.fromLTRB(24, r.top - 2, size.width - 24, r.bottom + 2), Paint()..color = accent.withValues(alpha: 0.14));
    canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(3)), Paint()..color = c);
    final fs = math.min(16.0, r.height * 0.55);
    _text(canvas, '${p.number}', r.center, size: fs * 0.85, bold: true, color: Colors.white, align: TextAlign.center);
    // Small type dots for the other functions, inside the body.
    for (final (k, t) in p.types.skip(1).take(4).indexed) {
      final x = left ? g.body.left + 10 + k * 11 : g.body.right - 10 - k * 11;
      canvas.drawCircle(Offset(x, r.center.dy), 4, Paint()..color = pinTypeColors[t]!.withValues(alpha: shown ? 1 : 0.18));
    }
    final nameX = left ? r.left - 10 : r.right + 10;
    _text(canvas, p.name, Offset(nameX, r.center.dy), size: fs, bold: true, color: textC, align: left ? TextAlign.right : TextAlign.left, maxWidth: 130);
    final fnX = left ? r.left - 150 : r.right + 150;
    _text(canvas, p.functions.join(', '), Offset(fnX, r.center.dy), size: fs * 0.8, color: shown ? _muted : const Color(0x33000000), align: left ? TextAlign.right : TextAlign.left, maxWidth: fnX - 24 > 0 && left ? fnX - 24 : size.width - 24 - fnX);
  }
  // Legend.
  var x = 24.0;
  var y = size.height - 104;
  for (final t in PinType.values) {
    final label = pinTypeName(t);
    final w = 34.0 + label.length * 9;
    if (x + w > size.width - 24) {
      x = 24;
      y += 28;
    }
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y - 9, 18, 18), const Radius.circular(3)), Paint()..color = pinTypeColors[t]!.withValues(alpha: m.filter == null || m.filter == t ? 1 : 0.25));
    _text(canvas, label, Offset(x + 24, y), size: 14, color: _ink);
    x += w;
  }
  _text(canvas, chip.note, Offset(24, size.height - 30), size: 14, color: _bad, maxWidth: size.width - 48);
}
