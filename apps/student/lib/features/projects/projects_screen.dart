import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/pathways.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';
import 'project_workspace_screen.dart';

String projectKindLabel(AppLocalizations l, String k) => switch (k) {
  'capstone' => l.pjKind_capstone,
  'research' => l.pjKind_research,
  'minor' => l.pjKind_minor,
  'major' => l.pjKind_major,
  'internship' => l.pjKind_internship,
  _ => k.isEmpty ? l.pjKind_project : k.replaceAll('_', ' '),
};

String projectStatusLabel(AppLocalizations l, String s) => switch (s) {
  'active' => l.pjStatus_active,
  'completed' => l.pjStatus_completed,
  'on_hold' => l.pjStatus_on_hold,
  'proposed' => l.pjStatus_proposed,
  _ => s.replaceAll('_', ' '),
};

String thesisStageLabel(AppLocalizations l, String s) => switch (s) {
  'synopsis' => l.thesisStage_synopsis,
  'draft' => l.thesisStage_draft,
  'submitted' => l.thesisStage_submitted,
  'examination' => l.thesisStage_examination,
  'viva' => l.thesisStage_viva,
  'awarded' => l.thesisStage_awarded,
  _ => s,
};

/// Projects and research: my projects (with the thesis of a research scholar), finding a team,
/// the showcase with peer reviews, and my portfolio.
class ProjectsScreen extends StatelessWidget {
  const ProjectsScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProjectsScreen(api: api)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.pjTitle),
          bottom: TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [Tab(text: l.pjTabMine), Tab(text: l.pjTabFind), Tab(text: l.pjTabShowcase), Tab(text: l.pjTabPortfolio)]),
        ),
        body: TabBarView(children: [_MineTab(api: api), _FindTab(api: api), _ShowcaseTab(api: api), _PortfolioTab(api: api)]),
      ),
    );
  }
}

class _MineTab extends StatelessWidget {
  const _MineTab({required this.api});

  final StudentApi api;

  /// The projects, and the thesis when the student is a research scholar (a failure there is not shown).
  Future<(List<ProjectSummary>, Thesis?)> _load() async {
    final projects = await api.myProjects();
    Thesis? thesis;
    try {
      thesis = await api.myThesis();
    } on ApiException {
      thesis = null;
    }
    return (projects, thesis);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadBody<(List<ProjectSummary>, Thesis?)>(
      load: _load,
      builder: (context, data, reload) {
        final (projects, thesis) = data;
        return [
          if (thesis != null) _ThesisCard(thesis: thesis),
          if (projects.isEmpty && thesis == null) EmptyNote(l.pjNoneMine),
          for (final p in projects)
            KxCard(
              key: Key('project-${p.id}'),
              onTap: () => ProjectWorkspaceScreen.open(context, api, p.id),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.title, style: context.text.titleSmall),
                        Text([p.code, projectKindLabel(l, p.kind), projectStatusLabel(l, p.status)].where((s) => s.isNotEmpty).join(' · '), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                        if (p.showcase || p.recruiting)
                          Padding(
                            padding: const EdgeInsets.only(top: Kx.s8),
                            child: Wrap(
                              spacing: Kx.s8,
                              children: [
                                if (p.showcase) Pill(l.pjOnShowcase, icon: Icons.star_outline, background: kxTone(context, KxTone.success).bg, foreground: kxTone(context, KxTone.success).fg),
                                if (p.recruiting) Pill(l.pjRecruiting, icon: Icons.group_add_outlined, background: kxTone(context, KxTone.primary).bg, foreground: kxTone(context, KxTone.primary).fg),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
        ];
      },
    );
  }
}

class _ThesisCard extends StatelessWidget {
  const _ThesisCard({required this.thesis});

  final Thesis thesis;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final next = thesis.vivas.where((v) => v.status == 'scheduled' && v.at != null).firstOrNull;
    final tone = kxTone(context, thesis.stage == 'awarded' ? KxTone.success : KxTone.primary);
    return KxCard(
      key: const Key('thesisCard'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [const Icon(Icons.school_outlined), const SizedBox(width: Kx.s8), Expanded(child: Text(l.thesisTitle, style: context.text.titleSmall))]),
          const SizedBox(height: Kx.s8),
          Text(thesis.title, style: context.text.bodyLarge),
          const SizedBox(height: Kx.s8),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            children: [
              Pill(thesisStageLabel(l, thesis.stage), key: const Key('thesisStage'), background: tone.bg, foreground: tone.fg),
              if (thesis.submittedOn != null) Text(l.thesisSubmittedOn(dayText(context, thesis.submittedOn)), style: context.text.bodyMedium),
            ],
          ),
          if (next != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.thesisNextViva(context.fmt.dateTime(next.at!), next.venue), key: const Key('thesisViva'))),
          if (thesis.similarityPercent != null)
            Padding(
              padding: const EdgeInsets.only(top: Kx.s4),
              child: Text(l.thesisSimilarity(thesis.similarityPercent!.round(), (thesis.similarityLimit ?? 0).round()), key: const Key('thesisSimilarity')),
            ),
        ],
      ),
    );
  }
}

