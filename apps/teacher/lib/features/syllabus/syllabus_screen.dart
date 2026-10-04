import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../plans/year_plan_screen.dart';

/// A class's syllabus for one subject, and which topics have been taught.
class SyllabusController extends ChangeNotifier {
  SyllabusController({required this.api, required this.section, required this.subject});

  final TeacherApi api;
  final Ref section;
  final Ref subject;

  Syllabus? syllabus;
  Coverage? coverage;

  /// The subject is not linked to a course in the content library yet.
  bool unlinked = false;
  bool loading = false;
  ApiException? error;

  /// Topics being marked or unmarked.
  final saving = <String>{};

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final (s, c) = await (api.syllabus(subject.id), api.coverage(sectionId: section.id, subjectId: subject.id)).wait;
      syllabus = s;
      coverage = c;
      unlinked = s == null;
    } on ParallelWaitError<(Syllabus?, Coverage?), (AsyncError?, AsyncError?)> catch (e) {
      final failed = e.errors.$1?.error ?? e.errors.$2?.error;
      if (failed is! ApiException) rethrow;
      error = failed;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Marks a topic as taught on [on] (today when null), or as not taught. Shown at once and put
  /// back if the server says no; throws the [ApiException] for the caller to show.
  Future<void> setTaught(String topicId, {required bool taught, DateTime? on, required String by}) async {
    final before = coverage;
    if (before == null || saving.contains(topicId)) return;
    final topics = {...before.topics};
    if (taught) {
      topics[topicId] = TopicCoverage(coveredOn: on ?? DateUtils.dateOnly(DateTime.now()), coveredBy: by);
    } else {
      topics.remove(topicId);
    }
    coverage = Coverage(total: before.total, topics: topics);
    saving.add(topicId);
    notifyListeners();
    try {
      if (taught) {
        await api.markTopic(sectionId: section.id, subjectId: subject.id, topicId: topicId, coveredOn: on == null ? null : isoDate(on));
      } else {
        await api.unmarkTopic(sectionId: section.id, subjectId: subject.id, topicId: topicId);
      }
    } on ApiException {
      final now = {...coverage!.topics};
      if (before.topics[topicId] case final old?) {
        now[topicId] = old;
      } else {
        now.remove(topicId);
      }
      coverage = Coverage(total: before.total, topics: now);
      rethrow;
    } finally {
      saving.remove(topicId);
      notifyListeners();
    }
  }
}

/// Syllabus progress for a class and subject: chapters and topics, a progress bar, and who
/// taught each topic when. Tap a topic to mark it as taught today (or not taught); the
/// calendar button marks it as taught on an earlier day.
class SyllabusScreen extends StatefulWidget {
  const SyllabusScreen({super.key, required this.api, required this.section, required this.subject, required this.teacherName});

  final TeacherApi api;
  final Ref section;
  final Ref subject;

  /// Shown as "taught by" until the server's answer comes back.
  final String teacherName;

  @override
  State<SyllabusScreen> createState() => _SyllabusScreenState();
}

