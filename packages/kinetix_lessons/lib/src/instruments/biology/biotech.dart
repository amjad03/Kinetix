import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Biotechnology and microbes (2nd PUC Biology ch. 8, 9, 10): restriction sites and fragments,
/// agarose gel electrophoresis, blue–white screening, PCR (thermal cycle, efficiency and
/// detection), a stirred-tank bioreactor, Bt toxin activation, a transgenic breeding cross,
/// sewage treatment (BOD) and biogas.
///
/// Preset: {"mode": "restriction"|"gel"|"bluewhite"|"pcr"|"bioreactor"|"bt"|"transgenic"|"bod"|
/// "biogas", "site": 6, "Lk": 50 (kb), "V": 100, "run": 45 (min), "p": 30 (%), "amp": true,
/// "xgal": true, "N0": 1, "E": 100, "cycles": 30, "detect": false, "r": 0.6, "K": 8, "t": 10,
/// "ph": 10, "litter": 20, "gen": 1, "B0": 300, "k": 0.4, "hrs": 6, "ch4": 60, "h2": 2}.
class BiotechInstrument extends StatefulWidget {
  const BiotechInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<BiotechInstrument> createState() => _BioTechState();
}

class _BioTechState extends BioState<BiotechInstrument> {
  @override
  String get instrumentId => 'bio-biotech';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['restriction', 'gel', 'bluewhite', 'pcr', 'bioreactor', 'bt', 'transgenic', 'bod', 'biogas'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'EcoRI cuts': {'mode': 'restriction'},
    'Agarose gel': {'mode': 'gel'},
    'Blue–white screening': {'mode': 'bluewhite'},
    'PCR': {'mode': 'pcr'},
    'PCR diagnosis': {'mode': 'pcr', 'detect': true, 'N0': 100},
    'Bioreactor': {'mode': 'bioreactor'},
    'Bt toxin': {'mode': 'bt'},
    'Transgenic cross': {'mode': 'transgenic'},
    'Sewage BOD': {'mode': 'bod'},
    'Biogas': {'mode': 'biogas'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'site': 6, 'Lk': 50, 'V': 100, 'run': 45, 'p': 30, 'amp': true, 'xgal': true, 'N0': 1, 'E': 100, 'cycles': 30, 'detect': false,
    'r': 0.6, 'K': 8, 't': 10, 'ph': 10, 'litter': 20, 'cross': 'founder', 'B0': 300, 'k': 0.4, 'hrs': 6, 'ch4': 60, 'h2': 2,
  };

  static const _sub = '2nd PUC Biology · Biotechnology: principles and processes';
  static const _sub10 = '2nd PUC Biology · Biotechnology and its applications';
  static const _sub8 = '2nd PUC Biology · Microbes in human welfare';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'gel' => _gel(),
    'bluewhite' => _blueWhite(),
    'pcr' => _pcr(),
    'bioreactor' => _bioreactor(),
    'bt' => _bt(),
    'transgenic' => _transgenic(),
    'bod' => _bod(),
    'biogas' => _biogas(),
    _ => _restriction(),
  };