class _FindTab extends StatefulWidget {
  const _FindTab({required this.api});

  final StudentApi api;

  @override
  State<_FindTab> createState() => _FindTabState();
}

class _FindTabState extends State<_FindTab> {
  final _skill = TextEditingController();
  String _query = '';
  Key _key = UniqueKey();

  @override
  void dispose() {
    _skill.dispose();
    super.dispose();
  }

  void _search() => setState(() {
    _query = _skill.text.trim();
    _key = UniqueKey();
  });

  Future<void> _join(DiscoverProject p) async {
    final l = context.l10n;
    final r = await askFields(
      context,
      title: l.pjJoinTitle(p.title),
      fields: [FieldSpec('joinMessage', l.pjJoinMessage, multiline: true, maxLength: 500)],
      confirmLabel: l.send,
      confirmKey: 'sendJoin',
    );
    if (r == null || !mounted) return;
    await attempt(context, () => widget.api.joinProject(p.id, r['joinMessage']!), done: l.pjJoinSent);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, 0),
          child: TextField(
            key: const Key('skillSearch'),
            controller: _skill,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(labelText: l.pjSkillSearch, suffixIcon: IconButton(key: const Key('skillSearchGo'), icon: const Icon(Icons.search), onPressed: _search)),
          ),
        ),
        Expanded(
          child: LoadBody<List<DiscoverProject>>(
            key: _key,
            load: () => widget.api.discoverProjects(skill: _query),
            builder: (context, list, reload) => [
              if (list.isEmpty) EmptyNote(l.pjNoneFind),
              for (final p in list)
                KxCard(
                  key: Key('discover-${p.id}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(p.title, style: context.text.titleSmall)),
                          if (p.lookingFor.isNotEmpty) Pill(l.pjFit(p.fit), background: kxTone(context, p.fit >= 50 ? KxTone.success : KxTone.neutral).bg, foreground: kxTone(context, p.fit >= 50 ? KxTone.success : KxTone.neutral).fg),
                        ],
                      ),
                      Text('${projectKindLabel(l, p.kind)} · ${p.pi}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                      if (p.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(p.summary)),
                      if (p.lookingFor.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.pjLookingFor(p.lookingFor.join(', ')))),
                      Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.pjOpenings(p.openings))),
                      Align(alignment: Alignment.centerRight, child: FilledButton.tonal(key: Key('join-${p.id}'), onPressed: () => _join(p), child: Text(l.pjAskToJoin))),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ShowcaseTab extends StatelessWidget {
  const _ShowcaseTab({required this.api});

  final StudentApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadBody<List<ShowcaseProject>>(
      load: api.showcaseProjects,
      builder: (context, list, reload) => [
        if (list.isEmpty) EmptyNote(l.pjNoneShowcase),
        for (final p in list)
          KxCard(
            key: Key('showcase-${p.id}'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.title, style: context.text.titleSmall),
                Text('${projectKindLabel(l, p.kind)} · ${p.pi}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                if (p.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(p.summary)),
                if (p.outcomeSummary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(p.outcomeSummary)),
                Row(
                  children: [
                    if (p.reviewAverage != null) Text(l.pjReviewAverage(p.reviewAverage!.round()), style: context.text.titleSmall),
                    const Spacer(),
                    FilledButton.tonal(key: Key('review-${p.id}'), onPressed: () => _review(context, p, reload), child: Text(l.pjReview)),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _review(BuildContext context, ShowcaseProject p, Future<void> Function() reload) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => PeerReviewSheet(api: api, project: p),
    );
    if (sent == true && context.mounted) {
      say(context, context.l10n.pjReviewThanks);
      await reload();
    }
  }
}

/// A peer review of a showcase project: four criteria scored 0 to 5 and a comment.
class PeerReviewSheet extends StatefulWidget {
  const PeerReviewSheet({super.key, required this.api, required this.project});

  final StudentApi api;
  final ShowcaseProject project;

  @override
  State<PeerReviewSheet> createState() => _PeerReviewSheetState();
}

class _PeerReviewSheetState extends State<PeerReviewSheet> {
  final _scores = {for (final c in peerCriteria) c: 3};
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    final ok = await attempt(context, () => widget.api.peerReviewProject(widget.project.id, rubric: _scores, comment: _comment.text.trim()));
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.pjReviewTitle(widget.project.title), style: context.text.titleMedium),
            const SizedBox(height: Kx.s8),
            for (final c in peerCriteria)
              Row(
                children: [
                  Expanded(flex: 3, child: Text(criterionLabel(l, c))),
                  Expanded(
                    flex: 5,
                    child: Slider(key: Key('score-$c'), value: _scores[c]!.toDouble(), min: 0, max: peerMaxScore.toDouble(), divisions: peerMaxScore, label: '${_scores[c]}', onChanged: _busy ? null : (v) => setState(() => _scores[c] = v.round())),
                  ),
                  SizedBox(width: 28, child: Text('${_scores[c]}', textAlign: TextAlign.end)),
                ],
              ),
            TextField(key: const Key('reviewComment'), controller: _comment, maxLines: 3, maxLength: 2000, decoration: InputDecoration(labelText: l.pjReviewComment)),
            const SizedBox(height: Kx.s8),
            SizedBox(width: double.infinity, child: FilledButton(key: const Key('sendReview'), onPressed: _busy ? null : _send, child: Text(l.send))),
          ],
        ),
      ),
    );
  }
}

