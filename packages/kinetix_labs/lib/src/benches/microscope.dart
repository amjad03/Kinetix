import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// The view down a compound microscope. The specimens are drawn from a
/// fixed random seed, so every screen shows the same cells.
class MicroscopeBench extends LabBench {
  const MicroscopeBench();

  static const slides = ['onion', 'cheek', 'stomata', 'yeast'];
  static const target = 0.64; // where the slide comes into focus

  @override
  String get kind => 'microscope';

  @override
  LabParams get defaults => {'slide': 'onion', 'mag': 10, 'coarse': 0.3, 'fine': 0.5, 'stain': false, 'labels': false};

  @override
  LabParams get preview => {...defaults, 'coarse': target, 'stain': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('slide', tr('Slide'), [for (final s in slides) (s, slideName(s))]),
        LabChoice('mag', tr('Objective'), [(10, tr('10× (low power)')), (40, tr('40× (high power)'))]),
        LabSlider('coarse', tr('Coarse focus'), 0, 1, decimals: 2),
        LabSlider('fine', tr('Fine focus'), 0, 1, decimals: 2),
        LabToggle('stain', tr('Stain ({name})', {'name': stainName(pStr(p, 'slide', 'onion'))})),
        LabToggle('labels', tr('Labels')),
      ];

  @override
  LabParams act(String action, LabParams p) {
    if (action == 'set:slide') return {...p, 'coarse': 0.3, 'fine': 0.5, 'stain': false, 'mag': 10};
    return p;
  }

  static String slideName(String s) => switch (s) {
        'cheek' => tr('Human cheek cells'),
        'stomata' => tr('Leaf peel (stomata)'),
        'yeast' => tr('Yeast'),
        _ => tr('Onion peel'),
      };

  static String stainName(String s) => s == 'onion' || s == 'stomata' ? tr('Safranin') : tr('Methylene blue');

  static String seen(String s) => switch (s) {
        'cheek' => tr('Flat, irregular cells with a nucleus in the middle; no cell wall.'),
        'stomata' => tr('Wavy-walled cells; stomata are pores between two bean-shaped guard cells with chloroplasts.'),
        'yeast' => tr('Oval cells; some have small buds growing from them.'),
        _ => tr('Brick-shaped cells in rows, each with a cell wall, a nucleus and a large vacuole.'),
      };

  /// Blur of the view (0 = sharp). High power makes a small error large.
  static double blur(LabParams p) {
    final f = pNum(p, 'coarse', 0.3) + (pNum(p, 'fine', 0.5) - 0.5) * 0.12;
    final k = pInt(p, 'mag', 10) == 40 ? 160.0 : 60.0;
    return math.min((f - target).abs() * k, 14);
  }

  static bool sharp(LabParams p) => blur(p) < 1.2;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Slide')), LabColumn(tr('Magnification')), LabColumn(tr('Stain')), LabColumn(tr('What we saw'))];

