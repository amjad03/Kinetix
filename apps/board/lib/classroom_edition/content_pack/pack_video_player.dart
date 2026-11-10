import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:video_player/video_player.dart';

import '../classroom_hooks.dart';
import '../l10n/ce_strings.dart';
import '../ui/ce_style.dart';
import 'content_library.dart';
import 'content_pack.dart';

/// The player behind [PackVideoScreen]: video_player on the board, a fake in tests.
abstract class PackPlayer {
  ValueListenable<PackPlayerState> get state;
  Future<void> init();
  Future<void> play();
  Future<void> pause();
  Future<void> seekTo(Duration d);
  Future<void> setSpeed(double s);
  Widget view();
  Future<void> dispose();
}

@immutable
class PackPlayerState {
  const PackPlayerState({this.ready = false, this.playing = false, this.position = Duration.zero, this.duration = Duration.zero, this.speed = 1, this.aspect = 16 / 9, this.error});
  final bool ready, playing;
  final Duration position, duration;
  final double speed, aspect;
  final String? error;
}

/// Makes the player for a local MP4 (tests swap it).
PackPlayer Function(File file) packPlayerFor = (f) => _VideoPlayerPack(f);

class _VideoPlayerPack implements PackPlayer {
  _VideoPlayerPack(File f) : c = VideoPlayerController.file(f) {
    c.addListener(() {
      final v = c.value;
      _state.value = PackPlayerState(
        ready: v.isInitialized,
        playing: v.isPlaying,
        position: v.position,
        duration: v.duration,
        speed: v.playbackSpeed,
        aspect: v.isInitialized ? v.aspectRatio : 16 / 9,
        error: v.hasError ? v.errorDescription : null,
      );
    });
  }
  final VideoPlayerController c;
  final _state = ValueNotifier(const PackPlayerState());
  @override
  ValueListenable<PackPlayerState> get state => _state;
  @override
  Future<void> init() => c.initialize();
  @override
  Future<void> play() => c.play();
  @override
  Future<void> pause() => c.pause();
  @override
  Future<void> seekTo(Duration d) => c.seekTo(d);
  @override
  Future<void> setSpeed(double s) => c.setPlaybackSpeed(s);
  @override
  Widget view() => VideoPlayer(c);
  @override
  Future<void> dispose() async {
    await c.dispose();
    _state.dispose();
  }
}

/// Plays a pack video full screen. [host]: Put frame on board (null: no button).
Future<void> openPackVideo(BuildContext context, {required ContentLibrary lib, required ContentItem item, ClassroomHost? host}) =>
    Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(builder: (_) => PackVideoScreen(file: lib.fileOf(item), item: item, host: host)));

/// The smartboard's video player: big controls, chapter markers, ±10 s, speed, "Pause & draw"
/// (ink over the paused frame) and "Put frame on board" (the frame and the ink, as a picture).
class PackVideoScreen extends StatefulWidget {
  const PackVideoScreen({super.key, required this.file, required this.item, this.host});
  final File file;
  final ContentItem item;
  final ClassroomHost? host;

  @override
  State<PackVideoScreen> createState() => _PackVideoScreenState();
}

class _PackVideoScreenState extends State<PackVideoScreen> {
  late final PackPlayer p = packPlayerFor(widget.file);
  final _frameKey = GlobalKey();
  final strokes = <List<Offset>>[];
  bool drawing = false, putting = false;

  @override
  void initState() {
    super.initState();
    unawaited(p.init().catchError((Object e) => debugPrint('Pack video not opened: $e')));
  }

  @override
  void dispose() {
    unawaited(p.dispose());
    super.dispose();
  }

  Future<void> _seekBy(int s, PackPlayerState v) {
    final t = v.position + Duration(seconds: s);
    return p.seekTo(t < Duration.zero ? Duration.zero : (v.duration > Duration.zero && t > v.duration ? v.duration : t));
  }

  Future<void> _pauseAndDraw() async {
    await p.pause();
    setState(() => drawing = !drawing);
  }

