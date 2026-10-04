import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../ai/ai_controller.dart';
import '../ai/ai_widgets.dart';
import '../board/side_panel.dart';

const _booksAccent = Color(0xFF8AB4F8);

/// Books: the syllabus of the class open on the board, from the KINETIX content library.
/// A topic opens its notes in large type for the class, and can start an AI explanation or a
/// quick quiz grounded in that topic.
class BooksPanel extends StatefulWidget {
  const BooksPanel({super.key, required this.board, required this.ai, required this.onOpenPanel, this.onOpenResource});

  final BoardController board;
  final AiController ai;

  /// Switches the side panel (to the AI or Quiz panel).
  final ValueChanged<PanelKind> onOpenPanel;

  /// Opens a topic's 3D model or lab next to the whiteboard.
  final void Function(SplitContent content, String id)? onOpenResource;

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
      _syllabus = id == null || widget.board.api == null ? null : widget.board.api!.syllabus();
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
      title: topic == null ? context.l10n.toolBooks : context.l10n.booksTopic,
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
                    [if (ch.own) l.booksAddedByInstitution, ch.topics.isEmpty ? l.booksNotesSoon : l.booksTopicCount(ch.topics.length)].join(' · '),
                  ),
                  trailing: ch.topics.isEmpty ? null : Icon(_open.contains(ch.id) ? Icons.expand_less : Icons.expand_more),
                  onTap: ch.topics.isEmpty ? null : () => setState(() => _open.contains(ch.id) ? _open.remove(ch.id) : _open.add(ch.id)),
                ),
                if (_open.contains(ch.id))
                  for (final t in ch.topics)
                    ListTile(
                      key: Key('topic-${t.id}'),
                      contentPadding: const EdgeInsets.only(left: 72, right: Kx.s16),
                      title: Text(t.title),
                      subtitle: t.summary.isEmpty ? null : Text(t.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
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
            Text(t.title, style: context.text.headlineSmall),
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
              ],
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
            if (t.notes.isNotEmpty) list(l.booksKeyFacts, t.notes, Icons.check_circle_outline),
            if (t.outcomes.isNotEmpty) list(l.booksOutcomes, t.outcomes, Icons.flag_outlined),
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