  // ── Restriction enzymes ───────────────────────────────────────────────────────────
  Widget _restriction() {
    final nSite = i('site'), lk = n('Lk');
    final every = math.pow(4, nSite).toDouble();
    final cuts = lk * 1000 / every;
    return frame(
      title: 'Restriction enzymes: molecular scissors',
      subtitle: _sub,
      formula: 'an n-base site occurs once in 4ⁿ bp',
      readouts: [
        Readout('Site occurs every', grp(every), 'bp', IX.accent),
        Readout('Expected cuts', cuts >= 10 ? f0(cuts) : f1(cuts), 'in ${grp(lk)} kb', IX.positive),
        Readout('Fragments (linear DNA)', f0(cuts.round() + 1.0), '', IX.green),
        Readout('Average fragment', every >= 1000 ? '${f1(every / 1000)} kb' : '${f0(every)} bp', ''),
      ],
      controls: [
        slider('site', 'Length of recognition site', 4, 8, unit: 'bases'),
        slider('Lk', 'Length of the DNA', 5, 5000, unit: 'kb', div: 999, fmt: (x) => grp(x)),
      ],
      painter: BioPainter((c, size) {
        // EcoRI palindrome and sticky ends.
        Bio.heading(c, 'EcoRI recognises a palindrome: GAATTC reads the same 5′→3′ on both strands', const Offset(40, 24));
        const top = 'ATCGGAATTCTAGC', bot = 'TAGCCTTAAGATCG';
        final y1 = 110.0, y2 = 170.0;
        final w = math.min(56.0, (size.width - 160) / top.length);
        final x0 = (size.width - w * top.length) / 2;
        Color col(String b) => switch (b) { 'A' => BioC.dnaA, 'T' => BioC.dnaT, 'G' => BioC.dnaG, _ => BioC.dnaC };
        for (var q = 0; q < top.length; q++) {
          final inSite = q >= 4 && q < 10;
          final x = x0 + q * w + w / 2;
          for (final (y, ch) in [(y1, top[q]), (y2, bot[q])]) {
            final r = Rect.fromCenter(center: Offset(x, y), width: w - 6, height: 44);
            c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(8)), Paint()..color = inSite ? col(ch) : col(ch).withValues(alpha: 0.35));
            IxPaint.label(c, ch, r.center, size: 22, color: Colors.white, w: FontWeight.w700);
          }
        }
        IxPaint.label(c, "5′", Offset(x0 - 24, y1), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        IxPaint.label(c, "3′", Offset(x0 + top.length * w + 24, y1), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        IxPaint.label(c, "3′", Offset(x0 - 24, y2), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        IxPaint.label(c, "5′", Offset(x0 + top.length * w + 24, y2), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        // Cut lines: between G and A on both strands (staggered).
        final cut = Paint()..color = IX.positive..strokeWidth = 4;
        final xa = x0 + 5 * w, xb = x0 + 9 * w;
        c.drawLine(Offset(xa, y1 - 30), Offset(xa, y1 + 24), cut);
        c.drawLine(Offset(xa, y1 + 24), Offset(xb, y2 - 24), cut..strokeWidth = 2);
        c.drawLine(Offset(xb, y2 - 24), Offset(xb, y2 + 30), cut..strokeWidth = 4);
        Bio.note(c, 'Cutting a little away from the centre on each strand leaves single-stranded sticky ends (AATT overhangs) that pair with any DNA cut by the same enzyme; DNA ligase then seals them.', Offset(40, y2 + 46), maxWidth: size.width - 80, size: 17, color: IX.ink);
        // DNA bar with expected cut positions.
        final bar = Rect.fromLTWH(60, size.height * 0.52, size.width - 120, 26);
        Bio.heading(c, 'A ${grp(lk)} kb DNA molecule cut by an enzyme with a $nSite-base site', Offset(bar.left, bar.top - 52));
        c.drawRRect(RRect.fromRectAndRadius(bar, const Radius.circular(13)), Paint()..color = const Color(0xFF6E8FC7));
        final rnd = math.Random(nSite * 31 + lk.round());
        final k = cuts.round();
        final pos = [for (var q = 0; q < math.min(k, 400); q++) rnd.nextDouble()]..sort();
        for (final p in pos) {
          final x = bar.left + p * bar.width;
          c.drawLine(Offset(x, bar.top - 10), Offset(x, bar.bottom + 10), Paint()..color = IX.positive..strokeWidth = k > 150 ? 1 : 2.5);
        }
        if (k > 400) IxPaint.label(c, '(${grp(k)} cuts: 400 drawn)', Offset(bar.right, bar.bottom + 26), size: 16, color: IX.muted, align: Alignment.centerRight);
        // Table of site lengths.
        final tb = Rect.fromLTWH(60, bar.bottom + 70, size.width - 120, math.min(140, size.height - bar.bottom - 100));
        final cw = tb.width / 5;
        for (var q = 0; q < 5; q++) {
          final len = q + 4;
          final on = len == nSite;
          final r = Rect.fromLTWH(tb.left + q * cw + 8, tb.top, cw - 16, tb.height);
          Bio.card(c, r, fill: on ? IX.accentSoft : IX.paper, edge: on ? IX.accent : IX.rule);
          IxPaint.label(c, '$len-base site', Offset(r.center.dx, r.top + 30), size: 18, color: on ? IX.accent : IX.ink, w: FontWeight.w700);
          IxPaint.label(c, 'every ${grp(math.pow(4, len))} bp', Offset(r.center.dx, r.top + 64), size: 17, color: IX.inkSoft, w: FontWeight.w500);
          IxPaint.label(c, ['AluI AGCT', 'HinfI', 'EcoRI GAATTC', 'SfiI', 'NotI'][q], Offset(r.center.dx, r.top + 96), size: 15, color: IX.muted);
        }
      }),
    );
  }

  // ── Gel electrophoresis ───────────────────────────────────────────────────────────
  static const _ladder = <double>[10000, 5000, 3000, 2000, 1000, 500, 250];

  Widget _gel() {
    final v = n('V'), run = n('run');
    // Distance ∝ V·t·(log10 Lmax − log10 L), capped at the gel length (cm).
    double dist(double bp) => math.min(48.0, v / 100 * run / 45 * 12 * (4.4 - math.log(bp) / math.ln10));
    const samples = <List<double>>[[5000, 2000, 500], [3000, 1000], [10000, 250]];
    return frame(
      title: 'Agarose gel electrophoresis',
      subtitle: _sub,
      formula: 'smaller fragments move farther',
      readouts: [
        Readout('Voltage', f0(v), 'V', IX.accent),
        Readout('Run time', f0(run), 'min'),
        Readout('250 bp band', f1(dist(250)), 'mm from well', IX.green),
        Readout('10 kb band', f1(dist(10000)), 'mm from well', IX.amber),
      ],
      controls: [
        slider('V', 'Voltage', 50, 150, unit: 'V', div: 20),
        slider('run', 'Run time', 0, 90, unit: 'min', div: 18),
      ],
      painter: BioPainter((c, size) {
        // Tank.
        final tank = Rect.fromLTWH(60, 70, size.width * 0.62, size.height - 200);
        c.drawRRect(RRect.fromRectAndRadius(tank.inflate(18), const Radius.circular(18)), Paint()..color = const Color(0xFFDCE6F0));
        c.drawRRect(RRect.fromRectAndRadius(tank.inflate(18), const Radius.circular(18)), Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
        final gel = tank.deflate(30);
        c.drawRRect(RRect.fromRectAndRadius(gel, const Radius.circular(6)), Paint()..color = const Color(0xFF26304A));
        IxPaint.label(c, '− cathode (black)', Offset(tank.center.dx, tank.top - 40), size: 18, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, '+ anode (red)', Offset(tank.center.dx, tank.bottom + 40), size: 18, color: IX.positive, w: FontWeight.w700);
        final lanes = 4;
        final lw = gel.width / lanes;
        final scale = (gel.height - 40) / 48;
        for (var l = 0; l < lanes; l++) {
          final cx = gel.left + lw * (l + 0.5);
          final well = Rect.fromCenter(center: Offset(cx, gel.top + 18), width: lw * 0.6, height: 10);
          c.drawRect(well, Paint()..color = Colors.black);
          IxPaint.label(c, l == 0 ? 'ladder' : 'sample $l', Offset(cx, gel.top - 14 - 30), size: 16, color: IX.inkSoft, w: FontWeight.w600);
          final bands = l == 0 ? _ladder : samples[l - 1];
          for (final bp in bands) {
            final y = well.bottom + dist(bp) * scale;
            final br = Rect.fromCenter(center: Offset(cx, y), width: lw * 0.6, height: 9);
            c.drawRRect(RRect.fromRectAndRadius(br.inflate(5), const Radius.circular(6)), Paint()..color = const Color(0xFFFF9B3D).withValues(alpha: 0.25)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5));
            c.drawRRect(RRect.fromRectAndRadius(br, const Radius.circular(4)), Paint()..color = const Color(0xFFFFC27A));
            if (l == 0) IxPaint.label(c, bp >= 1000 ? '${f0(bp / 1000)} kb' : '${f0(bp)} bp', Offset(gel.left - 12, y), size: 15, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerRight);
          }
        }
        // Explanation.
        final x = tank.right + 50;
        Bio.heading(c, 'Steps', Offset(x, 60));
        const steps = ['Cut DNA with restriction enzymes', 'Load into wells of agarose gel', 'DNA (− charged) moves to the anode', 'Agarose sieves: small fragments go farther', 'Stain with ethidium bromide; view in UV', 'Cut out the band, extract: elution'];
        for (var q = 0; q < steps.length; q++) {
          final yy = 100 + q * 64.0;
          c.drawCircle(Offset(x + 16, yy + 14), 16, Paint()..color = IX.accent);
          IxPaint.label(c, '${q + 1}', Offset(x + 16, yy + 14), size: 16, color: Colors.white, w: FontWeight.w700);
          Bio.note(c, steps[q], Offset(x + 44, yy), maxWidth: size.width - x - 60, size: 17, color: IX.ink);
        }
        Bio.note(c, 'Bands glow orange under UV after ethidium bromide staining.', Offset(x, size.height - 110), maxWidth: size.width - x - 40, size: 16, color: IX.inkSoft);
      }),
    );
  }

  // ── Blue–white screening ──────────────────────────────────────────────────────────
  Widget _blueWhite() {
    final p = n('p') / 100;
    final amp = b('amp'), xg = b('xgal');
    const total = 60;
    final transformed = amp ? total : 160;
    final white = amp && xg ? (total * p).round() : 0;
    return frame(
      title: 'Blue–white screening of recombinants',
      subtitle: _sub,
      formula: 'insert in lacZ → no β-galactosidase → white',
      readouts: [
        Readout('Colonies', amp ? '$total' : 'lawn', amp ? 'transformed only' : 'all cells grow', IX.accent),
        Readout('White (recombinant)', amp && xg ? '$white' : '—', '', const Color(0xFF8A8F99)),
        Readout('Blue (no insert)', amp && xg ? '${total - white}' : '—', '', const Color(0xFF2E5AAC)),
        Readout('Pick', amp && xg ? 'White colonies' : 'Cannot tell', '', IX.green),
      ],
      controls: [
        slider('p', 'Plasmids that took the insert', 0, 100, unit: '%'),
        toggle('amp', 'Ampicillin in the plate', on: 'Yes', off: 'No'),
        toggle('xgal', 'X-gal in the plate', on: 'Yes', off: 'No'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.33, size.height * 0.5);
        final rad = math.min(size.width * 0.28, size.height * 0.42);
        c.drawCircle(ctr + const Offset(0, 8), rad + 10, Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
        c.drawCircle(ctr, rad + 10, Paint()..color = const Color(0xFFE8F1F8));
        c.drawCircle(ctr, rad + 10, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
        c.drawCircle(ctr, rad, Paint()..color = const Color(0xFFF2E3B3));
        final rnd = math.Random(8);
        final count = amp ? total : transformed;
        for (var q = 0; q < count; q++) {
          final a = rnd.nextDouble() * 2 * math.pi, rr = math.sqrt(rnd.nextDouble()) * (rad - 24);
          final at = ctr + Offset(math.cos(a), math.sin(a)) * rr;
          final isWhite = q < white;
          final col = !xg ? const Color(0xFFF5F0E2) : (!amp ? (rnd.nextDouble() < 0.3 ? const Color(0xFF2E5AAC) : const Color(0xFF2E5AAC)) : (isWhite ? const Color(0xFFF7F7F2) : const Color(0xFF2E5AAC)));
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: at, radius: amp ? 13 : 8)), col, stroke: 1.2, shadow: false, edge: Bio.darken(col, 0.3));
        }
        IxPaint.label(c, amp ? 'Agar + ampicillin${xg ? ' + X-gal' : ''}' : 'Agar without ampicillin', Offset(ctr.dx, ctr.dy + rad + 40), size: 19, color: IX.ink, w: FontWeight.w600);
        // Plasmid map.
        final pc = Offset(size.width * 0.80, size.height * 0.30);
        const pr = 110.0;
        c.drawCircle(pc, pr, Paint()..color = const Color(0xFF6E8FC7)..style = PaintingStyle.stroke..strokeWidth = 14);
        void seg(double a0, double sweep, Color col, String lab, Offset off) {
          c.drawArc(Rect.fromCircle(center: pc, radius: pr), a0, sweep, false, Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = 18..strokeCap = StrokeCap.butt);
          final m = a0 + sweep / 2;
          IxPaint.label(c, lab, pc + Offset(math.cos(m), math.sin(m)) * (pr + 40) + off, size: 17, color: Bio.darken(col, 0.2), w: FontWeight.w700);
        }
        seg(-2.6, 1.3, const Color(0xFFB0475A), 'amp^R', Offset.zero);
        seg(0.2, 1.1, const Color(0xFF2E5AAC), 'lacZ', const Offset(20, 0));
        seg(0.55, 0.35, const Color(0xFFE0A030), 'insert', const Offset(40, 20));
        seg(2.4, 0.4, IX.muted, 'ori', Offset.zero);
        IxPaint.label(c, 'pUC vector', pc, size: 18, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, 'Ampicillin kills cells that did not take a plasmid. X-gal is cut by β-galactosidase (from lacZ) to a blue product. Foreign DNA inserted inside lacZ inactivates it (insertional inactivation), so recombinant colonies stay white.', Offset(size.width * 0.62, size.height * 0.58), maxWidth: size.width * 0.36, size: 17, color: IX.ink);
      }),
    );
  }

