import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'model.dart';
import 'strings.dart';

/// Renders [anim] at [frame] to a PNG ([size] in pixels), for "Add to board".
Future<Uint8List> renderAnimationPng(KxAnimation anim, AnimFrame frame, {Size size = const Size(1600, 960)}) async {
  final rec = ui.PictureRecorder();
  anim.painter(frame).paint(Canvas(rec), size);
  final img = await rec.endRecording().toImage(size.width.round(), size.height.round());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  img.dispose();
  return data!.buffer.asUint8List();
}

/// Plays one animation in the whole panel: the drawing, the step's caption, the steps, and a
/// play/pause, scrub and speed timeline; labels on/off, read aloud, and "Add to board".
class AnimationPlayer extends StatefulWidget {
  const AnimationPlayer({super.key, required this.animation, this.lang, this.onBack, this.onAddToBoard, this.autoplay = true});

  final KxAnimation animation;
  final AnimLang? lang;
  final VoidCallback? onBack;
  final void Function(Uint8List png, String title)? onAddToBoard;
  final bool autoplay;

  @override
  State<AnimationPlayer> createState() => _AnimationPlayerState();
}

class _AnimationPlayerState extends State<AnimationPlayer> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  double _speed = 1;
  bool _labels = true;
  bool _narrate = false;
  bool _adding = false;
  AnimLang? _lang;
  int _step = 0;
  FlutterTts? _tts;

  KxAnimation get a => widget.animation;
  AnimLang get lang => _lang ?? widget.lang ?? AnimLang.of(context);

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: _duration)..addListener(_tick);
    if (widget.autoplay) _c.repeat();
  }

  Duration get _duration => Duration(milliseconds: (a.seconds * 1000 / _speed).round());

  void _tick() {
    final s = a.stepAt(_c.value);
    if (s != _step) {
      setState(() => _step = s);
      if (_narrate) _speak();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    final tts = _tts;
    if (tts != null) unawaited(tts.stop().catchError((_) => null));
    super.dispose();
  }

  void _toggle() => setState(() => _c.isAnimating ? _c.stop() : _c.repeat());

  void _seek(double v) {
    _c.value = v.clamp(0.0, 0.9999);
    _tick();
  }

  void _setSpeed(double s) {
    setState(() => _speed = s);
    final playing = _c.isAnimating;
    _c.duration = _duration;
    if (playing) _c.repeat();
  }

  Future<void> _speak() async {
    try {
      final tts = _tts ??= FlutterTts();
      await tts.stop();
      await tts.setLanguage(lang.ttsCode);
      await tts.setSpeechRate(0.45);
      await tts.speak('${a.steps[_step].name.of(lang)}. ${a.steps[_step].caption.of(lang)}');
    } catch (e) {
      debugPrint('Animations read aloud: $e');
    }
  }

  void _toggleNarrate() {
    setState(() => _narrate = !_narrate);
    if (_narrate) {
      _speak();
    } else {
      unawaited(_tts?.stop().catchError((_) => null));
    }
  }

  Future<void> _add() async {
    final cb = widget.onAddToBoard;
    if (cb == null || _adding) return;
    setState(() => _adding = true);
    try {
      final png = await renderAnimationPng(a, AnimFrame(_c.value, labels: _labels, lang: lang));
      cb(png, '${a.title.of(lang)} — ${a.steps[_step].name.of(lang)}');
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = lang;
    final c = context.colors;
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final step = a.steps[_step];
    return LayoutBuilder(builder: (context, box) {
      final compact = box.maxWidth < 560;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Header: back, title, language, labels, read aloud, add to board.
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s4, Kx.s8, 0),
          child: Row(children: [
            if (widget.onBack != null) IconButton(key: const ValueKey('anim-back'), tooltip: ui3('Back', l), icon: const Icon(Icons.arrow_back), onPressed: widget.onBack),
            if (widget.onBack == null) const SizedBox(width: Kx.s12),
            Expanded(
              child: Text(a.title.of(l), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
            ),
            PopupMenuButton<AnimLang>(
              tooltip: ui3('Language', l),
              icon: const Icon(Icons.translate),
              initialValue: l,
              onSelected: (v) {
                setState(() => _lang = v);
                if (_narrate) _speak();
              },
              itemBuilder: (_) => [for (final v in AnimLang.values) PopupMenuItem(value: v, child: Text(v.nativeName))],
            ),
            IconButton(
              key: const ValueKey('anim-labels'),
              tooltip: ui3(_labels ? 'Hide labels' : 'Show labels', l),
              isSelected: _labels,
              icon: const Icon(Icons.label_off_outlined),
              selectedIcon: const Icon(Icons.label_outline),
              onPressed: () => setState(() => _labels = !_labels),
            ),
            IconButton(
              key: const ValueKey('anim-read'),
              tooltip: ui3('Read aloud', l),
              isSelected: _narrate,
              icon: const Icon(Icons.volume_off_outlined),
              selectedIcon: const Icon(Icons.volume_up),
              onPressed: _toggleNarrate,
            ),
            if (widget.onAddToBoard != null)
              compact
                  ? IconButton.filledTonal(key: const ValueKey('anim-add'), tooltip: ui3('Add to board', l), icon: const Icon(Icons.add_photo_alternate_outlined), onPressed: _adding ? null : _add)
                  : FilledButton.tonalIcon(
                      key: const ValueKey('anim-add'),
                      onPressed: _adding ? null : _add,
                      icon: const Icon(Icons.add_photo_alternate_outlined),
                      label: Text(ui3('Add to board', l)),
                    ),
          ]),
        ),
        // The drawing.
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s4, Kx.s12, Kx.s8),
            child: GestureDetector(
              onTap: _toggle,
              child: DecoratedBox(
                decoration: BoxDecoration(color: KxColor.paper, borderRadius: Kx.radiusLg, border: Border.all(color: KxColor.line)),
                child: ClipRRect(
                  borderRadius: Kx.radiusLg,
                  child: AnimatedBuilder(
                    animation: _c,
                    builder: (_, _) => CustomPaint(
                      key: const ValueKey('anim-canvas'),
                      painter: a.painter(AnimFrame(_c.value, labels: _labels, lang: l)),
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        // The step's caption, in a band of its own.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          child: _CaptionBand(index: _step, count: a.steps.length, name: step.name.of(l), caption: step.caption.of(l), narrow: narrow, large: box.maxWidth >= 1200),
        ),
        // The timeline: play, the steps as segments with their names, time and speed.
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s4, Kx.s12, Kx.s8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            AnimatedBuilder(
              animation: _c,
              builder: (_, _) => IconButton.filledTonal(
                key: const ValueKey('anim-play'),
                tooltip: ui3(_c.isAnimating ? 'Pause' : 'Play', l),
                icon: Icon(_c.isAnimating ? Icons.pause_rounded : Icons.play_arrow_rounded),
                onPressed: _toggle,
              ),
            ),
            const SizedBox(width: Kx.s8),
            Expanded(
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, _) => _Timeline(
                  key: const ValueKey('anim-steps'),
                  value: _c.value,
                  steps: [for (final s in a.steps) (s.at, s.name.of(l))],
                  current: _step,
                  showNames: !compact,
                  onSeekStart: () => _c.stop(),
                  onSeek: _seek,
                  onSeekEnd: () => setState(() {}),
                  onStep: (i) => _seek(a.steps[i].at + 0.0005),
                ),
              ),
            ),
            if (!compact) ...[
              const SizedBox(width: Kx.s12),
              AnimatedBuilder(
                animation: _c,
                builder: (_, _) => Text(
                  '${_clock(_c.value * a.seconds)} / ${_clock(a.seconds.toDouble())}',
                  style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ],
            const SizedBox(width: Kx.s4),
            PopupMenuButton<double>(
              key: const ValueKey('anim-speed'),
              tooltip: ui3('Speed', l),
              initialValue: _speed,
              onSelected: _setSpeed,
              itemBuilder: (_) => [for (final s in const [0.25, 0.5, 1.0, 1.5, 2.0]) PopupMenuItem(value: s, child: Text('${_fmt(s)}×'))],
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
                decoration: BoxDecoration(borderRadius: Kx.radiusSm, border: Border.all(color: c.outlineVariant)),
                child: Text('${_fmt(_speed)}×', style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      ]);
    });
  }

  static String _fmt(double s) => s == s.roundToDouble() ? s.toStringAsFixed(0) : '$s';

  static String _clock(double seconds) {
    final s = seconds.floor();
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }
}

/// The step's caption: its number, its name, and the explanation, in a quiet band with an
/// accent rule, set at a comfortable reading size.
class _CaptionBand extends StatelessWidget {
  const _CaptionBand({required this.index, required this.count, required this.name, required this.caption, required this.narrow, this.large = false});

  final int index, count;
  final String name, caption;
  final bool narrow, large;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: Kx.radiusMd,
        border: Border.all(color: KxColor.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(width: 4, color: c.primary),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${index + 1} / $count', style: TextStyle(color: c.primary, fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()])),
                    const TextSpan(text: '   '),
                    TextSpan(text: name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: (large ? context.text.titleMedium : context.text.titleSmall)?.copyWith(color: c.onSurface),
                ),
                const SizedBox(height: Kx.s4),
                Text(
                  caption,
                  key: const ValueKey('anim-caption'),
                  maxLines: narrow ? 4 : 3,
                  overflow: TextOverflow.ellipsis,
                  style: (narrow ? context.text.bodyMedium : context.text.bodyLarge)?.copyWith(color: c.onSurfaceVariant, height: 1.4, fontSize: large ? 19 : null),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// The timeline: one segment per step (its name under it when there is room), the part played
/// filled in, a thumb at the playhead. Drag or tap anywhere to scrub; tap a step's marker to jump
/// to its start.
class _Timeline extends StatelessWidget {
  const _Timeline({super.key, required this.value, required this.steps, required this.current, required this.showNames, required this.onSeek, required this.onSeekStart, required this.onSeekEnd, required this.onStep});

  final double value;
  final List<(double, String)> steps;
  final int current;
  final bool showNames;
  final ValueChanged<double> onSeek;
  final VoidCallback onSeekStart, onSeekEnd;
  final ValueChanged<int> onStep;

  static const double _trackY = 14, _pad = 8;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth - _pad * 2;
      double xOf(double v) => _pad + v.clamp(0.0, 1.0) * w;
      double vOf(double x) => ((x - _pad) / w).clamp(0.0, 0.9999);
      final height = showNames ? 48.0 : 30.0;
      return GestureDetector(
        key: const ValueKey('anim-scrub'),
        behavior: HitTestBehavior.opaque,
        onTapDown: (d) {
          onSeekStart();
          onSeek(vOf(d.localPosition.dx));
          onSeekEnd();
        },
        onHorizontalDragStart: (d) {
          onSeekStart();
          onSeek(vOf(d.localPosition.dx));
        },
        onHorizontalDragUpdate: (d) => onSeek(vOf(d.localPosition.dx)),
        onHorizontalDragEnd: (_) => onSeekEnd(),
        child: SizedBox(
          height: height,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(
              child: CustomPaint(painter: _TrackPainter(value: value, starts: [for (final s in steps) s.$1], current: current, pad: _pad, y: _trackY, track: KxColor.line, fill: c.primary, done: c.primary.withValues(alpha: 0.35), thumb: c.primary, ring: c.surface)),
            ),
            for (var i = 0; i < steps.length; i++)
              Positioned(
                left: xOf(steps[i].$1) - 12,
                top: _trackY - 12,
                width: 24,
                height: 24,
                child: Semantics(
                  button: true,
                  label: '${i + 1}. ${steps[i].$2}',
                  child: GestureDetector(key: ValueKey('anim-step-$i'), behavior: HitTestBehavior.opaque, onTap: () => onStep(i)),
                ),
              ),
            if (showNames)
              for (var i = 0; i < steps.length; i++)
                Positioned(
                  left: xOf(steps[i].$1) + 2,
                  top: _trackY + 10,
                  width: math.max(0, xOf(i + 1 < steps.length ? steps[i + 1].$1 : 1) - xOf(steps[i].$1) - 6),
                  child: Text(
                    '${i + 1}  ${steps[i].$2}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelMedium?.copyWith(
                      color: i == current ? c.primary : (i < current ? c.onSurface : c.onSurfaceVariant),
                      fontWeight: i == current ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
          ]),
        ),
      );
    });
  }
}

class _TrackPainter extends CustomPainter {
  _TrackPainter({required this.value, required this.starts, required this.current, required this.pad, required this.y, required this.track, required this.fill, required this.done, required this.thumb, required this.ring});

  final double value, pad, y;
  final List<double> starts;
  final int current;
  final Color track, fill, done, thumb, ring;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width - pad * 2;
    double xOf(double v) => pad + v * w;
    const h = 6.0, gap = 3.0;
    for (var i = 0; i < starts.length; i++) {
      final a = xOf(starts[i]) + (i == 0 ? 0 : gap / 2);
      final b = xOf(i + 1 < starts.length ? starts[i + 1] : 1) - (i + 1 < starts.length ? gap / 2 : 0);
      final seg = RRect.fromLTRBR(a, y - h / 2, b, y + h / 2, const Radius.circular(h / 2));
      canvas.drawRRect(seg, Paint()..color = track);
      final played = xOf(value).clamp(a, b);
      if (played > a) {
        canvas.drawRRect(RRect.fromLTRBR(a, y - h / 2, played, y + h / 2, const Radius.circular(h / 2)), Paint()..color = i == current ? fill : done);
      }
    }
    final x = xOf(value);
    canvas.drawCircle(Offset(x, y), 8, Paint()..color = ring);
    canvas.drawCircle(Offset(x, y), 6.5, Paint()..color = thumb);
  }

  @override
  bool shouldRepaint(_TrackPainter old) => old.value != value || old.current != current || old.fill != fill || old.starts.length != starts.length;
}
