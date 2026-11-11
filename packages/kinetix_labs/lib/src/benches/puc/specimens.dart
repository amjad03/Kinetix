import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import 'kit.dart';

/// One slide or specimen to study: what it is, where it belongs, how to
/// recognise it, and how it looks (drawn in a circle of radius r at c).
class Specimen {
  final String id;
  final String Function() name, group, features;

  /// A slide under the microscope (true) or a museum specimen / chart (false).
  final bool slide;
  final Color light;
  final void Function(Canvas canvas, Offset c, double r, bool labels) draw;
  const Specimen(this.id, this.name, this.group, this.features, this.draw, {this.slide = true, this.light = const Color(0xFFF6F1E4)});
}

Offset _p(Offset c, double r, double x, double y) => c + Offset(x, y) * r;

/// Labels collected while a specimen draws (drawn afterwards, outside the
/// clipped view, so they can reach past its edge).
final _labels = <(Offset, Offset, String, double)>[];

void _call(Canvas canvas, bool on, Offset c, double r, double x, double y, double lx, double ly, String text) {
  if (on) _labels.add((_p(c, r, x, y), _p(c, r, lx, ly), text, math.max(13, r * 0.055)));
}

Path _blob(Offset c, double rx, double ry, int seed, {double rough = 0.25, int n = 14}) {
  final path = Path();
  final pts = <Offset>[];
  for (var i = 0; i < n; i++) {
    final a = i / n * 2 * math.pi;
    final k = 1 + (hash01(seed, i) - 0.5) * 2 * rough;
    pts.add(c + Offset(math.cos(a) * rx * k, math.sin(a) * ry * k));
  }
  path.moveTo((pts[0].dx + pts[1].dx) / 2, (pts[0].dy + pts[1].dy) / 2);
  for (var i = 1; i <= n; i++) {
    final a = pts[i % n], b = pts[(i + 1) % n];
    path.quadraticBezierTo(a.dx, a.dy, (a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
  }
  return path..close();
}

Paint _s(Color c, double w) => stroke(c, w);

// ----------------------------------------------------------------- plants

void _bacteria(Canvas canvas, Offset c, double r, bool on) {
  final ink = const Color(0xFF5E2C83);
  for (var i = 0; i < 46; i++) {
    final pt = _p(c, r, hash01(i, 1) * 1.8 - 0.9, hash01(i, 2) * 1.8 - 0.9);
    if ((pt - c).distance > r * 0.92) continue;
    if (i % 3 == 0) {
      for (var k = 0; k < 4; k++) {
        canvas.drawCircle(pt + Offset(k * r * 0.035, (k.isOdd ? 1 : 0) * r * 0.02), r * 0.018, fill(ink));
      }
    } else {
      canvas.save();
      canvas.translate(pt.dx, pt.dy);
      canvas.rotate(hash01(i, 3) * math.pi);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: r * 0.11, height: r * 0.035), Radius.circular(r * 0.02)), fill(ink));
      canvas.restore();
    }
  }
  _call(canvas, on, c, r, -0.12, -0.3, -0.5, -0.75, tr('Bacillus (rod)'));
  _call(canvas, on, c, r, 0.45, 0.2, 0.6, 0.72, tr('Coccus (sphere)'));
}

void _spirogyra(Canvas canvas, Offset c, double r, bool on) {
  for (final dy in [-0.42, 0.38]) {
    final top = c.dy + dy * r - r * 0.13, bot = c.dy + dy * r + r * 0.13;
    for (var k = 0; k < 6; k++) {
      final x0 = c.dx - r + k * r * 0.36 + (dy > 0 ? r * 0.15 : 0);
      final cell = Rect.fromLTRB(x0, top, x0 + r * 0.36, bot);
      canvas.drawRect(cell, fill(const Color(0x33A5D6A7)));
      canvas.drawRect(cell, _s(const Color(0xFF2E5E33), 1.6));
      final path = Path();
      for (var i = 0; i <= 30; i++) {
        final f = i / 30;
        final y = cell.center.dy + math.sin(f * 4 * math.pi) * cell.height * 0.36;
        final pt = Offset(cell.left + f * cell.width, y);
        i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
      }
      canvas.drawPath(path, _s(const Color(0xFF2E7D32), r * 0.03));
      for (var i = 1; i < 4; i++) {
        canvas.drawCircle(Offset(cell.left + cell.width * i / 4, cell.center.dy + math.sin(i / 4 * 4 * math.pi) * cell.height * 0.36), r * 0.012, fill(const Color(0xFF1B5E20)));
      }
      canvas.drawCircle(cell.center, r * 0.025, fill(const Color(0xFF795548)));
    }
  }
  _call(canvas, on, c, r, -0.62, -0.42, -0.62, -0.82, tr('Spiral chloroplast'));
  _call(canvas, on, c, r, -0.46, -0.42, -0.1, -0.72, tr('Nucleus'));
  _call(canvas, on, c, r, 0.33, 0.25, 0.6, -0.05, tr('Cell wall'));
  _call(canvas, on, c, r, 0.08, 0.38, 0.3, 0.78, tr('Pyrenoid'));
}

void _rhizopus(Canvas canvas, Offset c, double r, bool on) {
  final hy = _s(const Color(0xFF8D8D8D), r * 0.018);
  canvas.drawLine(_p(c, r, -0.95, 0.5), _p(c, r, 0.95, 0.45), hy);
  for (final x in [-0.5, 0.0, 0.55]) {
    final base = _p(c, r, x, 0.48);
    for (var k = -1; k <= 1; k++) {
      canvas.drawLine(base, base + Offset(k * r * 0.08, r * 0.18), _s(const Color(0xFF8D8D8D), r * 0.01));
    }
    for (final (dx, hgt) in [(-0.08, 0.7), (0.06, 0.85), (0.16, 0.6)]) {
      final top = _p(c, r, x + dx, 0.48 - hgt);
      canvas.drawLine(base, top, _s(const Color(0xFF9E9E9E), r * 0.014));
      canvas.drawCircle(top, r * 0.075, fill(const Color(0xFF263238)));
      canvas.drawCircle(top + Offset(-r * 0.02, -r * 0.02), r * 0.02, fill(const Color(0x55FFFFFF)));
    }
  }
  _call(canvas, on, c, r, -0.58, -0.22, -0.85, -0.5, tr('Sporangium'));
  _call(canvas, on, c, r, 0.06, 0.05, 0.45, -0.7, tr('Sporangiophore'));
  _call(canvas, on, c, r, 0.3, 0.46, 0.55, 0.78, tr('Stolon (hypha)'));
  _call(canvas, on, c, r, -0.5, 0.62, -0.75, 0.8, tr('Rhizoids'));
}

void _yeast(Canvas canvas, Offset c, double r, bool on) {
  for (var i = 0; i < 16; i++) {
    final pt = _p(c, r, hash01(i, 7) * 1.5 - 0.75, hash01(i, 8) * 1.5 - 0.75);
    final a = hash01(i, 9) * math.pi;
    canvas.save();
    canvas.translate(pt.dx, pt.dy);
    canvas.rotate(a);
    final cell = Rect.fromCenter(center: Offset.zero, width: r * 0.16, height: r * 0.12);
    canvas.drawOval(cell, fill(const Color(0xFFF3E5C8)));
    canvas.drawOval(cell, _s(const Color(0xFF8D6E63), 1.4));
    canvas.drawCircle(Offset(r * 0.02, 0), r * 0.03, fill(const Color(0x5578B7E0)));
    if (i % 3 == 0) {
      final bud = Rect.fromCenter(center: Offset(r * 0.1, -r * 0.04), width: r * 0.07, height: r * 0.06);
      canvas.drawOval(bud, fill(const Color(0xFFF3E5C8)));
      canvas.drawOval(bud, _s(const Color(0xFF8D6E63), 1.2));
    }
    canvas.restore();
  }
  _call(canvas, on, c, r, 0.0, 0.0, 0.5, -0.8, tr('Budding cell'));
  _call(canvas, on, c, r, -0.3, 0.3, -0.7, 0.75, tr('Vacuole'));
}

void _mushroom(Canvas canvas, Offset c, double r, bool on) {
  final cap = Path()
    ..moveTo(c.dx - r * 0.75, c.dy - r * 0.15)
    ..quadraticBezierTo(c.dx, c.dy - r * 1.05, c.dx + r * 0.75, c.dy - r * 0.15)
    ..quadraticBezierTo(c.dx, c.dy - r * 0.25, c.dx - r * 0.75, c.dy - r * 0.15)
    ..close();
  final stalk = Rect.fromLTRB(c.dx - r * 0.1, c.dy - r * 0.2, c.dx + r * 0.1, c.dy + r * 0.75);
  canvas.drawRRect(RRect.fromRectAndRadius(stalk, Radius.circular(r * 0.05)), Kit.cylinder(stalk, const Color(0xFFEDE3D1)));
  canvas.drawPath(cap, Paint()..shader = RadialGradient(center: const Alignment(-0.3, -0.6), colors: const [Color(0xFFE8D6B9), Color(0xFFB58A5C)]).createShader(cap.getBounds()));
  for (var i = -8; i <= 8; i++) {
    canvas.drawLine(Offset(c.dx + i * r * 0.08, c.dy - r * 0.18 - (8 - i.abs()) * r * 0.003), Offset(c.dx + i * r * 0.03, c.dy - r * 0.2), _s(const Color(0xFF7B5E43), 1));
  }
  canvas.drawOval(Rect.fromCenter(center: Offset(c.dx, c.dy + r * 0.05), width: r * 0.3, height: r * 0.08), fill(const Color(0xFFD7CCB9)));
  canvas.drawOval(Rect.fromCenter(center: Offset(c.dx, c.dy + r * 0.78), width: r * 0.6, height: r * 0.12), fill(const Color(0x33795548)));
  _call(canvas, on, c, r, 0.3, -0.55, 0.7, -0.8, tr('Pileus (cap)'));
  _call(canvas, on, c, r, -0.4, -0.2, -0.85, -0.45, tr('Gills'));
  _call(canvas, on, c, r, 0.12, 0.05, 0.6, 0.15, tr('Annulus'));
  _call(canvas, on, c, r, 0.0, 0.5, -0.6, 0.6, tr('Stipe (stalk)'));
}

void _funaria(Canvas canvas, Offset c, double r, bool on) {
  final base = _p(c, r, 0, 0.85);
  for (var k = -2; k <= 2; k++) {
    canvas.drawLine(base, base + Offset(k * r * 0.07, r * 0.1), _s(const Color(0xFF8D6E63), 1.2));
  }
  final stemTop = _p(c, r, 0, 0.3);
  canvas.drawLine(base, stemTop, _s(const Color(0xFF558B2F), r * 0.03));
  for (var i = 0; i < 14; i++) {
    final y = base.dy - (base.dy - stemTop.dy) * i / 14;
    final side = i.isEven ? 1.0 : -1.0;
    final leaf = Path()
      ..moveTo(c.dx, y)
      ..quadraticBezierTo(c.dx + side * r * 0.16, y - r * 0.06, c.dx + side * r * (0.22 - i * 0.008), y - r * 0.12)
      ..quadraticBezierTo(c.dx + side * r * 0.06, y - r * 0.04, c.dx, y);
    canvas.drawPath(leaf, fill(const Color(0xFF7CB342)));
  }
  final seta = Path()
    ..moveTo(stemTop.dx, stemTop.dy)
    ..quadraticBezierTo(c.dx + r * 0.1, c.dy - r * 0.4, c.dx + r * 0.3, c.dy - r * 0.7);
  canvas.drawPath(seta, _s(const Color(0xFFA1673B), r * 0.02));
  canvas.save();
  canvas.translate(c.dx + r * 0.36, c.dy - r * 0.74);
  canvas.rotate(0.9);
  canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: r * 0.12, height: r * 0.24), fill(const Color(0xFF8D6E3F)));
  canvas.drawOval(Rect.fromCenter(center: Offset(0, -r * 0.13), width: r * 0.08, height: r * 0.05), fill(const Color(0xFF5D4037)));
  canvas.restore();
  _call(canvas, on, c, r, 0.38, -0.76, 0.7, -0.6, tr('Capsule (sporophyte)'));
  _call(canvas, on, c, r, 0.12, -0.35, 0.55, -0.2, tr('Seta'));
  _call(canvas, on, c, r, -0.12, 0.55, -0.6, 0.45, tr('Leafy gametophyte'));
  _call(canvas, on, c, r, 0.04, 0.9, 0.5, 0.8, tr('Rhizoids'));
}

void _fern(Canvas canvas, Offset c, double r, bool on) {
  final rach0 = _p(c, r, -0.1, 0.9), rach1 = _p(c, r, 0.15, -0.85);
  canvas.drawLine(rach0, rach1, _s(const Color(0xFF6D4C41), r * 0.025));
  for (var i = 1; i < 16; i++) {
    final f = i / 16;
    final at = Offset.lerp(rach0, rach1, f)!;
    final len = r * 0.55 * math.sin(math.pi * (0.2 + f * 0.8)) + r * 0.08;
    for (final side in [-1.0, 1.0]) {
      final tip = at + Offset(side * len, -len * 0.25);
      final leaf = Path()
        ..moveTo(at.dx, at.dy)
        ..quadraticBezierTo((at.dx + tip.dx) / 2, at.dy - r * 0.06, tip.dx, tip.dy)
        ..quadraticBezierTo((at.dx + tip.dx) / 2, at.dy + r * 0.03, at.dx, at.dy);
      canvas.drawPath(leaf, fill(const Color(0xFF558B2F)));
      if (i > 4 && i < 13) {
        for (var k = 1; k < 4; k++) {
          canvas.drawCircle(Offset.lerp(at, tip, k / 4.5)! + const Offset(0, 3), r * 0.012, fill(const Color(0xFF8D5524)));
        }
      }
    }
  }
  canvas.drawLine(rach0, rach0 + Offset(-r * 0.4, r * 0.04), _s(const Color(0xFF5D4037), r * 0.05));
  _call(canvas, on, c, r, 0.4, -0.05, 0.75, -0.45, tr('Pinna (leaflet)'));
  _call(canvas, on, c, r, 0.24, 0.12, 0.7, 0.35, tr('Sori (spore clusters)'));
  _call(canvas, on, c, r, 0.0, -0.5, -0.6, -0.7, tr('Rachis'));
  _call(canvas, on, c, r, -0.35, 0.93, -0.75, 0.7, tr('Rhizome'));
}

