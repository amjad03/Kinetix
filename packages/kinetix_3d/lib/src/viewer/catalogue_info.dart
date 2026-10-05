import 'manifest.dart';

part 'catalogue_data.dart';

/// What the app knows about a viewer model before opening it: enough to list it, search
/// for it and link lessons to it. Ids are stable (topics in the content library and
/// imported lessons refer to them).
class ViewerModelInfo {
  const ViewerModelInfo({
    required this.id,
    required this.subject,
    required this.title,
    required this.summary,
    this.classes = const [],
    this.keywords = const [],
    this.variants = const [],
    this.credit = '',
  });

  final String id;

  /// Biology, Physics, Chemistry, Geography, Space or Maths.
  final String subject;
  final LocalText title;
  final LocalText summary;

  /// The classes (school years) it is used in.
  final List<int> classes;
  final List<String> keywords;

  /// Its versions (each solid, each element), if any.
  final List<String> variants;
  final String credit;

  /// Made from BodyParts3D (CC BY 4.0), which must be credited where it is shown.
  bool get fromBodyParts3D => credit.contains('BodyParts3D');

  /// The library picture.
  String get thumbAsset => 'packages/kinetix_3d/$viewerAssets/thumbs/$id.jpg';

  /// How well [text] (a topic, a chapter title, a question) matches this model: 0 means
  /// not at all. Whole words only, so "heartily" is not "heart".
  int matches(String text) {
    final t = ' ${text.toLowerCase().replaceAll(RegExp(r'[^a-z0-9ऀ-෿]+'), ' ')} ';
    var score = 0;
    for (final k in [title.en, ...keywords]) {
      final w = k.toLowerCase().replaceAll(RegExp(r'[^a-z0-9ऀ-෿]+'), ' ').trim();
      if (w.isEmpty) continue;
      if (t.contains(' $w ') || t.contains(' ${w}s ')) score += w.contains(' ') ? 3 : 2;
    }
    return score;
  }

  /// Every model the three.js viewer can show, in library order.
  static const List<ViewerModelInfo> all = _viewerModels;

  static ViewerModelInfo? byId(String id) => all.where((m) => m.id == id).firstOrNull;

  /// The best model for a topic or question, if any fits.
  static ViewerModelInfo? bestFor(String text) {
    ViewerModelInfo? best;
    var score = 0;
    for (final m in all) {
      final s = m.matches(text);
      if (s > score) {
        score = s;
        best = m;
      }
    }
    return best;
  }
}
