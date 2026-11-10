import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'design.dart';

class Indicator {
  const Indicator(this.name, this.low, this.high, this.acid, this.base);
  final String name;
  final double low, high;
  final Color acid, base;
  Color at(double pH) => Color.lerp(acid, base, ((pH - low) / (high - low)).clamp(0, 1))!;
}

const indicators = {
  'phenolphthalein': Indicator('Phenolphthalein', 8.2, 10.0, Color(0x00FFFFFF), Color(0xFFD9468C)),
  'methylOrange': Indicator('Methyl orange', 3.1, 4.4, Color(0xFFD9412B), Color(0xFFF2B33D)),
  'bromothymolBlue': Indicator('Bromothymol blue', 6.0, 7.6, Color(0xFFE8C53A), Color(0xFF2F6FB3)),
};

/// Acid–base titration (1st PUC Chemistry, Equilibrium; 2nd PUC practicals): NaOH from a
/// burette into an acid in a conical flask, the indicator's colour, and the live pH curve.
///
/// Preset: {"acid":"HCl"|"CH3COOH", "Ca":0.1, "Va":25 (mL), "Cb":0.1, "indicator":"phenolphthalein",
/// "added":0 (mL)}.
class TitrationInstrument extends StatefulWidget {
  const TitrationInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<TitrationInstrument> createState() => _TitrationState();
}

class _TitrationState extends State<TitrationInstrument> with SingleTickerProviderStateMixin {
  bool weak = false;
  double ca = 0.1, va = 25, cb = 0.1, vb = 0;
  String ind = 'phenolphthalein';
  int? preset;
  late final Ticker _ticker = createTicker(_tick);
  Duration _last = Duration.zero;
  double drop = 0; // 0..1 phase of the falling drop

  static const ka = 1.8e-5;

  static final _presets = <String, Map<String, dynamic>>{
    'HCl vs NaOH': {'acid': 'HCl', 'indicator': 'phenolphthalein'},
    'Near end point': {'acid': 'HCl', 'indicator': 'phenolphthalein', 'added': 24.9},
    'Past end point': {'acid': 'HCl', 'indicator': 'phenolphthalein', 'added': 27},
    'Acetic acid': {'acid': 'CH3COOH', 'indicator': 'phenolphthalein', 'added': 12.5},
    'Methyl orange': {'acid': 'HCl', 'indicator': 'methylOrange', 'added': 20},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['HCl vs NaOH']! : widget.preset);
    if (widget.preset.isEmpty) preset = 0;
  }

  void _apply(Map<String, dynamic> p) {
    weak = p['acid'] == 'CH3COOH';
    ca = (p['Ca'] as num?)?.toDouble() ?? 0.1;
    va = (p['Va'] as num?)?.toDouble() ?? 25;
    cb = (p['Cb'] as num?)?.toDouble() ?? 0.1;
    vb = (p['added'] as num?)?.toDouble() ?? 0;
    ind = indicators.containsKey(p['indicator']) ? p['indicator'] as String : 'phenolphthalein';
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  double get veq => ca * va / cb;

  void _tick(Duration t) {
    final dt = ((t - _last).inMicroseconds / 1e6).clamp(0.0, 0.1);
    _last = t;
    // Slows to dropwise near the end point, as a student would.
    final near = (vb - veq).abs() < 2;
    setState(() {
      vb = math.min(50, vb + dt * (near ? 0.25 : 2.0));
      drop = (drop + dt * (near ? 1.2 : 3)) % 1;
      if (vb >= 50) _toggle();
    });
  }

  void _toggle() {
    if (_ticker.isActive) {
      _ticker.stop();
    } else {
      _last = Duration.zero;
      _ticker.start();
    }
    setState(() {});
  }

  double pH(double v) {
    final na = ca * va, nb = cb * v, vt = (va + v);
    const kw = 1e-14;
    if (!weak) {
      if ((na - nb).abs() < 1e-9) return 7;
      if (na > nb) return -math.log((na - nb) / vt) / math.ln10;
      return 14 + math.log((nb - na) / vt) / math.ln10;
    }
    if (v == 0) return -math.log(math.sqrt(ka * ca)) / math.ln10;
    if (nb < na - 1e-9) return -math.log(ka) / math.ln10 + math.log(nb / (na - nb)) / math.ln10;
    if ((nb - na).abs() < 1e-9) return 14 + math.log(math.sqrt(kw / ka * na / vt)) / math.ln10;
    return 14 + math.log((nb - na) / vt) / math.ln10;
  }

  @override
  Widget build(BuildContext context) {
    final p = pH(vb);
    final indicator = indicators[ind]!;
    final running = _ticker.isActive;
    return InstrumentFrame(
      id: 'titration',
      subtitle: 'PUC Chemistry · Acids, bases and titration',
      title: weak ? 'Titration of acetic acid with NaOH' : 'Titration of HCl with NaOH',
      formula: 'M₁V₁ = M₂V₂',
      state: {'acid': weak ? 'CH3COOH' : 'HCl', 'Ca': ca, 'Va': va, 'Cb': cb, 'indicator': ind, 'added': vb},
      readouts: [
        Readout('pH', p.toStringAsFixed(2), '', indicator.at(p).a < 0.1 ? IX.inkSoft : indicator.at(p)),
        Readout('NaOH added', vb.toStringAsFixed(2), 'mL', IX.accent),
        Readout('End point', veq.toStringAsFixed(1), 'mL'),
        Readout('Burette reading', vb.toStringAsFixed(1), 'mL'),
      ],
      controls: [
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: SizedBox(
            height: 56,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: running ? IX.ink : IX.accent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              onPressed: _toggle,
              icon: Icon(running ? Icons.pause_rounded : Icons.water_drop_outlined, size: 26),
              label: Text(running ? 'Close stopcock' : 'Open stopcock', style: IX.text(20, w: FontWeight.w600, c: Colors.white)),
            ),
          ),
        ),
        IxSlider(label: 'NaOH added', value: vb, min: 0, max: 50, unit: 'mL', format: (x) => x.toStringAsFixed(1), onChanged: (x) => setState(() { vb = x; preset = null; })),
        IxSegments<String>(label: 'Indicator', options: const {'phenolphthalein': 'Phenol-\nphthalein', 'methylOrange': 'Methyl\norange', 'bromothymolBlue': 'Bromo-\nthymol blue'}, value: ind, onChanged: (x) => setState(() => ind = x)),
      ],
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); preset = i; }))],
      activePreset: preset,
      stage: CustomPaint(painter: _TitrationPainter(this, p, indicator, running), child: const SizedBox.expand()),
    );
  }
}