void _pinus(Canvas canvas, Offset c, double r, bool on) {
  canvas.drawLine(_p(c, r, -0.9, 0.2), _p(c, r, 0.6, -0.3), _s(const Color(0xFF6D4C41), r * 0.05));
  for (var i = 0; i < 9; i++) {
    final at = Offset.lerp(_p(c, r, -0.8, 0.17), _p(c, r, 0.5, -0.27), i / 8)!;
    for (final a in [-1.9, -1.55]) {
      canvas.drawLine(at, at + Offset(math.cos(a + i * 0.05), math.sin(a + i * 0.05)) * r * 0.45, _s(const Color(0xFF33691E), r * 0.012));
    }
  }
  final cone = _p(c, r, 0.2, 0.45);
  canvas.save();
  canvas.translate(cone.dx, cone.dy);
  canvas.rotate(0.2);
  for (var j = 0; j < 7; j++) {
    for (var k = -2; k <= 2; k++) {
      final sc = Offset(k * r * 0.07 * (1 - j * 0.08), -r * 0.3 + j * r * 0.09);
      canvas.drawOval(Rect.fromCenter(center: sc, width: r * 0.1, height: r * 0.08), fill(const Color(0xFF8D6E3F)));
      canvas.drawOval(Rect.fromCenter(center: sc, width: r * 0.1, height: r * 0.08), _s(const Color(0xFF4E342E), 1));
    }
  }
  canvas.restore();
  _call(canvas, on, c, r, -0.3, -0.35, -0.75, -0.6, tr('Needle leaves in pairs'));
  _call(canvas, on, c, r, 0.3, 0.45, 0.7, 0.6, tr('Female cone'));
  _call(canvas, on, c, r, -0.6, 0.13, -0.8, 0.5, tr('Dwarf shoot'));
}

// ---------------------------------------------------------------- animals

void _amoeba(Canvas canvas, Offset c, double r, bool on) {
  final body = _blob(c, r * 0.62, r * 0.48, 4, rough: 0.38, n: 12);
  canvas.drawPath(body, fill(const Color(0x66C5CAE9)));
  canvas.drawPath(body, _s(const Color(0xFF5C6BC0), 2));
  canvas.drawPath(_blob(c, r * 0.5, r * 0.38, 4, rough: 0.34, n: 12), fill(const Color(0x339FA8DA)));
  canvas.drawOval(Rect.fromCenter(center: _p(c, r, -0.1, 0.05), width: r * 0.2, height: r * 0.16), fill(const Color(0xFF7E57C2)));
  canvas.drawCircle(_p(c, r, 0.25, -0.12), r * 0.08, _s(const Color(0xFF42A5F5), 2));
  for (final (x, y) in [(0.15, 0.2), (-0.3, -0.15), (0.0, -0.25)]) {
    canvas.drawCircle(_p(c, r, x, y), r * 0.045, fill(const Color(0x99A1887F)));
  }
  _call(canvas, on, c, r, -0.1, 0.05, -0.65, 0.7, tr('Nucleus'));
  _call(canvas, on, c, r, 0.25, -0.12, 0.65, -0.72, tr('Contractile vacuole'));
  _call(canvas, on, c, r, 0.15, 0.2, 0.65, 0.65, tr('Food vacuole'));
  _call(canvas, on, c, r, -0.62, -0.1, -0.85, -0.6, tr('Pseudopodium'));
}

void _paramecium(Canvas canvas, Offset c, double r, bool on) {
  canvas.save();
  canvas.translate(c.dx, c.dy);
  canvas.rotate(-0.25);
  final body = Path()
    ..moveTo(-r * 0.75, 0)
    ..quadraticBezierTo(-r * 0.7, -r * 0.32, 0, -r * 0.3)
    ..quadraticBezierTo(r * 0.75, -r * 0.28, r * 0.75, 0)
    ..quadraticBezierTo(r * 0.7, r * 0.3, r * 0.1, r * 0.22)
    ..quadraticBezierTo(-r * 0.1, r * 0.12, -r * 0.3, r * 0.26)
    ..quadraticBezierTo(-r * 0.72, r * 0.3, -r * 0.75, 0);
  for (var i = 0; i < 70; i++) {
    final m = body.computeMetrics().first;
    final tan = m.getTangentForOffset(m.length * i / 70)!;
    final n = Offset(-tan.vector.dy, tan.vector.dx);
    canvas.drawLine(tan.position, tan.position - n * r * 0.05, _s(const Color(0xFF9575CD), 1));
  }
  canvas.drawPath(body, fill(const Color(0x66D1C4E9)));
  canvas.drawPath(body, _s(const Color(0xFF673AB7), 2));
  canvas.drawOval(Rect.fromCenter(center: const Offset(0, -0.02) * r, width: r * 0.32, height: r * 0.16), fill(const Color(0xFF7E57C2)));
  canvas.drawCircle(Offset(r * 0.2, r * 0.04), r * 0.04, fill(const Color(0xFF4527A0)));
  for (final x in [-0.5, 0.5]) {
    canvas.drawCircle(Offset(x * r, -r * 0.08), r * 0.07, _s(const Color(0xFF42A5F5), 2));
  }
  canvas.restore();
  _call(canvas, on, c, r, 0.0, -0.02, -0.25, -0.75, tr('Macronucleus'));
  _call(canvas, on, c, r, 0.48, -0.2, 0.75, -0.6, tr('Contractile vacuole'));
  _call(canvas, on, c, r, -0.05, 0.18, 0.2, 0.72, tr('Oral groove'));
  _call(canvas, on, c, r, -0.72, 0.05, -0.8, 0.6, tr('Cilia'));
}

void _hydra(Canvas canvas, Offset c, double r, bool on) {
  final foot = _p(c, r, 0, 0.85), top = _p(c, r, 0, -0.35);
  final body = Path()
    ..moveTo(foot.dx - r * 0.07, foot.dy)
    ..quadraticBezierTo(c.dx - r * 0.16, c.dy, top.dx - r * 0.1, top.dy)
    ..lineTo(top.dx + r * 0.1, top.dy)
    ..quadraticBezierTo(c.dx + r * 0.16, c.dy, foot.dx + r * 0.07, foot.dy)
    ..close();
  canvas.drawPath(body, fill(const Color(0xFF9CCC65)));
  canvas.drawPath(body, _s(const Color(0xFF558B2F), 1.6));
  for (var i = 0; i < 6; i++) {
    final a = -math.pi / 2 + (i - 2.5) * 0.45;
    final t = Path()
      ..moveTo(top.dx, top.dy)
      ..quadraticBezierTo(top.dx + math.cos(a) * r * 0.3, top.dy + math.sin(a) * r * 0.25 - r * 0.1, top.dx + math.cos(a) * r * 0.62, top.dy + math.sin(a) * r * 0.5);
    canvas.drawPath(t, _s(const Color(0xFF7CB342), r * 0.025));
  }
  final bud = Path()
    ..moveTo(c.dx + r * 0.12, c.dy + r * 0.25)
    ..quadraticBezierTo(c.dx + r * 0.4, c.dy + r * 0.15, c.dx + r * 0.45, c.dy - r * 0.02)
    ..lineTo(c.dx + r * 0.13, c.dy + r * 0.1);
  canvas.drawPath(bud, fill(const Color(0xFF9CCC65)));
  _call(canvas, on, c, r, 0.0, -0.36, 0.55, -0.85, tr('Hypostome'));
  _call(canvas, on, c, r, -0.35, -0.6, -0.75, -0.75, tr('Tentacles'));
  _call(canvas, on, c, r, 0.4, 0.0, 0.75, 0.2, tr('Bud'));
  _call(canvas, on, c, r, 0.0, 0.84, -0.55, 0.8, tr('Basal disc'));
}

void _worm(Canvas canvas, Offset c, double r, Color colour, {bool rings = false, bool clitellum = false, bool hook = false, double y = 0}) {
  final path = Path();
  for (var i = 0; i <= 40; i++) {
    final f = i / 40;
    final pt = _p(c, r, -0.85 + f * 1.7, y + math.sin(f * 2.4 * math.pi) * 0.12 + (hook && f > 0.9 ? (f - 0.9) * 3 : 0));
    i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
  }
  canvas.drawPath(path, stroke(Color.lerp(colour, Colors.black, 0.35)!, r * 0.105));
  canvas.drawPath(path, stroke(colour, r * 0.085));
  if (rings || clitellum) {
    final m = path.computeMetrics().first;
    for (var i = 1; i < 60; i++) {
      final tan = m.getTangentForOffset(m.length * i / 60)!;
      final n = Offset(-tan.vector.dy, tan.vector.dx);
      if (clitellum && i >= 10 && i <= 13) {
        canvas.drawCircle(tan.position, r * 0.05, fill(const Color(0xFFB0525A)));
      } else if (rings) {
        canvas.drawLine(tan.position - n * r * 0.04, tan.position + n * r * 0.04, _s(const Color(0x66000000), 1));
      }
    }
  }
}

void _liverfluke(Canvas canvas, Offset c, double r, bool on) {
  final body = Path()
    ..moveTo(c.dx, c.dy - r * 0.85)
    ..quadraticBezierTo(c.dx + r * 0.2, c.dy - r * 0.7, c.dx + r * 0.38, c.dy - r * 0.25)
    ..quadraticBezierTo(c.dx + r * 0.42, c.dy + r * 0.5, c.dx, c.dy + r * 0.85)
    ..quadraticBezierTo(c.dx - r * 0.42, c.dy + r * 0.5, c.dx - r * 0.38, c.dy - r * 0.25)
    ..quadraticBezierTo(c.dx - r * 0.2, c.dy - r * 0.7, c.dx, c.dy - r * 0.85);
  canvas.drawPath(body, fill(const Color(0xFFE0BFA0)));
  canvas.drawPath(body, _s(const Color(0xFF8D6E63), 1.8));
  for (var i = 0; i < 18; i++) {
    final y = c.dy - r * 0.2 + i * r * 0.05;
    canvas.drawLine(Offset(c.dx - r * 0.3, y), Offset(c.dx + r * 0.3, y + r * 0.02), _s(const Color(0x55795548), 1));
  }
  canvas.drawCircle(_p(c, r, 0, -0.75), r * 0.05, _s(const Color(0xFF5D4037), 2));
  canvas.drawCircle(_p(c, r, 0, -0.45), r * 0.07, _s(const Color(0xFF5D4037), 2.4));
  _call(canvas, on, c, r, 0, -0.75, 0.5, -0.85, tr('Oral sucker'));
  _call(canvas, on, c, r, 0.0, -0.45, 0.6, -0.45, tr('Ventral sucker'));
  _call(canvas, on, c, r, -0.25, 0.3, -0.7, 0.55, tr('Flat, leaf-like body'));
}

void _ascaris(Canvas canvas, Offset c, double r, bool on) {
  _worm(canvas, c, r, const Color(0xFFF1D9C9), y: -0.32);
  _worm(canvas, c + Offset(0, r * 0.05), r * 0.82, const Color(0xFFEBD0BE), hook: true, y: 0.55);
  label(canvas, '♀', _p(c, r, -0.92, -0.32), size: r * 0.12, bold: true, color: LabInk.muted);
  label(canvas, '♂', _p(c, r, -0.82, 0.5), size: r * 0.12, bold: true, color: LabInk.muted);
  _call(canvas, on, c, r, 0.0, -0.32, 0.25, -0.8, tr('Female: larger, straight tail'));
  _call(canvas, on, c, r, 0.68, 0.62, 0.35, 0.88, tr('Male: curved tail'));
}

void _earthworm(Canvas canvas, Offset c, double r, bool on) {
  _worm(canvas, c, r, const Color(0xFFC98579), rings: true, clitellum: true);
  _call(canvas, on, c, r, -0.48, 0.0, -0.4, -0.6, tr('Clitellum'));
  _call(canvas, on, c, r, 0.4, -0.05, 0.5, 0.6, tr('Segments (metameres)'));
  _call(canvas, on, c, r, -0.85, 0.0, -0.8, 0.5, tr('Prostomium (head end)'));
}

void _cockroach(Canvas canvas, Offset c, double r, bool on) {
  final leg = _s(const Color(0xFF4E342E), r * 0.018);
  for (final y in [-0.15, 0.05, 0.25]) {
    for (final s in [-1.0, 1.0]) {
      final a = _p(c, r, s * 0.15, y);
      final k = _p(c, r, s * 0.45, y - 0.12);
      canvas.drawLine(a, k, leg);
      canvas.drawLine(k, _p(c, r, s * 0.6, y + 0.25), leg);
    }
  }
  final body = Rect.fromCenter(center: _p(c, r, 0, 0.1), width: r * 0.42, height: r * 1.05);
  canvas.drawOval(body, fill(const Color(0xFF8D4F2A)));
  for (final s in [-1.0, 1.0]) {
    final wing = Path()
      ..moveTo(c.dx, c.dy - r * 0.32)
      ..quadraticBezierTo(c.dx + s * r * 0.3, c.dy - r * 0.1, c.dx + s * r * 0.05, c.dy + r * 0.68)
      ..lineTo(c.dx, c.dy + r * 0.6)
      ..close();
    canvas.drawPath(wing, fill(const Color(0xCCA0612F)));
    canvas.drawPath(wing, _s(const Color(0xFF5D3A1A), 1));
  }
  canvas.drawOval(Rect.fromCenter(center: _p(c, r, 0, -0.42), width: r * 0.34, height: r * 0.2), fill(const Color(0xFF6D3B1E)));
  canvas.drawOval(Rect.fromCenter(center: _p(c, r, 0, -0.56), width: r * 0.18, height: r * 0.14), fill(const Color(0xFF4E2A15)));
  for (final s in [-1.0, 1.0]) {
    final ant = Path()
      ..moveTo(c.dx + s * r * 0.04, c.dy - r * 0.62)
      ..quadraticBezierTo(c.dx + s * r * 0.3, c.dy - r * 0.95, c.dx + s * r * 0.75, c.dy - r * 0.8);
    canvas.drawPath(ant, _s(const Color(0xFF4E342E), 1.4));
  }
  _call(canvas, on, c, r, 0.4, -0.88, 0.75, -0.55, tr('Antenna'));
  _call(canvas, on, c, r, 0.0, -0.42, -0.75, -0.6, tr('Pronotum'));
  _call(canvas, on, c, r, 0.12, 0.3, 0.75, 0.2, tr('Tegmina (fore wings)'));
  _call(canvas, on, c, r, -0.55, 0.28, -0.8, 0.65, tr('Jointed legs'));
}

