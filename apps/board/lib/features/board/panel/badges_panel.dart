import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/api_client.dart';
import '../../../core/board_controller.dart';
import '../../../core/models.dart';
import '../../../demo/demo.dart';
import '../../toolkit/toolkit_controller.dart' show demoClassNames;
import '../chrome.dart';
import '../layout/layout_strings.dart';
import '../side_panel.dart' show PanelPage;

/// The ten badges a teacher can give (BrightClass-style rewards). Sent as `badge` to
/// POST /v1/badges.
const badgeTypes = ['star', 'helper', 'creative', 'curious', 'teamwork', 'leader', 'punctual', 'neat', 'improved', 'champion'];

IconData badgeIcon(String id) => switch (id) {
  'star' => Icons.star_rounded,
  'helper' => Icons.volunteer_activism,
  'creative' => Icons.palette,
  'curious' => Icons.psychology_alt,
  'teamwork' => Icons.groups,
  'leader' => Icons.flag,
  'punctual' => Icons.schedule,
  'neat' => Icons.auto_awesome,
  'improved' => Icons.trending_up,
  _ => Icons.emoji_events,
};

Color badgeColor(String id) => switch (id) {
  'star' => const Color(0xFFF9AB00),
  'helper' => const Color(0xFF188038),
  'creative' => const Color(0xFF9334E6),
  'curious' => const Color(0xFF1A73E8),
  'teamwork' => const Color(0xFF12B5CB),
  'leader' => const Color(0xFFD93025),
  'punctual' => const Color(0xFF5F6368),
  'neat' => const Color(0xFFE52592),
  'improved' => const Color(0xFF0B8043),
  _ => const Color(0xFFE8710A),
};

/// Award a badge: the period's students and the ten badges, in the split panel.
class BadgesPanel extends StatefulWidget {
  const BadgesPanel({super.key, required this.board});

  final BoardController board;

  @override
  State<BadgesPanel> createState() => _BadgesPanelState();
}

class _BadgesPanelState extends State<BadgesPanel> {
  String? _student;
  String _badge = badgeTypes.first;
  bool _sending = false;

  /// The class's students; a demo board with no class open uses the demo class.
  List<Student> get _students {
    final roster = widget.board.pickable;
    if (roster.isNotEmpty || !Demo.enabled) return roster;
    return [for (final (i, n) in demoClassNames.indexed) Student(id: 'demo-student-$i', rollNo: '${i + 1}', fullName: n)];
  }

  Future<void> _award() async {
    final s = LayoutStrings.of(context);
    final api = widget.board.api;
    final student = _students.where((x) => x.id == _student).firstOrNull;
    if (student == null) return;
    if (api == null) {
      showBoardMessage(context, s.badgeFailed);
      return;
    }
    setState(() => _sending = true);
    try {
      await api.awardBadge(student.id, _badge, sectionId: widget.board.session?.sectionId);
      if (mounted) showBoardMessage(context, s.awarded(s.badgeName(_badge), student.fullName));
    } on ApiException catch (_) {
      if (mounted) showBoardMessage(context, s.badgeFailed);
    } catch (_) {
      if (mounted) showBoardMessage(context, s.badgeFailed);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final students = _students;
    return PanelPage(
      icon: Icons.emoji_events_outlined,
      title: s.awardBadge,
      accent: const Color(0xFFF9AB00),
      child: students.isEmpty
          ? KxEmptyState(key: const Key('badges-no-class'), icon: Icons.groups_outlined, message: s.badgeNoClass)
          : ListView(
              key: const Key('badges-panel'),
              padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
              children: [
                Wrap(
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  children: [
                    for (final b in badgeTypes)
                      ChoiceChip(
                        key: Key('badge-$b'),
                        avatar: Icon(badgeIcon(b), color: badgeColor(b), size: 20),
                        label: Text(s.badgeName(b)),
                        selected: _badge == b,
                        onSelected: (_) => setState(() => _badge = b),
                      ),
                  ],
                ),
                const SizedBox(height: Kx.s16),
                Text(s.student, style: context.text.titleSmall),
                const SizedBox(height: Kx.s8),
                RadioGroup<String>(
                  groupValue: _student,
                  onChanged: (v) => setState(() => _student = v),
                  child: Column(
                    children: [
                      for (final st in students)
                        RadioListTile<String>(
                          key: Key('badge-student-${st.id}'),
                          value: st.id,
                          dense: true,
                          title: Text(st.fullName),
                          subtitle: Text(st.rollNo),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
                FilledButton.icon(
                  key: const Key('badge-award'),
                  onPressed: _student == null || _sending ? null : _award,
                  icon: Icon(badgeIcon(_badge)),
                  label: Text(s.award),
                ),
              ],
            ),
    );
  }
}
