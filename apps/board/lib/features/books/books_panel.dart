import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import '../search/search_strings.dart';
import '../ai/ai_controller.dart';
import '../ai/ai_widgets.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../board/side_panel.dart';
import '../reader/read_aloud.dart' show ReadAloudScope;

const _booksAccent = Color(0xFF8AB4F8);

/// Books: the syllabus of the class open on the board, from the KINETIX content library.
/// A topic opens its notes and lesson (hook, terms, example, activity, questions, homework) in
/// large type for the class, and can start an AI explanation or a
/// quick quiz grounded in that topic. Topics taught to the open class are ticked, and the
/// teacher marks a topic as taught (or undoes it) from the outline or the topic.
class BooksPanel extends StatefulWidget {
  const BooksPanel({super.key, required this.board, required this.ai, required this.onOpenPanel, this.onOpenResource, this.initialTopicId});

  final BoardController board;
  final AiController ai;

  /// Switches the side panel (to the AI or Quiz panel).
  final ValueChanged<PanelKind> onOpenPanel;

  /// Opens a topic's 3D model or lab next to the whiteboard.
  final void Function(SplitContent content, String id)? onOpenResource;

  /// Opens straight at this topic (from Today's plan).
  final String? initialTopicId;

  @override
  State<BooksPanel> createState() => _BooksPanelState();
}

class _BooksPanelState extends State<BooksPanel> {
  Future<Syllabus?>? _syllabus;
  String? _sessionId;
  Future<TopicDetail>? _topic;
  final Set<String> _open = {};

  /// What the syllabus is searched for.
  String _q = '';

  /// Taught topics of the open class; null while loading, in a free session, or offline.
  Coverage? _coverage;

  /// Topics being marked or unmarked.
  final Set<String> _saving = {};

  @override
  void initState() {
    super.initState();
    widget.board.addListener(_onBoard);
    _onBoard();
    final topic = widget.initialTopicId;
    if (topic != null && widget.board.api != null && _sessionId != null) _topic = widget.board.api!.topic(topic);
  }

  @override
  void dispose() {
    widget.board.removeListener(_onBoard);
    super.dispose();
  }

  /// A different class (or none) means a different syllabus.
  void _onBoard() {
    final id = widget.board.session?.sessionId;
    if (id == _sessionId && _syllabus != null) return;
    _sessionId = id;
    setState(() {
      _topic = null;
      _open.clear();
      _coverage = null;
      _saving.clear();
      _syllabus = id == null || widget.board.api == null ? null : widget.board.api!.syllabus();
    });
    if (id != null) _loadCoverage();
  }

  void _reload() {
    setState(() {
      _syllabus = widget.board.api!.syllabus();
    });
    _loadCoverage();
  }

  Future<void> _loadCoverage() async {
    final api = widget.board.api;
    final session = _sessionId;
    if (api == null || session == null) return;
    try {
      final c = await api.coverage();
      if (mounted && session == _sessionId && _saving.isEmpty) setState(() => _coverage = c);
    } catch (_) {
      // Coverage is extra: the syllabus still opens without ticks.
    }
  }

