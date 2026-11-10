import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Transport and nutrition in plants (1st PUC Biology ch. 6, 20, 21): water potential and
/// plasmolysis, the ascent of sap, stomata, pressure flow in the phloem, the stomatal index,
/// the root stele and the path of water, the limiting nutrient, and the root nodule.
///
/// Preset: {"mode": "osmosis"|"ascent"|"stomata"|"phloem"|"stomatalindex"|"root"|"mineral"|"nodule",
/// "psiOut": -0.2 (MPa), "psiS": -1.0, "height": 30 (m), "transp": 50, "light": 70, "water": 70,
/// "humidity": 50, "load": 60, "unload": 40, "S": 20, "E": 80, "root": "dicot", "uptake": 50,
/// "N": 40, "P": 70, "K": 80, "Fe": 90, "o2": 20}.
class PlantTransportInstrument extends StatefulWidget {
  const PlantTransportInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<PlantTransportInstrument> createState() => _PTState();
}

class _PTState extends BioState<PlantTransportInstrument> {
  @override
  String get instrumentId => 'bio-planttransport';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['osmosis', 'ascent', 'stomata', 'phloem', 'stomatalindex', 'root', 'mineral', 'nodule'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Turgid cell': {'mode': 'osmosis', 'psiOut': 0},
    'Plasmolysis': {'mode': 'osmosis', 'psiOut': -1.6},
    'Ascent of sap': {'mode': 'ascent'},
    'Stomata': {'mode': 'stomata'},
    'Pressure flow': {'mode': 'phloem'},
    'Stomatal index': {'mode': 'stomatalindex'},
    'Root: dicot': {'mode': 'root', 'root': 'dicot'},
    'Root: monocot': {'mode': 'root', 'root': 'monocot'},
    'Limiting nutrient': {'mode': 'mineral'},
    'Root nodule': {'mode': 'nodule'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'psiOut': -0.2, 'psiS': -1.0, 'height': 30, 'transp': 50, 'light': 70, 'water': 70, 'humidity': 50, 'load': 60, 'unload': 40,
    'S': 20, 'E': 80, 'root': 'dicot', 'uptake': 50, 'N': 40, 'P': 70, 'K': 80, 'Fe': 90, 'o2': 20,
  };

  static const _sub = '1st PUC Biology · Transport in plants';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'ascent' => _ascent(),
    'stomata' => _stomata(),
    'phloem' => _phloem(),
    'stomatalindex' => _index(),
    'root' => _root(),
    'mineral' => _mineral(),
    'nodule' => _nodule(),
    _ => _osmosis(),
  };

  // ------------------------------------------------------------------ osmosis

