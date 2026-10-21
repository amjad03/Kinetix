/// The shapes of `GET /v1/topics/:id/resources`. Parsing is tolerant: unknown kinds, providers
/// and sources fall back to something sensible, missing fields stay null, and an entry that
/// cannot be read is skipped rather than failing the whole list.
library;

/// Where a video plays from.
enum VideoProvider {
  youtube,

  /// Any web address (Vimeo, a college site...).
  url,

  /// Uploaded to the institution's own server: it plays on the campus network without internet.
  upload;

  static VideoProvider parse(Object? v) => switch (v) {
    'youtube' => VideoProvider.youtube,
    'upload' => VideoProvider.upload,
    _ => VideoProvider.url,
  };
}

/// Who mapped the resource to the topic.
enum ResourceSource {
  platform,
  institution,
  teacher;

  static ResourceSource parse(Object? v) => switch (v) {
    'institution' => ResourceSource.institution,
    'teacher' => ResourceSource.teacher,
    _ => ResourceSource.platform,
  };
}

enum MaterialKind {
  pdf,
  book,
  syllabus,
  link,
  model3d,
  sim;

  static MaterialKind parse(Object? v) => MaterialKind.values.asNameMap()[v] ?? MaterialKind.link;
}

final _youtubeId = RegExp(r'^[A-Za-z0-9_-]{11}$');

/// The YouTube id in [link] (a bare id, youtu.be/…, youtube.com/watch?v=…, /embed/…, /shorts/…,
/// /live/…), or null.
String? youtubeIdOf(String? link) {
  if (link == null) return null;
  final s = link.trim();
  if (_youtubeId.hasMatch(s)) return s;
  final uri = Uri.tryParse(s.contains('://') ? s : 'https://$s');
  if (uri == null) return null;
  final host = uri.host.toLowerCase().replaceFirst('www.', '').replaceFirst('m.', '');
  String? id;
  if (host == 'youtu.be') {
    id = uri.pathSegments.isEmpty ? null : uri.pathSegments.first;
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    id = uri.queryParameters['v'];
    final seg = uri.pathSegments;
    if (id == null && seg.length >= 2 && const {'embed', 'shorts', 'live', 'v'}.contains(seg[0])) id = seg[1];
  }
  return id != null && _youtubeId.hasMatch(id) ? id : null;
}

