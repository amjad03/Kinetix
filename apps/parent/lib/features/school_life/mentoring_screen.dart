import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family_care.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import 'load_view.dart';

/// The child's mentor and what each mentoring session covered (the mentor's private notes stay
/// with the mentor), with the next follow-up.
class MentoringScreen extends StatelessWidget {
  const MentoringScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  static Future<void> open(BuildContext context, ParentApi api, Child child) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MentoringScreen(api: api, child: child)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<MentoringView>(
      title: l.mnTitle(child.firstName),
      load: () => api.mentoring(child.id),
      builder: (context, m, _) {
        final c = context.colors;
        return [
          KxCard(
            key: const Key('mentorCard'),
            child: Row(
              children: [
                const KxIconBox(Icons.support_agent_outlined),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: m.mentorName == null
                      ? Text(l.mnNoMentor(child.firstName), style: context.text.bodyLarge)
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m.mentorName!, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                            if (m.startedOn != null) Text(l.mnSince(context.fmt.date(m.startedOn!)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          ],
                        ),
                ),
              ],
            ),
          ),
          Heading(l.mnSessions),
          if (m.sessions.isEmpty) EmptyNote(l.mnNoSessions),
          for (final (i, s) in m.sessions.indexed)
            Card(
              key: Key('session-$i'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(switch (s.mode) { 'phone' => Icons.call_outlined, 'online' => Icons.videocam_outlined, _ => Icons.groups_outlined }, size: 18, color: c.primary),
                        const SizedBox(width: Kx.s8),
                        Expanded(child: Text(context.fmt.longDay(s.heldOn), style: context.text.titleSmall)),
                      ],
                    ),
                    if (s.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(s.summary, style: context.text.bodyMedium)),
                    if (s.followUpOn != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.mnFollowUp(context.fmt.shortDay(s.followUpOn!)), style: context.text.bodySmall?.copyWith(color: c.primary))),
                  ],
                ),
              ),
            ),
          Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.mnPrivacy, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
        ];
      },
    );
  }
}
