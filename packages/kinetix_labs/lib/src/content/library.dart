import 'dart:convert';

import '../core/i18n.dart';
import '../core/lab.dart';
import 'labs_data.g.dart';

/// All virtual labs' text, compiled into the package (no assets, no network).
class LabLibrary {
  final List<VirtualLab> labs;
  LabLibrary(this.labs) : _byId = {for (final l in labs) l.id: l};

  final Map<String, VirtualLab> _byId;

  static LabLibrary? _instance;

  /// The library, parsed on first use.
  static LabLibrary get instance => _instance ??= LabLibrary([
        for (final l in (jsonDecode(labsJson) as Map<String, dynamic>)['labs'] as List) VirtualLab.fromJson((l as Map).cast<String, dynamic>()),
      ]);

  VirtualLab? byId(String id) => _byId[id];

  /// Subjects in library order.
  List<String> get subjects => {for (final l in labs) l.subject}.toList();

  /// Labs that fit [text], best first.
  List<VirtualLab> matching(String text) =>
      [for (final l in labs) if (l.matches(text) > 0) l]..sort((a, b) => b.matches(text).compareTo(a.matches(text)));

  /// Labs for the catalogue: any of [domains], any of [levels], and every
  /// word of [query] found in the title, summary or keywords (in any of the
  /// three languages).
  List<VirtualLab> filter({Set<LabDomain> domains = const {}, Set<LabLevel> levels = const {}, String? subject, LabMode? mode, String query = ''}) {
    final words = query.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    bool hit(VirtualLab l) {
      if (domains.isNotEmpty && !domains.contains(l.domain)) return false;
      if (levels.isNotEmpty && !l.levels.any(levels.contains)) return false;
      if (subject != null && l.subject != subject) return false;
      if (mode != null && l.mode != mode) return false;
      if (words.isEmpty) return true;
      final hay = [
        for (final lang in LabLang.values) ...[l.title.of(lang), l.summary.of(lang)],
        ...l.keywords,
        l.id,
      ].join(' ').toLowerCase();
      return words.every(hay.contains);
    }

    return [for (final l in labs) if (hit(l)) l];
  }
}
