import 'dart:math' as math;
import 'dart:typed_data';

import 'codebook.dart';

/// A card found in a photo: its number, the answer held on top, and where
/// its corners are in the photo (clockwise from top-left).
class CardSeen {
  final int card;
  final int choice;
  final int errors;
  final List<(double, double)> corners;
  const CardSeen(this.card, this.choice, this.errors, this.corners);
}

/// A photo for the reader: grey levels (0 black … 255 white), row by row.
class GreyImage {
  final Uint8List pixels;
  final int width, height;
  const GreyImage(this.pixels, this.width, this.height);

  /// From RGBA bytes (as `toByteData(format: rawRgba)` gives them).
  factory GreyImage.fromRgba(Uint8List rgba, int width, int height) {
    final g = Uint8List(width * height);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = ((rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8);
    }
    return GreyImage(g, width, height);
  }
}

/// Every answer card in [img]. Pure Dart, safe to run in an isolate.
List<CardSeen> scanCards(GreyImage img) {
  final w = img.width, h = img.height, g = img.pixels;
  if (w < 16 || h < 16) return const [];

  // 1. Dark pixels: darker than their neighbourhood (light that falls
  // unevenly across a classroom), or simply very dark.
  final iw = w + 1;
  final integral = Float64List(iw * (h + 1));
  for (var y = 0; y < h; y++) {
    var row = 0.0;
    for (var x = 0; x < w; x++) {
      row += g[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
    }
  }
  final half = math.max(8, math.min(w, h) ~/ 24);
  final dark = Uint8List(w * h);
  for (var y = 0; y < h; y++) {
    final y0 = math.max(0, y - half), y1 = math.min(h, y + half + 1);
    for (var x = 0; x < w; x++) {
      final x0 = math.max(0, x - half), x1 = math.min(w, x + half + 1);
      final count = (x1 - x0) * (y1 - y0);
      final sum = integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0];
      final v = g[y * w + x];
      if (v * count < sum - 12 * count || v < 45) dark[y * w + x] = 1;
    }
  }

  // 2. Connected dark regions; keep the outline of each plausible one.
  final label = Uint8List(w * h);
  final stack = <int>[];
  final found = <CardSeen>[];
  final minSide = 14, maxSide = (math.min(w, h) * 0.8).round();
  for (var start = 0; start < w * h; start++) {
    if (dark[start] == 0 || label[start] != 0) continue;
    var minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    final edge = <int>[];
    stack
      ..clear()
      ..add(start);
    label[start] = 1;
    while (stack.isNotEmpty) {
      final p = stack.removeLast();
      final x = p % w, y = p ~/ w;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      var boundary = false;
      void visit(int q, bool inside) {
        if (!inside || dark[q] == 0) {
          boundary = true;
          return;
        }
        if (label[q] == 0) {
          label[q] = 1;
          stack.add(q);
        }
      }

      visit(p - 1, x > 0);
      visit(p + 1, x < w - 1);
      visit(p - w, y > 0);
      visit(p + w, y < h - 1);
      if (boundary) edge.add(p);
    }
    final bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
    if (bw > bh * 4 || bh > bw * 4) continue;
    final seen = _readCandidate(img, edge, count);
    if (seen != null) found.add(seen);
  }

  // 3. One answer per card: the clearest reading.
  final best = <int, CardSeen>{};
  for (final s in found) {
    final had = best[s.card];
    if (had == null || s.errors < had.errors) best[s.card] = s;
  }
  return best.values.toList()..sort((a, b) => a.card.compareTo(b.card));
}

