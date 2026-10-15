import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// The structure of the atom, Bohr model: a nucleus of protons and neutrons (zoomed in first,
/// then drawn to the model's scale), electrons in the K, L and M shells, an element tile with its
/// particle counts and configuration, and the first 18 elements laid out by period and group.
class AtomPlate extends AnimPainter {
  AtomPlate(super.f);

  static const o = Offset(292, 306);
  static const shellR = [76.0, 132.0, 188.0];
  static const symbols = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'];
  static const names = [
    'Hydrogen|हाइड्रोजन|ಹೈಡ್ರೋಜನ್', 'Helium|हीलियम|ಹೀಲಿಯಂ', 'Lithium|लिथियम|ಲಿಥಿಯಂ', 'Beryllium|बेरिलियम|ಬೆರಿಲಿಯಂ', 'Boron|बोरॉन|ಬೋರಾನ್', 'Carbon|कार्बन|ಇಂಗಾಲ', //
    'Nitrogen|नाइट्रोजन|ಸಾರಜನಕ', 'Oxygen|ऑक्सीजन|ಆಮ್ಲಜನಕ', 'Fluorine|फ्लुओरीन|ಫ್ಲೋರಿನ್', 'Neon|नियॉन|ನಿಯಾನ್', 'Sodium|सोडियम|ಸೋಡಿಯಂ', 'Magnesium|मैग्नीशियम|ಮೆಗ್ನೀಸಿಯಂ', //
    'Aluminium|ऐलुमिनियम|ಅಲ್ಯೂಮಿನಿಯಂ', 'Silicon|सिलिकॉन|ಸಿಲಿಕಾನ್', 'Phosphorus|फ़ॉस्फ़ोरस|ರಂಜಕ', 'Sulphur|सल्फ़र|ಗಂಧಕ', 'Chlorine|क्लोरीन|ಕ್ಲೋರಿನ್', 'Argon|आर्गन|ಆರ್ಗಾನ್',
  ];
  // Neutrons in the commonest isotope.
  static const neutrons = [0, 2, 4, 5, 6, 6, 7, 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 22];

  static const proton = Color(0xFFB65A4C), neutron = Color(0xFF9C968C), electron = TP.blue;

  int get z => t >= 0.5 && t < 0.86 ? 1 + (17 * seg(t, 0.52, 0.84)).round() : 11;

  static List<int> shells(int z) => [math.min(z, 2), (z - 2).clamp(0, 8), (z - 10).clamp(0, 8)];

  /// The outermost occupied shell.
  int outer(List<int> sh) => sh[2] > 0 ? 2 : (sh[1] > 0 ? 1 : 0);

  @override
  void draw() {
    final zz = z, n = neutrons[zz - 1];
    final sh = shells(zz);
    final showE = seg(t, 0.17, 0.24);
    final valence = seg(t, 0.86, 0.9);
    // Zoom: the nucleus is shown large first, then shrinks as the shells come in.
    final zoom = 1 + 1.6 * (1 - easeS(seg(t, 0.12, 0.2)));
    // Valence shell band.
    if (valence > 0) {
      c.drawCircle(o, shellR[outer(sh)], linePaint(TP.ochreLight.withValues(alpha: valence), 16));
    }
    // Shells.
    for (var s = 0; s < 3; s++) {
      final used = sh[s] > 0;
      final a = showE * (used ? 1 : 0.45);
      if (a <= 0) continue;
      c.drawCircle(o, shellR[s], linePaint(TP.ink2.withValues(alpha: a), used ? LW.fine : LW.hair));
      note(['K', 'L', 'M'][s], polar(o, shellR[s], -math.pi / 4) + const Offset(9, -9), size: 14, color: TP.ink2, align: 0, italic: true, weight: FontWeight.w600, opacity: a);
    }
    _nucleus(zz, n, zoom);
    // Electrons, evenly spaced on each shell, turning slowly (inner shells a little faster).
    for (var s = 0; s < 3; s++) {
      for (var e = 0; e < sh[s]; e++) {
        final a = e / sh[s] * tau - math.pi / 2 + t * tau * (2.4 - s * 0.6);
        final p = polar(o, shellR[s], a);
        if (valence > 0 && s == outer(sh)) c.drawCircle(p, 11, linePaint(TP.ochre.withValues(alpha: valence), 1.6));
        sphere(p, 6.5, electron, opacity: showE);
      }
    }
    _tile(const Rect.fromLTWH(560, 52, 416, 228), zz, n, sh);
    _table(const Rect.fromLTWH(560, 296, 416, 248), zz);
    _labels(zz, sh, showE, valence);
  }

