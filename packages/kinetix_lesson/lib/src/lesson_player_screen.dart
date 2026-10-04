import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'audio.dart';
import 'format.dart';
import 'l10n.dart';
import 'recording.dart';

/// Plays a lesson recording: the board as it was written, in step with the teacher's voice,
/// with the summary and transcript when they are ready.
class LessonPlayerScreen extends StatefulWidget {
  const LessonPlayerScreen({super.key, required this.source, required this.recordingId, this.initial, this.audioFactory});

  final LessonSource source;
  final String recordingId;

  /// What the list already knows, shown while the lesson loads. Its [RecordingInfo.missed]
  /// flag is kept (the details response does not carry it).
  final RecordingInfo? initial;

  /// Defaults to [createLessonAudio].
  final LessonAudioFactory? audioFactory;

  static Future<void> open(BuildContext context, {required LessonSource source, required String recordingId, RecordingInfo? initial}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LessonPlayerScreen(source: source, recordingId: recordingId, initial: initial),
        ),
      );

  @override
  State<LessonPlayerScreen> createState() => _LessonPlayerScreenState();
}

class _LessonPlayerScreenState extends State<LessonPlayerScreen> with SingleTickerProviderStateMixin {
  static const speeds = [1.0, 1.5, 2.0];
  static const skip = Duration(seconds: 10);

  RecordingInfo? _info;
  LessonPlayer? _player;
  LessonAudio? _audio;
  Duration _total = Duration.zero;
  /// What went wrong, worded in the viewer's language at build time.
  String Function(BuildContext context)? _error;
  bool _loading = true;

