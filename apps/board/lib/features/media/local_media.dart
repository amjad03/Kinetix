import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../board/panel/panel_host.dart';
import '../doc_camera/doc_camera.dart' show paintMarks;

/// Video or audio from the board's files or a USB stick.
enum LocalMediaKind { video, audio }

const videoExtensions = ['mp4', 'm4v', 'mov', 'webm', 'mkv', '3gp', 'avi'];
const audioExtensions = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];

/// Which kind a file is, by its extension (null: neither).
LocalMediaKind? mediaKindOf(String path) {
  final dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  final ext = path.substring(dot + 1).toLowerCase();
  if (videoExtensions.contains(ext)) return LocalMediaKind.video;
  if (audioExtensions.contains(ext)) return LocalMediaKind.audio;
  return null;
}

/// Plays one local file. Behind an interface so tests (and boards without a player for a
/// format) can stand in for it.
abstract class LocalMediaPlayer extends ChangeNotifier {
  /// Tests replace it.
  static LocalMediaPlayer Function(String path, LocalMediaKind kind) create = (path, kind) => kind == LocalMediaKind.video ? VideoFilePlayer(path) : AudioFilePlayer(path);

  /// Opens the file; throws when this board cannot play it.
  Future<void> open();
  bool get playing;
  Duration get position;
  Duration get duration;

  /// Width / height of the picture (audio: 16/9 for the visual).
  double get aspectRatio;
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);

  /// The picture (null for audio).
  Widget? view();
}

/// Video files with video_player (Android, macOS; Windows via video_player_win).
class VideoFilePlayer extends LocalMediaPlayer {
  VideoFilePlayer(this.path);
  final String path;
  VideoPlayerController? _c;

  @override
  Future<void> open() async {
    final c = VideoPlayerController.file(File(path));
    _c = c;
    await c.initialize();
    c.addListener(notifyListeners);
  }

  @override
  bool get playing => _c?.value.isPlaying ?? false;
  @override
  Duration get position => _c?.value.position ?? Duration.zero;
  @override
  Duration get duration => _c?.value.duration ?? Duration.zero;
  @override
  double get aspectRatio {
    final r = _c?.value.aspectRatio ?? 0;
    return r > 0 ? r : 16 / 9;
  }

  @override
  Future<void> play() async => _c?.play();
  @override
  Future<void> pause() async => _c?.pause();
  @override
  Future<void> seek(Duration to) async => _c?.seekTo(to);
  @override
  Widget? view() => _c == null ? null : VideoPlayer(_c!);

  @override
  void dispose() {
    final c = _c;
    _c = null;
    c?.removeListener(notifyListeners);
    unawaited(c?.dispose());
    super.dispose();
  }
}

/// Audio files with audioplayers (every board platform).
class AudioFilePlayer extends LocalMediaPlayer {
  AudioFilePlayer(this.path);
  final String path;
  final _p = AudioPlayer();
  final _subs = <StreamSubscription<Object?>>[];
  Duration _pos = Duration.zero, _dur = Duration.zero;
  bool _playing = false;

  @override
  Future<void> open() async {
    _subs
      ..add(_p.onPositionChanged.listen((d) => _set(() => _pos = d)))
      ..add(_p.onDurationChanged.listen((d) => _set(() => _dur = d)))
      ..add(_p.onPlayerStateChanged.listen((s) => _set(() => _playing = s == PlayerState.playing)));
    await _p.setSource(DeviceFileSource(path));
    _dur = await _p.getDuration() ?? Duration.zero;
  }

  void _set(VoidCallback f) {
    f();
    notifyListeners();
  }

  @override
  bool get playing => _playing;
  @override
  Duration get position => _pos;
  @override
  Duration get duration => _dur;
  @override
  double get aspectRatio => 16 / 9;
  @override
  Future<void> play() => _p.resume();
  @override
  Future<void> pause() => _p.pause();
  @override
  Future<void> seek(Duration to) => _p.seek(to);
  @override
  Widget? view() => null;

