import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'civil_models.dart';

// Drawing the civil engineering panels (KitElement) on a white card, worked out: the beam with
// its reactions, shear force, bending moment and deflection diagrams; the truss with its member
// forces (tension blue, compression red); the level book reduced and checked; the traverse with
// its closing error and Bowditch correction; and the contour sketch. Panel words are in English,
// as in the textbooks.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _grid = Color(0x22000000);
const _good = Color(0xFF0F8A5F);
const _bad = Color(0xFFC62828);

/// Members in tension and compression (and the shear force and bending moment fills).
const civilTension = Color(0xFF1565C0);
const civilCompression = Color(0xFFC62828);

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

void _arrow(Canvas canvas, Offset from, Offset to, Color c, {double w = 2.5, double head = 11}) {
  final p = _stroke(c, w);
  canvas.drawLine(from, to, p);
  final d = to - from;
  if (d.distance == 0) return;
  final u = d / d.distance, n = Offset(-u.dy, u.dx);
  final path = Path()
    ..moveTo(to.dx, to.dy)
    ..lineTo(to.dx - u.dx * head + n.dx * head * 0.5, to.dy - u.dy * head + n.dy * head * 0.5)
    ..lineTo(to.dx - u.dx * head - n.dx * head * 0.5, to.dy - u.dy * head - n.dy * head * 0.5)
    ..close();
  canvas.drawPath(path, Paint()..color = c);
}

/// A figure to 2 decimals (3 for levels), with no "-0.00".
String civilNum(double v, [int places = 2]) {
  if (!v.isFinite) return '—';
  final s = v.toStringAsFixed(places);
  return double.parse(s) == 0 ? (0).toStringAsFixed(places) : s;
}

String _x(double v) => civilNum(v, v == v.roundToDouble() ? 0 : 2);

// --- Beam --------------------------------------------------------------------------------------

/// Where the beam's span is drawn across a panel of [size] (the editor drags loads in the same
/// frame), and the beam's centre line.
({double left, double right, double y}) beamFrame(Size size) => (left: 100, right: size.width - 100, y: 200);

double beamToPx(BeamModel b, Size size, double x) {
  final f = beamFrame(size);
  return f.left + (f.right - f.left) * (x / b.length);
}

double beamFromPx(BeamModel b, Size size, double px) {
  final f = beamFrame(size);
  return ((px - f.left) / (f.right - f.left) * b.length).clamp(0.0, b.length);
}

