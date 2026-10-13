import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// Where the runner page gets Python (Pyodide: CPython compiled to WebAssembly, MPL-2.0) from,
/// so Python runs on the device with no network:
///
/// 1. a copy downloaded once and kept on the device (`<cacheRoot>/pyodide/<version>`), fetched
///    from the asset servers in [servers] (the school code box, a school server, then
///    jsDelivr's copy of the official release) and checked against the pinned SHA-256 of
///    every file ([files]);
/// 2. a copy bundled in the app ([bundled]): the Board already ships Pyodide with JupyterLite,
///    and packages/kinetix_cs/tool/fetch_pyodide.sh can bundle the core for other apps.
///
/// With neither, Python runs on the school code box if there is one, else the code lab offers
/// "Get Python for offline use" ([download]).
class PythonRuntime {
  PythonRuntime({List<PythonBundle>? bundled, this.servers = const [], this.cacheRoot, http.Client Function()? newClient, AssetBundle? assets, this.files = coreFiles, this.cdn = coreCdn})
    : bundled = bundled ?? const [PythonBundle('packages/kinetix_cs/assets/runner/pyodide/', module: false)],
      _newClient = newClient ?? http.Client.new,
      _assets = assets;

  /// The one the code lab uses unless it is given another. Apps set its fields at start-up.
  static PythonRuntime shared = PythonRuntime();

  /// The version downloaded when nothing is bundled (the same as tool/fetch_pyodide.sh).
  static const version = '0.27.7';

  /// The core files of Pyodide [version] (the interpreter and the standard library; no numpy):
  /// name, size in bytes and SHA-256, from the official release
  /// (https://github.com/pyodide/pyodide/releases/download/0.27.7/pyodide-core-0.27.7.tar.bz2,
  /// SHA-256 9bc8f127…541be8), identical to https://cdn.jsdelivr.net/pyodide/v0.27.7/full/.
  /// 13.8 MB in all.
  static const coreFiles = <(String, int, String)>[
    ('pyodide.js', 14913, 'b4cb23a53aba19c221659b9fb40a2f18281d685691dc06647fb0afd0681baf98'),
    ('pyodide.asm.js', 1255688, '6b4c90de5b7172873f04f21884d0e9d2274e305fe32116558fe3e4fbe3618d51'),
    ('pyodide.asm.wasm', 10105545, 'a50dd1843f805a0b7c45b61037ee0d7b26dfe85efe0e18ef95a34ad24e401f5f'),
    ('python_stdlib.zip', 2360737, '16611534726e5d8ac2bd8f926410b2dcb8d6f49aa24913463533b457a2115c16'),
    ('pyodide-lock.json', 112205, '9c45b916001a750f4102fc287494f3eab215909c7535c626a20db80fd6333e2c'),
  ];

  /// The public copy tried after the school's own servers.
  static const coreCdn = 'https://cdn.jsdelivr.net/pyodide/v$version/full/';

  /// The files fetched (tests use small ones) and the last place they are fetched from.
  final List<(String, int, String)> files;
  final String cdn;

  int get totalBytes => files.fold(0, (a, f) => a + f.$2);

  /// Copies inside the app, tried in order.
  List<PythonBundle> bundled;

  /// Folders with the [files] (each ends with '/'), tried in order before [cdn].
  List<String> servers;

  /// Where a downloaded copy is kept; null: nothing is downloaded (tests, apps without storage).
  Future<Directory?> Function()? cacheRoot;

  final http.Client Function() _newClient;
  final AssetBundle? _assets;
  AssetBundle get _bundle => _assets ?? rootBundle;

  /// What the code lab shows: unknown until [locate] has looked, then ready or missing, and the
  /// download's progress (0–1) while [download] runs.
  final state = ValueNotifier<PythonState>(const PythonState(PythonStatus.unknown));

  PythonSource? _source;
  Future<PythonSource?>? _locating;

  bool get canDownload => cacheRoot != null;

  /// Where Python is on this device, or null.
  Future<PythonSource?> locate({bool again = false}) {
    if (again) _locating = null;
    return _locating ??= () async {
      final s = _source = await _find();
      if (state.value.status != PythonStatus.downloading) state.value = PythonState(s == null ? PythonStatus.missing : PythonStatus.ready, source: s);
      return s;
    }();
  }

  Future<PythonSource?> _find() async {
    final dir = await _cacheDir();
    if (dir != null && await _complete(dir)) return PythonSource.cached(dir);
    for (final b in bundled) {
      try {
        await _bundle.load('${b.prefix}${b.module ? 'pyodide.mjs' : 'pyodide.js'}');
        return PythonSource.bundled(b, _bundle);
      } catch (_) {}
    }
    return null;
  }

