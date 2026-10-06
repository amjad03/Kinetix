import 'package:flutter/material.dart';

import 'strings.dart';

/// The badges a teacher can award (the API's `badge` values), with their names in each language.
enum KxBadge {
  dazzlingPerformer('dazzling_performer', Icons.auto_awesome, Color(0xFFE6A100), 'Dazzling Performer', 'शानदार प्रदर्शन', 'ಅದ್ಭುತ ಸಾಧಕ'),
  goodAttempt('good_attempt', Icons.thumb_up_alt_outlined, Color(0xFF2E7D32), 'Good Attempt', 'अच्छा प्रयास', 'ಉತ್ತಮ ಪ್ರಯತ್ನ'),
  aspiringStudent('aspiring_student', Icons.trending_up, Color(0xFF00838F), 'Aspiring Student', 'उभरता विद्यार्थी', 'ಆಕಾಂಕ್ಷಿ ವಿದ್ಯಾರ್ಥಿ'),
  obedientStudent('obedient_student', Icons.verified_outlined, Color(0xFF5E35B1), 'Obedient Student', 'आज्ञाकारी विद्यार्थी', 'ವಿಧೇಯ ವಿದ್ಯಾರ್ಥಿ'),
  outstandingSpeaker('outstanding_speaker', Icons.record_voice_over_outlined, Color(0xFFC62828), 'Outstanding Speaker', 'उत्कृष्ट वक्ता', 'ಅತ್ಯುತ್ತಮ ಭಾಷಣಕಾರ'),
  masterOfMaths('master_of_maths', Icons.calculate_outlined, Color(0xFF1565C0), 'Master of Maths', 'गणित का उस्ताद', 'ಗಣಿತ ಪರಿಣತ'),
  creativeMind('creative_mind', Icons.palette_outlined, Color(0xFFAD1457), 'Creative Mind', 'रचनात्मक सोच', 'ಸೃಜನಶೀಲ ಮನಸ್ಸು'),
  youngScientist('young_scientist', Icons.science_outlined, Color(0xFF00695C), 'Young Scientist', 'युवा वैज्ञानिक', 'ಯುವ ವಿಜ್ಞಾನಿ'),
  mostCurious('most_curious', Icons.lightbulb_outline, Color(0xFFEF6C00), 'Most Curious', 'सबसे जिज्ञासु', 'ಅತ್ಯಂತ ಕುತೂಹಲಿ'),
  bestLeader('best_leader', Icons.emoji_events_outlined, Color(0xFF6D4C41), 'Best Leader', 'सर्वश्रेष्ठ नेता', 'ಅತ್ಯುತ್ತಮ ನಾಯಕ');

  const KxBadge(this.api, this.icon, this.color, this._en, this._hi, this._kn);

  /// The value the API uses.
  final String api;
  final IconData icon;
  final Color color;
  final String _en;
  final String _hi;
  final String _kn;

  /// The badge's name in [language] (en, hi or kn; anything else is English).
  String name(String? language) => switch (language) {
    'hi' => _hi,
    'kn' => _kn,
    _ => _en,
  };

  /// The badge's name in the ambient language.
  String nameIn(BuildContext context) => name(Localizations.maybeLocaleOf(context)?.languageCode);

  static KxBadge? fromApi(String? value) {
    for (final b in values) {
      if (b.api == value) return b;
    }
    return null;
  }
}

/// A round medal for a badge, with an optional count.
class KxBadgeMedal extends StatelessWidget {
  const KxBadgeMedal({super.key, required this.badge, this.size = 48, this.count});

  final KxBadge badge;
  final double size;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final medal = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: badge.color.withValues(alpha: dark ? 0.3 : 0.14),
        border: Border.all(color: badge.color, width: size / 16),
      ),
      child: Icon(badge.icon, size: size * 0.5, color: dark ? Color.lerp(badge.color, Colors.white, 0.4) : badge.color),
    );
    if (count == null || count! < 2) return Semantics(label: badge.nameIn(context), child: medal);
    return Semantics(
      label: '${badge.nameIn(context)} ×$count',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          medal,
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(color: badge.color, borderRadius: BorderRadius.circular(10)),
              child: Text('×$count', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens a sheet of the ten badges; returns the one chosen (or null).
Future<KxBadge?> showKxBadgePicker(BuildContext context, {required String title}) {
  return showModalBottomSheet<KxBadge>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: MediaQuery.sizeOf(ctx).width > 600 ? 5 : 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 0.9,
              children: [
                for (final b in KxBadge.values)
                  InkWell(
                    key: Key('badge-${b.api}'),
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => Navigator.pop(ctx, b),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          KxBadgeMedal(badge: b, size: 52),
                          const SizedBox(height: 6),
                          Text(b.nameIn(ctx), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(ctx).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

/// One badge a student received, for [KxBadgeShelf].
class KxBadgeEntry {
  const KxBadgeEntry({required this.badge, required this.teacher, required this.awardedAt, this.subject});

  final KxBadge badge;
  final String teacher;
  final String? subject;
  final DateTime awardedAt;
}

/// A student's badges: one medal per kind with how many, newest kind first. Tapping a medal
/// lists who awarded it and when.
class KxBadgeShelf extends StatelessWidget {
  const KxBadgeShelf({super.key, required this.entries, required this.formatDate});

  final List<KxBadgeEntry> entries;
  final String Function(DateTime) formatDate;

  @override
  Widget build(BuildContext context) {
    final s = KxStrings.of(context);
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    if (entries.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(s.noBadges, key: const Key('noBadges'), style: text.bodyMedium?.copyWith(color: colors.onSurfaceVariant)),
      );
    }
    final byKind = <KxBadge, List<KxBadgeEntry>>{};
    for (final e in [...entries]..sort((a, b) => b.awardedAt.compareTo(a.awardedAt))) {
      byKind.putIfAbsent(e.badge, () => []).add(e);
    }
    return SizedBox(
      height: 112,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          for (final MapEntry(key: badge, value: list) in byKind.entries)
            InkWell(
              key: Key('shelf-${badge.api}'),
              borderRadius: BorderRadius.circular(16),
              onTap: () => showModalBottomSheet<void>(
                context: context,
                showDragHandle: true,
                builder: (ctx) => SafeArea(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      ListTile(
                        leading: KxBadgeMedal(badge: badge, size: 40),
                        title: Text(badge.nameIn(ctx), style: Theme.of(ctx).textTheme.titleLarge),
                      ),
                      for (final e in list)
                        ListTile(
                          dense: true,
                          title: Text(s.badgeFrom(e.teacher)),
                          subtitle: Text([?e.subject, formatDate(e.awardedAt)].join(' · ')),
                        ),
                    ],
                  ),
                ),
              ),
              child: SizedBox(
                width: 96,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Column(
                    children: [
                      const SizedBox(height: 6),
                      KxBadgeMedal(badge: badge, size: 52, count: list.length),
                      const SizedBox(height: 6),
                      Text(badge.nameIn(context), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.bodySmall),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The "New badge!" toast shown when one arrives.
void showKxBadgeToast(BuildContext context, KxBadge badge, {String? teacher}) {
  final s = KxStrings.of(context);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        key: const Key('badgeToast'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 6),
        content: Row(
          children: [
            KxBadgeMedal(badge: badge, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.newBadge(badge.nameIn(context)), style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (teacher != null) Text(s.badgeFrom(teacher)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
}