void _starfish(Canvas canvas, Offset c, double r, bool on) {
  final path = Path();
  for (var i = 0; i < 10; i++) {
    final a = -math.pi / 2 + i * math.pi / 5;
    final rr = i.isEven ? r * 0.85 : r * 0.3;
    final pt = c + Offset(math.cos(a), math.sin(a)) * rr;
    i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
  }
  path.close();
  canvas.drawPath(path, Paint()..shader = RadialGradient(colors: const [Color(0xFFFFB74D), Color(0xFFE65100)]).createShader(Rect.fromCircle(center: c, radius: r)));
  canvas.drawPath(path, _s(const Color(0xFFBF360C), 1.6));
  for (var i = 0; i < 5; i++) {
    final a = -math.pi / 2 + i * 2 * math.pi / 5;
    for (var k = 1; k < 7; k++) {
      canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * (r * 0.11 * k), r * 0.018, fill(const Color(0xFFFFE0B2)));
    }
  }
  canvas.drawCircle(c, r * 0.05, fill(const Color(0xFFFFF3E0)));
  _call(canvas, on, c, r, 0.0, -0.6, 0.55, -0.85, tr('Arm (one of five)'));
  _call(canvas, on, c, r, 0.0, 0.0, -0.6, 0.85, tr('Central disc'));
  _call(canvas, on, c, r, 0.4, 0.18, 0.75, 0.55, tr('Spiny skin'));
}

void _fish(Canvas canvas, Offset c, double r, bool on) {
  final body = Path()
    ..moveTo(c.dx - r * 0.8, c.dy)
    ..quadraticBezierTo(c.dx - r * 0.3, c.dy - r * 0.42, c.dx + r * 0.45, c.dy - r * 0.08)
    ..lineTo(c.dx + r * 0.85, c.dy - r * 0.35)
    ..lineTo(c.dx + r * 0.75, c.dy)
    ..lineTo(c.dx + r * 0.85, c.dy + r * 0.35)
    ..lineTo(c.dx + r * 0.45, c.dy + r * 0.08)
    ..quadraticBezierTo(c.dx - r * 0.3, c.dy + r * 0.38, c.dx - r * 0.8, c.dy)
    ..close();
  canvas.drawPath(body, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: const [Color(0xFF607D8B), Color(0xFFB0BEC5), Color(0xFFECEFF1)]).createShader(body.getBounds()));
  canvas.drawPath(body, _s(const Color(0xFF37474F), 1.6));
  for (var i = 0; i < 9; i++) {
    for (var j = -2; j <= 2; j++) {
      canvas.drawArc(Rect.fromCircle(center: _p(c, r, -0.35 + i * 0.08, j * 0.07), radius: r * 0.04), -math.pi / 2, math.pi, false, _s(const Color(0x55263238), 1));
    }
  }
  canvas.drawPath(Path()..moveTo(c.dx - r * 0.1, c.dy - r * 0.3)..lineTo(c.dx + r * 0.05, c.dy - r * 0.48)..lineTo(c.dx + r * 0.25, c.dy - r * 0.17), fill(const Color(0xFF546E7A)));
  canvas.drawArc(Rect.fromCircle(center: _p(c, r, -0.48, 0), radius: r * 0.16), -1.0, 2.0, false, _s(const Color(0xFF37474F), 1.6));
  canvas.drawCircle(_p(c, r, -0.65, -0.06), r * 0.035, fill(LabInk.ink));
  _call(canvas, on, c, r, -0.38, 0.05, -0.6, 0.6, tr('Operculum (gill cover)'));
  _call(canvas, on, c, r, 0.05, -0.42, -0.2, -0.75, tr('Dorsal fin'));
  _call(canvas, on, c, r, 0.82, 0.25, 0.7, 0.65, tr('Caudal fin'));
  _call(canvas, on, c, r, 0.0, 0.1, 0.4, 0.5, tr('Cycloid scales'));
}

// --------------------------------------------------------------- anatomy

void _tsStem(Canvas canvas, Offset c, double r, bool on, {required bool monocot}) {
  canvas.drawCircle(c, r * 0.9, fill(const Color(0xFFFFF8E8)));
  canvas.drawCircle(c, r * 0.9, _s(const Color(0xFFB71C1C), r * 0.02));
  if (!monocot) {
    canvas.drawCircle(c, r * 0.84, _s(const Color(0xFF8E2424), r * 0.05));
    canvas.drawCircle(c, r * 0.74, _s(const Color(0x448E2424), r * 0.1));
  } else {
    canvas.drawCircle(c, r * 0.83, _s(const Color(0xFF8E2424), r * 0.04));
  }
  // Ground tissue cells.
  for (var i = 0; i < 160; i++) {
    final a = hash01(i, 11) * 2 * math.pi, d = math.sqrt(hash01(i, 12)) * r * 0.78;
    canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * d, r * 0.035, _s(const Color(0x33B71C1C), 1));
  }
  void bundle(Offset at, double s, double rot) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.rotate(rot);
    if (monocot) {
      canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: s * 1.2, height: s * 1.4), fill(const Color(0xFFF8BBD0)));
      canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: s * 1.2, height: s * 1.4), _s(const Color(0xFFAD1457), 1.6));
      for (final (x, y, rr) in [(-0.28, 0.15, 0.17), (0.28, 0.15, 0.17), (0.0, 0.3, 0.12)]) {
        canvas.drawCircle(Offset(x * s, y * s), rr * s, fill(const Color(0xFFC62828)));
      }
      canvas.drawOval(Rect.fromCenter(center: Offset(0, -s * 0.3), width: s * 0.5, height: s * 0.3), fill(const Color(0xFF81C784)));
    } else {
      final wedge = Path()
        ..moveTo(-s * 0.35, -s * 0.5)
        ..lineTo(s * 0.35, -s * 0.5)
        ..lineTo(s * 0.2, s * 0.55)
        ..lineTo(-s * 0.2, s * 0.55)
        ..close();
      canvas.drawPath(wedge, fill(const Color(0xFFF8BBD0)));
      canvas.drawRect(Rect.fromLTRB(-s * 0.3, -s * 0.45, s * 0.3, -s * 0.15), fill(const Color(0xFF81C784)));
      canvas.drawLine(Offset(-s * 0.32, -s * 0.08), Offset(s * 0.32, -s * 0.08), _s(const Color(0xFF6A1B9A), 2));
      for (var k = 0; k < 4; k++) {
        canvas.drawCircle(Offset((k - 1.5) * s * 0.12, s * (0.08 + 0.1 * (k % 2))), s * 0.07, fill(const Color(0xFFC62828)));
      }
      canvas.drawPath(Path()..moveTo(-s * 0.3, -s * 0.5)..lineTo(s * 0.3, -s * 0.5)..lineTo(0, -s * 0.72)..close(), fill(const Color(0xFFE57373)));
    }
    canvas.restore();
  }

  if (monocot) {
    for (var i = 0; i < 26; i++) {
      final a = hash01(i, 21) * 2 * math.pi, d = (0.15 + 0.62 * math.sqrt(hash01(i, 22))) * r;
      bundle(c + Offset(math.cos(a), math.sin(a)) * d, r * (0.16 - d / r * 0.07), a + math.pi / 2);
    }
  } else {
    for (var i = 0; i < 10; i++) {
      final a = i / 10 * 2 * math.pi;
      bundle(c + Offset(math.cos(a), math.sin(a)) * r * 0.55, r * 0.17, a + math.pi / 2);
    }
  }
  _call(canvas, on, c, r, 0.0, -0.9, 0.5, -0.95, tr('Epidermis'));
  if (monocot) {
    _call(canvas, on, c, r, 0.62, 0.2, 0.95, 0.45, tr('Scattered vascular bundles'));
    _call(canvas, on, c, r, 0.0, 0.0, -0.75, 0.9, tr('Ground tissue (no pith)'));
    _call(canvas, on, c, r, -0.83, 0.0, -0.98, -0.4, tr('Sclerenchymatous hypodermis'));
  } else {
    _call(canvas, on, c, r, 0.55, 0.0, 0.98, 0.35, tr('Vascular bundles in a ring'));
    _call(canvas, on, c, r, 0.0, 0.0, -0.75, 0.9, tr('Pith'));
    _call(canvas, on, c, r, -0.74, -0.2, -0.98, -0.5, tr('Cortex'));
  }
}

void _tsRoot(Canvas canvas, Offset c, double r, bool on, {required bool monocot}) {
  canvas.drawCircle(c, r * 0.9, fill(const Color(0xFFFFF8E8)));
  canvas.drawCircle(c, r * 0.9, _s(const Color(0xFF8E2424), 2));
  for (var i = 0; i < 40; i++) {
    final a = i / 40 * 2 * math.pi;
    canvas.drawLine(c + Offset(math.cos(a), math.sin(a)) * r * 0.9, c + Offset(math.cos(a), math.sin(a)) * r * 0.98, _s(const Color(0xFF8E2424), 1));
  }
  for (var i = 0; i < 150; i++) {
    final a = hash01(i, 31) * 2 * math.pi, d = (0.42 + 0.44 * hash01(i, 32)) * r;
    canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * d, r * 0.038, _s(const Color(0x33B71C1C), 1));
  }
  final stele = r * (monocot ? 0.4 : 0.32);
  canvas.drawCircle(c, stele + r * 0.04, _s(const Color(0xFFC62828), r * 0.03));
  canvas.drawCircle(c, stele, fill(const Color(0xFFFCE4EC)));
  final arms = monocot ? 10 : 4;
  for (var i = 0; i < arms; i++) {
    final a = i / arms * 2 * math.pi;
    final u = Offset(math.cos(a), math.sin(a));
    if (monocot) {
      canvas.drawCircle(c + u * stele * 0.78, r * 0.04, fill(const Color(0xFFC62828)));
    } else {
      for (var k = 0; k < 4; k++) {
        canvas.drawCircle(c + u * stele * (0.25 + k * 0.2), r * (0.025 + 0.012 * (3 - k)), fill(const Color(0xFFC62828)));
      }
    }
    final b = a + math.pi / arms;
    canvas.drawCircle(c + Offset(math.cos(b), math.sin(b)) * stele * 0.7, r * 0.045, fill(const Color(0xFF81C784)));
  }
  if (monocot) canvas.drawCircle(c, stele * 0.55, fill(const Color(0xFFFFF8E8)));
  _call(canvas, on, c, r, 0.0, -0.94, 0.5, -0.98, tr('Epiblema with root hairs'));
  _call(canvas, on, c, r, -0.6, 0.2, -0.98, 0.5, tr('Cortex'));
  _call(canvas, on, c, r, stele / r + 0.04, 0.0, 0.98, 0.3, tr('Endodermis'));
  _call(canvas, on, c, r, monocot ? 0.31 : 0.2, 0.0, 0.7, 0.85, monocot ? tr('Xylem: many groups (polyarch)') : tr('Xylem: 2–4 groups (tetrarch)'));
  if (monocot) _call(canvas, on, c, r, 0.0, 0.0, -0.6, -0.9, tr('Large pith'));
}

void _tsLeaf(Canvas canvas, Offset c, double r, bool on) {
  final top = c.dy - r * 0.35, bot = c.dy + r * 0.35;
  final left = c.dx - r * 0.95, right = c.dx + r * 0.95;
  canvas.drawRect(Rect.fromLTRB(left, top, right, bot), fill(const Color(0xFFF1F8E9)));
  for (var x = left; x < right; x += r * 0.09) {
    canvas.drawRect(Rect.fromLTWH(x, top, r * 0.09, r * 0.07), _s(const Color(0xFF558B2F), 1));
    canvas.drawRect(Rect.fromLTWH(x, bot - r * 0.07, r * 0.09, r * 0.07), _s(const Color(0xFF558B2F), 1));
    final pal = RRect.fromRectAndRadius(Rect.fromLTWH(x + 2, top + r * 0.08, r * 0.07, r * 0.24), Radius.circular(r * 0.03));
    canvas.drawRRect(pal, fill(const Color(0xFFA5D6A7)));
    canvas.drawRRect(pal, _s(const Color(0xFF2E7D32), 1));
    for (var k = 0; k < 3; k++) {
      canvas.drawCircle(Offset(x + r * 0.035 + 2, top + r * (0.13 + k * 0.07)), r * 0.012, fill(const Color(0xFF2E7D32)));
    }
  }
  for (var i = 0; i < 40; i++) {
    final pt = Offset(left + hash01(i, 41) * (right - left), top + r * 0.36 + hash01(i, 42) * r * 0.2);
    canvas.drawPath(_blob(pt, r * 0.05, r * 0.035, i, rough: 0.3, n: 8), fill(const Color(0xFFC5E1A5)));
    canvas.drawPath(_blob(pt, r * 0.05, r * 0.035, i, rough: 0.3, n: 8), _s(const Color(0xFF558B2F), 1));
  }
  final st = Offset(c.dx + r * 0.42, bot - r * 0.035);
  canvas.drawOval(Rect.fromCenter(center: st - Offset(r * 0.03, 0), width: r * 0.05, height: r * 0.06), fill(const Color(0xFF66BB6A)));
  canvas.drawOval(Rect.fromCenter(center: st + Offset(r * 0.03, 0), width: r * 0.05, height: r * 0.06), fill(const Color(0xFF66BB6A)));
  final mid = Offset(c.dx - r * 0.25, c.dy + r * 0.12);
  canvas.drawCircle(mid, r * 0.13, fill(const Color(0xFFF8BBD0)));
  canvas.drawCircle(mid - Offset(0, r * 0.04), r * 0.06, fill(const Color(0xFFC62828)));
  canvas.drawCircle(mid + Offset(0, r * 0.07), r * 0.04, fill(const Color(0xFF81C784)));
  _call(canvas, on, c, r, 0.6, -0.32, 0.75, -0.7, tr('Upper epidermis with cuticle'));
  _call(canvas, on, c, r, 0.1, -0.15, -0.3, -0.75, tr('Palisade mesophyll'));
  _call(canvas, on, c, r, 0.2, 0.12, 0.6, 0.6, tr('Spongy mesophyll'));
  _call(canvas, on, c, r, 0.42, 0.33, 0.85, 0.5, tr('Stoma in lower epidermis'));
  _call(canvas, on, c, r, -0.25, 0.12, -0.7, 0.72, tr('Vascular bundle (vein)'));
}