void paintBeam(Canvas canvas, BeamModel b, Size size, Color accent, {BeamResult? result}) {
  final r = result ?? b.solve();
  final f = beamFrame(size);
  double px(double x) => beamToPx(b, size, x);
  _text(canvas, b.title, const Offset(24, 36), size: 28, bold: true, color: accent, maxWidth: size.width - 48);
  final ei = b.ei > 0 ? 'EI = ${_x(b.ei)} kN·m²' : 'EI not given';
  _text(canvas, 'Span ${_x(b.length)} m · $ei · kN, m', const Offset(24, 68), size: 14, color: _muted, maxWidth: size.width - 48);

  // Loads above the beam.
  final topY = f.y - 6;
  final wMax = b.loads.where((l) => l.distributed).fold(0.0, (a, l) => math.max(a, math.max(l.wStart.abs(), l.wEnd.abs())));
  for (final l in b.loads) {
    switch (l.kind) {
      case BeamLoadKind.point:
        final x = px(l.x), down = l.w >= 0;
        _arrow(canvas, Offset(x, down ? topY - 80 : topY), Offset(x, down ? topY : topY - 80), _bad, w: 3);
        _text(canvas, '${_x(l.w.abs())} kN', Offset(x, topY - 92), size: 15, bold: true, color: _bad, align: TextAlign.center);
      case BeamLoadKind.udl || BeamLoadKind.uvl:
        final a = px(l.start), c = px(l.end);
        if (c - a < 1) continue;
        double h(double w) => wMax <= 0 ? 0 : 18 + 52 * w.abs() / wMax;
        final h1 = h(l.wStart), h2 = h(l.wEnd);
        final fill = Path()
          ..moveTo(a, topY)
          ..lineTo(a, topY - h1)
          ..lineTo(c, topY - h2)
          ..lineTo(c, topY)
          ..close();
        canvas
          ..drawPath(fill, Paint()..color = accent.withValues(alpha: 0.10))
          ..drawLine(Offset(a, topY - h1), Offset(c, topY - h2), _stroke(accent, 2));
        final n = math.max(2, ((c - a) / 28).round());
        for (var i = 0; i <= n; i++) {
          final x = a + (c - a) * i / n, hh = h1 + (h2 - h1) * i / n;
          if (hh > 8) _arrow(canvas, Offset(x, topY - hh), Offset(x, topY), accent, w: 1.6, head: 8);
        }
        final label = l.kind == BeamLoadKind.udl ? '${_x(l.w)} kN/m' : '${_x(l.wStart)} → ${_x(l.wEnd)} kN/m';
        _text(canvas, label, Offset((a + c) / 2, topY - math.max(h1, h2) - 14), size: 15, bold: true, color: accent, align: TextAlign.center, maxWidth: math.max(120, c - a + 60));
      case BeamLoadKind.moment:
        final x = px(l.x);
        const rad = 26.0;
        final rect = Rect.fromCircle(center: Offset(x, f.y), radius: rad);
        final cw = l.w >= 0;
        canvas.drawArc(rect, math.pi * 0.85, math.pi * 1.3, false, _stroke(const Color(0xFF6A1B9A), 2.6));
        final endA = cw ? math.pi * 0.85 + math.pi * 1.3 : math.pi * 0.85;
        final tip = Offset(x + rad * math.cos(endA), f.y + rad * math.sin(endA));
        final tangent = cw ? Offset(-math.sin(endA), math.cos(endA)) : Offset(math.sin(endA), -math.cos(endA));
        _arrow(canvas, tip - tangent * 2, tip + tangent * 10, const Color(0xFF6A1B9A), w: 2.6, head: 10);
        _text(canvas, '${_x(l.w.abs())} kN·m ${cw ? '↻' : '↺'}', Offset(x, f.y + rad + 14), size: 15, bold: true, color: const Color(0xFF6A1B9A), align: TextAlign.center);
    }
  }

  // The beam and its supports.
  canvas.drawRect(Rect.fromLTRB(f.left, f.y - 6, f.right, f.y + 6), Paint()..color = const Color(0xFF8D99A6));
  canvas.drawRect(Rect.fromLTRB(f.left, f.y - 6, f.right, f.y + 6), _stroke(_ink, 1.6));
  for (final s in b.supports) {
    final x = px(s.x);
    switch (s.kind) {
      case BeamSupportKind.pin || BeamSupportKind.roller:
        final tri = Path()
          ..moveTo(x, f.y + 6)
          ..lineTo(x - 16, f.y + 34)
          ..lineTo(x + 16, f.y + 34)
          ..close();
        canvas
          ..drawPath(tri, Paint()..color = const Color(0xFFE8ECF0))
          ..drawPath(tri, _stroke(_ink, 2));
        if (s.kind == BeamSupportKind.roller) {
          for (final dx in [-9.0, 9.0]) {
            canvas.drawCircle(Offset(x + dx, f.y + 41), 6, _stroke(_ink, 2));
          }
          canvas.drawLine(Offset(x - 22, f.y + 48), Offset(x + 22, f.y + 48), _stroke(_ink, 2));
        } else {
          canvas.drawLine(Offset(x - 22, f.y + 34), Offset(x + 22, f.y + 34), _stroke(_ink, 2));
          for (var i = -2; i <= 2; i++) {
            canvas.drawLine(Offset(x + i * 8.0, f.y + 34), Offset(x + i * 8.0 - 7, f.y + 42), _stroke(_ink, 1.4));
          }
        }
      case BeamSupportKind.fixed:
        final side = s.x <= b.length / 2 ? -1.0 : 1.0;
        final wx = x + side * 4;
        canvas.drawLine(Offset(wx, f.y - 40), Offset(wx, f.y + 40), _stroke(_ink, 3));
        for (var i = 0; i < 8; i++) {
          final y = f.y - 38 + i * 11.0;
          canvas.drawLine(Offset(wx, y), Offset(wx + side * 10, y + 8), _stroke(_ink, 1.4));
        }
    }
  }

  // Reactions under the supports.
  if (r.stable) {
    for (final re in r.reactions) {
      if (re.force == 0 && re.moment == 0) continue;
      final x = px(re.support.x);
      final up = re.force >= 0;
      _arrow(canvas, Offset(x, f.y + (up ? 90 : 56)), Offset(x, f.y + (up ? 56 : 90)), _good, w: 2.6);
      final label = StringBuffer('R = ${civilNum(re.force)} kN');
      if (re.support.kind == BeamSupportKind.fixed) label.write('   M = ${civilNum(re.moment)} kN·m ${re.moment >= 0 ? '↺' : '↻'}');
      final align = x < f.left + 60 ? TextAlign.left : (x > f.right - 60 ? TextAlign.right : TextAlign.center);
      _text(canvas, label.toString(), Offset(align == TextAlign.left ? x - 30 : (align == TextAlign.right ? x + 30 : x), f.y + 104), size: 14, bold: true, color: _good, align: align, maxWidth: 360);
    }
  }

  // Dimension marks along the span.
  final dimY = f.y + 132;
  canvas.drawLine(Offset(f.left, dimY), Offset(f.right, dimY), _stroke(_muted, 1));
  final marks = {0.0, b.length, for (final s in b.supports) s.x, for (final l in b.loads) ...[l.start, l.end]}.toList()..sort();
  var lastLabel = -1e9;
  for (final m in marks) {
    final x = px(m);
    canvas.drawLine(Offset(x, dimY - 5), Offset(x, dimY + 5), _stroke(_muted, 1.2));
    if (x - lastLabel > 34) {
      _text(canvas, _x(m), Offset(x, dimY + 14), size: 12, color: _muted, align: TextAlign.center);
      lastLabel = x;
    }
  }

  if (!r.stable) {
    _text(canvas, 'Unstable: the supports cannot hold this beam. Add or change a support.', Offset(size.width / 2, size.height * 0.62), size: 20, bold: true, color: _bad, align: TextAlign.center, maxWidth: size.width - 80);
    return;
  }

  final xs = r.samples;
  void diagram(String name, double top, double height, List<(double, double)> pts, Color color, String unit, {List<String> notes = const [], List<double> marks = const []}) {
    final zero = top + height / 2;
    final peak = pts.fold(0.0, (a, p) => math.max(a, p.$2.abs()));
    final k = peak <= 1e-12 ? 0.0 : (height / 2 - 8) / peak;
    _text(canvas, name, Offset(24, top + 4), size: 16, bold: true);
    for (final (i, n) in notes.indexed) {
      _text(canvas, n, Offset(size.width - 24, top + 4 + i * 18), size: 13, color: _muted, align: TextAlign.right, maxWidth: size.width * 0.6);
    }
    canvas.drawLine(Offset(f.left, zero), Offset(f.right, zero), _stroke(_ink, 1.4));
    final path = Path()..moveTo(px(pts.first.$1), zero);
    for (final (x, v) in pts) {
      path.lineTo(px(x), zero - v * k);
    }
    path
      ..lineTo(px(pts.last.$1), zero)
      ..close();
    canvas
      ..drawPath(path, Paint()..color = color.withValues(alpha: 0.16))
      ..drawPath(path, _stroke(color, 2.2));
    for (final x in marks) {
      canvas.drawCircle(Offset(px(x), zero), 6, Paint()..color = const Color(0xFF6A1B9A));
      _text(canvas, 'x = ${civilNum(x)}', Offset(px(x), zero + 16), size: 12, bold: true, color: const Color(0xFF6A1B9A), align: TextAlign.center);
    }
    _text(canvas, unit, Offset(f.left - 10, zero), size: 12, color: _muted, align: TextAlign.right, maxWidth: 90);
  }

  final vMax = r.maxShear, sag = r.maxSagging, hog = r.maxHogging, cf = r.contraflexure;
  diagram('Shear force diagram (SFD)', 370, 180, [for (final x in xs) (x, r.shearAt(x))], civilTension, 'kN', notes: ['Max shear ${civilNum(vMax.v)} kN at x = ${civilNum(vMax.x)} m', if (r.zeroShear.isNotEmpty) 'Zero shear at x = ${r.zeroShear.map(civilNum).join(', ')} m']);
  diagram(
    'Bending moment diagram (BMD)',
    570,
    210,
    [for (final x in xs) (x, r.momentAt(x))],
    civilCompression,
    'kN·m',
    notes: [
      if (sag.v > 1e-9) 'Max sagging ${civilNum(sag.v)} kN·m at x = ${civilNum(sag.x)} m',
      if (hog.v < -1e-9) 'Max hogging ${civilNum(hog.v)} kN·m at x = ${civilNum(hog.x)} m',
      cf.isEmpty ? 'No point of contraflexure' : 'Contraflexure at x = ${cf.map(civilNum).join(', ')} m',
    ],
    marks: cf,
  );
  final d = r.maxDeflection;
  diagram(
    'Deflection curve',
    800,
    190,
    r.deflection,
    _good,
    b.ei > 0 ? 'mm' : '×1/EI',
    notes: [b.ei > 0 ? 'Max deflection ${civilNum(d.v)} mm at x = ${civilNum(d.x)} m' : 'Max deflection ${civilNum(d.v, 3)}/EI m at x = ${civilNum(d.x)} m (enter EI for mm)'],
  );
  _text(canvas, 'Sagging moment +ve (drawn up); shear +ve when the left part is pushed up. Deflection down −ve.', Offset(24, size.height - 20), size: 12, color: _muted, maxWidth: size.width - 48);
}

