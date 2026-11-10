import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'content_pack.dart';

/// What an install or update did.
@immutable
class ContentReport {
  const ContentReport({this.added = const [], this.updated = const [], this.unchanged = 0, this.problems = const [], this.bytes = 0});
  final List<String> added, updated;
  final int unchanged;
  final List<String> problems;

  /// Bytes copied or downloaded.
  final int bytes;
}

/// Fetches from the pack's base URL (tests use a fake). [from] > 0 asks for the rest of a file
/// (HTTP Range); the answer says whether the server sent only the rest ([partial]).
abstract class ContentFetcher {
  Future<Uint8List> get(Uri url);
  Future<({bool partial, Stream<List<int>> body})> getFrom(Uri url, int from);
}

/// [ContentFetcher] over dart:io's HttpClient.
class HttpContentFetcher implements ContentFetcher {
  final _client = HttpClient()..connectionTimeout = const Duration(seconds: 20);

  @override
  Future<Uint8List> get(Uri url) async {
    final res = await (await _client.getUrl(url)).close();
    if (res.statusCode != 200) throw HttpException('HTTP ${res.statusCode}', uri: url);
    final b = BytesBuilder(copy: false);
    await res.forEach(b.add);
    return b.takeBytes();
  }

  @override
  Future<({bool partial, Stream<List<int>> body})> getFrom(Uri url, int from) async {
    final req = await _client.getUrl(url);
    if (from > 0) req.headers.set(HttpHeaders.rangeHeader, 'bytes=$from-');
    final res = await req.close();
    if (res.statusCode != 200 && res.statusCode != 206) throw HttpException('HTTP ${res.statusCode}', uri: url);
    return (partial: res.statusCode == 206, body: res);
  }
}

/// Whether the board is on Wi-Fi (downloads never use mobile data). Tests swap it.
Future<bool> Function() contentOnWifi = () async {
  try {
    final ifs = await NetworkInterface.list();
    return ifs.any((i) => i.name.startsWith('wlan') || i.name.startsWith('wl') || i.name.startsWith('en') || i.name.startsWith('eth'));
  } catch (_) {
    return false;
  }
};

/// SHA-256 of a file, read in chunks (videos are hundreds of MB).
Future<String> sha256OfFile(File f) async => (await sha256.bind(f.openRead()).first).toString();

/// The installed content: `content_pack/` in the app's own storage, with `installed.json`
/// (the merged manifest of everything installed), `settings.json` (the base URL) and the
/// items' files under `items/<id>/`.
class ContentLibrary extends ChangeNotifier {
  ContentLibrary(this.root);

  final Directory root;
  final Map<String, ContentItem> _items = {};
  String packTitle = '', revision = '';

  /// Where updates come from ("https://content.example.org/ce/"), empty when not set.
  String baseUrl = '';

  List<ContentItem> get items => _items.values.toList()..sort((a, b) => a.id.compareTo(b.id));
  int get totalBytes => _items.values.fold(0, (a, i) => a + i.size);
  bool get isEmpty => _items.isEmpty;

  static ContentLibrary? _shared;
  static Future<ContentLibrary>? _opening;

  /// The board's library (opened once).
  static Future<ContentLibrary> shared() => _opening ??= () async {
    final l = ContentLibrary(Directory('${(await getApplicationSupportDirectory()).path}/content_pack'));
    await l.load();
    return _shared = l;
  }();

  /// The library if it is open already (lesson cards ask without waiting).
  static ContentLibrary? get sharedIfOpen => _shared;

  @visibleForTesting
  static set debugShared(ContentLibrary? l) {
    _shared = l;
    _opening = l == null ? null : Future.value(l);
  }

  File _file(String rel) {
    if (rel.contains('..') || rel.startsWith('/')) throw ArgumentError.value(rel, 'path', 'not inside content_pack/');
    return File('${root.path}/$rel');
  }

  /// The item's file on the board.
  File fileOf(ContentItem i) => _file('items/${i.id}/${i.file.split('/').last}');

