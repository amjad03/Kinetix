import 'dart:math' as math;
import 'dart:ui';

/// Fits clean geometry to hand-drawn ink, however many strokes it took.
///
/// Every candidate (circle, ellipse, rectangle, triangle, 4–8 sided polygon) is fitted to the
/// ink as a point cloud and scored two ways:
/// * error: how far the ink lies from the candidate's outline, and
/// * coverage: how much of the outline has ink along it.
/// A candidate is accepted only when the ink hugs its whole outline, which rejects letters such
/// as D, 8, B, A or V by construction (a D has no corners on its round side; an A leaves the
/// base of its triangle empty).

enum FitKind { circle, ellipse, rectangle, square, triangle, quad, polygon, line }

class Fit {
  const Fit(this.kind, this.outline, this.error, this.coverage, {this.oval});

  final FitKind kind;

  /// Outline, closed unless [kind] is line (then two points).
  final List<Offset> outline;

  /// For circles and level ellipses: the box (drawn as a true ellipse rather than a polygon).
  final Rect? oval;

  /// Mean distance of ink from the outline, as a fraction of the size.
  final double error;

  /// Share of the outline that has ink along it.
  final double coverage;

  int get sides => kind == FitKind.line ? 1 : outline.length;
  bool get isOval => kind == FitKind.circle || kind == FitKind.ellipse;
}

// --- Basics ---------------------------------------------------------------------------------

Rect boundsOfPoints(Iterable<Offset> pts) {
  var l = double.infinity, t = double.infinity, r = -double.infinity, b = -double.infinity;
  for (final p in pts) {
    l = math.min(l, p.dx);
    t = math.min(t, p.dy);
    r = math.max(r, p.dx);
    b = math.max(b, p.dy);
  }
  return Rect.fromLTRB(l, t, r, b);
}

double _cross(Offset o, Offset a, Offset b) => (a.dx - o.dx) * (b.dy - o.dy) - (a.dy - o.dy) * (b.dx - o.dx);

/// Distance from [p] to the segment [a]–[b].
double segmentDistance(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  final t = (((p - a).dx * ab.dx + (p - a).dy * ab.dy) / len2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

/// Points every [spacing] along a stroke.
List<Offset> resampleBy(List<Offset> pts, double spacing) {
  if (pts.length < 2 || spacing <= 0) return List.of(pts);
  final out = <Offset>[pts.first];
  var carry = 0.0;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1];
    final b = pts[i];
    var d = (b - a).distance;
    while (carry + d >= spacing && d > 0) {
      final t = (spacing - carry) / d;
      a = Offset.lerp(a, b, t)!;
      out.add(a);
      d = (b - a).distance;
      carry = 0;
    }
    carry += d;
  }
  if ((out.last - pts.last).distance > spacing * 0.3) out.add(pts.last);
  return out;
}

/// Convex hull, counter-clockwise (Andrew's monotone chain).
List<Offset> convexHull(List<Offset> pts) {
  final p = [...pts]..sort((a, b) => a.dx != b.dx ? a.dx.compareTo(b.dx) : a.dy.compareTo(b.dy));
  if (p.length < 3) return p;
  final lower = <Offset>[], upper = <Offset>[];
  for (final q in p) {
    while (lower.length >= 2 && _cross(lower[lower.length - 2], lower.last, q) <= 0) {
      lower.removeLast();
    }
    lower.add(q);
  }
  for (final q in p.reversed) {
    while (upper.length >= 2 && _cross(upper[upper.length - 2], upper.last, q) <= 0) {
      upper.removeLast();
    }
    upper.add(q);
  }
  return [...lower.sublist(0, lower.length - 1), ...upper.sublist(0, upper.length - 1)];
}

double polygonArea(List<Offset> p) {
  var a = 0.0;
  for (var i = 0; i < p.length; i++) {
    final j = (i + 1) % p.length;
    a += p[i].dx * p[j].dy - p[j].dx * p[i].dy;
  }
  return a.abs() / 2;
}

