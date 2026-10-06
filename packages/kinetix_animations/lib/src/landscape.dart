part of 'draw.dart';

/// Landscape and cycle-diagram parts for the plates: sky and soil, clouds, plants, pools and
/// process arrows. Drawn as illustration, not clip-art: shaded, in muted natural colours.
extension Landscape on AnimPainter {
  /// A pale sky down to [ground], the ground line with a thin turf, and soil horizons below.
  void landscape(double ground, {double right = 1000, bool soil = true}) {
    final sky = Rect.fromLTWH(0, 0, right, ground);
    c.drawRect(sky, vGrad(sky, [const Color(0xFFE3ECF0), const Color(0xFFF4F6F3)]));
    if (!soil) return;
    final top = Rect.fromLTWH(0, ground, right, 70);
    c.drawRect(top, vGrad(top, [const Color(0xFF8E7354), const Color(0xFFA48A6C)]));
    final sub = Rect.fromLTWH(0, ground + 70, right, 600 - ground - 70);
    c.drawRect(sub, vGrad(sub, [const Color(0xFFC4AD8A), const Color(0xFFD6C3A3)]));
    // Grains and pebbles.
    for (var i = 0; i < 260; i++) {
      final p = Offset(rnd(i, 50) * right, ground + 6 + rnd(i, 51) * (600 - ground - 8));
      final r = 0.8 + rnd(i, 52) * (i % 17 == 0 ? 4 : 1.4);
      c.drawCircle(p, r, Paint()..color = (p.dy < ground + 70 ? const Color(0xFF6E573F) : const Color(0xFF9C845F)).withValues(alpha: 0.5));
    }
    // Turf.
    c.drawRect(Rect.fromLTWH(0, ground - 3, right, 6), Paint()..color = const Color(0xFF6F8A4E));
    for (var x = 2.0; x < right; x += 5) {
      final h = 4 + rnd(x.toInt(), 53) * 7;
      c.drawLine(Offset(x, ground - 1), Offset(x + (rnd(x.toInt(), 54) - 0.5) * 4, ground - h), linePaint(const Color(0xFF5E7A43), 1));
    }
  }

  /// A cumulus cloud: soft lobes shaded from white on top to grey below, with a flat base.
  void cumulus(Offset o, double s, {Color base = const Color(0xFFD5DCE1), double opacity = 1}) {
    const lobes = [Offset(-46, 8), Offset(-20, -10), Offset(12, -18), Offset(42, -4), Offset(60, 12), Offset(-60, 16), Offset(0, 10), Offset(30, 14)];
    const rs = [24.0, 30, 34, 26, 18, 16, 28, 24];
    final path = Path();
    for (var i = 0; i < lobes.length; i++) {
      path.addOval(Rect.fromCircle(center: o + lobes[i] * s, radius: rs[i] * s));
    }
    final bounds = Rect.fromLTRB(o.dx - 80 * s, o.dy - 52 * s, o.dx + 82 * s, o.dy + 30 * s);
    c.save();
    c.clipRect(Rect.fromLTRB(bounds.left - 2, bounds.top - 2, bounds.right + 2, o.dy + 28 * s));
    c.drawPath(path, vGrad(bounds, [Colors.white.withValues(alpha: opacity), base.withValues(alpha: opacity), tone(base, -0.15).withValues(alpha: opacity)], const [0.15, 0.7, 1]));
    c.restore();
  }