  Future<void> load() async {
    _items.clear();
    final f = _file('installed.json');
    if (await f.exists()) {
      try {
        final m = ContentManifest.parse(await f.readAsBytes());
        packTitle = m.title;
        revision = m.revision;
        for (final i in m.items) {
          _items[i.id] = i;
        }
      } on FormatException catch (e) {
        debugPrint('Content pack index not read: ${e.message}');
      }
    }
    final s = _file('settings.json');
    if (await s.exists()) {
      try {
        baseUrl = '${(jsonDecode(await s.readAsString()) as Map)['baseUrl'] ?? ''}';
      } catch (_) {}
    }
    notifyListeners();
  }

  Future<void> _writeJson(String rel, String text) async {
    final f = _file(rel);
    await f.parent.create(recursive: true);
    final tmp = File('${f.path}.part');
    await tmp.writeAsString(text, flush: true);
    await tmp.rename(f.path);
  }

  Future<void> _save() => _writeJson('installed.json', ContentManifest(id: 'installed', title: packTitle, revision: revision, items: items).encode());

  Future<void> setBaseUrl(String url) async {
    baseUrl = url.trim();
    await _writeJson('settings.json', jsonEncode({'baseUrl': baseUrl}));
    notifyListeners();
  }

  /// The items a lesson topic has, videos first.
  List<ContentItem> forTopic(String topicId, {ContentKind? kind}) => [
    for (final i in items)
      if (i.coversTopic(topicId) && (kind == null || i.kind == kind)) i,
  ]..sort((a, b) => a.kind.index.compareTo(b.kind.index));

  /// The video for a topic (or a lesson step key), when the pack has one.
  ContentItem? videoFor(String topicId, {String? step}) {
    final vids = forTopic(topicId, kind: ContentKind.video);
    if (step != null) {
      final s = vids.where((v) => v.steps.contains(step)).firstOrNull;
      if (s != null) return s;
    }
    return vids.firstOrNull;
  }

  /// Search by title, chapter or topic id ("ohm", "phy1-ch03").
  List<ContentItem> search(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return [
      for (final i in items)
        if (i.title.toLowerCase().contains(q) || i.chapterId.toLowerCase() == q || i.topics.any((t) => t.toLowerCase() == q) || i.markers.any((m) => m.title.toLowerCase().contains(q))) i,
    ];
  }

  /// Whether [i] needs its file (not installed, a newer version, or a different file).
  bool needs(ContentItem i) {
    final have = _items[i.id];
    return have == null || have.version < i.version || have.sha256 != i.sha256;
  }

  Future<void> _accept(ContentManifest m) async {
    if (m.title.isNotEmpty) packTitle = m.title;
    if (m.revision.isNotEmpty) revision = m.revision;
    await _save();
    notifyListeners();
  }

  /// Installs a pack zip (from a USB stick). Only items that changed are written; every file
  /// is checked against its size and sha256 before it replaces the installed copy.
  Future<ContentReport> installZip(Uint8List zip) async {
    if (zip.length < 4 || zip[0] != 0x50 || zip[1] != 0x4B) throw const FormatException('This file is not a content pack (it is not a zip file).');
    final Archive a;
    try {
      a = ZipDecoder().decodeBytes(zip);
    } catch (_) {
      throw const FormatException('This file is not a content pack (it is not a zip file).');
    }
    final raw = a.findFile('manifest.json');
    if (raw == null) throw const FormatException('This zip is not a content pack: it has no manifest.json.');
    final m = ContentManifest.parse(raw.content);
    return _installFrom(m, (i) async {
      final f = a.findFile(i.file);
      return f == null || !f.isFile ? null : Stream.value(f.content);
    });
  }

  /// Installs a pack folder (copied to Documents/Zynetix/Content, or a USB stick's folder).
  Future<ContentReport> installFolder(Directory dir) async {
    final mf = File('${dir.path}/manifest.json');
    if (!await mf.exists()) throw const FormatException('This folder is not a content pack: it has no manifest.json.');
    final m = ContentManifest.parse(await mf.readAsBytes());
    return _installFrom(m, (i) async {
      final f = File('${dir.path}/${i.file}');
      return await f.exists() ? f.openRead() : null;
    });
  }

