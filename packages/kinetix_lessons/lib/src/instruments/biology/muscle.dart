import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Locomotion and movement (1st PUC Biology ch. 17): the sarcomere and sliding filaments, the
/// cross-bridge cycle, ciliary movement, the 206 bones of the skeleton, and the types of joint.
///
/// Preset: {"mode": "sarcomere"|"crossbridge"|"cilia"|"skeleton"|"joints", "L": 2.5 (µm),
/// "step": 0, "beat": 12 (Hz), "joint": "ball"}.
class MuscleInstrument extends StatefulWidget {
  const MuscleInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<MuscleInstrument> createState() => _MuscleState();
}

const _xbSteps = ['Ca²⁺ exposes sites', 'Cross bridge forms', 'Power stroke', 'ATP releases head'];

class _MuscleState extends BioState<MuscleInstrument> {
  @override
  String get instrumentId => 'bio-muscle';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['sarcomere', 'crossbridge', 'cilia', 'skeleton', 'joints'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Relaxed sarcomere': {'mode': 'sarcomere', 'L': 2.6},
    'Contracted': {'mode': 'sarcomere', 'L': 2.0},
    'Cross-bridge cycle': {'mode': 'crossbridge'},
    'Ciliary movement': {'mode': 'cilia'},
    '206 bones': {'mode': 'skeleton'},
    'Joints': {'mode': 'joints'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'L': 2.5, 'step': 0, 'beat': 12, 'joint': 'ball'};

  static const _sub = '1st PUC Biology · Locomotion and movement';
  static const thick = 1.6, thin = 1.0;

  @override
  Widget build(BuildContext context) => switch (mode) {
    'crossbridge' => _xb(),
    'cilia' => _cilia(),
    'skeleton' => _skeleton(),
    'joints' => _joints(),
    _ => _sarcomere(),
  };

  static const _actin = Color(0xFF3F8F5A), _myosin = Color(0xFFC0504D);

  void _drawSarcomere(Canvas c, Rect r, double L, {bool labels = true}) {
    // µm → px across the sarcomere width.
    final scale = r.width / 3.2;
    final cx = r.center.dx, y0 = r.top, y1 = r.bottom;
    double x(double um) => cx + um * scale;
    final zl = x(-L / 2), zr = x(L / 2);
    c.drawRect(Rect.fromLTRB(zl, y0, zr, y1), Paint()..color = const Color(0xFFFFF6F2));
    // A band shading.
    c.drawRect(Rect.fromLTRB(x(-thick / 2), y0, x(thick / 2), y1), Paint()..color = const Color(0xFFF6DADA));
    final h = math.max(0.0, L - 2 * thin);
    if (h > 0) c.drawRect(Rect.fromLTRB(x(-h / 2), y0, x(h / 2), y1), Paint()..color = const Color(0xFFFBEAEA));
    final rows = 5;
    for (var k = 0; k < rows; k++) {
      final yy = y0 + (k + 0.5) * (y1 - y0) / rows;
      // Thin filaments from each Z line.
      for (final (z, dir) in [(zl, 1.0), (zr, -1.0)]) {
        for (final off in [-14.0, 14.0]) {
          final a = Offset(z, yy + off), b2 = Offset(z + dir * thin * scale, yy + off);
          c.drawLine(a, b2, Paint()..color = _actin..strokeWidth = 5..strokeCap = StrokeCap.round);
          for (var t = 0.0; t < thin * scale; t += 12) {
            c.drawCircle(Offset(z + dir * t, yy + off), 3.2, Paint()..color = Bio.lighten(_actin, 0.25));
          }
        }
      }
      // Thick filament with heads.
      final ta = Offset(x(-thick / 2), yy), tb = Offset(x(thick / 2), yy);
      c.drawLine(ta, tb, Paint()..color = _myosin..strokeWidth = 12..strokeCap = StrokeCap.round);
      for (var t = 10.0; t < thick * scale - 10; t += 16) {
        final px = ta.dx + t;
        if ((px - cx).abs() < 0.08 * scale) continue;
        final dir = px < cx ? -1.0 : 1.0;
        for (final sd in [-1.0, 1.0]) {
          c.drawLine(Offset(px, yy + sd * 5), Offset(px + dir * 7, yy + sd * 12), Paint()..color = Bio.darken(_myosin, 0.15)..strokeWidth = 3..strokeCap = StrokeCap.round);
        }
      }
    }
    for (final z in [zl, zr]) {
      final zig = Path()..moveTo(z, y0 - 10);
      for (var yy = y0 - 10; yy < y1 + 10; yy += 16) {
        zig.lineTo(z + ((yy - y0) / 16).round() % 2 * 8 - 4, yy + 16);
      }
      Bio.stroke(c, zig, IX.ink, 4);
    }
    c.drawLine(Offset(cx, y0 - 6), Offset(cx, y1 + 6), Paint()..color = IX.inkSoft..strokeWidth = 2.5);
    if (!labels) return;
    void dim(double a, double b2, double yy, String s0, Color col) {
      if ((b2 - a).abs() < 2) {
        IxPaint.label(c, '$s0 0', Offset((a + b2) / 2, yy), size: 16, color: col, w: FontWeight.w700, halo: true);
        return;
      }
      c.drawLine(Offset(a, yy), Offset(b2, yy), Paint()..color = col..strokeWidth = 2.5);
      for (final e in [a, b2]) {
        c.drawLine(Offset(e, yy - 8), Offset(e, yy + 8), Paint()..color = col..strokeWidth = 2.5);
      }
      IxPaint.label(c, s0, Offset((a + b2) / 2, yy - 16), size: 17, color: col, w: FontWeight.w700, halo: true);
    }
    dim(zl, zr, y1 + 44, 'Sarcomere ${f2(L)} µm', IX.ink);
    dim(x(-thick / 2), x(thick / 2), y0 - 40, 'A band ${f2(thick)} µm', _myosin);
    dim(zl, x(-thick / 2), y1 + 92, 'I band', _actin);
    dim(x(thick / 2), zr, y1 + 92, 'I band', _actin);
    dim(x(-h / 2), x(h / 2), y0 - 86, 'H zone ${f2(h)} µm', IX.amber);
    IxPaint.label(c, 'Z line', Offset(zl, y0 - 24), size: 16, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight);
    IxPaint.label(c, 'M line', Offset(cx + 8, y0 - 14), size: 16, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
  }

  Widget _sarcomere() {
    final L = n('L');
    final iBand = math.max(0.0, L - thick), hz = math.max(0.0, L - 2 * thin);
    return frame(
      title: 'Sliding filaments in a sarcomere',
      subtitle: _sub,
      formula: 'A band constant; I band and H zone shorten',
      readouts: [
        Readout('Sarcomere', f2(L), 'µm', IX.accent),
        Readout('A band', f2(thick), 'µm', _myosin),
        Readout('I band', f2(iBand), 'µm', _actin),
        Readout('H zone', f2(hz), 'µm', IX.amber),
      ],
      controls: [
        slider('L', 'Sarcomere length (Z to Z)', 1.7, 3.0, unit: 'µm', dp: 2, div: 26),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Thick (myosin) filaments ≈ 1.6 µm; each thin (actin) filament ≈ 1.0 µm.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        // Myofibril striations above.
        final mf = Rect.fromLTWH(40, 40, size.width - 80, 70);
        final per = mf.width / 4;
        c.drawRRect(RRect.fromRectAndRadius(mf, const Radius.circular(35)), Paint()..color = const Color(0xFFFFF0EC));
        c.save();
        c.clipRRect(RRect.fromRectAndRadius(mf, const Radius.circular(35)));
        for (var k = 0; k < 5; k++) {
          final cx = mf.left + per * k + per / 2;
          final aw = per * thick / L;
          c.drawRect(Rect.fromCenter(center: Offset(cx, mf.center.dy), width: aw, height: mf.height), Paint()..color = const Color(0xFFD99A9A));
          c.drawLine(Offset(mf.left + per * k, mf.top), Offset(mf.left + per * k, mf.bottom), Paint()..color = IX.ink..strokeWidth = 2);
        }
        c.restore();
        IxPaint.label(c, 'Myofibril: dark A bands and light I bands alternate (striated)', mf.bottomCenter + const Offset(0, 20), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        _drawSarcomere(c, Rect.fromLTWH(60, size.height * 0.36, size.width - 120, size.height * 0.34), L);
        Bio.note(c, 'Ca²⁺ released from the sarcoplasmic reticulum lets myosin heads bind actin and pull the thin filaments towards the M line. The Z lines come closer; filaments slide, they do not shorten.', Offset(40, size.height - 20), align: Alignment.bottomLeft, maxWidth: size.width - 80, size: 18, color: IX.ink);
      }),
    );
  }

  Widget _xb() {
    final st = i('step').clamp(0, 3);
    final text = [
      'A nerve signal releases Ca²⁺ from the sarcoplasmic reticulum. Ca²⁺ binds troponin on the actin filament, removing the masking of the active sites by tropomyosin.',
      'The myosin head, carrying ADP + Pi from ATP hydrolysis (it is an ATPase), binds the exposed active site on actin: a cross bridge.',
      'The head tilts and pulls the actin filament towards the centre of the A band (the M line), releasing ADP and Pi.',
      'A new ATP binds and the head detaches. Its hydrolysis re-cocks the head for the next cycle. When Ca²⁺ is pumped back, the sites are masked again and the muscle relaxes.',
    ];
    return frame(
      title: 'The cross-bridge cycle',
      subtitle: _sub,
      formula: 'ATP → ADP + Pi powers each stroke',
      readouts: [
        Readout('Step', _xbSteps[st], '', IX.accent),
        Readout('Active sites', st == 0 ? 'Being exposed' : 'Exposed', ''),
        Readout('Head holds', st == 1 ? 'ADP + Pi' : (st == 3 ? 'ATP' : (st == 2 ? 'Releasing' : 'ADP + Pi')), '', BioC.atp),
        Readout('Actin moves', st == 2 ? '→ M line' : '—', '', IX.green),
      ],
      controls: [stepper('step', _xbSteps, label: 'Step')],
      painter: BioPainter((c, size) {
        final y = size.height * 0.40;
        final x0 = 60.0, x1 = size.width * 0.50;
        final shift = st >= 2 ? 40.0 : 0.0;
        // Actin: double bead chain, tropomyosin, troponin.
        for (var t = x0 - 40; t < x1; t += 22) {
          final xx = t - shift;
          if (xx < x0 - 30) continue;
          c.drawCircle(Offset(xx, y - 8), 11, Paint()..color = Bio.lighten(_actin, 0.15));
          c.drawCircle(Offset(xx + 11, y + 8), 11, Paint()..color = _actin);
        }
        final tropo = Path()..moveTo(x0 - shift, y - 18);
        for (var t = x0; t < x1; t += 40) {
          tropo.quadraticBezierTo(t + 20 - shift, y + (st == 0 ? -26 : -34), t + 40 - shift, y - 18);
        }
        Bio.stroke(c, tropo, const Color(0xFF6E8FC7), 5);
        for (var t = x0 + 60; t < x1; t += 130) {
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(t - shift, y - 30), radius: 12)), const Color(0xFFE0A030), stroke: 1.5);
          if (st >= 0) Bio.tag(c, 'Ca²⁺', Offset(t - shift, y - 64), IX.amber, size: 14);
        }
        IxPaint.arrow(c, Offset(x1 - 100, y - 100), Offset(x1 + (st == 2 ? 40 : -60), y - 100), st == 2 ? IX.green : IX.rule, width: 4);
        IxPaint.label(c, 'actin slides', Offset(x1 - 120, y - 100), size: 17, color: st == 2 ? IX.green : IX.muted, w: FontWeight.w700, align: Alignment.centerRight);
        // Thick filament with heads.
        final ty = y + 150;
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(x0, ty - 16, x1, ty + 16), const Radius.circular(16)), Paint()..color = _myosin);
        for (var t = x0 + 60; t < x1 - 20; t += 130) {
          final base = Offset(t, ty - 14);
          final angle = switch (st) { 0 => -2.2, 1 => -1.9, 2 => -1.0, _ => -2.4 };
          final neck = base + Offset(math.cos(angle), math.sin(angle)) * 60;
          c.drawLine(base, neck, Paint()..color = Bio.darken(_myosin, 0.15)..strokeWidth = 10..strokeCap = StrokeCap.round);
          final head = neck + Offset(math.cos(angle + 0.3), math.sin(angle + 0.3)) * (st == 1 || st == 2 ? 40 : 28);
          Bio.soft(c, Bio.blob(head, 20, 14, seed: 3, rot: angle), Bio.darken(_myosin, 0.05), stroke: 1.5);
          if (st == 1 || st == 3) Bio.tag(c, st == 1 ? 'ADP+Pi' : 'ATP', head + const Offset(40, 30), BioC.atp, size: 13);
        }
        final parts = [
          BioPart('a', 'Actin (thin filament)', Offset(x0 + 30, y + 8)),
          BioPart('t', 'Tropomyosin', Offset(x0 + 100 - shift, y - 26)),
          BioPart('tn', 'Troponin', Offset(x0 + 60 - shift, y - 30)),
          BioPart('m', 'Myosin head (cross bridge)', Offset(x0 + 60, ty - 70)),
          BioPart('mm', 'Myosin (thick filament)', Offset(x0 + 30, ty)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: 0, leftX: 0, rightX: x1 + 30, top: 40, bottom: size.height - 40), null);
        final card = Rect.fromLTWH(size.width * 0.70, 50, size.width * 0.30 - 30, size.height - 100);
        Bio.card(c, card);
        Bio.heading(c, _xbSteps[st], card.topLeft + const Offset(20, 18), color: IX.accent);
        Bio.note(c, text[st], card.topLeft + const Offset(20, 60), maxWidth: card.width - 40, size: 19, color: IX.ink, w: FontWeight.w400);
      }),
    );
  }

  // ------------------------------------------------------------------ cilia

  Widget _cilia() {
    final f = n('beat');
    final speed = f * 0.06 * 60; // mm per min, illustrative
    return frame(
      title: 'Ciliary movement clears the windpipe',
      subtitle: _sub,
      formula: 'axoneme: 9 + 2 microtubules',
      readouts: [
        Readout('Beat frequency', f0(f), 'per s', IX.accent),
        Readout('Mucus moves', f1(speed), 'mm/min', IX.green),
        Readout('Also moves', 'Ovum in oviduct', ''),
        Readout('Wave', 'Metachronal', ''),
      ],
      controls: [slider('beat', 'Beat frequency', 2, 20, unit: 'per s')],
      painter: BioPainter((c, size) {
        final base = size.height * 0.62;
        final w = (size.width * 0.66 - 80) / 6;
        // Mucus layer.
        c.drawRect(Rect.fromLTRB(40, base - 190, size.width * 0.66, base - 140), Paint()..color = const Color(0xFFE8F0D8));
        final rnd = math.Random(3);
        for (var k = 0; k < 18; k++) {
          c.drawCircle(Offset(60 + rnd.nextDouble() * (size.width * 0.66 - 100), base - 165 + rnd.nextDouble() * 16 - 8), 4 + rnd.nextDouble() * 4, Paint()..color = const Color(0xFF8A7A5A));
        }
        IxPaint.label(c, 'Mucus with trapped dust and germs', Offset(50, base - 210), size: 17, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.arrow(c, Offset(size.width * 0.40, base - 220), Offset(size.width * 0.62, base - 220), IX.green, width: 3 + f / 5);
        IxPaint.label(c, 'towards the throat', Offset(size.width * 0.63, base - 220), size: 16, color: IX.green, w: FontWeight.w700, align: Alignment.centerLeft);
        for (var k = 0; k < 6; k++) {
          final cell = Rect.fromLTWH(40 + k * w, base, w - 4, 170);
          Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(cell, const Radius.circular(12))), const Color(0xFFF2D7C4), stroke: 2, edge: BioC.membrane, shadow: false);
          c.drawCircle(cell.center + const Offset(0, 30), w * 0.16, Paint()..color = BioC.nucleus);
          for (var j = 0; j < 7; j++) {
            final bx = cell.left + 10 + j * (cell.width - 20) / 6;
            final phase = (k * 7 + j) * 0.22;
            final tilt = math.sin(phase) * 0.3 + 0.1;
            final tip = Offset(bx + math.sin(tilt) * 120, base - math.cos(tilt) * 120);
            final mid = Offset(bx + math.sin(tilt) * 40 - tilt * 20, base - 70);
            c.drawPath(Path()..moveTo(bx, base)..quadraticBezierTo(mid.dx, mid.dy, tip.dx, tip.dy), Paint()..color = const Color(0xFF6E8FC7)..strokeWidth = 3.5..style = PaintingStyle.stroke..strokeCap = StrokeCap.round);
          }
        }
        IxPaint.label(c, 'Ciliated epithelium lining the trachea', Offset(40, base + 196), size: 17, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
        // 9 + 2 cross-section.
        final xc = Offset(size.width * 0.84, size.height * 0.40);
        final R = math.min(size.width * 0.12, 130.0);
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: xc, radius: R)), const Color(0xFFF2EEF8), stroke: 2.5, edge: BioC.membrane);
        for (var k = 0; k < 9; k++) {
          final a = k / 9 * 2 * math.pi;
          final p = xc + Offset(math.cos(a), math.sin(a)) * R * 0.7;
          c.drawCircle(p + Offset(math.cos(a + 1.6), math.sin(a + 1.6)) * 9, 10, Paint()..color = const Color(0xFF6E8FC7));
          c.drawCircle(p - Offset(math.cos(a + 1.6), math.sin(a + 1.6)) * 9, 10, Paint()..color = const Color(0xFF4B63B0));
          c.drawLine(p, xc + Offset(math.cos(a), math.sin(a)) * R * 0.3, Paint()..color = IX.muted..strokeWidth = 1.5);
        }
        c.drawCircle(xc + const Offset(-12, 0), 10, Paint()..color = const Color(0xFF4B63B0));
        c.drawCircle(xc + const Offset(12, 0), 10, Paint()..color = const Color(0xFF4B63B0));
        IxPaint.label(c, 'Cilium in section: 9 + 2', xc + Offset(0, R + 30), size: 18, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, 'Nine doublets of peripheral microtubules surround a central pair, joined by radial spokes.', xc + Offset(-R - 20, R + 56), maxWidth: 2 * R + 40, size: 16, color: IX.inkSoft);
      }),
    );
  }

  // ------------------------------------------------------------------ skeleton

  Widget _skeleton() {
    final groups = [('Skull', 22), ('Hyoid', 1), ('Ear ossicles', 6), ('Vertebrae', 26), ('Sternum', 1), ('Ribs', 24), ('Pectoral girdle', 4), ('Upper limbs', 60), ('Pelvic girdle', 2), ('Lower limbs', 60)];
    return frame(
      title: 'The 206 bones of the adult skeleton',
      subtitle: _sub,
      formula: 'axial 80 + appendicular 126 = 206',
      readouts: const [
        Readout('Axial skeleton', '80', 'bones', IX.accent),
        Readout('Appendicular', '126', 'bones', IX.green),
        Readout('Skull', '22', '8 cranial + 14 facial'),
        Readout('Ribs', '12 pairs', 'true 7, false 3, floating 2'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 90, size.width - 40, size.height - 140), -0.5, 9.5, 0, 70);
        plot.frame(c, xs: [], ys: [0, 20, 40, 60], yLabel: 'Number of bones', title: 'Bones in each group');
        plot.bars(c, [for (final g in groups) g.$2.toDouble()], [for (var k = 0; k < 10; k++) k < 6 ? IX.accent : IX.green], fmt: (v) => f0(v));
        for (var k = 0; k < 10; k++) {
          final p = plot.pt(k.toDouble(), 0);
          Bio.note(c, groups[k].$1, p + const Offset(0, 12), align: Alignment.topCenter, maxWidth: plot.r.width / 10 - 6, size: 16, color: IX.inkSoft, w: FontWeight.w600);
        }
        final ax = plot.pt(2.5, 66), ap = plot.pt(7.5, 66);
        c.drawLine(Offset(plot.pt(-0.4, 0).dx, ax.dy), Offset(plot.pt(5.4, 0).dx, ax.dy), Paint()..color = IX.accent..strokeWidth = 4);
        IxPaint.label(c, 'Axial skeleton: 80', ax + const Offset(0, -16), size: 19, color: IX.accent, w: FontWeight.w700, halo: true);
        c.drawLine(Offset(plot.pt(5.6, 0).dx, ap.dy), Offset(plot.pt(9.4, 0).dx, ap.dy), Paint()..color = IX.green..strokeWidth = 4);
        IxPaint.label(c, 'Appendicular skeleton: 126', ap + const Offset(0, -16), size: 19, color: IX.green, w: FontWeight.w700, halo: true);
        Bio.note(c, 'Vertebral column: 7 cervical, 12 thoracic, 5 lumbar, 1 sacral (fused), 1 coccygeal (fused). Each limb: 30 bones — e.g. arm: humerus, radius, ulna, 8 carpals, 5 metacarpals, 14 phalanges.', Offset(110, size.height - 20), align: Alignment.bottomLeft, maxWidth: size.width - 150, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ joints

  Widget _joints() {
    final j = str('joint', 'ball');
    final info = {
      'ball': ('Ball and socket', 'Between humerus and pectoral girdle (shoulder), femur and pelvis (hip). Movement in all directions.'),
      'hinge': ('Hinge', 'Knee and elbow. Movement in one plane, like a door.'),
      'pivot': ('Pivot', 'Between atlas and axis: turns the head side to side.'),
      'gliding': ('Gliding', 'Between the carpals. Bones slide over each other.'),
      'saddle': ('Saddle', 'Between the carpal and metacarpal of the thumb.'),
    };
    return frame(
      title: '${info[j]!.$1} joint',
      subtitle: _sub,
      formula: 'fibrous · cartilaginous · synovial',
      readouts: [
        Readout('Type', 'Synovial', '', IX.accent),
        Readout('Example', info[j]!.$2.split('.').first.split(':').first, ''),
      ],
      controls: [choice('joint', 'Synovial joint', const {'ball': 'Ball', 'hinge': 'Hinge', 'pivot': 'Pivot', 'gliding': 'Gliding', 'saddle': 'Saddle'})],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.34, size.height * 0.46);
        final k = math.min(size.width, size.height) / 900;
        Offset p(double x, double y) => ctr + Offset(x, y) * k;
        void bone(Path path) => Bio.soft(c, path, BioC.bone, stroke: 2.5, edge: const Color(0xFFB5A27A));
        // Synovial capsule and fluid.
        Bio.soft(c, Bio.blob(ctr, 170 * k, 150 * k, seed: 2, wobble: 0.03), const Color(0xFFDCEAF6), stroke: 2, edge: const Color(0xFF8FA9C2), shadow: false);
        switch (j) {
          case 'ball':
            bone(Path()..addOval(Rect.fromCircle(center: p(0, -20), radius: 80 * k))..addRect(Rect.fromLTRB(p(-30, -300).dx, p(-30, -300).dy, p(30, -60).dx, p(30, -60).dy)));
            bone(Path()..moveTo(p(-150, 120).dx, p(-150, 120).dy)..quadraticBezierTo(p(0, -40).dx, p(0, -40).dy, p(150, 120).dx, p(150, 120).dy)..lineTo(p(150, 200).dx, p(150, 200).dy)..lineTo(p(-150, 200).dx, p(-150, 200).dy)..close());
          case 'hinge':
            bone(Path()..addRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p(-60, -300).dx, p(-60, -300).dy, p(60, -10).dx, p(60, -10).dy), Radius.circular(50 * k))));
            bone(Path()..addRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p(-55, 20).dx, p(-55, 20).dy, p(55, 300).dx, p(55, 300).dy), Radius.circular(40 * k))));
          case 'pivot':
            bone(Path()..addOval(Rect.fromCenter(center: p(0, -40), width: 300 * k, height: 90 * k)));
            bone(Path()..addRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p(-25, -90).dx, p(-25, -90).dy, p(25, 40).dx, p(25, 40).dy), Radius.circular(20 * k)))..addRect(Rect.fromLTRB(p(-70, 40).dx, p(-70, 40).dy, p(70, 200).dx, p(70, 200).dy)));
          case 'gliding':
            for (var a = 0; a < 3; a++) {
              bone(Bio.blob(p(-110 + a * 110.0, a.isEven ? -40 : 30), 50 * k, 60 * k, seed: a + 4, wobble: 0.06));
            }
          default:
            bone(Path()..moveTo(p(-120, -200).dx, p(-120, -200).dy)..lineTo(p(120, -200).dx, p(120, -200).dy)..lineTo(p(120, -20).dx, p(120, -20).dy)..quadraticBezierTo(p(0, -80).dx, p(0, -80).dy, p(-120, -20).dx, p(-120, -20).dy)..close());
            bone(Path()..moveTo(p(-100, 220).dx, p(-100, 220).dy)..lineTo(p(-100, 30).dx, p(-100, 30).dy)..quadraticBezierTo(p(0, 0).dx, p(0, 0).dy, p(100, 30).dx, p(100, 30).dy)..lineTo(p(100, 220).dx, p(100, 220).dy)..close());
        }
        final parts = [
          BioPart('cap', 'Synovial capsule and fluid', p(150, 60)),
          BioPart('b', 'Articulating bones', p(0, -180)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: 0, leftX: 0, rightX: ctr.dx + 220 * k, top: 60, bottom: size.height - 60), null);
        Bio.note(c, '${info[j]!.$1}: ${info[j]!.$2}\n\nFibrous joints do not move (sutures of the skull). Cartilaginous joints allow limited movement (between vertebrae). Synovial joints have a fluid-filled cavity and move freely. Disorders: arthritis (inflamed joints), gout (uric acid crystals), osteoporosis (less bone mass).', Offset(size.width * 0.66, 60), maxWidth: size.width * 0.32, size: 18, color: IX.ink);
      }),
    );
  }
}