  /// A broadleaf tree: a tapering trunk with branches and a crown of shaded leaf clusters.
  void broadleaf(Offset base, double s, {Color leaf = const Color(0xFF5D7E4C)}) {
    const bark = Color(0xFF6B5442);
    final trunk = Path()
      ..moveTo(base.dx - 9 * s, base.dy)
      ..cubicTo(base.dx - 6 * s, base.dy - 50 * s, base.dx - 7 * s, base.dy - 80 * s, base.dx - 3 * s, base.dy - 110 * s)
      ..lineTo(base.dx + 3 * s, base.dy - 110 * s)
      ..cubicTo(base.dx + 6 * s, base.dy - 80 * s, base.dx + 6 * s, base.dy - 50 * s, base.dx + 10 * s, base.dy)
      ..close();
    c.drawPath(trunk, hGrad(Rect.fromLTRB(base.dx - 10 * s, base.dy - 110 * s, base.dx + 10 * s, base.dy), [tone(bark, -0.2), tone(bark, 0.2), tone(bark, -0.3)]));
    for (final (a, b) in [(const Offset(0, -70), const Offset(-36, -112)), (const Offset(0, -86), const Offset(32, -124)), (const Offset(0, -100), const Offset(-8, -140))]) {
      c.drawLine(base + a * s, base + b * s, linePaint(bark, 3.2 * s));
    }
    // The crown: many small leaf clusters inside an irregular outline, darker beneath and
    // behind, lighter where the light falls (upper left).
    final crown = Offset(base.dx, base.dy - 140 * s);
    const n = 70;
    final pts = <(Offset, double, double)>[];
    for (var i = 0; i < n; i++) {
      final a = rnd(i, 64) * tau;
      final rr = math.sqrt(rnd(i, 65));
      final o = crown + Offset(math.cos(a) * 62 * rr, math.sin(a) * 44 * rr) * s;
      final light = ((crown.dy + 44 * s - o.dy) / (88 * s)) * 0.7 + ((crown.dx + 62 * s - o.dx) / (124 * s)) * 0.3;
      pts.add((o, (9 + rnd(i, 66) * 5) * s, light.clamp(0.0, 1.0)));
    }
    pts.sort((a, b) => a.$3.compareTo(b.$3));
    c.drawOval(Rect.fromCenter(center: crown + Offset(0, 6 * s), width: 128 * s, height: 92 * s), Paint()..color = tone(leaf, -0.42));
    for (final (o, r, light) in pts) {
      final col = Color.lerp(tone(leaf, -0.3), tone(leaf, 0.28), light)!;
      c.drawCircle(o, r, Paint()..shader = RadialGradient(center: const Alignment(-0.35, -0.45), colors: [tone(col, 0.18), col, tone(col, -0.2)], stops: const [0, 0.55, 1]).createShader(Rect.fromCircle(center: o, radius: r)));
    }
  }

  /// A herbaceous plant with long blade leaves (maize-like), with roots below the ground.
  void herb(Offset base, double s, {Color leaf = const Color(0xFF6A8C4E), bool roots = true}) {
    if (roots) rootSystem(base, s);
    c.drawLine(base, base + Offset(0, -124 * s), linePaint(tone(leaf, -0.15), 3 * s));
    for (var i = 0; i < 6; i++) {
      final y = -26.0 - i * 17;
      final side = i.isEven ? 1.0 : -1.0;
      final p0 = base + Offset(0, y * s);
      final tip = p0 + Offset(side * (56 - i * 5) * s, (16 - i * 2) * s);
      final ctrl = p0 + Offset(side * 30 * s, -24 * s);
      final blade = Path()
        ..moveTo(p0.dx, p0.dy)
        ..quadraticBezierTo(ctrl.dx, ctrl.dy - 7 * s, tip.dx, tip.dy)
        ..quadraticBezierTo(ctrl.dx, ctrl.dy + 5 * s, p0.dx, p0.dy + 5 * s)
        ..close();
      c.drawPath(blade, Paint()..color = Color.lerp(leaf, tone(leaf, 0.2), i / 6)!);
      c.drawPath(Path()..moveTo(p0.dx, p0.dy + 1)..quadraticBezierTo(ctrl.dx, ctrl.dy - 1, tip.dx, tip.dy), linePaint(tone(leaf, -0.3), 0.6));
    }
  }

  /// A fibrous root system spreading down from [base].
  void rootSystem(Offset base, double s) {
    const col = Color(0xFFEDE3CF);
    for (var i = 0; i < 7; i++) {
      final a = math.pi / 2 + (i - 3) * 0.32;
      final len = (46 + rnd(i, 61) * 30) * s;
      final mid = base + Offset.fromDirection(a, len * 0.5) + Offset((rnd(i, 62) - 0.5) * 10 * s, 0);
      final end = base + Offset.fromDirection(a, len);
      c.drawPath(Path()..moveTo(base.dx, base.dy)..quadraticBezierTo(mid.dx, mid.dy, end.dx, end.dy), linePaint(col, (2.2 - i % 2 * 0.6) * s));
      final b = lerpO(base, end, 0.6);
      c.drawLine(b, b + Offset.fromDirection(a + (i.isEven ? 0.7 : -0.7), 14 * s), linePaint(col, 0.9 * s));
    }
  }

