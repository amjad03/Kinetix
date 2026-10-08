import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

String domainName(AppLocalizations l, String domain) => switch (domain) {
  'physical' => l.eyDomainPhysical,
  'language' => l.eyDomainLanguage,
  'cognitive' => l.eyDomainCognitive,
  'social_emotional' => l.eyDomainSocial,
  'creative' => l.eyDomainCreative,
  _ => domain,
};

String _statusName(AppLocalizations l, String status) => switch (status) {
  'achieved' => l.eyAchieved,
  'developing' => l.eyDeveloping,
  _ => l.eyEmerging,
};

/// A young child's developmental milestones, the teacher's observations with photos, and the
/// learning story of a term as a PDF.
class EarlyYearsScreen extends StatelessWidget {
  const EarlyYearsScreen({super.key, required this.api, required this.child, this.openFile = openWithSystem});

  final ParentApi api;
  final Child child;
  final OpenFile openFile;

  Future<void> _story(BuildContext context) async {
    final l = context.l10n;
    try {
      final terms = await api.terms();
      if (!context.mounted) return;
      final term = await showDialog<TermInfo>(
        context: context,
        builder: (ctx) => SimpleDialog(
          title: Text(l.eyChooseTerm),
          children: [for (final t in terms) SimpleDialogOption(key: Key('term-${t.id}'), onPressed: () => Navigator.pop(ctx, t), child: Text(t.name))],
        ),
      );
      if (term == null) return;
      final bytes = await api.learningStoryPdf(child.id, term.id);
      final ok = await openFile(bytes, 'learning-story-${term.name}.pdf', 'application/pdf');
      if (!ok && context.mounted) say(context, l.fileOpenFailed);
    } catch (e) {
      if (context.mounted) say(context, context.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<EarlyYearsView>(
      title: l.earlyYearsTitle(child.firstName),
      load: () => api.earlyYears(child.id),
      builder: (context, v, reload) {
        final scheme = Theme.of(context).colorScheme;
        return [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: OutlinedButton.icon(key: const Key('learningStory'), onPressed: () => _story(context), icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.eyStory)),
          ),
          Heading(l.eyMilestones),
          if (v.milestones.isEmpty) EmptyNote(l.eyNone),
          for (final domain in earlyYearsDomains)
            if (v.milestones.any((m) => m.domain == domain)) ...[
              Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(domainName(l, domain), style: context.text.titleSmall)),
              for (final m in v.milestones.where((m) => m.domain == domain))
                ListTile(
                  key: Key('milestone-${m.id}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(m.title),
                  trailing: Pill(
                    _statusName(l, m.status),
                    background: m.status == 'achieved' ? scheme.secondaryContainer : scheme.surfaceContainerHighest,
                    foreground: m.status == 'achieved' ? scheme.onSecondaryContainer : context.colors.onSurfaceVariant,
                  ),
                ),
            ],
          Heading(l.eyObservations),
          if (v.observations.isEmpty) EmptyNote(l.eyNone),
          for (final o in v.observations)
            Card(
              key: Key('observation-${o.id}'),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (o.hasPhoto) _Photo(api: api, childId: child.id, observationId: o.id),
                  Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${domainName(l, o.domain)} · ${context.fmt.date(o.date)}', style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
                        Text(o.note, style: context.text.bodyLarge),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ];
      },
    );
  }
}

/// An observation photo, fetched with the signed-in token.
class _Photo extends StatelessWidget {
  const _Photo({required this.api, required this.childId, required this.observationId});

  final ParentApi api;
  final String childId;
  final String observationId;

  @override
  Widget build(BuildContext context) {
    final image = api.photo('/v1/parent/children/$childId/early-years/observations/$observationId/photo');
    final fallback = Container(height: 120, color: context.colors.surfaceContainerHighest, child: const Icon(Icons.image_outlined, size: 40));
    return SizedBox(
      key: Key('photo-$observationId'),
      height: 200,
      child: image == null ? fallback : Image(image: image, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback),
    );
  }
}