  /// The slider while it is being dragged (the board previews it).
  double? _dragMs;
  final _position = ValueNotifier(Duration.zero);
  late final Ticker _ticker = createTicker((_) => _sync());

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _audio
      ?..removeListener(_onAudio)
      ..pause()
      ..dispose();
    _player?.dispose();
    _position.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      final results = await Future.wait<Object>([widget.source.recording(widget.recordingId), widget.source.lesson(widget.recordingId)]);
      var info = results[0] as RecordingInfo;
      final lesson = results[1] as Lesson;
      if (widget.initial?.missed ?? false) info = info.copyWith(missed: true);
      var total = lesson.duration > info.duration ? lesson.duration : info.duration;
      final audio = await (widget.audioFactory ?? createLessonAudio)(info, info.hasAudio ? widget.source.audio(info.id) : null, total);
      if (!mounted) {
        audio.dispose();
        return;
      }
      final audioLength = audio.duration;
      if (audioLength != null && audioLength > total) total = audioLength;
      _audio?.removeListener(_onAudio);
      _audio?.dispose();
      _player?.dispose();
      setState(() {
        _info = info;
        _total = total;
        _player = LessonPlayer(lesson);
        _audio = audio..addListener(_onAudio);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = switch (e) {
          LessonLoadException(:final describe?) => describe,
          LessonLoadException(:final message) => (_) => message,
          _ => (context) => LessonStrings.of(context).loadFailed,
        };
      });
    }
  }

  /// Moves the board to wherever the audio is.
  void _sync() {
    final audio = _audio, player = _player;
    if (audio == null || player == null) return;
    var pos = audio.completed ? _total : audio.position;
    if (pos > _total) pos = _total;
    if (pos != player.position) player.seek(pos);
    _position.value = pos;
    if (!audio.playing && _ticker.isActive) {
      _ticker.stop();
      setState(() {}); // the play button
    }
  }

  void _onAudio() {
    final audio = _audio!;
    if (audio.playing && !_ticker.isActive) _ticker.start();
    _sync();
    if (mounted) setState(() {});
  }

  Future<void> _toggle() async {
    final audio = _audio;
    if (audio == null) return;
    audio.playing ? await audio.pause() : await audio.play();
  }

  Future<void> _seek(Duration to) async {
    final audio = _audio;
    if (audio == null) return;
    if (to < Duration.zero) to = Duration.zero;
    if (to > _total) to = _total;
    // Past the end of the audio (the board ran on a little), the board alone moves.
    final audioEnd = audio.duration;
    await audio.seek(audioEnd != null && to > audioEnd ? audioEnd : to);
    _player?.seek(to);
    _position.value = to;
  }

  Future<void> _skip(Duration by) => _seek(_position.value + by);

  Future<void> _cycleSpeed() async {
    final audio = _audio;
    if (audio == null) return;
    final i = speeds.indexOf(audio.speed);
    await audio.setSpeed(speeds[(i + 1) % speeds.length]);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = LessonStrings.of(context);
    final info = _info ?? widget.initial;
    final subtitle = [?info?.subjectName, ?info?.teacherName, if (info != null) LessonFmt.when(info.startedAt, s)].join(' · ');

    return Scaffold(
      backgroundColor: c.surfaceContainer,
      appBar: AppBar(
        backgroundColor: c.surfaceContainer,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(info?.title ?? s.lessonRecording, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium),
            if (subtitle.isNotEmpty)
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
              ),
          ],
        ),
      ),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Align(
                alignment: Alignment.topCenter,
                child: _ErrorBox(_error!(context), onRetry: _load),
              ),
            )
          : _loading || _player == null
          ? const Center(child: CircularProgressIndicator())
          : CallbackShortcuts(
              bindings: {
                const SingleActivator(LogicalKeyboardKey.space): _toggle,
                const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _skip(-skip),
                const SingleActivator(LogicalKeyboardKey.arrowRight): () => _skip(skip),
              },
              child: Focus(autofocus: true, child: _body(context)),
            ),
    );
  }

  Widget _body(BuildContext context) {
    final info = _info!;
    final details = _Details.tabsFor(info).isEmpty ? null : _Details(info: info);
    final notes = _notes(context, info);
    return LayoutBuilder(
      builder: (context, constraints) {
        // Tablets, desktops and phones held sideways: the summary goes beside the board.
        final wide = constraints.maxWidth >= 840 || constraints.maxWidth > constraints.maxHeight * 1.2;
        final side = constraints.maxWidth >= 840 ? 400.0 : constraints.maxWidth * 0.4;
        if (wide) {
          return SafeArea(
            top: false,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Column(
                    children: [
                      Expanded(child: _board(context)),
                      _controls(context),
                      ?notes,
                      const SizedBox(height: Kx.s8),
                    ],
                  ),
                ),
                if (details != null)
                  SizedBox(
                    width: side,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(0, Kx.s12, Kx.s16, Kx.s16),
                      child: Card(margin: EdgeInsets.zero, clipBehavior: Clip.antiAlias, child: details),
                    ),
                  ),
              ],
            ),
          );
        }
        return SafeArea(
          top: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (details == null) Expanded(child: _board(context)) else _board(context),
              _controls(context),
              ?notes,
              if (details != null) ...[
                const SizedBox(height: Kx.s8),
                Expanded(
                  child: Card(margin: const EdgeInsets.fromLTRB(Kx.s12, 0, Kx.s12, Kx.s12), clipBehavior: Clip.antiAlias, child: details),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _board(BuildContext context) {
    final s = LessonStrings.of(context);
    final player = _player!;
    final playing = _audio!.playing;
    return Padding(
      padding: const EdgeInsets.all(Kx.s12),
      child: Center(
        child: AspectRatio(
          aspectRatio: player.lesson.canvas.aspectRatio,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: Kx.radiusMd,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: ClipRRect(
              borderRadius: Kx.radiusMd,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  LessonView(key: const Key('lessonView'), player: player),
                  Semantics(
                    button: true,
                    label: playing ? s.pause : s.play,
                    child: GestureDetector(key: const Key('lessonBoard'), behavior: HitTestBehavior.opaque, onTap: _toggle),
                  ),
                  if (!playing)
                    IgnorePointer(
                      child: Center(
                        child: Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.5), shape: BoxShape.circle),
                          child: Icon(_audio!.completed ? Icons.replay : Icons.play_arrow, color: Colors.white, size: 40),
                        ),
                      ),
                    ),
                  Positioned(
                    top: Kx.s8,
                    right: Kx.s8,
                    child: ListenableBuilder(
                      listenable: player,
                      builder: (context, _) => player.pageCount < 2
                          ? const SizedBox.shrink()
                          : Container(
                              padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 3),
                              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: Kx.radiusSm),
                              child: Text(
                                s.page(player.pageIndex + 1, player.pageCount),
                                key: const Key('lessonPage'),
                                style: context.text.labelMedium?.copyWith(color: Colors.white),
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _controls(BuildContext context) {
    final c = context.colors;
    final s = LessonStrings.of(context);
    final audio = _audio!;
    final totalMs = _total.inMilliseconds.toDouble();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ValueListenableBuilder(
            valueListenable: _position,
            builder: (context, pos, _) {
              final ms = (_dragMs ?? pos.inMilliseconds.toDouble()).clamp(0.0, totalMs);
              return Column(
                children: [
                  Slider(
                    key: const Key('lessonSeek'),
                    value: totalMs == 0 ? 0 : ms,
                    max: totalMs == 0 ? 1 : totalMs,
                    semanticFormatterCallback: (v) => LessonFmt.clock(Duration(milliseconds: v.round())),
                    onChanged: totalMs == 0
                        ? null
                        : (v) {
                            setState(() => _dragMs = v);
                            _player!.seek(Duration(milliseconds: v.round()));
                          },
                    onChangeEnd: (v) {
                      setState(() => _dragMs = null);
                      _seek(Duration(milliseconds: v.round()));
                    },
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                    child: Row(
                      children: [
                        Text(
                          LessonFmt.clock(Duration(milliseconds: ms.round())),
                          key: const Key('lessonElapsed'),
                          style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                        const Spacer(),
                        Text(
                          LessonFmt.clock(_total),
                          key: const Key('lessonTotal'),
                          style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
          Row(
            children: [
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: const Key('lessonSpeed'),
                    onPressed: _cycleSpeed,
                    style: TextButton.styleFrom(minimumSize: const Size(56, Kx.target)),
                    child: Text(LessonFmt.speed(audio.speed), semanticsLabel: s.speed(LessonFmt.speed(audio.speed))),
                  ),
                ),
              ),
              IconButton(
                key: const Key('lessonBack10'),
                tooltip: s.back10,
                onPressed: () => _skip(-skip),
                icon: const Icon(Icons.replay_10),
              ),
              const SizedBox(width: Kx.s8),
              IconButton.filled(
                key: const Key('lessonPlay'),
                tooltip: audio.playing ? s.pause : (audio.completed ? s.playAgain : s.play),
                iconSize: 32,
                style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                onPressed: _toggle,
                icon: Icon(audio.playing ? Icons.pause : (audio.completed ? Icons.replay : Icons.play_arrow)),
              ),
              const SizedBox(width: Kx.s8),
              IconButton(
                key: const Key('lessonForward10'),
                tooltip: s.forward10,
                onPressed: () => _skip(skip),
                icon: const Icon(Icons.forward_10),
              ),
              const Expanded(child: SizedBox()),
            ],
          ),
        ],
      ),
    );
  }

  Widget? _notes(BuildContext context, RecordingInfo info) {
    final c = context.colors;
    final s = LessonStrings.of(context);
    final lines = <(IconData, String, Color)>[
      if (info.missed) (Icons.event_busy, s.missedNote, c.error),
      if (!info.hasAudio)
        (Icons.volume_off_outlined, s.noSound, c.onSurfaceVariant)
      else if (!_audio!.audible)
        (Icons.volume_off_outlined, s.soundUnavailable, c.onSurfaceVariant),
    ];
    if (lines.isEmpty) return null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (icon, text, color) in lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: color),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: Text(text, style: context.text.bodyMedium?.copyWith(color: color)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

enum _Tab { summary, transcript }

/// Summary and transcript tabs.
class _Details extends StatelessWidget {
  const _Details({required this.info});

  final RecordingInfo info;

  static List<_Tab> tabsFor(RecordingInfo i) => [
    if (i.summary != null || i.summaryState == Processing.queued) _Tab.summary,
    if (i.transcript != null || i.transcriptState == Processing.queued) _Tab.transcript,
  ];

  @override
  Widget build(BuildContext context) {
    final s = LessonStrings.of(context);
    final tabs = tabsFor(info);
    return DefaultTabController(
      key: ValueKey(tabs.map((t) => t.name).join()),
      length: tabs.length,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TabBar(tabs: [for (final t in tabs) Tab(text: t == _Tab.summary ? s.summary : s.transcript)]),
          Expanded(
            child: TabBarView(
              children: [
                for (final t in tabs)
                  if (t == _Tab.summary) _SummaryView(info) else _TranscriptView(info),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Pending extends StatelessWidget {
  const _Pending(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Kx.s24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.hourglass_top, color: context.colors.onSurfaceVariant),
          const SizedBox(height: Kx.s12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant),
          ),
        ],
      ),
    ),
  );
}

class _SummaryView extends StatelessWidget {
  const _SummaryView(this.info);

  final RecordingInfo info;

  @override
  Widget build(BuildContext context) {
    final s = info.summary;
    if (s == null) return _Pending(LessonStrings.of(context).summaryPending);
    final c = context.colors;
    return ListView(
      key: const Key('lessonSummary'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        if (s.summary.isNotEmpty) Text(s.summary, style: context.text.bodyLarge),
        if (s.keyPoints.isNotEmpty) ...[
          const SizedBox(height: Kx.s16),
          Text(LessonStrings.of(context).keyPoints, style: context.text.titleSmall?.copyWith(color: c.primary)),
          const SizedBox(height: Kx.s8),
          for (final p in s.keyPoints)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Icon(Icons.check_circle_outline, size: 18, color: c.primary),
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: Text(p, style: context.text.bodyMedium)),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

class _TranscriptView extends StatelessWidget {
  const _TranscriptView(this.info);

  final RecordingInfo info;

  @override
  Widget build(BuildContext context) {
    final t = info.transcript;
    if (t == null) return _Pending(LessonStrings.of(context).transcriptPending);
    return ListView(
      key: const Key('lessonTranscript'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [SelectableText(t, style: context.text.bodyLarge?.copyWith(height: 1.5))],
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message, {required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s12, Kx.s8, Kx.s12),
      decoration: BoxDecoration(color: c.errorContainer, borderRadius: Kx.radiusMd),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: c.onErrorContainer, size: 20),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(message, style: context.text.bodyMedium?.copyWith(color: c.onErrorContainer)),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(foregroundColor: c.onErrorContainer),
            child: Text(LessonStrings.of(context).retry),
          ),
        ],
      ),
    );
  }
}
