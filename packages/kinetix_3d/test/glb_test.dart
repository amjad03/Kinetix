import 'dart:convert';
import 'dart:ui' show Color;
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// Builds a GLB container from a glTF JSON object and a binary buffer.
Uint8List makeGlb(Map<String, Object?> json, Uint8List bin) {
  var j = utf8.encode(jsonEncode(json));
  final jPad = (4 - j.length % 4) % 4;
  j = Uint8List.fromList([...j, ...List.filled(jPad, 0x20)]);
  final bPad = (4 - bin.length % 4) % 4;
  final b = Uint8List.fromList([...bin, ...List.filled(bPad, 0)]);
  final total = 12 + 8 + j.length + 8 + b.length;
  final out = ByteData(total);
  out.setUint32(0, 0x46546C67, Endian.little);
  out.setUint32(4, 2, Endian.little);
  out.setUint32(8, total, Endian.little);
  out.setUint32(12, j.length, Endian.little);
  out.setUint32(16, 0x4E4F534A, Endian.little);
  final bytes = out.buffer.asUint8List();
  bytes.setRange(20, 20 + j.length, j);
  final o = 20 + j.length;
  out.setUint32(o, b.length, Endian.little);
  out.setUint32(o + 4, 0x004E4942, Endian.little);
  bytes.setRange(o + 8, o + 8 + b.length, b);
  return bytes;
}

class _Bin {
  final _b = BytesBuilder();
  int get length => _b.length;
  int floats(List<double> v) {
    final at = _align();
    final d = ByteData(v.length * 4);
    for (var i = 0; i < v.length; i++) {
      d.setFloat32(i * 4, v[i], Endian.little);
    }
    _b.add(d.buffer.asUint8List());
    return at;
  }

  int ints(List<int> v, int size) {
    final at = _align();
    final d = ByteData(v.length * size);
    for (var i = 0; i < v.length; i++) {
      switch (size) {
        case 1:
          d.setUint8(i, v[i]);
        case 2:
          d.setUint16(i * 2, v[i], Endian.little);
        default:
          d.setUint32(i * 4, v[i], Endian.little);
      }
    }
    _b.add(d.buffer.asUint8List());
    return at;
  }

  int _align() {
    while (_b.length % 4 != 0) {
      _b.addByte(0);
    }
    return _b.length;
  }

  Uint8List take() => _b.takeBytes();
}