CardSeen? _readCandidate(GreyImage img, List<int> edge, int count) {
  final w = img.width;
  // Convex hull of the outline (thinned when long).
  final step = math.max(1, edge.length ~/ 1500);
  final pts = <(double, double)>[for (var i = 0; i < edge.length; i += step) ((edge[i] % w).toDouble(), (edge[i] ~/ w).toDouble())];
  final hull = _hull(pts);
  if (hull.length < 4) return null;
  final quad = _quadFromHull(hull);
  if (quad == null) return null;
  final area = _area(quad);
  if (area < 14 * 14) return null;
  // The border and black cells cover part of the box, never all or little.
  final fill = count / area;
  if (fill < 0.2 || fill > 0.95) return null;
  final sides = [for (var i = 0; i < 4; i++) _dist(quad[i], quad[(i + 1) % 4])];
  if (sides.reduce(math.max) > sides.reduce(math.min) * 2.6) return null;

  final hmat = _homography(quad);
  if (hmat == null) return null;
  // Grey level of each of the 7×7 cells (3×3 samples near its centre).
  final cells = List<double>.filled(cardGrid * cardGrid, 0);
  for (var r = 0; r < cardGrid; r++) {
    for (var k = 0; k < cardGrid; k++) {
      var sum = 0.0;
      var n = 0;
      for (final dv in const [-0.22, 0.0, 0.22]) {
        for (final du in const [-0.22, 0.0, 0.22]) {
          final (x, y) = _apply(hmat, k + 0.5 + du, r + 0.5 + dv);
          final xi = x.round(), yi = y.round();
          if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) continue;
          sum += img.pixels[yi * img.width + xi];
          n++;
        }
      }
      if (n == 0) return null;
      cells[r * cardGrid + k] = sum / n;
    }
  }
  // Two groups of grey (ink and paper); the line between them.
  var lo = cells.reduce(math.min), hi = cells.reduce(math.max);
  if (hi - lo < 35) return null;
  var thr = (lo + hi) / 2;
  for (var it = 0; it < 6; it++) {
    var sd = 0.0, nd = 0, sl = 0.0, nl = 0;
    for (final c in cells) {
      if (c < thr) {
        sd += c;
        nd++;
      } else {
        sl += c;
        nl++;
      }
    }
    if (nd == 0 || nl == 0) return null;
    lo = sd / nd;
    hi = sl / nl;
    thr = (lo + hi) / 2;
  }
  // The border must be black all round (allow two misreads).
  var borderDark = 0;
  for (var r = 0; r < cardGrid; r++) {
    for (var k = 0; k < cardGrid; k++) {
      if (r == 0 || k == 0 || r == cardGrid - 1 || k == cardGrid - 1) {
        if (cells[r * cardGrid + k] < thr) borderDark++;
      }
    }
  }
  if (borderDark < 22) return null;
  var bits = 0;
  for (var r = 1; r < cardGrid - 1; r++) {
    for (var k = 1; k < cardGrid - 1; k++) {
      if (cells[r * cardGrid + k] < thr) bits |= 1 << ((r - 1) * 5 + (k - 1));
    }
  }
  final d = decodeCardBits(bits);
  if (d == null) return null;
  return CardSeen(d.card, d.choice, d.errors, quad);
}

double _dist((double, double) a, (double, double) b) => math.sqrt((a.$1 - b.$1) * (a.$1 - b.$1) + (a.$2 - b.$2) * (a.$2 - b.$2));

double _cross((double, double) o, (double, double) a, (double, double) b) => (a.$1 - o.$1) * (b.$2 - o.$2) - (a.$2 - o.$2) * (b.$1 - o.$1);

List<(double, double)> _hull(List<(double, double)> points) {
  final p = [...points]..sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  if (p.length < 3) return p;
  final lower = <(double, double)>[];
  for (final q in p) {
    while (lower.length >= 2 && _cross(lower[lower.length - 2], lower.last, q) <= 0) {
      lower.removeLast();
    }
    lower.add(q);
  }
  final upper = <(double, double)>[];
  for (final q in p.reversed) {
    while (upper.length >= 2 && _cross(upper[upper.length - 2], upper.last, q) <= 0) {
      upper.removeLast();
    }
    upper.add(q);
  }
  return [...lower.sublist(0, lower.length - 1), ...upper.sublist(0, upper.length - 1)];
}

