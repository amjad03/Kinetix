part of 'draw.dart';

/// The textbook-plate palette: print colours on the board's paper. Line work is near-black
/// ink; materials are drawn in their own muted colours (copper, steel, glass, water); meaning
/// (current, charge, light) uses a few desaturated hues, never saturated primaries.
abstract final class TP {
  static const paper = Color(0xFFFBFAF6);
  static const paper2 = Color(0xFFF3F1EA); // inset panels
  static const rule = Color(0xFFD6D2C7); // panel borders, grid
  static const grid = Color(0xFFE7E3DA);
  static const ink = Color(0xFF1F2328); // line work and text
  static const ink2 = Color(0xFF4B525A); // secondary text, leaders
  static const hair = Color(0xFF8C9399); // construction lines (normals, guides)

  // Materials.
  static const copper = Color(0xFFB4743E);
  static const copperDark = Color(0xFF7C4B25);
  static const copperLight = Color(0xFFE2BC93);
  static const brass = Color(0xFFC2A15A);
  static const steel = Color(0xFF8E979F);
  static const steelDark = Color(0xFF515B64);
  static const steelLight = Color(0xFFDCE0E3);
  static const graphite = Color(0xFF3A3E44);
  static const bakelite = Color(0xFF4A3B32);
  static const wood = Color(0xFFB99A72);
  static const glass = Color(0xFFDDEAEE);
  static const glassEdge = Color(0xFF7FA0AC);
  static const water = Color(0xFFCADDE7);
  static const waterDeep = Color(0xFFA7C3D3);
  static const waterEdge = Color(0xFF6A8EA2);

  // Meaning.
  static const red = Color(0xFFB0473B); // conventional current, positive, N pole, rays
  static const redLight = Color(0xFFE9C3BC);
  static const blue = Color(0xFF34618E); // electrons, negative, S pole
  static const blueLight = Color(0xFFC3D3E4);
  static const ochre = Color(0xFFC18A2C); // light, heat, energy
  static const ochreLight = Color(0xFFF1DDB3);
  static const teal = Color(0xFF2F7A74); // oxygen, gases
  static const tealLight = Color(0xFFC4E0DC);
  static const green = Color(0xFF52784A); // plants, life
  static const greenLight = Color(0xFFD3E2CB);
  static const plum = Color(0xFF6C4E80); // angles, annotations
  static const sand = Color(0xFFD9C8A6);
  static const soil = Color(0xFF8A6D4E);
  static const stone = Color(0xFF8F8A82);
}

/// Line weights, in design units (the canvas is 1000 × 600; at 1080p one unit is 1.8 px).
abstract final class LW {
  static const hair = 0.8; // leaders, construction lines, ticks
  static const fine = 1.1; // outlines of small parts, grid axes
  static const line = 1.5; // object outlines
  static const bold = 2.2; // emphasised outlines, plotted curves
  static const wire = 2.4; // circuit wires
}

/// Textbook-illustration helpers shared by the plates.
extension Plate on AnimPainter {
  /// A lighter (k > 0) or darker (k < 0) version of [col].
  Color tone(Color col, double k) => k >= 0 ? Color.lerp(col, Colors.white, k)! : Color.lerp(col, Colors.black, -k)!;

  Paint linePaint(Color col, double w, {StrokeCap cap = StrokeCap.round}) => Paint()
    ..color = col
    ..style = PaintingStyle.stroke
    ..strokeWidth = w
    ..strokeCap = cap
    ..strokeJoin = StrokeJoin.round
    ..isAntiAlias = true;

