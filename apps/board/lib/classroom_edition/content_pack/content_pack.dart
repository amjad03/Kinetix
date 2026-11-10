import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';

import '../past_papers/paper_pack.dart' show safePackPath;

/// A content pack: concept videos, PhET sims, labs and interactive assets for the lessons,
/// installed from a USB stick or a URL so the board never streams in class. The format is in
/// README.md next to this file.
const contentPackFormat = 'zynetix-content-pack';

/// The newest manifest format this board reads.
const contentPackFormatVersion = 1;

enum ContentKind {
  video('video'),
  phet('phet'),
  lab('lab'),
  interactiveAsset('interactive-asset');

  const ContentKind(this.wire);
  final String wire;

  static ContentKind? parse(Object? s) => values.where((k) => k.wire == '$s').firstOrNull;
}

/// A chapter marker in a video: [seconds] from the start, and its title.
typedef VideoMarker = ({double seconds, String title});

/// One item of a pack, as its manifest lists it.
@immutable
class ContentItem {
  const ContentItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.file,
    required this.sha256,
    required this.size,
    required this.version,
    required this.chapterId,
    this.topics = const [],
    this.steps = const [],
    this.markers = const [],
    this.language = 'en',
  });

  final String id;
  final ContentKind kind;
  final String title;

  /// Its path in the pack (and under the base URL): "videos/phy-1-01.mp4".
  final String file;

  /// Lower-case hex SHA-256 of the file.
  final String sha256;
  final int size;

  /// The item's own version: a higher number replaces the installed copy.
  final int version;

  /// The lessons catalogue's chapter id ("phy1-ch01").
  final String chapterId;

  /// Catalogue topic ids ("phy1-ch01.t02") the item belongs to.
  final List<String> topics;

  /// Lesson step keys ("phy1-ch01.t02#3" or a block id) that show the item in place.
  final List<String> steps;

  /// Chapter markers (videos).
  final List<VideoMarker> markers;
  final String language;

  bool coversTopic(String topicId) => topics.contains(topicId);

  factory ContentItem.fromJson(Map<String, dynamic> j) {
    final id = '${j['id'] ?? ''}'.trim();
    if (id.isEmpty || !RegExp(r'^[a-zA-Z0-9._-]+$').hasMatch(id)) throw const FormatException('it has no id, or the id has spaces or slashes');
    final kind = ContentKind.parse(j['kind']);
    if (kind == null) throw FormatException('the kind "${j['kind']}" is not video, phet, lab or interactive-asset');
    final file = '${j['file'] ?? ''}';
    if (!safePackPath(file)) throw FormatException('its file "$file" is not a path inside the pack');
    final sha = '${j['sha256'] ?? ''}'.toLowerCase();
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(sha)) throw const FormatException('it has no sha256');
    final size = (j['size'] as num?)?.toInt();
    if (size == null || size < 0) throw const FormatException('it has no size');
    final topic = j['topic'];
    if (topic is! Map || '${topic['chapter'] ?? ''}'.isEmpty) throw const FormatException('it has no topic.chapter');
    return ContentItem(
      id: id,
      kind: kind,
      title: '${j['title'] ?? id}',
      file: file,
      sha256: sha,
      size: size,
      version: (j['version'] as num?)?.toInt() ?? 1,
      chapterId: '${topic['chapter']}',
      topics: [for (final t in (topic['topics'] as List?) ?? const []) '$t'],
      steps: [for (final s in (topic['steps'] as List?) ?? const []) '$s'],
      markers: [
        for (final m in (j['markers'] as List?) ?? const [])
          if (m is Map && m['t'] is num) (seconds: (m['t'] as num).toDouble(), title: '${m['title'] ?? ''}'),
      ]..sort((a, b) => a.seconds.compareTo(b.seconds)),
      language: '${j['language'] ?? 'en'}',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.wire,
    'title': title,
    'file': file,
    'sha256': sha256,
    'size': size,
    'version': version,
    'topic': {'chapter': chapterId, 'topics': topics, if (steps.isNotEmpty) 'steps': steps},
    if (markers.isNotEmpty) 'markers': [for (final m in markers) {'t': m.seconds, 'title': m.title}],
    'language': language,
  };
}

/// A pack's manifest.json.
@immutable
class ContentManifest {
  const ContentManifest({required this.id, required this.title, this.publisher = '', required this.revision, required this.items, this.problems = const []});

  final String id;
  final String title;
  final String publisher;

  /// The pack's own release ("2026.11"), shown in Settings.
  final String revision;
  final List<ContentItem> items;

  /// Items left out and why ("phy-1-01: it has no sha256").
  final List<String> problems;

  int get totalBytes => items.fold(0, (a, i) => a + i.size);

  /// Reads manifest.json. Throws [FormatException] when it is not a content pack this board
  /// reads; a broken item is left out and named in [problems].
  factory ContentManifest.parse(List<int> raw) {
    final Object? m;
    try {
      m = jsonDecode(utf8.decode(raw));
    } catch (_) {
      throw const FormatException('The pack’s manifest.json cannot be read.');
    }
    if (m is! Map || m['format'] != contentPackFormat) throw const FormatException('This is not a Zynetix content pack.');
    final v = (m['formatVersion'] as num?)?.toInt() ?? 0;
    if (v < 1) throw const FormatException('The content pack has no formatVersion.');
    if (v > contentPackFormatVersion) throw const FormatException('This content pack is for a newer Zynetix Classroom. Update the board first.');
    final list = m['items'];
    if (list is! List) throw const FormatException('The content pack has no items.');
    final items = <ContentItem>[], problems = <String>[], seen = <String>{};
    for (final (i, e) in list.indexed) {
      final name = e is Map && e['id'] != null ? '${e['id']}' : 'item ${i + 1}';
      try {
        if (e is! Map) throw const FormatException('it is not an object');
        final item = ContentItem.fromJson(e.cast<String, dynamic>());
        if (!seen.add(item.id)) throw const FormatException('its id is used twice');
        items.add(item);
      } on FormatException catch (x) {
        problems.add('$name: ${x.message}');
      }
    }
    return ContentManifest(id: '${m['id'] ?? ''}', title: '${m['title'] ?? 'Content pack'}', publisher: '${m['publisher'] ?? ''}', revision: '${m['revision'] ?? ''}', items: items, problems: problems);
  }

  Map<String, dynamic> toJson() => {
    'format': contentPackFormat,
    'formatVersion': contentPackFormatVersion,
    'id': id,
    'title': title,
    if (publisher.isNotEmpty) 'publisher': publisher,
    'revision': revision,
    'items': [for (final i in items) i.toJson()],
  };

  String encode() => const JsonEncoder.withIndent('  ').convert(toJson());
}

/// Writes a content pack zip (tests, and the tool that builds packs).
Uint8List writeContentPack(ContentManifest manifest, Map<String, List<int>> files) {
  final a = Archive()..add(ArchiveFile.string('manifest.json', manifest.encode()));
  for (final e in files.entries) {
    a.add(ArchiveFile.bytes(e.key, e.value));
  }
  return ZipEncoder().encodeBytes(a);
}
