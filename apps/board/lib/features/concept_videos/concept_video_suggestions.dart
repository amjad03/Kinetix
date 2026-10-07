import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import '../search/search_strings.dart';
import '../board/layout/layout_strings.dart';
import '../board/phone_chrome.dart';
import 'concept_video_player.dart';
import 'concept_videos.dart';
import '../board/panel/panel_host.dart';

/// When to suggest concept videos: at the start of each period (or when a teacher opens their
/// class mid-period), unless the teacher skipped them for that period. Asks again when the
/// period starts if it only knew the next one, and after a period ends for the next.
class ConceptVideoSuggester extends ChangeNotifier {
  ConceptVideoSuggester(this.board, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    board.addListener(_onBoard);
    _onBoard();
  }

  final BoardController board;
  final DateTime Function() _clock;

  /// The latest answer (null until the first one, or when the board has no server).
  PeriodVideos? current;

  /// Periods ("slot|date") the teacher skipped.
  final Set<String> _skipped = {};
  String? _seen;
  Timer? _next;
  bool _disposed = false;

  /// Show the card: a period in progress with videos, not skipped.
  bool get visible {
    final c = current;
    return c != null && c.period != null && c.period!.isNow && c.videos.isNotEmpty && !_skipped.contains(c.key);
  }

  /// A different class (a teacher signed in or out) or a newly enrolled board: ask again.
  void _onBoard() {
    if (board.stage != BoardStage.board || board.api == null) return;
    final seen = board.session?.sessionId ?? 'board';
    if (seen == _seen) return;
    _seen = seen;
    unawaited(refresh());
  }

  Future<void> refresh() async {
    final api = board.api;
    if (api == null) return;
    _next?.cancel();
    try {
      current = PeriodVideos.fromJson(await api.conceptVideosNow());
    } catch (e) {
      // Offline or no class: no card; the Concept videos tool still tries again when opened.
      debugPrint('Concept videos not fetched: $e');
      return;
    }
    if (_disposed) return;
    final p = current!.period;
    if (p != null) {
      // Not started yet: ask again at its start. In progress: ask after it ends, for the next one.
      final at = p.isNow ? p.end.add(const Duration(minutes: 1)) : p.start;
      final wait = at.difference(_clock());
      _next = Timer(wait.isNegative ? const Duration(minutes: 1) : wait, () => unawaited(refresh()));
    }
    notifyListeners();
  }

  void skip() {
    final key = current?.key;
    if (key == null) return;
    _skipped.add(key);
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _next?.cancel();
    board.removeListener(_onBoard);
    super.dispose();
  }
}

/// The board with the concept-video suggestion card over it (top right), at the start of a period.
class ConceptVideoSuggestions extends StatefulWidget {
  const ConceptVideoSuggestions({super.key, required this.board, required this.child, this.clock});

  final BoardController board;
  final Widget child;
  final DateTime Function()? clock;

  @override
  State<ConceptVideoSuggestions> createState() => _ConceptVideoSuggestionsState();
}

class _ConceptVideoSuggestionsState extends State<ConceptVideoSuggestions> {
  late final ConceptVideoSuggester _suggester = ConceptVideoSuggester(widget.board, clock: widget.clock);

  @override
  void dispose() {
    _suggester.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      widget.child,
      ListenableBuilder(
        listenable: _suggester,
        builder: (context, _) {
          if (!_suggester.visible) return const SizedBox.shrink();
          // Under the top bar, and on a phone within its width and above its bar.
          final size = MediaQuery.sizeOf(context);
          final safe = MediaQuery.paddingOf(context);
          final phone = isPhoneSize(size);
          final top = phone ? safe.top + 56 : 88.0;
          final right = phone ? Kx.s8 + safe.right : Kx.s24;
          return Positioned(
            top: top,
            right: right,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: size.width - right - Kx.s8 - safe.left, maxHeight: size.height - top - Kx.s8 - safe.bottom),
              child: ConceptVideoCard(videos: _suggester.current!, onSkip: _suggester.skip),
            ),
          );
        },
      ),
    ],
  );
}

String sourceLabel(AppLocalizations l, PeriodTopicSource? s) => switch (s) {
  PeriodTopicSource.lessonPlan => l.conceptVideosSourceLessonPlan,
  PeriodTopicSource.yearPlan => l.conceptVideosSourceYearPlan,
  PeriodTopicSource.syllabus => l.conceptVideosSourceSyllabus,
  null => '',
};

/// "Concept videos for this period": the topic, its videos (tap to play full screen) and Skip.
class ConceptVideoCard extends StatelessWidget {
  const ConceptVideoCard({super.key, required this.videos, required this.onSkip});