  void _nucleus(int zz, int n, double zoom) {
    final total = zz + n;
    // Sunflower packing; a pseudo depth decides the drawing order and a little shading.
    final pts = <(Offset, bool, double)>[];
    for (var k = 0; k < total; k++) {
      final r = 5.2 * zoom * math.sqrt(k + 0.5);
      final a = k * 2.39996;
      final isP = total == zz || (k * zz / total).floor() != ((k + 1) * zz / total).floor();
      final depth = 1 - math.sqrt(k + 0.5) / math.sqrt(total + 0.5);
      pts.add((o + Offset(math.cos(a), math.sin(a)) * r + Offset(0, -depth * 3 * zoom), isP, depth));
    }
    pts.sort((a, b) => a.$3.compareTo(b.$3));
    for (final (p, isP, _) in pts) {
      sphere(p, 6.2 * zoom, isP ? proton : neutron);
      if (isP && zoom > 1.6) note('+', p, size: 8 * zoom, color: Colors.white.withValues(alpha: 0.9), align: 0, halo: false, weight: FontWeight.w700);
    }
  }

  void _tile(Rect r, int zz, int n, List<int> sh) {
    panel(r, title: 'Element|तत्व|ಧಾತು');
    // A periodic-table cell.
    final cell = Rect.fromLTWH(r.left + 16, r.top + 40, 112, 120);
    c.drawRect(cell, Paint()..color = TP.paper);
    c.drawRect(cell, linePaint(TP.ink, LW.fine));
    note('$zz', cell.topLeft + const Offset(10, 16), size: 15, color: TP.ink, weight: FontWeight.w600, halo: false);
    note('${zz + n}', cell.topRight + const Offset(-10, 16), size: 12, color: TP.ink2, align: 1, halo: false);
    note(symbols[zz - 1], cell.center + const Offset(0, 4), size: 44, color: TP.ink, align: 0, weight: FontWeight.w600, halo: false);
    note(tr(names[zz - 1]), Offset(cell.center.dx, cell.bottom - 14), size: 12, color: TP.ink2, align: 0, halo: false);
    note(tr('Z = atomic number   A = mass number|Z = परमाणु क्रमांक   A = द्रव्यमान संख्या|Z = ಪರಮಾಣು ಸಂಖ್ಯೆ   A = ದ್ರವ್ಯರಾಶಿ ಸಂಖ್ಯೆ'), Offset(r.left + 16, r.top + 186), size: 10.5, color: TP.ink2, halo: false, maxWidth: 118);
    // Particle counts.
    final x0 = r.left + 150, colN = r.right - 64, colQ = r.right - 18;
    note(tr('Particle|कण|ಕಣ'), Offset(x0, r.top + 50), size: 11.5, color: TP.ink2, weight: FontWeight.w600, halo: false);
    note(tr('Charge|आवेश|ಆವೇಶ'), Offset(colN, r.top + 50), size: 11.5, color: TP.ink2, align: 1, weight: FontWeight.w600, halo: false);
    note(tr('No.|संख्या|ಸಂಖ್ಯೆ'), Offset(colQ, r.top + 50), size: 11.5, color: TP.ink2, align: 1, weight: FontWeight.w600, halo: false);
    c.drawLine(Offset(x0, r.top + 62), Offset(colQ, r.top + 62), linePaint(TP.rule, LW.hair));
    final rows = [
      (proton, 'Proton|प्रोटॉन|ಪ್ರೋಟಾನ್', '+1', zz),
      (neutron, 'Neutron|न्यूट्रॉन|ನ್ಯೂಟ್ರಾನ್', '0', n),
      (electron, 'Electron|इलेक्ट्रॉन|ಇಲೆಕ್ಟ್ರಾನ್', '−1', zz),
    ];
    for (var i = 0; i < rows.length; i++) {
      final y = r.top + 80 + i * 26.0;
      final (col, name, q, count) = rows[i];
      sphere(Offset(x0 + 6, y), 5.5, col);
      note(tr(name), Offset(x0 + 18, y), size: 13, color: TP.ink, halo: false);
      note(q, Offset(colN, y), size: 13, color: TP.ink, align: 1, halo: false);
      note('$count', Offset(colQ, y), size: 13, color: TP.ink, align: 1, weight: FontWeight.w600, halo: false);
    }
    c.drawLine(Offset(x0, r.top + 156), Offset(colQ, r.top + 156), linePaint(TP.rule, LW.hair));
    // Configuration by shell.
    note(tr('Configuration|इलेक्ट्रॉनिक विन्यास|ಇಲೆಕ್ಟ್ರಾನಿಕ್ ವಿನ್ಯಾಸ'), Offset(x0, r.top + 174), size: 11.5, color: TP.ink2, weight: FontWeight.w600, halo: false);
    final used = [for (var s = 0; s < 3; s++) if (sh[s] > 0) s];
    for (var k = 0; k < used.length; k++) {
      final x = x0 + 8 + k * 44.0;
      note(['K', 'L', 'M'][used[k]], Offset(x, r.top + 196), size: 11, color: TP.ink2, align: 0, italic: true, halo: false);
      note('${sh[used[k]]}', Offset(x, r.top + 214), size: 17, color: TP.ink, align: 0, weight: FontWeight.w600, halo: false);
    }
  }