/// The criterion names the server stores are English; the app words the ones it knows.
String criterionLabel(AppLocalizations l, String c) => switch (c) {
  'Idea' => l.pjCriterion_idea,
  'Execution' => l.pjCriterion_execution,
  'Presentation' => l.pjCriterion_presentation,
  'Impact' => l.pjCriterion_impact,
  _ => c,
};

class _PortfolioTab extends StatefulWidget {
  const _PortfolioTab({required this.api});

  final StudentApi api;

  @override
  State<_PortfolioTab> createState() => _PortfolioTabState();
}

class _PortfolioTabState extends State<_PortfolioTab> {
  final _body = GlobalKey<LoadBodyState<List<PortfolioItem>>>();

  Future<void> _add() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PortfolioForm(api: widget.api),
    );
    if (added == true) await _body.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(key: const Key('addPortfolio'), onPressed: _add, icon: const Icon(Icons.add), label: Text(l.pjAddPortfolio)),
      body: LoadBody<List<PortfolioItem>>(
        key: _body,
        load: widget.api.portfolio,
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
        builder: (context, items, reload) => [
          Text(l.pjPortfolioNote, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          if (items.isEmpty) EmptyNote(l.pjNonePortfolio),
          for (final i in items)
            KxCard(
              key: Key('portfolio-${i.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(i.title, style: context.text.titleSmall)),
                      IconButton(
                        key: Key('deletePortfolio-${i.id}'),
                        tooltip: l.pjDelete,
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          if (await attempt(context, () => widget.api.deletePortfolioItem(i.id))) await reload();
                        },
                      ),
                    ],
                  ),
                  Text(portfolioKindLabel(l, i.kind), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  if (i.summary.isNotEmpty) Text(i.summary),
                  if (i.url != null) Text(i.url!, style: context.text.bodySmall?.copyWith(color: context.colors.primary)),
                  SwitchListTile(
                    key: Key('publish-${i.id}'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(l.pjPublished),
                    subtitle: Text(i.published ? l.pjPublishedOn : l.pjPublishedOff),
                    value: i.published,
                    onChanged: (v) async {
                      if (await attempt(context, () => widget.api.publishPortfolioItem(i.id, v))) await reload();
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

String portfolioKindLabel(AppLocalizations l, String k) => switch (k) {
  'research' => l.pjPortfolio_research,
  'certificate' => l.pjPortfolio_certificate,
  'work' => l.pjPortfolio_work,
  _ => l.pjPortfolio_project,
};

class _PortfolioForm extends StatefulWidget {
  const _PortfolioForm({required this.api});

  final StudentApi api;

  @override
  State<_PortfolioForm> createState() => _PortfolioFormState();
}

class _PortfolioFormState extends State<_PortfolioForm> {
  final _title = TextEditingController();
  final _summary = TextEditingController();
  final _url = TextEditingController();
  String _kind = 'project';
  bool _published = false;
  bool _busy = false;
  String? _problem;

  @override
  void dispose() {
    _title.dispose();
    _summary.dispose();
    _url.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l = context.l10n;
    final url = _url.text.trim();
    if (_title.text.trim().isEmpty) return setState(() => _problem = l.pjNeedTitle);
    if (url.isNotEmpty && !(Uri.tryParse(url)?.hasScheme ?? false)) return setState(() => _problem = l.pjNeedUrl);
    setState(() {
      _busy = true;
      _problem = null;
    });
    final ok = await attempt(context, () => widget.api.addPortfolioItem(title: _title.text.trim(), summary: _summary.text.trim(), url: url.isEmpty ? null : url, kind: _kind, published: _published));
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.pjAddPortfolio, style: context.text.titleMedium),
            TextField(key: const Key('pfTitle'), controller: _title, maxLength: 160, decoration: InputDecoration(labelText: l.pjFieldTitle)),
            TextField(key: const Key('pfSummary'), controller: _summary, maxLines: 3, maxLength: 1000, decoration: InputDecoration(labelText: l.pjFieldSummary)),
            TextField(key: const Key('pfUrl'), controller: _url, keyboardType: TextInputType.url, decoration: InputDecoration(labelText: l.pjFieldLink)),
            const SizedBox(height: Kx.s8),
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: InputDecoration(labelText: l.pjFieldKind),
              items: [for (final k in const ['project', 'research', 'certificate', 'work']) DropdownMenuItem(value: k, child: Text(portfolioKindLabel(l, k)))],
              onChanged: (v) => setState(() => _kind = v ?? 'project'),
            ),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(l.pjPublished), value: _published, onChanged: (v) => setState(() => _published = v)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(_problem!, style: TextStyle(color: context.colors.error))),
            SizedBox(width: double.infinity, child: FilledButton(key: const Key('savePortfolio'), onPressed: _busy ? null : _save, child: Text(l.save))),
          ],
        ),
      ),
    );
  }
}
