import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// "12 of 30 topics taught" with a progress bar and the percentage.
class CoverageBar extends StatelessWidget {
  const CoverageBar({super.key, required this.coverage, this.compact = false});

  final Coverage coverage;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final value = coverage.total == 0 ? 0.0 : coverage.covered / coverage.total;
    final label = context.l10n.topicsTaught(coverage.covered, coverage.total);
    return Column(
      key: const Key('coverageBar'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: Kx.s8,
          children: [
            Text(label, style: (compact ? context.text.bodySmall : context.text.bodyMedium)?.copyWith(color: c.onSurfaceVariant)),
            if (coverage.percent != null)
              Text('${coverage.percent}%', style: (compact ? context.text.labelMedium : context.text.titleSmall)?.copyWith(color: Tone.good(context))),
          ],
        ),
        const SizedBox(height: Kx.s4),
        ClipRRect(
          borderRadius: Kx.radiusSm,
          child: LinearProgressIndicator(
            value: value,
            minHeight: compact ? 4 : 8,
            color: Tone.goodBar(context),
            backgroundColor: c.surfaceContainerHighest,
            semanticsLabel: label,
          ),
        ),
      ],
    );
  }
}

/// A child's subjects with how much of each syllabus the class has been taught.
class SyllabusProgressScreen extends StatefulWidget {
  const SyllabusProgressScreen({super.key, required this.family, required this.child});

  final FamilyController family;
  final Child child;

  static Future<void> open(BuildContext context, FamilyController family, Child child) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => SyllabusProgressScreen(family: family, child: child)),
  );

  @override
  State<SyllabusProgressScreen> createState() => _SyllabusProgressScreenState();
}

class _SyllabusProgressScreenState extends State<SyllabusProgressScreen> {
  ApiException? _error;
  bool _loading = true;

  FamilyController get family => widget.family;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      final subjects = await family.loadSubjects(widget.child);
      await Future.wait([for (final s in subjects) family.loadCoverage(widget.child, s.id)]);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      body: ListenableBuilder(
        listenable: family,
        builder: (context, _) {
          final subjects = family.subjectsOf(widget.child.id);
          return RefreshIndicator(
            onRefresh: _load,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverAppBar.large(title: Text(l.syllabusProgress)),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                  sliver: SliverToBoxAdapter(
                    child: Text(
                      '${widget.child.fullName} · ${widget.child.sectionName}',
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ),
                ),
                if (_error != null && subjects == null)
                  SliverPadding(
                    padding: const EdgeInsets.all(Kx.s16),
                    sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)),
                  )
                else if (subjects == null && _loading)
                  const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
                else if (subjects == null || subjects.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: KxEmptyState(key: const Key('noSubjects'), icon: Icons.menu_book_outlined, message: l.syllabusSubjectsEmpty),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
                    sliver: SliverList.list(
                      children: [
                        for (final s in subjects)
                          Card(
                            child: ListTile(
                              key: Key('subjectProgress-${s.id}'),
                              leading: IconBadge(Icons.class_outlined, background: c.primaryContainer, foreground: c.onPrimaryContainer),
                              title: Text(s.name),
                              subtitle: switch (family.coverageOf(widget.child.id, s.id)) {
                                final cov? when cov.total > 0 => Padding(
                                  padding: const EdgeInsets.only(top: Kx.s4),
                                  child: CoverageBar(coverage: cov, compact: true),
                                ),
                                _ => s.code == null ? null : Text(s.code!),
                              },
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => ChildSubjectScreen.open(context, family, widget.child, s),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// One subject's syllabus for a child's class: chapters and topics, the taught ones ticked.
class ChildSubjectScreen extends StatefulWidget {
  const ChildSubjectScreen({super.key, required this.family, required this.child, required this.subject});

  final FamilyController family;
  final Child child;
  final Subject subject;

  static Future<void> open(BuildContext context, FamilyController family, Child child, Subject subject) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => ChildSubjectScreen(family: family, child: child, subject: subject)),
  );

  @override
  State<ChildSubjectScreen> createState() => _ChildSubjectScreenState();
}

class _ChildSubjectScreenState extends State<ChildSubjectScreen> {
  CourseOutline? _outline;
  bool _loaded = false;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    widget.family.loadCoverage(widget.child, widget.subject.id);
    try {
      final o = await widget.family.api.syllabus(widget.subject.id);
      if (mounted) {
        setState(() {
          _outline = o;
          _loaded = true;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return Scaffold(
      body: ListenableBuilder(
        listenable: widget.family,
        builder: (context, _) {
          final o = _outline;
          final cov = widget.family.coverageOf(widget.child.id, widget.subject.id);
          return CustomScrollView(
            slivers: [
              SliverAppBar.large(title: Text(widget.subject.name)),
              if (_error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)),
                )
              else if (!_loaded)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (o == null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(key: const Key('noSyllabus'), icon: Icons.menu_book_outlined, message: l.syllabusNotLinked(widget.subject.name)),
                )
              else ...[
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                  sliver: SliverToBoxAdapter(
                    child: Text(
                      '${o.title} · ${l.chaptersTopics(o.chapters.length)}',
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ),
                ),
                if (cov != null && cov.total > 0)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s16),
                    sliver: SliverToBoxAdapter(child: CoverageBar(coverage: cov)),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s32),
                  sliver: SliverList.separated(
                    itemCount: o.chapters.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                    itemBuilder: (context, i) {
                      final ch = o.chapters[i];
                      return Card(
                        key: Key('chapter-${ch.id}'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
                              child: Text('${i + 1}. ${ch.title}', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                            ),
                            if (ch.topics.isEmpty)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16),
                                child: Text(l.noTopicsInChapter, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                              ),
                            for (final t in ch.topics)
                              ListTile(
                                key: Key('topic-${t.id}'),
                                leading: cov == null
                                    ? null
                                    : cov.topics.containsKey(t.id)
                                    ? Icon(Icons.check_circle, key: Key('taught-${t.id}'), color: Tone.good(context), semanticLabel: l.taught)
                                    : Icon(Icons.radio_button_unchecked, color: c.outlineVariant),
                                title: Text(t.title),
                                subtitle: _topicSubtitle(context, t, cov?.topics[t.id]),
                              ),
                            const SizedBox(height: Kx.s8),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

Widget? _topicSubtitle(BuildContext context, OutlineTopic t, TopicCoverage? taught) {
  if (t.summary.isEmpty && taught == null) return null;
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (t.summary.isNotEmpty) Text(t.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
      if (taught != null)
        Text(
          context.l10n.taughtOn(context.fmt.shortDay(taught.coveredOn)),
          key: Key('taughtOn-${t.id}'),
          style: context.text.bodySmall?.copyWith(color: Tone.good(context)),
        ),
    ],
  );
}
