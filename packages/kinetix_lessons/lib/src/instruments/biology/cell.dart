import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Cell explorer (1st PUC Biology ch. 8, Cell: the unit of life): labelled animal, plant and
/// bacterial cells (tap a part to read its role), the compound microscope, surface-to-volume
/// ratio, and transport across the plasma membrane.
///
/// Preset: {"mode": "animal"|"plant"|"prokaryote"|"microscope"|"sav"|"membrane", "focus": part id,
/// "objective": 40, "eyepiece": 10, "image": 20 (mm), "d": 10 (µm), "dc": 4, "vmax": 6, "km": 2,
/// "D": 0.6, "active": false}.
class CellInstrument extends StatefulWidget {
  const CellInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<CellInstrument> createState() => _CellState();
}

class _CellState extends BioState<CellInstrument> {
  @override
  String get instrumentId => 'bio-cell';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['animal', 'plant', 'prokaryote', 'microscope', 'sav', 'membrane'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Animal cell': {'mode': 'animal'},
    'Plant cell': {'mode': 'plant'},
    'Bacterial cell': {'mode': 'prokaryote'},
    'Mitochondrion': {'mode': 'animal', 'focus': 'mito'},
    'Chloroplast': {'mode': 'plant', 'focus': 'chloro'},
    'Microscope': {'mode': 'microscope'},
    'Surface : volume': {'mode': 'sav'},
    'Membrane transport': {'mode': 'membrane'},
  };
  @override
  Map<String, Object> defaults(String mode) => switch (mode) {
    'microscope' => {'objective': 40, 'eyepiece': 10, 'image': 20},
    'sav' => {'d': 10},
    'membrane' => {'dc': 4, 'vmax': 6, 'km': 2, 'D': 0.6, 'active': false, 'molecule': 'glucose'},
    _ => {},
  };

  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) {
    return switch (mode) {
      'microscope' => _microscope(),
      'sav' => _sav(),
      'membrane' => _membrane(),
      _ => _cell(),
    };
  }

  // ---------------------------------------------------------------- cells

  Widget _cell() {
    final focus = s['focus'];
    final kind = mode;
    final count = {'animal': 'Eukaryotic · 80S ribosomes', 'plant': 'Eukaryotic · 80S ribosomes', 'prokaryote': 'Prokaryotic · 70S ribosomes'}[kind]!;
    return frame(
      title: {'animal': 'An animal cell', 'plant': 'A plant cell', 'prokaryote': 'A bacterial (prokaryotic) cell'}[kind]!,
      subtitle: '1st PUC Biology · Cell: the unit of life',
      readouts: [
        Readout('Cell type', kind == 'prokaryote' ? 'Prokaryotic' : 'Eukaryotic', '', IX.accent),
        Readout('Typical size', kind == 'prokaryote' ? '1–2' : (kind == 'plant' ? '10–100' : '10–30'), 'µm'),
        Readout('Nuclear membrane', kind == 'prokaryote' ? 'Absent' : 'Present', '', kind == 'prokaryote' ? IX.positive : IX.green),
        Readout('Ribosomes', count.split('· ').last),
      ],
      controls: [
        choice('kind', 'Cell', const {'animal': 'Animal', 'plant': 'Plant', 'prokaryote': 'Bacterium'}),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a part on the diagram to highlight it and read its role.', style: IX.text(17, c: IX.inkSoft))),
      ],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() {
          if (id == null || id == s['focus']) {
            s.remove('focus');
          } else {
            s['focus'] = id;
          }
        });
      },
      painter: BioPainter((c, size) => _paintCell(c, size, kind, focus)),
    );
  }

  @override
  void set(String k, Object x) {
    if (k == 'kind') {
      setState(() {
        apply({'mode': x});
        active = null;
      });
      return;
    }
    super.set(k, x);
  }

  @override
  void apply(Map<String, dynamic> p) {
    super.apply(p);
    if (['animal', 'plant', 'prokaryote'].contains(mode)) s['kind'] = mode;
  }

  void _paintCell(Canvas c, Size size, String kind, String? focus) {
    final infoH = 118.0;
    final area = Rect.fromLTRB(0, 0, size.width, size.height - infoH - 30);
    final cx = area.center.dx, cy = area.center.dy + 6;
    final k = math.min((area.width - 560) / 760, (area.height - 60) / 600).clamp(0.5, 1.2);
    final rx = 380 * k, ry = 290 * k;
    final ctr = Offset(cx, cy);
    final parts = switch (kind) {
      'plant' => _plant(c, ctr, rx, ry, k),
      'prokaryote' => _bacterium(c, ctr - Offset(rx * 0.08, 0), rx * 0.78, ry * 0.6, k),
      _ => _animal(c, ctr, rx, ry, k),
    };
    _parts = parts;
    _labels = layoutLabels(parts, midX: cx, leftX: cx - rx - 70, rightX: cx + rx + 70, top: 40, bottom: area.bottom - 10);
    drawLabels(c, parts, _labels, focus);
    final sel = parts.where((p) => p.id == focus).firstOrNull;
    infoCard(c, Rect.fromLTWH(24, size.height - infoH - 18, size.width - 48, infoH), sel);
  }

  Offset _at(Offset c, double rx, double ry, double fx, double fy) => c + Offset(fx * rx, fy * ry);

  void _nucleus(Canvas c, Offset at, double rx, double ry, int seed) {
    final env = Bio.blob(at, rx, ry, seed: seed, wobble: 0.04);
    Bio.soft(c, env, Bio.lighten(BioC.nucleus, 0.55), stroke: 3, edge: BioC.nucleus);
    Bio.stroke(c, Bio.blob(at, rx - 7, ry - 7, seed: seed, wobble: 0.04), BioC.nucleus.withValues(alpha: 0.7), 1.6);
    // Nuclear pores: gaps in the envelope.
    for (var a = 0.3; a < 2 * math.pi; a += 0.9) {
      c.drawCircle(at + Offset(math.cos(a) * (rx - 3.5), math.sin(a) * (ry - 3.5)), 3.4, Paint()..color = Bio.lighten(BioC.nucleus, 0.75));
    }
    final r = math.Random(seed);
    final chrom = Paint()..color = BioC.chromatin.withValues(alpha: 0.55)..strokeWidth = 2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    for (var i = 0; i < 16; i++) {
      final p0 = at + Offset((r.nextDouble() - 0.5) * rx * 1.3, (r.nextDouble() - 0.5) * ry * 1.3);
      final path = Path()..moveTo(p0.dx, p0.dy)..relativeQuadraticBezierTo(r.nextDouble() * 20 - 10, r.nextDouble() * 20 - 10, r.nextDouble() * 26 - 13, r.nextDouble() * 26 - 13);
      c.drawPath(path, chrom);
    }
    Bio.soft(c, Bio.blob(at + Offset(rx * 0.18, -ry * 0.12), rx * 0.27, ry * 0.25, seed: seed + 3), BioC.nucleolus, stroke: 0, shadow: false, light: 0.3);
  }

  void _mito(Canvas c, Offset at, double len, double rot, double k) {
    final w = 26 * k;
    final outer = Bio.blob(at, len / 2, w, seed: 4, wobble: 0.03, rot: rot);
    Bio.soft(c, outer, BioC.mito, stroke: 2.4);
    final inner = Bio.blob(at, len / 2 - 6 * k, w - 6 * k, seed: 4, wobble: 0.03, rot: rot);
    Bio.fill(c, inner, Bio.lighten(BioC.mito, 0.45));
    // Cristae: folds of the inner membrane.
    c.save();
    c.clipPath(inner);
    final u = Offset(math.cos(rot), math.sin(rot)), n = Offset(-u.dy, u.dx);
    final crista = Paint()..color = Bio.darken(BioC.mito, 0.15)..strokeWidth = 2.6..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    for (var t = -len / 2 + 14 * k; t < len / 2 - 8 * k; t += 15 * k) {
      final side = ((t / (15 * k)).round() % 2 == 0) ? 1.0 : -1.0;
      final base = at + u * t + n * side * (w - 6 * k);
      final tip = at + u * (t + 3 * k) - n * side * (w * 0.15);
      c.drawLine(base, tip, crista);
    }
    c.restore();
  }

  void _golgi(Canvas c, Offset at, double k, {double rot = 0}) {
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(rot);
    for (var i = 0; i < 5; i++) {
      final y = (i - 2) * 13 * k, w = (70 - (i - 2).abs() * 8) * k;
      final p = Path()
        ..moveTo(-w, y - 2 * k)
        ..quadraticBezierTo(0, y + 16 * k, w, y - 2 * k)
        ..quadraticBezierTo(w + 6 * k, y + 3 * k, w, y + 6 * k)
        ..quadraticBezierTo(0, y + 24 * k, -w, y + 6 * k)
        ..quadraticBezierTo(-w - 6 * k, y + 3 * k, -w, y - 2 * k)
        ..close();
      Bio.soft(c, p, BioC.golgi, stroke: 1.6, shadow: i == 0);
    }
    for (final v in [const Offset(84, -10), const Offset(92, 14), const Offset(-86, 22), const Offset(78, 40)]) {
      Bio.soft(c, Path()..addOval(Rect.fromCircle(center: v * k, radius: 7 * k)), BioC.golgi, stroke: 1.2, shadow: false);
    }
    c.restore();
  }

  void _rer(Canvas c, Offset nuc, double r0, double a0, double a1, double k, {bool ribosomes = true}) {
    for (var i = 0; i < 3; i++) {
      final r = r0 + i * 22 * k;
      final rect = Rect.fromCircle(center: nuc, radius: r);
      final p = Path()..addArc(rect, a0 + i * 0.05, a1 - a0 - i * 0.1);
      c.drawPath(p, Paint()..color = Bio.lighten(BioC.er, 0.35)..style = PaintingStyle.stroke..strokeWidth = 11 * k..strokeCap = StrokeCap.round);
      c.drawPath(p, Paint()..color = BioC.er..style = PaintingStyle.stroke..strokeWidth = 1.6);
      if (ribosomes) {
        for (var a = a0 + i * 0.05 + 0.04; a < a1 - i * 0.05; a += 0.085) {
          for (final off in [-7.5 * k, 7.5 * k]) {
            c.drawCircle(nuc + Offset(math.cos(a), math.sin(a)) * (r + off), 2.6 * k, Paint()..color = BioC.ribo);
          }
        }
      }
    }
  }

  void _ser(Canvas c, Offset at, double k) {
    final pts = [for (var i = 0; i < 7; i++) at + Offset((i - 3) * 22 * k, (i.isEven ? -1 : 1) * 16 * k)];
    final p = Bio.smooth(pts, closed: false);
    c.drawPath(p, Paint()..color = Bio.lighten(BioC.er, 0.35)..style = PaintingStyle.stroke..strokeWidth = 12 * k..strokeCap = StrokeCap.round);
    c.drawPath(p, Paint()..color = BioC.er..style = PaintingStyle.stroke..strokeWidth = 1.4..strokeCap = StrokeCap.round);
    final p2 = Bio.smooth([for (var i = 0; i < 5; i++) at + Offset((i - 2) * 24 * k + 10 * k, 34 * k + (i.isEven ? 1 : -1) * 12 * k)], closed: false);
    c.drawPath(p2, Paint()..color = Bio.lighten(BioC.er, 0.35)..style = PaintingStyle.stroke..strokeWidth = 12 * k..strokeCap = StrokeCap.round);
    c.drawPath(p2, Paint()..color = BioC.er..style = PaintingStyle.stroke..strokeWidth = 1.4);
  }

  void _ribosomes(Canvas c, Offset ctr, double rx, double ry, int seed, bool Function(Offset) ok) {
    final r = math.Random(seed);
    var placed = 0;
    for (var t = 0; t < 400 && placed < 60; t++) {
      final p = ctr + Offset((r.nextDouble() * 2 - 1) * rx, (r.nextDouble() * 2 - 1) * ry);
      if (!ok(p)) continue;
      c.drawCircle(p, 3, Paint()..color = BioC.ribo.withValues(alpha: 0.85));
      placed++;
    }
  }

  void _chloroplast(Canvas c, Offset at, double len, double rot, double k) {
    final w = 30 * k;
    final body = Bio.blob(at, len / 2, w, seed: 7, wobble: 0.03, rot: rot);
    Bio.soft(c, body, BioC.chloro, stroke: 2.2, edge: BioC.chloroDark);
    final u = Offset(math.cos(rot), math.sin(rot)), n = Offset(-u.dy, u.dx);
    c.save();
    c.clipPath(body);
    // Stroma lamellae connecting the grana.
    c.drawLine(at - u * len * 0.42, at + u * len * 0.42, Paint()..color = BioC.chloroDark.withValues(alpha: 0.6)..strokeWidth = 1.6);
    for (var g = -1; g <= 1; g++) {
      final gc = at + u * (g * len * 0.28) + n * ((g == 0 ? -4.0 : 4.0) * k);
      for (var t = -3; t <= 3; t++) {
        final tc = gc + n * (t * 4.6 * k);
        final a = tc - u * 11 * k, b = tc + u * 11 * k;
        c.drawLine(a, b, Paint()..color = BioC.chloroDark..strokeWidth = 3.4 * k..strokeCap = StrokeCap.round);
      }
    }
    c.restore();
  }

  List<BioPart> _animal(Canvas c, Offset ctr, double rx, double ry, double k) {
    final cell = Bio.blob(ctr, rx, ry, seed: 11, wobble: 0.035, n: 14);
    // Microvilli on the upper right of the free surface.
    for (var a = -1.25; a < -0.55; a += 0.07) {
      final base = ctr + Offset(math.cos(a) * rx * 0.985, math.sin(a) * ry * 0.985);
      final u = Offset(math.cos(a), math.sin(a));
      final tip = base + u * 30 * k;
      final finger = Path()..moveTo((base - Offset(-u.dy, u.dx) * 6 * k).dx, (base - Offset(-u.dy, u.dx) * 6 * k).dy)..lineTo((tip - Offset(-u.dy, u.dx) * 5 * k).dx, (tip - Offset(-u.dy, u.dx) * 5 * k).dy)..arcToPoint(tip + Offset(-u.dy, u.dx) * 5 * k, radius: Radius.circular(5 * k))..lineTo((base + Offset(-u.dy, u.dx) * 6 * k).dx, (base + Offset(-u.dy, u.dx) * 6 * k).dy)..close();
      Bio.fill(c, finger, BioC.cytoplasm);
      Bio.stroke(c, finger, BioC.membrane, 2.2);
    }
    Bio.soft(c, cell, BioC.cytoplasm, stroke: 0, light: 0.6);
    Bio.stroke(c, cell, BioC.membrane, 4.5);
    Bio.stroke(c, Bio.blob(ctr, rx - 6, ry - 6, seed: 11, wobble: 0.035, n: 14), BioC.membrane.withValues(alpha: 0.35), 1.6);
    final nuc = _at(ctr, rx, ry, -0.08, 0.04);
    final nrx = 108 * k, nry = 94 * k;
    _rer(c, nuc, 128 * k, 0.15, 1.65, k);
    _nucleus(c, nuc, nrx, nry, 3);
    _ser(c, _at(ctr, rx, ry, 0.42, 0.52), k);
    _golgi(c, _at(ctr, rx, ry, 0.45, -0.24), k, rot: -0.3);
    final mitos = [(_at(ctr, rx, ry, -0.56, -0.42), 0.55), (_at(ctr, rx, ry, -0.62, 0.42), -0.35), (_at(ctr, rx, ry, 0.72, 0.16), 1.3)];
    for (final m in mitos) {
      _mito(c, m.$1, 110 * k, m.$2, k);
    }
    final lys = [_at(ctr, rx, ry, 0.08, -0.7), _at(ctr, rx, ry, -0.12, 0.78)];
    for (final l in lys) {
      Bio.soft(c, Path()..addOval(Rect.fromCircle(center: l, radius: 17 * k)), BioC.lyso, stroke: 2);
      final r = math.Random(l.dx.round());
      for (var i = 0; i < 6; i++) {
        c.drawCircle(l + Offset(r.nextDouble() * 16 - 8, r.nextDouble() * 16 - 8) * k, 2.2 * k, Paint()..color = Bio.lighten(BioC.lyso, 0.6));
      }
    }
    final mb = _at(ctr, rx, ry, -0.30, -0.72);
    Bio.soft(c, Path()..addOval(Rect.fromCircle(center: mb, radius: 14 * k)), const Color(0xFF9FB86A), stroke: 1.8);
    c.drawRect(Rect.fromCenter(center: mb, width: 9 * k, height: 9 * k), Paint()..color = const Color(0xFF5D7A2C));
    // Centrosome: two centrioles at right angles.
    final cen = _at(ctr, rx, ry, 0.20, -0.42);
    for (final (o, rot) in [(Offset.zero, 0.0), (Offset(26 * k, 8 * k), math.pi / 2)]) {
      c.save();
      c.translate(cen.dx + o.dx, cen.dy + o.dy);
      c.rotate(rot - 0.4);
      final r = Rect.fromCenter(center: Offset.zero, width: 34 * k, height: 15 * k);
      Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(r, Radius.circular(4 * k))), const Color(0xFF6C7FA6), stroke: 1.5);
      for (var x = -12.0; x <= 12; x += 6) {
        c.drawLine(Offset(x * k, -6 * k), Offset(x * k, 6 * k), Paint()..color = Colors.white.withValues(alpha: 0.7)..strokeWidth = 1.4);
      }
      c.restore();
    }
    final nucR = Rect.fromCenter(center: nuc, width: nrx * 2 + 120 * k, height: nry * 2 + 120 * k);
    _ribosomes(c, ctr, rx * 0.85, ry * 0.85, 5, (p) => !nucR.contains(p) && ((p - ctr).dx / rx).abs() < 0.9 && cell.contains(p) && (p - mitos[2].$1).distance > 70 * k);
    return [
      BioPart('membrane', 'Plasma membrane', _at(ctr, rx, ry, -0.62, 0.79), 'A lipid bilayer with proteins: the fluid mosaic model (Singer and Nicolson, 1972). It is selectively permeable and controls what enters and leaves.'),
      BioPart('nucleus', 'Nucleus', nuc + Offset(-nrx * 0.45, nry * 0.35), 'Holds chromatin (DNA with histone proteins). Bounded by a double nuclear envelope with pores. First described by Robert Brown in 1831.'),
      BioPart('nucleolus', 'Nucleolus', nuc + Offset(nrx * 0.18, -nry * 0.12), 'A spherical body in the nucleus, not bounded by a membrane. The site of active ribosomal RNA synthesis.'),
      BioPart('envelope', 'Nuclear envelope', nuc + Offset(-nrx * 0.55, -nry * 0.8), 'Two membranes with a perinuclear space between them; nuclear pores let RNA and protein pass between nucleus and cytoplasm.'),
      BioPart('rer', 'Rough ER', nuc + Offset(math.cos(1.2), math.sin(1.2)) * 150 * k, 'Endoplasmic reticulum studded with ribosomes; synthesis and secretion of proteins. Continuous with the outer nuclear membrane.'),
      BioPart('ser', 'Smooth ER', _at(ctr, rx, ry, 0.42, 0.52), 'ER without ribosomes; the major site of lipid synthesis. In animal cells it makes lipid-like steroidal hormones.'),
      BioPart('golgi', 'Golgi apparatus', _at(ctr, rx, ry, 0.45, -0.24), 'Stacks of flat cisternae with a cis (forming) and a trans (maturing) face. Packages materials for secretion; forms glycoproteins and glycolipids (Camillo Golgi, 1898).'),
      BioPart('mito', 'Mitochondrion', mitos[0].$1, 'Double membrane; the inner one folds into cristae. The site of aerobic respiration that makes ATP, the "powerhouse" of the cell. Has its own circular DNA and 70S ribosomes.'),
      BioPart('lyso', 'Lysosome', lys[0], 'A membrane vesicle formed by the Golgi, rich in hydrolytic enzymes (lipases, proteases, carbohydrases) that are active at acidic pH.'),
      BioPart('centriole', 'Centrioles', cen, 'Two cylindrical centrioles at right angles. Each has nine evenly spaced peripheral triplets of tubulin (cartwheel). They form the spindle apparatus in animal cells.'),
      BioPart('ribosome', 'Ribosomes', _at(ctr, rx, ry, 0.30, 0.18), 'Granules of RNA and protein without a membrane (Palade, 1953). Eukaryotic ribosomes are 80S (60S + 40S); they make proteins.'),
      BioPart('microbody', 'Microbody', mb, 'A small membrane-bound vesicle containing various enzymes; present in both plant and animal cells.'),
      BioPart('microvilli', 'Microvilli', _at(ctr, rx, ry, 0.35, -1.03), 'Finger-like extensions of the plasma membrane that increase the surface area for absorption.'),
      BioPart('cytoplasm', 'Cytoplasm', _at(ctr, rx, ry, -0.62, 0.15), 'The semi-fluid matrix in which the organelles lie: the main arena of cellular activities.'),
    ];
  }

  List<BioPart> _plant(Canvas c, Offset ctr, double rx, double ry, double k) {
    final wallT = 20 * k;
    RRect box(double inset) => RRect.fromRectAndRadius(Rect.fromCenter(center: ctr, width: 2 * rx - 2 * inset, height: 2 * ry - 2 * inset), Radius.circular(30 * k - inset * 0.5));
    // Neighbouring cells cut by the frame edge, then the middle lamella.
    final outer = box(-wallT - 4);
    c.drawRRect(outer.inflate(22), Paint()..color = Bio.lighten(BioC.wall, 0.82));
    c.drawRRect(outer, Paint()..color = const Color(0xFFB79A57)..style = PaintingStyle.stroke..strokeWidth = 3);
    final wall = Path()..addRRect(box(-wallT))..addRRect(box(0))..fillType = PathFillType.evenOdd;
    Bio.soft(c, wall, BioC.wall, stroke: 1.5, shadow: false, light: 0.3);
    final inside = box(0);
    c.drawRRect(inside, Paint()..color = BioC.cytoplasm);
    c.drawRRect(inside.deflate(3), Paint()..color = BioC.membrane..style = PaintingStyle.stroke..strokeWidth = 3);
    // Plasmodesmata through the right wall.
    for (var y = -0.5; y <= 0.5; y += 0.25) {
      final p = ctr + Offset(rx, y * ry);
      c.drawLine(p - Offset(4, 0), p + Offset(wallT + 8, 0), Paint()..color = BioC.cytoplasm..strokeWidth = 5);
      c.drawLine(p - Offset(4, 3), p + Offset(wallT + 8, -3), Paint()..color = BioC.membrane..strokeWidth = 1.2);
      c.drawLine(p - Offset(4, -3), p + Offset(wallT + 8, 3), Paint()..color = BioC.membrane..strokeWidth = 1.2);
    }
    // Central vacuole with tonoplast.
    final vac = Bio.blob(ctr + Offset(rx * 0.1, ry * 0.02), rx * 0.62, ry * 0.58, seed: 21, wobble: 0.06, n: 10);
    Bio.soft(c, vac, BioC.vacuole, stroke: 3, edge: const Color(0xFF6A9FC0), shadow: false, light: 0.5);
    final nuc = _at(ctr, rx, ry, -0.74, -0.18);
    _rer(c, nuc, 92 * k, 0.6, 2.3, k * 0.8);
    _nucleus(c, nuc, 70 * k, 84 * k, 9);
    final chl = [(_at(ctr, rx, ry, -0.18, -0.81), 0.05), (_at(ctr, rx, ry, 0.42, -0.80), -0.08), (_at(ctr, rx, ry, 0.84, -0.30), 1.5), (_at(ctr, rx, ry, 0.83, 0.36), 1.65), (_at(ctr, rx, ry, 0.30, 0.82), 0.1), (_at(ctr, rx, ry, -0.40, 0.80), -0.05), (_at(ctr, rx, ry, -0.80, 0.50), 1.4)];
    for (final ch in chl) {
      _chloroplast(c, ch.$1, 104 * k, ch.$2, k);
    }
    final mitos = [_at(ctr, rx, ry, 0.72, 0.80), _at(ctr, rx, ry, -0.80, -0.78)];
    _mito(c, mitos[0], 70 * k, 0.1, k * 0.8);
    _mito(c, mitos[1], 70 * k, 0.6, k * 0.8);
    final gol = _at(ctr, rx, ry, 0.10, -0.80);
    _golgi(c, gol, k * 0.6, rot: 0.0);
    final nucR = Rect.fromCenter(center: nuc, width: 260 * k, height: 280 * k);
    _ribosomes(c, ctr, rx * 0.92, ry * 0.92, 8, (p) => !vac.contains(p) && !nucR.contains(p) && inside.deflate(8).contains(p) && chl.every((x) => (x.$1 - p).distance > 58 * k));
    return [
      BioPart('wall', 'Cell wall', ctr + Offset(-rx * 0.35, -ry - wallT / 2), 'A rigid non-living layer outside the plasma membrane: cellulose, hemicellulose, pectins and proteins. Gives shape and protects the cell.'),
      BioPart('lamella', 'Middle lamella', ctr + Offset(-rx - wallT - 4, ry * 0.25), 'A layer mainly of calcium pectate that holds neighbouring plant cells together.'),
      BioPart('plasmodesmata', 'Plasmodesmata', ctr + Offset(rx + wallT * 0.5, ry * 0.25), 'Fine strands of cytoplasm through the cell wall and middle lamella, connecting neighbouring cells.'),
      BioPart('membrane', 'Plasma membrane', ctr + Offset(rx * 0.55, ry - 3), 'A lipid bilayer with proteins, just inside the wall; selectively permeable.'),
      BioPart('vacuole', 'Central vacuole', ctr + Offset(rx * 0.15, ry * 0.05), 'A membrane-bound space with water, sap, excretory products and other unwanted materials. Can occupy up to 90% of the volume of a plant cell.'),
      BioPart('tonoplast', 'Tonoplast', ctr + Offset(rx * 0.62, -ry * 0.25), 'The single membrane around the vacuole. It moves ions and other materials against the concentration gradient into the vacuole.'),
      BioPart('nucleus', 'Nucleus', nuc + Offset(-20 * k, 30 * k), 'Holds chromatin; bounded by a double nuclear envelope with pores. Pushed to the side by the large central vacuole.'),
      BioPart('nucleolus', 'Nucleolus', nuc + Offset(70 * k * 0.18, -84 * k * 0.12), 'Site of active ribosomal RNA synthesis; no membrane.'),
      BioPart('chloro', 'Chloroplast', chl[1].$1, 'A double-membrane plastid. Stacks of thylakoids (grana) lie in the stroma; the thylakoids hold chlorophyll, which traps light energy for photosynthesis. Has its own DNA and 70S ribosomes.'),
      BioPart('mito', 'Mitochondrion', mitos[0], 'Double membrane, inner membrane folded into cristae; the site of aerobic respiration.'),
      BioPart('golgi', 'Golgi apparatus', gol, 'Flattened cisternae that package and secrete materials; forms glycoproteins and glycolipids.'),
      BioPart('er', 'Endoplasmic reticulum', nuc + Offset(math.cos(1.5), math.sin(1.5)) * 112 * k, 'A network of tubules; rough ER (with ribosomes) makes proteins, smooth ER makes lipids.'),
      BioPart('cytoplasm', 'Cytoplasm', _at(ctr, rx, ry, -0.62, 0.32), 'A thin layer of cytoplasm lines the wall around the central vacuole; cytoplasmic streaming moves organelles.'),
    ];
  }

  List<BioPart> _bacterium(Canvas c, Offset ctr, double rx, double ry, double k) {
    RRect rod(double inset) => RRect.fromRectAndRadius(Rect.fromCenter(center: ctr, width: 2 * rx - 2 * inset, height: 2 * ry - 2 * inset), Radius.circular(ry - inset));
    // Flagellum: filament, hook and basal body at the right pole.
    final base = ctr + Offset(rx - 6, 0);
    final fl = Path()..moveTo(base.dx, base.dy);
    for (var i = 1; i <= 30; i++) {
      final t = i * 5.5 * k, w = math.sin(i * 0.5) * 18 * k * math.min(1, i / 6);
      fl.lineTo(base.dx + t * 0.8 - w * 0.6, base.dy + t * 0.6 + w * 0.8);
    }
    Bio.stroke(c, fl, const Color(0xFF7A5C3C), 3.4);
    // Pili.
    for (var a = 0.0; a < 2 * math.pi; a += 0.42) {
      if ((a - 0).abs() < 0.3 || (a - 2 * math.pi).abs() < 0.3) continue;
      final p = Offset(math.cos(a), math.sin(a));
      final o = ctr + Offset(p.dx * (rx - ry * 0.4), p.dy * ry);
      c.drawLine(o, o + p * 34 * k, Paint()..color = const Color(0xFFA48A6A)..strokeWidth = 2);
    }
    final capsule = rod(-24 * k);
    c.drawRRect(capsule, Paint()..color = const Color(0xFFF4ECD6));
    c.drawRRect(capsule, Paint()..color = const Color(0xFFCDBB8E)..style = PaintingStyle.stroke..strokeWidth = 2);
    Bio.soft(c, Path()..addRRect(rod(0)), const Color(0xFFB9A26E), stroke: 2, light: 0.3);
    final inside = rod(12 * k);
    Bio.soft(c, Path()..addRRect(inside), const Color(0xFFF7EBDC), stroke: 0, shadow: false, light: 0.5);
    c.drawRRect(inside, Paint()..color = BioC.membrane..style = PaintingStyle.stroke..strokeWidth = 3.5);
    // Mesosome: infolding of the membrane.
    final mes = ctr + Offset(-rx * 0.35, -ry + 12 * k);
    final mp = Path()..moveTo(mes.dx - 20 * k, mes.dy);
    for (var i = 0; i < 4; i++) {
      mp.relativeQuadraticBezierTo(5 * k, 30 * k, 10 * k, 0);
    }
    c.drawPath(mp, Paint()..color = BioC.membrane..style = PaintingStyle.stroke..strokeWidth = 3);
    // Nucleoid: a tangled loop of genomic DNA.
    final r = math.Random(4);
    final pts = [for (var i = 0; i < 22; i++) ctr + Offset(math.cos(i / 22 * 2 * math.pi) * rx * 0.36 * (0.6 + r.nextDouble() * 0.5), math.sin(i / 22 * 2 * math.pi * 2) * ry * 0.45 * (0.5 + r.nextDouble() * 0.5))];
    c.drawPath(Bio.smooth(pts), Paint()..color = BioC.chromatin..style = PaintingStyle.stroke..strokeWidth = 3);
    final plas = [ctr + Offset(rx * 0.55, ry * 0.30), ctr + Offset(-rx * 0.62, ry * 0.35)];
    for (final p in plas) {
      c.drawCircle(p, 16 * k, Paint()..color = BioC.dnaA..style = PaintingStyle.stroke..strokeWidth = 3);
    }
    _ribosomes(c, ctr, rx * 0.85, ry * 0.75, 3, (p) => inside.deflate(10).contains(p) && (p - ctr).distance > ry * 0.55 && plas.every((x) => (x - p).distance > 26));
    return [
      BioPart('capsule', 'Glycocalyx (capsule)', ctr + Offset(-rx * 0.2, -ry - 14 * k), 'The outermost layer. A loose sheath is called the slime layer; a thick, tough one is the capsule.'),
      BioPart('wall', 'Cell wall', ctr + Offset(rx * 0.25, ry - 6 * k), 'Lies inside the glycocalyx; determines the shape of the cell and gives strong support so it does not burst or collapse.'),
      BioPart('membrane', 'Plasma membrane', ctr + Offset(-rx * 0.62, -ry + 12 * k), 'Selectively permeable; structurally similar to that of eukaryotes.'),
      BioPart('mesosome', 'Mesosome', mes + Offset(0, 14 * k), 'An infolding of the plasma membrane: helps cell-wall formation, DNA replication and its distribution to daughter cells, respiration and secretion.'),
      BioPart('nucleoid', 'Nucleoid (genomic DNA)', ctr + Offset(rx * 0.1, 0), 'A single circular chromosome of naked DNA, not enveloped by a nuclear membrane.'),
      BioPart('plasmid', 'Plasmid', plas[0] + Offset(0, -16 * k), 'Small circular DNA outside the genomic DNA. Gives traits such as resistance to antibiotics; used to transform bacteria with foreign DNA.'),
      BioPart('ribosome', 'Ribosomes (70S)', ctr + Offset(rx * 0.62, -ry * 0.28), '70S ribosomes (50S + 30S subunits) in the cytoplasm. Several on one mRNA form a polysome.'),
      BioPart('flagellum', 'Flagellum', base + Offset(90 * k, 80 * k), 'A filament, a hook and a basal body; the bacterium uses it to move.'),
      BioPart('pili', 'Pili', ctr + Offset(-rx * 0.45, ry + 26 * k), 'Elongated tubular structures of a special protein. They play no role in motility.'),
    ];
  }

  // ---------------------------------------------------------------- microscope

  Widget _microscope() {
    final ob = n('objective'), ey = n('eyepiece'), img = n('image');
    final m = ob * ey;
    final real = img / m * 1000; // µm
    return frame(
      title: 'Measuring a cell under the microscope',
      subtitle: '1st PUC Biology · Cell: the unit of life',
      formula: 'real size = image size ÷ magnification',
      readouts: [
        Readout('Total magnification', '${f0(m)}×', '', IX.accent),
        Readout('Image size', f0(img), 'mm'),
        Readout('Real size of cell', real >= 10 ? f0(real) : f1(real), 'µm', IX.green),
        Readout('In millimetres', (real / 1000).toStringAsFixed(3), 'mm'),
      ],
      controls: [
        IxSegments<double>(label: 'Objective', options: {4.0: '4×', 10.0: '10×', 40.0: '40×', 100.0: '100×'}, value: ob, onChanged: (x) => set('objective', x)),
        IxSegments<double>(label: 'Eyepiece', options: {5.0: '5×', 10.0: '10×', 15.0: '15×'}, value: ey, onChanged: (x) => set('eyepiece', x)),
        slider('image', 'Size of the image', 2, 60, unit: 'mm'),
      ],
      painter: BioPainter((c, size) {
        _scope(c, Offset(size.width * 0.25, size.height * 0.52), math.min(size.height / 900, 1.1) * 0.9);
        final fc = Offset(size.width * 0.745, size.height * 0.47);
        final fr = math.min(size.width * 0.22, size.height * 0.38);
        Bio.heading(c, 'Field of view: human cheek cells', fc + Offset(-fr, -fr - 46));
        c.save();
        c.clipPath(Path()..addOval(Rect.fromCircle(center: fc, radius: fr)));
        c.drawCircle(fc, fr, Paint()..shader = ui.Gradient.radial(fc, fr, [const Color(0xFFFDFBF4), const Color(0xFFEDE6D2)]));
        // Image of a cheek cell scaled with the image size (1 mm of image = 6 px on the board).
        final cellR = (img * 6).clamp(10, fr * 1.3).toDouble();
        final rnd = math.Random(2);
        for (final o in [const Offset(-0.55, -0.45), const Offset(0.6, 0.5), const Offset(0.62, -0.55), const Offset(-0.6, 0.6)]) {
          final p = fc + o * fr;
          Bio.soft(c, Bio.blob(p, cellR * (0.9 + rnd.nextDouble() * 0.2), cellR * 0.8, seed: rnd.nextInt(99), wobble: 0.1, n: 9), const Color(0xFFE7D3E8), stroke: 1.6, shadow: false);
          c.drawCircle(p, cellR * 0.14, Paint()..color = BioC.nucleus);
        }
        final main = Bio.blob(fc, cellR, cellR * 0.82, seed: 5, wobble: 0.1, n: 9, rot: 0.3);
        Bio.soft(c, main, const Color(0xFFE2C8E6), stroke: 2, shadow: false);
        c.drawCircle(fc + Offset(cellR * 0.1, -cellR * 0.05), cellR * 0.15, Paint()..color = BioC.nucleus);
        c.restore();
        c.drawCircle(fc, fr, Paint()..color = const Color(0xFF2B2F45)..style = PaintingStyle.stroke..strokeWidth = 10);
        // Image size bar under the main cell.
        final y = fc.dy + cellR * 0.82 + 26;
        if (y < fc.dy + fr - 16) {
          final a = Offset(fc.dx - cellR, y), b = Offset(fc.dx + cellR, y);
          c.drawLine(a, b, Paint()..color = IX.accent..strokeWidth = 3);
          for (final e in [a, b]) {
            c.drawLine(e - const Offset(0, 8), e + const Offset(0, 8), Paint()..color = IX.accent..strokeWidth = 3);
          }
          IxPaint.label(c, 'image ${f0(img)} mm', Offset(fc.dx, y + 22), size: 17, color: IX.accent, w: FontWeight.w600, halo: true);
        }
        Bio.box(c, Rect.fromCenter(center: fc + Offset(0, fr + 70), width: fr * 2, height: 64), '${f0(img)} mm ÷ ${f0(m)} = ${(real / 1000).toStringAsFixed(3)} mm = ${real >= 10 ? f0(real) : f1(real)} µm', color: IX.accent, size: 21);
      }),
    );
  }

  void _scope(Canvas c, Offset at, double k) {
    c.save();
    c.translate(at.dx, at.dy);
    c.scale(k);
    const metal = Color(0xFF3A4157);
    Path rr(Rect r, double rad) => Path()..addRRect(RRect.fromRectAndRadius(r, Radius.circular(rad)));
    Bio.soft(c, rr(const Rect.fromLTWH(-150, 300, 260, 40), 12), metal, light: 0.25);
    // Arm (curved limb).
    final arm = Path()..moveTo(60, 300)..quadraticBezierTo(150, 120, 70, -180)..lineTo(30, -170)..quadraticBezierTo(100, 120, 10, 300)..close();
    Bio.soft(c, arm, metal, light: 0.25);
    // Body tube, eyepiece and nosepiece.
    c.save();
    c.translate(-20, -40);
    c.rotate(-0.12);
    Bio.soft(c, rr(const Rect.fromLTWH(-34, -260, 68, 240), 8), const Color(0xFF4B5470), light: 0.3);
    Bio.soft(c, rr(const Rect.fromLTWH(-26, -330, 52, 80), 6), const Color(0xFF2C3246), light: 0.3);
    Bio.soft(c, rr(const Rect.fromLTWH(-50, -24, 100, 30), 10), const Color(0xFF5A6380), light: 0.35);
    Bio.soft(c, rr(const Rect.fromLTWH(-14, 4, 28, 58), 5), IX.steel, light: 0.4);
    c.restore();
    // Stage with a slide and the mirror.
    Bio.soft(c, rr(const Rect.fromLTWH(-150, 90, 220, 22), 4), metal, light: 0.25);
    c.drawRect(const Rect.fromLTWH(-120, 80, 150, 10), Paint()..color = const Color(0xCCDCEBF5));
    c.drawRect(const Rect.fromLTWH(-120, 80, 150, 10), Paint()..color = IX.glassEdge..style = PaintingStyle.stroke);
    Bio.soft(c, Path()..addOval(const Rect.fromLTWH(-80, 200, 80, 30)), const Color(0xFFBFD3E3), light: 0.6);
    Bio.soft(c, Path()..addOval(const Rect.fromLTWH(48, -40, 54, 54)), const Color(0xFF59627E), light: 0.3);
    Bio.soft(c, Path()..addOval(const Rect.fromLTWH(60, 30, 38, 38)), const Color(0xFF59627E), light: 0.3);
    c.restore();
    Offset p(double x, double y) => at + Offset(x, y) * k;
    final parts = [
      BioPart('e', 'Eyepiece ${f0(n('eyepiece'))}×', p(-12, -320)),
      BioPart('t', 'Body tube', p(-8, -180)),
      BioPart('o', 'Objective ${f0(n('objective'))}×', p(-26, 10)),
      BioPart('s', 'Stage and slide', p(-110, 92)),
      BioPart('m', 'Mirror', p(-40, 215)),
      BioPart('c', 'Coarse adjustment', p(75, -13)),
      BioPart('f', 'Fine adjustment', p(79, 49)),
      BioPart('a', 'Arm', p(95, 140)),
    ];
    drawLabels(c, parts, layoutLabels(parts, midX: at.dx + 20 * k, leftX: at.dx - 200 * k, rightX: at.dx + 160 * k, top: at.dy - 340 * k, bottom: at.dy + 300 * k, gap: 46), null, size: 17);
  }

  // ---------------------------------------------------------------- surface : volume

  Widget _sav() {
    final d = n('d');
    final sa = math.pi * d * d, vol = math.pi * d * d * d / 6, ratio = 6 / d;
    return frame(
      title: 'Why cells stay small',
      subtitle: '1st PUC Biology · Cell: the unit of life',
      formula: 'sphere: SA : V = 6 ÷ d',
      readouts: [
        Readout('Diameter d', f1(d), 'µm', IX.accent),
        Readout('Surface area', sci(sa), 'µm²'),
        Readout('Volume', sci(vol), 'µm³'),
        Readout('SA : V', ratio >= 1 ? f2(ratio) : ratio.toStringAsFixed(3), 'µm⁻¹', IX.green),
      ],
      controls: [
        slider('d', 'Cell diameter', 0.3, 100, unit: 'µm', dp: 1, fmt: (x) => x < 10 ? x.toStringAsFixed(1) : x.toStringAsFixed(0)),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Mycoplasma ≈ 0.3 µm, bacteria 3–5 µm, a typical eukaryotic cell 10–20 µm, a human RBC ≈ 7 µm.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final left = Rect.fromLTWH(30, 40, size.width * 0.42, size.height - 80);
        Bio.heading(c, 'Cell drawn to scale (box = 100 µm)', left.topLeft);
        final box = Rect.fromCenter(center: left.center + const Offset(0, 20), width: left.width * 0.85, height: left.width * 0.85);
        c.drawRect(box, Paint()..color = IX.page);
        for (var t = 1; t < 10; t++) {
          final x = box.left + box.width * t / 10, y = box.top + box.height * t / 10;
          c.drawLine(Offset(x, box.top), Offset(x, box.bottom), Paint()..color = IX.grid);
          c.drawLine(Offset(box.left, y), Offset(box.right, y), Paint()..color = IX.grid);
        }
        c.drawRect(box, Paint()..color = IX.rule..style = PaintingStyle.stroke..strokeWidth = 2);
        final r = math.max(d / 100 * box.width / 2, 2.0);
        final cell = Path()..addOval(Rect.fromCircle(center: box.center, radius: r));
        Bio.soft(c, cell, const Color(0xFFE8B9A6), stroke: 2.5, edge: BioC.membrane, light: 0.6);
        if (r > 14) c.drawCircle(box.center + Offset(r * 0.15, -r * 0.1), r * 0.28, Paint()..color = BioC.nucleus.withValues(alpha: 0.8));
        // Diffusion distance arrow from surface to centre.
        if (r > 30) {
          IxPaint.arrow(c, box.center + Offset(-r, 0), box.center + Offset(-r * 0.35, 0), IX.accent, width: 3);
          IxPaint.label(c, 'O₂ diffuses in', box.center + Offset(-r + 4, -22), size: 16, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
        IxPaint.label(c, 'd = ${d < 10 ? f1(d) : f0(d)} µm', Offset(box.center.dx, box.bottom + 24), size: 18, color: IX.ink, w: FontWeight.w600);
        final plot = Plot(Rect.fromLTRB(size.width * 0.55, 100, size.width - 40, size.height - 110), 0, 100, 0, 6);
        plot.frame(c, xs: [0, 20, 40, 60, 80, 100], ys: [0, 1, 2, 3, 4, 5, 6], xLabel: 'Diameter (µm)', yLabel: 'SA : V (µm⁻¹)', title: 'Surface-to-volume ratio falls as cells grow');
        plot.curve(c, (x) => 6 / math.max(x, 0.01), IX.accent);
        plot.dot(c, d, math.min(ratio, 6), IX.accent, label: 'SA:V = ${ratio >= 1 ? f2(ratio) : ratio.toStringAsFixed(3)}', align: d > 60 ? Alignment.centerRight : Alignment.centerLeft);
      }),
    );
  }

  // ---------------------------------------------------------------- membrane

  Widget _membrane() {
    final dc = n('dc'), vmax = n('vmax'), km = n('km'), dd = n('D');
    final act = b('active');
    final mol = str('molecule', 'glucose');
    final simple = dd * dc;
    final carrier = vmax * math.max(dc, 0) / (km + math.max(dc, 0));
    final pump = vmax * 0.7;
    return frame(
      title: 'Crossing the plasma membrane',
      subtitle: '1st PUC Biology · Cell; Transport in plants',
      formula: 'carrier rate = Vmax·Δc ÷ (K + Δc)',
      readouts: [
        Readout('Simple diffusion', f2(simple), 'units/s', IX.positive),
        Readout('Carrier-mediated', f2(carrier), 'units/s', IX.accent),
        Readout('Carriers busy', '${f0(100 * math.max(dc, 0) / (km + math.max(dc, 0)))}%', ''),
        Readout(act ? 'Active (uses ATP)' : 'Concentration Δc', act ? f2(pump) : f1(dc), act ? 'units/s' : 'mM', act ? IX.green : IX.ink),
      ],
      controls: [
        choice('molecule', 'Molecule', const {'oxygen': 'O₂ / CO₂', 'glucose': 'Glucose', 'ion': 'Na⁺ / K⁺'}),
        slider('dc', 'Concentration difference', -2, 10, unit: 'mM', dp: 1, div: 120),
        slider('vmax', 'Maximum carrier rate Vmax', 1, 10, dp: 1, div: 90),
        slider('km', 'Half-saturation K', 0.5, 6, unit: 'mM', dp: 1, div: 55),
        toggle('active', 'Active transport (pump, ATP)', on: 'Show', off: 'Hide'),
      ],
      painter: BioPainter((c, size) {
        final top = Rect.fromLTWH(30, 30, size.width - 60, size.height * 0.40);
        _membraneScene(c, top, mol, dc);
        final plot = Plot(Rect.fromLTRB(110, size.height * 0.52, size.width - 60, size.height - 90), -2, 10, 0, 10);
        plot.frame(c, xs: [-2, 0, 2, 4, 6, 8, 10], ys: [0, 2, 4, 6, 8, 10], xLabel: 'Concentration difference Δc (mM)', yLabel: 'Rate of transport');
        plot.curve(c, (x) => math.max(dd * x, 0), IX.positive, label: 'simple diffusion', labelX: 8.4);
        plot.curve(c, (x) => vmax * math.max(x, 0) / (km + math.max(x, 0)), IX.accent, label: 'carrier (facilitated)', labelX: 6.5);
        plot.hline(c, vmax, IX.accent.withValues(alpha: 0.6), label: 'Vmax');
        if (act) plot.curve(c, (x) => pump, IX.green, label: 'active transport', labelX: 0.6);
        plot.vline(c, dc, IX.muted);
        plot.dot(c, dc, math.max(simple, 0), IX.positive);
        plot.dot(c, dc, carrier, IX.accent);
      }),
    );
  }

  void _membraneScene(Canvas c, Rect r, String mol, double dc) {
    final y = r.center.dy;
    Bio.bilayer(c, Offset(r.left, y), Offset(r.right, y), h: 46);
    IxPaint.label(c, 'Outside the cell', Offset(r.left + 10, r.top + 6), size: 17, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.topLeft);
    IxPaint.label(c, 'Cytoplasm', Offset(r.left + 10, r.bottom - 6), size: 17, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.bottomLeft);
    final ch = Offset(r.left + r.width * 0.30, y), ca = Offset(r.left + r.width * 0.55, y), pu = Offset(r.left + r.width * 0.80, y);
    final rnd = math.Random(9);
    final outN = (8 + dc * 2.4).clamp(2, 34).round(), inN = 8;
    final color = switch (mol) { 'oxygen' => IX.positive, 'ion' => IX.green, _ => BioC.sugar };
    for (var k = 0; k < outN; k++) {
      final p = Offset(r.left + 40 + rnd.nextDouble() * (r.width - 80), r.top + 40 + rnd.nextDouble() * (y - r.top - 80));
      c.drawCircle(p, mol == 'oxygen' ? 7 : 9, Paint()..color = color);
    }
    for (var k = 0; k < inN; k++) {
      final p = Offset(r.left + 40 + rnd.nextDouble() * (r.width - 80), y + 40 + rnd.nextDouble() * (r.bottom - y - 70));
      c.drawCircle(p, mol == 'oxygen' ? 7 : 9, Paint()..color = color.withValues(alpha: 0.7));
    }
    // Proteins: a channel, a carrier and a pump.
    for (final (p, col, name) in [(ch, const Color(0xFF6E8FC7), 'Channel protein'), (ca, const Color(0xFF8C6BB1), 'Carrier protein'), (pu, const Color(0xFF4E9A45), 'Pump (ATP)')]) {
      final l = Bio.blob(p + const Offset(-20, 0), 20, 40, seed: 3, wobble: 0.08);
      final rr = Bio.blob(p + const Offset(20, 0), 20, 40, seed: 5, wobble: 0.08);
      Bio.soft(c, l, col, stroke: 1.8);
      Bio.soft(c, rr, col, stroke: 1.8);
      IxPaint.label(c, name, p + const Offset(0, -64), size: 16, color: Bio.darken(col, 0.2), w: FontWeight.w600, halo: true);
    }
    // Where this molecule crosses.
    final via = switch (mol) { 'oxygen' => Offset(r.left + r.width * 0.12, y), 'ion' => ch, _ => ca };
    IxPaint.arrow(c, via + Offset(0, dc >= 0 ? -60 : 60), via + Offset(0, dc >= 0 ? 60 : -60), IX.ink, width: 4);
    final note = switch (mol) {
      'oxygen' => 'Small non-polar molecules (O₂, CO₂) dissolve in the lipid and cross by simple diffusion.',
      'ion' => 'Ions are polar: they need a channel, or a pump that uses ATP to move them uphill (Na⁺/K⁺ pump).',
      _ => 'Glucose is polar: it crosses with a carrier protein (facilitated diffusion), down its gradient only.',
    };
    Bio.note(c, note, Offset(r.right, r.bottom - 6), align: Alignment.bottomRight, size: 17, maxWidth: r.width * 0.55, color: IX.ink);
  }
}
