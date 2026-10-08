import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// The child's Student Outcome Passport: skills with level, certificates, clubs and events, and
/// the printable PDF.
class PassportScreen extends StatelessWidget {
  const PassportScreen({super.key, required this.api, required this.child, this.openFile = openWithSystem});

  final ParentApi api;
  final Child child;
  final OpenFile openFile;

  Future<void> _pdf(BuildContext context) async {
    final l = context.l10n;
    try {
      final bytes = await api.passportPdf(child.id);
      final ok = await openFile(bytes, 'outcome-passport.pdf', 'application/pdf');
      if (!ok && context.mounted) say(context, l.fileOpenFailed);
    } catch (e) {
      if (context.mounted) say(context, context.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<OutcomePassport>(
      title: l.passportTitle(child.firstName),
      load: () => api.passport(child.id),
      builder: (context, p, reload) => [
        Pill(
          p.verified ? l.passportVerified : l.passportNotVerified,
          icon: p.verified ? Icons.verified_outlined : Icons.hourglass_empty,
          background: p.verified ? Theme.of(context).colorScheme.secondaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
          foreground: p.verified ? Theme.of(context).colorScheme.onSecondaryContainer : context.colors.onSurfaceVariant,
        ),
        const SizedBox(height: Kx.s8),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(key: const Key('passportPdf'), onPressed: () => _pdf(context), icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.passportDownload)),
        ),
        Heading(l.passportSkills),
        if (p.skills.isEmpty) EmptyNote(l.passportNoSkills),
        for (final s in p.skills)
          Card(
            key: Key('skill-${s.code}'),
            child: ListTile(
              title: Text(s.name),
              subtitle: Text([if (s.category.isNotEmpty) s.category, l.passportEvidence(s.evidence)].join(' · ')),
              trailing: Text(s.level == null ? l.passportNoLevel : l.passportLevel(s.level!), style: context.text.titleSmall),
            ),
          ),
        if (p.certificates.isNotEmpty) ...[
          Heading(l.passportCertificates),
          for (final c in p.certificates) Card(child: ListTile(leading: const Icon(Icons.workspace_premium_outlined), title: Text(c.title), subtitle: Text(l.passportIssued(context.fmt.date(c.issuedOn))))),
        ],
        if (p.clubs.isNotEmpty || p.events.isNotEmpty) ...[
          Heading(l.passportActivities),
          Text(context.fmt.list([...p.clubs, ...p.events]), key: const Key('passportActivities'), style: context.text.bodyLarge),
        ],
      ],
    );
  }
}