void main() {
  late Uint8List bytes;

  setUpAll(() {
    final bin = _Bin();
    // Triangle: positions, normals, uint16 indices.
    final triPos = bin.floats([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    final triNrm = bin.floats([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    final triIdx = bin.ints([0, 1, 2], 2);
    // Quad: interleaved positions with a 16-byte stride (xyz + 4 bytes of padding), uint32 indices.
    final quadPos = bin.floats([0, 0, 0, -1, 1, 0, 0, -1, 1, 1, 0, -1, 0, 1, 0, -1]);
    final quadIdx = bin.ints([0, 1, 2, 0, 2, 3], 4);
    // A second primitive with uint8 indices.
    final smallIdx = bin.ints([0, 1, 3], 1);
    final data = bin.take();
    final json = <String, Object?>{
      'asset': {'version': '2.0'},
      'scene': 0,
      'scenes': [
        {
          'nodes': [0],
        },
      ],
      'nodes': [
        {
          'name': 'root',
          'translation': [10, 0, 0],
          'rotation': [0, 0, math.sin(math.pi / 4), math.cos(math.pi / 4)], // 90° about z
          'mesh': 0,
          'children': [1],
        },
        {
          'name': 'child',
          'matrix': [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 5, 1], // scale 2, then move z by 5
          'mesh': 1,
        },
      ],
      'meshes': [
        {
          'name': 'tri',
          'primitives': [
            {
              'attributes': {'POSITION': 0, 'NORMAL': 1},
              'indices': 2,
              'material': 0,
            },
          ],
        },
        {
          'name': 'quad',
          'primitives': [
            {
              'attributes': {'POSITION': 3},
              'indices': 4,
              'material': 1,
            },
            {
              'attributes': {'POSITION': 3},
              'indices': 5,
            },
          ],
        },
      ],
      'materials': [
        {
          'pbrMetallicRoughness': {
            'baseColorFactor': [1, 0, 0, 1],
          },
        },
        {
          'pbrMetallicRoughness': {
            'baseColorFactor': [0.2140, 0.2140, 0.2140, 1], // linear 0.214 ≈ sRGB 0.5
          },
        },
      ],
      'buffers': [
        {'byteLength': data.length},
      ],
      'bufferViews': [
        {'buffer': 0, 'byteOffset': triPos, 'byteLength': 36},
        {'buffer': 0, 'byteOffset': triNrm, 'byteLength': 36},
        {'buffer': 0, 'byteOffset': triIdx, 'byteLength': 6},
        {'buffer': 0, 'byteOffset': quadPos, 'byteLength': 64, 'byteStride': 16},
        {'buffer': 0, 'byteOffset': quadIdx, 'byteLength': 24},
        {'buffer': 0, 'byteOffset': smallIdx, 'byteLength': 3},
      ],
      'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
        {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
        {'bufferView': 2, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'},
        {'bufferView': 3, 'componentType': 5126, 'count': 4, 'type': 'VEC3'},
        {'bufferView': 4, 'componentType': 5125, 'count': 6, 'type': 'SCALAR'},
        {'bufferView': 5, 'componentType': 5121, 'count': 3, 'type': 'SCALAR'},
      ],
    };
    bytes = makeGlb(json, data);
  });

  void expectVec(Mesh m, int i, double x, double y, double z) {
    final v = m.vertex(i);
    expect(v.x, closeTo(x, 1e-5), reason: 'x of $i');
    expect(v.y, closeTo(y, 1e-5), reason: 'y of $i');
    expect(v.z, closeTo(z, 1e-5), reason: 'z of $i');
  }

  test('parses the container, accessors, indices and node transforms', () {
    final prims = GlbLoader.parse(bytes);
    expect(prims, hasLength(3));

    final tri = prims[0];
    expect(tri.nodeName, 'root');
    expect(tri.mesh.indices, [0, 1, 2]);
    // Rotated 90° about z, then moved by (10, 0, 0).
    expectVec(tri.mesh, 0, 10, 0, 0);
    expectVec(tri.mesh, 1, 10, 1, 0);
    expectVec(tri.mesh, 2, 9, 0, 0);
    expect(tri.mesh.normals![2], closeTo(1, 1e-6)); // z normal unchanged by a z rotation
    expect(tri.color, const Color(0xFFFF0000));

    final quad = prims[1];
    expect(quad.nodeName, 'child');
    expect(quad.mesh.indices, [0, 1, 2, 0, 2, 3]);
    // child: scale 2 and z + 5; then the parent's rotation and translation.
    expectVec(quad.mesh, 1, 10, 2, 5); // (1,0,0) → (2,0,5) → (0,2,5) → (10,2,5)
    expectVec(quad.mesh, 3, 8, 0, 5); // (0,1,0) → (0,2,5) → (−2,0,5) → (8,0,5)
    expect(quad.color.r, closeTo(0.5, 0.01));

    final small = prims[2];
    expect(small.mesh.indices, [0, 1, 3]);
    expect(small.color, const Color(0xFFBDBDBD)); // no material
  });

  test('loads as a model with one selectable part per primitive', () {
    final model = GlbLoader.load(bytes, title: 'Test');
    expect(model.parts, hasLength(3));
    expect(model.triangleCount, 1 + 2 + 1);
    expect(model.parts.first.name, 'root');
  });

  test('rejects bad input clearly', () {
    expect(() => GlbLoader.parse(Uint8List(8)), throwsA(isA<GlbFormatException>()));
    final bad = Uint8List.fromList(bytes)..[0] = 0;
    expect(() => GlbLoader.parse(bad), throwsA(isA<GlbFormatException>()));
    final v1 = Uint8List.fromList(bytes);
    ByteData.sublistView(v1).setUint32(4, 1, Endian.little);
    expect(() => GlbLoader.parse(v1), throwsA(isA<GlbFormatException>()));
    expect(() => GlbLoader.parse(Uint8List.sublistView(bytes, 0, bytes.length - 8)), throwsA(isA<GlbFormatException>()));
  });

  test('an index past the vertex count is rejected', () {
    final bin = _Bin();
    final pos = bin.floats([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    final idx = bin.ints([0, 1, 7], 2);
    final data = bin.take();
    final glb = makeGlb({
      'asset': {'version': '2.0'},
      'meshes': [
        {
          'primitives': [
            {
              'attributes': {'POSITION': 0},
              'indices': 1,
            },
          ],
        },
      ],
      'nodes': [
        {'mesh': 0},
      ],
      'buffers': [
        {'byteLength': data.length},
      ],
      'bufferViews': [
        {'buffer': 0, 'byteOffset': pos, 'byteLength': 36},
        {'buffer': 0, 'byteOffset': idx, 'byteLength': 6},
      ],
      'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
        {'bufferView': 1, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'},
      ],
    }, data);
    expect(() => GlbLoader.parse(glb), throwsA(isA<GlbFormatException>()));
  });
}
