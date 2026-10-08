import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// A child's health profile, nurse visits and vaccinations. Read only: the school keeps the record.
class HealthScreen extends StatelessWidget {
  const HealthScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<HealthRecord>(
      title: l.healthTitle(child.firstName),
      load: () => api.health(child.id),
      builder: (context, h, reload) {
        final p = h.profile;
        Widget fact(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: Kx.s8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
              Text(value.isEmpty ? l.healthNone : value, style: context.text.bodyLarge),
            ],
          ),
        );
        return [
          Text(l.healthReadOnly, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          if (p == null)
            EmptyNote(l.healthNoProfile)
          else
            Card(
              key: const Key('healthProfile'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    fact(l.healthBlood, p.bloodGroup ?? ''),
                    fact(l.healthAllergies, context.fmt.list(p.allergies)),
                    fact(l.healthConditions, context.fmt.list(p.conditions)),
                    fact(l.healthMedications, context.fmt.list(p.medications)),
                    fact(l.healthContacts, [for (final c in p.contacts) '${c.name} (${c.relation}) ${c.phone}'].join('\n')),
                    if (p.notes.isNotEmpty) fact(l.healthNotes, p.notes),
                  ],
                ),
              ),
            ),
          Heading(l.healthVisits),
          if (h.visits.isEmpty) EmptyNote(l.healthNoVisits),
          for (final v in h.visits)
            Card(
              key: Key('visit-${v.id}'),
              child: ListTile(
                title: Text(v.complaint),
                subtitle: Text([context.fmt.dateTime(v.at), if (v.action.isNotEmpty) v.action].join('\n')),
                isThreeLine: v.action.isNotEmpty,
                trailing: v.sentHome ? Pill(l.healthSentHome, background: Theme.of(context).colorScheme.errorContainer, foreground: Theme.of(context).colorScheme.onErrorContainer) : null,
              ),
            ),
          Heading(l.healthVaccinations),
          if (h.vaccinations.isEmpty) EmptyNote(l.healthNoVaccinations),
          for (final v in h.vaccinations)
            Card(
              key: Key('vaccine-${v.id}'),
              child: ListTile(
                title: Text(v.dose.isEmpty ? v.vaccine : '${v.vaccine} · ${v.dose}'),
                subtitle: Text([context.fmt.date(v.givenOn), if (v.nextDueOn != null) l.healthNextDue(context.fmt.date(v.nextDueOn!))].join(' · ')),
              ),
            ),
        ];
      },
    );
  }
}