/// The four corners of a square seen in perspective, from its hull: the two
/// farthest points, then the farthest on each side of the line between
/// them. Clockwise on the photo, starting top-left.
List<(double, double)>? _quadFromHull(List<(double, double)> hull) {
  var best = -1.0;
  var ia = 0, ib = 0;
  for (var i = 0; i < hull.length; i++) {
    for (var j = i + 1; j < hull.length; j++) {
      final d = _dist(hull[i], hull[j]);
      if (d > best) {
        best = d;
        ia = i;
        ib = j;
      }
    }
  }
  final a = hull[ia], b = hull[ib];
  (double, double)? c, d;
  var dc = 0.0, dd = 0.0;
  for (final p in hull) {
    final s = _cross(a, b, p);
    if (s > dc) {
      dc = s;
      c = p;
    } else if (-s > dd) {
      dd = -s;
      d = p;
    }
  }
  if (c == null || d == null) return null;
  // Both other corners well away from the diagonal (a square, not a bar).
  if (dc / best < best * 0.25 || dd / best < best * 0.25) return null;
  final quad = [a, c, b, d];
  final cx = quad.map((q) => q.$1).reduce((x, y) => x + y) / 4;
  final cy = quad.map((q) => q.$2).reduce((x, y) => x + y) / 4;
  double ang((double, double) q) => math.atan2(q.$2 - cy, q.$1 - cx);
  // Increasing angle on a photo (y down) goes clockwise.
  quad.sort((p, q) => ang(p).compareTo(ang(q)));
  // Start at the corner nearest the top-left direction (-135°).
  var start = 0;
  var bestOff = double.infinity;
  for (var i = 0; i < 4; i++) {
    var off = (ang(quad[i]) + 3 * math.pi / 4).abs();
    if (off > math.pi) off = 2 * math.pi - off;
    if (off < bestOff) {
      bestOff = off;
      start = i;
    }
  }
  return [for (var i = 0; i < 4; i++) quad[(start + i) % 4]];
}

double _area(List<(double, double)> q) {
  var s = 0.0;
  for (var i = 0; i < q.length; i++) {
    final a = q[i], b = q[(i + 1) % q.length];
    s += a.$1 * b.$2 - b.$1 * a.$2;
  }
  return s.abs() / 2;
}

/// The perspective map from grid units (0…7 each way) to the photo.
List<double>? _homography(List<(double, double)> quad) {
  const src = [(0.0, 0.0), (7.0, 0.0), (7.0, 7.0), (0.0, 7.0)];
  // Solve for h0…h7 (h8 = 1) in the usual 8×8 system.
  final m = List.generate(8, (_) => List<double>.filled(9, 0));
  for (var i = 0; i < 4; i++) {
    final (u, v) = src[i];
    final (x, y) = quad[i];
    m[2 * i] = [u, v, 1, 0, 0, 0, -u * x, -v * x, x];
    m[2 * i + 1] = [0, 0, 0, u, v, 1, -u * y, -v * y, y];
  }
  for (var col = 0; col < 8; col++) {
    var pivot = col;
    for (var r = col + 1; r < 8; r++) {
      if (m[r][col].abs() > m[pivot][col].abs()) pivot = r;
    }
    if (m[pivot][col].abs() < 1e-9) return null;
    final tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    for (var r = 0; r < 8; r++) {
      if (r == col) continue;
      final f = m[r][col] / m[col][col];
      for (var k = col; k < 9; k++) {
        m[r][k] -= f * m[col][k];
      }
    }
  }
  return [for (var i = 0; i < 8; i++) m[i][8] / m[i][i], 1];
}

(double, double) _apply(List<double> hm, double u, double v) {
  final z = hm[6] * u + hm[7] * v + hm[8];
  return ((hm[0] * u + hm[1] * v + hm[2]) / z, (hm[3] * u + hm[4] * v + hm[5]) / z);
}
