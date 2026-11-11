import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// The instrument design system: a light paper page, navy ink, one blue accent, and a small
/// set of restrained apparatus colours. Sized for a 1080p smartboard read from the back row.
abstract final class IX {
  static const page = Color(0xFFF3F6FB);
  static const paper = Color(0xFFFFFFFF);
  static const ink = Color(0xFF13165A);
  static const inkSoft = Color(0xFF4A4F7A);
  static const muted = Color(0xFF8A90B0);
  static const rule = Color(0xFFDDE3EE);
  static const grid = Color(0xFFE9EDF5);
  static const accent = Color(0xFF1D4ED8);
  static const accentSoft = Color(0xFFDCE6FD);

  /// Apparatus: positive / negative charge, warm and cool, never neon.
  static const positive = Color(0xFFC2410C);
  static const negative = Color(0xFF1D4ED8);
  static const green = Color(0xFF15803D);
  static const amber = Color(0xFFB45309);
  static const glass = Color(0xFFE8F1F8);
  static const glassEdge = Color(0xFF8FA9C2);
  static const steel = Color(0xFF9AA3B5);

  static const font = 'packages/kinetix_ui/SansFlex';
  static const fallback = ['packages/kinetix_ui/Inter', 'packages/kinetix_ui/NotoSansMath'];
  static const radius = 20.0;

  static TextStyle text(double size, {FontWeight w = FontWeight.w400, Color c = ink, double? height}) =>
      TextStyle(fontFamily: font, fontFamilyFallback: fallback, fontSize: size, fontWeight: w, color: c, height: height, fontFeatures: const [ui.FontFeature.tabularFigures()]);

  static List<BoxShadow> get lift => const [BoxShadow(color: Color(0x1413165A), blurRadius: 24, offset: Offset(0, 8)), BoxShadow(color: Color(0x0A13165A), blurRadius: 2, offset: Offset(0, 1))];
}

/// A number written for the board: [sig] significant figures, × 10ⁿ for very large or small values.
String sci(double v, {int sig = 3}) {
  if (v.isNaN || v.isInfinite) return '—';
  if (v == 0) return '0';
  final e = (math.log(v.abs()) / math.ln10).floor();
  if (e >= -2 && e < 5) return v.toStringAsFixed((sig - 1 - e).clamp(0, 4));
  final m = v / math.pow(10, e);
  const sup = {'-': '\u207B', '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079'};
  return '${m.toStringAsFixed(sig - 1)} \u00D7 10${e.toString().split('').map((c) => sup[c]).join()}';
}

/// What an instrument hands the board when the teacher taps "Put on board".
class BoardSnapshot {
  const BoardSnapshot({required this.instrument, required this.png, required this.state, required this.caption});
  final String instrument;
  final Uint8List png;
  final Map<String, Object?> state;
  final String caption;
}

/// Where "Put on board" goes: the app wraps lessons in this to receive snapshots.
class InstrumentBoardScope extends InheritedWidget {
  const InstrumentBoardScope({super.key, required this.onPutOnBoard, required super.child});
  final void Function(BoardSnapshot) onPutOnBoard;
  static InstrumentBoardScope? of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<InstrumentBoardScope>();
  @override
  bool updateShouldNotify(InstrumentBoardScope old) => old.onPutOnBoard != onPutOnBoard;
}

/// A readout: label, big value, unit.
class Readout {
  const Readout(this.label, this.value, [this.unit = '', this.color = IX.ink]);
  final String label, value, unit;
  final Color color;
}

class Preset {
  const Preset(this.label, this.apply);
  final String label;
  final VoidCallback apply;
}

/// The frame every instrument shares: a title bar with the topic and the board button, the
/// apparatus stage on a white sheet, and a right rail of readout cards, controls and presets.
class InstrumentFrame extends StatefulWidget {
  const InstrumentFrame({super.key, required this.id, required this.title, required this.subtitle, required this.stage, required this.readouts, this.controls = const [], this.presets = const [], this.activePreset, this.state = const {}, this.formula});
  final String id, title, subtitle;
  final Widget stage;
  final List<Readout> readouts;
  final List<Widget> controls;
  final List<Preset> presets;
  final int? activePreset;
  final Map<String, Object?> state;
  final String? formula;
  @override
  State<InstrumentFrame> createState() => _InstrumentFrameState();
}

class _InstrumentFrameState extends State<InstrumentFrame> {
  final _stageKey = GlobalKey();
  bool _placed = false;

