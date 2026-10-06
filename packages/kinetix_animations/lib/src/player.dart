import 'dart:async';
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
        // The step's caption.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          child: Container(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
            decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: Kx.radiusMd),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text('${_step + 1}/${a.steps.length} · ${step.name.of(l)}', style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700, color: c.onSecondaryContainer)),
              const SizedBox(height: 2),
              Text(
                step.caption.of(l),
                key: const ValueKey('anim-caption'),
                maxLines: narrow ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: (narrow ? context.text.bodyMedium : context.text.bodyLarge)?.copyWith(color: c.onSecondaryContainer),
              ),
            ]),
          ),
        ),
        // The steps, to jump to.
        SizedBox(
          height: 44,
          child: ListView.separated(
            key: const ValueKey('anim-steps'),
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s4, Kx.s12, 0),
            itemCount: a.steps.length,
            separatorBuilder: (_, _) => const SizedBox(width: Kx.s8),
            itemBuilder: (_, i) => ChoiceChip(
              key: ValueKey('anim-step-$i'),
              label: Text('${i + 1}. ${a.steps[i].name.of(l)}'),
              selected: i == _step,
              visualDensity: VisualDensity.compact,
              onSelected: (_) => _seek(a.steps[i].at + 0.0005),
            ),
          ),
        ),
        // The timeline.
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s4, 0, Kx.s8, Kx.s4),
          child: Row(children: [
            AnimatedBuilder(
              animation: _c,
              builder: (_, _) => IconButton(
                key: const ValueKey('anim-play'),
                tooltip: ui3(_c.isAnimating ? 'Pause' : 'Play', l),
                icon: Icon(_c.isAnimating ? Icons.pause_rounded : Icons.play_arrow_rounded),
                onPressed: _toggle,
              ),
            ),
            Expanded(
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, _) => Slider(
                  key: const ValueKey('anim-scrub'),
                  value: _c.value,
                  onChangeStart: (_) => _c.stop(),
                  onChanged: _seek,
                  onChangeEnd: (_) => setState(() {}),
                ),
              ),
            ),
            PopupMenuButton<double>(
              key: const ValueKey('anim-speed'),
              tooltip: ui3('Speed', l),
              initialValue: _speed,
              onSelected: _setSpeed,
              itemBuilder: (_) => [for (final s in const [0.25, 0.5, 1.0, 1.5, 2.0]) PopupMenuItem(value: s, child: Text('${_fmt(s)}×'))],
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s8),
                child: Text('${_fmt(_speed)}×', style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ),
      ]);
    });
  }

  static String _fmt(double s) => s == s.roundToDouble() ? s.toStringAsFixed(0) : '$s';
}