// ----------------------------------------------------------------- tissues

void _squamous(Canvas canvas, Offset c, double r, bool on) {
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      final ctr = _p(c, r, i * 0.27 + (j.isOdd ? 0.13 : 0), j * 0.24);
      final poly = Path();
      for (var k = 0; k < 6; k++) {
        final a = k * math.pi / 3 + 0.5;
        final rr = r * 0.15 * (1 + (hash01(i + 9, j + 9, k) - 0.5) * 0.25);
        final pt = ctr + Offset(math.cos(a), math.sin(a)) * rr;
        k == 0 ? poly.moveTo(pt.dx, pt.dy) : poly.lineTo(pt.dx, pt.dy);
      }
      poly.close();
      canvas.drawPath(poly, fill(const Color(0xFFE3F2FD)));
      canvas.drawPath(poly, _s(const Color(0xFF1565C0), 1.4));
      canvas.drawCircle(ctr, r * 0.03, fill(const Color(0xFF283593)));
    }
  }
  _call(canvas, on, c, r, 0.0, 0.0, 0.55, -0.85, tr('Nucleus'));
  _call(canvas, on, c, r, 0.27, 0.12, 0.75, 0.6, tr('Flat, polygonal cells fitted edge to edge'));
}

void _columnar(Canvas canvas, Offset c, double r, bool on) {
  final base = c.dy + r * 0.35;
  canvas.drawRect(Rect.fromLTRB(c.dx - r, base, c.dx + r, base + r * 0.06), fill(const Color(0xFFF8BBD0)));
  for (var i = 0; i < 11; i++) {
    final x = c.dx - r * 0.9 + i * r * 0.165;
    final cell = Rect.fromLTRB(x, c.dy - r * 0.4, x + r * 0.165, base);
    canvas.drawRect(cell, fill(const Color(0xFFFFEBEE)));
    canvas.drawRect(cell, _s(const Color(0xFFAD1457), 1.4));
    canvas.drawOval(Rect.fromCenter(center: Offset(cell.center.dx, base - r * 0.15), width: r * 0.07, height: r * 0.12), fill(const Color(0xFF6A1B9A)));
    if (i == 4) {
      canvas.drawOval(Rect.fromCenter(center: Offset(cell.center.dx, c.dy - r * 0.2), width: r * 0.12, height: r * 0.22), fill(const Color(0xFFE1F5FE)));
    }
  }
  _call(canvas, on, c, r, -0.3, 0.2, -0.7, 0.75, tr('Basal nucleus'));
  _call(canvas, on, c, r, -0.06, -0.2, 0.3, -0.8, tr('Goblet cell'));
  _call(canvas, on, c, r, 0.5, 0.38, 0.7, 0.75, tr('Basement membrane'));
  _call(canvas, on, c, r, 0.62, -0.1, 0.9, -0.5, tr('Tall columnar cells'));
}

void _striated(Canvas canvas, Offset c, double r, bool on) {
  for (var f = 0; f < 3; f++) {
    final top = c.dy - r * 0.6 + f * r * 0.42, bot = top + r * 0.34;
    final fibre = Rect.fromLTRB(c.dx - r, top, c.dx + r, bot);
    canvas.drawRect(fibre, fill(const Color(0xFFFFCDD2)));
    for (var x = fibre.left; x < fibre.right; x += r * 0.06) {
      canvas.drawRect(Rect.fromLTWH(x, top, r * 0.03, bot - top), fill(const Color(0xFFC2185B)));
    }
    canvas.drawRect(fibre, _s(const Color(0xFF880E4F), 1.4));
    for (var k = 0; k < 4; k++) {
      canvas.drawOval(Rect.fromCenter(center: Offset(c.dx - r * 0.7 + k * r * 0.48, top + r * 0.04), width: r * 0.12, height: r * 0.05), fill(const Color(0xFF4A148C)));
    }
  }
  _call(canvas, on, c, r, 0.03, -0.43, 0.4, -0.85, tr('Dark and light bands (striations)'));
  _call(canvas, on, c, r, -0.7, -0.56, -0.7, -0.85, tr('Peripheral nuclei (many)'));
  _call(canvas, on, c, r, 0.5, 0.25, 0.75, 0.75, tr('Long unbranched fibres'));
}

void _smooth(Canvas canvas, Offset c, double r, bool on) {
  for (var i = 0; i < 9; i++) {
    final ctr = _p(c, r, (i % 3 - 1) * 0.5 + ((i ~/ 3).isOdd ? 0.2 : 0.0), (i ~/ 3 - 1) * 0.42);
    final cell = Path()
      ..moveTo(ctr.dx - r * 0.38, ctr.dy)
      ..quadraticBezierTo(ctr.dx, ctr.dy - r * 0.1, ctr.dx + r * 0.38, ctr.dy)
      ..quadraticBezierTo(ctr.dx, ctr.dy + r * 0.1, ctr.dx - r * 0.38, ctr.dy)
      ..close();
    canvas.drawPath(cell, fill(const Color(0xFFFFE0E6)));
    canvas.drawPath(cell, _s(const Color(0xFFAD1457), 1.3));
    canvas.drawOval(Rect.fromCenter(center: ctr, width: r * 0.14, height: r * 0.045), fill(const Color(0xFF6A1B9A)));
  }
  _call(canvas, on, c, r, 0.0, 0.0, 0.4, -0.85, tr('One central nucleus'));
  _call(canvas, on, c, r, -0.7, -0.42, -0.6, 0.85, tr('Spindle-shaped, no striations'));
}

void _neuron(Canvas canvas, Offset c, double r, bool on) {
  final soma = _p(c, r, -0.35, -0.1);
  for (var i = 0; i < 7; i++) {
    final a = i / 7 * 2 * math.pi + 0.3;
    if ((a % (2 * math.pi)) < 0.5) continue;
    final tip = soma + Offset(math.cos(a), math.sin(a)) * r * 0.45;
    canvas.drawLine(soma, tip, _s(const Color(0xFF6A1B9A), r * 0.02));
    for (final b in [-0.5, 0.5]) {
      canvas.drawLine(tip, tip + Offset(math.cos(a + b), math.sin(a + b)) * r * 0.12, _s(const Color(0xFF6A1B9A), 1.3));
    }
  }
  final axonEnd = _p(c, r, 0.9, 0.25);
  canvas.drawLine(soma, axonEnd, _s(const Color(0xFF6A1B9A), r * 0.025));
  for (var k = 0; k < 4; k++) {
    final pt = Offset.lerp(soma, axonEnd, 0.3 + k * 0.16)!;
    canvas.drawOval(Rect.fromCenter(center: pt, width: r * 0.14, height: r * 0.06), fill(const Color(0xFFFFF3E0)));
    canvas.drawOval(Rect.fromCenter(center: pt, width: r * 0.14, height: r * 0.06), _s(const Color(0xFFE65100), 1.2));
  }
  for (final b in [-0.5, 0.0, 0.5]) {
    canvas.drawLine(axonEnd, axonEnd + Offset(math.cos(b) * r * 0.1, math.sin(b) * r * 0.1), _s(const Color(0xFF6A1B9A), 1.4));
  }
  canvas.drawCircle(soma, r * 0.14, fill(const Color(0xFFCE93D8)));
  canvas.drawCircle(soma, r * 0.05, fill(const Color(0xFF4A148C)));
  _call(canvas, on, c, r, -0.35, -0.1, -0.7, -0.8, tr('Cell body (cyton)'));
  _call(canvas, on, c, r, -0.7, 0.1, -0.85, 0.6, tr('Dendrites'));
  _call(canvas, on, c, r, 0.25, 0.08, 0.3, -0.6, tr('Axon with myelin sheath'));
  _call(canvas, on, c, r, 0.9, 0.25, 0.6, 0.75, tr('Axon terminals'));
}

void _blood(Canvas canvas, Offset c, double r, bool on) {
  for (var i = 0; i < 60; i++) {
    final pt = _p(c, r, hash01(i, 51) * 1.9 - 0.95, hash01(i, 52) * 1.9 - 0.95);
    canvas.drawCircle(pt, r * 0.07, fill(const Color(0xFFEF9A9A)));
    canvas.drawCircle(pt, r * 0.03, fill(const Color(0xFFFFCDD2)));
  }
  final n = _p(c, r, -0.3, -0.2);
  canvas.drawCircle(n, r * 0.12, fill(const Color(0xFFE1BEE7)));
  for (final (x, y) in [(-0.05, -0.04), (0.05, 0.02), (0.0, 0.06)]) {
    canvas.drawCircle(n + Offset(x, y) * r, r * 0.035, fill(const Color(0xFF6A1B9A)));
  }
  final l = _p(c, r, 0.35, 0.25);
  canvas.drawCircle(l, r * 0.09, fill(const Color(0xFFE1BEE7)));
  canvas.drawCircle(l, r * 0.075, fill(const Color(0xFF4A148C)));
  for (final (x, y) in [(0.55, -0.4), (0.6, -0.33)]) {
    canvas.drawCircle(_p(c, r, x, y), r * 0.02, fill(const Color(0xFF7B1FA2)));
  }
  _call(canvas, on, c, r, 0.2, 0.55, 0.5, 0.88, tr('RBC: biconcave, no nucleus'));
  _call(canvas, on, c, r, -0.3, -0.2, -0.6, -0.8, tr('Neutrophil: lobed nucleus'));
  _call(canvas, on, c, r, 0.35, 0.25, 0.85, 0.35, tr('Lymphocyte: large round nucleus'));
  _call(canvas, on, c, r, 0.58, -0.37, 0.55, -0.85, tr('Platelets'));
}

// ---------------------------------------------------------- reproduction

void _testis(Canvas canvas, Offset c, double r, bool on) {
  for (final (x, y) in [(-0.45, -0.4), (0.4, -0.45), (-0.5, 0.45), (0.45, 0.4), (0.0, 0.0)]) {
    final tc = _p(c, r, x, y);
    final rr = r * 0.36;
    canvas.drawCircle(tc, rr, fill(const Color(0xFFF8BBD0)));
    canvas.drawCircle(tc, rr, _s(const Color(0xFF880E4F), 2));
    for (var k = 0; k < 16; k++) {
      final a = k / 16 * 2 * math.pi;
      canvas.drawCircle(tc + Offset(math.cos(a), math.sin(a)) * rr * 0.85, r * 0.03, fill(const Color(0xFF6A1B9A)));
      canvas.drawCircle(tc + Offset(math.cos(a + 0.2), math.sin(a + 0.2)) * rr * 0.62, r * 0.025, fill(const Color(0xFF8E24AA)));
    }
    canvas.drawCircle(tc, rr * 0.28, fill(const Color(0xFFFFF8F0)));
    for (var k = 0; k < 7; k++) {
      final a = k / 7 * 2 * math.pi;
      canvas.drawLine(tc + Offset(math.cos(a), math.sin(a)) * rr * 0.35, tc + Offset(math.cos(a), math.sin(a)) * rr * 0.1, _s(const Color(0xFF4A148C), 1));
    }
  }
  for (final (x, y) in [(0.0, -0.55), (-0.05, 0.55), (0.75, 0.0)]) {
    canvas.drawCircle(_p(c, r, x, y), r * 0.04, fill(const Color(0xFFD81B60)));
  }
  _call(canvas, on, c, r, -0.45, -0.4, -0.8, -0.85, tr('Seminiferous tubule'));
  _call(canvas, on, c, r, 0.29, 0.0, 0.75, -0.8, tr('Spermatogonia at the edge'));
  _call(canvas, on, c, r, 0.0, 0.0, 0.85, 0.85, tr('Sperms in the lumen'));
  _call(canvas, on, c, r, 0.0, -0.55, -0.85, 0.15, tr('Leydig (interstitial) cells'));
}

