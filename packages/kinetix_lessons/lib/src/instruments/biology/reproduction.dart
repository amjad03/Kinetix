import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Reproduction (2nd PUC Biology ch. 1–3): pollen and embryo-sac counts, ploidy after double
/// fertilisation, testis temperature, gametogenesis, the menstrual cycle with its hormones and
/// follicle, cleavage and the weeks of pregnancy, cumulative risk over repeated trials
/// (contraceptive failure, ART cycles) and the spread of an STI.
///
/// Preset: {"mode": "pollen"|"embryosac"|"double"|"testis"|"gametes"|"cycle"|"pregnancy"|"risk"|"sti",
/// "pmc": 50, "stamens": 5, "chr": 14, "mmc": 4, "n": 7, "Tb": 37, "sp": 25, "oo": 25, "L": 28,
/// "day": 14, "cleave": 3, "week": 12, "f": 1 (%), "years": 5, "art": false, "be": 0.5, "cu": 0}.
class ReproductionInstrument extends StatefulWidget {
  const ReproductionInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ReproductionInstrument> createState() => _ReproState();
}

class _ReproState extends BioState<ReproductionInstrument> {
  @override
  String get instrumentId => 'bio-reproduction';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['pollen', 'embryosac', 'double', 'testis', 'gametes', 'cycle', 'pregnancy', 'risk', 'sti'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Pollen count': {'mode': 'pollen'},
    'Embryo sac': {'mode': 'embryosac'},
    'Double fertilisation': {'mode': 'double'},
    'Testis temperature': {'mode': 'testis'},
    'Gametogenesis': {'mode': 'gametes'},
    'Menstrual cycle': {'mode': 'cycle'},
    'Pregnancy': {'mode': 'pregnancy'},
    'Contraceptive failure': {'mode': 'risk'},
    'ART cycles': {'mode': 'risk', 'art': true},
    'STI spread': {'mode': 'sti'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'pmc': 50, 'stamens': 5, 'chr': 14, 'mmc': 4, 'n': 7, 'Tb': 37, 'sp': 25, 'oo': 25, 'L': 28, 'day': 14, 'cleave': 3, 'week': 12,
    'f': mode == 'risk' && (widget.preset['art'] == true) ? 30 : 1, 'years': mode == 'risk' && (widget.preset['art'] == true) ? 3 : 5, 'art': false, 'be': 0.5, 'cu': 0,
  };

  static const _sub1 = '2nd PUC Biology · Sexual reproduction in flowering plants';
  static const _sub2 = '2nd PUC Biology · Human reproduction';
  static const _sub3 = '2nd PUC Biology · Reproductive health';
  static const _hap = Color(0xFF6E8FC7), _dip = Color(0xFF8C6BB1), _trip = Color(0xFFD9824B);
  static const _fsh = Color(0xFF3F6FB5), _lh = Color(0xFFC9A227), _est = Color(0xFF2F7D5B), _prog = Color(0xFFD9824B);

  @override
  Widget build(BuildContext context) => switch (mode) {
    'embryosac' => _embryoSac(),
    'double' => _double(),
    'testis' => _testis(),
    'gametes' => _gametes(),
    'cycle' => _cycle(),
    'pregnancy' => _pregnancy(),
    'risk' => _risk(),
    'sti' => _sti(),
    _ => _pollen(),
  };

  void _nucleusCell(Canvas c, Offset at, double r, Color col, String label, {int nuclei = 1}) {
    Bio.soft(c, Bio.blob(at, r, r * 0.92, seed: label.length + nuclei, wobble: 0.05), Bio.lighten(col, 0.7), stroke: 2, edge: col);
    for (var q = 0; q < nuclei; q++) {
      final o = nuclei == 1 ? Offset.zero : Offset(math.cos(q * 2 * math.pi / nuclei), math.sin(q * 2 * math.pi / nuclei)) * r * 0.4;
      c.drawCircle(at + o, r * (nuclei == 1 ? 0.36 : 0.18), Paint()..color = col);
    }
    IxPaint.label(c, label, at + Offset(0, r + 20), size: 16, color: Bio.darken(col, 0.25), w: FontWeight.w600);
  }

  // ── Pollen ────────────────────────────────────────────────────────────────────────
  Widget _pollen() {
    final pmc = n('pmc'), st = n('stamens'), chr = i('chr');
    return frame(
      title: 'Microsporogenesis: counting pollen',
      subtitle: _sub1,
      formula: '1 PMC (2n) → meiosis → tetrad → 4 pollen (n)',
      readouts: [
        Readout('Pollen per anther', grp(16 * pmc), '4 sporangia × 4 × PMC', _hap),
        Readout('Pollen per flower', grp(16 * pmc * st), '', IX.accent),
        Readout('Chromosomes per pollen', '${chr ~/ 2}', 'n', _hap),
        Readout('In each PMC', '$chr', '2n', _dip),
      ],
      controls: [
        slider('pmc', 'Pollen mother cells per microsporangium', 10, 200, div: 38),
        slider('stamens', 'Stamens per flower', 1, 10),
        slider('chr', 'Diploid number 2n of the plant', 4, 48, div: 22),
      ],
      painter: BioPainter((c, size) {
        // Anther in transverse section: four microsporangia.
        final ctr = Offset(size.width * 0.25, size.height * 0.40);
        Bio.heading(c, 'A dithecous anther (T.S.)', Offset(40, 24));
        Bio.soft(c, Bio.blob(ctr, 210, 150, seed: 2, wobble: 0.03, n: 16), const Color(0xFFF1E3B5), stroke: 2.5);
        c.drawCircle(ctr, 26, Paint()..color = const Color(0xFF9DBB63));
        IxPaint.label(c, 'connective', ctr + const Offset(0, 44), size: 15, color: IX.inkSoft);
        for (final o in [const Offset(-110, -70), const Offset(110, -70), const Offset(-110, 70), const Offset(110, 70)]) {
          final sp = ctr + o;
          Bio.soft(c, Bio.blob(sp, 72, 58, seed: o.dx.toInt().abs(), wobble: 0.04), const Color(0xFFE9C46A), stroke: 2, edge: const Color(0xFFB7862A));
          c.drawOval(Rect.fromCenter(center: sp, width: 108, height: 84), Paint()..color = const Color(0xFFD39A3A)..style = PaintingStyle.stroke..strokeWidth = 5);
          final rnd = math.Random(o.dx.toInt() + o.dy.toInt() * 3);
          for (var q = 0; q < 9; q++) {
            c.drawCircle(sp + Offset((rnd.nextDouble() - 0.5) * 70, (rnd.nextDouble() - 0.5) * 50), 7, Paint()..color = _dip.withValues(alpha: 0.75));
          }
        }
        Bio.leader(c, ctr + const Offset(110, -70), Offset(ctr.dx + 260, ctr.dy - 140), 'microsporangium with PMCs');
        Bio.leader(c, ctr + const Offset(160, 70), Offset(ctr.dx + 260, ctr.dy + 140), 'tapetum (nourishes)');
        // Meiosis flow.
        final y = size.height * 0.78;
        final xs = [size.width * 0.12, size.width * 0.36, size.width * 0.60, size.width * 0.84];
        _nucleusCell(c, Offset(xs[0], y), 42, _dip, 'PMC (2n = $chr)');
        IxPaint.arrow(c, Offset(xs[0] + 60, y), Offset(xs[1] - 70, y), IX.inkSoft);
        IxPaint.label(c, 'meiosis', Offset((xs[0] + xs[1]) / 2, y - 22), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        for (final o in [const Offset(-22, -22), const Offset(22, -22), const Offset(-22, 22), const Offset(22, 22)]) {
          c.drawCircle(Offset(xs[1], y) + o, 22, Paint()..color = Bio.lighten(_hap, 0.6));
          c.drawCircle(Offset(xs[1], y) + o, 22, Paint()..color = _hap..style = PaintingStyle.stroke..strokeWidth = 2);
          c.drawCircle(Offset(xs[1], y) + o, 8, Paint()..color = _hap);
        }
        IxPaint.label(c, 'tetrad', Offset(xs[1], y + 68), size: 16, color: _hap, w: FontWeight.w600);
        IxPaint.arrow(c, Offset(xs[1] + 60, y), Offset(xs[2] - 60, y), IX.inkSoft);
        for (var q = 0; q < 4; q++) {
          final p = Offset(xs[2] - 45 + q * 30, y + (q.isEven ? -10 : 10));
          c.drawCircle(p, 14, Paint()..color = const Color(0xFFE0A030));
          c.drawCircle(p, 14, Paint()..color = const Color(0xFF9A6A10)..style = PaintingStyle.stroke..strokeWidth = 2);
        }
        IxPaint.label(c, '4 pollen grains (n = ${chr ~/ 2})', Offset(xs[2], y + 68), size: 16, color: const Color(0xFF9A6A10), w: FontWeight.w600);
        Bio.note(c, '× 4 microsporangia × ${f0(pmc)} PMC × ${f0(st)} stamens = ${grp(16 * pmc * st)}', Offset(xs[3], y), align: Alignment.center, maxWidth: size.width * 0.2, size: 17, color: IX.ink, w: FontWeight.w600);
        Bio.note(c, 'Each pollen grain has a hard exine of sporopollenin with germ pores, and holds a vegetative cell and a generative cell when shed.', Offset(size.width * 0.56, 60), maxWidth: size.width * 0.4, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Embryo sac ────────────────────────────────────────────────────────────────────
  Widget _embryoSac() {
    final m = n('mmc'), chr = i('chr');
    return frame(
      title: 'Megasporogenesis and the embryo sac',
      subtitle: _sub1,
      formula: 'MMC (2n) → 4 megaspores → 1 functional → 8 nuclei, 7 cells',
      readouts: [
        Readout('Megaspores that degenerate', f0(3 * m), '', IX.muted),
        Readout('Embryo sacs', f0(m), 'one per MMC', IX.accent),
        Readout('Nuclei in all sacs', f0(8 * m), '', _hap),
        Readout('Each nucleus', '${chr ~/ 2}', 'chromosomes (n)', _hap),
      ],
      controls: [slider('mmc', 'Megaspore mother cells', 1, 20), slider('chr', 'Diploid number 2n of the plant', 4, 48, div: 22)],
      painter: BioPainter((c, size) {
        // Mature embryo sac drawn large.
        final ctr = Offset(size.width * 0.62, size.height * 0.47);
        final sac = Bio.smooth([ctr + const Offset(0, -300), ctr + const Offset(120, -200), ctr + const Offset(150, 40), ctr + const Offset(110, 260), ctr + const Offset(0, 320), ctr + const Offset(-110, 260), ctr + const Offset(-150, 40), ctr + const Offset(-120, -200)]);
        Bio.soft(c, sac, const Color(0xFFFBEFE3), stroke: 2.5, edge: BioC.membrane);
        void cell(Offset at, double r, Color col) {
          Bio.soft(c, Bio.blob(at, r, r * 1.15, seed: at.dx.toInt() % 7), Bio.lighten(col, 0.65), stroke: 1.8, edge: col, shadow: false);
          c.drawCircle(at, r * 0.32, Paint()..color = col);
        }
        // Micropylar end at bottom: egg apparatus.
        cell(ctr + const Offset(0, 200), 42, const Color(0xFFC0507A));
        cell(ctr + const Offset(-62, 250), 34, const Color(0xFF8C6BB1));
        cell(ctr + const Offset(62, 250), 34, const Color(0xFF8C6BB1));
        for (final o in [const Offset(-50, -240), const Offset(50, -240), const Offset(0, -190)]) {
          cell(ctr + o, 32, IX.muted);
        }
        c.drawCircle(ctr + const Offset(-14, 10), 18, Paint()..color = _trip);
        c.drawCircle(ctr + const Offset(16, 10), 18, Paint()..color = _trip);
        Bio.leader(c, ctr + const Offset(-50, -240), Offset(ctr.dx - 180, ctr.dy - 300), '3 antipodals (chalazal end)');
        Bio.leader(c, ctr + const Offset(16, 10), Offset(ctr.dx + 260, ctr.dy + 10), 'central cell: 2 polar nuclei');
        Bio.leader(c, ctr + const Offset(0, 200), Offset(ctr.dx + 260, ctr.dy + 190), 'egg cell', active: true);
        Bio.leader(c, ctr + const Offset(-62, 250), Offset(ctr.dx - 180, ctr.dy + 300), '2 synergids');
        IxPaint.label(c, 'micropylar end', ctr + const Offset(0, 350), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        // Development steps column.
        const steps = ['MMC (2n) in the nucellus', 'Meiosis → 4 megaspores (n)', '3 degenerate, 1 functional', '3 free-nuclear mitoses → 8 nuclei', 'Walls form: 7 cells, 8 nuclei'];
        for (var q = 0; q < steps.length; q++) {
          final r = Rect.fromLTWH(40, 40 + q * 120.0, size.width * 0.28, 90);
          Bio.box(c, r, steps[q], color: q == 4 ? IX.accent : _dip, size: 18, filled: q == 4);
          if (q < steps.length - 1) IxPaint.arrow(c, Offset(r.center.dx, r.bottom + 2), Offset(r.center.dx, r.bottom + 28), IX.inkSoft);
        }
        Bio.note(c, 'Monosporic development (Polygonum type).', Offset(40, 650), size: 16, color: IX.inkSoft);
      }),
    );
  }

  // ── Double fertilisation ──────────────────────────────────────────────────────────
  Widget _double() {
    final h = i('n');
    final items = [
      ('Male gamete 1 + egg', 'Zygote → embryo', '${2 * h}', '2n', _dip),
      ('Male gamete 2 + 2 polar nuclei', 'PEN → endosperm', '${3 * h}', '3n', _trip),
      ('Nucellus, integuments', 'Seed coat, perisperm', '${2 * h}', '2n', IX.muted),
      ('Synergids, antipodals', 'Degenerate', '$h', 'n', _hap),
    ];
    return frame(
      title: 'Double fertilisation',
      subtitle: _sub1,
      formula: 'syngamy + triple fusion',
      readouts: [
        Readout('Zygote', '${2 * h}', 'chromosomes (2n)', _dip),
        Readout('Primary endosperm nucleus', '${3 * h}', '3n', _trip),
        Readout('Seed coat (mother)', '${2 * h}', '2n'),
        Readout('Gametes, synergids', '$h', 'n', _hap),
      ],
      controls: [slider('n', 'Haploid number n', 2, 30)],
      painter: BioPainter((c, size) {
        // Pollen tube entering the sac.
        final sac = Rect.fromLTWH(60, 60, size.width * 0.36, size.height - 140);
        Bio.soft(c, Bio.blob(sac.center, sac.width / 2, sac.height / 2, seed: 4, wobble: 0.04, n: 14), const Color(0xFFFBEFE3), stroke: 2.5, edge: BioC.membrane);
        final egg = Offset(sac.center.dx, sac.bottom - 140), pol = sac.center;
        final tube = Path()..moveTo(sac.center.dx - 40, sac.bottom + 70)..cubicTo(sac.center.dx - 40, sac.bottom - 20, sac.center.dx - 70, sac.bottom - 70, sac.center.dx - 60, sac.bottom - 100);
        Bio.stroke(c, tube, const Color(0xFFE0A030), 14);
        c.drawCircle(egg, 34, Paint()..color = Bio.lighten(const Color(0xFFC0507A), 0.6));
        c.drawCircle(egg, 13, Paint()..color = const Color(0xFFC0507A));
        c.drawCircle(pol + const Offset(-16, 0), 15, Paint()..color = _trip);
        c.drawCircle(pol + const Offset(16, 0), 15, Paint()..color = _trip);
        final g1 = egg + const Offset(-60, 30), g2 = pol + const Offset(-90, 40);
        c.drawCircle(g1, 9, Paint()..color = _fsh);
        c.drawCircle(g2, 9, Paint()..color = _fsh);
        Bio.curvedArrow(c, g1, egg + const Offset(-36, 4), _fsh, bend: -20, width: 2.5);
        Bio.curvedArrow(c, g2, pol + const Offset(-34, 4), _fsh, bend: 20, width: 2.5);
        IxPaint.label(c, 'syngamy', egg + const Offset(70, 0), size: 17, color: _dip, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'triple fusion', pol + const Offset(40, -30), size: 17, color: _trip, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'pollen tube', Offset(sac.center.dx + 10, sac.bottom + 50), size: 16, color: const Color(0xFF9A6A10), w: FontWeight.w600, align: Alignment.centerLeft);
        // Table.
        final tx = size.width * 0.46;
        final rowH = (size.height - 160) / 5;
        for (var q = 0; q < 5; q++) {
          final y = 60 + q * rowH;
          if (q == 0) {
            for (final (x, t) in [(0.0, 'Fusion / tissue'), (0.48, 'Becomes'), (0.82, 'Chromosomes')]) {
              IxPaint.label(c, t, Offset(tx + (size.width - tx - 30) * x, y + rowH / 2), size: 17, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
            }
            continue;
          }
          final (a, b2, cnt, pl, col) = items[q - 1];
          Bio.card(c, Rect.fromLTWH(tx - 12, y + 4, size.width - tx - 18, rowH - 8), edge: col.withValues(alpha: 0.5));
          final w = size.width - tx - 30;
          Bio.note(c, a, Offset(tx, y + rowH / 2), align: Alignment.centerLeft, maxWidth: w * 0.45, size: 18, color: IX.ink);
          Bio.note(c, b2, Offset(tx + w * 0.48, y + rowH / 2), align: Alignment.centerLeft, maxWidth: w * 0.32, size: 18, color: IX.ink, w: FontWeight.w600);
          IxPaint.label(c, '$cnt  ($pl)', Offset(tx + w * 0.82, y + rowH / 2), size: 24, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
        }
      }),
    );
  }

  // ── Testis temperature ────────────────────────────────────────────────────────────
  Widget _testis() {
    final tb = n('Tb');
    final tt = tb - 2.2;
    double prod(double t) => 100 * math.exp(-0.25 * math.pow(math.max(0, t - 35), 2)).toDouble();
    final inside = prod(tb);
    return frame(
      title: 'Why the testes hang outside',
      subtitle: _sub2,
      formula: 'testis ≈ body − 2 to 2.5 °C',
      readouts: [
        Readout('Body', f1(tb), '°C', IX.positive),
        Readout('Testis in scrotum', f1(tt), '°C', _fsh),
        Readout('Sperm output (scrotal)', f0(prod(tt)), '% of normal', IX.green),
        Readout('If undescended', f0(inside), '% of normal', IX.positive),
      ],
      controls: [slider('Tb', 'Body temperature', 36.5, 40, unit: '°C', dp: 1, div: 35)],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.62, size.height - 120), 33, 40, 0, 110);
        plot.frame(c, xs: [33, 34, 35, 36, 37, 38, 39, 40], ys: [0, 50, 100], xLabel: 'Temperature of the testis (°C)', yLabel: 'Sperm production (% of normal)', title: 'Spermatogenesis needs a cooler testis');
        plot.curve(c, prod, IX.green, w: 4.5);
        plot.dot(c, tt, prod(tt), _fsh, label: 'in scrotum', align: Alignment.centerRight);
        plot.dot(c, tb, inside, IX.positive, label: 'in abdomen', align: Alignment.centerLeft);
        final x = size.width * 0.68;
        // Scrotum sketch with thermometer colours.
        final sc = Offset(x + 180, 260);
        Bio.soft(c, Bio.blob(sc, 120, 130, seed: 3, wobble: 0.05), const Color(0xFFF2C9B8), stroke: 2);
        for (final sd in [-1.0, 1.0]) {
          Bio.soft(c, Bio.blob(sc + Offset(sd * 52, 10), 40, 60, seed: 5), Color.lerp(_fsh, IX.positive, ((tt - 33) / 7).clamp(0, 1))!.withValues(alpha: 0.8), stroke: 1.6);
        }
        IxPaint.label(c, '${f1(tt)} °C', sc + const Offset(0, 160), size: 20, color: _fsh, w: FontWeight.w700);
        Bio.note(c, 'Sperm are made in the seminiferous tubules (about 250 lobules, 1–3 tubules each). The scrotum holds the testes 2–2.5 °C below body temperature. Undescended testes (cryptorchidism) or fever can cut sperm output and cause infertility.', Offset(x, 460), maxWidth: size.width - x - 30, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Gametogenesis ─────────────────────────────────────────────────────────────────
  Widget _gametes() {
    final sp = n('sp'), oo = n('oo');
    return frame(
      title: 'Spermatogenesis and oogenesis',
      subtitle: _sub2,
      formula: '1 primary spermatocyte → 4 sperm;  1 primary oocyte → 1 ovum',
      readouts: [
        Readout('Secondary spermatocytes', f0(2 * sp), '', BioC.male),
        Readout('Sperm', f0(4 * sp), '23 chromosomes each', BioC.male),
        Readout('Ova', f0(oo), '', BioC.female),
        Readout('Polar bodies', f0(2 * oo), '(1st + 2nd)', IX.muted),
      ],
      controls: [slider('sp', 'Primary spermatocytes', 1, 100), slider('oo', 'Primary oocytes', 1, 100)],
      painter: BioPainter((c, size) {
        for (final (male, x0) in [(true, 40.0), (false, size.width / 2 + 20)]) {
          final col = male ? BioC.male : BioC.female;
          final w = size.width / 2 - 60;
          Bio.heading(c, male ? 'Spermatogenesis (testis, from puberty)' : 'Oogenesis (ovary, begins before birth)', Offset(x0, 24), color: col);
          final cx = x0 + w / 2;
          final rows = male
              ? [('Spermatogonium (2n = 46)', 1), ('Primary spermatocyte (2n)', 1), ('Secondary spermatocytes (n)', 2), ('Spermatids (n)', 4), ('Spermatozoa (n = 23)', 4)]
              : [('Oogonium (2n = 46)', 1), ('Primary oocyte (2n)', 1), ('Secondary oocyte (n) + 1st polar body', 2), ('Ovum (n) + 2nd polar body', 2), ('Ovum: 1 per primary oocyte', 1)];
          for (var q = 0; q < rows.length; q++) {
            final y = 110 + q * (size.height - 180) / rows.length;
            final (lab, k) = rows[q];
            for (var j = 0; j < k; j++) {
              final dx = (j - (k - 1) / 2) * 70;
              final small = !male && j == 1;
              final r = small ? 12.0 : (male && q >= 3 ? 16.0 : 26.0);
              final at = Offset(cx + dx, y);
              if (male && q == 4) {
                c.drawOval(Rect.fromCenter(center: at, width: 22, height: 30), Paint()..color = col);
                c.drawPath(Path()..moveTo(at.dx, at.dy + 15)..quadraticBezierTo(at.dx + 14, at.dy + 40, at.dx - 4, at.dy + 60), Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = 2.5);
              } else {
                Bio.soft(c, Path()..addOval(Rect.fromCircle(center: at, radius: r)), Bio.lighten(col, small ? 0.75 : 0.55), stroke: 1.6, edge: col, shadow: false);
                c.drawCircle(at, r * 0.35, Paint()..color = col);
              }
            }
            IxPaint.label(c, lab, Offset(cx, y + (male && q == 4 ? 76 : 46)), size: 16, color: IX.ink, w: FontWeight.w600);
            if (q < rows.length - 1) IxPaint.arrow(c, Offset(cx, y + 60), Offset(cx, y + (size.height - 180) / rows.length - 32), IX.inkSoft, width: 2, head: 10);
          }
        }
        c.drawLine(Offset(size.width / 2, 70), Offset(size.width / 2, size.height - 40), Paint()..color = IX.rule..strokeWidth = 2);
      }),
    );
  }

  // ── Menstrual cycle ───────────────────────────────────────────────────────────────
  static double _g(double x, double mu, double sd) => math.exp(-math.pow((x - mu) / sd, 2) / 2);

  Widget _cycle() {
    final len = n('L'), day = n('day').clamp(1, len).toDouble();
    final ov = len - 14;
    double lh(double t) => 8 + 92 * _g(t, ov, 0.9);
    double fsh(double t) => 18 + 22 * _g(t, 3, 3) + 20 * _g(t, ov, 1.0);
    double est(double t) => 15 + 70 * _g(t, ov - 1.5, 2.6) + 30 * _g(t, ov + 7, 3);
    double prog(double t) => 5 + 85 * _g(t, ov + 7, 3.2);
    double endo(double t) => t <= 5 ? 1.5 - t * 0.2 : (t <= ov ? 0.5 + (t - 5) / (ov - 5) * 3 : 3.5 + 1.5 * _g(t, ov + 7, 4) - (t > len - 2 ? (t - len + 2) * 1.5 : 0));
    final phase = day <= 5 ? 'Menstrual' : (day < ov ? 'Follicular (proliferative)' : (day < ov + 1 ? 'Ovulation' : 'Luteal (secretory)'));
    final follicle = day < ov ? (day < 5 ? 'Primary follicle' : (day < ov - 4 ? 'Secondary / tertiary follicle' : 'Graafian follicle')) : (day < ov + 1 ? 'Ovum released' : 'Corpus luteum');
    return frame(
      title: 'The menstrual cycle',
      subtitle: _sub2,
      formula: 'ovulation ≈ 14 days before the next period',
      readouts: [
        Readout('Day', '${day.round()} of ${len.round()}', '', IX.accent),
        Readout('Phase', phase, '', IX.ink),
        Readout('Ovary', follicle, '', _prog),
        Readout('Ovulation day', f0(ov), 'LH surge', _lh),
      ],
      controls: [
        slider('L', 'Cycle length', 24, 35, unit: 'days'),
        slider('day', 'Day of the cycle', 1, len, unit: '', div: (len - 1).round()),
      ],
      painter: BioPainter((c, size) {
        // Follicle strip.
        final fy = 60.0;
        Bio.heading(c, 'Ovarian events', Offset(120, 18), size: 19);
        for (var q = 0; q < 7; q++) {
          final t = 1 + (len - 1) * q / 6;
          final x = 120 + (size.width - 180) * (t - 1) / (len - 1);
          final double r = t < ov ? 10 + 30 * (t / ov) : (t < ov + 2 ? 26.0 : 30 - 10 * (t - ov) / 14);
          final col = t < ov ? const Color(0xFFE9C46A) : (t < ov + 2 ? IX.positive : const Color(0xFFE0A030));
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(x, fy + 40), radius: r)), Bio.lighten(col, 0.4), stroke: 1.6, edge: col, shadow: false);
          if (t < ov) c.drawCircle(Offset(x - r * 0.3, fy + 40), r * 0.28, Paint()..color = const Color(0xFFC0507A));
        }
        final plot = Plot(Rect.fromLTRB(120, 170, size.width - 60, size.height * 0.70), 1, len, 0, 110);
        plot.frame(c, xs: [1, 5, ov, len], ys: [0, 50, 100], xLabel: 'Day of the cycle', yLabel: 'Hormone level (relative)');
        c.drawRect(Rect.fromPoints(plot.pt(1, 110), plot.pt(5, 0)), Paint()..color = IX.positive.withValues(alpha: 0.07));
        plot.curve(c, fsh, _fsh, w: 3, label: 'FSH', labelX: 3);
        plot.curve(c, lh, _lh, w: 3.5, label: 'LH surge', labelX: ov);
        plot.curve(c, est, _est, w: 3.5, label: 'estrogen', labelX: ov - 4);
        plot.curve(c, prog, _prog, w: 3.5, label: 'progesterone', labelX: ov + 8);
        plot.vline(c, day, IX.accent, w: 3);
        // Endometrium.
        final ey = size.height * 0.70 + 70;
        final eh = size.height - ey - 20;
        Bio.heading(c, 'Endometrium', Offset(120, ey - 30), size: 19);
        final top = Path()..moveTo(plot.r.left, ey + eh);
        for (var q = 0; q <= 120; q++) {
          final t = 1 + (len - 1) * q / 120;
          top.lineTo(plot.pt(t, 0).dx, ey + eh - eh * endo(t) / 5.2);
        }
        top..lineTo(plot.r.right, ey + eh)..close();
        Bio.soft(c, top, const Color(0xFFD98C8C), stroke: 1.5, shadow: false, light: 0.3);
        final dx = plot.pt(day, 0).dx;
        c.drawLine(Offset(dx, ey - 6), Offset(dx, ey + eh), Paint()..color = IX.accent..strokeWidth = 3);
        IxPaint.label(c, 'menses', Offset(plot.pt(3, 0).dx, ey + eh - 14), size: 15, color: Colors.white, w: FontWeight.w700);
      }),
    );
  }

  // ── Pregnancy ─────────────────────────────────────────────────────────────────────
  Widget _pregnancy() {
    final k = i('cleave'), w = i('week');
    final cells = 1 << k;
    final tri = ((w - 1) ~/ 13) + 1;
    const marks = {5: 'Heart forms (1st month)', 8: 'Limbs and digits (2nd month)', 12: 'Most organ systems formed', 20: 'First movements; hair on head (5th month)', 24: 'Eyelids separate; eyelashes (6th month)', 38: 'Fully developed: parturition'};
    final reached = marks.entries.where((e) => e.key <= w).lastOrNull;
    return frame(
      title: 'Cleavage and the weeks of pregnancy',
      subtitle: _sub2,
      formula: 'cells = 2ⁿ;  pregnancy ≈ 9 months (38 weeks)',
      readouts: [
        Readout('Blastomeres', '$cells', k >= 3 && k < 5 ? (k == 3 ? '8-celled' : 'morula (16)') : '', IX.accent),
        Readout('Week', '$w', '≈ ${f1(w * 7 / 30.44)} months', IX.green),
        Readout('Trimester', '$tri', '', _prog),
        Readout('Milestone', reached?.value.split(' (').first ?? 'Implantation', ''),
      ],
      controls: [slider('cleave', 'Cleavage divisions', 0, 6), slider('week', 'Week of pregnancy', 1, 39)],
      painter: BioPainter((c, size) {
        // Cleaving embryo.
        final ctr = Offset(size.width * 0.22, size.height * 0.36);
        const zr = 130.0;
        c.drawCircle(ctr, zr + 14, Paint()..color = const Color(0xFFEDE3F4));
        c.drawCircle(ctr, zr + 14, Paint()..color = const Color(0xFFB7A3CF)..style = PaintingStyle.stroke..strokeWidth = 3);
        IxPaint.label(c, 'zona pellucida', ctr + const Offset(0, -zr - 30), size: 15, color: IX.inkSoft);
        final shown = math.min(cells, 64);
        final cr = zr / math.sqrt(shown) * 0.95;
        final rnd = math.Random(1);
        for (var q = 0; q < shown; q++) {
          final a = q * 2.399963, rr = shown == 1 ? 0.0 : math.sqrt((q + 0.5) / shown) * (zr - cr);
          final at = ctr + Offset(math.cos(a), math.sin(a)) * rr + Offset(rnd.nextDouble() * 2, rnd.nextDouble() * 2);
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: at, radius: cr)), const Color(0xFFF6DCE6), stroke: 1.2, edge: const Color(0xFFC0507A), shadow: false);
          c.drawCircle(at, cr * 0.3, Paint()..color = const Color(0xFFC0507A).withValues(alpha: 0.6));
        }
        IxPaint.label(c, '$cells cell${cells == 1 ? '' : 's'}${k == 0 ? ' (zygote)' : ''}', ctr + const Offset(0, zr + 40), size: 19, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, 'Mitotic cleavage begins in the isthmus of the oviduct. Up to 8 blastomeres an embryo can be transferred into the fallopian tube (ZIFT); with more, into the uterus (IUT). The morula becomes a blastocyst that implants in the endometrium.', Offset(40, ctr.dy + zr + 80), maxWidth: size.width * 0.40, size: 17, color: IX.ink);
        // Timeline.
        final x0 = size.width * 0.50, x1 = size.width - 50, y = size.height * 0.22;
        Bio.heading(c, 'Weeks of pregnancy', Offset(x0, 40));
        for (var t = 0; t < 3; t++) {
          final a = x0 + (x1 - x0) * t / 3, b2 = x0 + (x1 - x0) * (t + 1) / 3;
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(a + 2, y, b2 - 2, y + 40), const Radius.circular(8)), Paint()..color = (t + 1 == tri ? IX.accent : IX.accentSoft));
          IxPaint.label(c, 'Trimester ${t + 1}', Offset((a + b2) / 2, y + 20), size: 17, color: t + 1 == tri ? Colors.white : IX.accent, w: FontWeight.w700);
        }
        final px = x0 + (x1 - x0) * (w - 0.5) / 39;
        IxPaint.arrow(c, Offset(px, y - 34), Offset(px, y - 4), _prog, width: 3);
        IxPaint.label(c, 'week $w', Offset(px, y - 46), size: 17, color: _prog, w: FontWeight.w700);
        var yy = y + 80;
        for (final e in marks.entries) {
          final on = e.key <= w;
          final mx = x0 + (x1 - x0) * (e.key - 0.5) / 39;
          c.drawCircle(Offset(mx, y + 52), 6, Paint()..color = on ? IX.green : IX.muted);
          IxPaint.label(c, 'Week ${e.key}: ${e.value}', Offset(x0, yy), size: 18, color: on ? IX.ink : IX.muted, w: on ? FontWeight.w600 : FontWeight.w400, align: Alignment.centerLeft);
          yy += 44;
        }
        // Fetus size bar.
        final cm = w < 8 ? w * 0.3 : (w < 20 ? 1.6 + (w - 8) * 1.2 : 16 + (w - 20) * 1.8);
        Bio.note(c, 'Approximate length now: ${f0(cm)} cm. Placenta: hCG, hPL, estrogen, progesterone and relaxin support the pregnancy.', Offset(x0, yy + 20), maxWidth: x1 - x0, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Cumulative risk ───────────────────────────────────────────────────────────────
  Widget _risk() {
    final art = b('art');
    final f = n('f') / 100, yrs = i('years');
    final cum = 1 - math.pow(1 - f, yrs).toDouble();
    return frame(
      title: art ? 'Repeated ART cycles' : 'Small yearly risks add up',
      subtitle: _sub3,
      formula: 'chance of at least one = 1 − (1 − p)ⁿ',
      readouts: [
        Readout(art ? 'Success per cycle' : 'Failure per year', f1(f * 100), '%', IX.accent),
        Readout(art ? 'Cycles' : 'Years of use', '$yrs', ''),
        Readout(art ? 'Chance of a pregnancy' : 'Chance of ≥ 1 pregnancy', f1(cum * 100), '%', art ? IX.green : IX.positive),
        Readout(art ? 'Still trying' : 'No failure at all', f1(100 - cum * 100), '%'),
      ],
      controls: [
        slider('f', art ? 'Success chance per cycle (assumed)' : 'Yearly failure rate', art ? 10 : 0.5, art ? 50 : 30, unit: '%', dp: art ? 0 : 1, div: art ? 40 : 59),
        slider('years', art ? 'Treatment cycles' : 'Years of use', 1, 10),
      ],
      painter: BioPainter((c, size) {
        final top = math.min(100.0, math.max(10.0, (120 * (1 - math.pow(1 - f, 10)) / 10).ceil() * 10.0));
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.58, size.height - 120), -0.5, 10.5, 0, top);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10], ys: [0, top / 2, top], xLabel: art ? 'Cycles' : 'Years', yLabel: '${art ? 'Success' : 'At least one pregnancy'} (%)', title: 'Cumulative chance');
        plot.bars(c, [for (var q = 0; q <= 10; q++) q == 0 ? 0.0 : 100 * (1 - math.pow(1 - f, q).toDouble())], [for (var q = 0; q <= 10; q++) q == yrs ? (art ? IX.green : IX.positive) : IX.accentSoft], width: 0.6);
        if (!art) plot.curve(c, (x) => 100 * (1 - math.pow(1 - 0.01, x).toDouble()), IX.green, w: 3, dashed: true, label: 'reliable method, 1%/yr', labelX: 6);
        final x = size.width * 0.64;
        // 100 couples icon grid.
        Bio.heading(c, art ? '100 couples after $yrs cycles' : '100 couples after $yrs years', Offset(x, 60));
        final hit = (cum * 100).round();
        for (var q = 0; q < 100; q++) {
          final at = Offset(x + 20 + (q % 10) * 42.0, 120 + (q ~/ 10) * 42.0);
          c.drawCircle(at, 15, Paint()..color = q < hit ? (art ? IX.green : IX.positive) : IX.grid);
        }
        Bio.note(c, art
            ? 'ART: IVF with embryo transfer (ZIFT up to 8 blastomeres, IUT for more), GIFT, ICSI, AI/IUI. Each cycle is costly and success is modest, so couples often need several.'
            : 'Condoms, pills, IUDs (Copper T), and surgical methods differ greatly in yearly failure. Over many years even a small yearly rate becomes a large risk.', Offset(x, 560), maxWidth: size.width - x - 30, size: 17, color: IX.ink);
      }),
    );
  }

  // ── STI spread ────────────────────────────────────────────────────────────────────
  Widget _sti() {
    final be = n('be'), cu = n('cu') / 100;
    // SIS model: dI/dt = βSI − γI, months. β = contacts × 0.3 chance × condom protection.
    const pTrans = 0.3, cure = 0.1;
    final beta = be * pTrans * (1 - 0.9 * cu);
    final r0 = beta / cure;
    List<double> run() {
      var inf = 0.01;
      final out = [inf];
      for (var m = 0; m < 60; m++) {
        for (var k = 0; k < 10; k++) {
          inf = (inf + 0.1 * (beta * (1 - inf) * inf - cure * inf)).clamp(0, 1).toDouble();
        }
        out.add(inf);
      }
      return out;
    }
    final traj = run();
    return frame(
      title: 'How an STI spreads, and how to stop it',
      subtitle: _sub3,
      formula: 'R₀ > 1 → spreads;  R₀ < 1 → dies out',
      readouts: [
        Readout('R₀', f2(r0), 'new cases per case', r0 > 1 ? IX.positive : IX.green),
        Readout('Infected after 5 years', f0(traj.last * 100), '%', IX.positive),
        Readout('Condom use', f0(cu * 100), '%', IX.green),
        Readout('Outcome', r0 > 1 ? 'Spreads' : 'Dies out', '', r0 > 1 ? IX.positive : IX.green),
      ],
      controls: [
        slider('be', 'Unprotected contacts', 0.1, 1, unit: '/month', dp: 2, div: 18),
        slider('cu', 'Condom use', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.60, size.height - 120), 0, 60, 0, 100);
        if (r0 > 1) plot.hline(c, 100 * (1 - 1 / r0), IX.muted, label: 'settles at 1 − 1/R₀');
        plot.frame(c, xs: [0, 12, 24, 36, 48, 60], ys: [0, 25, 50, 75, 100], xLabel: 'Months', yLabel: 'Infected (%)', title: 'Share of the group infected');
        final p = Path();
        for (var m = 0; m <= 60; m++) {
          final o = plot.pt(m.toDouble(), traj[m] * 100);
          m == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
        }
        Bio.stroke(c, p, IX.positive, 4.5);
        // Contact network.
        final x = size.width * 0.66, cx = (x + size.width - 30) / 2, cy = 300.0;
        final rnd = math.Random(6);
        final pts = [for (var q = 0; q < 30; q++) Offset(cx + math.cos(q * 2.4) * (40 + q * 6.0), cy + math.sin(q * 2.4) * (40 + q * 6.0))];
        for (var q = 0; q < 30; q++) {
          for (var j = q + 1; j < 30; j++) {
            if ((pts[q] - pts[j]).distance < 90 && rnd.nextDouble() < be) c.drawLine(pts[q], pts[j], Paint()..color = IX.rule..strokeWidth = 2);
          }
        }
        final infN = (traj.last * 30).round();
        for (var q = 0; q < 30; q++) {
          c.drawCircle(pts[q], 13, Paint()..color = q < infN ? IX.positive : IX.green.withValues(alpha: 0.7));
        }
        Bio.note(c, 'Gonorrhoea, syphilis, genital herpes, chlamydiasis, trichomoniasis, hepatitis B and HIV. Prevention: avoid unknown or multiple partners, always use condoms, consult a doctor early. Early detection and full treatment shorten infection and cut R₀.', Offset(x, 560), maxWidth: size.width - x - 30, size: 17, color: IX.ink);
      }),
    );
  }
}