  Future<Directory?> _cacheDir() async {
    try {
      final root = await cacheRoot?.call();
      return root == null ? null : Directory('${root.path}/pyodide/$version');
    } catch (_) {
      return null;
    }
  }

  Future<bool> _complete(Directory dir) async {
    final mark = File('${dir.path}/VERSION');
    if (!await mark.exists() || (await mark.readAsString()).trim() != version) return false;
    for (final f in files) {
      final file = File('${dir.path}/${f.$1}');
      if (!await file.exists() || await file.length() != f.$2) return false;
    }
    return true;
  }

  /// Downloads Pyodide's core into the cache, from the first of [servers] (then [cdn]) that
  /// has every file with the right SHA-256. Returns whether Python is now on the device.
  Future<bool> download() async {
    if (state.value.status == PythonStatus.downloading) return false;
    final dir = await _cacheDir();
    if (dir == null) return false;
    state.value = const PythonState(PythonStatus.downloading, progress: 0);
    final tmp = Directory('${dir.path}.part');
    String? error;
    for (final base in [...servers, cdn]) {
      final client = _newClient();
      try {
        if (await tmp.exists()) await tmp.delete(recursive: true);
        await tmp.create(recursive: true);
        var done = 0;
        for (final (name, size, sha) in files) {
          final res = await client.send(http.Request('GET', Uri.parse('$base$name'))).timeout(const Duration(seconds: 30));
          if (res.statusCode != 200) throw HttpException('$name: ${res.statusCode}');
          final sink = File('${tmp.path}/$name').openWrite();
          final hash = _DigestSink();
          final hasher = sha256.startChunkedConversion(hash);
          var got = 0;
          try {
            await for (final chunk in res.stream.timeout(const Duration(seconds: 30))) {
              got += chunk.length;
              if (got > size) throw HttpException('$name: too big');
              hasher.add(chunk);
              sink.add(chunk);
              state.value = PythonState(PythonStatus.downloading, progress: (done + got) / totalBytes);
            }
          } finally {
            await sink.close();
          }
          hasher.close();
          if (got != size || hash.events.single.toString() != sha) throw HttpException('$name: not the expected file');
          done += size;
        }
        await File('${tmp.path}/VERSION').writeAsString(version);
        if (await dir.exists()) await dir.delete(recursive: true);
        await tmp.rename(dir.path);
        error = null;
        break;
      } catch (e) {
        error = '$base: $e';
        debugPrint('Python download: $error');
      } finally {
        client.close();
      }
    }
    if (error != null) {
      try {
        if (await tmp.exists()) await tmp.delete(recursive: true);
      } catch (_) {}
      state.value = PythonState(PythonStatus.failed, error: error);
      _locating = null;
      return false;
    }
    state.value = const PythonState(PythonStatus.unknown);
    return await locate(again: true) != null;
  }

  /// Removes the downloaded copy (Board settings).
  Future<void> remove() async {
    final dir = await _cacheDir();
    if (dir != null && await dir.exists()) await dir.delete(recursive: true);
    state.value = const PythonState(PythonStatus.unknown);
    await locate(again: true);
  }

  /// The current source, without waiting (null until [locate] has run).
  PythonSource? get source => _source;
}

/// Pyodide inside the app's assets: [prefix] is the folder (ending in '/'); [module] for the
/// newer releases that ship pyodide.mjs (the Board's JupyterLite) rather than pyodide.js.
class PythonBundle {
  const PythonBundle(this.prefix, {required this.module});

  final String prefix;
  final bool module;
}

enum PythonStatus { unknown, ready, missing, downloading, failed }

class PythonState {
  const PythonState(this.status, {this.progress = 0, this.source, this.error});

  final PythonStatus status;
  final double progress;
  final PythonSource? source;
  final String? error;
}

/// The files the runner server hands the page under /py/.
class PythonSource {
  PythonSource.cached(Directory this.dir) : bundle = null, assets = null, module = false;
  PythonSource.bundled(PythonBundle this.bundle, AssetBundle this.assets) : dir = null, module = bundle.module;

  final Directory? dir;
  final PythonBundle? bundle;
  final AssetBundle? assets;

  /// pyodide.mjs (an ES module) rather than pyodide.js.
  final bool module;

  bool get downloaded => dir != null;

  /// The bytes of [name] (a file of the Pyodide folder), or null.
  Future<Uint8List?> read(String name) async {
    if (name.contains('..') || name.startsWith('/')) return null;
    try {
      if (dir case final d?) return await File('${d.path}/$name').readAsBytes();
      final data = await assets!.load('${bundle!.prefix}$name');
      return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } catch (_) {
      return null;
    }
  }
}

/// Collects the digest of a chunked conversion.
class _DigestSink implements Sink<Digest> {
  final events = <Digest>[];

  @override
  void add(Digest event) => events.add(event);

  @override
  void close() {}
}
