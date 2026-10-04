import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
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
  String? _error;

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
      if (mounted) setState(() => _error = e.message);
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
              hintText: 'Search topics, e.g. goodwill',
              elevation: const WidgetStatePropertyAll(0),
              padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: Kx.s16)),
              leading: const Icon(Icons.search),
              trailing: [
                if (_query.text.isNotEmpty)
                  IconButton(
                    tooltip: 'Clear',
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
                    'No topics match “$_searched”. Try a shorter word, or ask KINETIX AI.',
                    key: const Key('noHits'),
                    textAlign: TextAlign.center,
                    style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                  ),
                )
              else ...[
                Padding(
                  padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s4),
                  child: Text(Fmt.plural(_hits!.length, 'topic'), style: context.text.titleSmall?.copyWith(color: c.primary)),
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

class _Subjects extends StatelessWidget {
  const _Subjects({required this.study, required this.ask});

  final StudyController study;
  final AskController ask;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListenableBuilder(
      listenable: study,
      builder: (context, _) {
        final subjects = study.subjects;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s4),
              child: Text('Your subjects', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
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
                'Your subjects appear here once your teachers set homework. Meanwhile, search for any topic above.',
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
                    subtitle: s.code == null ? null : Text(s.code!),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => SubjectScreen.open(context, study.api, s, ask: ask),
                  ),
                ),
          ],
        );
      },
    );
  }
}

/// One subject's syllabus: chapters and their topics.
class SubjectScreen extends StatefulWidget {
  const SubjectScreen({super.key, required this.api, required this.subject, required this.ask});

  final StudentApi api;
  final Subject subject;
  final AskController ask;

  static Future<void> open(BuildContext context, StudentApi api, Subject subject, {required AskController ask}) => Navigator.of(context)
      .push(
        MaterialPageRoute(
          builder: (_) => SubjectScreen(api: api, subject: subject, ask: ask),
        ),
      );

  @override
  State<SubjectScreen> createState() => _SubjectScreenState();
}

class _SubjectScreenState extends State<SubjectScreen> {
  CourseOutline? _outline;
  bool _loaded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final o = await widget.api.syllabus(widget.subject.id);
      if (mounted) {
        setState(() {
          _outline = o;
          _loaded = true;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final o = _outline;
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
                    "The syllabus for ${widget.subject.name} isn't in the KINETIX library yet.\nSearch for a topic, or ask KINETIX AI.",
              ),
            )
          else ...[
            CenteredSliver(
              bottom: Kx.s8,
              sliver: SliverToBoxAdapter(
                child: Text(
                  '${o.title} · ${Fmt.plural(o.chapters.length, 'chapter')} · ${Fmt.plural(o.topicCount, 'topic')}'.replaceAll(
                    RegExp(r'(?<=\d) '),
                    '\u00a0',
                  ),
                  style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                ),
              ),
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
                            child: Text('No topics yet.', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          ),
                        for (final t in ch.topics)
                          ListTile(
                            key: Key('topic-${t.id}'),
                            title: Text(t.title),
                            subtitle: t.summary.isEmpty ? null : Text(t.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
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