// --- Truss -------------------------------------------------------------------------------------

/// Where the truss is drawn on a panel of [size]: world (m, y up) to the panel and back.
({double scale, Offset origin}) trussFrame(TrussModel t, Size size) {
  final area = Rect.fromLTRB(70, 120, size.width - 380, size.height - 80);
  if (t.nodes.isEmpty) return (scale: 40.0, origin: area.bottomLeft);
  var x0 = t.nodes.first.x, x1 = x0, y0 = t.nodes.first.y, y1 = y0;
  for (final n in t.nodes) {
    x0 = math.min(x0, n.x);
    x1 = math.max(x1, n.x);
    y0 = math.min(y0, n.y);
    y1 = math.max(y1, n.y);
  }
  final w = math.max(1e-6, x1 - x0), h = math.max(1e-6, y1 - y0);
  final scale = math.min(area.width / w, area.height / h).clamp(1.0, 400.0);
  final origin = Offset(area.center.dx - (x0 + w / 2) * scale, area.center.dy + (y0 + h / 2) * scale);
  return (scale: scale, origin: origin);
}

Offset trussToPx(({double scale, Offset origin}) f, double x, double y) => Offset(f.origin.dx + x * f.scale, f.origin.dy - y * f.scale);

(double, double) trussFromPx(({double scale, Offset origin}) f, Offset p) => ((p.dx - f.origin.dx) / f.scale, (f.origin.dy - p.dy) / f.scale);

