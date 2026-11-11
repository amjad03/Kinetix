import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Human health and disease (2nd PUC Biology ch. 7): primary and secondary immune responses,
/// active versus passive immunity, the structure of an antibody (H₂L₂, tap a part) and the
/// course of HIV infection (helper T-cells against virus).
///
/// Preset: {"mode": "response"|"activepassive"|"antibody"|"hiv", "d": 30 (day of 2nd exposure),
/// "k": 8 (secondary ÷ primary peak), "t": 14 (days for active immunity), "h": 10 (half-life of
/// injected antibodies, days), "years": 6, "art": false}.
class ImmunityInstrument extends StatefulWidget {
  const ImmunityInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ImmunityInstrument> createState() => _ImmState();
}

class _ImmState extends BioState<ImmunityInstrument> {
  @override
  String get instrumentId => 'bio-immunity';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['response', 'activepassive', 'antibody', 'hiv'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Primary and secondary': {'mode': 'response'},
    'Active and passive': {'mode': 'activepassive'},
    'Antibody H₂L₂': {'mode': 'antibody'},
    'HIV and AIDS': {'mode': 'hiv'},
    'HIV with treatment': {'mode': 'hiv', 'art': true},
  };
  @override
  Map<String, Object> defaults(String mode) => {'d': 30, 'k': 8, 't': 14, 'h': 10, 'years': 6, 'art': false};

  static const _sub = '2nd PUC Biology · Human health and disease';
  static const _ab = Color(0xFF3F6FB5), _act = Color(0xFF2F7D5B), _pas = Color(0xFFD9824B);

  @override
  Widget build(BuildContext context) => switch (mode) {
    'activepassive' => _activePassive(),
    'antibody' => _antibody(),
    'hiv' => _hiv(),
    _ => _response(),
  };

  // Antibody titre: a lagged gamma-like peak.
  static double _peak(double t, double lag, double rise, double amp) {
    final x = t - lag;
    if (x <= 0) return 0;
    return amp * math.pow(x / rise, 2) * math.exp(2 * (1 - x / rise));
  }

