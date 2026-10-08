import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/board_controller.dart';
import '../../../l10n/l10n.dart';
import '../../concept_videos/concept_video_suggestions.dart';
import '../../concept_videos/concept_videos.dart';
import '../../search/filter_bar.dart';
import '../../search/fuzzy.dart';
import '../../search/search_strings.dart';
import '../layout/layout_strings.dart';

/// The split panel's Videos tab: the period's concept videos, with Topic and Language
/// dropdowns and a search. A video plays in the panel; "Add to board" puts a note of it on the
/// page (its title and link), so the class can find it again.
class ConceptVideosTab extends StatefulWidget {
  const ConceptVideosTab({super.key, required this.board, required this.onAddNote});

  final BoardController board;
  final ValueChanged<ConceptVideo> onAddNote;

  @override
  State<ConceptVideosTab> createState() => _ConceptVideosTabState();
}

class _ConceptVideosTabState extends State<ConceptVideosTab> {
  Future<PeriodVideos>? _load;
  String _q = '';
  String? _topic, _language;

  @override
  void initState() {
    super.initState();
    _load = widget.board.api?.conceptVideosNow().then(PeriodVideos.fromJson);
  }

  void _reload() {
    final next = widget.board.api?.conceptVideosNow().then(PeriodVideos.fromJson);
    // A block body: setState asserts if its callback returns a Future.
    setState(() {
      _load = next;
    });
  }

  /// The teacher pastes a YouTube link; it is added to the topic for this class.
  Future<void> _add(PeriodVideos v) async {
    final s = LayoutStrings.of(context);
    final topics = v.topics;
    final topic = topics.firstWhere((t) => t.title == _topic, orElse: () => topics.first);
    final link = await showDialog<String>(context: context, builder: (_) => _AddVideoDialog(strings: s));
    if (link == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.board.api!.addConceptVideo(topic.id, link, sectionId: v.period?.sectionId ?? '');
      messenger.showSnackBar(SnackBar(content: Text(s.videoAdded)));
      _reload();
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(s.videoNotAdded)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final search = SearchStrings.of(context);
    final load = _load;
    if (load == null) return KxEmptyState(key: const Key('conceptVideosSignIn'), icon: Icons.smart_display_outlined, message: l.conceptVideosSignIn);
    return FutureBuilder<PeriodVideos>(
      future: load,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snap.hasError) {
          return KxEmptyState(
            icon: Icons.cloud_off_outlined,
            message: l.conceptVideosCouldNotLoad,
            action: OutlinedButton.icon(
              key: const Key('videos-retry'),
              onPressed: _reload,
              icon: const Icon(Icons.refresh),
              label: Text(l.tryAgain),
            ),
          );
        }
        final v = snap.data!;
        final topics = {for (final x in v.videos) ?x.topicTitle};
        final languages = {for (final x in v.videos) x.language};
        final shown = matching(
          [
            for (final x in v.videos)
              if ((_topic == null || x.topicTitle == _topic) && (_language == null || x.language == _language)) x,
          ],
          (x) => [x.title, ?x.topicTitle],
          _q,
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ModuleSearchField(key: const Key('videos-search'), hint: search.searchVideos, onChanged: (q) => setState(() => _q = q)),
            FilterBar(
              menus: [
                FilterMenu(id: 'topic', label: s.topic, value: _topic, options: [for (final t in topics) (t, t)], onChanged: (x) => setState(() => _topic = x)),
                FilterMenu(
                  id: 'language',
                  label: s.language,
                  value: _language,
                  options: [for (final x in languages) (x, BoardLanguage.tryParse(x)?.label ?? x)],
                  onChanged: (x) => setState(() => _language = x),
                ),
              ],
            ),
            if (v.topics.isNotEmpty)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: TextButton.icon(key: const Key('video-add'), onPressed: () => _add(v), icon: const Icon(Icons.add_link), label: Text(s.addVideo)),
                ),
              ),
            Expanded(
              child: shown.isEmpty
                  ? KxEmptyState(key: const Key('conceptVideosNone'), icon: Icons.smart_display_outlined, message: v.videos.isEmpty ? s.videosNone : search.noneMatch)
                  : ListView(
                      key: const Key('videos-list'),
                      padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                      children: [
                        for (final x in shown)
                          Row(
                            children: [
                              Expanded(child: ConceptVideoTile(video: x)),
                              IconButton.filledTonal(
                                key: Key('video-note-${x.id}'),
                                tooltip: s.addToBoard,
                                onPressed: () => widget.onAddNote(x),
                                icon: const Icon(Icons.note_add_outlined),
                              ),
                            ],
                          ),
                      ],
                    ),
            ),
          ],
        );
      },
    );
  }
}

class _AddVideoDialog extends StatefulWidget {
  const _AddVideoDialog({required this.strings});

  final LayoutStrings strings;

  @override
  State<_AddVideoDialog> createState() => _AddVideoDialogState();
}

class _AddVideoDialogState extends State<_AddVideoDialog> {
  final _link = TextEditingController();

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    return AlertDialog(
      title: Text(s.addVideo),
      content: TextField(
        key: const Key('video-link'),
        controller: _link,
        autofocus: true,
        keyboardType: TextInputType.url,
        decoration: InputDecoration(labelText: s.videoLink, helperText: s.videoLinkHelp, helperMaxLines: 3),
        onChanged: (_) => setState(() {}),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.videoCancel)),
        FilledButton(key: const Key('video-link-add'), onPressed: _link.text.trim().isEmpty ? null : () => Navigator.pop(context, _link.text.trim()), child: Text(s.addVideo)),
      ],
    );
  }
}

/// A video's note on the board: its title and where to watch it.
NoteElement videoNote(ConceptVideo v) {
  final text = '▶ ${v.title}\nyoutu.be/${v.youtubeVideoId}';
  return NoteElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 340, 150), text: text, color: const Color(0xFFFFC9D9), kind: NoteKind.note);
}