void paintTruss(Canvas canvas, TrussModel t, Size size, Color accent) {
  final r = t.solve();
  final f = trussFrame(t, size);
  Offset at(int i) => trussToPx(f, t.nodes[i].x, t.nodes[i].y);
  _text(canvas, t.title, const Offset(24, 36), size: 28, bold: true, color: accent, maxWidth: size.width - 48);
  final m = t.members.length, j = t.nodes.length;
  final rCount = t.nodes.fold(0, (a, n) => a + switch (n.support) { TrussSupportKind.pin => 2, null => 0, _ => 1 });
  final status = switch (r.status) {
    TrussStatus.determinate => 'm + r = 2j: $m + $rCount = ${2 * j} · statically determinate (method of joints)',
    TrussStatus.indeterminate => 'm + r = ${m + rCount} > 2j = ${2 * j} · indeterminate: solved by stiffness, equal AE assumed',
    TrussStatus.unstable => 'm + r = ${m + rCount}, 2j = ${2 * j} · unstable or a mechanism: add members or supports',
  };
  _text(canvas, status, const Offset(24, 70), size: 14, color: r.status == TrussStatus.unstable ? _bad : _muted, maxWidth: size.width - 48);

  final peak = r.forces.fold(0.0, (a, v) => math.max(a, v.abs()));
  for (final (k, (a, b)) in t.members.indexed) {
    final p = at(a), q = at(b);
    final force = k < r.forces.length ? r.forces[k] : 0.0;
    final zero = force.abs() <= math.max(1e-6, peak * 1e-6);
    final color = r.forces.isEmpty || zero ? const Color(0xFF8D99A6) : (force > 0 ? civilTension : civilCompression);
    canvas.drawLine(p, q, _stroke(color, r.forces.isEmpty ? 3 : 3 + 3 * (peak <= 0 ? 0 : force.abs() / peak)));
    if (r.forces.isNotEmpty) {
      final mid = (p + q) / 2;
      final label = zero ? '0' : '${civilNum(force.abs())} ${force > 0 ? 'T' : 'C'}';
      final rect = Rect.fromCenter(center: mid, width: 14 + label.length * 8.0, height: 22);
      canvas
        ..drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(4)), Paint()..color = const Color(0xF2FFFFFF))
        ..drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(4)), _stroke(color, 1));
      _text(canvas, label, mid, size: 13, bold: true, color: color, align: TextAlign.center);
    }
  }
  final loadPeak = t.nodes.fold(0.0, (a, n) => math.max(a, math.sqrt(n.fx * n.fx + n.fy * n.fy)));
  for (final (i, n) in t.nodes.indexed) {
    final p = at(i);
    if (n.support != null) {
      final tri = Path()
        ..moveTo(p.dx, p.dy + 6)
        ..lineTo(p.dx - 15, p.dy + 32)
        ..lineTo(p.dx + 15, p.dy + 32)
        ..close();
      canvas
        ..drawPath(tri, Paint()..color = const Color(0xFFE8ECF0))
        ..drawPath(tri, _stroke(_ink, 2));
      if (n.support == TrussSupportKind.pin) {
        canvas.drawLine(Offset(p.dx - 22, p.dy + 32), Offset(p.dx + 22, p.dy + 32), _stroke(_ink, 2));
      } else {
        for (final dx in [-8.0, 8.0]) {
          canvas.drawCircle(Offset(p.dx + dx, p.dy + 38), 5, _stroke(_ink, 1.8));
        }
        canvas.drawLine(Offset(p.dx - 22, p.dy + 44), Offset(p.dx + 22, p.dy + 44), _stroke(_ink, 2));
      }
      final re = r.reactions[i];
      if (re != null) {
        final parts = [if (re.rx.abs() > 1e-9) 'Rx ${civilNum(re.rx)}', if (re.ry.abs() > 1e-9 || n.support != TrussSupportKind.rollerY) 'Ry ${civilNum(re.ry)}'];
        _text(canvas, '${parts.join('  ')} kN', p + const Offset(0, 60), size: 13, bold: true, color: _good, align: TextAlign.center, maxWidth: 220);
      }
    }
    final mag = math.sqrt(n.fx * n.fx + n.fy * n.fy);
    if (mag > 0) {
      final dir = Offset(n.fx, -n.fy) / mag;
      final len = 36 + 30 * mag / math.max(loadPeak, 1e-9);
      // Drawn from the joint in the load's direction, clear of the members above a bottom chord.
      final shift = n.support != null ? dir * 50 : Offset.zero;
      _arrow(canvas, p + dir * 9 + shift, p + dir * (len + 9) + shift, _bad, w: 3);
      _text(canvas, '${_x(mag)} kN', p + dir * (len + 24) + shift, size: 14, bold: true, color: _bad, align: TextAlign.center);
    }
    canvas
      ..drawCircle(p, 7, Paint()..color = Colors.white)
      ..drawCircle(p, 7, _stroke(_ink, 2.2));
    _text(canvas, t.nameOf(i), p + const Offset(-14, -16), size: 15, bold: true, align: TextAlign.right);
  }

  // The force table.
  final tx = size.width - 350;
  _text(canvas, 'Member forces (kN)', Offset(tx, 120), size: 16, bold: true);
  final rowH = math.min(24.0, (size.height - 230) / math.max(1, m + 1));
  for (final (k, (a, b)) in t.members.indexed) {
    final y = 148 + k * rowH;
    final force = k < r.forces.length ? r.forces[k] : double.nan;
    final zero = force.isFinite && force.abs() <= math.max(1e-6, peak * 1e-6);
    final color = !force.isFinite || zero ? _muted : (force > 0 ? civilTension : civilCompression);
    _text(canvas, '${t.nameOf(a)}${t.nameOf(b)}', Offset(tx, y), size: 14);
    _text(canvas, force.isFinite ? civilNum(zero ? 0 : force) : '—', Offset(tx + 170, y), size: 14, bold: true, color: color, align: TextAlign.right);
    _text(canvas, !force.isFinite ? '' : (zero ? 'zero' : (force > 0 ? 'tension' : 'compression')), Offset(tx + 190, y), size: 14, color: color);
  }
  _text(canvas, '+ tension (blue), − compression (red)', Offset(tx, size.height - 30), size: 12, color: _muted, maxWidth: 340);
}