  @override
  void dispose() {
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    unawaited(_p.dispose());
    super.dispose();
  }
}

/// Picks a video or audio file from the board's storage or a USB stick. Tests replace it.
Future<String?> Function(LocalMediaKind kind) pickLocalMedia = (kind) async {
  final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: kind == LocalMediaKind.video ? videoExtensions : audioExtensions);
  if (f == null) return null;
  if (f.path != null) return f.path;
  // A USB stick or cloud file on Android comes as content: copy it (streamed) to play it.
  final out = File('${(await getTemporaryDirectory()).path}${Platform.pathSeparator}${f.name}');
  final sink = out.openWrite();
  await sink.addStream(f.xFile.openRead());
  await sink.close();
  return out.path;
};

/// Insert → Videos/Audio from files: picks a file and plays it in the panel beside the board.
Future<void> openLocalMedia(BuildContext context, LocalMediaKind kind) async {
  final path = await pickLocalMedia(kind);
  if (path == null || !context.mounted) return;
  await showPanelDialog<void>(context: context, builder: (_) => LocalMediaPane(path: path, kind: mediaKindOf(path) ?? kind));
}

/// The media pane: the video (or an audio visual) with play, seek and time, and a pen that
/// writes over the picture. The writing stays with the pane; the board is not changed.
class LocalMediaPane extends StatefulWidget {
  const LocalMediaPane({super.key, required this.path, required this.kind});

  final String path;
  final LocalMediaKind kind;

  @override
  State<LocalMediaPane> createState() => _LocalMediaPaneState();
}

class _LocalMediaPaneState extends State<LocalMediaPane> {
  late final LocalMediaPlayer _player = LocalMediaPlayer.create(widget.path, widget.kind);
  bool _ready = false;
  bool _failed = false;
  bool _pen = false;
  Color _ink = const Color(0xFFE53935);
  final List<(Color, List<Offset>)> _strokes = [];

  static const _inks = [Color(0xFFE53935), Color(0xFFFFEB3B), Color(0xFF43A047), Color(0xFF1E88E5), Color(0xFFFFFFFF)];

  @override
  void initState() {
    super.initState();
    _player.addListener(_changed);
    unawaited(_open());
  }