  /// A legume (gram or pea): pinnate leaves on a slender stem, roots with nodules.
  void legume(Offset base, double s, {Color leaf = const Color(0xFF668A4A)}) {
    rootSystem(base, s * 0.95);
    for (var i = 0; i < 9; i++) {
      final a = math.pi / 2 + (i % 7 - 3) * 0.32;
      final p = base + Offset.fromDirection(a, (22 + (i * 7) % 30) * s);
      sphere(p, (3.4 + rnd(i, 63) * 1.6) * s, const Color(0xFFD9A08E));
    }
    final stem = Path()
      ..moveTo(base.dx, base.dy)
      ..cubicTo(base.dx - 4 * s, base.dy - 40 * s, base.dx + 4 * s, base.dy - 80 * s, base.dx, base.dy - 112 * s);
    c.drawPath(stem, linePaint(tone(leaf, -0.2), 2.4 * s));
    for (var i = 0; i < 5; i++) {
      final y = -30.0 - i * 18;
      final side = i.isEven ? 1.0 : -1.0;
      final p0 = base + Offset(0, y * s);
      final dir = Offset(side * 34, -10) * s;
      c.drawLine(p0, p0 + dir, linePaint(tone(leaf, -0.2), 1.1 * s));
      for (var k = 1; k <= 3; k++) {
        final q = p0 + dir * (k / 3.2);
        for (final sd in [-1.0, 1.0]) {
          final cen = q + Offset(-dir.dy, dir.dx) / dir.distance * 6 * s * sd;
          c.save();
          c.translate(cen.dx, cen.dy);
          c.rotate(dir.direction + sd * 0.7);
          c.drawOval(Rect.fromCenter(center: Offset.zero, width: 12 * s, height: 6 * s), Paint()..color = Color.lerp(leaf, tone(leaf, 0.25), k / 3)!);
          c.restore();
        }
      }
    }
  }

  /// A soft sun with a warm glow.
  void sunDisc(Offset o, double r) {
    c.drawCircle(o, r * 3, Paint()..shader = RadialGradient(colors: [const Color(0x55F6D58A), const Color(0x00F6D58A)]).createShader(Rect.fromCircle(center: o, radius: r * 3)));
    c.drawCircle(o, r, Paint()..shader = RadialGradient(center: const Alignment(-0.2, -0.2), colors: [const Color(0xFFFFF4D2), const Color(0xFFF2C766)]).createShader(Rect.fromCircle(center: o, radius: r)));
  }

