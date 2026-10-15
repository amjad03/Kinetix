import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Test tubes of everyday substances and a shelf of indicators. Papers
/// (litmus, turmeric) get a drop of the sample; liquids go into the tube.
class IndicatorsBench extends LabBench {
  const IndicatorsBench();

  /// pH and the sample's own colour.
  static const samples = {
    'lemon': (2.4, Color(0x33F2E27A)),
    'vinegar': (2.9, Color(0x22E8E0C8)),
    'hcl': (1.0, Color(0x11FFFFFF)),
    'naoh': (13.0, Color(0x11FFFFFF)),
    'soap': (10.0, Color(0x55F4F1EA)),
    'soda': (8.3, Color(0x22FFFFFF)),
    'lime': (12.4, Color(0x33EEF2F2)),
    'water': (7.0, Color(0x11FFFFFF)),
    'salt': (7.0, Color(0x11FFFFFF)),
    'sugar': (7.0, Color(0x11FFFFFF)),
  };

  static const indicators = ['blue-litmus', 'red-litmus', 'turmeric', 'china-rose', 'phenolphthalein', 'methyl-orange', 'universal'];

  static bool isPaper(String ind) => ind == 'blue-litmus' || ind == 'red-litmus' || ind == 'turmeric';

  @override
  String get kind => 'indicators';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'sample': 'lemon', 'indicator': 'blue-litmus', 'added': false};

  @override
  LabParams get preview => {'sample': 'soap', 'indicator': 'universal', 'added': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Sample'), [for (final s in samples.keys) (s, sampleName(s))]),
        LabChoice('indicator', tr('Indicator'), [for (final i in indicators) (i, indicatorName(i))]),
        LabAction('add', isPaper(pStr(p, 'indicator')) ? tr('Put a drop on the paper') : tr('Add the indicator'), Icons.water_drop_outlined, primary: true),
      ];

  @override
  LabParams act(String action, LabParams p) {
    if (action == 'add') return {...p, 'added': true};
    // A new sample or indicator starts clean.
    if (action == 'set:sample' || action == 'set:indicator') return {...p, 'added': false};
    return p;
  }

  static String sampleName(String id) => switch (id) {
        'lemon' => tr('Lemon juice'),
        'vinegar' => tr('Vinegar'),
        'hcl' => tr('Dilute hydrochloric acid'),
        'naoh' => tr('Dilute sodium hydroxide'),
        'soap' => tr('Soap solution'),
        'soda' => tr('Baking soda solution'),
        'lime' => tr('Lime water'),
        'water' => tr('Distilled water'),
        'salt' => tr('Salt solution'),
        _ => tr('Sugar solution'),
      };

  static String indicatorName(String id) => switch (id) {
        'blue-litmus' => tr('Blue litmus paper'),
        'red-litmus' => tr('Red litmus paper'),
        'turmeric' => tr('Turmeric paper'),
        'china-rose' => tr('China rose indicator'),
        'phenolphthalein' => tr('Phenolphthalein'),
        'methyl-orange' => tr('Methyl orange'),
        _ => tr('Universal indicator'),
      };

  /// The colour an indicator shows at this pH, and its name.
  static (Color, String) colourFor(String ind, double ph) => switch (ind) {
        'blue-litmus' => ph < 6 ? (const Color(0xFFD9435A), tr('Red')) : (const Color(0xFF5B7FD6), tr('Stays blue')),
        'red-litmus' => ph >= 8 ? (const Color(0xFF5B7FD6), tr('Blue')) : (const Color(0xFFD9435A), tr('Stays red')),
        'turmeric' => ph >= 8 ? (const Color(0xFFB5452B), tr('Reddish-brown')) : (const Color(0xFFF2C12E), tr('Stays yellow')),
        'china-rose' => ph < 6.5
            ? (const Color(0xFFC2185B), tr('Dark pink (magenta)'))
            : ph > 7.5
                ? (const Color(0xFF3F9E4A), tr('Green'))
                : (const Color(0xFFB77AA8), tr('No change')),
        'phenolphthalein' => ph >= 8.2 ? (ph < 9 ? const Color(0xFFF3A6C8) : const Color(0xFFE0408A), tr('Pink')) : (const Color(0x11FFFFFF), tr('Colourless')),
        'methyl-orange' => ph < 3.1
            ? (const Color(0xFFD9352B), tr('Red'))
            : ph <= 4.4
                ? (const Color(0xFFF08A24), tr('Orange'))
                : (const Color(0xFFF2CF2E), tr('Yellow')),
        _ => (universal(ph), universalName(ph)),
      };

  /// Universal indicator: red through orange, yellow, green, blue to violet.
  static Color universal(double ph) {
    const stops = [
      (0.0, Color(0xFFC81D25)), (2.0, Color(0xFFE63B2E)), (3.0, Color(0xFFF26B21)), (4.0, Color(0xFFF79A1E)), (5.0, Color(0xFFF7C51E)),
      (6.0, Color(0xFFD9D925)), (7.0, Color(0xFF4DB848)), (8.0, Color(0xFF1E9E8C)), (9.0, Color(0xFF2474C9)), (10.0, Color(0xFF3B4FB8)),
      (12.0, Color(0xFF5B3A9E)), (14.0, Color(0xFF4A1E6E)),
    ];
    for (var k = 0; k < stops.length - 1; k++) {
      final (a, ca) = stops[k];
      final (b, cb) = stops[k + 1];
      if (ph <= b) return Color.lerp(ca, cb, ((ph - a) / (b - a)).clamp(0.0, 1.0))!;
    }
    return stops.last.$2;
  }

  static String universalName(double ph) => ph < 3
      ? tr('Red')
      : ph < 5
          ? tr('Orange')
          : ph < 6.5
              ? tr('Yellow')
              : ph < 7.5
                  ? tr('Green')
                  : ph < 9.5
                      ? tr('Blue')
                      : tr('Violet');

  /// What the class can say from this indicator alone.
  static String nature(String ind, double ph) {
    final acid = ph < 6.5, base = ph > 7.5;
    return switch (ind) {
      'blue-litmus' => ph < 6 ? tr('Acidic') : tr('Neutral or basic'),
      'red-litmus' => ph >= 8 ? tr('Basic') : tr('Acidic or neutral'),
      'turmeric' => ph >= 8 ? tr('Basic') : tr('Acidic or neutral'),
      'phenolphthalein' => ph >= 8.2 ? tr('Basic') : tr('Acidic or neutral'),
      'methyl-orange' => ph <= 4.4 ? tr('Acidic') : tr('Neutral or basic'),
      _ => acid ? tr('Acidic') : (base ? tr('Basic') : tr('Neutral')),
    };
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Sample')),
        LabColumn(tr('Indicator')),
        LabColumn(tr('Colour seen')),
        LabColumn(tr('So the sample is')),
        const LabColumn('pH', 0),
      ];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'added')) return LabReading.not(tr('Add the indicator first.'));
    final s = pStr(p, 'sample', 'lemon'), ind = pStr(p, 'indicator', 'blue-litmus');
    final ph = samples[s]?.$1 ?? 7;
    final (_, colour) = colourFor(ind, ph);
    return LabReading.row([sampleName(s), indicatorName(ind), colour, nature(ind, ph), ind == 'universal' ? ph.round() : '—']);
  }

  @override
  List<String> live(LabParams p) {
    final s = pStr(p, 'sample', 'lemon'), ind = pStr(p, 'indicator', 'blue-litmus');
    if (!pBool(p, 'added')) return [sampleName(s), indicatorName(ind)];
    final ph = samples[s]?.$1 ?? 7;
    return [sampleName(s), colourFor(ind, ph).$2, if (ind == 'universal') 'pH ≈ ${ph.round()}'];
  }

  @override
  String? result(List<List<Object>> rows) {
    final acid = <String>{}, base = <String>{}, neutral = <String>{};
    final ph = <String, int>{};
    for (final r in rows) {
      final name = '${r[0]}', n = '${r[3]}';
      if (n == tr('Acidic')) acid.add(name);
      if (n == tr('Basic')) base.add(name);
      if (n == tr('Neutral')) neutral.add(name);
      if (r[4] is int) ph[name] = r[4] as int;
    }
    if (acid.isEmpty && base.isEmpty && neutral.isEmpty) return null;
    final order = ph.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
    return [
      if (acid.isNotEmpty) tr('Acidic: {list}.', {'list': acid.join(', ')}),
      if (base.isNotEmpty) tr('Basic: {list}.', {'list': base.join(', ')}),
      if (neutral.isNotEmpty) tr('Neutral: {list}.', {'list': neutral.join(', ')}),
      if (order.length > 1) tr('From most acidic to most basic: {list}.', {'list': order.map((e) => '${e.key} (${e.value})').join(', ')}),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'sample', 'lemon'), ind = pStr(p, 'indicator', 'blue-litmus');
    final (ph, own) = samples[s] ?? samples['lemon']!;
    final added = pBool(p, 'added');
    final (colour, name) = colourFor(ind, ph);

    // The test tube with the sample.
    final tube = Rect.fromLTWH(w * 0.2, h * 0.3, w * 0.09, h * 0.5);
    final liquidTop = tube.top + tube.height * 0.4;
    final liquid = !isPaper(ind) && added ? colour : own;
    final body = RRect.fromRectAndCorners(tube, bottomLeft: Radius.circular(tube.width / 2), bottomRight: Radius.circular(tube.width / 2));
    canvas.save();
    canvas.clipRRect(body);
    canvas.drawRect(Rect.fromLTRB(tube.left, liquidTop, tube.right, tube.bottom), fill(liquid.a < 0.1 ? const Color(0x22A9D3EE) : liquid));
    canvas.restore();
    canvas.drawRRect(body, stroke(LabInk.ink, 2.5));
    canvas.drawLine(Offset(tube.left - 6, tube.top), Offset(tube.right + 6, tube.top), stroke(LabInk.ink, 2.5));
    label(canvas, sampleName(s), Offset(tube.center.dx, tube.bottom + 22), size: 14, bold: true);

    // A dropper above the tube or above the paper.
    final paper = isPaper(ind);
    final dropX = paper ? w * 0.62 : tube.center.dx;
    final dropperTip = Offset(dropX, paper ? h * 0.36 : tube.top - 12);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(dropX - 6, dropperTip.dy - 70, 12, 60), const Radius.circular(4)), fill(const Color(0x88FFFFFF)));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(dropX - 6, dropperTip.dy - 70, 12, 60), const Radius.circular(4)), stroke(LabInk.ink, 1.5));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(dropX - 10, dropperTip.dy - 96, 20, 28), const Radius.circular(8)), fill(const Color(0xFFD64541)));
    canvas.drawLine(Offset(dropX, dropperTip.dy - 10), dropperTip, stroke(LabInk.ink, 2));
    if (added) {
      final fall = (t * 1.4) % 1.0;
      final dropColour = paper ? own : (ind == 'universal' ? const Color(0xFF4DB848) : colour);
      canvas.drawCircle(dropperTip + Offset(0, 6 + fall * 40), 4, fill(dropColour.a < 0.1 ? const Color(0x66A9D3EE) : dropColour));
    }

    if (paper) {
      // The paper strip, with the spot where the drop landed.
      final strip = Rect.fromCenter(center: Offset(dropX, h * 0.58), width: w * 0.28, height: h * 0.14);
      final base = switch (ind) { 'blue-litmus' => const Color(0xFF5B7FD6), 'red-litmus' => const Color(0xFFD9435A), _ => const Color(0xFFF2C12E) };
      canvas.drawRect(strip, fill(base));
      canvas.drawRect(strip, stroke(LabInk.ink, 1.5));
      if (added) {
        canvas.drawOval(Rect.fromCenter(center: strip.center, width: strip.height * 1.3, height: strip.height * 0.8), fill(colour));
      }
      label(canvas, indicatorName(ind), Offset(strip.center.dx, strip.bottom + 20), size: 14, bold: true);
    } else {
      label(canvas, indicatorName(ind), Offset(w * 0.62, h * 0.3), size: 15, bold: true);
    }

    if (added) {
      label(canvas, name, Offset(w * 0.62, h * 0.82), size: 20, bold: true, color: colour.a < 0.2 ? LabInk.ink : colour, halo: Colors.white);
    }

    // pH scale along the right edge; the sample's place shows after universal indicator.
    final scale = Rect.fromLTWH(w * 0.88, h * 0.08, math.min(28, w * 0.035), h * 0.8);
    for (var k = 0; k < 14; k++) {
      final r = Rect.fromLTWH(scale.left, scale.top + scale.height * k / 14, scale.width, scale.height / 14);
      canvas.drawRect(r, fill(universal(k + 0.5)));
      label(canvas, '$k', r.centerLeft - const Offset(10, 0), size: 10, color: LabInk.muted);
    }
    label(canvas, '14', scale.bottomLeft - const Offset(12, 0), size: 10, color: LabInk.muted);
    canvas.drawRect(scale, stroke(LabInk.ink, 1.5));
    label(canvas, 'pH', scale.topCenter - const Offset(0, 12), size: 12, bold: true);
    if (added && ind == 'universal') {
      final y = scale.top + scale.height * ph / 14;
      canvas.drawLine(Offset(scale.left - 18, y), Offset(scale.left - 2, y), stroke(LabInk.ink, 3));
      arrowHead(canvas, Offset(scale.left - 2, y), const Offset(1, 0), stroke(LabInk.ink, 2));
    }
  }
}