// --- Level book --------------------------------------------------------------------------------

void paintLevelBook(Canvas canvas, LevelBook b, Size size, Color accent) {
  final r = b.reduce();
  final rf = b.method == LevelMethod.riseFall;
  _text(canvas, b.title, const Offset(24, 36), size: 28, bold: true, color: accent, maxWidth: size.width - 48);
  _text(canvas, rf ? 'Rise and fall method · readings in m' : 'Height of instrument method · readings in m', const Offset(24, 68), size: 14, color: _muted);
  final heads = rf ? ['Station', 'BS', 'IS', 'FS', 'Rise', 'Fall', 'RL', 'Remarks'] : ['Station', 'BS', 'IS', 'FS', 'HI', 'RL', 'Remarks'];
  final widths = rf ? [150.0, 120, 120, 120, 120, 120, 140, 262] : [150.0, 130, 130, 130, 150, 150, 312];
  const left = 24.0, top = 96.0;
  final n = b.rows.length;
  final rowH = math.min(36.0, (size.height - top - 220) / math.max(1, n + 2));
  final tableW = widths.fold(0.0, (a, w) => a + w);
  final font = math.min(15.0, rowH * 0.45);
  canvas.drawRect(Rect.fromLTWH(left, top, tableW, rowH), Paint()..color = accent.withValues(alpha: 0.12));
  String v(double? x) => x == null ? '' : civilNum(x, 3);
  List<String> cells(int i) {
    final row = b.rows[i];
    return rf
        ? [row.station, v(row.bs), v(row.ins), v(row.fs), v(r.rise[i]), v(r.fall[i]), v(r.rl[i]), row.remark]
        : [row.station, v(row.bs), v(row.ins), v(row.fs), v(r.hi[i]), v(r.rl[i]), row.remark];
  }

  final sums = rf
      ? ['Σ', v(r.sumBs), v(r.sumIs), v(r.sumFs), v(r.sumRise), v(r.sumFall), '', '']
      : ['Σ', v(r.sumBs), v(r.sumIs), v(r.sumFs), '', '', ''];
  for (var i = -1; i <= n; i++) {
    final y = top + (i + 1) * rowH;
    final texts = i < 0 ? heads : (i == n ? sums : cells(i));
    var x = left;
    for (final (c, t) in texts.indexed) {
      final numeric = c > 0 && c < widths.length - 1;
      _text(canvas, t, Offset(numeric ? x + widths[c] - 10 : x + 10, y + rowH / 2), size: font, bold: i < 0 || i == n, align: numeric ? TextAlign.right : TextAlign.left, maxWidth: widths[c] - 16);
      x += widths[c];
    }
    canvas.drawLine(Offset(left, y + rowH), Offset(left + tableW, y + rowH), _stroke(i == n - 1 ? _ink : _grid, i == n - 1 ? 1.4 : 1));
  }
  var x = left;
  for (final w in [0.0, ...widths]) {
    x += w;
    canvas.drawLine(Offset(x, top), Offset(x, top + (n + 2) * rowH), _stroke(_grid, 1));
  }
  canvas.drawRect(Rect.fromLTWH(left, top, tableW, (n + 2) * rowH), _stroke(const Color(0xFF3A4048), 1.4));

  // The arithmetic check.
  var y = top + (n + 2) * rowH + 30;
  final ok = r.checks;
  final lines = [
    'ΣBS − ΣFS = ${v(r.sumBs)} − ${v(r.sumFs)} = ${v(r.sumBs - r.sumFs)}',
    if (rf) 'ΣRise − ΣFall = ${v(r.sumRise)} − ${v(r.sumFall)} = ${v(r.sumRise - r.sumFall)}',
    'Last RL − First RL = ${v(r.lastRl)} − ${v(r.firstRl)} = ${v(r.lastRl - r.firstRl)}',
    if (!rf) 'Σ(HI × readings from it) − ΣIS − ΣFS = ${v(r.hiProducts)} − ${v(r.sumIs)} − ${v(r.sumFs)} = ${v(r.hiProducts - r.sumIs - r.sumFs)};  ΣRL (except first) = ${v(r.rlSumExceptFirst)}',
  ];
  _text(canvas, 'Arithmetic check', Offset(left, y), size: 16, bold: true);
  for (final l in lines) {
    y += 26;
    _text(canvas, l, Offset(left, y), size: 15, maxWidth: size.width - 48);
  }
  y += 34;
  _text(canvas, ok ? '✓ Arithmetic check agrees' : '✕ Arithmetic check does not agree: look for a misbooked reading', Offset(left, y), size: 17, bold: true, color: ok ? _good : _bad, maxWidth: size.width - 48);
}

