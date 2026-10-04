import 'dart:math' as math;

import 'math3d.dart';
import 'mesh.dart';

/// Procedural meshes. Every solid is centred on the y axis with y pointing up.
abstract final class Primitives {
  /// A UV sphere with smooth normals. [colorAt] gets latitude and longitude in degrees and
  /// returns an ARGB colour, for per-vertex colouring (the Earth).
  static Mesh sphere(double r, {Vec3 center = Vec3.zero, int segments = 32, int rings = 16, int Function(double lat, double lon)? colorAt}) {
    final b = MeshBuilder();
    for (var j = 0; j <= rings; j++) {
      final v = j / rings;
      final phi = v * math.pi; // 0 at north pole
      for (var i = 0; i <= segments; i++) {
        final u = i / segments;
        final theta = u * 2 * math.pi;
        final n = Vec3(math.sin(phi) * math.cos(theta), math.cos(phi), -math.sin(phi) * math.sin(theta));
        final lat = 90 - v * 180, lon = u * 360 - 180;
        b.addVertex(center + n * r, normal: n, color: colorAt?.call(lat, lon));
      }
    }
    final row = segments + 1;
    for (var j = 0; j < rings; j++) {
      for (var i = 0; i < segments; i++) {
        final a = j * row + i, c = (j + 1) * row + i;
        if (j != 0) b.addTriangle(a, c, a + 1);
        if (j != rings - 1) b.addTriangle(a + 1, c, c + 1);
      }
    }
    return b.build();
  }

  /// Upper half of a sphere with its flat circular base on y = 0.
  static Mesh hemisphere(double r, {int segments = 48, int rings = 12, bool base = true}) {
    final b = MeshBuilder();
    for (var j = 0; j <= rings; j++) {
      final phi = j / rings * math.pi / 2;
      for (var i = 0; i <= segments; i++) {
        final theta = i / segments * 2 * math.pi;
        final n = Vec3(math.sin(phi) * math.cos(theta), math.cos(phi), -math.sin(phi) * math.sin(theta));
        b.addVertex(n * r, normal: n);
      }
    }
    final row = segments + 1;
    for (var j = 0; j < rings; j++) {
      for (var i = 0; i < segments; i++) {
        final a = j * row + i, c = (j + 1) * row + i;
        if (j != 0) b.addTriangle(a, c, a + 1);
        b.addTriangle(a + 1, c, c + 1);
      }
    }
    if (base) _disk(b, 0, r, segments, down: true);
    return b.build();
  }

  /// A surface of revolution about the y axis through the profile points (radius, y),
  /// listed bottom to top, with flat caps where the radius at an end is above zero.
  static Mesh lathe(List<(double, double)> profile, {int segments = 48, bool caps = true}) {
    final b = MeshBuilder();
    for (var k = 0; k < profile.length - 1; k++) {
      final (r0, y0) = profile[k];
      final (r1, y1) = profile[k + 1];
      // Normal of the slanted side in the (radial, y) plane.
      final dr = r1 - r0, dy = y1 - y0;
      final len = math.sqrt(dr * dr + dy * dy);
      final nr = dy / len, ny = -dr / len;
      final base = b.vertexCount;
      for (var i = 0; i <= segments; i++) {
        final t = i / segments * 2 * math.pi;
        final cx = math.cos(t), cz = -math.sin(t);
        final n = Vec3(nr * cx, ny, nr * cz);
        b.addVertex(Vec3(r0 * cx, y0, r0 * cz), normal: n);
        b.addVertex(Vec3(r1 * cx, y1, r1 * cz), normal: n);
      }
      for (var i = 0; i < segments; i++) {
        final a = base + i * 2;
        if (r0 > 0) b.addTriangle(a, a + 2, a + 1);
        if (r1 > 0) b.addTriangle(a + 1, a + 2, a + 3);
      }
    }
    if (caps) {
      final (rb, yb) = profile.first;
      final (rt, yt) = profile.last;
      if (rb > 0) _disk(b, yb, rb, segments, down: true);
      if (rt > 0) _disk(b, yt, rt, segments, down: false);
    }
    return b.build();
  }

  /// A flat disk of radius [r] at height [y], facing up (or down).
  static Mesh disk(double r, {double y = 0, bool down = false, int segments = 48}) {
    final b = MeshBuilder();
    _disk(b, y, r, segments, down: down);
    return b.build();
  }