  Future<ContentReport> _installFrom(ContentManifest m, Future<Stream<List<int>>?> Function(ContentItem) open) async {
    final added = <String>[], updated = <String>[], problems = [...m.problems];
    var unchanged = 0, bytes = 0;
    for (final i in m.items) {
      if (!needs(i)) {
        unchanged++;
        continue;
      }
      final src = await open(i);
      if (src == null) {
        problems.add('${i.id}: its file "${i.file}" is not in the pack');
        continue;
      }
      final part = File('${fileOf(i).path}.part');
      await part.parent.create(recursive: true);
      if (await part.exists()) await part.delete();
      final sink = part.openWrite();
      await sink.addStream(src);
      await sink.close();
      final err = await _commit(i, part);
      if (err != null) {
        problems.add(err);
        continue;
      }
      (_items.containsKey(i.id) ? updated : added).add(i.id);
      _items[i.id] = i;
      bytes += i.size;
    }
    await _accept(m);
    return ContentReport(added: added, updated: updated, unchanged: unchanged, problems: problems, bytes: bytes);
  }

  /// Checks [part] against [i] and moves it into place. An error message when it does not match.
  Future<String?> _commit(ContentItem i, File part) async {
    final len = await part.length();
    if (len != i.size) {
      await part.delete();
      return '${i.id}: the file is $len bytes, the manifest says ${i.size}';
    }
    if (await sha256OfFile(part) != i.sha256) {
      await part.delete();
      return '${i.id}: the file is damaged (its sha256 does not match)';
    }
    final dest = fileOf(i);
    // A different file name in a new version: the old file goes.
    final old = _items[i.id];
    if (old != null && fileOf(old).path != dest.path && await fileOf(old).exists()) await fileOf(old).delete();
    await part.rename(dest.path);
    return null;
  }

  /// Updates from [baseUrl]: reads `<baseUrl>/manifest.json` and downloads only the items that
  /// changed. Wi-Fi only. A download cut off half way carries on from where it stopped next time
  /// (the `.part` file is kept), and every file is sha-checked before it is used.
  Future<ContentReport> updateFromUrl({ContentFetcher? fetcher, void Function(String id, int done, int total)? onProgress}) async {
    if (baseUrl.isEmpty) throw const FormatException('Set the content address first.');
    if (!await contentOnWifi()) throw const FormatException('Connect the board to Wi-Fi to download content.');
    final f = fetcher ?? HttpContentFetcher();
    final base = Uri.parse(baseUrl.endsWith('/') ? baseUrl : '$baseUrl/');
    final m = ContentManifest.parse(await f.get(base.resolve('manifest.json')));
    final added = <String>[], updated = <String>[], problems = [...m.problems];
    var unchanged = 0, bytes = 0;
    for (final i in m.items) {
      if (!needs(i)) {
        unchanged++;
        continue;
      }
      final part = File('${fileOf(i).path}.part');
      await part.parent.create(recursive: true);
      var have = await part.exists() ? await part.length() : 0;
      if (have > i.size) {
        await part.delete();
        have = 0;
      }
      try {
        if (have < i.size) {
          final r = await f.getFrom(base.resolve(i.file), have);
          if (!r.partial) have = 0;
          final sink = part.openWrite(mode: have > 0 ? FileMode.append : FileMode.write);
          var done = have;
          await sink.addStream(
            r.body.map((c) {
              done += c.length;
              onProgress?.call(i.id, done, i.size);
              return c;
            }),
          );
          await sink.close();
          bytes += done - have;
        }
      } catch (e) {
        // The .part stays: the next update carries on from it.
        problems.add('${i.id}: the download stopped ($e)');
        continue;
      }
      final err = await _commit(i, part);
      if (err != null) {
        problems.add(err);
        continue;
      }
      (_items.containsKey(i.id) ? updated : added).add(i.id);
      _items[i.id] = i;
    }
    await _accept(m);
    return ContentReport(added: added, updated: updated, unchanged: unchanged, problems: problems, bytes: bytes);
  }

  /// Removes one item (Settings asks for the PIN first).
  Future<void> remove(String id) async {
    final i = _items.remove(id);
    if (i == null) return;
    final d = Directory('${root.path}/items/$id');
    if (await d.exists()) await d.delete(recursive: true);
    await _save();
    notifyListeners();
  }

  /// Removes everything installed (Settings asks for the PIN first).
  Future<void> removeAll() async {
    _items.clear();
    packTitle = revision = '';
    final d = Directory('${root.path}/items');
    if (await d.exists()) await d.delete(recursive: true);
    await _save();
    notifyListeners();
  }
}

/// "12.4 MB".
String contentSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}