String? _str(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : (v is String ? int.tryParse(v) : null);

class ResourceVideo {
  const ResourceVideo({required this.id, required this.title, required this.provider, this.youtubeId, this.url, this.durationSec, this.source = ResourceSource.platform});

  static ResourceVideo? tryParse(Object? j) {
    if (j is! Map) return null;
    final title = _str(j['title']);
    final url = _str(j['url']);
    // The older concept-videos shape calls it youtubeVideoId.
    final yt = _str(j['youtubeId']) ?? _str(j['youtubeVideoId']) ?? youtubeIdOf(url);
    var provider = j['provider'] == null && yt != null ? VideoProvider.youtube : VideoProvider.parse(j['provider']);
    if (provider == VideoProvider.youtube && yt == null) provider = VideoProvider.url;
    if (title == null || (yt == null && url == null)) return null;
    return ResourceVideo(
      id: _str(j['id']) ?? yt ?? url!,
      title: title,
      provider: provider,
      youtubeId: provider == VideoProvider.youtube ? yt : null,
      url: url,
      durationSec: _int(j['durationSec']) ?? _int(j['durationSeconds']),
      source: ResourceSource.parse(j['source']),
    );
  }

  final String id;
  final String title;
  final VideoProvider provider;
  final String? youtubeId;
  final String? url;
  final int? durationSec;
  final ResourceSource source;

  /// YouTube and web videos need the internet; an upload plays from the institution's server.
  bool get needsInternet => provider != VideoProvider.upload;

  /// Where to watch it outside the app.
  String? get watchUrl => youtubeId != null ? 'https://www.youtube.com/watch?v=$youtubeId' : url;

  String? get thumbnailUrl => youtubeId == null ? null : 'https://i.ytimg.com/vi/$youtubeId/mqdefault.jpg';

  /// 4:05 or 1:02:03; empty when unknown.
  String get durationLabel {
    final s = durationSec;
    if (s == null || s <= 0) return '';
    final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = (s % 60).toString().padLeft(2, '0');
    return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$sec' : '$m:$sec';
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'provider': provider.name,
    'youtubeId': ?youtubeId,
    'url': ?url,
    'durationSec': ?durationSec,
    'source': source.name,
  };
}

/// Pages [first]..[last] (1-based, inclusive).
class PageRange {
  const PageRange(this.first, this.last);

  /// "12-30", "12–30", "12", [12, 30], {from: 12, to: 30} or {start, end}.
  static PageRange? tryParse(Object? v) {
    int? a, b;
    if (v is num) {
      a = b = v.toInt();
    } else if (v is String) {
      final m = RegExp(r'^\s*(\d+)\s*(?:[-–—to]+\s*(\d+))?\s*$').firstMatch(v);
      if (m == null) return null;
      a = int.parse(m[1]!);
      b = m[2] == null ? a : int.parse(m[2]!);
    } else if (v is List && v.isNotEmpty) {
      a = _int(v.first);
      b = v.length > 1 ? _int(v[1]) : a;
    } else if (v is Map) {
      a = _int(v['from'] ?? v['start'] ?? v['first']);
      b = _int(v['to'] ?? v['end'] ?? v['last']) ?? a;
    }
    if (a == null || b == null || a < 1) return null;
    return a <= b ? PageRange(a, b) : PageRange(b, a);
  }

  final int first;
  final int last;
  int get count => last - first + 1;

  @override
  String toString() => first == last ? '$first' : '$first–$last';

  @override
  bool operator ==(Object other) => other is PageRange && other.first == first && other.last == last;

  @override
  int get hashCode => Object.hash(first, last);
}

class ResourceMaterial {
  const ResourceMaterial({required this.id, required this.kind, required this.title, this.url, this.bookId, this.chapter, this.pages});

  static ResourceMaterial? tryParse(Object? j) {
    if (j is! Map) return null;
    final title = _str(j['title']);
    if (title == null) return null;
    return ResourceMaterial(
      id: _str(j['id']) ?? title,
      kind: MaterialKind.parse(j['kind']),
      title: title,
      url: _str(j['url']),
      bookId: _str(j['bookId']),
      chapter: _str(j['chapter']) ?? (j['chapter'] is num ? '${j['chapter']}' : null),
      pages: PageRange.tryParse(j['pages']),
    );
  }

  final String id;
  final MaterialKind kind;
  final String title;
  final String? url;
  final String? bookId;
  final String? chapter;
  final PageRange? pages;

  /// A PDF to draw page by page (a PDF, a book or a syllabus document with a .pdf address, or
  /// one without an address type but with pages).
  bool get isPdf {
    final u = url?.toLowerCase().split('?').first ?? '';
    if (kind == MaterialKind.pdf) return true;
    if (kind == MaterialKind.book || kind == MaterialKind.syllabus) return u.endsWith('.pdf') || (url != null && pages != null);
    return u.endsWith('.pdf');
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'kind': kind.name,
    'title': title,
    'url': ?url,
    'bookId': ?bookId,
    'chapter': ?chapter,
    if (pages != null) 'pages': '${pages!.first}-${pages!.last}',
  };
}

/// One of the built-in animations (packages/kinetix_animations), by its id.
class ResourceAnimation {
  const ResourceAnimation({required this.key, required this.title});

  static ResourceAnimation? tryParse(Object? j) {
    if (j is String) return ResourceAnimation(key: j, title: j);
    if (j is! Map) return null;
    final key = _str(j['key']) ?? _str(j['id']);
    if (key == null) return null;
    return ResourceAnimation(key: key, title: _str(j['title']) ?? key);
  }

  final String key;
  final String title;

  Map<String, Object?> toJson() => {'key': key, 'title': title};
}

class TopicResources {
  const TopicResources({this.videos = const [], this.materials = const [], this.animations = const []});

  static const empty = TopicResources();

  factory TopicResources.fromJson(Object? j) {
    if (j is! Map) return empty;
    List<T> list<T>(Object? v, T? Function(Object?) parse) => [
      if (v is List)
        for (final e in v) ?parse(e),
    ];
    return TopicResources(
      videos: list(j['videos'], ResourceVideo.tryParse),
      materials: list(j['materials'], ResourceMaterial.tryParse),
      animations: list(j['animations'], ResourceAnimation.tryParse),
    );
  }

  final List<ResourceVideo> videos;
  final List<ResourceMaterial> materials;
  final List<ResourceAnimation> animations;

  bool get isEmpty => videos.isEmpty && materials.isEmpty && animations.isEmpty;

  Map<String, Object?> toJson() => {
    'videos': [for (final v in videos) v.toJson()],
    'materials': [for (final m in materials) m.toJson()],
    'animations': [for (final a in animations) a.toJson()],
  };
}

/// A topic of a subject's syllabus, for the topic picker.
class TopicRef {
  const TopicRef({required this.id, required this.title, this.chapter});

  final String id;
  final String title;
  final String? chapter;

  /// The topics of a syllabus outline (`GET /v1/content/syllabus`: {chapters: [{title, topics: [{id, title}]}]}).
  static List<TopicRef> fromOutline(Object? outline) => [
    if (outline is Map && outline['chapters'] is List)
      for (final c in outline['chapters'] as List)
        if (c is Map && c['topics'] is List)
          for (final t in c['topics'] as List)
            if (t is Map && t['id'] is String && t['title'] is String) TopicRef(id: t['id'] as String, title: t['title'] as String, chapter: c['title'] as String?),
  ];
}
