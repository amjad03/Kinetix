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
import 'research_screens.dart' show resKindText, resStatusText, vivaOutcomeText, vivaStatusText;

String projectRoleText(AppLocalizations l, String role) => switch (role) {
  'admin' => l.projRoleAdmin,
  'pi' => l.projRolePi,
  'supervisor' || 'co_supervisor' => l.projRoleSupervisor,
  'student' => l.projRoleStudent,
  _ => l.projRoleMember,
};

String reviewKindText(AppLocalizations l, String kind) => switch (kind) {
  'peer' => l.projReviewPeer,
  'external' => l.projReviewExternal,
  _ => l.projReviewMentor,
};

String joinStatusText(AppLocalizations l, String s) => switch (s) {
  'accepted' => l.projAccepted,
  'declined' => l.projDeclined,
  _ => l.projPending,
};

/// "python, Flutter ,," into ["python", "Flutter"].
List<String> splitList(String text) => [for (final p in text.split(RegExp('[,;\n]'))) if (p.trim().isNotEmpty) p.trim()];

/// The projects I mentor or take part in.
class ProjectsScreen extends StatelessWidget {
  const ProjectsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.projectsTitle)),
      body: AsyncBody<List<MyProject>>(
        load: api.myProjects,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.projectsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final p in rows)
              ListTile(
                key: Key('project-${p.id}'),
                leading: const Icon(Icons.engineering_outlined),
                title: Text(p.title),
                subtitle: Wrap(
                  spacing: Kx.s8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text('${p.code} · ${resKindText(l, p.kind)} · ${resStatusText(l, p.status)}'),
                    if (p.showcase) Pill(l.projShowcase, background: c.tertiaryContainer, foreground: c.onTertiaryContainer),
                    if (p.recruiting) Pill(l.projRecruiting, background: goodColors(context).$1, foreground: goodColors(context).$2),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => ProjectWorkspaceScreen(api: api, project: p))),
              ),
          ],
        ),
      ),
    );
  }
}

/// One project's workspace: overview, discussion, reviews, and (for mentors) the showcase and recruiting hub.
class ProjectWorkspaceScreen extends StatelessWidget {
  const ProjectWorkspaceScreen({super.key, required this.api, required this.project});