  Future<void> _put() async {
    final scope = InstrumentBoardScope.of(context);
    final ro = _stageKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (ro == null) return;
    final img = await ro.toImage(pixelRatio: 1.5);
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null || !mounted) return;
    scope?.onPutOnBoard(BoardSnapshot(instrument: widget.id, png: bytes.buffer.asUint8List(), state: widget.state, caption: widget.title));
    setState(() => _placed = true);
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: IX.page,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(40, 28, 40, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.subtitle.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: IX.text(17, w: FontWeight.w600, c: IX.accent).copyWith(letterSpacing: 1.6)),
                      const SizedBox(height: 4),
                      Text(widget.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: IX.text(40, w: FontWeight.w600)),
                    ],
                  ),
                ),
                if (widget.formula != null)
                  // A long formula shares the bar with the title instead of pushing it out.
                  Flexible(
                    flex: 2,
                    child: Container(
                      margin: const EdgeInsets.only(right: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                      decoration: BoxDecoration(color: IX.paper, borderRadius: BorderRadius.circular(14), border: Border.all(color: IX.rule)),
                      child: Text(widget.formula!, maxLines: 2, overflow: TextOverflow.ellipsis, style: IX.text(24, w: FontWeight.w500, c: IX.inkSoft)),
                    ),
                  ),
                _BoardButton(placed: _placed, onTap: _put),
              ],
            ),
            const SizedBox(height: 22),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(color: IX.paper, borderRadius: BorderRadius.circular(IX.radius), boxShadow: IX.lift),
                      clipBehavior: Clip.antiAlias,
                      child: RepaintBoundary(key: _stageKey, child: ColoredBox(color: IX.paper, child: widget.stage)),
                    ),
                  ),
                  const SizedBox(width: 28),
                  SizedBox(
                    width: 440,
                    child: ListView(
                      padding: EdgeInsets.zero,
                      children: [
                        _ReadoutGrid(widget.readouts),
                        if (widget.controls.isNotEmpty) ...[const SizedBox(height: 20), _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: widget.controls))],
                        if (widget.presets.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Text('PRESETS', style: IX.text(15, w: FontWeight.w600, c: IX.muted).copyWith(letterSpacing: 1.4)),
                          const SizedBox(height: 10),
                          Wrap(spacing: 10, runSpacing: 10, children: [for (var i = 0; i < widget.presets.length; i++) _Chip(widget.presets[i].label, selected: i == widget.activePreset, onTap: widget.presets[i].apply)]),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(24, 18, 24, 18),
    decoration: BoxDecoration(color: IX.paper, borderRadius: BorderRadius.circular(IX.radius), border: Border.all(color: IX.rule)),
    child: child,
  );
}

class _ReadoutGrid extends StatelessWidget {
  const _ReadoutGrid(this.items);
  final List<Readout> items;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 14,
    runSpacing: 14,
    children: [
      for (final r in items)
        Container(
          width: r.value.length > 11 ? 440 : 213,
          padding: const EdgeInsets.fromLTRB(20, 14, 16, 16),
          decoration: BoxDecoration(color: IX.paper, borderRadius: BorderRadius.circular(16), border: Border.all(color: IX.rule)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [Container(width: 8, height: 8, decoration: BoxDecoration(color: r.color, shape: BoxShape.circle)), const SizedBox(width: 8), Flexible(child: Text(r.label, style: IX.text(16, w: FontWeight.w500, c: IX.inkSoft), overflow: TextOverflow.ellipsis))]),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text.rich(TextSpan(children: [TextSpan(text: r.value, style: IX.text(30, w: FontWeight.w600)), if (r.unit.isNotEmpty) TextSpan(text: ' ${r.unit}', style: IX.text(18, c: IX.inkSoft))]), maxLines: 1),
              ),
            ],
          ),
        ),
    ],
  );
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, {required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: selected ? IX.accent : IX.paper,
    shape: StadiumBorder(side: BorderSide(color: selected ? IX.accent : IX.rule, width: 1.5)),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13), child: Text(label, style: IX.text(18, w: FontWeight.w500, c: selected ? Colors.white : IX.ink))),
    ),
  );
}

class _BoardButton extends StatelessWidget {
  const _BoardButton({required this.placed, required this.onTap});
  final bool placed;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: placed ? IX.accentSoft : IX.accent,
    borderRadius: BorderRadius.circular(16),
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 16),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(placed ? Icons.check_rounded : Icons.push_pin_outlined, color: placed ? IX.accent : Colors.white, size: 26),
          const SizedBox(width: 10),
          Text(placed ? 'On the board' : 'Put on board', style: IX.text(20, w: FontWeight.w600, c: placed ? IX.accent : Colors.white)),
        ]),
      ),
    ),
  );
}

/// A labelled slider sized for fingers on a board: 56 px track area, value and unit on the right.
class IxSlider extends StatelessWidget {
  const IxSlider({super.key, required this.label, required this.value, required this.min, required this.max, required this.onChanged, this.unit = '', this.format, this.divisions});
  final String label, unit;
  final double value, min, max;
  final ValueChanged<double> onChanged;
  final String Function(double)? format;
  final int? divisions;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Expanded(child: Text(label, style: IX.text(18, w: FontWeight.w500, c: IX.inkSoft))),
          Text('${format?.call(value) ?? value.toStringAsFixed(1)}${unit.isEmpty ? '' : ' $unit'}', style: IX.text(20, w: FontWeight.w600)),
        ]),
        SliderTheme(
          data: SliderThemeData(
            trackHeight: 6,
            activeTrackColor: IX.accent,
            inactiveTrackColor: IX.grid,
            thumbColor: IX.paper,
            overlayColor: IX.accent.withValues(alpha: 0.10),
            thumbShape: const _Thumb(),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 28),
            showValueIndicator: ShowValueIndicator.never,
          ),
          child: SizedBox(height: 48, child: Slider(value: value.clamp(min, max), min: min, max: max, divisions: divisions, onChanged: onChanged)),
        ),
      ],
    ),
  );
}