  /// A labelled pool of a cycle (an element or compound in a store): a rounded box.
  void pool(Offset at, String l3, {String? formula, bool on = false, Color col = TP.teal, double w = 124}) {
    final h = formula == null ? 30.0 : 44.0;
    final r = RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: w, height: h), const Radius.circular(6));
    c.drawRRect(r, Paint()..color = on ? tone(col, 0.84) : TP.paper.withValues(alpha: 0.94));
    c.drawRRect(r, linePaint(on ? col : TP.ink2, on ? LW.line * 1.3 : LW.fine));
    if (formula != null) {
      note(formula, at + const Offset(0, -9), size: 15, color: on ? tone(col, -0.35) : TP.ink, align: 0, weight: FontWeight.w600, halo: false);
      note(tr(l3), at + const Offset(0, 11), size: 11, color: TP.ink2, align: 0, halo: false, maxWidth: w - 8);
    } else {
      note(tr(l3), at, size: 12.5, color: on ? tone(col, -0.35) : TP.ink, align: 0, weight: FontWeight.w600, halo: false, maxWidth: w - 8);
    }
  }

  /// One process arrow of a cycle: faint when idle; when [on], coloured, with [token]s (a
  /// formula, or dots) travelling along it.
  void process(Path p, {required bool on, Color col = TP.teal, String? token, double w = LW.bold, int n = 3}) {
    c.drawPath(p, linePaint(on ? col : TP.ink2.withValues(alpha: 0.35), on ? w * 1.25 : w * 0.8));
    final m = p.computeMetrics().first;
    final end = m.getTangentForOffset(m.length)!;
    dart(end.position, -end.angle, on ? col : TP.ink2.withValues(alpha: 0.45), len: on ? 13 : 11);
    if (!on) return;
    for (var i = 0; i < n; i++) {
      final k = fr(t * 5 + i / n) * 0.9;
      final q = m.getTangentForOffset(m.length * k)!.position;
      if (token == null) {
        sphere(q, 4.2, col);
      } else {
        final tp = TextPainter(
          text: TextSpan(text: token, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: tone(col, -0.45), fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback)),
          textDirection: TextDirection.ltr,
        )..layout();
        final r = RRect.fromRectAndRadius(Rect.fromCenter(center: q, width: tp.width + 8, height: tp.height + 2), const Radius.circular(3));
        c.drawRRect(r, Paint()..color = tone(col, 0.86));
        c.drawRRect(r, linePaint(col, 0.8));
        tp.paint(c, q - Offset(tp.width / 2, tp.height / 2));
      }
    }
  }

  /// A grazing cow in profile, facing right, drawn as a shaded silhouette.
  void cow(Offset o, double s, {Color hide = const Color(0xFF8A7360)}) {
    Offset p(double x, double y) => o + Offset(x, y) * s;
    final body = Path()
      ..moveTo(p(-62, -40).dx, p(-62, -40).dy)
      ..cubicTo(p(-40, -50).dx, p(-40, -50).dy, p(20, -50).dx, p(20, -50).dy, p(40, -44).dx, p(40, -44).dy)
      ..cubicTo(p(52, -40).dx, p(52, -40).dy, p(58, -30).dx, p(58, -30).dy, p(62, -18).dx, p(62, -18).dy) // shoulder to neck (head down)
      ..cubicTo(p(70, -6).dx, p(70, -6).dy, p(78, 4).dx, p(78, 4).dy, p(84, 14).dx, p(84, 14).dy)
      ..cubicTo(p(88, 22).dx, p(88, 22).dy, p(80, 26).dx, p(80, 26).dy, p(74, 22).dx, p(74, 22).dy) // muzzle
      ..cubicTo(p(66, 14).dx, p(66, 14).dy, p(56, 4).dx, p(56, 4).dy, p(48, -2).dx, p(48, -2).dy)
      ..cubicTo(p(44, 6).dx, p(44, 6).dy, p(40, 10).dx, p(40, 10).dy, p(34, 8).dx, p(34, 8).dy) // chest
      ..lineTo(p(-48, 8).dx, p(-48, 8).dy)
      ..cubicTo(p(-60, 6).dx, p(-60, 6).dy, p(-66, -8).dx, p(-66, -8).dy, p(-66, -22).dx, p(-66, -22).dy)
      ..close();
    // Legs (far pair darker, behind).
    void leg(double x, double lean, Color col) {
      final top = p(x, 2), knee = p(x + lean, 26), hoof = p(x + lean * 0.6, 44);
      c.drawPath(Path()..moveTo(top.dx, top.dy)..lineTo(knee.dx, knee.dy)..lineTo(hoof.dx, hoof.dy), linePaint(col, 7 * s));
      c.drawLine(hoof, hoof + Offset(3 * s, 0), linePaint(const Color(0xFF3A2E26), 7 * s, cap: StrokeCap.butt));
    }

    leg(-44, 3, tone(hide, -0.3));
    leg(26, -2, tone(hide, -0.3));
    c.drawPath(body, vGrad(Rect.fromLTRB(o.dx - 66 * s, o.dy - 50 * s, o.dx + 88 * s, o.dy + 26 * s), [tone(hide, 0.18), hide, tone(hide, -0.2)]));
    c.drawPath(body, linePaint(tone(hide, -0.5), LW.fine));
    leg(-56, -2, hide);
    leg(34, 3, hide);
    // Ear and horn, eye, tail.
    c.drawPath(Path()..moveTo(p(62, -14).dx, p(62, -14).dy)..lineTo(p(54, -22).dx, p(54, -22).dy)..lineTo(p(66, -20).dx, p(66, -20).dy)..close(), Paint()..color = tone(hide, -0.25));
    c.drawLine(p(66, -16), p(72, -26), linePaint(const Color(0xFFE6DCCB), 2.2 * s));
    c.drawCircle(p(72, 0), 1.6 * s, Paint()..color = const Color(0xFF2B221C));
    c.drawPath(Path()..moveTo(p(-64, -34).dx, p(-64, -34).dy)..quadraticBezierTo(p(-76, -10).dx, p(-76, -10).dy, p(-70, 20).dx, p(-70, 20).dy), linePaint(tone(hide, -0.35), 2 * s));
  }
}
