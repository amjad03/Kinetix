import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/academics_models.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart' show parseDay;
import '../../core/l10n.dart';
import '../../core/work_models.dart' show numText;
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

String thesisStageText(AppLocalizations l, String s) => switch (s) {
  'synopsis' => l.thesisStageSynopsis,
  'draft' => l.thesisStageDraft,
  'submitted' => l.thesisStageSubmitted,
  'examination' => l.thesisStageExamination,
  'viva' => l.thesisStageViva,
  'awarded' => l.thesisStageAwarded,
  _ => s,
};

String resStatusText(AppLocalizations l, String s) => switch (s) {
  'active' => l.resStatusActive,
  'on_hold' => l.resStatusOnHold,
  'completed' => l.resStatusCompleted,
  'cancelled' => l.resStatusCancelled,
  _ => s,
};

String resKindText(AppLocalizations l, String s) => switch (s) {
  'research' => l.resKindResearch,
  'capstone' => l.resKindCapstone,
  'industry' => l.resKindIndustry,
  _ => s,
};

String programmeText(AppLocalizations l, String s) => switch (s) {
  'phd' => l.programmePhd,
  'mphil' => l.programmeMphil,
  _ => s,
};

String scholarStatusText(AppLocalizations l, String s) => switch (s) {
  'enrolled' => l.scholarEnrolled,
  'thesis_submitted' => l.scholarThesisSubmitted,
  'awarded' => l.scholarAwarded,
  'withdrawn' => l.scholarWithdrawn,
  _ => s,
};

String publicationKindText(AppLocalizations l, String s) => switch (s) {
  'journal' => l.pubKindJournal,
  'conference' => l.pubKindConference,
  'book' => l.pubKindBook,
  'book_chapter' => l.pubKindChapter,
  _ => s,
};

String vivaOutcomeText(AppLocalizations l, String s) => switch (s) {
  'passed' || 'pass' => l.vivaPassed,
  'revise' => l.vivaRevise,
  'failed' || 'fail' => l.vivaFailed,
  _ => s,
};

String vivaStatusText(AppLocalizations l, String s) => switch (s) {
  'held' => l.vivaHeld,
  'cancelled' => l.vivaCancelled,
  _ => l.vivaScheduled,
};

/// "Open", "Restricted" or "Embargoed until 1 Jan" for a dataset.
String datasetAccessText(AppLocalizations l, Fmt f, ResearchDataset d) => switch (d.access) {
  'open' => l.accessOpen,
  'embargoed' => d.embargoUntil == null ? l.accessEmbargoed : l.accessEmbargoedUntil(f.shortDay(parseDay(d.embargoUntil!))),
  _ => l.accessRestricted,
};

/// My research: projects, the scholars I supervise with their theses, publications and datasets.
class ResearchScreen extends StatelessWidget {
  const ResearchScreen({super.key, required this.api, required this.userId});

  final TeacherApi api;
  final String userId;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.researchTitle),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(key: const Key('tabResProjects'), text: l.researchProjects),
              Tab(key: const Key('tabResScholars'), text: l.researchScholars),
              Tab(key: const Key('tabResPublications'), text: l.researchPublications),
              Tab(key: const Key('tabResDatasets'), text: l.researchDatasets),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _ProjectsTab(api: api),
            _ScholarsTab(api: api),
            _PublicationsTab(api: api, userId: userId),
            _DatasetsTab(api: api),
          ],
        ),
      ),
    );
  }
}

class _ProjectsTab extends StatelessWidget {
  const _ProjectsTab({required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<List<ResearchProject>>(
      load: api.researchProjects,
      isEmpty: (rows) => rows.isEmpty,
      empty: l.researchProjectsEmpty,
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          for (final p in rows)
            ListTile(
              key: Key('resProject-${p.id}'),
              leading: const Icon(Icons.science_outlined),
              title: Text(p.title),
              subtitle: Text(
                '${p.code} · ${resKindText(l, p.kind)} · ${resStatusText(l, p.status)}\n'
                '${f.shortDay(parseDay(p.startsOn))}${p.endsOn == null ? '' : ' – ${f.shortDay(parseDay(p.endsOn!))}'}',
              ),
              isThreeLine: true,
            ),
        ],
      ),
    );
  }
}

class _ScholarsTab extends StatefulWidget {
  const _ScholarsTab({required this.api});

  final TeacherApi api;

  @override
  State<_ScholarsTab> createState() => _ScholarsTabState();
}

class _ScholarsTabState extends State<_ScholarsTab> {
  int _round = 0;