  Widget _osmosis() {
    final out = n('psiOut'), ps = n('psiS');
    final psiP = math.max(0.0, out - ps).clamp(0.0, 0.8).toDouble();
    final plas = out < ps;
    final shrink = plas ? ((ps - out) / 1.5).clamp(0.0, 0.42).toDouble() : 0.0;
    final state = plas ? (shrink > 0.05 ? 'Plasmolysed' : 'Incipient plasmolysis') : (psiP < 0.05 ? 'Flaccid' : 'Turgid');
    final cellPsi = plas ? out : ps + psiP;
    return frame(
      title: 'Water potential and plasmolysis',
      subtitle: _sub,
      formula: 'ψw = ψs + ψp',
      readouts: [
        Readout('ψw of solution', f2(out), 'MPa', IX.accent),
        Readout('ψs of cell sap', f2(ps), 'MPa'),
        Readout('ψp (turgor)', f2(psiP), 'MPa', IX.green),
        Readout('Cell', state, '', plas ? IX.positive : IX.ink),
      ],
      controls: [
        slider('psiOut', 'Water potential of the solution', -2, 0, unit: 'MPa', dp: 2, div: 40),
        slider('psiS', 'Solute potential of cell sap', -1.5, -0.5, unit: 'MPa', dp: 2, div: 20),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Pure water has ψw = 0. Solutes make it negative; water moves from higher to lower water potential.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        // Beaker of solution.
        final b = Rect.fromLTWH(60, 70, size.width * 0.52, size.height - 140);
        final tint = Color.lerp(const Color(0xFFE4F1FA), const Color(0xFFF1E3C4), (-out / 2).clamp(0, 1))!;
        c.drawRRect(RRect.fromRectAndCorners(Rect.fromLTRB(b.left, b.top + 60, b.right, b.bottom), bottomLeft: const Radius.circular(24), bottomRight: const Radius.circular(24)), Paint()..color = tint);
        c.drawPath(Path()..moveTo(b.left, b.top)..lineTo(b.left, b.bottom - 24)..quadraticBezierTo(b.left, b.bottom, b.left + 24, b.bottom)..lineTo(b.right - 24, b.bottom)..quadraticBezierTo(b.right, b.bottom, b.right, b.bottom - 24)..lineTo(b.right, b.top), Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 4);
        IxPaint.label(c, out > -0.05 ? 'Pure water (hypotonic)' : (plas ? 'Hypertonic solution' : 'Dilute solution (hypotonic)'), Offset(b.center.dx, b.top + 30), size: 20, color: IX.ink, w: FontWeight.w700);
        // The cell: wall stays, protoplast shrinks.
        final cc = b.center + const Offset(0, 40);
        final w = b.width * 0.62, h = b.height * 0.5;
        final wall = RRect.fromRectAndRadius(Rect.fromCenter(center: cc, width: w, height: h), const Radius.circular(26));
        c.drawRRect(wall.inflate(12), Paint()..color = BioC.wall);
        c.drawRRect(wall.inflate(12), Paint()..color = Bio.darken(BioC.wall, 0.3)..style = PaintingStyle.stroke..strokeWidth = 2);
        c.drawRRect(wall, Paint()..color = tint);
        final turg = psiP / 0.8;
        final proto = Bio.blob(cc, w / 2 * (1 - shrink) - 2 + turg * 2, h / 2 * (1 - shrink * 1.1) - 2 + turg * 2, seed: 3, wobble: shrink * 0.12, n: 12);
        Bio.soft(c, proto, BioC.cytoplasm, stroke: 3, edge: BioC.membrane, light: 0.5);
        final vac = Bio.blob(cc, (w / 2 * (1 - shrink)) * 0.72, (h / 2 * (1 - shrink)) * 0.62, seed: 5, wobble: 0.04);
        Bio.soft(c, vac, BioC.vacuole, stroke: 2, edge: const Color(0xFF6A9FC0), shadow: false);
        c.drawCircle(cc + Offset(-(w / 2) * (1 - shrink) * 0.78, 0), 20, Paint()..color = BioC.nucleus);
        // Net water movement.
        final inward = cellPsi > out ? false : true;
        final net = (out - cellPsi).abs() > 0.02 || plas;
        for (final s in [-1.0, 1.0]) {
          final a = cc + Offset(s * (w / 2 + 90), 0), z = cc + Offset(s * (w / 2 + 20), 0);
          if (plas) {
            IxPaint.arrow(c, z, a, BioC.water, width: 5, head: 18);
          } else if (out > ps + 0.02 && net) {
            IxPaint.arrow(c, a, z, BioC.water, width: 5, head: 18);
          }
        }
        IxPaint.label(c, plas ? 'Water leaves the cell (exosmosis)' : (inward && psiP > 0.01 ? 'Water enters until wall pressure balances' : 'No net movement'), Offset(cc.dx, b.bottom - 40), size: 19, color: BioC.water, w: FontWeight.w700, halo: true);
        final parts = [
          BioPart('w', 'Cell wall (freely permeable)', Offset(cc.dx - w * 0.2, cc.dy - h / 2 - 6)),
          BioPart('p', 'Plasma membrane', Offset(cc.dx + (w / 2) * (1 - shrink) - 4, cc.dy + h * 0.15)),
          BioPart('v', 'Vacuole (cell sap)', cc + const Offset(30, 0)),
          if (plas && shrink > 0.05) BioPart('s', 'Space filled with outside solution', Offset(cc.dx + w / 2 - 12, cc.dy - h * 0.38)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: 0, leftX: 0, rightX: b.right + 50, top: b.top + 60, bottom: b.bottom - 40), null);
        // Water potential scale.
        final sc = Plot(Rect.fromLTRB(b.right + 80, size.height - 120, size.width - 40, size.height - 90), -2, 0, 0, 1);
        c.drawLine(sc.pt(-2, 0.5), sc.pt(0, 0.5), Paint()..color = IX.inkSoft..strokeWidth = 3);
        for (var x = -2.0; x <= 0.01; x += 0.5) {
          IxPaint.label(c, x.toStringAsFixed(1), sc.pt(x, 0.5) + const Offset(0, 22), size: 15, color: IX.inkSoft);
        }
        sc.dot(c, out, 0.5, IX.accent);
        c.drawCircle(sc.pt(cellPsi.clamp(-2, 0), 0.5), 8, Paint()..color = IX.green);
        IxPaint.label(c, 'ψw (MPa): blue solution, green cell', sc.r.topLeft + const Offset(0, -30), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
      }),
    );
  }

  // ------------------------------------------------------------------ ascent

