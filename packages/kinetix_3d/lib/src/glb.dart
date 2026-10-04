import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'math3d.dart';
import 'mesh.dart';
import 'model.dart';

/// Thrown when bytes are not a glTF 2.0 binary this loader understands.
class GlbFormatException implements Exception {
  GlbFormatException(this.message);
  final String message;
  @override
  String toString() => 'GlbFormatException: $message';
}

/// One triangle primitive from a glTF file, already in scene space (node transforms applied).
class GlbPrimitive {
  GlbPrimitive({required this.mesh, required this.color, required this.meshName, required this.nodeName});
  final Mesh mesh;
  final Color color;
  final String? meshName, nodeName;
}

/// A minimal glTF 2.0 binary (.glb) loader for in-house or licensed models.
///
/// Supports: the GLB container (JSON + BIN chunks), buffer views with or without a stride,
/// float POSITION and NORMAL accessors, uint8/16/32 indices (or none), triangle primitives,
/// the node hierarchy with TRS or matrix transforms, and the material base colour factor.
/// Not supported (ignored): textures, skins, morph targets, animations, cameras, sparse
/// accessors, external buffers.
abstract final class GlbLoader {
  static const _magic = 0x46546C67; // "glTF"
  static const _jsonChunk = 0x4E4F534A; // "JSON"
  static const _binChunk = 0x004E4942; // "BIN\0"

  static List<GlbPrimitive> parse(Uint8List bytes) {
    if (bytes.length < 20) throw GlbFormatException('file too short');
    final data = ByteData.sublistView(bytes);
    if (data.getUint32(0, Endian.little) != _magic) throw GlbFormatException('not a GLB file (bad magic)');
    final version = data.getUint32(4, Endian.little);
    if (version != 2) throw GlbFormatException('unsupported glTF version $version');
    final total = data.getUint32(8, Endian.little);
    if (total > bytes.length) throw GlbFormatException('truncated file');

    Map<String, dynamic>? json;
    Uint8List? bin;
    var offset = 12;
    while (offset + 8 <= total) {
      final len = data.getUint32(offset, Endian.little);
      final type = data.getUint32(offset + 4, Endian.little);
      final start = offset + 8;
      if (start + len > total) throw GlbFormatException('chunk overruns file');
      final chunk = Uint8List.sublistView(bytes, start, start + len);
      if (type == _jsonChunk) {
        json = jsonDecode(utf8.decode(chunk)) as Map<String, dynamic>;
      } else if (type == _binChunk && bin == null) {
        bin = chunk;
      }
      offset = start + ((len + 3) & ~3);
    }
    if (json == null) throw GlbFormatException('missing JSON chunk');
    return _Gltf(json, bin).primitives();
  }

  /// Parses and wraps the result as a [Model3D], one selectable part per primitive.
  static Model3D load(Uint8List bytes, {required String title, String caption = '', List<String> subjects = const []}) {
    final prims = parse(bytes);
    return Model3D(
      title: title,
      caption: caption,
      subjects: subjects,
      parts: [
        for (final (i, p) in prims.indexed)
          ModelPart(id: 'prim-$i', mesh: p.mesh, color: p.color, name: p.nodeName ?? p.meshName),
      ],
    );
  }
}

class _Gltf {
  _Gltf(this.j, this.bin);
  final Map<String, dynamic> j;
  final Uint8List? bin;

  List<dynamic> _list(String k) => (j[k] as List<dynamic>?) ?? const [];

  List<GlbPrimitive> primitives() {
    final out = <GlbPrimitive>[];
    final nodes = _list('nodes');
    final scenes = _list('scenes');
    List<int> roots;
    if (scenes.isNotEmpty) {
      final s = scenes[(j['scene'] as int?) ?? 0] as Map<String, dynamic>;
      roots = [for (final n in (s['nodes'] as List<dynamic>? ?? const [])) n as int];
    } else {
      // No scene: every node that is nobody's child is a root.
      final children = {for (final n in nodes) ...(((n as Map<String, dynamic>)['children'] as List<dynamic>?) ?? const []).cast<int>()};
      roots = [for (var i = 0; i < nodes.length; i++) if (!children.contains(i)) i];
    }
    void visit(int index, Mat4 parent, int depth) {
      if (depth > 64) throw GlbFormatException('node hierarchy too deep (cycle?)');
      final node = nodes[index] as Map<String, dynamic>;
      final world = parent * _localMatrix(node);
      final meshIndex = node['mesh'] as int?;
      if (meshIndex != null) out.addAll(_meshPrimitives(meshIndex, world, node['name'] as String?));
      for (final c in (node['children'] as List<dynamic>? ?? const [])) {
        visit(c as int, world, depth + 1);
      }
    }

    for (final r in roots) {
      visit(r, Mat4.identity(), 0);
    }
    return out;
  }