  void _table(Rect r, int zz) {
    panel(r, title: 'The first 18 elements|पहले 18 तत्व|ಮೊದಲ 18 ಧಾತುಗಳು');
    // Periods 1–3 in eight groups (H and He in the first period at the two ends).
    const cw = 39.0, ch = 40.0;
    final x0 = r.left + 18, y0 = r.top + 44;
    Rect cellOf(int z) {
      int period, col;
      if (z <= 2) {
        period = 0;
        col = z == 1 ? 0 : 7;
      } else if (z <= 10) {
        period = 1;
        col = z - 3;
      } else {
        period = 2;
        col = z - 11;
      }
      return Rect.fromLTWH(x0 + col * (cw + 4), y0 + period * (ch + 6), cw, ch);
    }

    for (var z = 1; z <= 18; z++) {
      final cell = cellOf(z);
      final on = z == zz;
      final done = z < zz;
      c.drawRect(cell, Paint()..color = on ? TP.ochreLight : (done ? TP.paper : tone(TP.paper2, -0.02)));
      c.drawRect(cell, linePaint(on ? TP.ochre : TP.rule, on ? LW.line : LW.hair));
      note('$z', cell.topLeft + const Offset(4, 8), size: 9, color: TP.ink2, halo: false);
      note(symbols[z - 1], cell.center + const Offset(0, 4), size: 15, color: on ? TP.ink : (done ? TP.ink : TP.ink2), align: 0, weight: on ? FontWeight.w700 : FontWeight.w500, halo: false);
    }
    // Group numbers.
    const groups = [1, 2, 13, 14, 15, 16, 17, 18];
    for (var g = 0; g < 8; g++) {
      note('${groups[g]}', Offset(x0 + g * (cw + 4) + cw / 2, y0 + 3 * (ch + 6) + 6), size: 11, color: TP.ink2, align: 0, halo: false);
    }
    note(tr('Group|समूह|ಗುಂಪು'), Offset(x0, y0 + 3 * (ch + 6) + 24), size: 11, color: TP.ink2, halo: false);
    for (var p = 0; p < 3; p++) {
      note(tr('Period ${p + 1}|आवर्त ${p + 1}|ಆವರ್ತ ${p + 1}'), Offset(r.right - 12, y0 + p * (ch + 6) + ch / 2), size: 11, color: TP.ink2, align: 1, halo: false);
    }
  }

  void _labels(int zz, List<int> sh, double showE, double valence) {
    final zoomed = t < 0.2;
    callout('Nucleus|नाभिक|ನ್ಯೂಕ್ಲಿಯಸ್', o + Offset(zoomed ? -30 : -14, zoomed ? 30 : 12), const Offset(110, 462), side: -1);
    // Particle key.
    if (f.labels) {
      final items = [(proton, 'Proton (+)|प्रोटॉन (+)|ಪ್ರೋಟಾನ್ (+)', 1.0), (neutron, 'Neutron (no charge)|न्यूट्रॉन (अनावेशित)|ನ್ಯೂಟ್ರಾನ್ (ಆವೇಶರಹಿತ)', 1.0), (electron, 'Electron (−)|इलेक्ट्रॉन (−)|ಇಲೆಕ್ಟ್ರಾನ್ (−)', showE)];
      for (var i = 0; i < items.length; i++) {
        final y = 64 + i * 24.0;
        final (col, name, op) = items[i];
        sphere(Offset(36, y), 6, col, opacity: math.max(op, 0.3));
        note(tr(name), Offset(50, y), size: 13, color: TP.ink, opacity: math.max(op, 0.3));
      }
    }
    callout('Electron shell (orbit)|इलेक्ट्रॉन कोश (कक्षा)|ಇಲೆಕ್ಟ್ರಾನ್ ಕವಚ (ಕಕ್ಷೆ)', polar(o, shellR[2], math.pi * 0.72), const Offset(64, 530), opacity: showE * (sh[2] > 0 ? 1 : 0.5));
    if (valence > 0) {
      final s = outer(sh);
      final e0 = polar(o, shellR[s], -math.pi / 2 + t * tau * (2.4 - s * 0.6));
      callout('Valence electron|संयोजकता इलेक्ट्रॉन|ವೇಲೆನ್ಸಿ ಇಲೆಕ್ಟ್ರಾನ್', e0 + (o - e0) / (o - e0).distance * 8, const Offset(436, 556), opacity: valence);
    }
    note(tr('Not to scale: the nucleus is about 100 000 times smaller than the atom.|पैमाने पर नहीं: नाभिक परमाणु से लगभग 1,00,000 गुना छोटा है।|ಪ್ರಮಾಣಕ್ಕೆ ತಕ್ಕಂತಿಲ್ಲ: ನ್ಯೂಕ್ಲಿಯಸ್ ಪರಮಾಣುವಿಗಿಂತ ಸುಮಾರು 1,00,000 ಪಟ್ಟು ಚಿಕ್ಕದು.'), const Offset(292, 586), size: 11, color: TP.ink2, align: 0, italic: true, maxWidth: 500, opacity: showE);
  }
}