  /// Marks [topicId] as taught today, or undoes it. Shown at once; put back if the server says no.
  Future<void> _toggleTaught(String topicId) async {
    final api = widget.board.api;
    final before = _coverage;
    if (api == null || before == null || _saving.contains(topicId)) return;
    final l = context.l10n;
    final taught = before.topics.containsKey(topicId);
    final topics = {...before.topics};
    if (taught) {
      topics.remove(topicId);
    } else {
      topics[topicId] = TopicCoverage(coveredOn: DateTime.now(), coveredBy: widget.board.session?.teacherName ?? '');
    }
    setState(() {
      _saving.add(topicId);
      _coverage = Coverage(total: before.total, topics: topics);
    });
    try {
      taught ? await api.unmarkTopicTaught(topicId) : await api.markTopicTaught(topicId);
      if (!mounted) return;
      setState(() => _saving.remove(topicId));
      showBoardMessage(context, taught ? l.booksUnmarked : l.booksMarked);
      await _loadCoverage();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving.remove(topicId);
        _coverage = before;
      });
      showBoardMessage(context, e is ApiException ? apiErrorText(l, e) : l.booksMarkFailed);
    }
  }

  /// "Taught on 3 Oct · Anita Sharma".
  String _taughtLine(TopicCoverage t) {
    final day = DateFormat('d MMM', context.dateLocale).format(t.coveredOn);
    return t.coveredBy.isEmpty ? context.l10n.booksTaughtOn(day) : '${context.l10n.booksTaughtOn(day)} · ${t.coveredBy}';
  }

  Widget _taughtButton(String topicId, {bool large = false}) {
    final l = context.l10n;
    final taught = _coverage!.topics.containsKey(topicId);
    final busy = _saving.contains(topicId);
    final onPressed = busy ? null : () => _toggleTaught(topicId);
    if (taught) {
      return TextButton.icon(key: Key('unmark-$topicId'), onPressed: onPressed, icon: const Icon(Icons.undo), label: Text(l.booksUndoTaught));
    }
    return large
        ? FilledButton.icon(key: Key('mark-$topicId'), onPressed: onPressed, icon: const Icon(Icons.check), label: Text(l.booksMarkTaught))
        : OutlinedButton.icon(key: Key('mark-$topicId'), onPressed: onPressed, icon: const Icon(Icons.check), label: Text(l.booksMarkTaught));
  }

  @override
  Widget build(BuildContext context) {
    final topic = _topic;
    return PanelPage(
      icon: Icons.menu_book_outlined,
      title: topic == null ? context.l10n.toolBooks : context.l10n.booksTopic,
      accent: _booksAccent,
      onBack: topic == null
          ? null
          : () => setState(() {
              _topic = null;
            }),
      // The topic follows the AI language (its lesson may be written in Kannada or Hindi too).
      child: topic != null ? ListenableBuilder(listenable: widget.ai, builder: (context, _) => _topicView(topic)) : _syllabusView(),
    );
  }

  Widget _syllabusView() {
    final future = _syllabus;
    final l = context.l10n;
    if (future == null) {
      return Padding(
        padding: const EdgeInsets.all(Kx.s24),
        child: Align(
          alignment: Alignment.topCenter,
          child: AiNotice(key: const Key('books-signin'), icon: Icons.lock_outline, message: l.booksSignIn),
        ),
      );
    }
    return FutureBuilder<Syllabus?>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return AiLoading(label: l.booksOpening);
        }
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Align(
              alignment: Alignment.topCenter,
              child: AiError(message: l.booksCouldNotOpen, onRetry: _reload),
            ),
          );
        }
        final s = snap.data;
        if (s == null) {
          return KxEmptyState(key: const Key('books-unlinked'), icon: Icons.link_off, message: l.booksUnlinked);
        }
        return _outline(s);
      },
    );
  }

  /// The chapters to list (with their number) and, while searching, the topics found in each:
  /// all of a chapter whose title matches, else those that match; chapters with neither drop out.
  List<(int, SyllabusChapter, List<SyllabusTopic>?)> _visibleChapters(Syllabus s) {
    if (normalizeSearch(_q).isEmpty) return [for (final (i, ch) in s.chapters.indexed) (i, ch, null)];
    bool hit(List<String> texts) => SearchTarget([for (final (n, t) in texts.indexed) SearchField(t, n == 0 ? 1 : 0.6)]).score(_q) > 0;
    return [
      for (final (i, ch) in s.chapters.indexed)
        if (hit([ch.title]))
          (i, ch, ch.topics)
        else if (ch.topics.where((t) => hit([t.title, t.summary])).toList() case final found when found.isNotEmpty)
          (i, ch, found),
    ];
  }

  Widget _outline(Syllabus s) {
    final c = context.colors;
    final l = context.l10n;
    return ListView(
      key: const Key('books-outline'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      children: [
        Text(s.title, style: context.text.titleLarge),
        if (!s.reviewed)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s4),
            child: Text(l.booksDraft, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ),
        if (_coverage != null && _coverage!.total > 0) ...[
          const SizedBox(height: Kx.s12),
          Text(
            l.booksTaughtCount(_coverage!.covered, _coverage!.total),
            key: const Key('books-coverage'),
            style: context.text.titleSmall,
          ),
          const SizedBox(height: Kx.s8),
          ClipRRect(
            borderRadius: Kx.radiusSm,
            child: LinearProgressIndicator(value: _coverage!.covered / _coverage!.total, minHeight: 8),
          ),
        ],
        ModuleSearchField(
          key: const Key('books-search'),
          hint: SearchStrings.of(context).searchTopics,
          initial: _q,
          padding: const EdgeInsets.only(top: Kx.s12, bottom: Kx.s12),
          onChanged: (v) => setState(() => _q = v),
        ),
        for (final (i, ch, found) in _visibleChapters(s))
          Card(
            margin: const EdgeInsets.only(bottom: Kx.s8),
            color: c.surfaceContainer,
            elevation: 0,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                ListTile(
                  key: Key('chapter-${ch.id}'),
                  leading: CircleAvatar(
                    radius: 16,
                    backgroundColor: c.secondaryContainer,
                    child: Text('${i + 1}', style: context.text.labelLarge),
                  ),
                  title: Text(ch.title, style: context.text.titleMedium),
                  subtitle: Text(
                    [
                      if (ch.own) l.booksAddedByInstitution,
                      if (ch.topics.isNotEmpty) l.booksTopicCount(ch.topics.length) else if (widget.ai.canUseAi) l.booksAskAiChapter,
                      if (_coverage != null && ch.topics.isNotEmpty)
                        l.booksChapterTaught(ch.topics.where((t) => _coverage!.topics.containsKey(t.id)).length, ch.topics.length),
                    ].join(' · '),
                  ),
                  trailing: ch.topics.isEmpty
                      ? (widget.ai.canUseAi ? const Icon(Icons.auto_awesome_outlined) : null)
                      : Icon(_open.contains(ch.id) ? Icons.expand_less : Icons.expand_more),
                  // A chapter without topic notes yet: KINETIX AI explains the chapter.
                  onTap: ch.topics.isEmpty
                      ? (widget.ai.canUseAi
                            ? () {
                                widget.ai.open(AiView.home);
                                widget.onOpenPanel(PanelKind.ai);
                                widget.ai.ask(widget.ai.contentL10n.aiExplainTopic(ch.title));
                              }
                            : null)
                      : () => setState(() => _open.contains(ch.id) ? _open.remove(ch.id) : _open.add(ch.id)),
                ),
                // While searching, the topics found show without opening their chapter.
                if (_open.contains(ch.id) || found != null)
                  for (final t in found ?? ch.topics)
                    ListTile(
                      key: Key('topic-${t.id}'),
                      contentPadding: const EdgeInsets.only(left: 24, right: Kx.s16),
                      leading: SizedBox(
                        width: 32,
                        child: _coverage?.topics.containsKey(t.id) ?? false
                            ? Icon(Icons.check_circle, key: Key('taught-${t.id}'), color: const Color(0xFF34A853))
                            : null,
                      ),
                      title: Text(t.title),
                      subtitle: switch (_coverage?.topics[t.id]) {
                        final TopicCoverage done => Text(_taughtLine(done), maxLines: 1, overflow: TextOverflow.ellipsis),
                        _ => t.summary.isEmpty ? null : Text(t.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
                      },
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_coverage != null) _taughtButton(t.id),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                      onTap: () => setState(() {
                        _topic = widget.board.api!.topic(t.id);
                      }),
                    ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _topicView(Future<TopicDetail> future) {
    return FutureBuilder<TopicDetail>(
      future: future,
      builder: (context, snap) {
        final l = context.l10n;
        if (snap.connectionState != ConnectionState.done) {
          return AiLoading(label: l.booksOpeningTopic);
        }
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Align(
              alignment: Alignment.topCenter,
              child: AiError(
                message: l.booksCouldNotOpenTopic,
                onRetry: () => setState(() {
                  _topic = null;
                }),
              ),
            ),
          );
        }
        final t = snap.data!;
        final c = context.colors;
        // The lesson in the AI language when the library has it written in it (Kannada for
        // Karnataka's English-medium books), else as written.
        final language = widget.ai.language.name;
        final version = t.lesson?.fullIn(language);
        final lesson = version ?? t.lesson;
        final title = t.lesson?.versions[language]?.title ?? t.title;
        final notes = version?.notes ?? t.notes;
        final outcomes = version?.outcomes ?? t.outcomes;
        const body = TextStyle(fontSize: ClassType.body, height: 1.45);
        Widget para(String label, String text, Key key) => Column(
          key: key,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [AiSectionLabel(label), Text(text, style: body)],
        );
        Widget list(String label, List<String> items, IconData icon) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AiSectionLabel(label),
            for (final n in items)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Icon(icon, size: 20, color: _booksAccent),
                    ),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Text(n, style: const TextStyle(fontSize: ClassType.body, height: 1.45)),
                    ),
                  ],
                ),
              ),
          ],
        );
        return ListView(
          key: const Key('books-topic'),
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
          children: [
            Text(t.chapterTitle, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s4),
            Text(title, style: context.text.headlineSmall),
            if (t.summary.isNotEmpty) ...[
              const SizedBox(height: Kx.s12),
              Text(
                t.summary,
                style: TextStyle(fontSize: ClassType.lead, height: 1.4, color: c.onSurface),
              ),
            ],
            const SizedBox(height: Kx.s16),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('topic-explain'),
                  onPressed: widget.ai.canUseAi
                      ? () {
                          widget.ai.open(AiView.home);
                          widget.onOpenPanel(PanelKind.ai);
                          widget.ai.ask(widget.ai.contentL10n.aiExplainTopic(t.title), topicId: t.id);
                        }
                      : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(l.booksExplain),
                ),
                OutlinedButton.icon(
                  key: const Key('topic-quiz'),
                  onPressed: widget.ai.canUseAi
                      ? () {
                          widget.onOpenPanel(PanelKind.quiz);
                          widget.ai.generateQuiz(t.title, topicId: t.id);
                        }
                      : null,
                  icon: const Icon(Icons.quiz_outlined),
                  label: Text(l.booksQuiz),
                ),
                // The lesson in the immersive reader, read aloud (lib/features/reader).
                if (ReadAloudScope.maybeOf(context) case final reader?)
                  OutlinedButton.icon(
                    key: const Key('topic-read-aloud'),
                    onPressed: () => reader.read(title, [
                      if (t.summary.isNotEmpty) t.summary,
                      if (lesson != null && lesson.hook.isNotEmpty) lesson.hook,
                      ...notes,
                      if (lesson != null && lesson.example.isNotEmpty) lesson.example,
                      if (lesson != null && lesson.activity.isNotEmpty) lesson.activity,
                      if (lesson != null) ...[for (final (i, q) in lesson.questions.indexed) '${i + 1}. ${q.q}'],
                    ]),
                    icon: const Icon(Icons.record_voice_over_outlined),
                    label: Text(l.readAloud),
                  ),
                if (_coverage != null) _taughtButton(t.id, large: true),
              ],
            ),
            if (_coverage?.topics[t.id] case final done?)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Text(_taughtLine(done), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              ),
            if (t.resources.isNotEmpty && widget.onOpenResource != null) ...[
              AiSectionLabel(l.booksOnTheBoard),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final r in t.resources)
                    ActionChip(
                      key: Key('resource-${r.id}'),
                      avatar: Icon(r.kind == 'lab' ? Icons.science_outlined : Icons.view_in_ar_outlined, size: 18),
                      label: Text(r.title),
                      onPressed: () => widget.onOpenResource!(r.kind == 'lab' ? SplitContent.lab : SplitContent.model3d, r.id),
                    ),
                ],
              ),
            ],
            if (lesson != null && lesson.hook.isNotEmpty) para(l.booksHook, lesson.hook, const Key('lesson-hook')),
            if (notes.isNotEmpty) list(l.booksKeyFacts, notes, Icons.check_circle_outline),
            if (lesson != null && lesson.terms.isNotEmpty) ...[
              AiSectionLabel(l.booksTerms),
              Wrap(
                key: const Key('lesson-terms'),
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [for (final w in lesson.terms) Chip(label: Text(w, style: const TextStyle(fontSize: 16)))],
              ),
            ],
            if (lesson != null && lesson.example.isNotEmpty) para(l.booksExample, lesson.example, const Key('lesson-example')),
            if (lesson != null && lesson.activity.isNotEmpty) para(l.booksActivity, lesson.activity, const Key('lesson-activity')),
            if (lesson != null && lesson.questions.isNotEmpty) ...[
              AiSectionLabel(l.lessonCheck),
              for (final (i, q) in lesson.questions.indexed)
                Padding(
                  key: Key('lesson-question-$i'),
                  padding: const EdgeInsets.only(bottom: Kx.s12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${i + 1}. ${q.q}', style: body),
                      if (q.a.isNotEmpty) Text(q.a, style: body.copyWith(color: c.onSurfaceVariant)),
                    ],
                  ),
                ),
            ],
            if (lesson != null && lesson.homework.isNotEmpty) para(l.planHomework, lesson.homework, const Key('lesson-homework')),
            if (outcomes.isNotEmpty) list(l.booksOutcomes, outcomes, Icons.flag_outlined),
            if (!t.reviewed)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s16),
                child: Text(l.booksDraftShort, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ),
          ],
        );
      },
    );
  }
}