  static Mat4 _localMatrix(Map<String, dynamic> node) {
    final m = node['matrix'] as List<dynamic>?;
    if (m != null) return Mat4.fromList(m.cast<num>());
    List<double> nums(String k, List<double> d) => (node[k] as List<dynamic>?)?.map((e) => (e as num).toDouble()).toList() ?? d;
    final t = nums('translation', [0, 0, 0]);
    final r = nums('rotation', [0, 0, 0, 1]);
    final s = nums('scale', [1, 1, 1]);
    return Mat4.trs(Vec3(t[0], t[1], t[2]), r, Vec3(s[0], s[1], s[2]));
  }

  List<GlbPrimitive> _meshPrimitives(int meshIndex, Mat4 world, String? nodeName) {
    final mesh = _list('meshes')[meshIndex] as Map<String, dynamic>;
    final out = <GlbPrimitive>[];
    for (final p in (mesh['primitives'] as List<dynamic>)) {
      final prim = p as Map<String, dynamic>;
      final mode = (prim['mode'] as int?) ?? 4;
      if (mode != 4) continue; // triangles only
      final attrs = prim['attributes'] as Map<String, dynamic>;
      final posAcc = attrs['POSITION'] as int?;
      if (posAcc == null) continue;
      final pos = _readFloats(posAcc, 3);
      final nrmAcc = attrs['NORMAL'] as int?;
      final nrm = nrmAcc == null ? null : _readFloats(nrmAcc, 3);
      final vcount = pos.length ~/ 3;
      final idxAcc = prim['indices'] as int?;
      final idx = idxAcc == null ? Uint32List.fromList([for (var i = 0; i < vcount; i++) i]) : _readIndices(idxAcc);
      for (final i in idx) {
        if (i >= vcount) throw GlbFormatException('index $i out of range ($vcount vertices)');
      }
      // Bake the node transform. Normals use the inverse transpose so non-uniform scale stays correct.
      final outPos = Float32List(pos.length);
      for (var v = 0; v < vcount; v++) {
        final q = world.transformPoint(Vec3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
        outPos[v * 3] = q.x;
        outPos[v * 3 + 1] = q.y;
        outPos[v * 3 + 2] = q.z;
      }
      Float32List? outNrm;
      if (nrm != null) {
        final nm = _normalMatrix(world);
        outNrm = Float32List(nrm.length);
        for (var v = 0; v < vcount; v++) {
          final x = nrm[v * 3], y = nrm[v * 3 + 1], z = nrm[v * 3 + 2];
          final n = Vec3(nm[0] * x + nm[3] * y + nm[6] * z, nm[1] * x + nm[4] * y + nm[7] * z, nm[2] * x + nm[5] * y + nm[8] * z).normalized;
          outNrm[v * 3] = n.x;
          outNrm[v * 3 + 1] = n.y;
          outNrm[v * 3 + 2] = n.z;
        }
      }
      // A mirroring transform flips the winding; swap so front faces stay counter-clockwise.
      if (_det3(world) < 0) {
        for (var t = 0; t < idx.length; t += 3) {
          final tmp = idx[t + 1];
          idx[t + 1] = idx[t + 2];
          idx[t + 2] = tmp;
        }
      }
      out.add(GlbPrimitive(
        mesh: Mesh(positions: outPos, indices: idx, normals: outNrm),
        color: _baseColor(prim['material'] as int?),
        meshName: mesh['name'] as String?,
        nodeName: nodeName,
      ));
    }
    return out;
  }

  Color _baseColor(int? material) {
    if (material == null) return const Color(0xFFBDBDBD);
    final mat = _list('materials')[material] as Map<String, dynamic>;
    final pbr = mat['pbrMetallicRoughness'] as Map<String, dynamic>?;
    final f = (pbr?['baseColorFactor'] as List<dynamic>?)?.map((e) => (e as num).toDouble()).toList();
    if (f == null || f.length < 3) return const Color(0xFFFFFFFF);
    // Factors are linear; convert to sRGB for display.
    int c(double v) => (_linearToSrgb(v.clamp(0, 1)) * 255).round();
    return Color.fromARGB(f.length > 3 ? (f[3].clamp(0, 1) * 255).round() : 255, c(f[0]), c(f[1]), c(f[2]));
  }

  static double _linearToSrgb(double v) => v <= 0.0031308 ? v * 12.92 : 1.055 * _pow(v, 1 / 2.4) - 0.055;

  static double _pow(double x, double y) => x <= 0 ? 0 : _exp(y * _ln(x));
  static double _ln(double x) => _logOf(x);
  static double _exp(double x) => _expOf(x);

  (Uint8List, int, int) _view(Map<String, dynamic> acc, int elementBytes) {
    final viewIndex = acc['bufferView'] as int?;
    if (viewIndex == null) throw GlbFormatException('accessors without a bufferView (sparse/zero-filled) are not supported');
    final view = _list('bufferViews')[viewIndex] as Map<String, dynamic>;
    final buffer = (view['buffer'] as int?) ?? 0;
    final b = bin;
    if (buffer != 0 || b == null) throw GlbFormatException('only the embedded GLB buffer is supported');
    final start = ((view['byteOffset'] as int?) ?? 0) + ((acc['byteOffset'] as int?) ?? 0);
    final stride = (view['byteStride'] as int?) ?? elementBytes;
    final count = acc['count'] as int;
    final end = start + (count == 0 ? 0 : stride * (count - 1) + elementBytes);
    final viewEnd = ((view['byteOffset'] as int?) ?? 0) + (view['byteLength'] as int);
    if (end > viewEnd || viewEnd > b.length) throw GlbFormatException('accessor overruns its buffer view');
    return (b, start, stride);
  }

  Float32List _readFloats(int accessor, int components) {
    final acc = _list('accessors')[accessor] as Map<String, dynamic>;
    if (acc['componentType'] != 5126) throw GlbFormatException('expected FLOAT components for accessor $accessor');
    final count = acc['count'] as int;
    final (b, start, stride) = _view(acc, components * 4);
    final d = ByteData.sublistView(b);
    final out = Float32List(count * components);
    for (var i = 0; i < count; i++) {
      for (var c = 0; c < components; c++) {
        out[i * components + c] = d.getFloat32(start + i * stride + c * 4, Endian.little);
      }
    }
    return out;
  }

  Uint32List _readIndices(int accessor) {
    final acc = _list('accessors')[accessor] as Map<String, dynamic>;
    final type = acc['componentType'] as int;
    final size = switch (type) {
      5121 => 1,
      5123 => 2,
      5125 => 4,
      _ => throw GlbFormatException('unsupported index component type $type'),
    };
    final count = acc['count'] as int;
    final (b, start, stride) = _view(acc, size);
    final d = ByteData.sublistView(b);
    final out = Uint32List(count);
    for (var i = 0; i < count; i++) {
      final o = start + i * stride;
      out[i] = switch (size) {
        1 => d.getUint8(o),
        2 => d.getUint16(o, Endian.little),
        _ => d.getUint32(o, Endian.little),
      };
    }
    if (count % 3 != 0) throw GlbFormatException('index count $count is not a multiple of 3');
    return out;
  }

  static double _det3(Mat4 w) {
    final m = w.m;
    return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  }

  /// Inverse transpose of the upper 3×3, column-major.
  static List<double> _normalMatrix(Mat4 w) {
    final m = w.m;
    final a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    final det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (det.abs() < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    final k = 1 / det;
    // Cofactor matrix (= inverse transpose × det), stored column-major.
    return [
      (e * i - f * h) * k, -(b * i - c * h) * k, (b * f - c * e) * k,
      -(d * i - f * g) * k, (a * i - c * g) * k, -(a * f - c * d) * k,
      (d * h - e * g) * k, -(a * h - b * g) * k, (a * e - b * d) * k,
    ];
  }
}

double _logOf(double x) => _ln2(x);
double _expOf(double x) => _exp2(x);
double _ln2(double x) => _mathLog(x);
double _exp2(double x) => _mathExp(x);
double _mathLog(double x) => _MathBridge.log(x);
double _mathExp(double x) => _MathBridge.exp(x);

abstract final class _MathBridge {
  static double log(double x) => _dm.log(x);
  static double exp(double x) => _dm.exp(x);
}