  Future<void> _open(Scholar s, ThesisRow? thesis) async {
    if (thesis != null) {
      await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => ThesisScreen(api: widget.api, thesisId: thesis.id, title: s.fullName)));
      if (mounted) setState(() => _round++);
      return;
    }
    final l = context.l10n;
    final title = TextEditingController(text: s.thesisTitle ?? '');
    final abstract = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.thesisOpen),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(key: const Key('thesisTitle'), controller: title, decoration: InputDecoration(labelText: l.thesisTitleLabel)),
              const SizedBox(height: Kx.s12),
              TextField(key: const Key('thesisAbstract'), controller: abstract, maxLines: 4, decoration: InputDecoration(labelText: l.thesisAbstract)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmOpenThesis'), onPressed: () => Navigator.pop(ctx, title.text.trim().length >= 3), child: Text(l.thesisOpen)),
        ],
      ),
    );
    if (ok == true && mounted && await runOrSnack(context, () => widget.api.openThesis(s.id, title: title.text.trim(), abstract: abstract.text.trim())) && mounted) {
      setState(() => _round++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AsyncBody<(List<Scholar>, List<ThesisRow>)>(
      key: ValueKey(_round),
      load: () async => (await widget.api.researchScholars(), await widget.api.researchTheses()),
      isEmpty: (d) => d.$1.isEmpty,
      empty: l.researchScholarsEmpty,
      builder: (context, data, reload) {
        final (scholars, theses) = data;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final s in scholars)
              () {
                // The theses list names the scholar rather than giving an id.
                final t = theses.where((t) => t.scholar == s.fullName && t.programme == s.programme).firstOrNull;
                return ListTile(
                  key: Key('scholar-${s.id}'),
                  leading: const Icon(Icons.school_outlined),
                  title: Text(s.fullName),
                  subtitle: Text('${programmeText(l, s.programme)} · ${scholarStatusText(l, s.status)}\n${t == null ? l.thesisNone : '${l.thesisStageLabel}: ${thesisStageText(l, t.stage)}'}'),
                  isThreeLine: true,
                  trailing: Icon(t == null ? Icons.add : Icons.chevron_right),
                  onTap: () => _open(s, t),
                );
              }(),
          ],
        );
      },
    );
  }
}

/// One thesis: its stage, similarity check, history and vivas; a supervisor can submit it from draft.
class ThesisScreen extends StatefulWidget {
  const ThesisScreen({super.key, required this.api, required this.thesisId, required this.title});

  final TeacherApi api;
  final String thesisId, title;

  @override
  State<ThesisScreen> createState() => _ThesisScreenState();
}

class _ThesisScreenState extends State<ThesisScreen> {
  int _round = 0;

