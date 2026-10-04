import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';
import 'ask_controller.dart';
import 'topic_screen.dart';

/// The syllabus library: search every topic, or browse your subjects chapter by chapter.
class SyllabusView extends StatefulWidget {
  const SyllabusView({super.key, required this.study, required this.ask});

  final StudyController study;
  final AskController ask;

  @override
  State<SyllabusView> createState() => _SyllabusViewState();
}

class _SyllabusViewState extends State<SyllabusView> {
  final _query = TextEditingController();
  Timer? _debounce;
  String _searched = '';
  List<TopicHit>? _hits;
  bool _searching = false;
  ApiException? _error;

  StudentApi get api => widget.study.api;

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String text) {
    _debounce?.cancel();
    setState(() {});
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(text));
  }

  Future<void> _search(String text) async {
    final q = text.trim();
    if (q.length < 2) {
      setState(() {
        _searched = '';
        _hits = null;
        _error = null;
      });
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final hits = await api.searchTopics(q);
      if (!mounted || _query.text.trim() != q) return;
      setState(() {
        _searched = q;
        _hits = hits;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final typing = _query.text.trim().length >= 2;
    return LayoutBuilder(
      builder: (context, box) {
        final side = sideGutter(box.maxWidth);
        return ListView(
          key: const Key('syllabusList'),
          padding: EdgeInsets.fromLTRB(side, Kx.s16, side, Kx.s32),
          children: [
            SearchBar(
              key: const Key('search'),
              controller: _query,
              onChanged: _changed,
              onSubmitted: _search,
              textInputAction: TextInputAction.search,
              hintText: context.l10n.searchTopicsHint,
              elevation: const WidgetStatePropertyAll(0),
              padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: Kx.s16)),
              leading: const Icon(Icons.search),
              trailing: [
                if (_query.text.isNotEmpty)
                  IconButton(
                    tooltip: context.l10n.clear,
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      _query.clear();
                      _search('');
                    },
                  ),
              ],
            ),
            const SizedBox(height: Kx.s8),
            if (_searching) const LinearProgressIndicator(key: Key('searching')),
            if (_error != null) ...[const SizedBox(height: Kx.s8), ErrorBanner(_error!, onRetry: () => _search(_query.text))],
            if (typing && _hits != null) ...[
              if (_hits!.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Kx.s24),
                  child: Text(
                    context.l10n.noTopicsMatch(_searched),
                    key: const Key('noHits'),
                    textAlign: TextAlign.center,
                    style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                  ),
                )
              else ...[
                Padding(
                  padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s4),
                  child: Text(context.l10n.topicsCount(_hits!.length), style: context.text.titleSmall?.copyWith(color: c.primary)),
                ),
                for (final h in _hits!)
                  ListTile(
                    key: Key('hit-${h.id}'),
                    contentPadding: EdgeInsets.zero,
                    leading: IconBadge(Icons.menu_book_outlined, background: c.secondaryContainer),
                    title: Text(h.title),
                    subtitle: Text('${h.chapterTitle} · ${h.courseTitle}', maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => TopicScreen.open(context, api, h.id, controller: widget.ask),
                  ),
              ],
            ] else if (!typing)
              _Subjects(study: widget.study, ask: widget.ask),
          ],
        );
      },
    );
  }
}

class _Subjects extends StatefulWidget {
  const _Subjects({required this.study, required this.ask});

  final StudyController study;
  final AskController ask;

  @override
  State<_Subjects> createState() => _SubjectsState();
}

class _SubjectsState extends State<_Subjects> {
  StudyController get study => widget.study;
  AskController get ask => widget.ask;
  List<Subject>? _progressFor;