// --- Traverse ----------------------------------------------------------------------------------

void paintTraverse(Canvas canvas, Traverse t, Size size, Color accent) {
  _text(canvas, t.title, const Offset(24, 36), size: 28, bold: true, color: accent, maxWidth: size.width - 48);
  _text(canvas, 'Whole circle bearings from north · lengths in m · Bowditch (compass rule) correction', const Offset(24, 68), size: 14, color: _muted, maxWidth: size.width - 48);
  final obs = t.observed, cor = t.corrected;
  final plot = Rect.fromLTRB(40, 100, 500, size.height - 40);
  var e0 = obs.first.$1, e1 = e0, n0 = obs.first.$2, n1 = n0;
  for (final (e, n) in [...obs, ...cor]) {
    e0 = math.min(e0, e);
    e1 = math.max(e1, e);
    n0 = math.min(n0, n);
    n1 = math.max(n1, n);
  }
  final w = math.max(1e-6, e1 - e0), h = math.max(1e-6, n1 - n0);
  final k = math.min((plot.width - 60) / w, (plot.height - 60) / h);
  Offset p((double, double) en) => Offset(plot.center.dx + (en.$1 - (e0 + w / 2)) * k, plot.center.dy - (en.$2 - (n0 + h / 2)) * k);
  // North arrow.
  _arrow(canvas, Offset(plot.left + 20, plot.top + 60), Offset(plot.left + 20, plot.top + 14), _ink, w: 2);
  _text(canvas, 'N', Offset(plot.left + 20, plot.top + 4), size: 14, bold: true, align: TextAlign.center);
  for (var i = 0; i + 1 < cor.length; i++) {
    _dashed(canvas, p(cor[i]), p(cor[i + 1]), _stroke(_good, 2));
  }
  final centre = obs.fold(Offset.zero, (c, s) => c + p(s)) / obs.length.toDouble();
  for (var i = 0; i + 1 < obs.length; i++) {
    final a = p(obs[i]), b = p(obs[i + 1]);
    canvas.drawLine(a, b, _stroke(accent, 3));
    final mid = (a + b) / 2;
    final leg = t.legs[i];
    // Labels on the outside of the figure.
    var nrm = (b - a).distance == 0 ? const Offset(0, -1) : Offset(-(b - a).dy, (b - a).dx) / (b - a).distance;
    if (((mid + nrm) - centre).distance < (mid - centre).distance) nrm = -nrm;
    final at = mid + Offset(nrm.dx * 64, nrm.dy * 26);
    _text(canvas, '${leg.name.isEmpty ? '' : '${leg.name}  '}${degreesMinutes(leg.bearing)}', at + const Offset(0, -8), size: 12, bold: true, color: accent, align: TextAlign.center, maxWidth: 200);
    _text(canvas, '${_x(leg.length)} m', at + const Offset(0, 8), size: 12, color: _muted, align: TextAlign.center);
  }
  if (t.closingError > 1e-9 && obs.length > 1) {
    _dashed(canvas, p(obs.last), p(obs.first), _stroke(_bad, 2.4), dash: 5, gap: 4);
  }
  for (final (i, s) in obs.indexed) {
    if (i == obs.length - 1 && t.closingError < 1e-6) continue;
    canvas
      ..drawCircle(p(s), 6, Paint()..color = Colors.white)
      ..drawCircle(p(s), 6, _stroke(_ink, 2));
    _text(canvas, i == obs.length - 1 ? "${_station(0)}'" : _station(i), p(s) + const Offset(12, -12), size: 14, bold: true);
  }

  // The table: latitudes, departures, corrections.
  const tx = 520.0;
  final heads = ['Line', 'Length', 'WCB', 'QB', 'Lat', 'Dep', 'Corr. Lat', 'Corr. Dep'];
  const widths = [60.0, 80, 76, 104, 82, 82, 92, 92];
  final rowH = math.min(30.0, (size.height - 330) / math.max(1, t.legs.length + 2));
  final c = t.bowditch;
  var y = 112.0;
  void row(List<String> cells, {bool bold = false, Color color = _ink}) {
    var x = tx;
    for (final (i, s) in cells.indexed) {
      _text(canvas, s, Offset(i == 0 ? x + 4 : x + widths[i] - 6, y), size: 13, bold: bold, color: color, align: i == 0 ? TextAlign.left : TextAlign.right, maxWidth: widths[i] - 8);
      x += widths[i];
    }
    y += rowH;
  }

  row(heads, bold: true);
  for (final (i, l) in t.legs.indexed) {
    row([l.name.isEmpty ? '${_station(i)}${_station((i + 1) % t.legs.length)}' : l.name, civilNum(l.length), degreesMinutes(l.bearing), quadrantalBearing(l.bearing), civilNum(l.latitude, 3), civilNum(l.departure, 3), civilNum(l.latitude + c[i].dLat, 3), civilNum(l.departure + c[i].dDep, 3)]);
  }
  row(['Σ', civilNum(t.perimeter), '', '', civilNum(t.sumLatitude, 3), civilNum(t.sumDeparture, 3), civilNum(0, 3), civilNum(0, 3)], bold: true);
  y += 18;
  final closes = t.closingError < 1e-6;
  final lines = [
    'ΣL = ${civilNum(t.sumLatitude, 3)} m, ΣD = ${civilNum(t.sumDeparture, 3)} m',
    closes ? 'The traverse closes: no correction needed' : 'Closing error e = √(ΣL² + ΣD²) = ${civilNum(t.closingError, 3)} m, bearing ${degreesMinutes(t.closingBearing)}',
    if (!closes) 'Relative precision 1 in ${t.precision.round()}',
    'Bowditch: correction to a leg = −(ΣL or ΣD) × its length ÷ perimeter',
  ];
  for (final l in lines) {
    _text(canvas, l, Offset(tx, y), size: 14, bold: l.startsWith('Closing'), color: l.startsWith('Closing') ? _bad : _ink, maxWidth: size.width - tx - 24);
    y += 24;
  }
  _text(canvas, 'Observed (solid), corrected (green dashed), closing error (red)', Offset(tx, size.height - 30), size: 12, color: _muted, maxWidth: size.width - tx - 24);
}

