import 'dart:convert';

import 'package:flutter/services.dart';

/// One PhET HTML5 sim from the bundled catalogue (assets/phet/catalogue.json, built by
/// tools/phet/build-catalogue.mjs).
class PhetSim {
  const PhetSim({
    required this.id,
    required this.titles,
    required this.subject,
    required this.topics,
    required this.levels,
    required this.keywords,
    required this.locales,
    required this.sizeBytes,
    this.sizeEstimated = false,
    this.thumb,
  });

  factory PhetSim.fromJson(Map<String, dynamic> j) => PhetSim(
    id: j['id'] as String,
    titles: (j['title'] as Map).cast<String, String>(),
    subject: j['subject'] as String,
    topics: (j['topics'] as List).cast<String>(),
    levels: (j['levels'] as List).cast<String>(),
    keywords: ((j['keywords'] as List?) ?? const []).cast<String>(),
    locales: (j['locales'] as List).cast<String>(),
    sizeBytes: j['sizeBytes'] as int,
    sizeEstimated: j['sizeEstimated'] as bool? ?? false,
    thumb: j['thumb'] as String?,
  );

  final String id;

  /// en always; hi and kn where PhET has the sim translated.
  final Map<String, String> titles;
  final String subject;
  final List<String> topics;

  /// Our class levels: '6'…'12', 'UG'.
  final List<String> levels;

  /// Words that tie the sim to syllabus topics and labs ([PhetCatalogue.related]).
  final List<String> keywords;

  /// Every locale the sim's all-locales file has.
  final List<String> locales;
  final int sizeBytes;
  final bool sizeEstimated;

  /// A bundled asset path, or null.
  final String? thumb;

  String title(String lang) => titles[lang] ?? titles['en']!;

  /// The board's language when the sim has it, else English.
  String localeFor(String lang) => locales.contains(lang) ? lang : 'en';
}

/// The bundled catalogue of PhET sims.
class PhetCatalogue {
  PhetCatalogue(this.sims) : _byId = {for (final s in sims) s.id: s};

  factory PhetCatalogue.fromJson(Map<String, dynamic> j) =>
      PhetCatalogue([for (final s in j['sims'] as List) PhetSim.fromJson((s as Map).cast<String, dynamic>())]);

  static const asset = 'assets/phet/catalogue.json';
  static Future<PhetCatalogue>? _loaded;

  /// The bundled catalogue, read once.
  static Future<PhetCatalogue> load([AssetBundle? bundle]) =>
      _loaded ??= (bundle ?? rootBundle)
          .load(asset)
          // Decoded here rather than by loadString, which hands big files to an isolate.
          .then((d) => PhetCatalogue.fromJson(jsonDecode(utf8.decode(d.buffer.asUint8List(d.offsetInBytes, d.lengthInBytes))) as Map<String, dynamic>));

  /// Tests that give their own catalogue.
  static set debugCatalogue(PhetCatalogue? c) => _loaded = c == null ? null : Future.value(c);

  static const levelOrder = ['6', '7', '8', '9', '10', '11', '12', 'UG'];
  static const subjectOrder = ['physics', 'chemistry', 'biology', 'maths', 'earth-science'];

  final List<PhetSim> sims;
  final Map<String, PhetSim> _byId;

  PhetSim? operator [](String id) => _byId[id];

  List<String> get subjects => [for (final s in subjectOrder) if (sims.any((x) => x.subject == s)) s];

  /// The topics of [subject] (all subjects when null), in the order they first appear.
  List<String> topicsOf(String? subject) => {
    for (final s in sims)
      if (subject == null || s.subject == subject) ...s.topics,
  }.toList()..sort();

  /// Sims matching the dropdowns (null = any).
  List<PhetSim> filter({String? subject, String? topic, String? level}) => [
    for (final s in sims)
      if ((subject == null || s.subject == subject) && (topic == null || s.topics.contains(topic)) && (level == null || s.levels.contains(level))) s,
  ];

  /// Sims whose keywords (or English title) appear in [text] (a syllabus topic's title, chapter
  /// and summary, or a lab's name), best first. A keyword matches as whole words, plurals too
  /// ("acid" in "Acids, Bases and Salts").
  List<PhetSim> related(String text, {int max = 6, String? level}) {
    final hay = ' ${_normal(text)} ';
    if (hay.trim().isEmpty) return const [];
    final scored = <(PhetSim, int)>[];
    for (final s in sims) {
      if (level != null && !s.levels.contains(level)) continue;
      var score = 0;
      for (final k in [...s.keywords, s.titles['en']!]) {
        final n = _normal(k);
        if (n.length < 2) continue;
        if (RegExp('\\b${RegExp.escape(n)}(s|es)?\\b').hasMatch(hay)) score += n.contains(' ') ? 3 : 2;
      }
      if (score > 0) scored.add((s, score));
    }
    scored.sort((a, b) => b.$2 != a.$2 ? b.$2.compareTo(a.$2) : a.$1.id.compareTo(b.$1.id));
    return [for (final x in scored.take(max)) x.$1];
  }

  static String _normal(String s) => s.toLowerCase().replaceAll(RegExp(r"[’']"), "'").replaceAll(RegExp(r"[^a-z0-9' ]+"), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
}