void _ovary(Canvas canvas, Offset c, double r, bool on) {
  canvas.drawOval(Rect.fromCenter(center: c, width: r * 1.85, height: r * 1.5), fill(const Color(0xFFFCE4EC)));
  canvas.drawOval(Rect.fromCenter(center: c, width: r * 1.85, height: r * 1.5), _s(const Color(0xFF880E4F), 2));
  for (final (x, y) in [(-0.7, -0.2), (-0.55, 0.4), (0.05, -0.6), (0.7, 0.35)]) {
    final pt = _p(c, r, x, y);
    canvas.drawCircle(pt, r * 0.07, fill(const Color(0xFFF8BBD0)));
    canvas.drawCircle(pt, r * 0.03, fill(const Color(0xFF6A1B9A)));
  }
  final g = _p(c, r, 0.25, 0.05);
  canvas.drawCircle(g, r * 0.4, fill(const Color(0xFFF48FB1)));
  canvas.drawCircle(g, r * 0.3, fill(const Color(0xFFFFF8F0)));
  canvas.drawCircle(g + Offset(-r * 0.18, r * 0.1), r * 0.1, fill(const Color(0xFFF48FB1)));
  canvas.drawCircle(g + Offset(-r * 0.2, r * 0.1), r * 0.05, fill(const Color(0xFFE1BEE7)));
  canvas.drawCircle(g + Offset(-r * 0.2, r * 0.1), r * 0.02, fill(const Color(0xFF4A148C)));
  final cl = _p(c, r, -0.25, 0.1);
  canvas.drawPath(_blob(cl, r * 0.2, r * 0.17, 9, rough: 0.15), fill(const Color(0xFFFFE082)));
  _call(canvas, on, c, r, 0.25, -0.3, 0.7, -0.8, tr('Graafian follicle'));
  _call(canvas, on, c, r, 0.05, 0.15, 0.5, 0.85, tr('Secondary oocyte'));
  _call(canvas, on, c, r, 0.25, 0.05, 0.9, 0.15, tr('Antrum (fluid)'));
  _call(canvas, on, c, r, -0.7, -0.2, -0.85, -0.75, tr('Primary follicles'));
  _call(canvas, on, c, r, -0.25, 0.1, -0.7, 0.85, tr('Corpus luteum'));
}

void _blastula(Canvas canvas, Offset c, double r, bool on) {
  canvas.drawCircle(c, r * 0.75, fill(const Color(0xFFFFF3E0)));
  for (var k = 0; k < 28; k++) {
    final a = k / 28 * 2 * math.pi;
    final u = Offset(math.cos(a), math.sin(a));
    canvas.drawCircle(c + u * r * 0.66, r * 0.09, fill(const Color(0xFFFFCC80)));
    canvas.drawCircle(c + u * r * 0.66, r * 0.09, _s(const Color(0xFFE65100), 1));
    canvas.drawCircle(c + u * r * 0.66, r * 0.025, fill(const Color(0xFF6D4C41)));
  }
  canvas.drawCircle(c, r * 0.56, fill(const Color(0xFFE3F2FD)));
  final icm = _p(c, r, 0, -0.38);
  for (var k = 0; k < 6; k++) {
    canvas.drawCircle(icm + Offset((k % 3 - 1) * r * 0.13, (k ~/ 3) * r * 0.11), r * 0.08, fill(const Color(0xFFFFB74D)));
    canvas.drawCircle(icm + Offset((k % 3 - 1) * r * 0.13, (k ~/ 3) * r * 0.11), r * 0.08, _s(const Color(0xFFE65100), 1));
  }
  _call(canvas, on, c, r, 0.0, 0.15, 0.5, 0.85, tr('Blastocoel (cavity)'));
  _call(canvas, on, c, r, 0.66, 0.0, 0.95, -0.5, tr('Trophoblast'));
  _call(canvas, on, c, r, 0.0, -0.38, -0.6, -0.85, tr('Inner cell mass'));
}

void _pollen(Canvas canvas, Offset c, double r, bool on) {
  for (var k = 0; k < 40; k++) {
    final a = k / 40 * 2 * math.pi;
    final u = Offset(math.cos(a), math.sin(a));
    canvas.drawLine(c + u * r * 0.62, c + u * r * 0.74, _s(const Color(0xFFE65100), r * 0.02));
  }
  canvas.drawCircle(c, r * 0.62, fill(const Color(0xFFFFE082)));
  canvas.drawCircle(c, r * 0.62, _s(const Color(0xFFE65100), r * 0.04));
  canvas.drawCircle(c, r * 0.5, _s(const Color(0xFFFFB300), 2));
  for (final a in [0.0, 2.1, 4.2]) {
    canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * r * 0.6, r * 0.06, fill(const Color(0xFFFFF8E1)));
  }
  canvas.drawCircle(_p(c, r, -0.12, 0.05), r * 0.2, fill(const Color(0xFFE6A23C)));
  canvas.drawPath(Path()..addOval(Rect.fromCenter(center: _p(c, r, 0.22, -0.12), width: r * 0.3, height: r * 0.14)), fill(const Color(0xFFBF6A00)));
  _call(canvas, on, c, r, 0.68, 0.2, 0.9, 0.6, tr('Exine with spines'));
  _call(canvas, on, c, r, -0.12, 0.05, -0.6, 0.8, tr('Vegetative cell nucleus'));
  _call(canvas, on, c, r, 0.22, -0.12, 0.6, -0.8, tr('Generative cell'));
  _call(canvas, on, c, r, 0.6, 0.0, 0.95, -0.2, tr('Germ pore'));
}

// --------------------------------------------------------------- pathogens

void _entamoeba(Canvas canvas, Offset c, double r, bool on) {
  _amoeba(canvas, c, r * 0.95, false);
  for (final (x, y) in [(0.2, 0.15), (-0.25, -0.18), (0.05, -0.25)]) {
    canvas.drawCircle(_p(c, r, x, y), r * 0.06, fill(const Color(0xFFE57373)));
  }
  _call(canvas, on, c, r, 0.2, 0.15, 0.65, 0.65, tr('Ingested red blood cells'));
  _call(canvas, on, c, r, -0.1, 0.05, -0.65, 0.7, tr('Nucleus'));
  _call(canvas, on, c, r, -0.58, -0.1, -0.85, -0.6, tr('Pseudopodium'));
}

void _plasmodium(Canvas canvas, Offset c, double r, bool on) {
  for (var i = 0; i < 26; i++) {
    final pt = _p(c, r, hash01(i, 61) * 1.8 - 0.9, hash01(i, 62) * 1.8 - 0.9);
    canvas.drawCircle(pt, r * 0.1, fill(const Color(0xFFF4B6B6)));
    canvas.drawCircle(pt, r * 0.1, _s(const Color(0xFFD48A8A), 1));
    if (i % 4 == 0) {
      canvas.drawCircle(pt, r * 0.045, _s(const Color(0xFF4A148C), r * 0.012));
      canvas.drawCircle(pt + Offset(r * 0.04, -r * 0.02), r * 0.018, fill(const Color(0xFFB71C1C)));
    }
  }
  final g = _p(c, r, 0.3, 0.3);
  canvas.drawCircle(g, r * 0.12, fill(const Color(0xFFF4B6B6)));
  canvas.drawPath(Path()..addOval(Rect.fromCenter(center: g, width: r * 0.2, height: r * 0.09)), fill(const Color(0xFF7B1FA2)));
  _call(canvas, on, c, r, hash01(0, 61) * 1.8 - 0.9, hash01(0, 62) * 1.8 - 0.9, -0.8, -0.8, tr('Ring stage in an RBC'));
  _call(canvas, on, c, r, 0.3, 0.3, 0.7, 0.8, tr('Gametocyte'));
}

void _trichophyton(Canvas canvas, Offset c, double r, bool on) {
  final hy = _s(const Color(0xFF6D4C41), r * 0.014);
  void branch(Offset a, double ang, int depth) {
    final b = a + Offset(math.cos(ang), math.sin(ang)) * r * (0.35 - depth * 0.05);
    canvas.drawLine(a, b, hy);
    if (depth < 3) {
      branch(b, ang - 0.6, depth + 1);
      branch(b, ang + 0.5, depth + 1);
    } else {
      canvas.save();
      canvas.translate(b.dx, b.dy);
      canvas.rotate(ang);
      canvas.drawOval(Rect.fromCenter(center: Offset(r * 0.06, 0), width: r * 0.15, height: r * 0.06), fill(const Color(0xFFBCAAA4)));
      for (var k = 1; k < 4; k++) {
        canvas.drawLine(Offset(r * 0.06 * k * 0.6, -r * 0.03), Offset(r * 0.06 * k * 0.6, r * 0.03), _s(const Color(0xFF6D4C41), 1));
      }
      canvas.restore();
    }
  }

  branch(_p(c, r, -0.8, 0.5), -0.5, 0);
  branch(_p(c, r, -0.4, 0.8), -1.2, 1);
  _call(canvas, on, c, r, -0.45, 0.3, -0.8, -0.2, tr('Septate hyphae'));
  _call(canvas, on, c, r, 0.4, -0.25, 0.7, -0.75, tr('Spores (conidia)'));
}

// ------------------------------------------------- adaptation & evolution

void _forelimbs(Canvas canvas, Offset c, double r, bool on) {
  const hum = Color(0xFFE57373), rad = Color(0xFF64B5F6), car = Color(0xFF81C784), dig = Color(0xFFFFD54F);
  void limb(Offset at, double s, List<(Color, Offset, Offset, double)> bones) {
    for (final (col, a, b, wd) in bones) {
      canvas.drawLine(at + a * s, at + b * s, stroke(Color.lerp(col, Colors.black, 0.3)!, wd * s + 2));
      canvas.drawLine(at + a * s, at + b * s, stroke(col, wd * s));
    }
  }

  final s = r * 0.9;
  // Human arm.
  limb(_p(c, r, -0.62, -0.75), s, [
    (hum, Offset.zero, const Offset(0, 0.42), 0.06),
    (rad, const Offset(-0.02, 0.44), const Offset(-0.03, 0.82), 0.035),
    (rad, const Offset(0.03, 0.44), const Offset(0.05, 0.82), 0.035),
    (car, const Offset(0, 0.85), const Offset(0, 0.93), 0.08),
    for (var k = 0; k < 5; k++) (dig, Offset((k - 2) * 0.03, 0.95), Offset((k - 2) * 0.05, 1.12 - (k - 2).abs() * 0.03), 0.018),
  ]);
  // Whale flipper.
  limb(_p(c, r, 0.0, -0.75), s, [
    (hum, Offset.zero, const Offset(0, 0.22), 0.09),
    (rad, const Offset(-0.03, 0.24), const Offset(-0.04, 0.42), 0.05),
    (rad, const Offset(0.04, 0.24), const Offset(0.05, 0.42), 0.05),
    (car, const Offset(0, 0.45), const Offset(0, 0.52), 0.12),
    for (var k = 0; k < 5; k++) (dig, Offset((k - 2) * 0.035, 0.55), Offset((k - 2) * 0.06, 0.95 - (k - 2).abs() * 0.08), 0.022),
  ]);
  // Bat wing.
  limb(_p(c, r, 0.55, -0.75), s, [
    (hum, Offset.zero, const Offset(0.02, 0.32), 0.05),
    (rad, const Offset(0.02, 0.34), const Offset(0.05, 0.75), 0.03),
    (car, const Offset(0.05, 0.77), const Offset(0.05, 0.83), 0.06),
    for (var k = 0; k < 4; k++) (dig, const Offset(0.05, 0.85), Offset(-0.25 + k * 0.17, 1.35 - k * 0.06), 0.014),
  ]);
  for (final (x, t) in [(-0.62, tr('Human')), (0.0, tr('Whale')), (0.55, tr('Bat'))]) {
    label(canvas, t, _p(c, r, x, 0.62), size: math.max(13, r * 0.07), bold: true);
  }
  _call(canvas, on, c, r, -0.62, -0.55, -0.95, -0.35, tr('Humerus'));
  _call(canvas, on, c, r, -0.65, -0.18, -0.95, 0.05, tr('Radius and ulna'));
  _call(canvas, on, c, r, 0.02, -0.03, 0.35, 0.3, tr('Carpals and digits'));
}

void _opuntia(Canvas canvas, Offset c, double r, bool on) {
  void pad(Offset at, double w, double h, double rot) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.rotate(rot);
    final rect = Rect.fromCenter(center: Offset.zero, width: w, height: h);
    canvas.drawOval(rect, Paint()..shader = RadialGradient(colors: const [Color(0xFF9CCC65), Color(0xFF558B2F)]).createShader(rect));
    canvas.drawOval(rect, _s(const Color(0xFF33691E), 1.5));
    for (var i = 0; i < 12; i++) {
      final pt = Offset((hash01(i, w.round()) - 0.5) * w * 0.7, (hash01(i, h.round()) - 0.5) * h * 0.75);
      canvas.drawCircle(pt, 2.5, fill(const Color(0xFFFFF59D)));
      for (final a in [-0.6, 0.0, 0.6]) {
        canvas.drawLine(pt, pt + Offset(math.sin(a), -math.cos(a)) * r * 0.06, _s(const Color(0xFFF5F5DC), 1.2));
      }
    }
    canvas.restore();
  }

  canvas.drawRect(Rect.fromLTRB(c.dx - r * 0.5, c.dy + r * 0.72, c.dx + r * 0.5, c.dy + r), fill(const Color(0xFFD7B98E)));
  pad(_p(c, r, 0, 0.35), r * 0.5, r * 0.78, 0);
  pad(_p(c, r, -0.32, -0.3), r * 0.42, r * 0.62, -0.5);
  pad(_p(c, r, 0.3, -0.35), r * 0.4, r * 0.6, 0.45);
  canvas.drawCircle(_p(c, r, 0.38, -0.72), r * 0.07, fill(const Color(0xFFFDD835)));
  _call(canvas, on, c, r, 0.05, 0.3, 0.6, 0.6, tr('Phylloclade: flat green stem'));
  _call(canvas, on, c, r, -0.35, -0.45, -0.75, -0.75, tr('Spines are modified leaves'));
  _call(canvas, on, c, r, 0.0, 0.85, -0.55, 0.9, tr('Thick cuticle, stores water'));
}