  @override
  LabReading read(LabParams p) {
    if (!sharp(p)) return LabReading.not(tr('Focus the microscope first.'));
    final s = pStr(p, 'slide', 'onion');
    return LabReading.row([slideName(s), '${pInt(p, 'mag', 10) * 10}×', pBool(p, 'stain') ? stainName(s) : tr('Unstained'), seen(s)]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Magnification {x}', {'x': '${pInt(p, 'mag', 10) * 10}×'}),
        sharp(p) ? tr('In focus') : tr('Out of focus: turn the focus knobs'),
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final seenSlides = {for (final r in rows) '${r[0]} (${r[1]})'};
    return tr('Slides studied: {list}.', {'list': seenSlides.join(', ')});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final slide = pStr(p, 'slide', 'onion');
    final mag = pInt(p, 'mag', 10);
    final stained = pBool(p, 'stain');
    final radius = math.min(w * 0.4, h * 0.44);
    final c = Offset(w * 0.46, h * 0.5);

    // Dark surround and the bright circular field.
    canvas.drawRect(Offset.zero & size, fill(const Color(0xFF0E1013)));
    final field = Path()..addOval(Rect.fromCircle(center: c, radius: radius));
    canvas.save();
    canvas.clipPath(field);
    canvas.drawRect(Offset.zero & size, fill(const Color(0xFFF7F3E6)));
    final b = blur(p);
    if (b > 0.3) {
      canvas.saveLayer(Rect.fromCircle(center: c, radius: radius), Paint()..imageFilter = ui.ImageFilter.blur(sigmaX: b, sigmaY: b));
    }
    // 1200 units across the field at 10×, 300 at 40×.
    final px = 2 * radius / (1200 / (mag / 10));
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.scale(px);
    final feats = switch (slide) {
      'cheek' => _cheek(canvas, stained),
      'stomata' => _stomata(canvas, stained),
      'yeast' => _yeast(canvas, stained),
      _ => _onion(canvas, stained),
    };
    canvas.restore();
    if (b > 0.3) canvas.restore();
    canvas.restore();
    canvas.drawCircle(c, radius, stroke(const Color(0xFF2A2E33), 6));

    // Labels, drawn sharp over the view once it is in focus.
    if (pBool(p, 'labels') && sharp(p)) {
      // Each label takes the free slot around the edge nearest its part, so
      // leader lines do not cross.
      final slots = [for (final a in const [-35.0, -145.0, 35.0, 145.0, -90.0, 90.0]) Offset(math.cos(a * math.pi / 180), math.sin(a * math.pi / 180))];
      final used = <int>{};
      for (final e in feats.entries) {
        final at = c + e.value * px;
        if ((at - c).distance > radius - 6) continue;
        final dir = at - c;
        var best = -1;
        var score = -double.infinity;
        for (var k = 0; k < slots.length; k++) {
          if (used.contains(k)) continue;
          final s = dir.distance < 1 ? -k.toDouble() : (slots[k].dx * dir.dx + slots[k].dy * dir.dy) / dir.distance;
          if (s > score) {
            score = s;
            best = k;
          }
        }
        if (best < 0) break;
        used.add(best);
        final textAt = c + slots[best] * radius * 0.74;
        canvas.drawLine(at, textAt, stroke(LabInk.accent, 2));
        canvas.drawCircle(at, 4, fill(LabInk.accent));
        label(canvas, e.key, textAt, size: 15, bold: true, color: Colors.white, halo: const Color(0xDD1B1F24));
      }
    }
    label(canvas, '${mag * 10}×', Offset(c.dx, c.dy + radius + 18), size: 15, bold: true, color: Colors.white);
    label(canvas, slideName(slide), Offset(c.dx, c.dy - radius - 18), size: 15, bold: true, color: Colors.white);
  }

  // Each specimen returns where to point its labels (in field units).

  Map<String, Offset> _onion(Canvas canvas, bool stained) {
    final rnd = math.Random(11);
    final wall = stroke(stained ? const Color(0xFFB0304A) : const Color(0xFFB7B3A6), 5);
    const cw = 150.0, ch = 52.0;
    Offset? nucleus;
    for (var row = -12; row <= 12; row++) {
      final off = row.isEven ? 0.0 : cw / 2;
      for (var col = -6; col <= 6; col++) {
        final r = Rect.fromLTWH(col * cw + off - cw / 2 + rnd.nextDouble() * 6, row * ch - ch / 2, cw - 4 + rnd.nextDouble() * 6, ch);
        canvas.drawRect(r.deflate(4), fill(stained ? const Color(0x33E7A5B8) : const Color(0x14C9C3B0)));
        // The large clear vacuole fills most of the cell.
        canvas.drawRRect(RRect.fromRectAndRadius(r.deflate(12), const Radius.circular(10)), fill(stained ? const Color(0x40FFF6F8) : const Color(0x10FFFFFF)));
        canvas.drawRect(r, wall);
        final n = Offset(r.left + 22 + rnd.nextDouble() * (r.width - 44), r.center.dy + (rnd.nextDouble() - 0.5) * 16);
        canvas.drawOval(Rect.fromCenter(center: n, width: 16, height: 13), fill(stained ? const Color(0xFF8E1F3A) : const Color(0x33857E6A)));
        if (row == 0 && col == 0) nucleus = n;
      }
    }
    return {
      tr('Cell wall'): const Offset(0, -ch / 2),
      tr('Nucleus'): nucleus ?? Offset.zero,
      tr('Vacuole'): const Offset(-40, 8),
      tr('Cytoplasm'): const Offset(cw / 2 - 10, ch / 2 - 8),
    };
  }

  Map<String, Offset> _cheek(Canvas canvas, bool stained) {
    final rnd = math.Random(23);
    Offset? centre, edge;
    final cells = <(Offset, List<Offset>)>[];
    for (var n = 0; n < 34; n++) {
      final at = n == 0 ? const Offset(10, 6) : Offset((rnd.nextDouble() - 0.5) * 1300, (rnd.nextDouble() - 0.5) * 1300);
      final pts = <Offset>[];
      final base = 70 + rnd.nextDouble() * 30;
      for (var k = 0; k < 11; k++) {
        final a = k / 11 * 2 * math.pi;
        final r = base * (0.8 + rnd.nextDouble() * 0.35);
        pts.add(at + Offset(math.cos(a), math.sin(a)) * r);
      }
      cells.add((at, pts));
    }
    for (final (at, pts) in cells) {
      final path = Path()..addPolygon(pts, true);
      canvas.drawPath(path, fill(stained ? const Color(0x404F8FD8) : const Color(0x18B5AE9A)));
      canvas.drawPath(path, stroke(stained ? const Color(0xFF3E6FB5) : const Color(0x60938C78), 2.5));
      canvas.drawCircle(at + const Offset(6, -4), 11, fill(stained ? const Color(0xFF1D3F8C) : const Color(0x40857E6A)));
      if (centre == null) {
        centre = at + const Offset(6, -4);
        edge = pts[2];
      }
    }
    return {tr('Nucleus'): centre!, tr('Cell membrane'): edge!, tr('Cytoplasm'): centre + const Offset(-36, 24)};
  }

  Map<String, Offset> _stomata(Canvas canvas, bool stained) {
    final rnd = math.Random(5);
    const step = 90.0;
    const n = 9;
    final grid = List.generate(n * 2 + 1, (i) => List.generate(n * 2 + 1, (j) => Offset((i - n) * step + (rnd.nextDouble() - 0.5) * 40, (j - n) * step + (rnd.nextDouble() - 0.5) * 40)));
    final wall = stroke(stained ? const Color(0xFFB0304A) : const Color(0xFF7E9A6E), 3.5);
    canvas.drawRect(const Rect.fromLTWH(-900, -900, 1800, 1800), fill(stained ? const Color(0x22E7A5B8) : const Color(0x1C9CC48A)));
    // Wavy walls between neighbouring points: the jigsaw of the epidermis.
    void wavy(Offset a, Offset b, int seed) {
      final d = b - a;
      final nrm = Offset(-d.dy, d.dx) / d.distance;
      final bend = (seed.isEven ? 1 : -1) * 14.0;
      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..quadraticBezierTo((a + d * 0.25 + nrm * bend).dx, (a + d * 0.25 + nrm * bend).dy, (a + d * 0.5).dx, (a + d * 0.5).dy)
        ..quadraticBezierTo((a + d * 0.75 - nrm * bend).dx, (a + d * 0.75 - nrm * bend).dy, b.dx, b.dy);
      canvas.drawPath(path, wall);
    }

    for (var i = 0; i < grid.length; i++) {
      for (var j = 0; j < grid.length; j++) {
        if (i + 1 < grid.length) wavy(grid[i][j], grid[i + 1][j], i + j);
        if (j + 1 < grid.length) wavy(grid[i][j], grid[i][j + 1], i * 3 + j);
      }
    }
    // Stomata: a pore between two bean-shaped guard cells.
    final stomata = <Offset>[const Offset(0, 0)];
    for (var k = 0; k < 9; k++) {
      stomata.add(Offset((rnd.nextDouble() - 0.5) * 1500, (rnd.nextDouble() - 0.5) * 1500));
    }
    for (final s in stomata) {
      for (final side in [-1.0, 1.0]) {
        final gc = Rect.fromCenter(center: s + Offset(side * 13, 0), width: 22, height: 50);
        canvas.drawOval(gc, fill(const Color(0xFFBFD9A6)));
        canvas.drawOval(gc, stroke(stained ? const Color(0xFFB0304A) : const Color(0xFF557A45), 3));
        for (var q = 0; q < 5; q++) {
          canvas.drawCircle(s + Offset(side * (12 + (q % 2) * 4), -16 + q * 8), 3, fill(const Color(0xFF3F8A34)));
        }
      }
      canvas.drawOval(Rect.fromCenter(center: s, width: 7, height: 30), fill(const Color(0xFF3B3A2E)));
    }
    return {
      tr('Stoma (pore)'): Offset.zero,
      tr('Guard cell'): const Offset(-15, -12),
      tr('Chloroplast'): const Offset(16, 8),
      tr('Epidermal cell'): grid[n][n] + const Offset(45, 45),
    };
  }

  Map<String, Offset> _yeast(Canvas canvas, bool stained) {
    final rnd = math.Random(17);
    final body = fill(stained ? const Color(0x664F8FD8) : const Color(0x44D8C99A));
    final edge = stroke(stained ? const Color(0xFF2F5FA8) : const Color(0xFF8C7A4A), 2.5);
    Offset? cell, bud;
    for (var n = 0; n < 70; n++) {
      final at = n == 0 ? Offset.zero : Offset((rnd.nextDouble() - 0.5) * 1300, (rnd.nextDouble() - 0.5) * 1300);
      final a = rnd.nextDouble() * math.pi;
      canvas.save();
      canvas.translate(at.dx, at.dy);
      canvas.rotate(a);
      const r = Rect.fromLTWH(-16, -12, 32, 24);
      canvas.drawOval(r, body);
      canvas.drawOval(r, edge);
      final hasBud = n == 0 || rnd.nextDouble() < 0.4;
      if (hasBud) {
        final bs = 5 + rnd.nextDouble() * 5;
        canvas.drawCircle(Offset(16 + bs * 0.8, 0), bs, body);
        canvas.drawCircle(Offset(16 + bs * 0.8, 0), bs, edge);
        if (n == 0) bud = Offset(math.cos(a), math.sin(a)) * (16 + bs * 0.8);
      }
      canvas.restore();
      if (n == 0) cell = at;
    }
    return {tr('Yeast cell'): cell!, tr('Bud'): bud!};
  }
}