  final PeriodVideos videos;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final p = videos.period!;
    return Material(
      key: const Key('conceptVideoCard'),
      elevation: 6,
      color: c.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rXl),
      child: SizedBox(
        width: 460,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s16, Kx.s16, Kx.s16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.smart_display_outlined, color: c.primary),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: Text(l.conceptVideosForPeriod, style: context.text.titleMedium)),
                  IconButton(tooltip: l.close, onPressed: onSkip, icon: const Icon(Icons.close)),
                ],
              ),
              Text(
                [p.subjectName, ...videos.topics.map((t) => t.title)].where((s) => s.isNotEmpty).join(' · '),
                style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
              ),
              const SizedBox(height: Kx.s12),
              // The list gives way on a short screen (a phone on its side).
              Flexible(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 340),
                  child: ListView(
                    shrinkWrap: true,
                    children: [for (final v in videos.videos.take(6)) ConceptVideoTile(video: v)],
                  ),
                ),
              ),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${sourceLabel(l, videos.source)}${videos.source == null ? '' : ' · '}${l.conceptVideosFromYouTube}',
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ),
                  TextButton(key: const Key('conceptVideoSkip'), onPressed: onSkip, child: Text(l.conceptVideosSkip)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A video row: YouTube's thumbnail, the title, duration and language. Tap plays it full screen.
class ConceptVideoTile extends StatelessWidget {
  const ConceptVideoTile({super.key, required this.video});

  final ConceptVideo video;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final language = BoardLanguage.tryParse(video.language)?.label ?? video.language;
    final meta = [if (video.durationLabel.isNotEmpty) video.durationLabel, language].join(' · ');
    return Semantics(
      button: true,
      label: context.l10n.conceptVideosPlay(video.title),
      child: InkWell(
        key: Key('conceptVideo-${video.id}'),
        borderRadius: BorderRadius.circular(Kx.rMd),
        onTap: () => ConceptVideoPlayer.open(context, video),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Kx.s8),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(Kx.rSm),
                child: SizedBox(
                  width: 128,
                  height: 72,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        video.thumbnailUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => ColoredBox(color: c.surfaceContainerHighest),
                      ),
                      const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 36)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(video.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w500)),
                    const SizedBox(height: Kx.s4),
                    Row(
                      children: [
                        VideoSourceBadge(source: video.source, key: Key('videoSource-${video.id}')),
                        const SizedBox(width: Kx.s8),
                        Flexible(child: Text(meta, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Who linked a video: KINETIX, the institution or a teacher.
class VideoSourceBadge extends StatelessWidget {
  const VideoSourceBadge({super.key, required this.source});

  final String source;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = LayoutStrings.of(context);
    final label = switch (source) {
      'institution' => s.videoSourceInstitution,
      'teacher' => s.videoSourceTeacher,
      _ => s.videoSourcePlatform,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
      decoration: BoxDecoration(color: source == 'platform' ? c.surfaceContainerHighest : c.tertiaryContainer, borderRadius: BorderRadius.circular(Kx.rSm)),
      child: Text(label, style: context.text.labelSmall?.copyWith(color: source == 'platform' ? c.onSurfaceVariant : c.onTertiaryContainer)),
    );
  }
}

/// The Concept videos tool: the period's videos any time (not only at its start).
class ConceptVideosDialog extends StatefulWidget {
  const ConceptVideosDialog({super.key, required this.board});

  final BoardController board;

  static Future<void> open(BuildContext context, BoardController board) =>
      showPanelDialog<void>(context: context, builder: (_) => ConceptVideosDialog(board: board));

  @override
  State<ConceptVideosDialog> createState() => _ConceptVideosDialogState();
}

class _ConceptVideosDialogState extends State<ConceptVideosDialog> {
  Future<PeriodVideos>? _load;
  String _q = '';

  @override
  void initState() {
    super.initState();
    _load = _fetch();
  }

  Future<PeriodVideos>? _fetch() => widget.board.api?.conceptVideosNow().then(PeriodVideos.fromJson);

  void _reload() {
    final load = _fetch();
    setState(() {
      _load = load;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      key: const Key('conceptVideosDialog'),
      icon: const Icon(Icons.smart_display_outlined),
      title: Text(l.conceptVideosTitle),
      content: SizedBox(width: 560, child: _body(context)),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l.close))],
    );
  }

  Widget _message(String text, {Key? key, VoidCallback? retry}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(text, key: key, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18)),
        if (retry != null) ...[const SizedBox(height: Kx.s12), FilledButton.tonal(onPressed: retry, child: Text(context.l10n.retry))],
      ],
    ),
  );

  Widget _body(BuildContext context) {
    final l = context.l10n;
    final load = _load;
    if (load == null) return _message(l.conceptVideosSignIn, key: const Key('conceptVideosSignIn'));
    return FutureBuilder<PeriodVideos>(
      future: load,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const Padding(padding: EdgeInsets.all(Kx.s32), child: Center(child: CircularProgressIndicator()));
        if (snap.hasError) return _message(l.conceptVideosCouldNotLoad, retry: _reload);
        final v = snap.data!;
        final p = v.period;
        if (p == null) return _message(l.conceptVideosNoPeriod, key: const Key('conceptVideosNoPeriod'));
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text([p.subjectName, ...v.topics.map((t) => t.title)].where((s) => s.isNotEmpty).join(' · '), style: context.text.titleMedium),
            Text(
              [if (!p.isNow) l.conceptVideosNext(p.startLabel), sourceLabel(l, v.source), l.conceptVideosFromYouTube].where((s) => s.isNotEmpty).join(' · '),
              style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s8),
            if (v.videos.isEmpty)
              _message(l.conceptVideosNone, key: const Key('conceptVideosNone'))
            else ...[
              if (v.videos.length > 3)
                ModuleSearchField(
                  key: const Key('videos-search'),
                  hint: SearchStrings.of(context).searchVideos,
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  onChanged: (q) => setState(() => _q = q),
                ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [for (final x in matching(v.videos, (x) => [x.title, ?x.topicTitle], _q)) ConceptVideoTile(video: x)],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