void _eichhornia(Canvas canvas, Offset c, double r, bool on) {
  canvas.drawRect(Rect.fromLTRB(c.dx - r, c.dy + r * 0.25, c.dx + r, c.dy + r), fill(const Color(0x5578B7E0)));
  for (var i = 0; i < 14; i++) {
    canvas.drawLine(_p(c, r, -0.1 + i * 0.015, 0.3), _p(c, r, -0.3 + i * 0.05, 0.85), _s(const Color(0xFF5D4037), 1.4));
  }
  for (final x in [-0.35, 0.0, 0.35]) {
    final base = _p(c, r, 0, 0.25);
    final bulb = _p(c, r, x * 0.6, 0.0);
    canvas.drawOval(Rect.fromCenter(center: bulb, width: r * 0.17, height: r * 0.28), fill(const Color(0xFF8BC34A)));
    canvas.drawLine(base, bulb, _s(const Color(0xFF7CB342), r * 0.05));
    final leaf = Rect.fromCenter(center: _p(c, r, x * 1.1, -0.4 - (x == 0 ? 0.15 : 0)), width: r * 0.42, height: r * 0.36);
    canvas.drawOval(leaf, fill(const Color(0xFF43A047)));
    canvas.drawOval(leaf, _s(const Color(0xFF1B5E20), 1.4));
    canvas.drawLine(bulb, leaf.center, _s(const Color(0xFF7CB342), r * 0.025));
  }
  _call(canvas, on, c, r, 0.21, 0.0, 0.7, 0.05, tr('Swollen spongy petiole (floats)'));
  _call(canvas, on, c, r, 0.38, -0.45, 0.75, -0.8, tr('Broad leaf lamina'));
  _call(canvas, on, c, r, -0.2, 0.7, -0.7, 0.85, tr('Fibrous roots in water'));
}

// ------------------------------------------------------------------ meiosis

// Stained (acetocarmine) chromosomes: one homologue of each pair darker.
const _chA = Color(0xFF7B1F4F), _chB = Color(0xFFB0457A);

/// A chromosome of two sister chromatids along [ang], [len] long, joined at
/// the centromere at [at] ([single]: one chromatid, after anaphase II).
void _chromosome(Canvas canvas, Offset at, double len, double ang, Color col, double wd, {bool single = false, double bend = 0}) {
  final d = Offset(math.cos(ang), math.sin(ang)), n = Offset(-d.dy, d.dx);
  for (final side in single ? [0.0] : [-0.5, 0.5]) {
    final o = n * (side * wd * 1.15);
    final a = at - d * (len / 2) + o, b = at + d * (len / 2) + o;
    final ctrl = at + o * 0.3 + n * bend * len;
    canvas.drawPath(
        Path()
          ..moveTo(a.dx, a.dy)
          ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy),
        stroke(col, wd)..strokeCap = StrokeCap.round);
  }
  canvas.drawCircle(at, wd * (single ? 0.6 : 0.85), fill(Color.lerp(col, Colors.black, 0.35)!));
}

/// A V-shaped chromosome pulled by its centromere at [at] towards [pole].
void _pulled(Canvas canvas, Offset at, Offset pole, double len, Color col, double wd, {bool single = false}) {
  final toward = (pole - at) / (pole - at).distance;
  for (final s in [-1.0, 1.0]) {
    final arm = Offset(-toward.dx + s * toward.dy * 0.9, -toward.dy - s * toward.dx * 0.9);
    final u = arm / arm.distance;
    for (final k in single ? [0.0] : [-0.5, 0.5]) {
      final o = Offset(-u.dy, u.dx) * (k * wd * 1.1);
      canvas.drawLine(at + o, at + u * len * 0.5 + o, stroke(col, wd)..strokeCap = StrokeCap.round);
    }
  }
  canvas.drawCircle(at, wd * 0.7, fill(Color.lerp(col, Colors.black, 0.35)!));
}

/// A cell outline and, if [nucleus], a pale nucleus.
void _meioCell(Canvas canvas, Offset c, double rx, double ry, int seed, {bool nucleus = false, bool envelope = true}) {
  final cell = _blob(c, rx, ry, seed, rough: 0.06);
  canvas.drawPath(cell, fill(const Color(0xFFF6E9EF)));
  canvas.drawPath(cell, _s(const Color(0xFF8E5A78), 1.8));
  if (nucleus) {
    final nr = math.min(rx, ry) * 0.55;
    canvas.drawCircle(c, nr, fill(const Color(0xFFEBCFDC)));
    if (envelope) {
      canvas.drawCircle(c, nr, _s(const Color(0xFF8E5A78), 1.4));
    } else {
      for (var i = 0; i < 16; i += 2) {
        canvas.drawArc(Rect.fromCircle(center: c, radius: nr), i / 16 * 2 * math.pi, 2 * math.pi / 16 * 0.8, false, _s(const Color(0xFF8E5A78), 1.4));
      }
    }
  }
}

/// Spindle fibres from two poles to points on the equator.
void _spindle(Canvas canvas, Offset p1, Offset p2, List<Offset> to) {
  final paint = _s(const Color(0x668E5A78), 1.1);
  for (final t in to) {
    canvas.drawLine(p1, t, paint);
    canvas.drawLine(p2, t, paint);
  }
  for (final p in [p1, p2]) {
    for (var k = 0; k < 8; k++) {
      final a = k / 8 * 2 * math.pi;
      canvas.drawLine(p, p + Offset(math.cos(a), math.sin(a)) * 10, _s(const Color(0x998E5A78), 1));
    }
  }
}

void _neighbours(Canvas canvas, Offset c, double r) {
  for (final (x, y, s) in [(-0.82, -0.6, 3), (0.85, -0.55, 4), (-0.85, 0.62, 5), (0.82, 0.66, 6)]) {
    _meioCell(canvas, _p(c, r, x, y), r * 0.26, r * 0.22, s, nucleus: true);
  }
}

void _prophase1(Canvas canvas, Offset c, double r, bool on) {
  _neighbours(canvas, c, r);
  _meioCell(canvas, c, r * 0.62, r * 0.55, 11, nucleus: true, envelope: false);
  final w = r * 0.04;
  // Two bivalents, each a pair of homologues crossing at a chiasma.
  for (final (at, len, ang) in [(_p(c, r, -0.12, -0.05), r * 0.36, 0.5), (_p(c, r, 0.16, 0.08), r * 0.24, -0.9)]) {
    _chromosome(canvas, at + Offset(-w * 1.6, 0), len, ang + 0.28, _chA, w, bend: 0.06);
    _chromosome(canvas, at + Offset(w * 1.6, 0), len, ang - 0.28, _chB, w, bend: -0.06);
  }
  _call(canvas, on, c, r, -0.12, -0.05, -0.75, -0.95, tr('Chiasma (crossing over)'));
  _call(canvas, on, c, r, 0.22, 0.02, 0.55, -0.92, tr('Bivalent: a homologous pair'));
  _call(canvas, on, c, r, 0.0, 0.33, 0.45, 0.92, tr('Nuclear envelope breaking down'));
}

void _metaphase1(Canvas canvas, Offset c, double r, bool on) {
  _neighbours(canvas, c, r);
  _meioCell(canvas, c, r * 0.5, r * 0.64, 12);
  final p1 = _p(c, r, 0, -0.55), p2 = _p(c, r, 0, 0.55);
  final w = r * 0.04;
  final eq = [_p(c, r, -0.15, 0), _p(c, r, 0.15, 0)];
  _spindle(canvas, p1, p2, [for (final e in eq) ...[e - Offset(0, w * 3), e + Offset(0, w * 3)]]);
  for (final (i, e) in eq.indexed) {
    final len = i == 0 ? r * 0.3 : r * 0.2;
    _chromosome(canvas, e - Offset(0, w * 3), len, 0, _chA, w);
    _chromosome(canvas, e + Offset(0, w * 3), len, 0, _chB, w);
  }
  canvas.drawLine(_p(c, r, -0.45, 0), _p(c, r, 0.45, 0), _s(const Color(0x55444444), 1)..strokeCap = StrokeCap.round);
  _call(canvas, on, c, r, -0.15, -0.05, -0.4, -0.95, tr('Bivalents line up on the equator'));
  _call(canvas, on, c, r, 0.0, -0.55, 0.55, -0.92, tr('Spindle pole'));
  _call(canvas, on, c, r, 0.08, 0.3, 0.55, 0.92, tr('Spindle fibres'));
}

void _anaphase1(Canvas canvas, Offset c, double r, bool on) {
  _neighbours(canvas, c, r);
  _meioCell(canvas, c, r * 0.48, r * 0.72, 13);
  final p1 = _p(c, r, 0, -0.62), p2 = _p(c, r, 0, 0.62);
  final w = r * 0.04;
  final up = [_p(c, r, -0.14, -0.3), _p(c, r, 0.14, -0.33)], down = [_p(c, r, -0.14, 0.3), _p(c, r, 0.14, 0.33)];
  _spindle(canvas, p1, p2, [...up, ...down]);
  for (final (i, a) in up.indexed) {
    _pulled(canvas, a, p1, i == 0 ? r * 0.34 : r * 0.24, _chA, w);
  }
  for (final (i, a) in down.indexed) {
    _pulled(canvas, a, p2, i == 0 ? r * 0.34 : r * 0.24, _chB, w);
  }
  _call(canvas, on, c, r, -0.14, -0.3, -0.45, -0.95, tr('Homologues move to opposite poles'));
  _call(canvas, on, c, r, 0.14, 0.33, 0.6, 0.92, tr('Each still has two chromatids'));
}

void _dyad(Canvas canvas, Offset c, double r, bool on) {
  _neighbours(canvas, c, r);
  for (final (y, col, s) in [(-0.3, _chA, 14), (0.3, _chB, 15)]) {
    final cc = _p(c, r, 0, y);
    _meioCell(canvas, cc, r * 0.46, r * 0.29, s, nucleus: true);
    _chromosome(canvas, cc + Offset(-r * 0.07, 0), r * 0.18, 1.2, col, r * 0.03, bend: 0.1);
    _chromosome(canvas, cc + Offset(r * 0.08, r * 0.02), r * 0.12, -0.5, col == _chA ? _chB : _chA, r * 0.03, bend: -0.1);
  }
  _call(canvas, on, c, r, 0.3, -0.3, 0.6, -0.92, tr('Dyad: two haploid cells'));
  _call(canvas, on, c, r, -0.07, 0.3, -0.6, 0.92, tr('Chromosomes still double (two chromatids)'));
}

void _anaphase2(Canvas canvas, Offset c, double r, bool on) {
  _neighbours(canvas, c, r);
  final w = r * 0.032;
  for (final (x, s) in [(-0.3, 16), (0.3, 17)]) {
    final cc = _p(c, r, x, 0);
    _meioCell(canvas, cc, r * 0.26, r * 0.5, s);
    final p1 = cc + Offset(0, -r * 0.42), p2 = cc + Offset(0, r * 0.42);
    final up = [cc + Offset(-r * 0.06, -r * 0.2), cc + Offset(r * 0.07, -r * 0.23)];
    final down = [cc + Offset(-r * 0.06, r * 0.2), cc + Offset(r * 0.07, r * 0.23)];
    _spindle(canvas, p1, p2, [...up, ...down]);
    for (final (i, a) in up.indexed) {
      _pulled(canvas, a, p1, i == 0 ? r * 0.22 : r * 0.15, i == 0 ? _chA : _chB, w, single: true);
    }
    for (final (i, a) in down.indexed) {
      _pulled(canvas, a, p2, i == 0 ? r * 0.22 : r * 0.15, i == 0 ? _chA : _chB, w, single: true);
    }
  }
  _call(canvas, on, c, r, -0.36, -0.2, -0.7, -0.95, tr('Sister chromatids separate'));
  _call(canvas, on, c, r, 0.3, 0.0, 0.75, 0.92, tr('Two cells divide at once'));
}

void _tetrad(Canvas canvas, Offset c, double r, bool on) {
  // A pollen mother cell's four products, still inside the common wall.
  canvas.drawCircle(c, r * 0.6, fill(const Color(0xFFF3E4EC)));
  canvas.drawCircle(c, r * 0.6, _s(const Color(0xFF8E5A78), 3));
  for (final (x, y, s) in [(-0.27, -0.25, 21), (0.27, -0.25, 22), (-0.27, 0.25, 23), (0.27, 0.25, 24)]) {
    final cc = _p(c, r, x, y);
    _meioCell(canvas, cc, r * 0.24, r * 0.22, s, nucleus: true);
    for (final (k, col) in [(0, _chA), (1, _chB)]) {
      canvas.drawCircle(cc + Offset((k - 0.5) * r * 0.07, (k - 0.5) * r * 0.03), r * 0.022, fill(col));
    }
  }
  _neighbours(canvas, c, r * 1.08);
  _call(canvas, on, c, r, 0.27, -0.25, 0.4, -0.95, tr('Tetrad: four haploid cells (n)'));
  _call(canvas, on, c, r, -0.58, 0.1, -0.3, 0.95, tr('Common wall of the mother cell'));
}

// ------------------------------------------------------------- pollination