  final TeacherApi api;
  final MyProject project;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(project.title)),
      body: AsyncBody<ProjectWorkspace>(
        load: () => api.projectWorkspace(project.id),
        builder: (context, w, reload) => DefaultTabController(
          length: w.isMentor ? 4 : 3,
          child: Column(
            children: [
              TabBar(
                isScrollable: true,
                tabs: [
                  Tab(key: const Key('tabProjOverview'), text: l.projTabOverview),
                  Tab(key: const Key('tabProjDiscussion'), text: l.projTabDiscussion),
                  Tab(key: const Key('tabProjReviews'), text: l.projTabReviews),
                  if (w.isMentor) Tab(key: const Key('tabProjTeam'), text: l.projTabTeam),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _OverviewTab(api: api, workspace: w),
                    _DiscussionTab(api: api, projectId: w.id),
                    _ReviewsTab(api: api, workspace: w),
                    if (w.isMentor) _TeamTab(api: api, workspace: w),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OverviewTab extends StatefulWidget {
  const _OverviewTab({required this.api, required this.workspace});

  final TeacherApi api;
  final ProjectWorkspace workspace;

  @override
  State<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<_OverviewTab> {
  late ProjectWorkspace _w = widget.workspace;

  Future<void> _refresh() async {
    try {
      final fresh = await widget.api.projectWorkspace(_w.id);
      if (mounted) setState(() => _w = fresh);
    } on ApiException {
      // Keep what is shown; pull-to-refresh elsewhere retries.
    }
  }

  Future<void> _addLink() async {
    final l = context.l10n;
    final title = TextEditingController();
    final url = TextEditingController();
    var invalid = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(l.projAddLink),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(key: const Key('linkTitle'), controller: title, decoration: InputDecoration(labelText: l.projLinkTitle)),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('linkUrl'), controller: url, keyboardType: TextInputType.url, decoration: InputDecoration(labelText: l.projLinkUrl, errorText: invalid ? l.projLinkInvalid : null)),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
            FilledButton(
              key: const Key('confirmAddLink'),
              onPressed: () {
                if (title.text.trim().isEmpty || !url.text.trim().startsWith('http')) {
                  setLocal(() => invalid = true);
                } else {
                  Navigator.pop(ctx, true);
                }
              },
              child: Text(l.save),
            ),
          ],
        ),
      ),
    );
    if (ok == true && mounted && await runOrSnack(context, () => widget.api.addProjectLink(_w.id, title: title.text.trim(), url: url.text.trim())) && mounted) {
      await _refresh();
    }
  }

  Future<void> _schedule() async {
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ScheduleVivaScreen(api: widget.api, projectId: _w.id)));
    if (done == true && mounted) await _refresh();
  }

  Future<void> _record(ProjectViva v) async {
    final l = context.l10n;
    final score = TextEditingController();
    final remarks = TextEditingController();
    var outcome = 'pass';
    var badScore = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(l.projRecordResult),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Wrap(
                  spacing: Kx.s8,
                  children: [
                    for (final code in ['pass', 'revise', 'fail'])
                      ChoiceChip(key: Key('outcome-$code'), label: Text(vivaOutcomeText(l, code)), selected: outcome == code, onSelected: (_) => setLocal(() => outcome = code)),
                  ],
                ),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('vivaScore'), controller: score, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: l.projVivaScore, errorText: badScore ? l.projVivaScoreInvalid : null)),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('vivaRemarks'), controller: remarks, maxLines: 3, decoration: InputDecoration(labelText: l.projVivaRemarks)),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
            FilledButton(
              key: const Key('confirmVivaResult'),
              onPressed: () {
                final s = score.text.trim();
                final n = s.isEmpty ? null : double.tryParse(s);
                if (s.isNotEmpty && (n == null || n < 0 || n > 100)) {
                  setLocal(() => badScore = true);
                } else {
                  Navigator.pop(ctx, true);
                }
              },
              child: Text(l.save),
            ),
          ],
        ),
      ),
    );
    if (ok == true && mounted) {
      final s = score.text.trim();
      if (await runOrSnack(context, () => widget.api.recordProjectViva(v.id, outcome: outcome, score: s.isEmpty ? null : double.parse(s), remarks: remarks.text.trim())) && mounted) {
        await _refresh();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final w = _w;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: Kx.s32),
        children: [
          Padding(
            padding: const EdgeInsets.all(Kx.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${w.code} · ${resStatusText(l, w.status)}', style: context.text.bodyMedium),
                Text(l.projPi(w.pi)),
                Text(l.projMyRole(projectRoleText(l, w.myRole)), key: const Key('myRole')),
                if (w.reviewCount > 0 && w.reviewAverage != null) Text(l.projReviewAverage('${w.reviewCount}', numText(w.reviewAverage!))),
              ],
            ),
          ),
          KxSectionHeader(l.projMembers),
          for (final m in w.members) ListTile(dense: true, leading: const Icon(Icons.person_outline), title: Text(m.name), subtitle: Text(projectRoleText(l, m.role))),
          KxSectionHeader(l.projMilestones),
          if (w.milestones.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.projMilestonesNone)),
          for (final m in w.milestones)
            ListTile(
              dense: true,
              leading: Icon(m.completedOn == null ? Icons.radio_button_unchecked : Icons.check_circle_outline),
              title: Text(m.title),
              subtitle: Text(m.completedOn == null ? l.projMilestoneDue(f.shortDay(parseDay(m.dueOn))) : l.projMilestoneDone(f.shortDay(parseDay(m.completedOn!)))),
            ),
          KxSectionHeader(l.projFiles),
          if (w.files.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.projFilesNone)),
          for (final file in w.files)
            ListTile(
              key: Key('file-${file.id}'),
              dense: true,
              leading: Icon(file.url == null ? Icons.insert_drive_file_outlined : Icons.link),
              title: Text(file.title),
              subtitle: file.url == null ? null : SelectableText(file.url!),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
            child: Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(key: const Key('addLink'), onPressed: _addLink, icon: const Icon(Icons.add_link), label: Text(l.projAddLink))),
          ),
          KxSectionHeader(l.projVivas),
          if (w.vivas.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.projVivasNone)),
          for (final v in w.vivas)
            ListTile(
              key: Key('viva-${v.id}'),
              title: Text(v.scheduledAt == null ? vivaStatusText(l, v.status) : '${f.when(v.scheduledAt!)} · ${vivaStatusText(l, v.status)}'),
              subtitle: Text([
                if (v.venue.isNotEmpty) v.venue,
                if (v.panel.isNotEmpty) v.panel.join(', '),
                if (v.outcome != null) '${vivaOutcomeText(l, v.outcome!)}${v.score == null ? '' : ' · ${numText(v.score!)}'}',
                if ((v.remarks ?? '').isNotEmpty) v.remarks!,
              ].join('\n')),
              isThreeLine: v.panel.isNotEmpty && v.venue.isNotEmpty,
              trailing: w.isMentor && v.scheduled ? TextButton(key: Key('record-${v.id}'), onPressed: () => _record(v), child: Text(l.projRecordResult)) : null,
            ),
          if (w.isMentor)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              child: Align(alignment: Alignment.centerLeft, child: FilledButton.icon(key: const Key('scheduleViva'), onPressed: _schedule, icon: const Icon(Icons.event_outlined), label: Text(l.projScheduleViva))),
            ),
        ],
      ),
    );
  }
}