  // ── PCR ───────────────────────────────────────────────────────────────────────────
  Widget _pcr() {
    final n0 = n('N0'), e = n('E') / 100, nc = i('cycles');
    final det = b('detect');
    final copies = n0 * math.pow(1 + e, nc).toDouble();
    final lc = math.log(copies) / math.ln10;
    final ct = (10 - math.log(n0) / math.ln10) / (math.log(1 + e) / math.ln10);
    final c9 = (9 - math.log(n0) / math.ln10) / (math.log(1 + e) / math.ln10);
    return frame(
      title: det ? 'PCR to detect a pathogen early' : 'Polymerase chain reaction',
      subtitle: det ? _sub10 : _sub,
      formula: 'N = N₀ (1 + E)ⁿ',
      readouts: [
        Readout('Copies after $nc cycles', '10^${f1(lc)}', '', IX.green),
        if (det) Readout('Crosses detection line', ct <= 40 ? 'cycle ${f1(ct)}' : 'not by 40', '', IX.positive) else Readout('Cycles to 10⁹ copies', f1(c9), '', IX.accent),
        Readout('Efficiency', f0(e * 100), '% per cycle'),
        Readout('Time', f0(nc * 3.0), 'min (≈ 3 min per cycle)'),
      ],
      controls: [
        slider('N0', 'Starting copies', 1, 1000, div: 999),
        slider('E', 'Efficiency per cycle', 50, 100, unit: '%'),
        slider('cycles', 'Number of cycles', 1, 40),
        toggle('detect', 'Detection line at 10¹⁰', on: 'Show', off: 'Hide'),
      ],
      painter: BioPainter((c, size) {
        // Temperature profile of one cycle.
        final tp = Plot(Rect.fromLTRB(120, 80, size.width * 0.44, size.height * 0.42), 0, 3, 40, 100);
        tp.frame(c, xs: [0, 1, 2, 3], ys: [55, 72, 94], fx: f0, fy: (y) => '${f0(y)} °C', xLabel: 'Minutes (one cycle)', title: 'One cycle in the thermal cycler');
        double temp(double t) => t < 1 ? 94 : (t < 1.8 ? 55 : 72);
        final pth = Path();
        for (var q = 0; q <= 300; q++) {
          final x = 3.0 * q / 300;
          final o = tp.pt(x, temp(x));
          q == 0 ? pth.moveTo(o.dx, o.dy) : pth.lineTo(o.dx, o.dy);
        }
        Bio.stroke(c, pth, IX.positive, 4);
        for (final (x, lab) in [(0.5, 'Denaturation'), (1.4, 'Annealing'), (2.4, 'Extension')]) {
          IxPaint.label(c, lab, tp.pt(x, temp(x)) + const Offset(0, -20), size: 16, color: IX.ink, w: FontWeight.w600, halo: true);
        }
        // Strand cartoon.
        final sy = size.height * 0.42 + 100;
        final sx = 120.0, sw = size.width * 0.36;
        Bio.note(c, 'Primers (short DNA) bind each strand; Taq polymerase (from Thermus aquaticus) is heat-stable and extends them at 72 °C. Every cycle doubles the target DNA.', Offset(sx - 60, sy), maxWidth: sw + 60, size: 17, color: IX.ink);
        for (var q = 0; q < math.min(nc, 4); q++) {
          final copiesQ = 1 << q;
          final y = sy + 100 + q * 46.0;
          IxPaint.label(c, 'cycle $q', Offset(sx - 20, y), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
          for (var k = 0; k < math.min(copiesQ, 8); k++) {
            final x = sx + k * (sw / 8);
            c.drawLine(Offset(x, y - 6), Offset(x + sw / 8 - 12, y - 6), Paint()..color = const Color(0xFF3F6FB5)..strokeWidth = 5);
            c.drawLine(Offset(x, y + 6), Offset(x + sw / 8 - 12, y + 6), Paint()..color = const Color(0xFFE0A030)..strokeWidth = 5);
          }
        }
        // Copies vs cycle (log).
        final plot = Plot(Rect.fromLTRB(size.width * 0.56, 80, size.width - 40, size.height - 120), 0, 40, 0, 14);
        plot.frame(c, xs: [0, 10, 20, 30, 40], ys: [0, 2, 4, 6, 8, 10, 12, 14], fy: (y) => '10${_sup(y.toInt())}', xLabel: 'Cycle number n', yLabel: 'Copies (log scale)', title: 'Copies double each cycle');
        if (det) plot.hline(c, 10, IX.positive, label: 'detection line 10¹⁰');
        plot.curve(c, (x) => math.log(n0) / math.ln10 + x * math.log(1 + e) / math.ln10, IX.green, w: 4.5);
        if (e < 1) plot.curve(c, (x) => math.log(n0) / math.ln10 + x * math.log(2) / math.ln10, IX.muted, w: 2, dashed: true, label: 'perfect doubling', labelX: 8);
        plot.dot(c, nc.toDouble(), lc, IX.green, label: '10^${f1(lc)}', align: Alignment.centerRight);
        if (det && ct <= 40) plot.vline(c, ct, IX.positive, label: 'Ct ${f1(ct)}');
        if (det) Bio.note(c, 'More starting DNA crosses the line sooner. PCR finds a pathogen (e.g. HIV in suspected AIDS patients) long before symptoms.', Offset(plot.r.left + 16, plot.r.top + 50), maxWidth: 420, size: 16, color: IX.ink);
      }),
    );
  }

  static String _sup(int k) => k.toString().split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[int.parse(d)]).join();