class _TitrationPainter extends CustomPainter {
  _TitrationPainter(this.s, this.p, this.ind, this.running);
  final _TitrationState s;
  final double p;
  final Indicator ind;
  final bool running;

  @override
  void paint(Canvas c, Size size) {
    final appW = size.width * 0.40;
    _stand(c, size, appW);
    _curve(c, Rect.fromLTRB(appW + 70, 60, size.width - 40, size.height - 90));
  }

  void _stand(Canvas c, Size size, double w) {
    final cx = w * 0.55;
    final base = size.height - 40;
    // Stand: base plate, rod, clamp.
    final plate = Rect.fromLTWH(cx - 190, base - 22, 300, 22);
    c.drawRRect(RRect.fromRectAndRadius(plate.shift(const Offset(0, 5)), const Radius.circular(6)), Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
    c.drawRRect(RRect.fromRectAndRadius(plate, const Radius.circular(6)), Paint()..shader = ui.Gradient.linear(plate.topCenter, plate.bottomCenter, [const Color(0xFF5B6478), const Color(0xFF3B4254)]));
    final rod = Rect.fromLTWH(cx - 150, 30, 12, base - 52);
    c.drawRect(rod, Paint()..shader = ui.Gradient.linear(rod.centerLeft, rod.centerRight, [IX.steel, const Color(0xFFEFF2F6), IX.steel], [0, 0.5, 1]));
    final clampY = 120.0;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(cx - 146, clampY - 9, 136, 18), const Radius.circular(5)), Paint()..color = const Color(0xFF4B5367));
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(cx - 30, clampY - 18, 60, 36), const Radius.circular(8)), Paint()..color = const Color(0xFF4B5367));

    // Burette: 0 mL at top, 50 mL graduation near the stopcock.
    const bw = 34.0;
    final top = 40.0, gradTop = 70.0;
    final flaskTop = base - 22 - 230;
    final gradBot = flaskTop - 120;
    final tube = Rect.fromLTRB(cx - bw / 2, top, cx + bw / 2, gradBot + 30);
    double yOf(double ml) => gradTop + (gradBot - gradTop) * ml / 50;
    // Liquid (NaOH, faintly tinted) from the level down.
    final level = yOf(s.vb);
    final liquid = Rect.fromLTRB(tube.left + 3, level, tube.right - 3, tube.bottom);
    c.drawRect(liquid, Paint()..shader = ui.Gradient.linear(liquid.centerLeft, liquid.centerRight, [const Color(0xFFD6E6F5), const Color(0xFFEAF3FB), const Color(0xFFC9DCEF)], [0, 0.5, 1]));
    // Meniscus: concave, darker lower edge read at eye level.
    final men = Path()..moveTo(tube.left + 3, level - 6)..quadraticBezierTo(cx, level + 7, tube.right - 3, level - 6);
    c.drawPath(men, Paint()..color = const Color(0xFF5E7FA3)..style = PaintingStyle.stroke..strokeWidth = 2.4);
    // Glass.
    final glass = RRect.fromRectAndCorners(tube, topLeft: const Radius.circular(4), topRight: const Radius.circular(4));
    c.drawRRect(glass, Paint()..shader = ui.Gradient.linear(tube.centerLeft, tube.centerRight, [const Color(0x30FFFFFF), const Color(0x10FFFFFF), const Color(0x2A8FA9C2)], [0, 0.5, 1]));
    c.drawRRect(glass, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 2);
    c.drawLine(Offset(tube.left + 8, top + 10), Offset(tube.left + 8, tube.bottom - 10), Paint()..color = Colors.white.withValues(alpha: 0.9)..strokeWidth = 3);
    // Graduations every 1 mL, numbers every 5.
    for (var ml = 0; ml <= 50; ml++) {
      final y = yOf(ml.toDouble());
      final long = ml % 5 == 0;
      c.drawLine(Offset(tube.right - (long ? 16 : 9), y), Offset(tube.right - 2, y), Paint()..color = IX.ink.withValues(alpha: 0.7)..strokeWidth = long ? 1.6 : 1);
      if (ml % 10 == 0) IxPaint.label(c, '$ml', Offset(tube.right + 10, y), size: 14, color: IX.inkSoft, align: Alignment.centerLeft);
    }
    IxPaint.label(c, 'NaOH  ${s.cb.toStringAsFixed(2)} M', Offset(tube.left - 14, gradTop + 260), size: 16, color: IX.inkSoft, align: Alignment.centerRight, w: FontWeight.w600);
    // Reading lens on the meniscus.
    c.drawLine(Offset(tube.left - 24, level), Offset(tube.left - 6, level), Paint()..color = IX.accent..strokeWidth = 2.5);
    IxPaint.label(c, '${s.vb.toStringAsFixed(1)} mL', Offset(tube.left - 30, level), size: 17, color: IX.accent, align: Alignment.centerRight, w: FontWeight.w600, halo: true);
    // Stopcock and tip.
    final sc = Offset(cx, tube.bottom + 14);
    c.drawRect(Rect.fromCenter(center: sc, width: 12, height: 28), Paint()..color = const Color(0xFFDDE6EF));
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: sc, width: running ? 14 : 54, height: running ? 54 : 14), const Radius.circular(7)), Paint()..color = const Color(0xFF2F3A52));
    final tip = Path()..moveTo(cx - 6, sc.dy + 14)..lineTo(cx + 6, sc.dy + 14)..lineTo(cx + 2, sc.dy + 62)..lineTo(cx - 2, sc.dy + 62)..close();
    c.drawPath(tip, Paint()..color = IX.glass);
    c.drawPath(tip, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 1.5);
    final tipY = sc.dy + 62;

    // Conical flask.
    final neckW = 46.0, bodyW = 230.0, fh = 230.0;
    final ft = flaskTop, fb = base - 24;
    final flask = Path()
      ..moveTo(cx - neckW / 2, ft)
      ..lineTo(cx - neckW / 2, ft + 60)
      ..lineTo(cx - bodyW / 2 + 10, fb - 14)
      ..quadraticBezierTo(cx - bodyW / 2, fb, cx - bodyW / 2 + 22, fb)
      ..lineTo(cx + bodyW / 2 - 22, fb)
      ..quadraticBezierTo(cx + bodyW / 2, fb, cx + bodyW / 2 - 10, fb - 14)
      ..lineTo(cx + neckW / 2, ft + 60)
      ..lineTo(cx + neckW / 2, ft)
      ..close();
    // Falling drop.
    if (running) {
      final dy = tipY + 6 + s.drop * (ft + fh * 0.4 - tipY);
      c.drawOval(Rect.fromCenter(center: Offset(cx, dy), width: 9, height: 13), Paint()..color = const Color(0xFF9DB9D6));
    }
    // Liquid fills from the bottom; volume grows with what is added.
    final fill = (0.30 + 0.22 * s.vb / 50).clamp(0.0, 0.6);
    final ly = fb - fh * fill;
    c.save();
    c.clipPath(flask);
    final liq = Rect.fromLTRB(cx - bodyW, ly, cx + bodyW, fb);
    final col = Color.alphaBlend(ind.at(p), const Color(0xFFF1F6FB));
    c.drawRect(liq, Paint()..shader = ui.Gradient.linear(liq.topCenter, liq.bottomCenter, [Color.lerp(col, Colors.white, 0.15)!, col, Color.lerp(col, Colors.black, 0.08)!], [0, 0.5, 1]));
    c.drawPath(Path()..moveTo(cx - bodyW, ly)..quadraticBezierTo(cx, ly + 6, cx + bodyW, ly), Paint()..color = Colors.white.withValues(alpha: 0.6)..style = PaintingStyle.stroke..strokeWidth = 3);
    c.restore();
    c.drawPath(flask.shift(const Offset(0, 4)), Paint()..color = const Color(0x1213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
    c.drawPath(flask, Paint()..color = const Color(0x18FFFFFF));
    c.drawPath(flask, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 2.4);
    c.drawLine(Offset(cx - neckW / 2 - 6, ft), Offset(cx + neckW / 2 + 6, ft), Paint()..color = IX.glassEdge..strokeWidth = 4..strokeCap = StrokeCap.round);
    c.drawLine(Offset(cx - bodyW / 2 + 40, fb - 40), Offset(cx - neckW / 2 - 8, ft + 90), Paint()..color = Colors.white.withValues(alpha: 0.8)..strokeWidth = 4..strokeCap = StrokeCap.round);
    IxPaint.label(c, '${s.weak ? 'CH₃COOH' : 'HCl'}  ${s.va.toStringAsFixed(0)} mL, ${s.ca.toStringAsFixed(2)} M', Offset(cx, fb + 2 - fh * 0.12), size: 16, color: IX.ink, w: FontWeight.w600, halo: true);
    IxPaint.label(c, '+ ${ind.name}', Offset(cx + bodyW / 2 + 12, ly + 20), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  void _curve(Canvas c, Rect r) {
    IxPaint.label(c, 'pH curve', r.topLeft + const Offset(0, -34), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
    final grid = Paint()..color = IX.grid..strokeWidth = 1;
    Offset pt(double v, double ph) => Offset(r.left + r.width * v / 50, r.bottom - r.height * ph / 14);
    // Indicator range band.
    final band = Rect.fromLTRB(r.left, pt(0, ind.high).dy, r.right, pt(0, ind.low).dy);
    c.drawRect(band, Paint()..color = Color.alphaBlend(ind.base.withValues(alpha: 0.14), IX.paper));
    IxPaint.label(c, '${ind.name} range', band.topRight + const Offset(-8, 4), size: 14, color: IX.inkSoft, align: Alignment.topRight);
    for (var ph = 0; ph <= 14; ph += 2) {
      c.drawLine(pt(0, ph.toDouble()), pt(50, ph.toDouble()), grid);
      IxPaint.label(c, '$ph', pt(0, ph.toDouble()) - const Offset(12, 0), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    }
    for (var v = 0; v <= 50; v += 10) {
      c.drawLine(pt(v.toDouble(), 0), pt(v.toDouble(), 14), grid);
      IxPaint.label(c, '$v', pt(v.toDouble(), 0) + const Offset(0, 16), size: 15, color: IX.inkSoft);
    }
    c.drawRect(r, Paint()..color = IX.rule..style = PaintingStyle.stroke..strokeWidth = 1.5);
    IxPaint.label(c, 'Volume of NaOH added (mL)', r.bottomCenter + const Offset(0, 46), size: 17, color: IX.inkSoft);
    // Equivalence marker.
    final eq = pt(s.veq, s.pH(s.veq));
    IxPaint.dashed(c, Offset(eq.dx, r.top), Offset(eq.dx, r.bottom), Paint()..color = IX.muted..strokeWidth = 1.5);
    IxPaint.label(c, 'Equivalence  ${s.veq.toStringAsFixed(1)} mL, pH ${s.pH(s.veq).toStringAsFixed(1)}', Offset(eq.dx + 10, r.top + 14), size: 15, color: IX.inkSoft, align: Alignment.centerLeft, halo: true);
    // Full curve, faint; the part already run, bold.
    Path curve(double upTo) {
      final path = Path();
      const n = 400;
      for (var i = 0; i <= n; i++) {
        final v = upTo * i / n;
        final q = pt(v, s.pH(v).clamp(0, 14));
        i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
      }
      return path;
    }
    c.drawPath(curve(50), Paint()..color = IX.accent.withValues(alpha: 0.18)..style = PaintingStyle.stroke..strokeWidth = 3);
    if (s.vb > 0) c.drawPath(curve(s.vb), Paint()..color = IX.accent..style = PaintingStyle.stroke..strokeWidth = 4..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
    final now = pt(s.vb, p.clamp(0, 14));
    c.drawCircle(now, 13, Paint()..color = IX.accent.withValues(alpha: 0.16));
    c.drawCircle(now, 8, Paint()..color = IX.accent);
    c.drawCircle(now, 8, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2.5);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