String _station(int i) => String.fromCharCode(65 + i % 26);

// --- Contours ----------------------------------------------------------------------------------

/// Where the contour grid is drawn: its top-left point and the cell size.
({Offset origin, double cell}) contourFrame(ContourGrid g, Size size) {
  final area = Rect.fromLTRB(70, 110, size.width - 60, size.height - 70);
  final cell = math.min(area.width / (g.cols - 1), area.height / (g.rows - 1));
  return (origin: Offset(area.center.dx - cell * (g.cols - 1) / 2, area.center.dy - cell * (g.rows - 1) / 2), cell: cell);
}

void paintContours(Canvas canvas, ContourGrid g, Size size, Color accent) {
  _text(canvas, g.title, const Offset(24, 36), size: 28, bold: true, color: accent, maxWidth: size.width - 48);
  _text(
    canvas,
    'Spot levels on a ${_x(g.spacing)} m grid · contour interval ${_x(g.interval)} m · levels ${civilNum(g.minLevel)} to ${civilNum(g.maxLevel)} m',
    const Offset(24, 68),
    size: 14,
    color: _muted,
    maxWidth: size.width - 48,
  );
  final f = contourFrame(g, size);
  Offset p(double x, double y) => f.origin + Offset(x * f.cell, y * f.cell);
  for (var c = 0; c < g.cols; c++) {
    canvas.drawLine(p(c.toDouble(), 0), p(c.toDouble(), g.rows - 1.0), _stroke(_grid, 1));
  }
  for (var r = 0; r < g.rows; r++) {
    canvas.drawLine(p(0, r.toDouble()), p(g.cols - 1.0, r.toDouble()), _stroke(_grid, 1));
  }
  const brown = Color(0xFF8D5524);
  final values = g.contourValues;
  for (final (i, v) in values.indexed) {
    final index = ((v / g.interval).round() % 5) == 0;
    final segs = g.segments(v);
    final paint = _stroke(brown, index ? 3 : 1.8);
    for (final (a, b) in segs) {
      canvas.drawLine(p(a.$1, a.$2), p(b.$1, b.$2), paint);
    }
    if (segs.isNotEmpty) {
      final s = segs[(segs.length * (0.3 + 0.4 * (i % 2))).floor().clamp(0, segs.length - 1)];
      final mid = (p(s.$1.$1, s.$1.$2) + p(s.$2.$1, s.$2.$2)) / 2;
      final label = civilNum(v, v == v.roundToDouble() ? 0 : 1);
      final rect = Rect.fromCenter(center: mid, width: 12 + label.length * 8.0, height: 18);
      canvas.drawRect(rect, Paint()..color = Colors.white);
      _text(canvas, label, mid, size: 12, bold: index, color: brown, align: TextAlign.center);
    }
  }
  final spot = math.min(13.0, f.cell * 0.28);
  for (var r = 0; r < g.rows; r++) {
    for (var c = 0; c < g.cols; c++) {
      final at = p(c.toDouble(), r.toDouble());
      canvas.drawCircle(at, 3, Paint()..color = _ink);
      if (spot >= 8) _text(canvas, civilNum(g.at(c, r), 1), at + const Offset(5, -9), size: spot, color: _muted);
    }
  }
  _text(canvas, 'Contours by straight-line interpolation between spot levels; every fifth contour drawn thicker.', Offset(24, size.height - 24), size: 12, color: _muted, maxWidth: size.width - 48);
}