  Widget _ascent() {
    final hgt = n('height'), tr = n('transp');
    final tension = 0.01 * hgt + 0.01 * hgt * 0.8; // gravity + friction, MPa
    final speed = tr / 50 * 15; // m per hour, illustrative
    return frame(
      title: 'Pulling a water column up a tree',
      subtitle: _sub,
      formula: 'transpiration pull: cohesion–tension',
      readouts: [
        Readout('Tree height', f0(hgt), 'm', IX.accent),
        Readout('Tension needed', f2(tension), 'MPa', IX.positive),
        Readout('Root pressure (max)', '≈ 0.1–0.2', 'MPa', IX.inkSoft),
        Readout('Sap speed', f1(speed), 'm/h', IX.green),
      ],
      controls: [
        slider('height', 'Tree height', 1, 100, unit: 'm'),
        slider('transp', 'Transpiration rate', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ground = size.height - 70;
        final scale = (size.height - 200) / 100;
        final th = hgt * scale;
        final tx = size.width * 0.28;
        c.drawRect(Rect.fromLTRB(0, ground, size.width, size.height), Paint()..color = const Color(0xFFE9DCC7));
        // Roots.
        for (var k = -3; k <= 3; k++) {
          Bio.stroke(c, Path()..moveTo(tx, ground)..quadraticBezierTo(tx + k * 30, ground + 30, tx + k * 60, ground + 60), const Color(0xFF8B6B4A), 5);
        }
        // Trunk with an exposed xylem column.
        final trunk = Rect.fromLTRB(tx - 22, ground - th, tx + 22, ground);
        c.drawRRect(RRect.fromRectAndRadius(trunk, const Radius.circular(8)), Paint()..color = const Color(0xFF8B6B4A));
        c.drawRect(Rect.fromLTRB(tx - 7, ground - th, tx + 7, ground), Paint()..color = const Color(0xFFCFE3F2));
        // Water molecules in the column, spaced by the moving phase.
        final rnd = math.Random(2);
        for (var y = ground - 10.0; y > ground - th + 10; y -= 16) {
          c.drawCircle(Offset(tx, y + rnd.nextDouble() * 4), 4.5, Paint()..color = BioC.water);
        }
        // Crown.
        final crown = Offset(tx, ground - th - math.max(30, th * 0.12));
        for (final o in [const Offset(-50, 10), const Offset(50, 10), const Offset(0, -30), const Offset(-25, 30), const Offset(25, 30)]) {
          Bio.soft(c, Bio.blob(crown + o * math.max(0.9, th / 300), 60 * math.max(0.9, th / 300), 46 * math.max(0.9, th / 300), seed: o.dx.round() + 60, wobble: 0.1), BioC.leaf, stroke: 1.5);
        }
        if (tr > 2) {
          for (var k = 0; k < (tr / 12).ceil(); k++) {
            final a = crown + Offset(40.0 + k * 18, -10.0 - k * 6);
            IxPaint.arrow(c, a, a + const Offset(50, -26), BioC.water.withValues(alpha: 0.7), width: 2.5);
          }
          IxPaint.label(c, 'Water vapour out through stomata', crown + const Offset(110, -60), size: 18, color: BioC.water, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        }
        // Height scale.
        for (var m = 0; m <= 100; m += 20) {
          final y = ground - m * scale;
          c.drawLine(Offset(40, y), Offset(56, y), Paint()..color = IX.inkSoft..strokeWidth = 2);
          IxPaint.label(c, '$m m', Offset(62, y), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
        }
        // Explanation panel with bars: tension vs root pressure.
        final px = size.width * 0.52;
        final plot = Plot(Rect.fromLTRB(px + 60, 100, size.width - 60, size.height * 0.55), -0.5, 1.5, 0, 2.2);
        plot.frame(c, xs: [], ys: [0, 0.5, 1, 1.5, 2], yLabel: 'Pressure (MPa)', title: 'Push from below vs pull from above');
        plot.bars(c, [0.15, tension], [IX.inkSoft, IX.positive], labels: ['Root pressure', 'Tension needed'], fmt: (v) => f2(v));
        Bio.note(c, 'Transpiration at the leaves pulls a continuous column of water up the xylem. Cohesion (water molecules attract each other), adhesion (to the xylem walls) and surface tension hold the column together. Root pressure gives only a modest push, enough for small herbs or guttation at night.', Offset(px, size.height * 0.66), maxWidth: size.width - px - 40, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ stomata

  Widget _stomata() {
    final light = n('light'), water = n('water'), hum = n('humidity');
    final open = ((light / 100) * (0.2 + 0.8 * water / 100)).clamp(0.0, 1.0).toDouble();
    final aba = water < 35;
    final open2 = aba ? open * (water / 35) : open;
    final transp = open2 * (1 - hum / 100) * 100;
    final co2 = open2 * 100;
    return frame(
      title: 'Opening and closing a stoma',
      subtitle: _sub,
      formula: 'guard cells turgid → pore opens',
      readouts: [
        Readout('Pore opening', f0(open2 * 100), '%', IX.accent),
        Readout('CO₂ uptake', f0(co2), '%', IX.green),
        Readout('Water loss', f0(transp), '%', BioC.water),
        Readout('ABA signal', aba ? 'High (closes)' : 'Low', '', aba ? IX.positive : IX.inkSoft),
      ],
      controls: [
        slider('light', 'Light', 0, 100, unit: '%'),
        slider('water', 'Water supply', 0, 100, unit: '%'),
        slider('humidity', 'Air humidity', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.38, size.height * 0.44);
        final R = math.min(size.width * 0.15, size.height * 0.26);
        // Epidermal cells around.
        final rnd = math.Random(8);
        for (var k = 0; k < 10; k++) {
          final a = k / 10 * 2 * math.pi;
          final p = ctr + Offset(math.cos(a) * R * 1.55, math.sin(a) * R * 1.25);
          Bio.soft(c, Bio.blob(p, R * 0.5, R * 0.42, seed: rnd.nextInt(90), wobble: 0.12, rot: a), const Color(0xFFF3F1E4), stroke: 2, edge: const Color(0xFFBDB58C), shadow: false);
        }
        // Guard cells: kidney shapes, gap set by turgor.
        final gap = 6 + open2 * R * 0.32;
        for (final s in [-1.0, 1.0]) {
          final outer = Path()
            ..moveTo(ctr.dx, ctr.dy - R * 0.92)
            ..cubicTo(ctr.dx + s * R * 0.95, ctr.dy - R * 0.9, ctr.dx + s * R * 0.95, ctr.dy + R * 0.9, ctr.dx, ctr.dy + R * 0.92)
            ..cubicTo(ctr.dx + s * gap * 1.4, ctr.dy + R * 0.5, ctr.dx + s * gap * 1.4, ctr.dy - R * 0.5, ctr.dx, ctr.dy - R * 0.92)
            ..close();
          Bio.soft(c, outer, Color.lerp(const Color(0xFFB8D79E), BioC.leaf, 0.3 + 0.5 * open2)!, stroke: 2.5, edge: BioC.chloroDark);
          // Thick inner wall.
          final inner = Path()..moveTo(ctr.dx, ctr.dy - R * 0.85)..cubicTo(ctr.dx + s * gap * 1.4, ctr.dy - R * 0.5, ctr.dx + s * gap * 1.4, ctr.dy + R * 0.5, ctr.dx, ctr.dy + R * 0.85);
          Bio.stroke(c, inner, BioC.chloroDark, 7);
          // Radial microfibrils.
          for (var t = -0.6; t <= 0.6; t += 0.2) {
            final p0 = Offset(ctr.dx + s * gap * 1.15, ctr.dy + t * R);
            c.drawLine(p0, p0 + Offset(s * R * 0.35, t * R * 0.25), Paint()..color = BioC.chloroDark.withValues(alpha: 0.35)..strokeWidth = 1.5);
          }
          for (var j = 0; j < 5; j++) {
            c.drawCircle(Offset(ctr.dx + s * R * 0.5, ctr.dy - R * 0.4 + j * R * 0.2), 7, Paint()..color = BioC.chloro);
          }
          c.drawCircle(Offset(ctr.dx + s * R * 0.62, ctr.dy), 13, Paint()..color = BioC.nucleus);
          if (open2 > 0.3) {
            for (var j = 0; j < 3; j++) {
              Bio.tag(c, 'K⁺', Offset(ctr.dx + s * R * 1.0, ctr.dy - 40 + j * 40), IX.amber, size: 14);
            }
          }
        }
        final parts = [
          BioPart('g', 'Guard cell', Offset(ctr.dx + R * 0.45, ctr.dy + R * 0.45)),
          BioPart('p', 'Stomatal pore', ctr),
          BioPart('i', 'Thick inner wall', Offset(ctr.dx + gap * 1.05, ctr.dy - R * 0.35)),
          BioPart('s', 'Epidermal cell', ctr + Offset(-R * 1.4, R * 0.7)),
          BioPart('k', 'K⁺ enters in light', Offset(ctr.dx - R * 1.0, ctr.dy - 40)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - R * 1.75, rightX: ctr.dx + R * 1.75, top: ctr.dy - R, bottom: ctr.dy + R * 1.1), null);
        Bio.note(c, 'In light, K⁺ moves into the guard cells, water follows by osmosis and they swell. The radial microfibrils and thick inner walls make them bow apart, opening the pore. Water stress releases ABA and the stoma closes. The plant trades water loss for CO₂ gain.', Offset(40, size.height - 24), align: Alignment.bottomLeft, maxWidth: size.width - 80, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ phloem

  Widget _phloem() {
    final ld = n('load'), ul = n('unload');
    final dp = ((ld - ul * 0.6) / 100 * 1.2).clamp(0.0, 2.0).toDouble();
    return frame(
      title: 'Pressure flow in the phloem',
      subtitle: _sub,
      formula: 'source → sink (Münch)',
      readouts: [
        Readout('Pressure at source', f2(0.4 + ld / 100 * 1.2), 'MPa', IX.positive),
        Readout('Pressure at sink', f2(0.4 + (ld - ul) / 100 * 0.6), 'MPa', IX.accent),
        Readout('Pressure difference', f2(dp), 'MPa', IX.green),
        Readout('Flow of sap', f0(dp / 1.2 * 100), '%', BioC.sugar),
      ],
      controls: [
        slider('load', 'Sucrose loading at the source', 0, 100, unit: '%'),
        slider('unload', 'Unloading at the sink', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final xx = size.width * 0.26, xp = size.width * 0.42;
        final top = 140.0, bot = size.height - 120;
        // Leaf (source) and root (sink).
        drawLeaf(c, Offset(xp + 10, top + 40), Offset(size.width * 0.88, top - 40), 90);
        Bio.box(c, Rect.fromCenter(center: Offset(size.width * 0.72, top + 120), width: 300, height: 56), 'SOURCE: leaf mesophyll', color: IX.green, size: 18);
        Bio.soft(c, Bio.blob(Offset(xp + 120, bot + 30), 170, 50, seed: 4), const Color(0xFFE6CFA4), stroke: 2);
        IxPaint.label(c, 'SINK: root storage cells', Offset(xp + 120, bot + 30), size: 18, color: Bio.darken(BioC.soil, 0.3), w: FontWeight.w700);
        // Xylem (left) and phloem sieve tube (right).
        for (final (x, col, name) in [(xx, const Color(0xFFCFE3F2), 'Xylem'), (xp, const Color(0xFFFBE7C8), 'Phloem sieve tube')]) {
          final r = Rect.fromLTRB(x - 30, top, x + 30, bot);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(14)), Paint()..color = col);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(14)), Paint()..color = Bio.darken(col, 0.3)..style = PaintingStyle.stroke..strokeWidth = 2.5);
          if (name.startsWith('Phloem')) {
            for (var y = top + 90; y < bot - 20; y += 90) {
              for (var dx = -24.0; dx <= 24; dx += 12) {
                c.drawCircle(Offset(x + dx, y), 3, Paint()..color = Bio.darken(col, 0.35));
              }
              c.drawLine(Offset(x - 30, y), Offset(x + 30, y), Paint()..color = Bio.darken(col, 0.3)..strokeWidth = 2);
            }
          }
          IxPaint.label(c, name, Offset(x, top - 24), size: 18, color: IX.ink, w: FontWeight.w700);
        }
        // Sucrose dots, denser at the source.
        final rnd = math.Random(5);
        for (var k = 0; k < 70; k++) {
          final t = math.pow(rnd.nextDouble(), 1 + ld / 50).toDouble();
          c.drawCircle(Offset(xp - 22 + rnd.nextDouble() * 44, top + 12 + t * (bot - top - 24)), 4, Paint()..color = BioC.sugar);
        }
        IxPaint.arrow(c, Offset(xp + 60, top + 60), Offset(xp + 60, bot - 40), BioC.sugar, width: 4 + dp * 3, head: 22);
        IxPaint.label(c, 'mass flow of sap', Offset(xp + 76, (top + bot) / 2), size: 18, color: Bio.darken(BioC.sugar, 0.2), w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        IxPaint.arrow(c, Offset(xx, bot - 40), Offset(xx, top + 40), BioC.water, width: 4, head: 18);
        // Water exchange.
        IxPaint.arrow(c, Offset(xx + 34, top + 70), Offset(xp - 34, top + 70), BioC.water, width: 3);
        IxPaint.label(c, 'water in (osmosis)', Offset((xx + xp) / 2, top + 48), size: 15, color: BioC.water, w: FontWeight.w700);
        IxPaint.arrow(c, Offset(xp - 34, bot - 60), Offset(xx + 34, bot - 60), BioC.water, width: 3);
        IxPaint.label(c, 'water out', Offset((xx + xp) / 2, bot - 82), size: 15, color: BioC.water, w: FontWeight.w700);
        Bio.tag(c, 'Sucrose loaded (active, ATP)', Offset(xp + 170, top + 40 + 160), IX.green, size: 16);
        Bio.note(c, 'Loading sucrose at the source lowers water potential; water enters from the xylem and pressure rises. Unloading at the sink lowers the pressure there. The pressure difference pushes the sap from source to sink — down to roots, or up to fruits and buds.', Offset(size.width * 0.58, size.height * 0.62), maxWidth: size.width * 0.38, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ stomatal index

  Widget _index() {
    final sN = i('S'), eN = i('E');
    final si = 100 * sN / math.max(sN + eN, 1);
    return frame(
      title: 'Stomatal index',
      subtitle: '1st PUC Biology · Anatomy of flowering plants',
      formula: 'SI = S ÷ (S + E) × 100',
      readouts: [
        Readout('Stomata S', '$sN', '', IX.green),
        Readout('Epidermal cells E', '$eN', ''),
        Readout('Stomatal index', f1(si), '%', IX.accent),
        Readout('Total cells', '${sN + eN}', ''),
      ],
      controls: [
        slider('S', 'Stomata (S)', 0, 60),
        slider('E', 'Epidermal cells (E)', 10, 200),
      ],
      painter: BioPainter((c, size) {
        final r = Rect.fromLTWH(40, 40, size.width - 80, size.height - 160);
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), Paint()..color = const Color(0xFFF7F5EA));
        final tot = sN + eN;
        final cols = math.max(1, math.sqrt(tot * r.width / r.height).round());
        final rows = (tot / cols).ceil();
        final cw = r.width / cols, ch = r.height / math.max(rows, 1);
        final rnd = math.Random(4);
        final order = List.generate(tot, (k) => k)..shuffle(rnd);
        final st = order.take(sN).toSet();
        for (var k = 0; k < tot; k++) {
          final cx = r.left + (k % cols + 0.5) * cw, cy = r.top + (k ~/ cols + 0.5) * ch;
          final p = Bio.blob(Offset(cx, cy), cw * 0.5, ch * 0.5, seed: k, wobble: 0.14, n: 7);
          c.drawPath(p, Paint()..color = const Color(0xFFF3F1E4));
          c.drawPath(p, Paint()..color = const Color(0xFFBDB58C)..style = PaintingStyle.stroke..strokeWidth = 1.5);
          if (st.contains(k)) {
            final s = math.min(cw, ch) * 0.36;
            for (final sd in [-1.0, 1.0]) {
              c.drawOval(Rect.fromCenter(center: Offset(cx + sd * s * 0.32, cy), width: s * 0.6, height: s * 1.6), Paint()..color = BioC.leaf);
            }
            c.drawOval(Rect.fromCenter(center: Offset(cx, cy), width: s * 0.16, height: s * 1.0), Paint()..color = const Color(0xFF2F4A1E));
          }
        }
        Bio.box(c, Rect.fromLTWH(40, size.height - 96, size.width - 80, 64), 'SI = $sN ÷ ($sN + $eN) × 100 = ${f1(si)}%', color: IX.accent, size: 22);
      }),
    );
  }

  // ------------------------------------------------------------------ root stele

  Widget _root() {
    final dicot = str('root') != 'monocot';
    final nx = dicot ? 4 : 10;
    final up = n('uptake');
    return frame(
      title: dicot ? 'Transverse section of a dicot root' : 'Transverse section of a monocot root',
      subtitle: '1st PUC Biology · Anatomy; Transport in plants',
      formula: dicot ? 'xylem 2–4 bundles (diarch–tetrarch)' : 'xylem > 6 bundles (polyarch)',
      readouts: [
        Readout('Xylem bundles', '$nx', '', IX.positive),
        Readout('Pith', dicot ? 'Small or absent' : 'Large', ''),
        Readout('Secondary growth', dicot ? 'Yes' : 'No', ''),
        Readout('Water uptake', f0(up), '%', BioC.water),
      ],
      controls: [
        choice('root', 'Root', const {'dicot': 'Dicot (bean)', 'monocot': 'Monocot (maize)'}),
        slider('uptake', 'Water uptake', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.42, size.height * 0.5);
        final R = math.min(size.width * 0.22, size.height * 0.42);
        // Epiblema with root hairs.
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: ctr, radius: R)), const Color(0xFFF4EBD6), stroke: 2.5, edge: const Color(0xFFB59A6A));
        for (var a = 0.0; a < 2 * math.pi; a += 0.5) {
          final p = ctr + Offset(math.cos(a), math.sin(a)) * R;
          Bio.stroke(c, Path()..moveTo(p.dx, p.dy)..quadraticBezierTo((p + Offset(math.cos(a + 0.3), math.sin(a + 0.3)) * 20).dx, (p + Offset(math.cos(a + 0.3), math.sin(a + 0.3)) * 20).dy, (p + Offset(math.cos(a), math.sin(a)) * 46).dx, (p + Offset(math.cos(a), math.sin(a)) * 46).dy), const Color(0xFFB59A6A), 3);
        }
        // Cortex cells.
        for (var ring = 0; ring < 3; ring++) {
          final rr = R * (0.88 - ring * 0.14);
          final count = (2 * math.pi * rr / 50).round();
          for (var k = 0; k < count; k++) {
            final a = (k + ring * 0.5) / count * 2 * math.pi;
            c.drawCircle(ctr + Offset(math.cos(a), math.sin(a)) * rr, 22, Paint()..color = const Color(0xFFFBF5E8));
            c.drawCircle(ctr + Offset(math.cos(a), math.sin(a)) * rr, 22, Paint()..color = const Color(0xFFD9C9A4)..style = PaintingStyle.stroke..strokeWidth = 1.4);
          }
        }
        // Endodermis with Casparian strip, then pericycle.
        final re = R * 0.44;
        c.drawCircle(ctr, re, Paint()..color = const Color(0xFFC9A66B)..style = PaintingStyle.stroke..strokeWidth = 14);
        for (var a = 0.0; a < 2 * math.pi; a += 0.18) {
          c.drawCircle(ctr + Offset(math.cos(a), math.sin(a)) * re, 3, Paint()..color = const Color(0xFF7A4E1E));
        }
        c.drawCircle(ctr, re - 12, Paint()..color = const Color(0xFFF8F0FA));
        c.drawCircle(ctr, re - 12, Paint()..color = const Color(0xFFCDB7D9)..style = PaintingStyle.stroke..strokeWidth = 6);
        // Pith (monocot large).
        if (!dicot) Bio.soft(c, Path()..addOval(Rect.fromCircle(center: ctr, radius: re * 0.45)), const Color(0xFFF7F3E6), stroke: 1.5, shadow: false);
        // Radial xylem and phloem alternating.
        for (var k = 0; k < nx; k++) {
          final a = k / nx * 2 * math.pi - math.pi / 2;
          final u = Offset(math.cos(a), math.sin(a));
          for (var j = 0; j < 4; j++) {
            final rr = dicot ? re * (0.15 + j * 0.2) : re * (0.52 + j * 0.11);
            final r = dicot ? 9.0 + j * 1.5 : 6.0 + (3 - j) * 1.0;
            Bio.soft(c, Path()..addOval(Rect.fromCircle(center: ctr + u * rr, radius: r)), IX.positive, stroke: 1.2, shadow: false);
          }
          final ap = a + math.pi / nx;
          Bio.soft(c, Bio.blob(ctr + Offset(math.cos(ap), math.sin(ap)) * re * 0.66, 15, 11, seed: k, rot: ap), IX.negative, stroke: 1.2, shadow: false);
        }
        // Water path.
        final wa = -0.35;
        final start = ctr + Offset(math.cos(wa), math.sin(wa)) * (R + 40), end = ctr + Offset(math.cos(wa), math.sin(wa)) * re * 0.5;
        IxPaint.arrow(c, start, end, BioC.water.withValues(alpha: 0.3 + 0.7 * up / 100), width: 3 + up / 20, head: 20);
        final parts = [
          BioPart('h', 'Root hair', ctr + Offset(math.cos(2.5), math.sin(2.5)) * (R + 20)),
          BioPart('c', 'Cortex', ctr + Offset(-R * 0.74, 0)),
          BioPart('e', 'Endodermis', ctr + Offset(math.cos(2.3), math.sin(2.3)) * re),
          BioPart('p', 'Pericycle', ctr + Offset(math.cos(3.8), math.sin(3.8)) * (re - 12)),
          BioPart('x', dicot ? 'Xylem (exarch)' : 'Xylem (polyarch, exarch)', ctr + Offset(0, dicot ? -re * 0.75 : -re * 0.85)),
          BioPart('f', 'Phloem', ctr + Offset(math.cos(-math.pi / 2 + math.pi / nx), math.sin(-math.pi / 2 + math.pi / nx)) * re * 0.66),
          if (!dicot) BioPart('m', 'Large pith', ctr + Offset(0, re * 0.1)),
          BioPart('w', 'Water moving in', Offset.lerp(start, end, 0.3)!),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - R - 60, rightX: ctr.dx + R + 60, top: 40, bottom: size.height - 40), null);
        Bio.note(c, 'Water crosses the cortex through walls (apoplast) and cytoplasm (symplast). The suberised Casparian strip blocks the apoplast, so at the endodermis water must pass through living cells — the plant controls what enters.', Offset(size.width - 30, size.height - 24), align: Alignment.bottomRight, maxWidth: size.width * 0.28, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ limiting nutrient

  Widget _mineral() {
    final vals = [n('N'), n('P'), n('K'), n('Fe')];
    final names = ['Nitrogen', 'Phosphorus', 'Potassium', 'Iron'];
    final mn = vals.reduce(math.min);
    final lim = names[vals.indexOf(mn)];
    return frame(
      title: 'The scarcest nutrient sets the growth',
      subtitle: '1st PUC Biology · Mineral nutrition',
      formula: 'growth ∝ the most limiting nutrient',
      readouts: [
        Readout('Growth', f0(mn), '% of max', IX.green),
        Readout('Limiting nutrient', lim, '', IX.positive),
        Readout('N supply', f0(vals[0]), '%'),
        Readout('Fe supply', f0(vals[3]), '%'),
      ],
      controls: [
        slider('N', 'Nitrogen supply', 0, 100, unit: '%'),
        slider('P', 'Phosphorus supply', 0, 100, unit: '%'),
        slider('K', 'Potassium supply', 0, 100, unit: '%'),
        slider('Fe', 'Iron supply', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        // The barrel: each stave is a nutrient; water can only rise to the shortest.
        final ctr = Offset(size.width * 0.32, size.height * 0.56);
        final w = size.width * 0.36, h = size.height * 0.62;
        final staves = 8;
        final sw = w / staves;
        final waterTop = ctr.dy + h / 2 - h * mn / 100;
        c.save();
        c.clipRect(Rect.fromLTRB(ctr.dx - w / 2, waterTop, ctr.dx + w / 2, ctr.dy + h / 2));
        c.drawRect(Rect.fromLTRB(ctr.dx - w / 2, waterTop, ctr.dx + w / 2, ctr.dy + h / 2), Paint()..color = BioC.water.withValues(alpha: 0.75));
        c.restore();
        final cols = [const Color(0xFF3F6FB5), const Color(0xFFC0504D), const Color(0xFF8C6BB1), const Color(0xFFB45309)];
        for (var k = 0; k < staves; k++) {
          final ni = k % 4;
          final sh = h * vals[ni] / 100;
          final r = Rect.fromLTWH(ctr.dx - w / 2 + k * sw + 2, ctr.dy + h / 2 - math.max(sh, 8), sw - 4, math.max(sh, 8));
          Bio.soft(c, Path()..addRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(6), topRight: const Radius.circular(6))), Color.lerp(const Color(0xFFC49A6C), cols[ni], 0.35)!, stroke: 1.5, shadow: false, light: 0.3);
          IxPaint.label(c, const ['N', 'P', 'K', 'Fe'][ni], Offset(r.center.dx, r.top + 18), size: 18, color: Colors.white, w: FontWeight.w700);
        }
        c.save();
        c.clipRect(Rect.fromLTRB(ctr.dx - w / 2, waterTop, ctr.dx + w / 2, ctr.dy + h / 2));
        c.drawRect(Rect.fromLTRB(ctr.dx - w / 2, waterTop, ctr.dx + w / 2, ctr.dy + h / 2), Paint()..color = BioC.water.withValues(alpha: 0.45));
        c.restore();
        for (final f in [0.06, 0.2]) {
          c.drawRect(Rect.fromLTWH(ctr.dx - w / 2 - 6, ctr.dy + h / 2 - h * f, w + 12, 10), Paint()..color = const Color(0xFF59627E));
        }
        IxPaint.label(c, 'Growth stops at the shortest stave: $lim', Offset(ctr.dx, ctr.dy - h / 2 - 40), size: 20, color: IX.ink, w: FontWeight.w700);
        final plot = Plot(Rect.fromLTRB(size.width * 0.62, 100, size.width - 50, size.height - 130), -0.5, 3.5, 0, 110);
        plot.frame(c, xs: [], ys: [0, 25, 50, 75, 100], yLabel: 'Supply (% of need)', title: 'Supply of each nutrient');
        plot.bars(c, vals, cols, labels: const ['N', 'P', 'K', 'Fe'], fmt: (v) => f0(v));
        plot.hline(c, mn, IX.positive, label: 'growth');
      }),
    );
  }

  // ------------------------------------------------------------------ nodule

  Widget _nodule() {
    final o2 = n('o2');
    final freeO2 = o2 * 0.15; // after leghaemoglobin binds most
    final nase = (100 * (1 - freeO2 / 6)).clamp(0.0, 100.0).toDouble();
    final resp = (100 * o2 / (o2 + 8)).clamp(0.0, 100.0).toDouble();
    return frame(
      title: 'Inside a root nodule',
      subtitle: '1st PUC Biology · Mineral nutrition',
      formula: 'N₂ + 8e⁻ + 8H⁺ + 16ATP → 2NH₃ + H₂ + 16ADP',
      readouts: [
        Readout('O₂ in nodule', f0(o2), '%', IX.accent),
        Readout('Nitrogenase activity', f0(nase), '%', IX.green),
        Readout('Respiration (ATP)', f0(resp), '%', BioC.atp),
        Readout('Leghaemoglobin', 'Pink, binds O₂', '', BioC.oxy),
      ],
      controls: [slider('o2', 'Oxygen in the nodule', 0, 60, unit: '%')],
      painter: BioPainter((c, size) {
        // Root with nodules.
        final y = size.height * 0.30;
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(40, y - 22, size.width * 0.55, y + 22), const Radius.circular(22)), Paint()..color = const Color(0xFFE8D9BC));
        for (final x in [0.12, 0.26, 0.40]) {
          Bio.soft(c, Bio.blob(Offset(size.width * x, y + 40), 46, 38, seed: (x * 100).round()), const Color(0xFFE7B9A8), stroke: 2);
        }
        IxPaint.label(c, 'Root of a legume with nodules', Offset(40, y - 60), size: 19, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
        // Enlarged nodule section.
        final nc = Offset(size.width * 0.2, size.height * 0.68);
        final nr = math.min(size.width * 0.17, size.height * 0.26);
        final pink = Color.lerp(const Color(0xFFF1C7C9), const Color(0xFFD9707A), 0.6)!;
        Bio.soft(c, Bio.blob(nc, nr * 1.2, nr, seed: 7), pink, stroke: 3, edge: const Color(0xFFB0475A));
        final rnd = math.Random(3);
        for (var k = 0; k < 60; k++) {
          final p = nc + Offset((rnd.nextDouble() - 0.5) * nr * 1.9, (rnd.nextDouble() - 0.5) * nr * 1.5);
          if ((p - nc).distance > nr * 0.85) continue;
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: p, width: 18, height: 8), const Radius.circular(4)), Paint()..color = const Color(0xFF8E3B46));
        }
        IxPaint.arrow(c, Offset(size.width * 0.26, y + 80), nc + Offset(0, -nr - 6), IX.muted, width: 2);
        final parts = [
          BioPart('b', 'Bacteroids (Rhizobium)', nc + const Offset(20, 10)),
          BioPart('l', 'Leghaemoglobin (pink)', nc + Offset(-nr * 0.6, -nr * 0.5)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: 0, leftX: nc.dx - nr * 1.2 - 40, rightX: nc.dx + nr * 1.2 + 40, top: nc.dy - nr, bottom: nc.dy + nr), null);
        final plot = Plot(Rect.fromLTRB(size.width * 0.64, 100, size.width - 50, size.height - 150), 0, 60, 0, 110);
        plot.frame(c, xs: [0, 20, 40, 60], ys: [0, 50, 100], xLabel: 'O₂ in the nodule (%)', yLabel: 'Activity (%)', title: 'Nitrogenase needs low O₂');
        plot.curve(c, (x) => (100 * (1 - x * 0.15 / 6)).clamp(0, 100), IX.green, label: 'nitrogenase', labelX: 14);
        plot.curve(c, (x) => 100 * x / (x + 8), BioC.atp, label: 'respiration', labelX: 48);
        plot.vline(c, o2, IX.ink);
        Bio.note(c, 'Nitrogenase is poisoned by O₂, yet fixation needs ATP from respiration. Leghaemoglobin binds the free O₂ and supplies it to respiration.', Offset(size.width * 0.64, size.height - 26), align: Alignment.bottomLeft, maxWidth: size.width * 0.34, size: 17, color: IX.ink);
      }),
    );
  }
}
