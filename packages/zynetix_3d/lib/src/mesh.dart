import 'dart:math' as math;
import 'dart:typed_data';

import 'math3d.dart';

/// Triangle geometry: flat arrays so the renderer can walk them without allocating.
///
/// Triangles wind counter-clockwise when seen from outside (the front face).
class Mesh {
  Mesh({required this.positions, required this.indices, this.normals, this.vertexColors, this.uvs})
      : assert(positions.length % 3 == 0),
        assert(indices.length % 3 == 0),
        assert(normals == null || normals.length == positions.length),
        assert(vertexColors == null || vertexColors.length * 3 == positions.length),
        assert(uvs == null || uvs.length * 3 == positions.length * 2);

  /// x, y, z per vertex.
  final Float32List positions;

  /// Three vertex indices per triangle.
  final Uint32List indices;

  /// Per-vertex normals for smooth (Gouraud) shading; null means flat shading per face.
  final Float32List? normals;

  /// Optional per-vertex ARGB colours (e.g. continents on the Earth).
  final Int32List? vertexColors;

  /// Optional texture coordinates (u, v in 0–1, v down) for a textured part.
  final Float32List? uvs;

  int get vertexCount => positions.length ~/ 3;
  int get triangleCount => indices.length ~/ 3;

  Vec3 vertex(int i) => Vec3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

  List<Edge>? _edges;

  /// Edges shared by two triangles whose normals differ by more than ~25°, plus open
  /// boundaries. Computed once, by vertex position so split vertices (a cylinder's rim, a
  /// cube's corners) still join up. Used for the textbook-style outline.
  List<Edge> get featureEdges => _edges ??= _computeEdges(0.9);

  /// Every edge with its two faces, used for silhouettes of curved solids.
  List<Edge>? _allEdges;
  List<Edge> get allEdges => _allEdges ??= _computeEdges(2);

  List<Edge> _computeEdges(double cosThreshold) {
    // Weld vertices by quantised position.
    final keyOf = <String, int>{};
    final weld = Int32List(vertexCount);
    for (var i = 0; i < vertexCount; i++) {
      final k = '${(positions[i * 3] * 1e4).round()},${(positions[i * 3 + 1] * 1e4).round()},${(positions[i * 3 + 2] * 1e4).round()}';
      weld[i] = keyOf.putIfAbsent(k, () => i);
    }
    final faceNormals = List<Vec3>.generate(triangleCount, (t) {
      final a = vertex(indices[t * 3]), b = vertex(indices[t * 3 + 1]), c = vertex(indices[t * 3 + 2]);
      return (b - a).cross(c - a).normalized;
    });
    final map = <int, List<int>>{}; // edge key -> [a, b, face1, face2]
    for (var t = 0; t < triangleCount; t++) {
      for (var e = 0; e < 3; e++) {
        final a = weld[indices[t * 3 + e]], b = weld[indices[t * 3 + (e + 1) % 3]];
        if (a == b) continue;
        final lo = math.min(a, b), hi = math.max(a, b);
        final key = lo * 0x100000 + hi;
        final rec = map[key];
        if (rec == null) {
          map[key] = [lo, hi, t, -1];
        } else if (rec[3] == -1) {
          rec[3] = t;
        }
      }
    }
    final out = <Edge>[];
    for (final r in map.values) {
      final boundary = r[3] < 0;
      final feature = boundary || faceNormals[r[2]].dot(faceNormals[r[3]]) < cosThreshold;
      if (cosThreshold > 1 || feature) out.add(Edge(r[0], r[1], r[2], r[3], feature: feature));
    }
    return out;
  }
}

/// An edge between vertices [a] and [b], shared by faces [f1] and [f2] (−1 at a boundary).
class Edge {
  const Edge(this.a, this.b, this.f1, this.f2, {this.feature = true});
  final int a, b, f1, f2;
  final bool feature;
}

/// Accumulates vertices and triangles, then produces a [Mesh].
class MeshBuilder {
  final _p = <double>[];
  final _n = <double>[];
  final _c = <int>[];
  final _i = <int>[];
  final _uv = <double>[];
  bool _hasNormals = false, _hasColors = false, _hasUvs = false;

  int get vertexCount => _p.length ~/ 3;

  int addVertex(Vec3 p, {Vec3? normal, int? color, double? u, double? v}) {
    _p.addAll([p.x, p.y, p.z]);
    if (u != null) _hasUvs = true;
    _uv.addAll([u ?? 0, v ?? 0]);
    if (normal != null) _hasNormals = true;
    final n = normal ?? Vec3.zero;
    _n.addAll([n.x, n.y, n.z]);
    if (color != null) _hasColors = true;
    _c.add(color ?? 0xFFFFFFFF);
    return vertexCount - 1;
  }

  void addTriangle(int a, int b, int c) => _i.addAll([a, b, c]);

  void addQuad(int a, int b, int c, int d) {
    addTriangle(a, b, c);
    addTriangle(a, c, d);
  }

  /// A flat polygon (convex, counter-clockwise from the front) with its own vertices.
  void addPolygon(List<Vec3> pts) {
    final base = vertexCount;
    for (final p in pts) {
      addVertex(p);
    }
    for (var k = 1; k < pts.length - 1; k++) {
      addTriangle(base, base + k, base + k + 1);
    }
  }

  /// Appends another mesh with a transform.
  void addMesh(Mesh m, [Mat4? transform]) {
    final base = vertexCount;
    for (var v = 0; v < m.vertexCount; v++) {
      final p = transform == null ? m.vertex(v) : transform.transformPoint(m.vertex(v));
      Vec3? n;
      if (m.normals != null) {
        n = Vec3(m.normals![v * 3], m.normals![v * 3 + 1], m.normals![v * 3 + 2]);
        if (transform != null) n = transform.transformDirection(n).normalized;
      }
      addVertex(p, normal: n, color: m.vertexColors?[v]);
    }
    for (final i in m.indices) {
      _i.add(base + i);
    }
  }

  Mesh build({bool smooth = true}) => Mesh(
        positions: Float32List.fromList(_p),
        indices: Uint32List.fromList(_i),
        normals: smooth && _hasNormals ? Float32List.fromList(_n) : null,
        vertexColors: _hasColors ? Int32List.fromList(_c) : null,
        uvs: _hasUvs ? Float32List.fromList(_uv) : null,
      );
}
