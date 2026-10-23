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

/// A plain GLB shown by the Dart renderer with hotspots (no downloadable model is one now, but
/// a school server can still list one).
const _plain = RemoteModelInfo(
  id: 'plain_rocket',
  title: LocalText({'en': 'Rocket', 'hi': 'रॉकेट', 'kn': 'ರಾಕೆಟ್'}),
  subject: 'Physics',
  topic: 'solar',
  classes: [8],
  url: 'https://example.org/rocket.glb',
  bytes: 1000,
  license: 'Public domain',
  credit: 'Test',
  hotspots: [
    ModelHotspot(LocalText({'en': 'Command module', 'hi': 'कमांड मॉड्यूल', 'kn': 'ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್'}), 0, 0.95, 0),
    ModelHotspot(LocalText({'en': 'Engines', 'hi': 'इंजन', 'kn': 'ಎಂಜಿನ್‌ಗಳು'}), 0, -0.95, 0),
  ],
);

void main() {
  test('every downloadable model has three languages, a licence and an https url', () {
    for (final m in RemoteModels.all) {
      expect(m.title.complete, isTrue, reason: m.id);
      expect(m.url, startsWith('https://'));
      expect(m.license, isNotEmpty);
      expect(m.bytes, lessThan(2.6 * 1024 * 1024), reason: m.id);
      for (final h in m.hotspots) {
        expect(h.name.complete, isTrue, reason: m.id);
      }
    }
  });

  test('filter by subject, class, topic and search', () {
    expect(RemoteModels.filter(subject: 'Geography').map((m) => m.id), ['apollo_lunar_module']);
    expect(RemoteModels.filter(grade: 12).map((m) => m.id), containsAll(['hubble_telescope', 'woolly_mammoth']));
    expect(RemoteModels.filter(query: 'ROCKET').map((m) => m.id), ['saturn_v']);
    expect(RemoteModels.filter(query: 'हबल').map((m) => m.id), ['hubble_telescope']);
    expect(RemoteModels.filter(topics: {'human'}).map((m) => m.id), ['stomach', 'liver', 'tooth', 'skin']);
    expect(RemoteModels.filter(topics: {'cell'}).map((m) => m.id), ['bacteria', 'mitochondrion']);
    expect(RemoteModels.filter(topics: {'solar'}).map((m) => m.id), ['saturn_v', 'hubble_telescope', 'apollo_lunar_module', 'apollo11_command_module']);
    expect(RemoteModels.filter(subject: 'History').map((m) => m.id), ['cosmic_buddha']);
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
    const m = _plain;
    expect(cache.isCached(m), isFalse);
    var seen = 0;
    await cache.load(m, onProgress: (a, b) => seen = a);
    expect(seen, 10);
    expect(cache.isCached(m), isTrue);
    expect(cache.cachedIds, [m.id]);
    await cache.load(m);
    expect(calls, 1);
  });

  test('a viewer model downloads its GLB and its manifest, and the viewer reads them from the cache', () async {
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    final m = RemoteModels.byId('woolly_mammoth')!;
    expect(m.viewer, isTrue);
    expect(m.manifestUrl, endsWith('/woolly_mammoth.json'));
    expect(m.thumbAsset, endsWith('thumbs/woolly_mammoth.jpg'));
    final urls = <String>[];
    final cache = ModelCache(dir, fetcher: (url, p) async {
      urls.add(url);
      return url.endsWith('.json') ? Uint8List.fromList('{"id": "woolly_mammoth", "parts": []}'.codeUnits) : _glb();
    });
    await cache.load(m);
    expect(urls, [m.url, m.manifestUrl]);
    expect(cache.isCached(m), isTrue);
    expect(cache.manifestFor(m).existsSync(), isTrue);
    // A manifest for another model is refused and nothing is kept.
    final other = ModelCache(Directory('${dir.path}/b'), fetcher: (url, p) async => url.endsWith('.json') ? Uint8List.fromList('{"id": "x"}'.codeUnits) : _glb());
    await expectLater(other.load(m), throwsA(anything));
    expect(other.isCached(m), isFalse);
  });

  test('the app\'s cache folder, set after start-up, is where downloads go and where the viewer reads', () {
    final before = RemoteModels.cacheDir;
    addTearDown(() => RemoteModels.cacheDir = before);
    final early = RemoteModels.cache;
    expect(early.dir.path, before.path);
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    RemoteModels.cacheDir = Directory('${dir.path}/models3d');
    expect(RemoteModels.cache.dir.path, '${dir.path}/models3d');
    Directory('${dir.path}/models3d').createSync();
    File('${dir.path}/models3d/woolly_mammoth.glb').writeAsBytesSync(_glb());
    expect(RemoteModels.cachedFile('woolly_mammoth.glb')?.path, RemoteModels.cache.fileFor(RemoteModels.byId('woolly_mammoth')!).path);
  });

  test('the downloadable viewer models are listed with their sources', () {
    final viewer = [for (final m in RemoteModels.all) if (m.viewer) m.id];
    expect(viewer, [for (final m in RemoteModels.all) m.id]);
    expect(viewer, containsAll(['woolly_mammoth', 'cosmic_buddha', 'apollo11_command_module', 'saturn_v', 'apollo_lunar_module', 'hubble_telescope', 'liver', 'stomach', 'tooth', 'skin', 'bacteria', 'mitochondrion']));
    for (final m in RemoteModels.all.where((m) => m.viewer)) {
      expect(m.url, startsWith(RemoteModels.defaultBase), reason: m.id);
      expect(['CC0', 'Public domain', 'CC BY 4.0', 'Same as the app'], contains(m.license), reason: m.id);
      expect(m.credit, isNotEmpty, reason: m.id);
      expect(File('assets/viewer3d/thumbs/${m.id}.jpg').existsSync(), isTrue, reason: m.id);
      expect(File('remote_models/${m.id}.glb').lengthSync() + File('remote_models/${m.id}.json').lengthSync(), m.bytes, reason: m.id);
    }
    expect(ModelCatalogue.byId('woolly_mammoth')?.id, 'dl.woolly_mammoth');
  });

  test('a school server or the Zynetix API is tried before GitHub; a bad or missing copy hands over to the next', () async {
    addTearDown(() => RemoteModels.servers = const []);
    RemoteModels.servers = ['http://10.0.0.5/models/', ' https://kinetix.school.in/assets/models ', 'not a url', 'ftp://x/y', RemoteModels.defaultBase, 'http://10.0.0.5/models'];
    expect(RemoteModels.servers, ['http://10.0.0.5/models', 'https://kinetix.school.in/assets/models']);
    final m = RemoteModels.byId('woolly_mammoth')!;
    expect(m.urls, ['http://10.0.0.5/models/woolly_mammoth.glb', 'https://kinetix.school.in/assets/models/woolly_mammoth.glb', m.url]);
    final manifest = Uint8List.fromList('{"id": "woolly_mammoth"}'.codeUnits);

    // The school server is down and the API sends a sign-in page: GitHub's copy is kept.
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    final asked = <String>[];
    final cache = ModelCache(dir, fetcher: (url, p) async {
      asked.add(url);
      if (url.startsWith('http://10.0.0.5')) throw const OfflineException();
      if (url.startsWith('https://kinetix.school.in')) return Uint8List.fromList('<html>Sign in</html>'.codeUnits);
      return url.endsWith('.json') ? manifest : _glb();
    });
    await cache.load(m);
    expect(asked, ['http://10.0.0.5/models/woolly_mammoth.glb', 'https://kinetix.school.in/assets/models/woolly_mammoth.glb', m.url, m.manifestUrl]);
    expect(cache.isCached(m), isTrue);

    // The first server has it: the GLB and its manifest both come from there, GitHub is not asked.
    final dir2 = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir2.deleteSync(recursive: true));
    final asked2 = <String>[];
    await ModelCache(dir2, fetcher: (url, p) async {
      asked2.add(url);
      return url.endsWith('.json') ? manifest : _glb();
    }).load(m);
    expect(asked2, ['http://10.0.0.5/models/woolly_mammoth.glb', 'http://10.0.0.5/models/woolly_mammoth.json']);

    // Every server unreachable: offline. Reached but none has it: that error, nothing kept.
    final dir3 = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir3.deleteSync(recursive: true));
    await expectLater(ModelCache(dir3, fetcher: (_, _) async => throw const OfflineException()).load(m), throwsA(isA<OfflineException>()));
    await expectLater(
      ModelCache(dir3, fetcher: (url, _) async => url.startsWith('http://10.0.0.5') ? throw const OfflineException() : throw HttpException('HTTP 404', uri: Uri.parse(url))).load(m),
      throwsA(isA<HttpException>()),
    );
    expect(ModelCache(dir3).isCached(m), isFalse);
  });

  test('offline and corrupt downloads leave nothing behind', () async {
    final dir = Directory.systemTemp.createTempSync('m3d');
    addTearDown(() => dir.deleteSync(recursive: true));
    const m = _plain;
    final off = ModelCache(dir, fetcher: (_, _) async => throw const OfflineException());
    await expectLater(off.load(m), throwsA(isA<OfflineException>()));
    final bad = ModelCache(dir, fetcher: (_, _) async => Uint8List.fromList([1, 2, 3, 4]));
    await expectLater(bad.load(m), throwsA(anything));
    expect(bad.isCached(m), isFalse);
  });

  test('hotspots become labels in the chosen language; explode moves parts apart', () {
    final model = GlbLoader.load(_glb(), title: 't');
    final l = withHotspots(model, _plain, 'hi');
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
