import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// A tiny valid GLB: one triangle.
Uint8List _glb() {
  final bin = ByteData(42);
  const f = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  for (var i = 0; i < 9; i++) {
    bin.setFloat32(i * 4, f[i].toDouble(), Endian.little);
  }
  bin.setUint16(36, 0, Endian.little);
  bin.setUint16(38, 1, Endian.little);
  bin.setUint16(40, 2, Endian.little);
  const json = '{"asset":{"version":"2.0"},"scenes":[{"nodes":[0]}],"scene":0,"nodes":[{"mesh":0}],'
      '"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],'
      '"buffers":[{"byteLength":42}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},{"buffer":0,"byteOffset":36,"byteLength":6}],'
      '"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[0,0,0],"max":[1,1,0]},{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}]}';
  final j = List<int>.from(json.codeUnits);
  while (j.length % 4 != 0) {
    j.add(0x20);
  }
  final b = [...bin.buffer.asUint8List()];
  final total = 12 + 8 + j.length + 8 + b.length;
  final out = ByteData(total);
  out.setUint32(0, 0x46546C67, Endian.little);
  out.setUint32(4, 2, Endian.little);
  out.setUint32(8, total, Endian.little);
  out.setUint32(12, j.length, Endian.little);
  out.setUint32(16, 0x4E4F534A, Endian.little);
  final u = out.buffer.asUint8List();
  u.setRange(20, 20 + j.length, j);
  out.setUint32(20 + j.length, b.length, Endian.little);
  out.setUint32(24 + j.length, 0x004E4942, Endian.little);
  u.setRange(28 + j.length, 28 + j.length + b.length, b);
  return u;
}

Mesh _shift(Mesh m, double dx) => Mesh(
      positions: Float32List.fromList([for (var i = 0; i < m.positions.length; i++) m.positions[i] + (i % 3 == 0 ? dx : 0)]),
      indices: m.indices,
      normals: m.normals,
    );

void main() {
  test('every downloadable model has three languages, a licence and an https url', () {
    for (final m in RemoteModels.all) {
      expect(m.title.complete, isTrue, reason: m.id);
      expect(m.url, startsWith('https://'));
      expect(m.license, isNotEmpty);
      expect(m.bytes, lessThan(2 * 1024 * 1024), reason: m.id);
      for (final h in m.hotspots) {
        expect(h.name.complete, isTrue, reason: m.id);
      }
    }
  });

  test('filter by subject, class, topic and search', () {
    expect(RemoteModels.filter(subject: 'Geography').map((m) => m.id), ['apollo_lunar_module']);
    expect(RemoteModels.filter(grade: 12).map((m) => m.id), ['hubble_telescope']);
    expect(RemoteModels.filter(query: 'ROCKET').map((m) => m.id), ['saturn_v']);
    expect(RemoteModels.filter(query: 'हबल').map((m) => m.id), ['hubble_telescope']);
    expect(RemoteModels.filter(topics: {'human'}), isEmpty);
    expect(RemoteModels.filter(topics: {'solar'}).length, 3);
  });

  test('cache downloads once, reports progress, then works offline', () async {
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    var calls = 0;
    final cache = ModelCache(dir, fetcher: (url, p) async {
      calls++;
      p(10, 20);
      return _glb();
    });
    final m = RemoteModels.all.first;
    expect(cache.isCached(m), isFalse);
    var seen = 0;
    await cache.load(m, onProgress: (a, b) => seen = a);
    expect(seen, 10);
    expect(cache.isCached(m), isTrue);
    expect(cache.cachedIds, [m.id]);
    await cache.load(m);
    expect(calls, 1);
  });

  test('offline and corrupt downloads leave nothing behind', () async {
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    final m = RemoteModels.all.first;
    final off = ModelCache(dir, fetcher: (_, _) async => throw const OfflineException());
    await expectLater(off.load(m), throwsA(isA<OfflineException>()));
    final bad = ModelCache(dir, fetcher: (_, _) async => Uint8List.fromList([1, 2, 3, 4]));
    await expectLater(bad.load(m), throwsA(anything));
    expect(bad.isCached(m), isFalse);
  });

  test('hotspots become labels in the chosen language; explode moves parts apart', () {
    final model = GlbLoader.load(_glb(), title: 't');
    final l = withHotspots(model, RemoteModels.byId('saturn_v')!, 'hi');
    expect(l.labels.map((x) => x.text), ['कमांड मॉड्यूल', 'इंजन']);
    final two = Model3D(title: 't', parts: [
      model.parts.first,
      ModelPart(id: 'b', color: model.parts.first.color, mesh: _shift(model.parts.first.mesh, 3)),
    ]);
    expect(identical(explodedModel(two, 0), two), isTrue);
    final e = explodedModel(two, 1);
    final gap0 = two.parts[1].mesh.positions[0] - two.parts[0].mesh.positions[0];
    expect(e.parts[1].mesh.positions[0] - e.parts[0].mesh.positions[0], greaterThan(gap0));
  });
}
