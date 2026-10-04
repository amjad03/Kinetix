import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'submission_screen.dart';

/// Colours for a submission's status pill: (background, foreground).
(Color, Color) submissionColors(BuildContext context, SubmissionStatus? s) {
  final c = context.colors;
  return switch (s) {
    SubmissionStatus.submitted => (c.primaryContainer, c.onPrimaryContainer),
    SubmissionStatus.checked => goodColors(context),
    SubmissionStatus.returned => (c.tertiaryContainer, c.onTertiaryContainer),
    null => (c.surfaceContainerHighest, c.onSurfaceVariant),
  };
}

/// A "Late" label for work handed in after the due date.
class LateBadge extends StatelessWidget {
  const LateBadge({super.key});

  @override
  Widget build(BuildContext context) => Pill(
    context.l10n.statusLate,
    icon: Icons.schedule,
    background: context.colors.errorContainer,
    foreground: context.colors.onErrorContainer,
  );
}

/// A homework with the class's submissions: how many handed in, were checked or returned, and
/// who has not handed in. A student's work opens to be read, checked or returned.
class HomeworkDetailScreen extends StatefulWidget {
  const HomeworkDetailScreen({super.key, required this.api, required this.homework, this.openFile = openWithSystem});

  final TeacherApi api;
  final Homework homework;
  final OpenFile openFile;

  @override
  State<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends State<HomeworkDetailScreen> {
  SubmissionList? _list;
  ApiException? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.api.submissions(widget.homework.id);
      if (mounted) setState(() => _list = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(Submission s) async {
    final reviewed = await Navigator.of(context).push<Submission>(
      MaterialPageRoute(
        builder: (_) => SubmissionScreen(api: widget.api, homework: widget.homework, submission: s, openFile: widget.openFile),
      ),
    );
    if (reviewed != null && mounted) setState(() => _list?.replace(reviewed));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final hw = widget.homework;
    final list = _list;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar(pinned: true, title: Text(l.navHomework)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
              sliver: SliverList.list(
                children: [
                  Text(hw.title, style: context.text.headlineSmall),
                  const SizedBox(height: Kx.s4),
                  Text('${hw.section.name} · ${hw.subject.name}', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  Text(l.dueOn(Fmt.of(context).shortDay(hw.dueOn)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  if (hw.instructions.isNotEmpty) ...[const SizedBox(height: Kx.s12), Text(hw.instructions, style: context.text.bodyLarge)],
                ],
              ),
            ),
            SliverToBoxAdapter(child: KxSectionHeader(l.submissions)),
            if (_error != null)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16),
                sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load)),
              ),
            if (list == null && _loading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(Kx.s32),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (list != null) ...[
              SliverToBoxAdapter(child: _Counts(counts: list.counts)),
              if (list.students.isEmpty)
                SliverToBoxAdapter(
                  child: KxEmptyState(icon: Icons.groups_outlined, message: l.noStudentsInClass),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s24),
                  sliver: SliverList.builder(
                    itemCount: list.students.length,
                    itemBuilder: (context, i) => _StudentRow(submission: list.students[i], onTap: () => _open(list.students[i])),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Counts extends StatelessWidget {
  const _Counts({required this.counts});

  final SubmissionCounts counts;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cells = [
      (SubmissionStatus.submitted, counts.submitted),
      (SubmissionStatus.checked, counts.checked),
      (SubmissionStatus.returned, counts.returned),
      (null, counts.missing),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
      child: Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        children: [
          for (final (status, n) in cells)
            Builder(
              builder: (context) {
                final (bg, fg) = submissionColors(context, status);
                return Container(
                  key: Key('count-${status?.name ?? 'missing'}'),
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
                  decoration: BoxDecoration(color: bg, borderRadius: Kx.radiusMd),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '$n ',
                          style: context.text.titleMedium?.copyWith(color: fg, fontWeight: FontWeight.w600),
                        ),
                        TextSpan(
                          text: l.submissionStatus(status),
                          style: context.text.bodyMedium?.copyWith(color: fg),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({required this.submission, required this.onTap});

  final Submission submission;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = submission;
    final (bg, fg) = submissionColors(context, s.status);
    final handedIn = s.status != null;
    return InkWell(
      key: Key('submission-${s.studentId}'),
      onTap: handedIn ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
        child: Row(
          children: [
            KxAvatar(name: s.fullName, size: 40),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.fullName, style: context.text.titleMedium),
                  Text(s.rollNo, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: Kx.s4),
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s4,
                    children: [
                      Pill(l.submissionStatus(s.status), background: bg, foreground: fg),
                      if (s.late) const LateBadge(),
                    ],
                  ),
                ],
              ),
            ),
            if (handedIn) Icon(Icons.chevron_right, color: c.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