  /// Each subject's progress, once per subject list.
  void _loadProgress(List<Subject>? subjects) {
    if (subjects == null || identical(subjects, _progressFor)) return;
    _progressFor = subjects;
    for (final s in subjects) {
      study.loadCoverage(s.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListenableBuilder(
      listenable: study,
      builder: (context, _) {
        final subjects = study.subjects;
        if (!identical(subjects, _progressFor)) WidgetsBinding.instance.addPostFrameCallback((_) => _loadProgress(study.subjects));
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s4),
              child: Text(context.l10n.yourSubjects, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
            ),
            if (study.subjectsError != null)
              ErrorBanner(study.subjectsError!, onRetry: study.loadSubjects)
            else if (subjects == null)
              const Padding(
                padding: EdgeInsets.all(Kx.s24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (subjects.isEmpty)
              Text(
                context.l10n.subjectsEmpty,
                key: const Key('noSubjects'),
                style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
              )
            else
              for (final s in subjects)
                Card(
                  child: ListTile(
                    key: Key('subjectTile-${s.id}'),
                    leading: IconBadge(Icons.class_outlined, background: c.primaryContainer, foreground: c.onPrimaryContainer),
                    title: Text(s.name),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (s.code != null) Text(s.code!),
                        if (study.coverageOf(s.id) case final cov? when cov.total > 0) ...[
                          const SizedBox(height: Kx.s4),
                          CoverageBar(coverage: cov, compact: true),
                        ],
                      ],
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => SubjectScreen.open(context, study, s, ask: ask),
                  ),
                ),
          ],
        );
      },
    );
  }
}

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

/// One subject's syllabus: chapters and their topics, with the topics the class has been taught
/// ticked.
class SubjectScreen extends StatefulWidget {
  const SubjectScreen({super.key, required this.study, required this.subject, required this.ask});

  final StudyController study;
  final Subject subject;
  final AskController ask;

  StudentApi get api => study.api;

  static Future<void> open(BuildContext context, StudyController study, Subject subject, {required AskController ask}) => Navigator.of(context)
      .push(
        MaterialPageRoute(
          builder: (_) => SubjectScreen(study: study, subject: subject, ask: ask),
        ),
      );

  @override
  State<SubjectScreen> createState() => _SubjectScreenState();
}

class _SubjectScreenState extends State<SubjectScreen> {
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
    // Progress is fetched alongside: a failure there only leaves the ticks out.
    widget.study.loadCoverage(widget.subject.id, fresh: true);
    try {
      final o = await widget.api.syllabus(widget.subject.id);
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
  Widget build(BuildContext context) => ListenableBuilder(listenable: widget.study, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final c = context.colors;
    final o = _outline;
    final cov = widget.study.coverageOf(widget.subject.id);
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(widget.subject.name)),
          if (_error != null)
            CenteredSliver(
              sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)),
            )
          else if (!_loaded)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
          else if (o == null)
            SliverFillRemaining(
              hasScrollBody: false,
              child: KxEmptyState(
                key: const Key('noSyllabus'),
                icon: Icons.menu_book_outlined,
                message:
                    context.l10n.syllabusMissing(widget.subject.name),
              ),
            )
          else ...[
            CenteredSliver(
              bottom: Kx.s8,
              sliver: SliverToBoxAdapter(
                child: Text(
                  '${o.title} · ${context.l10n.chaptersCount(o.chapters.length)} · ${context.l10n.topicsCount(o.topicCount)}'.replaceAll(
                    RegExp(r'(?<=\d) '),
                    '\u00a0',
                  ),
                  style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                ),
              ),
            ),
            if (cov != null && cov.total > 0)
              CenteredSliver(
                bottom: Kx.s16,
                sliver: SliverToBoxAdapter(child: CoverageBar(coverage: cov)),
              ),
            CenteredSliver(
              bottom: Kx.s32,
              sliver: SliverList.separated(
                itemCount: o.chapters.length,
                separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                itemBuilder: (context, i) {
                  final ch = o.chapters[i];
                  return Card(
                    key: Key('chapter-${ch.id}'),
                    clipBehavior: Clip.antiAlias,
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
                            child: Text(context.l10n.noTopicsYet, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          ),
                        for (final t in ch.topics)
                          ListTile(
                            key: Key('topic-${t.id}'),
                            leading: cov == null
                                ? null
                                : cov.topics.containsKey(t.id)
                                ? Icon(Icons.check_circle, key: Key('taught-${t.id}'), color: Tone.good(context), semanticLabel: context.l10n.taught)
                                : Icon(Icons.radio_button_unchecked, color: c.outlineVariant),
                            title: Text(t.title),
                            subtitle: _topicSubtitle(context, t, cov?.topics[t.id]),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => TopicScreen.open(context, widget.api, t.id, controller: widget.ask),
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