/// Date, time, venue and panel for a project viva.
class ScheduleVivaScreen extends StatefulWidget {
  const ScheduleVivaScreen({super.key, required this.api, required this.projectId, this.now});

  final TeacherApi api;
  final String projectId;

  /// For tests; the default is the current time.
  final DateTime? now;

  @override
  State<ScheduleVivaScreen> createState() => _ScheduleVivaScreenState();
}

class _ScheduleVivaScreenState extends State<ScheduleVivaScreen> {
  late DateTime _at = () {
    final n = widget.now ?? DateTime.now();
    return DateTime(n.year, n.month, n.day + 1, 10);
  }();
  final _venue = TextEditingController();
  final _panel = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context, initialDate: _at, firstDate: DateTime(_at.year - 1), lastDate: DateTime(_at.year + 2));
    if (d != null) setState(() => _at = DateTime(d.year, d.month, d.day, _at.hour, _at.minute));
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_at));
    if (t != null) setState(() => _at = DateTime(_at.year, _at.month, _at.day, t.hour, t.minute));
  }

  Future<void> _save() async {
    final l = context.l10n;
    final names = splitList(_panel.text);
    if (names.isEmpty) {
      setState(() => _error = l.projVivaPanelNeeded);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await runOrSnack(context, () => widget.api.scheduleProjectViva(widget.projectId, scheduledAt: _at, venue: _venue.text.trim(), panel: names));
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.projScheduleViva)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Row(
            children: [
              Expanded(child: OutlinedButton.icon(key: const Key('vivaDate'), onPressed: _pickDate, icon: const Icon(Icons.calendar_today_outlined), label: Text(f.shortDay(_at)))),
              const SizedBox(width: Kx.s8),
              Expanded(child: OutlinedButton.icon(key: const Key('vivaTime'), onPressed: _pickTime, icon: const Icon(Icons.schedule), label: Text(f.time(_at)))),
            ],
          ),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('vivaVenue'), controller: _venue, maxLength: 120, decoration: InputDecoration(labelText: l.projVivaVenue)),
          TextField(key: const Key('vivaPanel'), controller: _panel, maxLines: 2, decoration: InputDecoration(labelText: l.projVivaPanel)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('saveViva'), onPressed: _busy ? null : _save, child: Text(l.projScheduleViva)),
        ],
      ),
    );
  }
}