class _Thumb extends SliderComponentShape {
  const _Thumb();
  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) => const Size(30, 30);
  @override
  void paint(PaintingContext context, Offset center, {required Animation<double> activationAnimation, required Animation<double> enableAnimation, required bool isDiscrete, required TextPainter labelPainter, required RenderBox parentBox, required SliderThemeData sliderTheme, required TextDirection textDirection, required double value, required double textScaleFactor, required Size sizeWithOverflow}) {
    final c = context.canvas;
    c.drawCircle(center + const Offset(0, 2), 15, Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
    c.drawCircle(center, 15, Paint()..color = IX.paper);
    c.drawCircle(center, 15, Paint()..color = IX.accent..style = PaintingStyle.stroke..strokeWidth = 3);
  }
}

/// A segmented choice (lens / mirror, indicator, function family).
class IxSegments<T> extends StatelessWidget {
  const IxSegments({super.key, required this.label, required this.options, required this.value, required this.onChanged});
  final String label;
  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4, bottom: 10),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(label, style: IX.text(18, w: FontWeight.w500, c: IX.inkSoft)),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: IX.page, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          for (final e in options.entries)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(e.key),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  height: 50,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: e.key == value ? IX.paper : Colors.transparent, borderRadius: BorderRadius.circular(11), boxShadow: e.key == value ? IX.lift : null),
                  child: Text(e.value, style: IX.text(17, w: FontWeight.w600, c: e.key == value ? IX.accent : IX.inkSoft), textAlign: TextAlign.center),
                ),
              ),
            ),
        ]),
      ),
    ]),
  );
}

/// Painting helpers shared by the apparatus.
abstract final class IxPaint {
  static void label(Canvas c, String s, Offset at, {double size = 18, Color color = IX.inkSoft, FontWeight w = FontWeight.w500, Alignment align = Alignment.center, bool halo = false}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: w, c: color)), textDirection: TextDirection.ltr)..layout();
    final o = at - Offset((align.x + 1) / 2 * tp.width, (align.y + 1) / 2 * tp.height);
    if (halo) {
      c.drawRRect(RRect.fromRectAndRadius((o & tp.size).inflate(5), const Radius.circular(6)), Paint()..color = const Color(0xE6FFFFFF));
    }
    tp.paint(c, o);
  }

  static void arrow(Canvas c, Offset a, Offset b, Color color, {double width = 3, double head = 14}) {
    final d = b - a;
    if (d.distance < 1) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final p = Paint()..color = color..strokeWidth = width..strokeCap = StrokeCap.round;
    c.drawLine(a, b - u * head * 0.6, p);
    final path = Path()..moveTo(b.dx, b.dy)..lineTo((b - u * head + n * head * 0.45).dx, (b - u * head + n * head * 0.45).dy)..lineTo((b - u * head - n * head * 0.45).dx, (b - u * head - n * head * 0.45).dy)..close();
    c.drawPath(path, Paint()..color = color);
  }

  static void dashed(Canvas c, Offset a, Offset b, Paint p, {double dash = 10, double gap = 8}) {
    final d = b - a, len = d.distance;
    if (len < 1) return;
    final u = d / len;
    for (var s = 0.0; s < len; s += dash + gap) {
      c.drawLine(a + u * s, a + u * (s + dash).clamp(0, len), p);
    }
  }

  static void grid(Canvas c, Size s, {double step = 40}) {
    final p = Paint()..color = IX.grid..strokeWidth = 1;
    for (var x = step; x < s.width; x += step) {
      c.drawLine(Offset(x, 0), Offset(x, s.height), p);
    }
    for (var y = step; y < s.height; y += step) {
      c.drawLine(Offset(0, y), Offset(s.width, y), p);
    }
  }

  /// A round touch handle: soft shadow, white ring, coloured core.
  static void handle(Canvas c, Offset at, Color color, {double r = 30, bool active = false}) {
    if (active) c.drawCircle(at, r + 14, Paint()..color = color.withValues(alpha: 0.12));
    c.drawCircle(at + const Offset(0, 3), r, Paint()..color = const Color(0x3313165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5));
    final shader = ui.Gradient.radial(at - Offset(r * 0.35, r * 0.4), r * 1.4, [Color.lerp(color, Colors.white, 0.35)!, color, Color.lerp(color, Colors.black, 0.25)!], [0, 0.55, 1]);
    c.drawCircle(at, r, Paint()..shader = shader);
    c.drawCircle(at, r, Paint()..color = Colors.white.withValues(alpha: 0.9)..style = PaintingStyle.stroke..strokeWidth = 2.5);
  }
}
