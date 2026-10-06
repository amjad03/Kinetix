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
  const HomeworkDetailScreen({super.key, required this.api, required this.homework, this.openFile = openWithSystem, this.photos = const {}});

  final TeacherApi api;
  final Homework homework;
  final OpenFile openFile;

  /// Students' photo paths by id (from the class roster), when known.
  final Map<String, String?> photos;

  @override
  State<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

/// What the list shows: everyone, one status, or (null status) who has not handed in.
sealed class _Filter {
  const _Filter();
}

class _All extends _Filter {
  const _All();
}

class _Status extends _Filter {
  const _Status(this.status);
  final SubmissionStatus? status;

  @override
  bool operator ==(Object other) => other is _Status && other.status == status;
  @override
  int get hashCode => status.hashCode;
}

class _HomeworkDetailScreenState extends State<HomeworkDetailScreen> {
  SubmissionList? _list;
  ApiException? _error;
  bool _loading = false;
  _Filter _filter = const _All();
  bool _reminding = false;

  Future<void> _remind(int count) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.remindTitle(count)),
        content: Text(l.remindBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmRemind'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.remind)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _reminding = true);
    try {
      final n = await widget.api.remindMissing(widget.homework.id);
      messenger.showSnackBar(SnackBar(content: Text(l.reminded(n))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _reminding = false);
    }
  }

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
              SliverToBoxAdapter(
                child: _Counts(counts: list.counts, selected: _filter, onSelected: (f) => setState(() => _filter = f)),
              ),
              if (list.counts.missing > 0 && (_filter is _All || _filter == const _Status(null)))
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, 0),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.tonalIcon(
                        key: const Key('remindMissing'),
                        onPressed: _reminding ? null : () => _remind(list.counts.missing),
                        icon: _reminding
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.notifications_active_outlined),
                        label: Text(l.remindMissing(list.counts.missing)),
                      ),
                    ),
                  ),
                ),
              if (list.students.isEmpty)
                SliverToBoxAdapter(
                  child: KxEmptyState(icon: Icons.groups_outlined, message: l.noStudentsInClass),
                )
              else
                Builder(
                  builder: (context) {
                    final shown = switch (_filter) {
                      _All() => list.students,
                      _Status(:final status) => list.students.where((s) => s.status == status).toList(),
                    };
                    if (shown.isEmpty) {
                      return SliverToBoxAdapter(
                        child: KxEmptyState(icon: Icons.filter_list_off, message: l.noneInFilter),
                      );
                    }
                    return SliverPadding(
                      padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s24),
                      sliver: SliverList.builder(
                        itemCount: shown.length,
                        itemBuilder: (context, i) => _StudentRow(
                          submission: shown[i],
                          photo: widget.api.photo(widget.photos[shown[i].studentId]),
                          onTap: () => _open(shown[i]),
                        ),
                      ),
                    );
                  },
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The counts are filters: All, Handed in, Checked, Returned, Missing.
class _Counts extends StatelessWidget {
  const _Counts({required this.counts, required this.selected, required this.onSelected});

  final SubmissionCounts counts;
  final _Filter selected;
  final ValueChanged<_Filter> onSelected;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    Color? bg(SubmissionStatus? s) => submissionColors(context, s).$1;
    Color? fg(SubmissionStatus? s) => submissionColors(context, s).$2;
    return KxCountChips<_Filter>(
      selected: selected,
      onSelected: (f) => onSelected(f ?? const _All()),
      chips: [
        KxCountChip(
          key: const Key('count-all'),
          value: const _All(),
          label: KxStrings.of(context).all,
          count: counts.students,
          background: c.secondaryContainer,
          foreground: c.onSecondaryContainer,
        ),
        for (final (status, n) in [
          (SubmissionStatus.submitted, counts.submitted),
          (SubmissionStatus.checked, counts.checked),
          (SubmissionStatus.returned, counts.returned),
          (null, counts.missing),
        ])
          KxCountChip(
            key: Key('count-${status?.name ?? 'missing'}'),
            value: _Status(status),
            label: status == null ? l.filterMissing : l.submissionStatus(status),
            count: n,
            background: bg(status),
            foreground: fg(status),
          ),
      ],
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({required this.submission, required this.onTap, this.photo});

  final Submission submission;
  final VoidCallback onTap;
  final ImageProvider? photo;

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
            KxAvatar(name: s.fullName, size: 40, image: photo),
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