  static void _disk(MeshBuilder b, double y, double r, int segments, {required bool down}) {
    final n = down ? const Vec3(0, -1, 0) : Vec3.unitY;
    final c = b.addVertex(Vec3(0, y, 0), normal: n);
    final first = b.vertexCount;
    for (var i = 0; i <= segments; i++) {
      final t = i / segments * 2 * math.pi;
      b.addVertex(Vec3(r * math.cos(t), y, -r * math.sin(t)), normal: n);
    }
    for (var i = 0; i < segments; i++) {
      if (down) {
        b.addTriangle(c, first + i + 1, first + i);
      } else {
        b.addTriangle(c, first + i, first + i + 1);
      }
    }
  }

  static Mesh cylinder(double r, double h, {int segments = 48}) => lathe([(r, 0), (r, h)], segments: segments);

  static Mesh cone(double r, double h, {int segments = 48}) => lathe([(r, 0), (0, h)], segments: segments);

  static Mesh frustum(double rBottom, double rTop, double h, {int segments = 48}) =>
      lathe([(rBottom, 0), (rTop, h)], segments: segments);

  /// A flat-shaded box from (0,0,0)-centred base: x in ±w/2, y in 0..h, z in ±d/2.
  static Mesh box(double w, double h, double d) {
    final x = w / 2, z = d / 2;
    return prism([Vec3(-x, 0, z), Vec3(x, 0, z), Vec3(x, 0, -z), Vec3(-x, 0, -z)], h);
  }

  /// A right prism over a convex base polygon in the y = 0 plane, listed counter-clockwise
  /// when seen from above.
  static Mesh prism(List<Vec3> base, double h) {
    final b = MeshBuilder();
    final top = [for (final p in base) p + Vec3(0, h, 0)];
    b.addPolygon(top);
    b.addPolygon(base.reversed.toList());
    for (var i = 0; i < base.length; i++) {
      final j = (i + 1) % base.length;
      b.addPolygon([base[i], base[j], top[j], top[i]]);
    }
    return b.build(smooth: false);
  }

  /// A pyramid over a convex base polygon (counter-clockwise from above) up to [apex].
  static Mesh pyramid(List<Vec3> base, Vec3 apex) {
    final b = MeshBuilder();
    b.addPolygon(base.reversed.toList());
    for (var i = 0; i < base.length; i++) {
      b.addPolygon([base[i], base[(i + 1) % base.length], apex]);
    }
    return b.build(smooth: false);
  }

  /// A cylinder (with caps) whose axis runs from [a] to [b]. Used for bonds and axes.
  static Mesh rod(Vec3 a, Vec3 b, double radius, {int segments = 16, int slices = 1}) {
    final axis = b - a;
    final len = axis.length;
    final u = axis.anyPerpendicular, v = axis.normalized.cross(u);
    final mb = MeshBuilder();
    final dir = axis / len;
    for (var s = 0; s < slices; s++) {
      final p0 = a + dir * (len * s / slices), p1 = a + dir * (len * (s + 1) / slices);
      final base = mb.vertexCount;
      for (var i = 0; i <= segments; i++) {
        final t = i / segments * 2 * math.pi;
        final n = u * math.cos(t) + v * math.sin(t);
        mb.addVertex(p0 + n * radius, normal: n);
        mb.addVertex(p1 + n * radius, normal: n);
      }
      for (var i = 0; i < segments; i++) {
        final k = base + i * 2;
        mb.addTriangle(k, k + 2, k + 1);
        mb.addTriangle(k + 1, k + 2, k + 3);
      }
    }
    return mb.build();
  }

  /// A flat ring (annulus) in the y = 0 plane facing up. Render it double-sided.
  static Mesh ring(double inner, double outer, {int segments = 64}) {
    final b = MeshBuilder();
    for (var i = 0; i <= segments; i++) {
      final t = i / segments * 2 * math.pi;
      final c = math.cos(t), s = -math.sin(t);
      b.addVertex(Vec3(inner * c, 0, inner * s), normal: Vec3.unitY);
      b.addVertex(Vec3(outer * c, 0, outer * s), normal: Vec3.unitY);
    }
    for (var i = 0; i < segments; i++) {
      final k = i * 2;
      b.addTriangle(k, k + 1, k + 3);
      b.addTriangle(k, k + 3, k + 2);
    }
    return b.build();
  }

  /// A regular polygon's vertices in the y = 0 plane, counter-clockwise from above,
  /// with the first vertex at angle [startDeg].
  static List<Vec3> regularPolygon(int n, double circumradius, {double startDeg = 90}) => [
        for (var i = 0; i < n; i++)
          Vec3(
            circumradius * math.cos((startDeg + 360 * i / n) * math.pi / 180),
            0,
            -circumradius * math.sin((startDeg + 360 * i / n) * math.pi / 180),
          ),
      ];
}