class _SyllabusScreenState extends State<SyllabusScreen> {
  late final controller = SyllabusController(api: widget.api, section: widget.section, subject: widget.subject)..load();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> _set(String topicId, {required bool taught, DateTime? on}) async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      await controller.setTaught(topicId, taught: taught, on: on, by: widget.teacherName);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(taught ? l.topicMarked : l.topicUnmarked)));
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  Future<void> _pickDate(SyllabusTopic t) async {
    final today = DateUtils.dateOnly(DateTime.now());
    final current = controller.coverage?.topics[t.id]?.coveredOn;
    final picked = await showDatePicker(
      context: context,
      initialDate: current != null && !current.isAfter(today) ? current : today,
      firstDate: today.subtract(const Duration(days: 365)),
      lastDate: today,
      helpText: context.l10n.taughtOnWhichDay,
    );
    if (picked != null) await _set(t.id, taught: true, on: picked);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final s = controller.syllabus;
          final cov = controller.coverage;
          return RefreshIndicator(
            onRefresh: controller.load,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverAppBar.large(
                  title: Text(l.syllabus),
                  actions: [
                    if (!controller.unlinked)
                      TextButton.icon(
                        key: const Key('openYearPlan'),
                        onPressed: () => openYearPlan(context, api: widget.api, section: widget.section, subject: widget.subject),
                        icon: const Icon(Icons.calendar_view_week_outlined, size: 18),
                        label: Text(l.yearPlan),
                      ),
                  ],
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                    child: Text(
                      '${widget.section.name} · ${widget.subject.name}',
                      style: context.text.titleMedium?.copyWith(color: context.colors.onSurfaceVariant),
                    ),
                  ),
                ),
                if (controller.error != null)
                  SliverPadding(
                    padding: const EdgeInsets.all(Kx.s16),
                    sliver: SliverToBoxAdapter(child: ErrorBanner.api(controller.error!, onRetry: controller.load)),
                  ),
                if (controller.loading && s == null)
                  const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
                else if (controller.unlinked)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: KxEmptyState(key: const Key('syllabusUnlinked'), icon: Icons.link_off, message: l.syllabusUnlinked),
                  )
                else if (s != null && cov != null) ...[
                  SliverToBoxAdapter(
                    child: _Progress(syllabus: s, coverage: cov),
                  ),
                  for (final (i, ch) in s.chapters.indexed) ...[
                    SliverToBoxAdapter(
                      child: _ChapterHeader(number: i + 1, chapter: ch, coverage: cov),
                    ),
                    SliverList.list(
                      children: [
                        for (final t in ch.topics)
                          _TopicTile(
                            topic: t,
                            taught: cov.topics[t.id],
                            saving: controller.saving.contains(t.id),
                            onToggle: () => _set(t.id, taught: !cov.topics.containsKey(t.id)),
                            onPickDate: () => _pickDate(t),
                          ),
                      ],
                    ),
                  ],
                  const SliverToBoxAdapter(child: SizedBox(height: Kx.s32)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.syllabus, required this.coverage});

  final Syllabus syllabus;
  final Coverage coverage;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Card(
      key: const Key('syllabusProgress'),
      margin: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(syllabus.title, style: context.text.titleMedium),
            const SizedBox(height: Kx.s12),
            Row(
              children: [
                Expanded(child: Text(l.topicsTaught(coverage.covered, coverage.total), style: context.text.bodyLarge)),
                const SizedBox(width: Kx.s8),
                Text('${(coverage.fraction * 100).round()}%', style: context.text.titleMedium?.copyWith(color: c.primary)),
              ],
            ),
            const SizedBox(height: Kx.s8),
            ClipRRect(
              borderRadius: Kx.radiusSm,
              child: LinearProgressIndicator(value: coverage.fraction, minHeight: 8),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChapterHeader extends StatelessWidget {
  const _ChapterHeader({required this.number, required this.chapter, required this.coverage});

  final int number;
  final SyllabusChapter chapter;
  final Coverage coverage;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = chapter.topics.where((t) => coverage.topics.containsKey(t.id)).length;
    return Padding(
      key: Key('chapter-${chapter.id}'),
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: c.secondaryContainer,
            child: Text('$number', style: context.text.labelLarge?.copyWith(color: c.onSecondaryContainer)),
          ),
          const SizedBox(width: Kx.s12),
          Expanded(child: Text(chapter.title, style: context.text.titleSmall)),
          if (chapter.topics.isNotEmpty) ...[
            const SizedBox(width: Kx.s8),
            Text(
              context.l10n.chapterTaught(done, chapter.topics.length),
              style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

class _TopicTile extends StatelessWidget {
  const _TopicTile({required this.topic, required this.taught, required this.saving, required this.onToggle, required this.onPickDate});

  final SyllabusTopic topic;
  final TopicCoverage? taught;
  final bool saving;
  final VoidCallback onToggle;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final t = taught;
    final when = t == null ? null : Fmt.of(context).shortDay(t.coveredOn);
    return ListTile(
      key: Key('topic-${topic.id}'),
      contentPadding: const EdgeInsets.only(left: Kx.s16, right: Kx.s4),
      onTap: saving ? null : onToggle,
      leading: Checkbox(key: Key('taught-${topic.id}'), value: t != null, onChanged: saving ? null : (_) => onToggle()),
      title: Text(topic.title),
      subtitle: t == null
          ? null
          : Text(
              t.coveredBy.isEmpty ? l.taughtOn(when!) : l.taughtOnBy(when!, t.coveredBy),
              style: context.text.bodySmall?.copyWith(color: c.primary),
            ),
      trailing: IconButton(
        key: Key('pickDate-${topic.id}'),
        tooltip: l.taughtOnWhichDay,
        onPressed: saving ? null : onPickDate,
        icon: const Icon(Icons.edit_calendar_outlined),
      ),
    );
  }
}

/// Profile → Syllabus progress: the teacher's classes and subjects, each opening its syllabus.
class SyllabusClassesScreen extends StatefulWidget {
  const SyllabusClassesScreen({super.key, required this.api, required this.teacherName});

  final TeacherApi api;
  final String teacherName;

  @override
  State<SyllabusClassesScreen> createState() => _SyllabusClassesScreenState();
}

class _SyllabusClassesScreenState extends State<SyllabusClassesScreen> {
  List<TeacherClass>? _classes;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final list = await widget.api.classes();
      if (mounted) setState(() => _classes = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final classes = _classes;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(l.syllabusProgress)),
          if (_error != null)
            SliverPadding(
              padding: const EdgeInsets.all(Kx.s16),
              sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load)),
            ),
          if (classes == null && _error == null)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
          else if (classes != null && classes.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: KxEmptyState(icon: Icons.class_outlined, message: l.noClassesAssigned),
            )
          else if (classes != null)
            SliverList.list(
              children: [
                for (final c in classes)
                  ListTile(
                    key: Key('syllabusClass-${c.section.id}-${c.subject.id}'),
                    leading: const Icon(Icons.menu_book_outlined),
                    title: Text(c.subject.name),
                    subtitle: Text(c.section.name),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () =>
                        openSyllabus(context, api: widget.api, section: c.section, subject: c.subject, teacherName: widget.teacherName),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

Future<void> openSyllabus(
  BuildContext context, {
  required TeacherApi api,
  required Ref section,
  required Ref subject,
  required String teacherName,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) => SyllabusScreen(api: api, section: section, subject: subject, teacherName: teacherName),
  ),
);