  Paint vGrad(Rect r, List<Color> cols, [List<double>? stops]) => Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: cols, stops: stops).createShader(r);
  Paint hGrad(Rect r, List<Color> cols, [List<double>? stops]) => Paint()..shader = LinearGradient(colors: cols, stops: stops).createShader(r);

  /// Plain text, with a paper halo so it reads over line work. [align] -1 puts [at] at the
  /// text's left edge, 0 at its centre, 1 at its right edge.
  Size note(
    String s,
    Offset at, {
    double size = 14,
    Color color = TP.ink,
    FontWeight weight = FontWeight.w500,
    double align = -1,
    double maxWidth = 300,
    bool halo = true,
    bool italic = false,
    double opacity = 1,
    Color haloColor = TP.paper,
    double spacing = 0,
  }) {
    if (opacity <= 0) return Size.zero;
    final px = f.thumbnail ? size : math.max(size, 11 / _scale);
    TextPainter make(Paint? fg) => TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          fontSize: px,
          color: fg == null ? color.withValues(alpha: color.a * opacity) : null,
          foreground: fg,
          fontWeight: weight,
          fontStyle: italic ? FontStyle.italic : FontStyle.normal,
          height: 1.2,
          letterSpacing: spacing,
          fontFamily: KxFonts.family,
          fontFamilyFallback: KxFonts.fallback,
        ),
      ),
      textAlign: align < 0 ? TextAlign.left : (align > 0 ? TextAlign.right : TextAlign.center),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: math.max(maxWidth, px * 4));
    final tp = make(null);
    final topLeft = Offset(at.dx - tp.width * (align + 1) / 2, at.dy - tp.height / 2);
    if (halo) {
      make(
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = px * 0.24
          ..strokeJoin = StrokeJoin.round
          ..color = haloColor.withValues(alpha: 0.85 * opacity),
      ).paint(c, topLeft);
    }
    tp.paint(c, topLeft);
    return tp.size;
  }

  /// A leader-line label (only when labels are on): a fine line from a dot on the thing named
  /// ([anchor]) to a short shoulder at [at], with the text beyond it. [side] -1 puts the text to
  /// the left of [at], 1 to the right.
  void callout(String l3, Offset anchor, Offset at, {double side = 1, double opacity = 1, double size = 14, Color color = TP.ink, bool dot = true, double maxWidth = 220}) {
    if (!f.labels || opacity <= 0) return;
    final lead = TP.ink2.withValues(alpha: 0.9 * opacity);
    final knee = at - Offset(10 * side, 0);
    c.drawLine(anchor, knee, linePaint(lead, LW.hair));
    c.drawLine(knee, at, linePaint(lead, LW.hair));
    if (dot) c.drawCircle(anchor, 2.0, Paint()..color = TP.ink.withValues(alpha: opacity));
    note(tr(l3), at + Offset(5 * side, 0), size: size, color: color, align: -side, opacity: opacity, maxWidth: maxWidth, weight: FontWeight.w500);
  }

  /// A label without a leader (a region's name), only when labels are on.
  void tag(String l3, Offset at, {double size = 14, Color color = TP.ink, double align = 0, double opacity = 1, FontWeight weight = FontWeight.w500, bool italic = false, double maxWidth = 260}) {
    if (!f.labels) return;
    note(tr(l3), at, size: size, color: color, align: align, opacity: opacity, weight: weight, italic: italic, maxWidth: maxWidth);
  }

  /// A small panel title in spaced capitals, with a rule under it.
  void plateTitle(String l3, Offset at, {double width = 200, double opacity = 1}) {
    if (!f.labels) return;
    final s = tr(l3);
    note(f.lang == AnimLang.en ? s.toUpperCase() : s, at, size: 11.5, color: TP.ink2, weight: FontWeight.w600, spacing: f.lang == AnimLang.en ? 1.1 : 0, opacity: opacity, halo: false);
    c.drawLine(at + const Offset(0, 11), at + Offset(width, 11), linePaint(TP.rule.withValues(alpha: opacity), LW.hair));
  }

  /// A slender filled arrowhead with its tip at [tip], pointing along [angle].
  void dart(Offset tip, double angle, Color col, {double len = 9, double spread = 0.34}) {
    final back = tip - Offset.fromDirection(angle, len);
    final notch = tip - Offset.fromDirection(angle, len * 0.78);
    final l = back + Offset.fromDirection(angle + math.pi / 2, len * math.tan(spread));
    final r = back + Offset.fromDirection(angle - math.pi / 2, len * math.tan(spread));
    c.drawPath(
      Path()
        ..moveTo(tip.dx, tip.dy)
        ..lineTo(l.dx, l.dy)
        ..lineTo(notch.dx, notch.dy)
        ..lineTo(r.dx, r.dy)
        ..close(),
      Paint()..color = col,
    );
  }

  /// A fine arrow from [a] to [b].
  void arrowTo(Offset a, Offset b, Color col, {double w = LW.line, double len = 9, double opacity = 1}) {
    if (opacity <= 0 || (b - a).distance < 1) return;
    final cc = col.withValues(alpha: col.a * opacity);
    final ang = (b - a).direction;
    c.drawLine(a, b - Offset.fromDirection(ang, len * 0.7), linePaint(cc, w));
    dart(b, ang, cc, len: len);
  }

  /// An arrowhead part way ([k]) along the segment [a]→[b], showing a direction.
  void midArrow(Offset a, Offset b, Color col, {double k = 0.5, double len = 9, double opacity = 1}) {
    if (opacity <= 0) return;
    final ang = (b - a).direction;
    dart(lerpO(a, b, k) + Offset.fromDirection(ang, len / 2), ang, col.withValues(alpha: col.a * opacity), len: len);
  }

  /// Arrowheads at the fractions [at] of the way along [p].
  void pathHeads(Path p, Color col, List<double> at, {double len = 9, double opacity = 1}) {
    if (opacity <= 0) return;
    for (final m in p.computeMetrics()) {
      for (final k in at) {
        final tg = m.getTangentForOffset(m.length * k.clamp(0.0, 1.0));
        if (tg != null) dart(tg.position + Offset.fromDirection(-tg.angle, len / 2), -tg.angle, col.withValues(alpha: col.a * opacity), len: len);
      }
    }
  }

  /// A dimension line between [a] and [b] (arrowheads both ends, end ticks), with its label.
  void dimension(Offset a, Offset b, String l3, {Color col = TP.ink2, double tick = 6, Offset labelOffset = Offset.zero, double opacity = 1, double size = 14, bool italic = false}) {
    if (opacity <= 0) return;
    final cc = col.withValues(alpha: opacity);
    final d = b - a;
    final n = Offset(-d.dy, d.dx) / d.distance;
    c.drawLine(a + n * tick, a - n * tick, linePaint(cc, LW.hair));
    c.drawLine(b + n * tick, b - n * tick, linePaint(cc, LW.hair));
    c.drawLine(a, b, linePaint(cc, LW.fine));
    dart(a, (a - b).direction, cc, len: 7);
    dart(b, d.direction, cc, len: 7);
    if (f.labels) note(tr(l3), lerpO(a, b, 0.5) + labelOffset, size: size, color: col, align: 0, opacity: opacity, italic: italic);
  }

  /// An angle arc at [o] from [from] sweeping [sweep] (radians, screen convention), named [name].
  void angleArc(Offset o, double r, double from, double sweep, String name, {Color col = TP.plum, double opacity = 1, double labelR = 0, double size = 15}) {
    if (opacity <= 0) return;
    final cc = col.withValues(alpha: opacity);
    c.drawArc(Rect.fromCircle(center: o, radius: r), from, sweep, false, linePaint(cc, LW.fine));
    if (name.isNotEmpty) note(name, polar(o, labelR == 0 ? r + 13 : labelR, from + sweep / 2), size: size, color: cc, align: 0, italic: true, weight: FontWeight.w600);
  }

  /// A dashed straight line.
  void dash(Offset a, Offset b, Color col, {double w = LW.hair, double on = 5, double off = 4}) {
    final d = b - a;
    final len = d.distance;
    if (len < 1) return;
    final u = d / len;
    for (var s = 0.0; s < len; s += on + off) {
      c.drawLine(a + u * s, a + u * math.min(s + on, len), linePaint(col, w, cap: StrokeCap.butt));
    }
  }

  /// A dashed path.
  void dashPath(Path p, Color col, {double w = LW.hair, double on = 5, double off = 4}) {
    for (final m in p.computeMetrics()) {
      for (var s = 0.0; s < m.length; s += on + off) {
        c.drawPath(m.extractPath(s, math.min(s + on, m.length)), linePaint(col, w, cap: StrokeCap.butt));
      }
    }
  }

  /// A shaded sphere (a particle, an atom, a bead) lit from the upper left.
  void sphere(Offset o, double r, Color base, {double opacity = 1, bool outline = true}) {
    if (opacity <= 0 || r <= 0) return;
    final rect = Rect.fromCircle(center: o, radius: r);
    c.drawCircle(
      o,
      r,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.38, -0.42),
          radius: 1.05,
          colors: [
            tone(base, 0.62).withValues(alpha: opacity),
            base.withValues(alpha: opacity),
            tone(base, -0.32).withValues(alpha: opacity),
          ],
          stops: const [0, 0.55, 1],
        ).createShader(rect),
    );
    if (outline && r > 3) c.drawCircle(o, r, linePaint(tone(base, -0.45).withValues(alpha: 0.8 * opacity), math.min(LW.fine, r * 0.12)));
  }

  /// A framed inset panel (a magnified view, a graph, a diagram).
  void panel(Rect r, {String? title, Color fillC = TP.paper2, double opacity = 1}) {
    if (opacity <= 0) return;
    final rr = RRect.fromRectAndRadius(r, const Radius.circular(6));
    c.drawRRect(rr, Paint()..color = fillC.withValues(alpha: opacity));
    c.drawRRect(rr, linePaint(TP.rule.withValues(alpha: opacity), LW.fine));
    if (title != null) plateTitle(title, r.topLeft + const Offset(12, 16), width: r.width - 24, opacity: opacity);
  }

  /// Graph axes in [r] (origin at [origin] inside it), with arrowheads and names.
  void axes(Rect r, {required Offset origin, String? x, String? y, Color col = TP.ink, bool negativeY = false}) {
    final p = linePaint(col, LW.fine);
    c.drawLine(Offset(r.left, origin.dy), Offset(r.right, origin.dy), p);
    dart(Offset(r.right + 2, origin.dy), 0, col, len: 8);
    c.drawLine(Offset(origin.dx, r.bottom), Offset(origin.dx, r.top), p);
    dart(Offset(origin.dx, r.top - 2), -math.pi / 2, col, len: 8);
    if (x != null) note(tr(x), Offset(r.right, origin.dy + 15), size: 13, color: TP.ink2, align: 1, italic: true);
    if (y != null) note(tr(y), Offset(origin.dx + 8, r.top + 2), size: 13, color: TP.ink2, align: -1, italic: true);
  }

  /// A curve y = [fn](x) for x in [x0]..[x1], mapped into [r] (y from [y0] at the bottom to [y1]).
  Path plot(Rect r, double Function(double x) fn, double x0, double x1, double y0, double y1, {int n = 160, double upto = 1}) {
    final p = Path();
    final m = (n * upto.clamp(0.0, 1.0)).ceil();
    for (var i = 0; i <= m; i++) {
      final x = x0 + (x1 - x0) * math.min(i / n, upto);
      final q = Offset(r.left + (x - x0) / (x1 - x0) * r.width, r.bottom - (fn(x) - y0) / (y1 - y0) * r.height);
      i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
    }
    return p;
  }

  /// A laboratory beaker: glass walls, a lip, graduations, and liquid up to [level] (0..1).
  void beaker(Rect r, {double level = 0.6, Color liquid = TP.water, bool marks = true, double opacity = 1}) {
    final lip = 6.0;
    final body = Path()
      ..moveTo(r.left - lip, r.top)
      ..lineTo(r.left, r.top + 5)
      ..lineTo(r.left, r.bottom - 10)
      ..quadraticBezierTo(r.left, r.bottom, r.left + 10, r.bottom)
      ..lineTo(r.right - 10, r.bottom)
      ..quadraticBezierTo(r.right, r.bottom, r.right, r.bottom - 10)
      ..lineTo(r.right, r.top + 5)
      ..lineTo(r.right + lip * 0.4, r.top);
    final inner = Rect.fromLTRB(r.left + 1.5, r.top, r.right - 1.5, r.bottom - 1.5);
    if (level > 0) {
      final top = inner.bottom - inner.height * level;
      final liq = Path()
        ..moveTo(inner.left, top - 3)
        ..quadraticBezierTo(inner.left + 4, top, inner.left + 12, top)
        ..lineTo(inner.right - 12, top)
        ..quadraticBezierTo(inner.right - 4, top, inner.right, top - 3)
        ..lineTo(inner.right, inner.bottom - 9)
        ..quadraticBezierTo(inner.right, inner.bottom, inner.right - 9, inner.bottom)
        ..lineTo(inner.left + 9, inner.bottom)
        ..quadraticBezierTo(inner.left, inner.bottom, inner.left, inner.bottom - 9)
        ..close();
      c.drawPath(liq, hGrad(inner, [tone(liquid, -0.06), tone(liquid, 0.25), liquid, tone(liquid, -0.1)], const [0, 0.3, 0.7, 1]));
      c.drawLine(Offset(inner.left + 10, top), Offset(inner.right - 10, top), linePaint(tone(liquid, -0.35), LW.fine));
    }
    // Glass: a faint tint, highlights, and the outline.
    c.drawRect(inner, Paint()..color = TP.glass.withValues(alpha: 0.18 * opacity));
    c.drawLine(Offset(r.left + 6, r.top + 14), Offset(r.left + 6, r.bottom - 16), linePaint(Colors.white.withValues(alpha: 0.75 * opacity), 3));
    c.drawLine(Offset(r.right - 7, r.top + 20), Offset(r.right - 7, r.bottom - 30), linePaint(Colors.white.withValues(alpha: 0.4 * opacity), 1.6));
    c.drawPath(body, linePaint(TP.glassEdge.withValues(alpha: opacity), LW.line));
    if (marks) {
      for (var i = 1; i <= 4; i++) {
        final y = r.bottom - r.height * 0.18 * i;
        c.drawLine(Offset(r.left + 1, y), Offset(r.left + (i.isEven ? 16 : 10), y), linePaint(TP.glassEdge.withValues(alpha: 0.8 * opacity), LW.hair));
      }
    }
  }

  /// A rectangle with a soft vertical shading and an outline: a solid block of [col].
  void block(Rect r, Color col, {Color? edge, double radius = 2, double w = LW.line}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(radius));
    c.drawRRect(rr, vGrad(r, [tone(col, 0.22), col, tone(col, -0.12)], const [0, 0.5, 1]));
    c.drawRRect(rr, linePaint(edge ?? tone(col, -0.45), w));
  }

  /// A horizontal cylinder (a rod, a dry cell) shaded as metal or plastic.
  void cylinderH(Rect r, Color col, {Color? edge}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(math.min(4, r.height / 2)));
    c.drawRRect(rr, vGrad(r, [tone(col, -0.2), tone(col, 0.45), col, tone(col, -0.35)], const [0, 0.28, 0.6, 1]));
    c.drawRRect(rr, linePaint(edge ?? tone(col, -0.5), LW.fine));
  }

  /// A vertical cylinder shaded across its width.
  void cylinderV(Rect r, Color col, {Color? edge, double radius = 3}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(math.min(radius, r.width / 2)));
    c.drawRRect(rr, hGrad(r, [tone(col, -0.25), tone(col, 0.45), col, tone(col, -0.38)], const [0, 0.3, 0.62, 1]));
    c.drawRRect(rr, linePaint(edge ?? tone(col, -0.5), LW.fine));
  }

  /// A wire along [p]: an insulated lead, dark with a faint highlight.
  void wire(Path p, {Color col = TP.graphite, double w = LW.wire, double opacity = 1}) {
    c.drawPath(p, linePaint(col.withValues(alpha: opacity), w));
    c.drawPath(p, linePaint(tone(col, 0.35).withValues(alpha: 0.6 * opacity), w * 0.3));
  }

  /// A terminal screw: a small brass disc with a slot.
  void terminal(Offset o, {double r = 5}) {
    sphere(o, r, TP.brass);
    c.drawLine(o + Offset(-r * 0.6, r * 0.25), o + Offset(r * 0.6, -r * 0.25), linePaint(tone(TP.brass, -0.55), 1));
  }

  /// A soft radial glow.
  void glow(Offset o, double r, Color col, double k) {
    if (k <= 0) return;
    c.drawCircle(
      o,
      r,
      Paint()
        ..shader = RadialGradient(
          colors: [
            col.withValues(alpha: 0.55 * k),
            col.withValues(alpha: 0.18 * k),
            col.withValues(alpha: 0),
          ],
          stops: const [0, 0.45, 1],
        ).createShader(Rect.fromCircle(center: o, radius: r)),
    );
  }

  /// A smoothed path through [pts] (Catmull–Rom), open or [closed].
  Path smooth(List<Offset> pts, {bool closed = false, double k = 0.5}) {
    final p = Path();
    if (pts.isEmpty) return p;
    final n = pts.length;
    Offset at(int i) => closed ? pts[(i % n + n) % n] : pts[i.clamp(0, n - 1)];
    p.moveTo(pts[0].dx, pts[0].dy);
    final last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      final p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      final c1 = p1 + (p2 - p0) * (k / 3);
      final c2 = p2 - (p3 - p1) * (k / 3);
      p.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    if (closed) p.close();
    return p;
  }

  /// A rectangular path with rounded corners through the points (a circuit's wiring).
  Path wireRun(List<Offset> pts, {double radius = 12}) {
    final p = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 1; i < pts.length - 1; i++) {
      final a = pts[i - 1], b = pts[i], d = pts[i + 1];
      final r = math.min(radius, math.min((b - a).distance, (d - b).distance) / 2);
      final p1 = b - (b - a) / (b - a).distance * r;
      final p2 = b + (d - b) / (d - b).distance * r;
      p.lineTo(p1.dx, p1.dy);
      p.quadraticBezierTo(b.dx, b.dy, p2.dx, p2.dy);
    }
    p.lineTo(pts.last.dx, pts.last.dy);
    return p;
  }
}

/// Smooth ease-in-out (sine).
double easeS(double x) => 0.5 - math.cos(math.pi * x.clamp(0.0, 1.0)) / 2;

/// A damped settle from 0 to 1 with a small overshoot (a meter needle).
double settle(double x) {
  if (x <= 0) return 0;
  return 1 - math.exp(-5 * x) * math.cos(9 * x);
}