  Future<void> _open() async {
    try {
      await _player.open();
      if (!mounted) return;
      setState(() => _ready = true);
      await _player.play();
    } catch (e) {
      debugPrint('Local media: $e');
      if (!mounted) return;
      setState(() => _failed = true);
      showBoardMessage(context, context.l10n.mediaCannotPlay);
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _player.removeListener(_changed);
    _player.dispose();
    super.dispose();
  }

  String get _name => widget.path.split(RegExp(r'[\\/]')).last;

  static String _fmt(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    final m = two(d.inMinutes.remainder(60)), s = two(d.inSeconds.remainder(60));
    return d.inHours > 0 ? '${d.inHours}:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final picture = _player.view();
    final stage = AspectRatio(
      aspectRatio: _player.aspectRatio,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: Color(0xFF000000)),
          if (picture != null)
            picture
          else
            Center(child: Icon(widget.kind == LocalMediaKind.audio ? Icons.graphic_eq : Icons.movie_outlined, size: 96, color: const Color(0xB3FFFFFF))),
          // Writing over the picture: a pen while [_pen], else taps pass to nothing below.
          IgnorePointer(
            ignoring: !_pen,
            child: GestureDetector(
              key: const Key('media-ink'),
              onPanStart: (d) => setState(() => _strokes.add((_ink, [d.localPosition]))),
              onPanUpdate: (d) => setState(() => _strokes.last.$2.add(d.localPosition)),
              child: CustomPaint(painter: _InkPainter(_strokes), size: Size.infinite),
            ),
          ),
        ],
      ),
    );
    final pos = _player.position, dur = _player.duration;
    final max = dur.inMilliseconds <= 0 ? 1.0 : dur.inMilliseconds.toDouble();
    return AlertDialog(
      key: const Key('local-media-pane'),
      titlePadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s8, 0),
      contentPadding: const EdgeInsets.all(Kx.s12),
      title: Row(
        children: [
          Icon(widget.kind == LocalMediaKind.video ? Icons.movie_outlined : Icons.audio_file_outlined, color: c.primary),
          const SizedBox(width: Kx.s8),
          Expanded(child: Text(_name, overflow: TextOverflow.ellipsis)),
          IconButton(key: const Key('media-close'), tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
        ],
      ),
      content: SizedBox(
        width: 720,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(borderRadius: Kx.radiusLg, child: stage),
            if (_failed) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.mediaCannotPlay, style: TextStyle(color: c.error))),
            Row(
              children: [
                IconButton(
                  key: const Key('media-play'),
                  onPressed: !_ready ? null : () => unawaited(_player.playing ? _player.pause() : _player.play()),
                  icon: Icon(_player.playing ? Icons.pause : Icons.play_arrow),
                ),
                Text(_fmt(pos)),
                Expanded(
                  child: Slider(
                    key: const Key('media-seek'),
                    value: pos.inMilliseconds.clamp(0, max.toInt()).toDouble(),
                    max: max,
                    onChanged: !_ready ? null : (v) => unawaited(_player.seek(Duration(milliseconds: v.round()))),
                  ),
                ),
                Text(_fmt(dur)),
              ],
            ),
            Wrap(
              spacing: Kx.s8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilterChip(
                  key: const Key('media-pen'),
                  avatar: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(l.mediaAnnotate),
                  selected: _pen,
                  onSelected: (v) => setState(() => _pen = v),
                ),
                for (final ink in _inks)
                  InkWell(
                    onTap: () => setState(() {
                      _ink = ink;
                      _pen = true;
                    }),
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(color: ink, shape: BoxShape.circle, border: Border.all(color: ink == _ink && _pen ? c.primary : c.outline, width: ink == _ink && _pen ? 3 : 1)),
                    ),
                  ),
                TextButton.icon(
                  key: const Key('media-clear'),
                  onPressed: _strokes.isEmpty ? null : () => setState(_strokes.clear),
                  icon: const Icon(Icons.layers_clear_outlined, size: 18),
                  label: Text(l.mediaClearInk),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InkPainter extends CustomPainter {
  _InkPainter(this.strokes);
  final List<(Color, List<Offset>)> strokes;
  @override
  void paint(Canvas canvas, Size size) => paintMarks(canvas, strokes);
  @override
  bool shouldRepaint(_InkPainter old) => true;
}

/// Insert → Videos: concept videos for the topic, or a video or audio file.
Future<void> chooseVideoSource(BuildContext context, {required VoidCallback conceptVideos}) async {
  final l = context.l10n;
  final choice = await showDialog<int>(
    context: context,
    builder: (context) => SimpleDialog(
      key: const Key('insert-video-choice'),
      title: Text(l.insertVideosTitle),
      children: [
        SimpleDialogOption(
          key: const Key('insert-video-concept'),
          onPressed: () => Navigator.pop(context, 0),
          child: ListTile(leading: const Icon(Icons.smart_display_outlined), title: Text(l.toolConceptVideos)),
        ),
        SimpleDialogOption(
          key: const Key('insert-video-file'),
          onPressed: () => Navigator.pop(context, 1),
          child: ListTile(leading: const Icon(Icons.video_file_outlined), title: Text(l.insertLocalVideo)),
        ),
        SimpleDialogOption(
          key: const Key('insert-audio-file'),
          onPressed: () => Navigator.pop(context, 2),
          child: ListTile(leading: const Icon(Icons.audio_file_outlined), title: Text(l.insertLocalAudio)),
        ),
      ],
    ),
  );
  if (!context.mounted) return;
  switch (choice) {
    case 0:
      conceptVideos();
    case 1:
      await openLocalMedia(context, LocalMediaKind.video);
    case 2:
      await openLocalMedia(context, LocalMediaKind.audio);
  }
}