  // ── Bioreactor ────────────────────────────────────────────────────────────────────
  Widget _bioreactor() {
    final r = n('r'), k = n('K'), t = n('t');
    const x0 = 0.1;
    double x(double tt) => k / (1 + (k / x0 - 1) * math.exp(-r * tt));
    final now = x(t);
    final tMid = math.log(k / x0 - 1) / r;
    return frame(
      title: 'A stirred-tank bioreactor',
      subtitle: _sub,
      formula: 'dX/dt = rX (1 − X/K)',
      readouts: [
        Readout('Biomass now', f2(now), 'g/L', IX.green),
        Readout('Fastest growth', f2(r * k / 4), 'g/L per h', IX.accent),
        Readout('At time', f1(tMid), 'h', IX.accent),
        Readout('Volume', '100–1000', 'litres'),
      ],
      controls: [
        slider('r', 'Growth rate', 0.2, 1.5, unit: '/h', dp: 2, div: 26),
        slider('K', 'Maximum biomass', 1, 10, unit: 'g/L', dp: 1, div: 18),
        slider('t', 'Time', 0, 30, unit: 'h', dp: 1, div: 60),
      ],
      painter: BioPainter((c, size) {
        final r0 = Rect.fromLTWH(60, 70, size.width * 0.36, size.height - 160);
        final tank = RRect.fromRectAndRadius(Rect.fromLTWH(r0.left + 60, r0.top + 70, r0.width - 120, r0.height - 110), const Radius.circular(40));
        c.drawRRect(tank, Paint()..color = IX.glass);
        final broth = Rect.fromLTWH(tank.left, tank.top + 60, tank.width, tank.height - 60);
        c.save();
        c.clipRRect(tank);
        c.drawRect(broth, Paint()..color = Color.lerp(const Color(0xFFF2E8C8), const Color(0xFFB48A3C), now / 10)!);
        final rnd = math.Random(5);
        for (var q = 0; q < 50; q++) {
          final b0 = Offset(broth.left + 20 + rnd.nextDouble() * (broth.width - 40), broth.top + rnd.nextDouble() * broth.height);
          c.drawCircle(b0, 2 + rnd.nextDouble() * 4, Paint()..color = Colors.white.withValues(alpha: 0.7));
        }
        c.restore();
        c.drawRRect(tank, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
        // Stirrer, sparger, ports.
        c.drawLine(Offset(tank.center.dx, r0.top + 20), Offset(tank.center.dx, tank.bottom - 50), Paint()..color = IX.steel..strokeWidth = 7);
        for (final yy in [broth.top + broth.height * 0.35, tank.bottom - 60]) {
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(tank.center.dx, yy), width: 90, height: 14), const Radius.circular(7)), Paint()..color = IX.steel);
        }
        c.drawRect(Rect.fromCenter(center: Offset(tank.center.dx, r0.top + 30), width: 60, height: 40), Paint()..color = const Color(0xFF6B7385));
        final spY = tank.bottom - 24;
        c.drawLine(Offset(tank.left - 50, spY), Offset(tank.center.dx + 50, spY), Paint()..color = const Color(0xFF6B7385)..strokeWidth = 6);
        Bio.leader(c, Offset(tank.center.dx + 30, r0.top + 30), Offset(r0.right + 10, r0.top + 30), 'motor');
        Bio.leader(c, Offset(tank.center.dx + 40, broth.top + broth.height * 0.35), Offset(r0.right + 10, broth.top + broth.height * 0.35), 'flat-bladed impeller');
        Bio.leader(c, Offset(tank.center.dx + 40, spY), Offset(r0.right + 10, spY), 'sterile air sparger');
        Bio.leader(c, Offset(tank.right - 10, tank.top + 40), Offset(r0.right + 10, tank.top + 90), 'foam breaker; pH, temperature probes');
        final plot = Plot(Rect.fromLTRB(size.width * 0.62, 90, size.width - 40, size.height - 120), 0, 30, 0, 10.5);
        plot.frame(c, xs: [0, 10, 20, 30], ys: [0, 5, 10], xLabel: 'Time (h)', yLabel: 'Biomass (g/L)', title: 'Batch culture: an S-shaped curve');
        plot.hline(c, k, IX.green, label: 'K = ${f1(k)} g/L');
        plot.vline(c, tMid, IX.accent, label: 'fastest');
        plot.curve(c, x, IX.green, w: 4.5);
        plot.dot(c, t, now, IX.green);
        Bio.note(c, 'Continuous culture drains used medium and adds fresh medium to hold cells in the steep, log phase, where product forms fastest.', Offset(plot.r.left, plot.r.bottom + 56), maxWidth: plot.r.width, size: 16, color: IX.ink);
      }),
    );
  }

  // ── Bt toxin ──────────────────────────────────────────────────────────────────────
  Widget _bt() {
    final ph = n('ph');
    final act = 1 / (1 + math.exp(-(ph - 8.5) * 2.2));
    final insect = ph > 8;
    return frame(
      title: 'How Bt cotton kills bollworms',
      subtitle: _sub10,
      formula: 'protoxin → active toxin at alkaline pH',
      readouts: [
        Readout('Gut pH of the eater', f1(ph), insect ? 'insect larva' : (ph < 4 ? 'human stomach' : 'neutral'), IX.accent),
        Readout('Toxin activated', f0(act * 100), '%', IX.positive),
        Readout('Larva', act > 0.5 ? 'Gut lysed, dies' : 'Unharmed', '', act > 0.5 ? IX.positive : IX.green),
        Readout('Genes', 'cryIAc, cryIIAb', 'bollworm'),
      ],
      controls: [
        slider('ph', 'Gut pH of the eater', 2, 11, dp: 1, div: 18),
        Padding(padding: const EdgeInsets.only(top: 6), child: Text('cryIAb controls corn borer. The bacterium itself is not harmed: the toxin is stored as an inactive crystal.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        // Gut cross-section strip.
        final gut = Rect.fromLTWH(40, 80, size.width - 80, size.height * 0.42);
        Bio.heading(c, 'Inside the midgut', Offset(gut.left, 30));
        c.drawRRect(RRect.fromRectAndRadius(gut, const Radius.circular(30)), Paint()..color = Color.lerp(const Color(0xFFF4E7D2), const Color(0xFFE8D9F0), (ph - 2) / 9)!);
        final wallY = gut.bottom - 60;
        for (var q = 0; q < 16; q++) {
          final x = gut.left + 30 + q * (gut.width - 60) / 16;
          final lysed = act > 0.5 && q % 3 != 1;
          final cell = Rect.fromLTWH(x, wallY, (gut.width - 60) / 16 - 6, 56);
          Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(cell, const Radius.circular(8))), lysed ? const Color(0xFFE9B9B2) : BioC.tissue, stroke: 1.5, shadow: false, edge: lysed ? IX.positive : const Color(0xFFC79B87));
          if (lysed) {
            for (var k = 0; k < 3; k++) {
              c.drawCircle(cell.topCenter + Offset(k * 8 - 8, -6 - k * 6.0), 3, Paint()..color = IX.positive.withValues(alpha: 0.6));
            }
            c.drawLine(cell.topCenter + const Offset(-6, 10), cell.topCenter + const Offset(6, 30), Paint()..color = IX.positive..strokeWidth = 2);
          }
          for (var k = 0; k < 4; k++) {
            c.drawLine(cell.topLeft + Offset(4 + k * cell.width / 4, 0), cell.topLeft + Offset(4 + k * cell.width / 4, -10), Paint()..color = const Color(0xFFC79B87)..strokeWidth = 2);
          }
        }
        // Crystals → toxins.
        final rnd = math.Random(4);
        for (var q = 0; q < 14; q++) {
          final at = Offset(gut.left + 60 + rnd.nextDouble() * (gut.width - 120), gut.top + 40 + rnd.nextDouble() * (wallY - gut.top - 100));
          final activeOne = rnd.nextDouble() < act;
          if (activeOne) {
            final bound = at + Offset(0, (wallY - 18 - at.dy) * 0.9);
            c.drawPath(Path()..addPolygon([bound + const Offset(-10, -8), bound + const Offset(10, -8), bound + const Offset(0, 12)], true), Paint()..color = IX.positive);
          } else {
            c.drawPath(Path()..addPolygon([at + const Offset(0, -14), at + const Offset(12, 0), at + const Offset(0, 14), at + const Offset(-12, 0)], true), Paint()..color = const Color(0xFF8C6BB1));
          }
        }
        IxPaint.label(c, 'inactive protoxin crystals', Offset(gut.left + 160, gut.top + 24), size: 16, color: const Color(0xFF8C6BB1), w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'active toxin binds the gut lining, makes pores, cells swell and burst', Offset(gut.right - 30, wallY - 30), size: 16, color: IX.positive, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        // Activation curve.
        final plot = Plot(Rect.fromLTRB(120, gut.bottom + 90, size.width * 0.60, size.height - 70), 2, 11, 0, 100);
        plot.frame(c, xs: [2, 4, 6, 8, 10], ys: [0, 50, 100], xLabel: 'Gut pH', yLabel: 'Activated (%)');
        plot.curve(c, (x) => 100 / (1 + math.exp(-(x - 8.5) * 2.2)), IX.positive, w: 4);
        plot.dot(c, ph, act * 100, IX.positive);
        Bio.note(c, 'Human stomach (pH ≈ 2) and gut are not alkaline enough to activate the protoxin, and our gut cells lack its receptor. A bollworm\'s gut is alkaline (pH ≈ 10).', Offset(size.width * 0.66, gut.bottom + 80), maxWidth: size.width * 0.32, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Transgenic cross ──────────────────────────────────────────────────────────────
  Widget _transgenic() {
    final litter = i('litter'), g = str('cross', 'founder') == 'carrier' ? 2 : 1;
    // gen 1: founder (Tg/−) × normal → ½ Tg/−.  gen 2: Tg/− × Tg/− → ¼ Tg/Tg, ½ Tg/−, ¼ −/−.
    final pHom = g == 2 ? 0.25 : 0.0, pHet = 0.5;
    final rnd = math.Random(litter * 7 + g);
    final pups = [for (var q = 0; q < litter; q++) rnd.nextDouble()];
    String geno(double u) => u < pHom ? 'Tg/Tg' : (u < pHom + pHet ? 'Tg/−' : '−/−');
    final nHom = pups.where((u) => geno(u) == 'Tg/Tg').length, nHet = pups.where((u) => geno(u) == 'Tg/−').length;
    return frame(
      title: 'Breeding a transgenic line',
      subtitle: _sub10,
      formula: g == 1 ? 'founder Tg/− × normal −/− → ½ carry the gene' : 'Tg/− × Tg/− → ¼ Tg/Tg : ½ Tg/− : ¼ −/−',
      readouts: [
        Readout('Expected carriers', f1(litter * (pHom + pHet)), 'of $litter', IX.green),
        Readout('This litter', '${nHom + nHet} carry', '$nHom homozygous', IX.accent),
        Readout('Generation', g == 1 ? 'Founder × normal' : 'Carrier × carrier', ''),
        Readout('Example', 'Rosie (1997)', 'α-lactalbumin milk'),
      ],
      controls: [
        slider('litter', 'Young in the litter', 4, 40),
        choice('cross', 'Cross', const {'founder': 'Founder × normal', 'carrier': 'Carrier × carrier'}),
      ],
      painter: BioPainter((c, size) {
        // Parents.
        final py = 110.0;
        void cow(Offset at, Color body, {bool tg = false, double k = 1, String? label}) {
          Bio.soft(c, Bio.blob(at, 46 * k, 26 * k, seed: 2), body, stroke: 1.6, shadow: false, edge: Bio.darken(body, 0.35));
          Bio.soft(c, Bio.blob(at + Offset(-50 * k, -12 * k), 18 * k, 14 * k, seed: 5), body, stroke: 1.4, shadow: false, edge: Bio.darken(body, 0.35));
          for (final dx in [-28.0, -12.0, 14.0, 30.0]) {
            c.drawLine(at + Offset(dx * k, 18 * k), at + Offset(dx * k, 42 * k), Paint()..color = Bio.darken(body, 0.35)..strokeWidth = 4 * k..strokeCap = StrokeCap.round);
          }
          if (tg) c.drawCircle(at + Offset(10 * k, -4 * k), 9 * k, Paint()..color = IX.green);
          if (label != null) IxPaint.label(c, label, at + Offset(0, 66 * k), size: 17, color: IX.ink, w: FontWeight.w600);
        }
        final x1 = size.width * 0.30, x2 = size.width * 0.62;
        cow(Offset(x1, py), const Color(0xFFF1E6D6), tg: true, label: g == 1 ? 'Founder Tg/−' : 'Carrier Tg/−');
        IxPaint.label(c, '×', Offset((x1 + x2) / 2, py), size: 40, color: IX.inkSoft, w: FontWeight.w700);
        cow(Offset(x2, py), const Color(0xFFF1E6D6), tg: g == 2, label: g == 1 ? 'Normal −/−' : 'Carrier Tg/−');
        // Litter grid.
        final grid = Rect.fromLTWH(60, py + 120, size.width - 120, size.height - py - 260);
        final cols = math.min(10, litter);
        final rows = (litter / cols).ceil();
        final cw = grid.width / cols, ch = grid.height / math.max(rows, 1);
        final k = math.min(cw / 130, ch / 90).clamp(0.35, 0.9).toDouble();
        for (var q = 0; q < litter; q++) {
          final at = Offset(grid.left + (q % cols + 0.5) * cw, grid.top + (q ~/ cols + 0.4) * ch);
          final gt = geno(pups[q]);
          cow(at, gt == '−/−' ? const Color(0xFFE6E2DA) : const Color(0xFFF1E6D6), tg: gt != '−/−', k: k);
          IxPaint.label(c, gt, at + Offset(0, 54 * k + 6), size: 15, color: gt == '−/−' ? IX.muted : IX.green, w: FontWeight.w600);
        }
        Bio.note(c, 'A founder usually carries the transgene on one chromosome only. Crossing two carriers gives some homozygous Tg/Tg animals, which pass the gene to all their young: a true-breeding transgenic line. Green dot = transgene.', Offset(60, size.height - 70), maxWidth: size.width - 120, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Sewage: BOD ───────────────────────────────────────────────────────────────────
  Widget _bod() {
    final b0 = n('B0'), k = n('k'), hrs = n('hrs');
    final now = b0 * math.exp(-k * hrs);
    final need = b0 > 30 ? math.log(b0 / 30) / k : 0.0;
    return frame(
      title: 'Secondary treatment: BOD falls in the aeration tank',
      subtitle: _sub8,
      formula: 'BOD = BOD₀ e^(−kt)',
      readouts: [
        Readout('BOD now', f0(now), 'mg/L', const Color(0xFF8C6B4A)),
        Readout('Removed', f0(100 * (1 - now / b0)), '%', IX.green),
        Readout('Time to 30 mg/L', f1(need), 'h', IX.accent),
        Readout('Microbes', 'Flocs', 'bacteria + fungal filaments'),
      ],
      controls: [
        slider('B0', 'BOD entering the tank', 50, 400, unit: 'mg/L', div: 35),
        slider('k', 'Microbial activity (rate)', 0.1, 1, unit: '/h', dp: 2, div: 18),
        slider('hrs', 'Time in the tank', 0, 12, unit: 'h', dp: 1, div: 24),
      ],
      painter: BioPainter((c, size) {
        // Treatment train.
        final y = 80.0;
        final boxes = ['Primary: sieving, sedimentation', 'Aeration tank: flocs eat organic matter', 'Settling tank: activated sludge', 'Anaerobic digester: biogas'];
        final w = (size.width - 80) / 4;
        for (var q = 0; q < 4; q++) {
          final r = Rect.fromLTWH(40 + q * w + 10, y, w - 30, 92);
          Bio.box(c, r, boxes[q], color: q == 1 ? IX.accent : const Color(0xFF6B7385), size: 17, filled: q == 1);
          if (q < 3) IxPaint.arrow(c, Offset(r.right + 2, r.center.dy), Offset(r.right + 26, r.center.dy), IX.inkSoft);
        }
        // Tank with bubbles and flocs.
        final tank = Rect.fromLTWH(60, y + 140, size.width * 0.34, size.height - y - 260);
        c.drawRRect(RRect.fromRectAndRadius(tank, const Radius.circular(12)), Paint()..color = Color.lerp(const Color(0xFFB7D3E0), const Color(0xFF8C6B4A), now / 400)!);
        c.drawRRect(RRect.fromRectAndRadius(tank, const Radius.circular(12)), Paint()..color = IX.steel..style = PaintingStyle.stroke..strokeWidth = 4);
        final rnd = math.Random(3);
        for (var q = 0; q < 40; q++) {
          c.drawCircle(Offset(tank.left + 20 + rnd.nextDouble() * (tank.width - 40), tank.top + 20 + rnd.nextDouble() * (tank.height - 40)), 3 + rnd.nextDouble() * 4, Paint()..color = Colors.white.withValues(alpha: 0.6));
        }
        for (var q = 0; q < 10; q++) {
          final at = Offset(tank.left + 40 + rnd.nextDouble() * (tank.width - 80), tank.top + 40 + rnd.nextDouble() * (tank.height - 80));
          Bio.soft(c, Bio.blob(at, 16, 12, seed: q, wobble: 0.35), const Color(0xFF7A6A3A), stroke: 1, shadow: false);
          for (var k2 = 0; k2 < 3; k2++) {
            final a = rnd.nextDouble() * 2 * math.pi;
            c.drawLine(at, at + Offset(math.cos(a), math.sin(a)) * 26, Paint()..color = const Color(0xFF7A6A3A)..strokeWidth = 1.5);
          }
        }
        IxPaint.label(c, 'air pumped in; flocs consume organic matter', Offset(tank.center.dx, tank.bottom + 24), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        final plot = Plot(Rect.fromLTRB(size.width * 0.52, y + 160, size.width - 40, size.height - 110), 0, 12, 0, 400);
        plot.frame(c, xs: [0, 3, 6, 9, 12], ys: [0, 100, 200, 300, 400], xLabel: 'Time in tank (h)', yLabel: 'BOD (mg/L)', title: 'Biochemical oxygen demand');
        plot.hline(c, 30, IX.positive, label: 'target 30 mg/L');
        plot.curve(c, (x) => b0 * math.exp(-k * x), const Color(0xFF8C6B4A), w: 4.5);
        plot.dot(c, hrs, now, const Color(0xFF8C6B4A));
      }),
    );
  }

  // ── Biogas ────────────────────────────────────────────────────────────────────────
  Widget _biogas() {
    final m = n('ch4'), h = n('h2');
    final co2 = math.max(0, 100 - m - h).toDouble();
    final energy = m / 100 * 35.8;
    return frame(
      title: 'Biogas from cattle dung',
      subtitle: _sub8,
      formula: 'methanogens: organic matter → CH₄ + CO₂',
      readouts: [
        Readout('Methane', f0(m), '%', IX.green),
        Readout('Carbon dioxide', f0(co2), '%', IX.muted),
        Readout('Fuel value', f1(energy), 'MJ per m³', IX.amber),
        Readout('Microbes', 'Methanobacterium', 'anaerobic'),
      ],
      controls: [
        slider('ch4', 'Methane', 40, 75, unit: '%'),
        slider('h2', 'Hydrogen and other gases', 0, 10, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        // Plant cross-section.
        final g = size.height * 0.55;
        c.drawRect(Rect.fromLTWH(0, g, size.width * 0.6, size.height - g), Paint()..color = const Color(0xFFC4A57C));
        final pit = RRect.fromRectAndRadius(Rect.fromLTWH(size.width * 0.14, g - 40, size.width * 0.30, size.height - g - 10), const Radius.circular(30));
        c.drawRRect(pit, Paint()..color = const Color(0xFF8C6B4A));
        final slurry = Rect.fromLTWH(pit.left + 10, g + 20, pit.width - 20, pit.height - 70);
        c.drawRRect(RRect.fromRectAndRadius(slurry, const Radius.circular(24)), Paint()..color = const Color(0xFF6B5432));
        // Floating gas holder.
        final holder = Rect.fromLTWH(pit.left + 20, g - 120, pit.width - 40, 160);
        c.drawRRect(RRect.fromRectAndCorners(holder, topLeft: const Radius.circular(40), topRight: const Radius.circular(40)), Paint()..color = const Color(0xFF7D8796));
        c.drawRRect(RRect.fromRectAndCorners(holder.deflate(10), topLeft: const Radius.circular(34), topRight: const Radius.circular(34)), Paint()..color = const Color(0xFFDCE8D2));
        IxPaint.label(c, 'gas: CH₄ ${f0(m)}%', holder.center + const Offset(0, -10), size: 18, color: IX.ink, w: FontWeight.w700);
        // Inlet, outlet, pipe.
        c.drawLine(Offset(pit.left - 80, g - 30), Offset(pit.left + 10, g + 120), Paint()..color = const Color(0xFF6B7385)..strokeWidth = 18);
        c.drawLine(Offset(pit.right + 80, g - 30), Offset(pit.right - 10, g + 120), Paint()..color = const Color(0xFF6B7385)..strokeWidth = 18);
        c.drawLine(Offset(holder.center.dx, holder.top), Offset(holder.center.dx, holder.top - 60), Paint()..color = IX.steel..strokeWidth = 8);
        c.drawLine(Offset(holder.center.dx, holder.top - 60), Offset(size.width * 0.58, holder.top - 60), Paint()..color = IX.steel..strokeWidth = 8);
        IxPaint.label(c, 'dung + water (slurry) in', Offset(pit.left - 90, g - 54), size: 16, color: IX.ink, w: FontWeight.w600);
        IxPaint.label(c, 'spent slurry: manure', Offset(pit.right + 90, g - 54), size: 16, color: IX.ink, w: FontWeight.w600);
        IxPaint.label(c, 'to kitchen, lamps', Offset(size.width * 0.58, holder.top - 84), size: 16, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
        // Pie.
        final pc = Offset(size.width * 0.80, size.height * 0.42);
        const pr = 150.0;
        var a = -math.pi / 2;
        for (final (v, col, lab) in [(m, IX.green, 'CH₄'), (co2, IX.muted, 'CO₂'), (h, IX.amber, 'H₂, H₂S')]) {
          final sw = 2 * math.pi * v / 100;
          if (sw <= 0) continue;
          c.drawArc(Rect.fromCircle(center: pc, radius: pr), a, sw, true, Paint()..color = col.withValues(alpha: 0.85));
          c.drawArc(Rect.fromCircle(center: pc, radius: pr), a, sw, true, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 3);
          final mid = a + sw / 2;
          if (v >= 4) IxPaint.label(c, '$lab ${f0(v)}%', pc + Offset(math.cos(mid), math.sin(mid)) * (pr + 44), size: 18, color: Bio.darken(col, 0.2), w: FontWeight.w700);
          a += sw;
        }
        Bio.note(c, 'Only methane burns, so its share sets the fuel value (pure CH₄ ≈ 35.8 MJ/m³). The technology was developed in India by IARI and KVIC; cattle dung (gobar) is rich in methanogens.', Offset(size.width * 0.64, size.height * 0.42 + pr + 70), maxWidth: size.width * 0.34, size: 16, color: IX.ink);
      }),
    );
  }
}