  Widget _response() {
    final d = n('d'), k = n('k');
    double ab(double t) => _peak(t, 4, 7, 10) + _peak(t, d + 1, 4, 10 * k);
    return frame(
      title: 'Primary and secondary immune responses',
      subtitle: _sub,
      formula: 'memory cells → faster, larger second response',
      readouts: [
        Readout('Primary peak', '10', 'units, ≈ day 11', IX.muted),
        Readout('Secondary peak', f0(10 * k), 'units, day ${f0(d + 5)}', _ab),
        Readout('Lag', '4 → 1', 'days', IX.accent),
        Readout('Second exposure', 'day ${f0(d)}', ''),
      ],
      controls: [
        slider('d', 'Day of second exposure', 15, 60, unit: 'day'),
        slider('k', 'Secondary peak ÷ primary peak', 2, 10, dp: 0),
      ],
      painter: BioPainter((c, size) {
        final yMax = 10 * k * 1.25;
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 60, size.height * 0.60), 0, 90, 0, yMax);
        plot.frame(c, xs: [0, 15, 30, 45, 60, 75, 90], ys: [0, yMax / 2, yMax], fy: (y) => f0(y), xLabel: 'Days', yLabel: 'Antibody in blood', title: 'Antibody level after two meetings with the same antigen');
        // Fill under curve.
        final path = plot.path(ab)..lineTo(plot.r.right, plot.r.bottom)..lineTo(plot.r.left, plot.r.bottom)..close();
        c.save();
        c.clipRect(plot.r);
        c.drawPath(path, Paint()..color = _ab.withValues(alpha: 0.12));
        c.restore();
        plot.curve(c, ab, _ab, w: 4.5);
        for (final (x, lab) in [(0.0, '1st exposure'), (d, '2nd exposure')]) {
          final p = plot.pt(x, 0);
          IxPaint.arrow(c, p + const Offset(0, 60), p + const Offset(0, 6), IX.positive, width: 3);
          IxPaint.label(c, lab, p + const Offset(0, 74), size: 16, color: IX.positive, w: FontWeight.w600);
        }
        IxPaint.label(c, 'primary: slow, weak', plot.pt(11, 10) + const Offset(0, -22), size: 17, color: IX.inkSoft, w: FontWeight.w600, halo: true);
        IxPaint.label(c, 'secondary (anamnestic): fast, strong', plot.pt(d + 5, 10 * k) + const Offset(0, -22), size: 17, color: _ab, w: FontWeight.w700, halo: true);
        // Cells.
        final y0 = size.height * 0.60 + 190;
        _cell(c, Offset(160, y0), 'B-cell', const Color(0xFF8C6BB1));
        IxPaint.arrow(c, Offset(210, y0), Offset(300, y0), IX.inkSoft);
        _cell(c, Offset(350, y0), 'plasma cells', _ab);
        IxPaint.arrow(c, Offset(350, y0 + 40), Offset(350, y0 + 80), IX.inkSoft, width: 2);
        IxPaint.label(c, 'antibodies (IgG, IgM, IgA …)', Offset(350, y0 + 98), size: 16, color: _ab, w: FontWeight.w600);
        IxPaint.arrow(c, Offset(210, y0 + 10), Offset(500, y0 + 10), IX.inkSoft);
        _cell(c, Offset(550, y0), 'memory cells', IX.green);
        Bio.note(c, 'The first meeting with an antigen gives a low-intensity primary response. Memory B- and T-cells formed then recognise the antigen at once next time, giving a highly intensified secondary response. This is the basis of vaccination.', Offset(680, y0 - 40), maxWidth: size.width - 740, size: 17, color: IX.ink);
      }),
    );
  }

  void _cell(Canvas c, Offset at, String label, Color col) {
    Bio.soft(c, Bio.blob(at, 36, 32, seed: label.length, wobble: 0.08), Bio.lighten(col, 0.55), stroke: 2, edge: col);
    c.drawCircle(at + const Offset(-4, 2), 17, Paint()..color = col.withValues(alpha: 0.7));
    IxPaint.label(c, label, at + const Offset(0, -54), size: 16, color: Bio.darken(col, 0.2), w: FontWeight.w700);
  }

  Widget _activePassive() {
    final t = n('t'), h = n('h');
    double act(double x) => 100 * (1 - math.exp(-math.max(0, x - 3) / t * 1.5));
    double pas(double x) => 100 * math.pow(2, -x / h).toDouble();
    return frame(
      title: 'Active versus passive immunity',
      subtitle: _sub,
      formula: 'active: own antibodies · passive: ready-made',
      readouts: [
        Readout('Active at day 21', f0(act(21)), '% protection', _act),
        Readout('Passive at day 30', f0(pas(30)), '% left', _pas),
        Readout('Passive half-life', f0(h), 'days', _pas),
        Readout('Faster protection', 'Passive', 'but short-lived', IX.accent),
      ],
      controls: [
        slider('t', 'Days for active immunity to build', 5, 30, unit: 'days'),
        slider('h', 'Half-life of injected antibodies', 3, 30, unit: 'days'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.66, size.height - 120), 0, 60, 0, 110);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50, 60], ys: [0, 50, 100], xLabel: 'Days after the injection', yLabel: 'Protection (%)', title: 'Vaccine against ready-made antibodies');
        plot.curve(c, act, _act, w: 4.5, label: 'active (vaccine)', labelX: 45);
        plot.curve(c, pas, _pas, w: 4.5, label: 'passive (antitoxin)', labelX: math.min(h * 2.2, 50));
        plot.hline(c, 50, IX.muted);
        final x = size.width * 0.70;
        _card(c, Rect.fromLTWH(x, 90, size.width - x - 30, (size.height - 240) / 2), 'Active immunity', _act, 'The body makes its own antibodies after meeting an antigen: an infection, or a vaccine of weakened or killed microbes or their proteins. Slow to start, long-lasting (memory cells).');
        _card(c, Rect.fromLTWH(x, 110 + (size.height - 240) / 2, size.width - x - 30, (size.height - 240) / 2), 'Passive immunity', _pas, 'Ready-made antibodies are given: colostrum (IgA) to a newborn, antibodies across the placenta, antitetanus or snake antivenom. Quick, but they are used up and do not last.');
      }),
    );
  }

  void _card(Canvas c, Rect r, String title, Color col, String body) {
    Bio.card(c, r, edge: col.withValues(alpha: 0.6));
    c.drawRRect(RRect.fromRectAndCorners(Rect.fromLTWH(r.left, r.top, 8, r.height), topLeft: const Radius.circular(14), bottomLeft: const Radius.circular(14)), Paint()..color = col);
    Bio.heading(c, title, Offset(r.left + 26, r.top + 18), color: col);
    Bio.note(c, body, Offset(r.left + 26, r.top + 56), maxWidth: r.width - 48, size: 17, color: IX.ink);
  }

  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  Widget _antibody() {
    final focus = s['focus'];
    return frame(
      title: 'Structure of an antibody',
      subtitle: _sub,
      formula: 'H₂L₂: two heavy + two light chains',
      readouts: const [
        Readout('Chains', '4', '2 heavy, 2 light', _ab),
        Readout('Antigen sites', '2', 'at the arm tips', IX.positive),
        Readout('Made by', 'Plasma cells', 'from B-cells', IX.green),
        Readout('Classes', 'IgA, IgM, IgE, IgG', 'IgD'),
      ],
      controls: [Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a part of the antibody to read what it does.', style: IX.text(18, c: IX.inkSoft)))],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        const infoH = 130.0;
        final ctr = Offset(size.width / 2, (size.height - infoH) * 0.55);
        final k = (size.height - infoH) / 700;
        Offset p(double x, double y) => ctr + Offset(x, y) * k;
        const heavy = Color(0xFF3F6FB5), light = Color(0xFF6FA8DC), site = Color(0xFFC2410C);
        void chain(List<Offset> pts, Color col, double w) {
          final path = Path()..moveTo(pts.first.dx, pts.first.dy);
          for (final q in pts.skip(1)) {
            path.lineTo(q.dx, q.dy);
          }
          c.drawPath(path, Paint()..color = Bio.darken(col, 0.3)..style = PaintingStyle.stroke..strokeWidth = w + 4..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
          c.drawPath(path, Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
        }
        for (final sd in [-1.0, 1.0]) {
          chain([p(sd * 14, 260), p(sd * 14, 0), p(sd * 190, -230)], heavy, 30 * k + 6);
          chain([p(sd * 70, -10), p(sd * 230, -200)], light, 26 * k + 4);
          // Variable regions at tips.
          final tip = p(sd * 215, -250);
          Bio.soft(c, Bio.blob(tip, 34 * k + 8, 22 * k + 6, seed: sd > 0 ? 3 : 4, rot: sd * 0.8), site.withValues(alpha: 0.85), stroke: 1.5);
        }
        // Disulphide bonds.
        for (final (a, b) in [(p(-14, 40), p(14, 40)), (p(-14, 70), p(14, 70)), (p(-110, -110), p(-142, -84)), (p(110, -110), p(142, -84))]) {
          c.drawLine(a, b, Paint()..color = const Color(0xFFE6B800)..strokeWidth = 5);
        }
        // Antigen on one site.
        final ag = p(-260, -300);
        for (var q = 0; q < 6; q++) {
          final a = q * math.pi / 3;
          c.drawCircle(ag + Offset(math.cos(a), math.sin(a)) * 20 * k, 9 * k + 2, Paint()..color = const Color(0xFF8C6BB1));
        }
        c.drawCircle(ag, 20 * k, Paint()..color = const Color(0xFFB79BD6));
        final parts = [
          BioPart('heavy', 'Heavy chain', p(10, 180), 'Two long, identical polypeptides form the stem and the inner part of each arm. The stem (constant region) decides the antibody class and how it acts.'),
          BioPart('light', 'Light chain', p(150, -120), 'Two short, identical polypeptides, one on the outside of each arm. Light and heavy chains together shape the binding site.'),
          BioPart('site', 'Antigen-binding site', p(215, -250), 'The variable tips of the arms differ from one antibody to the next and fit one particular antigen like a lock and key. Each antibody has two such sites.'),
          BioPart('ss', 'Disulphide bonds', p(0, 55), 'S–S bridges hold the four chains together and the arms to the stem.'),
          BioPart('hinge', 'Hinge', p(-14, 10), 'A flexible region that lets the two arms swing to grip antigens at different distances.'),
          BioPart('antigen', 'Antigen', ag, 'A foreign molecule (on a pathogen or a toxin). Antibodies clump, neutralise or mark it for destruction: humoral immunity.'),
        ];
        _parts = parts;
        _labels = layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - 330 * k - 40, rightX: ctr.dx + 300 * k + 40, top: 40, bottom: size.height - infoH - 40, gap: 52);
        drawLabels(c, parts, _labels, focus);
        infoCard(c, Rect.fromLTWH(20, size.height - infoH - 10, size.width - 40, infoH), parts.where((q) => q.id == focus).firstOrNull, hint: 'Tap a part of the antibody. Antibodies are made by plasma cells and circulate in blood and lymph.');
      }),
    );
  }

  Widget _hiv() {
    final yrs = n('years');
    final art = b('art');
    double cd4(double t) {
      final base = 700 * math.exp(-0.18 * t) + 300 * math.exp(-t / 0.3);
      if (!art || t < 3) return base;
      final at3 = 700 * math.exp(-0.18 * 3);
      return at3 + (750 - at3) * (1 - math.exp(-(t - 3) / 1.5));
    }
    double virus(double t) {
      final base = 2.5 + 0.35 * t + 3.5 * math.exp(-math.pow((t - 0.25) / 0.3, 2));
      if (!art || t < 3) return math.min(base, 6.5);
      return math.max(1.0, 3.5 - (t - 3) * 1.6);
    }
    final now = cd4(yrs);
    return frame(
      title: 'HIV and AIDS',
      subtitle: _sub,
      formula: 'HIV destroys helper T-cells',
      readouts: [
        Readout('Helper T-cells', f0(now), 'per µL blood', IX.green),
        Readout('Virus', '10^${f1(virus(yrs))}', 'copies per mL', IX.positive),
        Readout('Stage', now < 200 ? 'AIDS' : (yrs < 0.5 ? 'Acute infection' : 'No symptoms'), '', now < 200 ? IX.positive : IX.accent),
        Readout('Years since infection', f1(yrs), ''),
      ],
      controls: [
        slider('years', 'Years since infection', 0, 12, dp: 1, div: 48),
        toggle('art', 'Anti-retroviral therapy from year 3', on: 'Given', off: 'None'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.62, size.height - 140), 0, 12, 0, 1100);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10, 12], ys: [0, 200, 500, 1000], xLabel: 'Years since infection', yLabel: 'Helper T-cells per µL', title: 'Helper T-cells fall over years');
        c.drawRect(Rect.fromPoints(plot.pt(0, 200), plot.pt(12, 0)), Paint()..color = IX.positive.withValues(alpha: 0.08));
        IxPaint.label(c, 'below 200: AIDS, opportunistic infections', plot.pt(6, 100), size: 16, color: IX.positive, w: FontWeight.w600);
        plot.curve(c, cd4, IX.green, w: 4.5);
        plot.curve(c, (t) => virus(t) * 140, IX.positive, w: 3, dashed: true, label: 'virus (log scale)', labelX: 1.3);
        plot.dot(c, yrs, now, IX.green);
        // Life cycle box.
        final x = size.width * 0.66;
        final steps = ['HIV enters a macrophage', 'Reverse transcriptase: RNA → viral DNA', 'Viral DNA joins host DNA', 'Cell makes new viruses (macrophage = HIV factory)', 'Viruses attack helper T-cells (T_H)', 'T_H fall: immune system collapses'];
        Bio.heading(c, 'How HIV works', Offset(x, 40));
        for (var q = 0; q < steps.length; q++) {
          final r = Rect.fromLTWH(x, 80 + q * (size.height - 220) / steps.length, size.width - x - 30, (size.height - 220) / steps.length - 16);
          Bio.box(c, r, steps[q], color: q < 4 ? const Color(0xFF8C6BB1) : IX.positive, size: 17);
          if (q < steps.length - 1) IxPaint.arrow(c, Offset(r.center.dx, r.bottom + 1), Offset(r.center.dx, r.bottom + 15), IX.inkSoft, width: 2, head: 10);
        }
        Bio.note(c, 'Spread by sexual contact, infected blood, shared needles and from mother to child through the placenta. Diagnosed by ELISA. No cure; anti-retroviral drugs prolong life.', Offset(x, size.height - 120), maxWidth: size.width - x - 30, size: 16, color: IX.ink);
      }),
    );
  }
}