class _DiscussionTab extends StatefulWidget {
  const _DiscussionTab({required this.api, required this.projectId});

  final TeacherApi api;
  final String projectId;

  @override
  State<_DiscussionTab> createState() => _DiscussionTabState();
}

class _DiscussionTabState extends State<_DiscussionTab> {
  int _round = 0;
  final _text = TextEditingController();
  ProjectComment? _replyTo;
  bool _busy = false;

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() => _busy = true);
    final ok = await runOrSnack(context, () => widget.api.addProjectComment(widget.projectId, body: body, parentId: _replyTo?.id));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) {
        _text.clear();
        _replyTo = null;
        _round++;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Column(
      children: [
        Expanded(
          child: AsyncBody<List<ProjectComment>>(
            key: ValueKey(_round),
            load: () => widget.api.projectComments(widget.projectId),
            isEmpty: (rows) => rows.isEmpty,
            empty: l.projDiscussionEmpty,
            builder: (context, rows, reload) {
              final top = [for (final r in rows) if (r.parentId == null || !rows.any((x) => x.id == r.parentId)) r];
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  for (final c in top) ...[
                    _CommentTile(comment: c, when: c.at == null ? '' : f.shortDay(c.at!), onReply: () => setState(() => _replyTo = c)),
                    for (final r in rows.where((x) => x.parentId == c.id))
                      Padding(padding: const EdgeInsets.only(left: Kx.s32), child: _CommentTile(comment: r, when: r.at == null ? '' : f.shortDay(r.at!))),
                  ],
                ],
              );
            },
          ),
        ),
        if (_replyTo != null)
          ListTile(
            dense: true,
            tileColor: context.colors.surfaceContainerHighest,
            title: Text(l.projReplyingTo(_replyTo!.author), key: const Key('replyingTo')),
            trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _replyTo = null)),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, Kx.s8),
            child: Row(
              children: [
                Expanded(child: TextField(key: const Key('commentField'), controller: _text, minLines: 1, maxLines: 4, maxLength: 2000, decoration: InputDecoration(hintText: l.projCommentHint, counterText: ''))),
                IconButton(key: const Key('sendComment'), onPressed: _busy ? null : _send, tooltip: l.send, icon: const Icon(Icons.send)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.comment, required this.when, this.onReply});

  final ProjectComment comment;
  final String when;
  final VoidCallback? onReply;

  @override
  Widget build(BuildContext context) => ListTile(
    key: Key('comment-${comment.id}'),
    title: Text(comment.author, style: context.text.titleSmall),
    subtitle: Text('${comment.body}\n$when'),
    isThreeLine: true,
    trailing: onReply == null ? null : TextButton(key: Key('reply-${comment.id}'), onPressed: onReply, child: Text(context.l10n.projReply)),
  );
}

class _ReviewsTab extends StatefulWidget {
  const _ReviewsTab({required this.api, required this.workspace});

  final TeacherApi api;
  final ProjectWorkspace workspace;

  @override
  State<_ReviewsTab> createState() => _ReviewsTabState();
}

class _ReviewsTabState extends State<_ReviewsTab> {
  int _round = 0;