  Future<void> _submit(ThesisDetail t) async {
    final l = context.l10n;
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.thesisSubmit),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.thesisSubmitBody),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('thesisNote'), controller: note, maxLength: 500, decoration: InputDecoration(labelText: l.remarkOptional)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmSubmitThesis'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.thesisSubmit)),
        ],
      ),
    );
    if (ok == true && mounted && await runOrSnack(context, () => widget.api.moveThesisStage(t.id, to: 'submitted', note: note.text.trim())) && mounted) {
      setState(() => _round++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: AsyncBody<ThesisDetail>(
        key: ValueKey(_round),
        load: () => widget.api.researchThesis(widget.thesisId),
        builder: (context, t, reload) {
          final at = thesisStages.indexOf(t.stage);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: Kx.s32),
            children: [
              Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.title, key: const Key('thesisHeading'), style: context.text.titleMedium),
                    Text('${t.scholarName} · ${programmeText(l, t.programme)}'),
                    const SizedBox(height: Kx.s12),
                    Wrap(
                      spacing: Kx.s8,
                      runSpacing: Kx.s4,
                      children: [
                        for (final (i, s) in thesisStages.indexed)
                          Chip(
                            key: Key('stage-$s'),
                            avatar: i < at ? const Icon(Icons.check, size: 16) : null,
                            label: Text(thesisStageText(l, s)),
                            backgroundColor: i == at ? context.colors.primaryContainer : null,
                            labelStyle: i == at ? TextStyle(fontWeight: FontWeight.w600, color: context.colors.onPrimaryContainer) : null,
                          ),
                      ],
                    ),
                    if (t.abstract.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(t.abstract)),
                    const SizedBox(height: Kx.s12),
                    Text(
                      t.similarityPercent == null ? l.similarityNone : l.similarityScore(numText(t.similarityPercent!), numText(t.similarityLimit)),
                      key: const Key('similarity'),
                      style: context.text.bodyMedium?.copyWith(color: t.similarityPercent != null && t.similarityPercent! > t.similarityLimit ? context.colors.error : null),
                    ),
                  ],
                ),
              ),
              if (t.canSubmit)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      FilledButton.icon(key: const Key('submitThesis'), onPressed: t.hasText ? () => _submit(t) : null, icon: const Icon(Icons.upload_file_outlined), label: Text(l.thesisSubmit)),
                      if (!t.hasText) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.thesisNeedsText, key: const Key('thesisNeedsText'))),
                    ],
                  ),
                ),
              KxSectionHeader(l.thesisVivas),
              if (t.vivas.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.thesisVivasNone)),
              for (final v in t.vivas)
                ListTile(
                  key: Key('thesisViva-${v.id}'),
                  title: Text(v.scheduledAt == null ? vivaStatusText(l, v.status) : '${f.when(v.scheduledAt!)} · ${vivaStatusText(l, v.status)}'),
                  subtitle: Text([
                    if (v.venue.isNotEmpty) v.venue,
                    if (v.panel.isNotEmpty) v.panel.join(', '),
                    if (v.outcome != null) vivaOutcomeText(l, v.outcome!),
                    if ((v.remarks ?? '').isNotEmpty) v.remarks!,
                  ].join('\n')),
                ),
              KxSectionHeader(l.thesisHistory),
              for (final e in t.events)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.circle, size: 10),
                  title: Text(thesisStageText(l, e.stage)),
                  subtitle: Text([if (e.at != null) f.shortDay(e.at!), if (e.note.isNotEmpty) e.note].join(' · ')),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _PublicationsTab extends StatefulWidget {
  const _PublicationsTab({required this.api, required this.userId});

  final TeacherApi api;
  final String userId;

  @override
  State<_PublicationsTab> createState() => _PublicationsTabState();
}

class _PublicationsTabState extends State<_PublicationsTab> {
  int _round = 0;

  Future<void> _addByDoi() async {
    final l = context.l10n;
    final doi = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.pubAddByDoi),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.pubDoiBody),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('doiField'), controller: doi, autofocus: true, decoration: const InputDecoration(labelText: 'DOI', hintText: '10.1000/xyz123')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmImportDoi'), onPressed: () => Navigator.pop(ctx, doi.text.trim().length >= 5), child: Text(l.pubImport)),
        ],
      ),
    );
    if (ok == true && mounted && await runOrSnack(context, () => widget.api.importPublicationDoi(doi.text.trim())) && mounted) {
      setState(() => _round++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AsyncBody<List<Publication>>(
      key: ValueKey(_round),
      load: () => widget.api.researchPublications(ownerUserId: widget.userId),
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.all(Kx.s16),
            child: Align(alignment: Alignment.centerLeft, child: FilledButton.icon(key: const Key('addByDoi'), onPressed: _addByDoi, icon: const Icon(Icons.add_link), label: Text(l.pubAddByDoi))),
          ),
          if (rows.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.researchPublicationsEmpty, key: const Key('emptyState'))),
          for (final p in rows)
            ListTile(
              key: Key('publication-${p.id}'),
              leading: const Icon(Icons.article_outlined),
              title: Text(p.title),
              subtitle: Text('${p.venue} · ${p.year} · ${publicationKindText(l, p.kind)}${p.doi == null ? '' : '\nDOI ${p.doi}'}'),
              isThreeLine: p.doi != null,
            ),
        ],
      ),
    );
  }
}

class _DatasetsTab extends StatelessWidget {
  const _DatasetsTab({required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final c = context.colors;
    return AsyncBody<List<ResearchDataset>>(
      load: api.researchDatasets,
      isEmpty: (rows) => rows.isEmpty,
      empty: l.researchDatasetsEmpty,
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          for (final d in rows)
            ListTile(
              key: Key('dataset-${d.id}'),
              leading: const Icon(Icons.dataset_outlined),
              title: Text(d.title),
              isThreeLine: true,
              // The access label sits under the title: a long "Embargoed until ..." would squeeze the title in a trailing slot.
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${d.owner} · ${d.license} · ${l.datasetFiles(d.files)}'),
                  const SizedBox(height: Kx.s4),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Pill(
                      datasetAccessText(l, f, d),
                      background: d.canOpen ? goodColors(context).$1 : c.surfaceContainerHighest,
                      foreground: d.canOpen ? goodColors(context).$2 : c.onSurface,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