/// Smallest-area rectangle around a convex polygon: its corners and angle.
(List<Offset>, double) minAreaRect(List<Offset> hull) {
  var best = double.infinity;
  var corners = <Offset>[];
  var bestAngle = 0.0;
  for (var i = 0; i < hull.length; i++) {
    final e = hull[(i + 1) % hull.length] - hull[i];
    if (e.distance == 0) continue;
    final ang = math.atan2(e.dy, e.dx);
    final c = math.cos(-ang), s = math.sin(-ang);
    var minX = double.infinity, maxX = -double.infinity, minY = double.infinity, maxY = -double.infinity;
    for (final p in hull) {
      final x = p.dx * c - p.dy * s, y = p.dx * s + p.dy * c;
      minX = math.min(minX, x);
      maxX = math.max(maxX, x);
      minY = math.min(minY, y);
      maxY = math.max(maxY, y);
    }
    final area = (maxX - minX) * (maxY - minY);
    if (area < best) {
      best = area;
      bestAngle = ang;
      final ci = math.cos(ang), si = math.sin(ang);
      Offset back(double x, double y) => Offset(x * ci - y * si, x * si + y * ci);
      corners = [back(minX, minY), back(maxX, minY), back(maxX, maxY), back(minX, maxY)];
    }
  }
  return (corners, bestAngle);
}

/// Reduces a closed polygon to [k] corners by dropping, again and again, the corner that adds
/// the least area (Visvalingam–Whyatt).
List<Offset> simplifyTo(List<Offset> poly, int k) {
  final p = List.of(poly);
  while (p.length > k) {
    var bi = 0;
    var ba = double.infinity;
    for (var i = 0; i < p.length; i++) {
      final a = _cross(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]).abs();
      if (a < ba) {
        ba = a;
        bi = i;
      }
    }
    p.removeAt(bi);
  }
  return p;
}

List<Offset> _ovalOutline(Offset c, double a, double b, double angle, [int n = 72]) {
  final ca = math.cos(angle), sa = math.sin(angle);
  return [
    for (var i = 0; i < n; i++)
      () {
        final x = a * math.cos(2 * math.pi * i / n), y = b * math.sin(2 * math.pi * i / n);
        return c + Offset(x * ca - y * sa, x * sa + y * ca);
      }(),
  ];
}