/// Maize: male tassel with dangling anthers, female cob with long silks.
void _maize(Canvas canvas, Offset c, double r, bool on) {
  final stem = _s(const Color(0xFF6B8E23), r * 0.05);
  canvas.drawLine(_p(c, r, -0.05, 0.95), _p(c, r, 0.0, -0.45), stem);
  // Leaves.
  for (final (y, s) in [(0.55, -1.0), (0.25, 1.0), (-0.1, -1.0)]) {
    final base = _p(c, r, 0, y);
    final tip = base + Offset(s * r * 0.75, -r * 0.05);
    canvas.drawPath(
        Path()
          ..moveTo(base.dx, base.dy)
          ..quadraticBezierTo(base.dx + s * r * 0.3, base.dy - r * 0.28, tip.dx, tip.dy)
          ..quadraticBezierTo(base.dx + s * r * 0.3, base.dy - r * 0.16, base.dx, base.dy + r * 0.04),
        fill(const Color(0xFF7CB342)));
  }
  // Tassel: branches with pendulous anthers.
  final top = _p(c, r, 0, -0.45);
  for (var k = -3; k <= 3; k++) {
    final end = top + Offset(k * r * 0.1, -r * (0.42 - k.abs() * 0.04));
    canvas.drawLine(top, end, _s(const Color(0xFFB59B4A), r * 0.014));
    for (var j = 1; j <= 4; j++) {
      final at = Offset.lerp(top, end, j / 4.6)!;
      canvas.drawLine(at, at + Offset(0, r * 0.06), _s(const Color(0xFFB59B4A), 0.9));
      canvas.drawOval(Rect.fromCenter(center: at + Offset(0, r * 0.08), width: r * 0.025, height: r * 0.05), fill(const Color(0xFFE2C55A)));
    }
  }
  // Pollen drifting on the wind.
  for (var i = 0; i < 26; i++) {
    canvas.drawCircle(_p(c, r, 0.15 + hash01(i, 31) * 0.7, -0.75 + hash01(i, 32) * 0.7), r * 0.008 + 1, fill(const Color(0xCCE2C55A)));
  }
  // Female cob in a leaf sheath, with silks.
  final cob = _p(c, r, 0.08, 0.38);
  canvas.drawOval(Rect.fromCenter(center: cob + Offset(r * 0.06, 0), width: r * 0.14, height: r * 0.34), fill(const Color(0xFF9CCC65)));
  canvas.drawOval(Rect.fromCenter(center: cob + Offset(r * 0.06, 0), width: r * 0.14, height: r * 0.34), _s(const Color(0xFF558B2F), 1.4));
  for (var i = 0; i < 14; i++) {
    final from = cob + Offset(r * 0.06, -r * 0.16);
    final to = from + Offset(r * (0.08 + 0.2 * hash01(i, 33)), -r * (0.05 + 0.12 * hash01(i, 34)));
    canvas.drawPath(
        Path()
          ..moveTo(from.dx, from.dy)
          ..quadraticBezierTo((from.dx + to.dx) / 2, from.dy - r * 0.12, to.dx, to.dy),
        _s(const Color(0xFFC0884A), 1.3));
  }
  _call(canvas, on, c, r, 0.0, -0.62, -0.6, -0.9, tr('Tassel: male flowers'));
  _call(canvas, on, c, r, 0.2, -0.65, 0.6, -0.92, tr('Anthers hang out on long filaments'));
  _call(canvas, on, c, r, 0.25, 0.18, 0.62, 0.05, tr('Long feathery stigmas (silk)'));
  _call(canvas, on, c, r, 0.45, -0.45, 0.72, -0.55, tr('Light, dry pollen in the wind'));
}

/// Salvia: a two-lipped flower whose stamens swing down on a bee's back.
void _salvia(Canvas canvas, Offset c, double r, bool on) {
  const petal = Color(0xFF7E57C2), dark = Color(0xFF4527A0);
  canvas.drawLine(_p(c, r, -0.1, 0.95), _p(c, r, -0.25, 0.2), _s(const Color(0xFF558B2F), r * 0.035));
  // Calyx.
  final calyx = Path()
    ..moveTo(c.dx - r * 0.32, c.dy + r * 0.25)
    ..lineTo(c.dx - r * 0.12, c.dy + r * 0.02)
    ..lineTo(c.dx - r * 0.02, c.dy + r * 0.12)
    ..close();
  canvas.drawPath(calyx, fill(const Color(0xFF689F38)));
  // Corolla tube, hood-like upper lip and broad lower lip (landing platform).
  final tube = Path()
    ..moveTo(c.dx - r * 0.12, c.dy + r * 0.04)
    ..quadraticBezierTo(c.dx + r * 0.1, c.dy - r * 0.08, c.dx + r * 0.25, c.dy - r * 0.08)
    ..lineTo(c.dx + r * 0.27, c.dy + r * 0.04)
    ..quadraticBezierTo(c.dx + r * 0.05, c.dy + r * 0.08, c.dx - r * 0.05, c.dy + r * 0.12)
    ..close();
  canvas.drawPath(tube, fill(petal));
  final upper = Path()
    ..moveTo(c.dx + r * 0.22, c.dy - r * 0.07)
    ..quadraticBezierTo(c.dx + r * 0.35, c.dy - r * 0.55, c.dx + r * 0.7, c.dy - r * 0.38)
    ..quadraticBezierTo(c.dx + r * 0.5, c.dy - r * 0.2, c.dx + r * 0.28, c.dy - r * 0.02)
    ..close();
  canvas.drawPath(upper, fill(petal));
  canvas.drawPath(upper, _s(dark, 1.2));
  final lower = Path()
    ..moveTo(c.dx + r * 0.27, c.dy + r * 0.03)
    ..quadraticBezierTo(c.dx + r * 0.55, c.dy + r * 0.0, c.dx + r * 0.78, c.dy + r * 0.2)
    ..quadraticBezierTo(c.dx + r * 0.55, c.dy + r * 0.32, c.dx + r * 0.25, c.dy + r * 0.1)
    ..close();
  canvas.drawPath(lower, fill(const Color(0xFF9575CD)));
  canvas.drawPath(lower, _s(dark, 1.2));
  for (var i = 0; i < 5; i++) {
    canvas.drawLine(_p(c, r, 0.36 + i * 0.06, 0.08), _p(c, r, 0.42 + i * 0.06, 0.16), _s(const Color(0xFFFFFFFF), 1.6));
  }
  // Lever stamen: a curved connective, the fertile anther under the hood.
  canvas.drawPath(
      Path()
        ..moveTo(c.dx + r * 0.25, c.dy - r * 0.0)
        ..quadraticBezierTo(c.dx + r * 0.42, c.dy - r * 0.42, c.dx + r * 0.6, c.dy - r * 0.3),
      _s(const Color(0xFFFBC02D), 2.2));
  canvas.drawOval(Rect.fromCenter(center: _p(c, r, 0.6, -0.3), width: r * 0.07, height: r * 0.04), fill(const Color(0xFFFBC02D)));
  // Style and forked stigma.
  canvas.drawPath(
      Path()
        ..moveTo(c.dx + r * 0.2, c.dy - r * 0.02)
        ..quadraticBezierTo(c.dx + r * 0.45, c.dy - r * 0.55, c.dx + r * 0.72, c.dy - r * 0.42),
      _s(const Color(0xFFD81B60), 1.6));
  // A bee landing on the lower lip.
  final bee = _p(c, r, 0.62, 0.36);
  canvas.drawOval(Rect.fromCenter(center: bee, width: r * 0.2, height: r * 0.12), fill(const Color(0xFFFFB300)));
  for (var k = -1; k <= 1; k++) {
    canvas.drawLine(bee + Offset(k * r * 0.04, -r * 0.055), bee + Offset(k * r * 0.04, r * 0.055), _s(const Color(0xFF3E2723), r * 0.018));
  }
  canvas.drawCircle(bee + Offset(-r * 0.11, -r * 0.01), r * 0.04, fill(const Color(0xFF3E2723)));
  canvas.drawOval(Rect.fromCenter(center: bee + Offset(r * 0.02, -r * 0.09), width: r * 0.12, height: r * 0.07), fill(const Color(0x99E3F2FD)));
  canvas.drawOval(Rect.fromCenter(center: bee + Offset(r * 0.02, -r * 0.09), width: r * 0.12, height: r * 0.07), _s(const Color(0xFF90A4AE), 1));
  _call(canvas, on, c, r, 0.55, 0.15, 0.85, 0.6, tr('Lower lip: landing platform'));
  _call(canvas, on, c, r, 0.58, -0.3, 0.5, -0.85, tr('Lever stamen strikes the bee'));
  _call(canvas, on, c, r, 0.35, -0.3, -0.25, -0.75, tr('Bright corolla with nectar guides'));
  _call(canvas, on, c, r, 0.0, 0.0, -0.6, -0.3, tr('Nectar at the base of the tube'));
}

/// Bignonia-like tubular orange flowers visited by a sunbird.
void _birdFlower(Canvas canvas, Offset c, double r, bool on) {
  canvas.drawPath(
      Path()
        ..moveTo(c.dx - r * 0.95, c.dy - r * 0.55)
        ..quadraticBezierTo(c.dx - r * 0.2, c.dy - r * 0.75, c.dx + r * 0.3, c.dy - r * 0.6),
      _s(const Color(0xFF6D4C41), r * 0.03));
  for (final (x, a) in [(-0.6, 1.2), (-0.35, 1.5), (-0.1, 1.75), (0.15, 1.35)]) {
    final base = Offset(c.dx + r * x, c.dy - r * (0.66 - (x + 0.6) * 0.02));
    final d = Offset(math.cos(a), math.sin(a));
    final n = Offset(-d.dy, d.dx);
    final len = r * 0.5;
    final mouth = base + d * len;
    final tube = Path()
      ..moveTo((base + n * r * 0.025).dx, (base + n * r * 0.025).dy)
      ..lineTo((mouth + n * r * 0.07).dx, (mouth + n * r * 0.07).dy)
      ..lineTo((mouth - n * r * 0.07).dx, (mouth - n * r * 0.07).dy)
      ..lineTo((base - n * r * 0.025).dx, (base - n * r * 0.025).dy)
      ..close();
    canvas.drawPath(tube, fill(const Color(0xFFF57C00)));
    canvas.drawPath(tube, _s(const Color(0xFFBF360C), 1.2));
    for (final s in [-1.0, 0.0, 1.0]) {
      canvas.drawOval(Rect.fromCenter(center: mouth + n * s * r * 0.06 + d * r * 0.03, width: r * 0.08, height: r * 0.08), fill(const Color(0xFFFF8F00)));
    }
    canvas.drawLine(mouth - d * r * 0.05, mouth + d * r * 0.1, _s(const Color(0xFFFFEB3B), 1.6));
  }
  // Sunbird hovering, its curved bill in a flower.
  final body = _p(c, r, 0.45, 0.25);
  canvas.drawOval(Rect.fromCenter(center: body, width: r * 0.34, height: r * 0.17), fill(const Color(0xFF1A237E)));
  canvas.drawOval(Rect.fromCenter(center: body + Offset(r * 0.03, r * 0.03), width: r * 0.2, height: r * 0.08), fill(const Color(0xFFFFC107)));
  final head = body + Offset(-r * 0.19, -r * 0.06);
  canvas.drawCircle(head, r * 0.07, fill(const Color(0xFF283593)));
  canvas.drawCircle(head + Offset(-r * 0.02, -r * 0.015), r * 0.012, fill(Colors.white));
  canvas.drawPath(
      Path()
        ..moveTo(head.dx - r * 0.06, head.dy)
        ..quadraticBezierTo(head.dx - r * 0.18, head.dy + r * 0.02, head.dx - r * 0.25, head.dy + r * 0.1),
      _s(const Color(0xFF212121), r * 0.014));
  canvas.drawPath(
      Path()
        ..moveTo(body.dx, body.dy - r * 0.05)
        ..quadraticBezierTo(body.dx + r * 0.1, body.dy - r * 0.35, body.dx + r * 0.25, body.dy - r * 0.3)
        ..quadraticBezierTo(body.dx + r * 0.12, body.dy - r * 0.12, body.dx + r * 0.05, body.dy),
      fill(const Color(0xFF3949AB)));
  canvas.drawLine(body + Offset(r * 0.16, 0), body + Offset(r * 0.36, r * 0.05), _s(const Color(0xFF1A237E), r * 0.03));
  _call(canvas, on, c, r, -0.35, -0.25, 0.3, -0.9, tr('Long tubular corolla, bright red-orange'));
  _call(canvas, on, c, r, -0.1, -0.12, -0.55, 0.5, tr('Plenty of dilute nectar'));
  _call(canvas, on, c, r, 0.27, 0.2, 0.4, 0.75, tr('Sunbird: pollen sticks to its head'));
}

// ------------------------------------------------------------------ kits