  Future<void> _write() async {
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ProjectReviewScreen(api: widget.api, projectId: widget.workspace.id)));
    if (done == true && mounted) setState(() => _round++);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AsyncBody<List<ProjectReview>>(
      key: ValueKey(_round),
      load: () => widget.api.projectReviews(widget.workspace.id),
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: Kx.s32),
        children: [
          if (widget.workspace.isMentor)
            Padding(padding: const EdgeInsets.all(Kx.s16), child: Align(alignment: Alignment.centerLeft, child: FilledButton.icon(key: const Key('writeReview'), onPressed: _write, icon: const Icon(Icons.rate_review_outlined), label: Text(l.projWriteReview)))),
          if (rows.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.projReviewsEmpty, key: const Key('emptyState'))),
          for (final r in rows)
            Card(
              key: Key('review-${r.id}'),
              margin: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${reviewKindText(l, r.kind)} · ${r.reviewer} · ${numText(r.percent)}%', style: context.text.titleSmall),
                    const SizedBox(height: Kx.s4),
                    Text([for (final e in r.rubric.entries) '${e.key}: ${numText(e.value)}/${r.maxPerCriterion}'].join('  ·  ')),
                    if (r.comment.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(r.comment)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A mentor's rubric review: a score for each criterion, then a comment.
class ProjectReviewScreen extends StatefulWidget {
  const ProjectReviewScreen({super.key, required this.api, required this.projectId});

  final TeacherApi api;
  final String projectId;

  @override
  State<ProjectReviewScreen> createState() => _ProjectReviewScreenState();
}

class _ProjectReviewScreenState extends State<ProjectReviewScreen> {
  static const _max = 5;
  final _comment = TextEditingController();
  final _scores = [3, 3, 3, 3];
  bool _busy = false;

  List<String> _criteria(AppLocalizations l) => [l.projCritUnderstanding, l.projCritExecution, l.projCritDocumentation, l.projCritTeamwork];

  Future<void> _save() async {
    final l = context.l10n;
    final names = _criteria(l);
    setState(() => _busy = true);
    final ok = await runOrSnack(
      context,
      () => widget.api.addProjectReview(widget.projectId, rubric: {for (var i = 0; i < names.length; i++) names[i]: _scores[i].toDouble()}, maxPerCriterion: _max, comment: _comment.text.trim()),
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final names = _criteria(l);
    return Scaffold(
      appBar: AppBar(title: Text(l.projWriteReview)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.projScoreOutOf('$_max'), style: context.text.bodyMedium),
          for (var i = 0; i < names.length; i++) ...[
            const SizedBox(height: Kx.s12),
            Text(names[i], style: context.text.titleSmall),
            Wrap(
              spacing: Kx.s8,
              children: [for (var n = 0; n <= _max; n++) ChoiceChip(key: Key('score-$i-$n'), label: Text('$n'), selected: _scores[i] == n, onSelected: (_) => setState(() => _scores[i] = n))],
            ),
          ],
          const SizedBox(height: Kx.s16),
          TextField(key: const Key('reviewComment'), controller: _comment, maxLines: 4, maxLength: 2000, decoration: InputDecoration(labelText: l.projReviewComment)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('saveReview'), onPressed: _busy ? null : _save, child: Text(l.projWriteReview)),
        ],
      ),
    );
  }
}

class _TeamTab extends StatefulWidget {
  const _TeamTab({required this.api, required this.workspace});

  final TeacherApi api;
  final ProjectWorkspace workspace;

  @override
  State<_TeamTab> createState() => _TeamTabState();
}

class _TeamTabState extends State<_TeamTab> {
  late bool _showcase = widget.workspace.hub.showcase;
  late bool _recruiting = widget.workspace.hub.recruiting;
  late final _summary = TextEditingController(text: widget.workspace.hub.summary);
  late final _looking = TextEditingController(text: widget.workspace.hub.lookingFor.join(', '));
  late final _openings = TextEditingController(text: '${widget.workspace.hub.openings}');
  late Future<(List<JoinRequest>, List<ProjectMatch>)> _team = _loadTeam();
  bool _busy = false;
  String? _notice;

  Future<(List<JoinRequest>, List<ProjectMatch>)> _loadTeam() async => (await widget.api.projectJoinRequests(widget.workspace.id), await widget.api.projectMatches(widget.workspace.id));

  void _reload() {
    _team = _loadTeam();
  }

  Future<void> _saveHub() async {
    final l = context.l10n;
    final openings = int.tryParse(_openings.text.trim()) ?? 0;
    setState(() {
      _busy = true;
      _notice = null;
    });
    final ok = await runOrSnack(
      context,
      () => widget.api.setProjectHub(
        widget.workspace.id,
        ProjectHub(showcase: _showcase, summary: _summary.text.trim(), recruiting: _recruiting, lookingFor: splitList(_looking.text), openings: openings.clamp(0, 30)),
      ),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) {
        _notice = l.projHubSaved;
        _reload();
      }
    });
  }

  Future<void> _decide(JoinRequest r, bool accept) async {
    if (await runOrSnack(context, () => widget.api.decideJoinRequest(r.id, accept: accept)) && mounted) setState(_reload);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: Kx.s32),
      children: [
        KxSectionHeader(l.projHub),
        SwitchListTile(key: const Key('hubShowcase'), title: Text(l.projHubShowcase), value: _showcase, onChanged: (v) => setState(() => _showcase = v)),
        SwitchListTile(key: const Key('hubRecruiting'), title: Text(l.projHubRecruiting), value: _recruiting, onChanged: (v) => setState(() => _recruiting = v)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Column(
            children: [
              TextField(key: const Key('hubSummary'), controller: _summary, maxLines: 3, maxLength: 1000, decoration: InputDecoration(labelText: l.projHubSummary)),
              TextField(key: const Key('hubLooking'), controller: _looking, decoration: InputDecoration(labelText: l.projHubLookingFor)),
              const SizedBox(height: Kx.s12),
              TextField(key: const Key('hubOpenings'), controller: _openings, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.projHubOpenings)),
              const SizedBox(height: Kx.s12),
              Align(alignment: Alignment.centerLeft, child: FilledButton(key: const Key('saveHub'), onPressed: _busy ? null : _saveHub, child: Text(l.save))),
              if (_notice != null) Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_notice!, key: const Key('hubNotice')))),
            ],
          ),
        ),
        // Requests and matches are read again after each change (a new skill list changes the matches).
        FutureBuilder<(List<JoinRequest>, List<ProjectMatch>)>(
          future: _team,
          builder: (context, snap) {
            if (snap.hasError) {
              final e = snap.error;
              return Padding(padding: const EdgeInsets.all(Kx.s16), child: e is ApiException ? ErrorBanner.api(e, onRetry: () => setState(_reload)) : ErrorBanner('$e'));
            }
            if (!snap.hasData) return const Padding(padding: EdgeInsets.all(Kx.s24), child: Center(child: CircularProgressIndicator()));
            final (requests, matches) = snap.data!;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KxSectionHeader(l.projRequests),
                if (requests.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.projRequestsNone, key: const Key('noRequests'))),
                for (final r in requests)
                  ListTile(
                    key: Key('request-${r.id}'),
                    title: Text(r.fullName),
                    subtitle: Text([if (r.message.isNotEmpty) r.message, joinStatusText(l, r.status)].join('\n')),
                    isThreeLine: r.message.isNotEmpty,
                    trailing: r.pending
                        ? Wrap(
                            children: [
                              IconButton(key: Key('accept-${r.id}'), tooltip: l.projAccept, onPressed: () => _decide(r, true), icon: const Icon(Icons.check_circle_outline)),
                              IconButton(key: Key('decline-${r.id}'), tooltip: l.projDecline, onPressed: () => _decide(r, false), icon: const Icon(Icons.cancel_outlined)),
                            ],
                          )
                        : null,
                  ),
                KxSectionHeader(l.projMatches),
                if (matches.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.projMatchesNone, key: const Key('noMatches'))),
                for (final m in matches)
                  ListTile(
                    key: Key('match-${m.studentId}'),
                    leading: const Icon(Icons.person_search_outlined),
                    title: Text('${m.fullName} · ${m.rollNo}'),
                    subtitle: Text(m.matched.join(', ')),
                    trailing: Text(l.projMatchFit('${m.fit}')),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