double _distToOutline(Offset p, List<Offset> outline, bool closed) {
  var best = double.infinity;
  final n = outline.length;
  for (var i = 0; i < (closed ? n : n - 1); i++) {
    final d = segmentDistance(p, outline[i], outline[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

/// Error, coverage, stray-ink share and the weakest part's coverage of [outline] against [ink].
/// "Parts" are the edges of a polygon, or the four quarters of an oval: every side of a real
/// shape has ink along it, which an A (no base) or a C (open side) does not.
(double, double, double, double) _score(List<Offset> ink, List<Offset> outline, double size, double tol, {bool oval = false, double minor = double.infinity}) {
  var sum = 0.0;
  var stray = 0;
  // Ink well inside (or outside) the outline: loops and crossbars of letters.
  final strayAt = math.min(size * 0.14, minor * FitTuning.strayMinor);
  for (final p in ink) {
    final d = _distToOutline(p, outline, true);
    sum += d;
    if (d > strayAt) stray++;
  }
  bool near(Offset s) {
    for (final p in ink) {
      if ((p - s).distance < tol) return true;
    }
    return false;
  }

  final n = outline.length;
  var covered = 0, total = 0;
  var weakest = 1.0;
  if (oval) {
    final hits = [for (final v in outline) near(v)];
    for (var q = 0; q < 4; q++) {
      final part = hits.sublist(q * n ~/ 4, (q + 1) * n ~/ 4);
      weakest = math.min(weakest, part.where((h) => h).length / part.length);
    }
    covered = hits.where((h) => h).length;
    total = n;
  } else {
    for (var i = 0; i < n; i++) {
      final a = outline[i], b = outline[(i + 1) % n];
      final m = math.max(4, ((b - a).distance / (size / 24)).ceil());
      var c = 0;
      for (var k = 0; k <= m; k++) {
        if (near(Offset.lerp(a, b, k / m)!)) c++;
      }
      covered += c;
      total += m + 1;
      weakest = math.min(weakest, c / (m + 1));
    }
  }
  return (sum / ink.length / size, covered / total, stray / ink.length, weakest);
}

double _perimeter(List<Offset> p) {
  var l = 0.0;
  for (var i = 1; i < p.length; i++) {
    l += (p[i] - p[i - 1]).distance;
  }
  if (p.length > 2) l += (p.first - p.last).distance;
  return l;
}

double _angleDeg(Offset a, Offset b, Offset c) {
  final u = a - b, v = c - b;
  final cos = (u.dx * v.dx + u.dy * v.dy) / (u.distance * v.distance);
  return math.acos(cos.clamp(-1.0, 1.0)) * 180 / math.pi;
}

// --- Fitting --------------------------------------------------------------------------------

/// Selection thresholds, tuned on real drawings in the KINETIX prototype. [complexity] is the
/// error a candidate must beat per extra corner: the simplest shape that explains the ink wins.
abstract final class FitTuning {
  static const maxError = 0.05;
  static const minCoverage = 0.85;
  static const maxStray = 0.1;
  static const complexity = 0.02;
  static const minFlat = 0.2;
  static const minPart = 0.5;
  static const strayMinor = 0.3;
  static const quadRightAngle = 20.0;
}

class _Cand {
  _Cand(this.fit, this.coverage, this.stray, this.complexity, this.weakest);
  final Fit fit;
  final double coverage, stray, complexity, weakest;
  double get error => fit.error;
}

/// Every closed-shape reading of [strokes] with its scores (no thresholds).
List<_Cand> _closedCandidates(List<List<Offset>> strokes) {
  final raw = [for (final s in strokes) ...s];
  if (raw.length < 3) return const [];
  final box = boundsOfPoints(raw);
  final size = math.max(box.width, box.height);
  if (size < 8) return const [];
  final ink = [for (final s in strokes) ...resampleBy(s, size / 48)];
  if (ink.length < 10) return const [];
  final hull = convexHull(ink);
  if (hull.length < 3) return const [];
  final (rect, angle) = minAreaRect(hull);
  final w = (rect[1] - rect[0]).distance, h = (rect[3] - rect[0]).distance;
  // Nearly flat ink is a line or a letter, never a closed shape.
  if (w <= 0 || h <= 0 || math.min(w, h) < math.max(w, h) * FitTuning.minFlat) return const [];
  final tol = math.min(size * 0.07, math.min(w, h) * 0.25);

  final out = <_Cand>[];
  void add(FitKind kind, List<Offset> outline, double complexity, {Rect? oval}) {
    if (outline.length < 2) return;
    final round = kind == FitKind.circle || kind == FitKind.ellipse;
    final (e, cov, stray, weakest) = _score(ink, outline, size, tol, oval: round, minor: math.min(w, h));
    out.add(_Cand(Fit(kind, outline, e, cov, oval: oval), cov, stray, complexity, weakest));
  }

  final centre = (rect[0] + rect[2]) / 2;
  final aspect = math.max(w, h) / math.min(w, h);
  if (aspect < 1.4) {
    final r = (w + h) / 4;
    add(
      FitKind.circle,
      _ovalOutline(centre, r, r, 0),
      0,
      oval: Rect.fromCircle(center: centre, radius: r),
    );
  }
  add(FitKind.ellipse, _ovalOutline(centre, w / 2, h / 2, angle), 0.5);
  add(FitKind.rectangle, rect, 1);
  final small = hull.length > 24 ? simplifyTo(hull, 24) : hull;
  var bestTri = <Offset>[];
  var bestArea = 0.0;
  for (var i = 0; i < small.length; i++) {
    for (var j = i + 1; j < small.length; j++) {
      for (var k = j + 1; k < small.length; k++) {
        final a = polygonArea([small[i], small[j], small[k]]);
        if (a > bestArea) {
          bestArea = a;
          bestTri = [small[i], small[j], small[k]];
        }
      }
    }
  }
  add(FitKind.triangle, bestTri, 1);
  if (hull.length >= 4) add(FitKind.quad, simplifyTo(hull, 4), 2);
  for (var k = 5; k <= 8; k++) {
    if (hull.length >= k) add(FitKind.polygon, simplifyTo(hull, k), k - 2.0);
  }
  return out;
}

bool _acceptable(_Cand c) =>
    c.error <= FitTuning.maxError && c.coverage >= FitTuning.minCoverage && c.stray <= FitTuning.maxStray && c.weakest >= FitTuning.minPart;

/// The best closed shape for [strokes], or null when nothing fits well: among candidates that
/// explain the ink, the simplest wins unless a more complex one is clearly better.
Fit? fitClosed(List<List<Offset>> strokes) {
  final ok = _closedCandidates(strokes).where(_acceptable).toList();
  if (ok.isEmpty) return null;
  ok.sort((a, b) => (a.error + a.complexity * FitTuning.complexity).compareTo(b.error + b.complexity * FitTuning.complexity));
  final best = ok.first;
  if (best.fit.isOval) {
    // A hexagon is nearly round, but its corners are sharp: a figure that hugs the ink far more
    // closely than the oval wins.
    final corners = ok.where((c) => !c.fit.isOval && c.error < best.error * 0.45).firstOrNull;
    if (corners != null) return tidyFit(corners.fit);
  }
  return tidyFit(best.fit);
}

/// A straight line through the ink, or null.
Fit? fitLine(List<List<Offset>> strokes) {
  final raw = [for (final s in strokes) ...s];
  if (raw.length < 2) return null;
  final box = boundsOfPoints(raw);
  final size = math.max(box.width, box.height);
  if (size < 8) return null;
  final ink = [for (final s in strokes) ...resampleBy(s, size / 40)];
  // The principal direction.
  final m = ink.reduce((a, b) => a + b) / ink.length.toDouble();
  var sxx = 0.0, sxy = 0.0, syy = 0.0;
  for (final p in ink) {
    final d = p - m;
    sxx += d.dx * d.dx;
    sxy += d.dx * d.dy;
    syy += d.dy * d.dy;
  }
  final ang = 0.5 * math.atan2(2 * sxy, sxx - syy);
  final dir = Offset(math.cos(ang), math.sin(ang));
  var lo = double.infinity, hi = -double.infinity, off = 0.0;
  final bins = List.filled(20, false);
  final proj = <double>[];
  for (final p in ink) {
    final d = p - m;
    final t = d.dx * dir.dx + d.dy * dir.dy;
    proj.add(t);
    lo = math.min(lo, t);
    hi = math.max(hi, t);
    off += (d.dx * -dir.dy + d.dy * dir.dx).abs();
  }
  final len = hi - lo;
  if (len < size * 0.9) return null;
  for (final t in proj) {
    bins[((t - lo) / len * 19.999).floor()] = true;
  }
  final e = off / ink.length / len;
  final cov = bins.where((b) => b).length / bins.length;
  if (e > 0.035 || cov < 0.9) return null;
  var a = m + dir * lo, b = m + dir * hi;
  // Level and upright lines snap straight.
  final deg = (ang * 180 / math.pi) % 180;
  if (deg.abs() < 5 || (deg - 180).abs() < 5) {
    a = Offset(a.dx, m.dy);
    b = Offset(b.dx, m.dy);
  } else if ((deg - 90).abs() < 5) {
    a = Offset(m.dx, a.dy);
    b = Offset(m.dx, b.dy);
  }
  // Keep the direction it was drawn in (an arrow's head is where the pen ended).
  final first = strokes.first.first;
  if ((first - b).distance < (first - a).distance) (a, b) = (b, a);
  return Fit(FitKind.line, [a, b], e, cov);
}

/// Squares things up the way a teacher expects: level edges, true squares and right angles,
/// regular polygons.
Fit tidyFit(Fit f) {
  switch (f.kind) {
    case FitKind.circle || FitKind.square || FitKind.line:
      return f;
    case FitKind.ellipse:
      // Level (or upright) ellipses become true ovals.
      final o = f.outline;
      final c = o.reduce((a, b) => a + b) / o.length.toDouble();
      final a = (o[0] - c).distance, b = (o[o.length ~/ 4] - c).distance;
      final dir = o[0] - c;
      final deg = (math.atan2(dir.dy, dir.dx) * 180 / math.pi) % 180;
      if (deg.abs() < 10 || (deg - 180).abs() < 10) {
        return Fit(
          f.kind,
          o,
          f.error,
          f.coverage,
          oval: Rect.fromCenter(center: c, width: 2 * a, height: 2 * b),
        );
      }
      if ((deg - 90).abs() < 10) {
        return Fit(
          f.kind,
          o,
          f.error,
          f.coverage,
          oval: Rect.fromCenter(center: c, width: 2 * b, height: 2 * a),
        );
      }
      return f;
    case FitKind.rectangle:
      var r = f.outline;
      final e = r[1] - r[0];
      final deg = (math.atan2(e.dy, e.dx) * 180 / math.pi) % 90;
      final w = (r[1] - r[0]).distance, h = (r[3] - r[0]).distance;
      final c = (r[0] + r[2]) / 2;
      if (deg < 10 || deg > 80) {
        final aw = deg < 10 ? w : h, ah = deg < 10 ? h : w;
        final b = Rect.fromCenter(center: c, width: aw, height: ah);
        r = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
      }
      if (math.max(w, h) / math.min(w, h) < 1.14) {
        // A square (a turned square is a "diamond").
        final s = (w + h) / 2;
        final ang = deg < 10 || deg > 80 ? 0.0 : math.atan2(e.dy, e.dx);
        final ca = math.cos(ang), sa = math.sin(ang);
        Offset at(double x, double y) => c + Offset(x * ca - y * sa, x * sa + y * ca);
        return Fit(FitKind.square, [at(-s / 2, -s / 2), at(s / 2, -s / 2), at(s / 2, s / 2), at(-s / 2, s / 2)], f.error, f.coverage);
      }
      return Fit(FitKind.rectangle, r, f.error, f.coverage);
    case FitKind.triangle:
      final t = List.of(f.outline);
      // Level a nearly flat side; stand a nearly upright one straight.
      for (var i = 0; i < 3; i++) {
        final a = t[i], b = t[(i + 1) % 3];
        final d = b - a;
        final deg = (math.atan2(d.dy, d.dx) * 180 / math.pi).abs() % 180;
        if (deg < 7 || deg > 173) {
          final y = (a.dy + b.dy) / 2;
          t[i] = Offset(a.dx, y);
          t[(i + 1) % 3] = Offset(b.dx, y);
        } else if ((deg - 90).abs() < 7) {
          final x = (a.dx + b.dx) / 2;
          t[i] = Offset(x, a.dy);
          t[(i + 1) % 3] = Offset(x, b.dy);
        }
      }
      return Fit(FitKind.triangle, t, f.error, f.coverage);
    case FitKind.quad:
      final q = f.outline;
      // A triangle with a blunt or doubled corner.
      final perim = _perimeter(q);
      for (var i = 0; i < 4; i++) {
        final angle = _angleDeg(q[(i + 3) % 4], q[i], q[(i + 1) % 4]);
        final side = (q[(i + 1) % 4] - q[i]).distance;
        if (angle > 150) {
          return tidyFit(
            Fit(
              FitKind.triangle,
              [
                for (var k = 0; k < 4; k++)
                  if (k != i) q[k],
              ],
              f.error,
              f.coverage,
            ),
          );
        }
        if (side < perim * 0.08) {
          final merged = (q[i] + q[(i + 1) % 4]) / 2;
          return tidyFit(
            Fit(
              FitKind.triangle,
              [
                for (var k = 0; k < 4; k++)
                  if (k == i) merged else if (k != (i + 1) % 4) q[k],
              ],
              f.error,
              f.coverage,
            ),
          );
        }
      }
      // Nearly right angles everywhere: a rectangle after all.
      final (box, _) = minAreaRect(q);
      final fill = polygonArea(q) / math.max(1e-9, polygonArea(box));
      final right = [for (var i = 0; i < 4; i++) _angleDeg(q[(i + 3) % 4], q[i], q[(i + 1) % 4])].every((a) => (a - 90).abs() < FitTuning.quadRightAngle);
      if (fill > 0.9 || right) return tidyFit(Fit(FitKind.rectangle, box, f.error, f.coverage));
      return f;
    case FitKind.polygon:
      final p = f.outline;
      final c = p.reduce((a, b) => a + b) / p.length.toDouble();
      final radii = [for (final v in p) (v - c).distance];
      final rMean = radii.reduce((a, b) => a + b) / radii.length;
      if (!radii.every((r) => (r - rMean).abs() < rMean * 0.16)) return f;
      final a0 = math.atan2((p[0] - c).dy, (p[0] - c).dx);
      final n = p.length;
      // A regular polygon, turned so a side sits flat when it nearly does.
      final flat = -math.pi / 2 + math.pi / n;
      final rot = ((a0 - flat) % (2 * math.pi / n)).abs() < 0.12 ? flat : a0;
      return Fit(
        FitKind.polygon,
        [for (var i = 0; i < n; i++) c + Offset(math.cos(rot + 2 * math.pi * i / n), math.sin(rot + 2 * math.pi * i / n)) * rMean],
        f.error,
        f.coverage,
      );
  }
}
