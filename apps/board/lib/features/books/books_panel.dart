import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../ai/ai_controller.dart';
import '../ai/ai_widgets.dart';
import '../board/side_panel.dart';

const _booksAccent = Color(0xFF8AB4F8);

/// Books: the syllabus of the class open on the board, from the KINETIX content library.
/// A topic opens its notes in large type for the class, and can start an AI explanation or a
/// quick quiz grounded in that topic.
class BooksPanel extends StatefulWidget {
  const BooksPanel({
    super.key,
    required this.board,
    required this.ai,
    required this.onOpenPanel,
  });

  final BoardController board;
  final AiController ai;

  /// Switches the side panel (to the AI or Quiz panel).
  final ValueChanged<PanelKind> onOpenPanel;

  @override
  State<BooksPanel> createState() => _BooksPanelState();
}

class _BooksPanelState extends State<BooksPanel> {
  Future<Syllabus?>? _syllabus;
  String? _sessionId;
  Future<TopicDetail>? _topic;
  final Set<String> _open = {};

  @override
  void initState() {
    super.initState();
    widget.board.addListener(_onBoard);
    _onBoard();
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
      _syllabus = id == null || widget.board.api == null
          ? null
          : widget.board.api!.syllabus();
    });
  }

  void _reload() => setState(() {
    _syllabus = widget.board.api!.syllabus();
  });

  @override
  Widget build(BuildContext context) {
    final topic = _topic;
    return PanelPage(
      icon: Icons.menu_book_outlined,
      title: topic == null ? 'Books' : 'Topic',
      accent: _booksAccent,
      onBack: topic == null
          ? null
          : () => setState(() {
              _topic = null;
            }),
      child: topic != null ? _topicView(topic) : _syllabusView(),
    );
  }

  Widget _syllabusView() {
    final future = _syllabus;
    if (future == null) {
      return const Padding(
        padding: EdgeInsets.all(Kx.s24),
        child: Align(
          alignment: Alignment.topCenter,
          child: AiNotice(
            key: Key('books-signin'),
            icon: Icons.lock_outline,
            message: 'Books show the syllabus of the class being taught. Sign in with the Teacher app to open it.',
          ),
        ),
      );
    }
    return FutureBuilder<Syllabus?>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done)
          return const AiLoading(label: 'Opening the syllabus…');
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Align(
              alignment: Alignment.topCenter,
              child: AiError(
                message:
                    'Could not open the syllabus. Check the board is online.',
                onRetry: _reload,
              ),
            ),
          );
        }
        final s = snap.data;
        if (s == null) {
          return const KxEmptyState(
            key: Key('books-unlinked'),
            icon: Icons.link_off,
            message: "This subject isn't linked to a syllabus yet. Your admin can link it in KINETIX ERP → Syllabus.",
          );
        }
        return _outline(s);
      },
    );
  }

  Widget _outline(Syllabus s) {
    final c = context.colors;
    return ListView(
      key: const Key('books-outline'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      children: [
        Text(s.title, style: context.text.titleLarge),
        if (!s.reviewed)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s4),
            child: Text(
              'Draft content: check against your textbook before teaching from it.',
              style: context.text.bodySmall?.copyWith(
                color: c.onSurfaceVariant,
              ),
            ),
          ),
        const SizedBox(height: Kx.s16),
        for (final (i, ch) in s.chapters.indexed)
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
                      if (ch.own) 'Added by your institution',
                      ch.topics.isEmpty
                          ? 'Notes coming soon'
                          : '${ch.topics.length} topic${ch.topics.length == 1 ? '' : 's'}',
                    ].join(' · '),
                  ),
                  trailing: ch.topics.isEmpty
                      ? null
                      : Icon(
                          _open.contains(ch.id)
                              ? Icons.expand_less
                              : Icons.expand_more,
                        ),
                  onTap: ch.topics.isEmpty
                      ? null
                      : () => setState(
                          () => _open.contains(ch.id)
                              ? _open.remove(ch.id)
                              : _open.add(ch.id),
                        ),
                ),
                if (_open.contains(ch.id))
                  for (final t in ch.topics)
                    ListTile(
                      key: Key('topic-${t.id}'),
                      contentPadding: const EdgeInsets.only(
                        left: 72,
                        right: Kx.s16,
                      ),
                      title: Text(t.title),
                      subtitle: t.summary.isEmpty
                          ? null
                          : Text(
                              t.summary,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                      trailing: const Icon(Icons.chevron_right),
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
        if (snap.connectionState != ConnectionState.done)
          return const AiLoading(label: 'Opening the topic…');
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Align(
              alignment: Alignment.topCenter,
              child: AiError(
                message: 'Could not open this topic.',
                onRetry: () => setState(() {
                  _topic = null;
                }),
              ),
            ),
          );
        }
        final t = snap.data!;
        final c = context.colors;
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
                      child: Text(
                        n,
                        style: const TextStyle(
                          fontSize: ClassType.body,
                          height: 1.45,
                        ),
                      ),
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
            Text(
              t.chapterTitle,
              style: context.text.labelLarge?.copyWith(
                color: c.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: Kx.s4),
            Text(t.title, style: context.text.headlineSmall),
            if (t.summary.isNotEmpty) ...[
              const SizedBox(height: Kx.s12),
              Text(
                t.summary,
                style: TextStyle(
                  fontSize: ClassType.lead,
                  height: 1.4,
                  color: c.onSurface,
                ),
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
                          widget.ai.ask('Explain ${t.title}', topicId: t.id);
                        }
                      : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('Explain with KINETIX AI'),
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
                  label: const Text('Quick quiz on this'),
                ),
              ],
            ),
            if (t.notes.isNotEmpty)
              list('Key facts', t.notes, Icons.check_circle_outline),
            if (t.outcomes.isNotEmpty)
              list('By the end, students can', t.outcomes, Icons.flag_outlined),
            if (!t.reviewed)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s16),
                child: Text(
                  'Draft content: check against your textbook.',
                  style: context.text.bodySmall?.copyWith(
                    color: c.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
