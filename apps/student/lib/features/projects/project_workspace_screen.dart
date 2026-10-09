import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/pathways.dart';
import '../../l10n/l10n.dart';
import '../../widgets/load_view.dart';
import 'projects_screen.dart';

typedef _Space = (ProjectWorkspace, List<ProjectComment>, List<ProjectReview>);

/// One project: team, milestones, files (links can be added), the discussion, reviews and viva.
class ProjectWorkspaceScreen extends StatefulWidget {
  const ProjectWorkspaceScreen({super.key, required this.api, required this.projectId});

  final StudentApi api;
  final String projectId;

  static Future<void> open(BuildContext context, StudentApi api, String projectId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProjectWorkspaceScreen(api: api, projectId: projectId)));

  @override
  State<ProjectWorkspaceScreen> createState() => _ProjectWorkspaceScreenState();
}

class _ProjectWorkspaceScreenState extends State<ProjectWorkspaceScreen> {
  final _comment = TextEditingController();
  final _body = GlobalKey<LoadBodyState<_Space>>();
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<_Space> _load() async {
    final r = await Future.wait<Object>([widget.api.projectWorkspace(widget.projectId), widget.api.projectComments(widget.projectId), widget.api.projectReviews(widget.projectId)]);
    return (r[0] as ProjectWorkspace, r[1] as List<ProjectComment>, r[2] as List<ProjectReview>);
  }

  Future<void> _send() async {
    final text = _comment.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final ok = await attempt(context, () => widget.api.addProjectComment(widget.projectId, text));
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok) {
      _comment.clear();
      await _body.currentState?.reload();
    }
  }

  Future<void> _addLink() async {
    final l = context.l10n;
    final r = await askFields(
      context,
      title: l.pjAddLink,
      fields: [FieldSpec('linkTitle', l.pjFieldTitle), FieldSpec('linkUrl', l.pjFieldLink, keyboard: TextInputType.url)],
      confirmLabel: l.save,
      confirmKey: 'saveLink',
    );
    if (r == null || !mounted) return;
    final t = r['linkTitle']!, u = r['linkUrl']!;
    if (t.isEmpty || !(Uri.tryParse(u)?.hasScheme ?? false)) return say(context, l.pjNeedTitleAndUrl);
    if (await attempt(context, () => widget.api.addProjectLink(widget.projectId, title: t, url: u), done: l.pjLinkAdded)) await _body.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.pjWorkspace)),
      body: LoadBody<_Space>(
        key: _body,
        load: _load,
        builder: (context, data, reload) {
          final (w, comments, reviews) = data;
          final c = context.colors;
          return [
            Text(w.title, key: const Key('workspaceTitle'), style: context.text.headlineSmall),
            Text([w.code, projectKindLabel(l, w.kind), projectStatusLabel(l, w.status)].where((s) => s.isNotEmpty).join(' · '), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            if (w.hubSummary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(w.hubSummary)),
            if (w.outcomeSummary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(w.outcomeSummary)),
            Heading(l.pjMembers),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                Chip(avatar: const Icon(Icons.person_outline, size: 18), label: Text(l.pjMentor(w.pi))),
                for (final m in w.members) Chip(avatar: const Icon(Icons.person_outline, size: 18), label: Text(m.name)),
              ],
            ),
            Heading(l.pjMilestones),
            if (w.milestones.isEmpty) EmptyNote(l.pjNoMilestones),
            for (final m in w.milestones)
              ListTile(
                key: Key('milestone-${m.id}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(m.done ? Icons.check_circle : Icons.radio_button_unchecked, color: m.done ? kxTone(context, KxTone.success).fg : c.onSurfaceVariant),
                title: Text(m.title),
                subtitle: Text(m.done ? l.pjDoneOn(dayText(context, m.completedOn)) : l.pjDueOn(dayText(context, m.dueOn))),
              ),
            Row(children: [Expanded(child: Heading(l.pjFiles)), TextButton.icon(key: const Key('addLink'), onPressed: _addLink, icon: const Icon(Icons.add_link), label: Text(l.pjAddLink))]),
            if (w.files.isEmpty) EmptyNote(l.pjNoFiles),
            for (final f in w.files)
              ListTile(
                key: Key('file-${f.id}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(f.url != null ? Icons.link : Icons.insert_drive_file_outlined),
                title: Text(f.title),
                subtitle: f.url == null ? null : Text(f.url!),
                trailing: f.url == null
                    ? null
                    : IconButton(
                        tooltip: l.pjCopyLink,
                        icon: const Icon(Icons.copy),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: f.url!));
                          if (context.mounted) say(context, l.pjLinkCopied);
                        },
                      ),
              ),
            if (w.vivas.isNotEmpty) ...[
              Heading(l.pjViva),
              for (final v in w.vivas)
                ListTile(
                  key: Key('viva-${v.id}'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.record_voice_over_outlined),
                  title: Text(v.scheduledAt == null ? l.pjViva : context.fmt.dateTime(v.scheduledAt!)),
                  subtitle: Text(
                    [
                      if (v.venue.isNotEmpty) v.venue,
                      if (v.panel.isNotEmpty) l.pjPanel(v.panel.join(', ')),
                      if (v.status == 'held' && v.outcome != null) vivaOutcomeLabel(l, v.outcome!),
                      if (v.status == 'cancelled') l.pjVivaCancelled,
                      if (v.remarks != null && v.remarks!.isNotEmpty) v.remarks!,
                    ].join(' · '),
                  ),
                ),
            ],
            Heading(l.pjReviews),
            if (reviews.isEmpty)
              EmptyNote(l.pjNoReviews)
            else ...[
              Text(l.pjReviewsSummary(w.reviewCount, (w.reviewAverage ?? 0).round()), key: const Key('reviewsSummary'), style: context.text.titleSmall),
              for (final r in reviews)
                KxCard(
                  key: Key('rev-${r.id}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${r.reviewer} · ${r.percent.round()}%', style: context.text.titleSmall),
                      Text([for (final e in r.rubric.entries) '${criterionLabel(l, e.key)} ${e.value}/${r.maxPerCriterion}'].join(' · '), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      if (r.comment.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(r.comment)),
                    ],
                  ),
                ),
            ],
            Heading(l.pjDiscussion),
            if (comments.isEmpty) EmptyNote(l.pjNoComments),
            for (final m in comments)
              Padding(
                key: Key('comment-${m.id}'),
                padding: EdgeInsets.only(left: m.parentId == null ? 0 : Kx.s24, bottom: Kx.s8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text([m.author, if (m.createdAt != null) context.fmt.dateTime(m.createdAt!)].join(' · '), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                    Text(m.body),
                  ],
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(child: TextField(key: const Key('commentField'), controller: _comment, minLines: 1, maxLines: 4, maxLength: 2000, decoration: InputDecoration(labelText: l.pjWriteComment))),
                IconButton.filled(key: const Key('sendComment'), onPressed: _sending ? null : _send, icon: const Icon(Icons.send), tooltip: l.send),
              ],
            ),
          ];
        },
      ),
    );
  }
}

String vivaOutcomeLabel(AppLocalizations l, String o) => switch (o) {
  'pass' => l.pjViva_pass,
  'revise' => l.pjViva_revise,
  'fail' => l.pjViva_fail,
  _ => o,
};