  Future<void> _putFrame(PackPlayerState v) async {
    final host = widget.host;
    if (host == null || putting) return;
    setState(() => putting = true);
    try {
      await p.pause();
      final rb = _frameKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (rb == null) return;
      final img = await rb.toImage(pixelRatio: 1.5);
      final png = (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
      img.dispose();
      if (host.wb.elements.isNotEmpty) host.newPage();
      await host.putImage(png, width: 1400, title: '${widget.item.title} · ${_clock(v.position)}', at: const Offset(260, 40));
      host.showMessage(ceTr('The frame is on the board'));
      if (mounted) Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => putting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    key: const Key('pack-video'),
    backgroundColor: const Color(0xFF0B0D2A),
    body: SafeArea(
      child: ValueListenableBuilder<PackPlayerState>(
        valueListenable: p.state,
        builder: (context, v, _) => Column(
          children: [
            _top(v),
            Expanded(child: Center(child: _frame(v))),
            _timeline(v),
            _controls(v),
          ],
        ),
      ),
    ),
  );

  Widget _top(PackPlayerState v) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 24, 4),
    child: Row(
      children: [
        IconButton(key: const Key('pack-video-close'), iconSize: 44, tooltip: ceTr('Back'), color: Colors.white, onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: 8),
        Expanded(child: Text(widget.item.title, style: ceHeading(28, c: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis)),
        cePill(ceTr('From the content pack'), icon: Icons.sd_storage_outlined, bg: CeC.lavender),
      ],
    ),
  );

  Widget _frame(PackPlayerState v) => AspectRatio(
    aspectRatio: v.aspect,
    child: RepaintBoundary(
      key: _frameKey,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: Colors.black, child: v.error != null ? Center(child: Text(ceTr('This video cannot be played.'), style: ceText(24, c: Colors.white))) : p.view()),
          IgnorePointer(ignoring: !drawing, child: _Ink(strokes: strokes, onChanged: () => setState(() {}))),
          if (drawing) Positioned(top: 12, left: 12, child: cePill(ceTr('Drawing on the paused video'), icon: Icons.edit, bg: CeC.butter)),
        ],
      ),
    ),
  );

  Widget _timeline(PackPlayerState v) {
    final total = v.duration.inMilliseconds;
    final frac = total == 0 ? 0.0 : (v.position.inMilliseconds / total).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 8, 32, 0),
      child: Column(
        children: [
          SizedBox(
            height: 56,
            child: LayoutBuilder(
              builder: (context, c) => Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: SliderTheme(
                      data: SliderTheme.of(context).copyWith(trackHeight: 10, thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 16), activeTrackColor: CeC.accent, inactiveTrackColor: Colors.white24, thumbColor: Colors.white),
                      child: Slider(key: const Key('pack-video-seek'), value: frac, onChanged: total == 0 ? null : (f) => unawaited(p.seekTo(Duration(milliseconds: (f * total).round())))),
                    ),
                  ),
                  if (total > 0)
                    for (final (i, m) in widget.item.markers.indexed)
                      Positioned(
                        left: 24 + (c.maxWidth - 48) * (m.seconds * 1000 / total).clamp(0.0, 1.0) - 3,
                        top: 18,
                        child: IgnorePointer(child: Container(key: Key('pack-video-marker-$i'), width: 6, height: 20, color: CeC.butter)),
                      ),
                ],
              ),
            ),
          ),
          if (widget.item.markers.isNotEmpty)
            SizedBox(
              height: 64,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final (i, m) in widget.item.markers.indexed)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: ActionChip(
                        key: Key('pack-video-chapter-$i'),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        backgroundColor: _current(v) == i ? CeC.butter : Colors.white,
                        label: Text('${_clock(Duration(milliseconds: (m.seconds * 1000).round()))}  ${m.title}', style: ceText(18, c: CeC.navy, w: FontWeight.w600)),
                        onPressed: () => unawaited(p.seekTo(Duration(milliseconds: (m.seconds * 1000).round()))),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  int _current(PackPlayerState v) {
    var at = -1;
    for (final (i, m) in widget.item.markers.indexed) {
      if (v.position.inMilliseconds >= m.seconds * 1000) at = i;
    }
    return at;
  }

  Widget _big(Key key, IconData icon, String label, VoidCallback? onTap, {bool on = false}) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 8),
    child: Tooltip(
      message: label,
      child: Material(
        color: on ? CeC.butter : Colors.white,
        shape: const CircleBorder(),
        child: InkWell(
          key: key,
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(width: 88, height: 88, child: Icon(icon, size: 48, color: CeC.navy)),
        ),
      ),
    ),
  );

  Widget _controls(PackPlayerState v) => Padding(
    padding: const EdgeInsets.fromLTRB(32, 8, 32, 20),
    child: Row(
      children: [
        Text('${_clock(v.position)} / ${_clock(v.duration)}', key: const Key('pack-video-time'), style: ceText(22, c: Colors.white, w: FontWeight.w600)),
        const Spacer(),
        _big(const Key('pack-video-back10'), Icons.replay_10_rounded, ceTr('Back 10 seconds'), () => unawaited(_seekBy(-10, v))),
        _big(const Key('pack-video-play'), v.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, v.playing ? ceTr('Pause') : ceTr('Play'), () {
          if (drawing) setState(() => drawing = false);
          unawaited(v.playing ? p.pause() : p.play());
        }),
        _big(const Key('pack-video-fwd10'), Icons.forward_10_rounded, ceTr('Forward 10 seconds'), () => unawaited(_seekBy(10, v))),
        const SizedBox(width: 16),
        PopupMenuButton<double>(
          key: const Key('pack-video-speed'),
          tooltip: ceTr('Speed'),
          onSelected: (s) => unawaited(p.setSpeed(s)),
          itemBuilder: (_) => [for (final s in const [0.5, 0.75, 1.0, 1.25, 1.5]) PopupMenuItem(value: s, child: Text('${s}x', style: ceText(22, c: CeC.navy)))],
          child: Container(
            height: 72,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(36)),
            child: Text('${v.speed}x', style: ceHeading(24)),
          ),
        ),
        const Spacer(),
        _big(const Key('pack-video-draw'), Icons.draw_outlined, ceTr('Pause & draw'), () => unawaited(_pauseAndDraw()), on: drawing),
        if (strokes.isNotEmpty) _big(const Key('pack-video-clear-ink'), Icons.layers_clear_outlined, ceTr('Clear the drawing'), () => setState(strokes.clear)),
        if (widget.host != null)
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: FilledButton.icon(
              key: const Key('pack-video-put'),
              style: ceBigButton(),
              onPressed: putting ? null : () => unawaited(_putFrame(v)),
              icon: const Icon(Icons.add_photo_alternate_outlined, size: 32),
              label: Text(ceTr('Put frame on board')),
            ),
          ),
      ],
    ),
  );
}

String _clock(Duration d) {
  final m = d.inMinutes, s = (d.inSeconds % 60).toString().padLeft(2, '0');
  return '$m:$s';
}

/// Ink over the paused frame.
class _Ink extends StatelessWidget {
  const _Ink({required this.strokes, required this.onChanged});
  final List<List<Offset>> strokes;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => GestureDetector(
    key: const Key('pack-video-ink'),
    behavior: HitTestBehavior.opaque,
    onPanStart: (d) {
      strokes.add([d.localPosition]);
      onChanged();
    },
    onPanUpdate: (d) {
      strokes.last.add(d.localPosition);
      onChanged();
    },
    child: CustomPaint(painter: _InkPainter(strokes), size: Size.infinite),
  );
}

class _InkPainter extends CustomPainter {
  _InkPainter(this.strokes) : n = strokes.fold(0, (a, s) => a + s.length);
  final List<List<Offset>> strokes;
  final int n;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFFFD43B)
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, 3, paint..style = PaintingStyle.fill);
        paint.style = PaintingStyle.stroke;
        continue;
      }
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final o in s.skip(1)) {
        path.lineTo(o.dx, o.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_InkPainter old) => true;
}