final specimens = <String, Specimen>{
  for (final s in [
    Specimen('bacteria', () => tr('Bacteria (Gram-stained smear)'), () => tr('Kingdom Monera'), () => tr('Unicellular prokaryotes, no nucleus; rods (bacilli) and spheres (cocci).'), _bacteria, light: Color(0xFFF7F3FA)),
    Specimen('spirogyra', () => tr('Spirogyra'), () => tr('Plant kingdom · Algae (Chlorophyceae)'), () => tr('Unbranched green filament; ribbon-shaped spiral chloroplasts with pyrenoids.'), _spirogyra, light: Color(0xFFF1F8EC)),
    Specimen('rhizopus', () => tr('Rhizopus (bread mould)'), () => tr('Kingdom Fungi · Phycomycetes'), () => tr('Aseptate hyphae; black round sporangia on erect sporangiophores; rhizoids.'), _rhizopus),
    Specimen('yeast', () => tr('Yeast'), () => tr('Kingdom Fungi · Ascomycetes'), () => tr('Unicellular, oval cells reproducing by budding.'), _yeast),
    Specimen('agaricus', () => tr('Agaricus (mushroom)'), () => tr('Kingdom Fungi · Basidiomycetes'), () => tr('Fruiting body with an umbrella-shaped cap, gills underneath and a stalk with a ring.'), _mushroom, slide: false),
    Specimen('funaria', () => tr('Funaria (moss)'), () => tr('Plant kingdom · Bryophyta'), () => tr('Leafy gametophyte with rhizoids; the sporophyte (seta and capsule) grows on it.'), _funaria, slide: false),
    Specimen('fern', () => tr('Fern (Nephrolepis)'), () => tr('Plant kingdom · Pteridophyta'), () => tr('Pinnate fronds with sori on the underside; underground rhizome; vascular tissue.'), _fern, slide: false),
    Specimen('pinus', () => tr('Pinus'), () => tr('Plant kingdom · Gymnosperms'), () => tr('Needle leaves in clusters on dwarf shoots; naked seeds on woody female cones.'), _pinus, slide: false),
    Specimen('amoeba', () => tr('Amoeba'), () => tr('Kingdom Protista · Sarcodines'), () => tr('Single cell with no fixed shape; moves and feeds by pseudopodia; contractile vacuole.'), _amoeba, light: Color(0xFFF2F4FB)),
    Specimen('paramecium', () => tr('Paramecium'), () => tr('Kingdom Protista · Ciliates'), () => tr('Slipper-shaped cell covered with cilia; oral groove; macro- and micronucleus.'), _paramecium, light: Color(0xFFF4F1FA)),
    Specimen('hydra', () => tr('Hydra'), () => tr('Kingdom Animalia · Cnidaria'), () => tr('Tubular polyp with a ring of tentacles round the mouth; reproduces by budding.'), _hydra, light: Color(0xFFF1F8EC)),
    Specimen('liverfluke', () => tr('Liver fluke (Fasciola)'), () => tr('Kingdom Animalia · Platyhelminthes'), () => tr('Flat, leaf-like body; oral and ventral suckers; parasite in the liver.'), _liverfluke, slide: false),
    Specimen('ascaris', () => tr('Ascaris (roundworm)'), () => tr('Kingdom Animalia · Aschelminthes'), () => tr('Long, unsegmented, cylindrical; sexes separate, the male with a curved tail.'), _ascaris, slide: false),
    Specimen('earthworm', () => tr('Earthworm (Pheretima)'), () => tr('Kingdom Animalia · Annelida'), () => tr('Body divided into ring-like segments; clitellum in segments 14–16.'), _earthworm, slide: false),
    Specimen('cockroach', () => tr('Cockroach (Periplaneta)'), () => tr('Kingdom Animalia · Arthropoda'), () => tr('Jointed legs, chitinous exoskeleton; head, thorax and abdomen; antennae.'), _cockroach, slide: false),
    Specimen('starfish', () => tr('Starfish (Asterias)'), () => tr('Kingdom Animalia · Echinodermata'), () => tr('Five arms round a central disc (radial symmetry); spiny skin; tube feet.'), _starfish, slide: false),
    Specimen('fish', () => tr('Rohu (Labeo)'), () => tr('Kingdom Animalia · Chordata · Pisces'), () => tr('Streamlined body with scales and fins; gills under an operculum.'), _fish, slide: false),
    Specimen('dicot-stem', () => tr('T.S. of a dicot stem (sunflower)'), () => tr('Anatomy of flowering plants'), () => tr('Vascular bundles in a ring, conjoint, open (with cambium); a large pith.'), (cv, c, r, on) => _tsStem(cv, c, r, on, monocot: false)),
    Specimen('monocot-stem', () => tr('T.S. of a monocot stem (maize)'), () => tr('Anatomy of flowering plants'), () => tr('Many vascular bundles scattered in ground tissue, closed (no cambium); no pith.'), (cv, c, r, on) => _tsStem(cv, c, r, on, monocot: true)),
    Specimen('dicot-root', () => tr('T.S. of a dicot root (bean)'), () => tr('Anatomy of flowering plants'), () => tr('Radial bundles; 2–4 xylem groups (tetrarch); small or no pith.'), (cv, c, r, on) => _tsRoot(cv, c, r, on, monocot: false)),
    Specimen('monocot-root', () => tr('T.S. of a monocot root (maize)'), () => tr('Anatomy of flowering plants'), () => tr('Radial bundles; many xylem groups (polyarch); a large pith.'), (cv, c, r, on) => _tsRoot(cv, c, r, on, monocot: true)),
    Specimen('dicot-leaf', () => tr('V.S. of a dicot leaf'), () => tr('Anatomy of flowering plants'), () => tr('Dorsiventral: palisade below the upper epidermis, spongy cells above the lower; more stomata below.'), _tsLeaf),
    Specimen('squamous', () => tr('Squamous epithelium'), () => tr('Animal tissue · Epithelial'), () => tr('A single layer of thin, flat, polygonal cells; lines blood vessels and air sacs.'), _squamous, light: Color(0xFFF3F7FC)),
    Specimen('columnar', () => tr('Columnar epithelium'), () => tr('Animal tissue · Epithelial'), () => tr('Tall cells with basal nuclei on a basement membrane; goblet cells; lines the intestine.'), _columnar),
    Specimen('striated', () => tr('Striated (skeletal) muscle'), () => tr('Animal tissue · Muscular'), () => tr('Long cylindrical fibres with dark and light bands and many peripheral nuclei; voluntary.'), _striated),
    Specimen('smooth', () => tr('Smooth muscle'), () => tr('Animal tissue · Muscular'), () => tr('Spindle-shaped cells with one central nucleus and no striations; involuntary.'), _smooth),
    Specimen('neuron', () => tr('Neuron (nerve cell)'), () => tr('Animal tissue · Neural'), () => tr('Cell body with dendrites and a long axon ending in terminals.'), _neuron),
    Specimen('blood', () => tr('Human blood smear'), () => tr('Animal tissue · Connective (fluid)'), () => tr('Many biconcave RBCs without nuclei, a few nucleated WBCs, and platelets.'), _blood, light: Color(0xFFFFF7F7)),
    Specimen('testis', () => tr('T.S. of testis'), () => tr('Human reproduction'), () => tr('Seminiferous tubules lined by spermatogenic cells, sperms in the lumen; Leydig cells between.'), _testis),
    Specimen('ovary', () => tr('T.S. of ovary'), () => tr('Human reproduction'), () => tr('Follicles at different stages: primary, Graafian with an antrum; corpus luteum.'), _ovary),
    Specimen('blastula', () => tr('Blastocyst (blastula)'), () => tr('Human reproduction · Embryology'), () => tr('Hollow ball: trophoblast outside, inner cell mass at one side, blastocoel within.'), _blastula),
    Specimen('pollen', () => tr('Pollen grain'), () => tr('Sexual reproduction in flowering plants'), () => tr('Two-layered wall: spiny exine with germ pores; vegetative and generative cells.'), _pollen),
    Specimen('entamoeba', () => tr('Entamoeba histolytica'), () => tr('Disease: amoebiasis (amoebic dysentery)'), () => tr('Amoeba with ingested red blood cells; spread through contaminated food and water.'), _entamoeba, light: Color(0xFFF2F4FB)),
    Specimen('plasmodium', () => tr('Plasmodium in blood'), () => tr('Disease: malaria'), () => tr('Signet-ring stages inside red blood cells; spread by the female Anopheles mosquito.'), _plasmodium, light: Color(0xFFFFF7F7)),
    Specimen('ascaris-disease', () => tr('Ascaris (roundworm)'), () => tr('Disease: ascariasis'), () => tr('Intestinal roundworm; eggs spread through soil, water and unwashed vegetables.'), _ascaris, slide: false),
    Specimen('trichophyton', () => tr('Trichophyton'), () => tr('Disease: ringworm'), () => tr('Fungal hyphae and spores; infects skin, nails and scalp; spreads by contact.'), _trichophyton),
    Specimen('forelimbs', () => tr('Forelimbs of human, whale and bat'), () => tr('Evolution · Homologous organs'), () => tr('Same bones in the same plan (humerus, radius–ulna, carpals, digits) but different uses: divergent evolution.'), _forelimbs, slide: false),
    Specimen('opuntia', () => tr('Opuntia'), () => tr('Adaptation · Xerophyte'), () => tr('Flat green stem (phylloclade) for photosynthesis; leaves reduced to spines; thick cuticle.'), _opuntia, slide: false),
    Specimen('meiosis-prophase', () => tr('Meiosis: prophase I (diakinesis)'), () => tr('Meiosis I'), () => tr('Homologous chromosomes paired as bivalents, joined at chiasmata where crossing over happened.'), _prophase1, light: Color(0xFFFBF3F6)),
    Specimen('meiosis-metaphase', () => tr('Meiosis: metaphase I'), () => tr('Meiosis I'), () => tr('Bivalents on the equator, the two homologues of each pair facing opposite poles.'), _metaphase1, light: Color(0xFFFBF3F6)),
    Specimen('meiosis-anaphase', () => tr('Meiosis: anaphase I'), () => tr('Meiosis I (reduction division)'), () => tr('Whole homologous chromosomes, each of two chromatids, move to opposite poles.'), _anaphase1, light: Color(0xFFFBF3F6)),
    Specimen('meiosis-dyad', () => tr('Meiosis: telophase I (dyad)'), () => tr('Meiosis I'), () => tr('Two cells, each with half the chromosome number (n), each chromosome still of two chromatids.'), _dyad, light: Color(0xFFFBF3F6)),
    Specimen('meiosis-anaphase2', () => tr('Meiosis: anaphase II'), () => tr('Meiosis II (equational division)'), () => tr('In both cells at once the sister chromatids separate, as in mitosis.'), _anaphase2, light: Color(0xFFFBF3F6)),
    Specimen('meiosis-tetrad', () => tr('Meiosis: tetrad (telophase II)'), () => tr('Meiosis II'), () => tr('Four haploid cells from one mother cell: in an anther they become pollen grains.'), _tetrad, light: Color(0xFFFBF3F6)),
    Specimen('maize', () => tr('Maize (wind-pollinated)'), () => tr('Pollination · Anemophily'), () => tr('Small dull flowers without scent or nectar; anthers hang out; light dry pollen in large amounts; large feathery stigmas.'), _maize, slide: false),
    Specimen('salvia', () => tr('Salvia (insect-pollinated)'), () => tr('Pollination · Entomophily'), () => tr('Large bright two-lipped corolla with nectar; the lower lip is a landing platform; the lever stamens dust the bee’s back.'), _salvia, slide: false),
    Specimen('bird-flower', () => tr('Bignonia (bird-pollinated)'), () => tr('Pollination · Ornithophily'), () => tr('Tubular, bright red-orange flowers with much nectar and no scent; sunbirds carry the pollen on their heads.'), _birdFlower, slide: false),
    Specimen('eichhornia', () => tr('Eichhornia (water hyacinth)'), () => tr('Adaptation · Hydrophyte'), () => tr('Swollen spongy petioles full of air keep it afloat; fibrous roots hang in water.'), _eichhornia, slide: false),
  ])
    s.id: s,
};

const specimenKits = <String, List<String>>{
  'diversity-plants': ['bacteria', 'spirogyra', 'rhizopus', 'yeast', 'agaricus', 'funaria', 'fern', 'pinus'],
  'diversity-animals': ['amoeba', 'paramecium', 'hydra', 'liverfluke', 'ascaris', 'earthworm', 'cockroach', 'starfish', 'fish'],
  'plant-anatomy': ['dicot-stem', 'monocot-stem', 'dicot-root', 'monocot-root', 'dicot-leaf'],
  'animal-tissues': ['squamous', 'columnar', 'striated', 'smooth', 'neuron', 'blood'],
  'reproduction': ['testis', 'ovary', 'blastula', 'pollen'],
  'pathogens': ['entamoeba', 'plasmodium', 'ascaris-disease', 'trichophyton'],
  'adaptations': ['forelimbs', 'opuntia', 'eichhornia'],
  'meiosis': ['meiosis-prophase', 'meiosis-metaphase', 'meiosis-anaphase', 'meiosis-dyad', 'meiosis-anaphase2', 'meiosis-tetrad'],
  'pollination': ['maize', 'salvia', 'bird-flower'],
};

/// Study of slides and specimens: choose one, look (with labels if wanted),
/// and record what it is, where it belongs and how it is recognised.
class SpecimenBench extends LabBench with LabDemo {
  const SpecimenBench();

  @override
  String get kind => 'specimens';

  @override
  LabParams get defaults => {'kit': 'diversity-plants', 'item': '', 'labels': false};

  @override
  LabParams get preview => {...defaults, 'labels': true};

  static List<String> kitOf(LabParams p) => specimenKits[pStr(p, 'kit', 'diversity-plants')] ?? specimenKits['diversity-plants']!;
  static Specimen itemOf(LabParams p) {
    final k = kitOf(p), i = pStr(p, 'item');
    return specimens[k.contains(i) ? i : k.first]!;
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('item', tr('Slide or specimen'), [for (final id in kitOf(p)) (id, specimens[id]!.name())]),
        LabToggle('labels', tr('Show the labelled parts')),
      ];

  @override
  List<LabColumn> get columns => [LabColumn(tr('Slide or specimen')), LabColumn(tr('Classification')), LabColumn(tr('Identifying features'))];

  @override
  LabReading read(LabParams p) {
    final s = itemOf(p);
    return LabReading.row([s.name(), s.group(), s.features()]);
  }

  @override
  List<String> live(LabParams p) => [itemOf(p).name(), itemOf(p).slide ? tr('Compound microscope, ×100') : tr('Museum specimen')];

  @override
  List<LabParams> demo(LabParams start) => [for (final id in kitOf(start)) {...start, 'item': id, 'labels': true}];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final seen = {for (final r in rows) r[0]};
    final all = <String>{};
    for (final k in specimenKits.values) {
      for (final id in k) {
        all.add(specimens[id]!.name());
      }
    }
    final groups = {for (final r in rows) r[1]};
    return tr('{n} studied and identified: {list}. Groups seen: {g}.', {'n': seen.length, 'list': seen.join(', '), 'g': groups.join('; ')});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = itemOf(p);
    final on = pBool(p, 'labels');
    final c = Offset(w * 0.36, h * 0.5);
    final r = math.min(w * 0.3, h * 0.42);
    _labels.clear();
    if (s.slide) {
      Kit.field(canvas, c, r, s.light, (cv) => s.draw(cv, c, r * 0.92, on), caption: tr('Compound microscope, ×100'));
    } else {
      // A museum jar or herbarium card.
      final card = RRect.fromRectAndRadius(Rect.fromCircle(center: c, radius: r * 1.02), const Radius.circular(18));
      canvas.drawRRect(card.shift(const Offset(4, 6)), fill(const Color(0x1A000000)));
      canvas.drawRRect(card, fill(const Color(0xFFFFFEFA)));
      canvas.drawRRect(card, stroke(const Color(0xFFD9D4C7), 1.5));
      canvas.save();
      canvas.clipRRect(card);
      s.draw(canvas, c, r * 0.86, on);
      canvas.restore();
      label(canvas, tr('Museum specimen'), Offset(c.dx, card.bottom + 20), size: 15, color: LabInk.muted);
    }
    for (final (a, b, text, size) in _labels) {
      Kit.callout(canvas, a, b, text, size: size);
    }
    _labels.clear();
    Kit.card(canvas, Offset(w * 0.72, h * 0.12), w * 0.26, s.name(), [s.group(), if (on) s.features()], size: 15);
  }
}
