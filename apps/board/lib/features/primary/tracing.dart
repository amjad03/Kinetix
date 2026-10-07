import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'primary_strings.dart';

/// The scripts a child traces in: English capitals, Hindi (Devanagari), Kannada and numbers.
enum TraceScript { english, hindi, kannada, digits }

/// The letters of each script, in the order they are taught.
const traceLetters = <TraceScript, List<String>>{
  TraceScript.english: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
  TraceScript.hindi: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ', 'क', 'ख', 'ग', 'घ', 'च', 'छ', 'ज', 'झ', 'ट', 'ठ', 'ड', 'त', 'थ', 'द', 'ध', 'न', 'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'स', 'ह'],
  TraceScript.kannada: ['ಅ', 'ಆ', 'ಇ', 'ಈ', 'ಉ', 'ಊ', 'ಎ', 'ಏ', 'ಐ', 'ಒ', 'ಓ', 'ಔ', 'ಕ', 'ಖ', 'ಗ', 'ಘ', 'ಚ', 'ಛ', 'ಜ', 'ಟ', 'ಡ', 'ತ', 'ದ', 'ನ', 'ಪ', 'ಬ', 'ಮ', 'ಯ', 'ರ', 'ಲ', 'ವ', 'ಸ', 'ಹ'],
  TraceScript.digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
};

// --- Stroke order -------------------------------------------------------------------------------

/// Points on an ellipse around (cx, cy), from [a0] to [a1] degrees (0 is right, 90 is down).
List<Offset> _arc(double cx, double cy, double rx, double ry, double a0, double a1) {
  final n = math.max(6, ((a1 - a0).abs() / 12).round());
  return [
    for (var i = 0; i <= n; i++)
      Offset(cx + rx * math.cos((a0 + (a1 - a0) * i / n) * math.pi / 180), cy + ry * math.sin((a0 + (a1 - a0) * i / n) * math.pi / 180)),
  ];
}

List<Offset> _l(List<double> xy) => [for (var i = 0; i + 1 < xy.length; i += 2) Offset(xy[i], xy[i + 1])];

/// How capitals and numbers are written, stroke by stroke, in a box from the top line (y 0) to
/// the base line (y 1); the board shows each stroke's start, number and direction, and "Watch"
/// draws them in order.
final Map<String, List<List<Offset>>> strokeOrder = {
  'A': [_l([0.5, 0, 0.1, 1]), _l([0.5, 0, 0.9, 1]), _l([0.27, 0.62, 0.73, 0.62])],
  'B': [
    _l([0.18, 0, 0.18, 1]),
    [const Offset(0.18, 0), ..._arc(0.55, 0.25, 0.27, 0.25, -90, 90), const Offset(0.18, 0.5)],
    [const Offset(0.18, 0.5), ..._arc(0.58, 0.75, 0.3, 0.25, -90, 90), const Offset(0.18, 1)],
  ],
  'C': [_arc(0.55, 0.5, 0.42, 0.5, -45, -315)],
  'D': [
    _l([0.18, 0, 0.18, 1]),
    [const Offset(0.18, 0), ..._arc(0.4, 0.5, 0.45, 0.5, -90, 90), const Offset(0.18, 1)],
  ],
  'E': [_l([0.2, 0, 0.2, 1]), _l([0.2, 0, 0.82, 0]), _l([0.2, 0.5, 0.7, 0.5]), _l([0.2, 1, 0.82, 1])],
  'F': [_l([0.2, 0, 0.2, 1]), _l([0.2, 0, 0.82, 0]), _l([0.2, 0.5, 0.7, 0.5])],
  'G': [
    _arc(0.55, 0.5, 0.42, 0.5, -45, -360),
    _l([0.62, 0.55, 0.97, 0.55]),
  ],
  'H': [_l([0.18, 0, 0.18, 1]), _l([0.82, 0, 0.82, 1]), _l([0.18, 0.5, 0.82, 0.5])],
  'I': [_l([0.5, 0, 0.5, 1]), _l([0.28, 0, 0.72, 0]), _l([0.28, 1, 0.72, 1])],
  'J': [
    [const Offset(0.72, 0), const Offset(0.72, 0.7), ..._arc(0.47, 0.7, 0.25, 0.3, 0, 180)],
  ],
  'K': [_l([0.2, 0, 0.2, 1]), _l([0.82, 0, 0.2, 0.58]), _l([0.4, 0.42, 0.85, 1])],
  'L': [_l([0.22, 0, 0.22, 1]), _l([0.22, 1, 0.8, 1])],
  'M': [_l([0.1, 0, 0.1, 1]), _l([0.1, 0, 0.5, 0.65, 0.9, 0, 0.9, 1])],
  'N': [_l([0.16, 0, 0.16, 1]), _l([0.16, 0, 0.84, 1, 0.84, 0])],
  'O': [_arc(0.5, 0.5, 0.42, 0.5, -90, -450)],
  'P': [
    _l([0.2, 0, 0.2, 1]),
    [const Offset(0.2, 0), ..._arc(0.55, 0.27, 0.27, 0.27, -90, 90), const Offset(0.2, 0.54)],
  ],
  'Q': [_arc(0.5, 0.5, 0.42, 0.5, -90, -450), _l([0.6, 0.72, 0.92, 1.02])],
  'R': [
    _l([0.2, 0, 0.2, 1]),
    [const Offset(0.2, 0), ..._arc(0.55, 0.26, 0.27, 0.26, -90, 90), const Offset(0.2, 0.52)],
    _l([0.48, 0.52, 0.85, 1]),
  ],
  'S': [
    [..._arc(0.5, 0.25, 0.34, 0.25, -30, -270), ..._arc(0.5, 0.75, 0.36, 0.25, -90, 150)],
  ],
  'T': [_l([0.5, 0, 0.5, 1]), _l([0.12, 0, 0.88, 0])],
  'U': [
    [const Offset(0.16, 0), const Offset(0.16, 0.62), ..._arc(0.5, 0.62, 0.34, 0.38, 180, 0), const Offset(0.84, 0)],
  ],
  'V': [_l([0.1, 0, 0.5, 1, 0.9, 0])],
  'W': [_l([0.04, 0, 0.27, 1, 0.5, 0.3, 0.73, 1, 0.96, 0])],
  'X': [_l([0.15, 0, 0.85, 1]), _l([0.85, 0, 0.15, 1])],
  'Y': [_l([0.14, 0, 0.5, 0.5]), _l([0.86, 0, 0.5, 0.5, 0.5, 1])],
  'Z': [_l([0.15, 0, 0.85, 0, 0.15, 1, 0.85, 1])],
  '0': [_arc(0.5, 0.5, 0.36, 0.5, -90, -450)],
  '1': [_l([0.3, 0.22, 0.56, 0, 0.56, 1])],
  '2': [
    [..._arc(0.5, 0.3, 0.32, 0.3, -160, 25), const Offset(0.16, 1), const Offset(0.86, 1)],
  ],
  '3': [
    [..._arc(0.5, 0.26, 0.3, 0.26, -160, 90), ..._arc(0.5, 0.76, 0.34, 0.24, -90, 160)],
  ],
  '4': [_l([0.58, 0, 0.1, 0.7, 0.9, 0.7]), _l([0.64, 0.25, 0.64, 1])],
  '5': [
    [const Offset(0.26, 0), const Offset(0.22, 0.45), ..._arc(0.5, 0.71, 0.34, 0.29, -140, 150)],
    _l([0.26, 0, 0.82, 0]),
  ],
  '6': [
    [..._arc(0.58, 0.55, 0.42, 0.55, -65, -180), ..._arc(0.5, 0.72, 0.34, 0.28, 180, -180)],
  ],
  '7': [_l([0.14, 0, 0.86, 0, 0.4, 1])],
  '8': [
    [..._arc(0.5, 0.25, 0.28, 0.25, -30, -270), ..._arc(0.5, 0.75, 0.34, 0.25, -90, 270), ..._arc(0.5, 0.25, 0.28, 0.25, 90, 330)],
  ],
  '9': [
    [..._arc(0.5, 0.3, 0.32, 0.3, 0, -360), const Offset(0.8, 1)],
  ],
};

/// The stroke-order hint for a script.
String traceHint(TraceScript s, Map<String, String> words) => switch (s) {
  TraceScript.english || TraceScript.digits => words['hintLatin']!,
  TraceScript.hindi => words['hintHindi']!,
  TraceScript.kannada => words['hintKannada']!,
};

// --- The pad --------------------------------------------------------------------------------

/// A tracing sheet for one letter: four-line paper (English, numbers) or guide lines with the
/// headline (Hindi) or the head and base lines (Kannada); the letter faint or dotted to trace
/// over with a finger; each stroke's start, number and direction; and "Watch" to see it written.
class TracingPad extends StatefulWidget {
  const TracingPad({super.key, required this.letter, required this.script, this.watch});

  final String letter;
  final TraceScript script;

  /// Plays the stroke order (0 to 1) while it runs.
  final Animation<double>? watch;

  @override
  State<TracingPad> createState() => TracingPadState();
}

class TracingPadState extends State<TracingPad> {
  final _strokes = <List<Offset>>[];

  /// Rubs out what the child traced.
  void clear() => setState(_strokes.clear);

  int get strokeCount => _strokes.length;

  @override
  void didUpdateWidget(TracingPad oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.letter != widget.letter) _strokes.clear();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: Kx.radiusLg,
      child: GestureDetector(
        key: const Key('trace-pad'),
        behavior: HitTestBehavior.opaque,
        onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
        onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
        child: AnimatedBuilder(
          animation: widget.watch ?? const AlwaysStoppedAnimation(0.0),
          builder: (context, _) => CustomPaint(
            size: Size.infinite,
            painter: TracingPainter(
              letter: widget.letter,
              script: widget.script,
              traced: _strokes,
              watch: widget.watch?.value ?? 0,
              paper: c.surfaceContainerLowest,
              ink: c.primary,
            ),
          ),
        ),
      ),
    );
  }
}

/// The band the letter sits in, for a pad of [size]: top line to base line.
Rect traceBand(Size size) {
  final h = size.height * 0.62;
  final w = math.min(size.width * 0.8, h * 0.9);
  final top = size.height * 0.14;
  return Rect.fromLTWH((size.width - w) / 2, top, w, h);
}

class TracingPainter extends CustomPainter {
  TracingPainter({required this.letter, required this.script, required this.traced, required this.watch, required this.paper, required this.ink});

  final String letter;
  final TraceScript script;
  final List<List<Offset>> traced;
  final double watch;
  final Color paper, ink;

  static const _blue = Color(0xFF7BAAF7), _red = Color(0xFFE57373), _guide = Color(0xFFB0BEC5), _start = Color(0xFF2E7D32);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = paper);
    final band = traceBand(size);
    final line = Paint()..strokeWidth = 2;
    void hline(double y, Color color, {double w = 2}) => canvas.drawLine(Offset(0, y), Offset(size.width, y), line
      ..color = color
      ..strokeWidth = w);
    final strokes = strokeOrder[letter];
    switch (script) {
      case TraceScript.english || TraceScript.digits:
        // Four-line paper as in Indian copy books: capitals from line 1 to line 3 (red).
        final gap = band.height / 2;
        hline(band.top, _blue);
        hline(band.top + gap, _blue);
        hline(band.bottom, _red, w: 3);
        hline(band.bottom + gap * 0.6, _blue);
      case TraceScript.hindi:
        // The headline (shirorekha) the letters hang from, a middle guide and the base line.
        hline(band.top, _red, w: 3);
        hline(band.center.dy, _guide);
        hline(band.bottom, _blue);
      case TraceScript.kannada:
        hline(band.top, _blue);
        hline(band.top + band.height * 0.3, _guide);
        hline(band.bottom, _red, w: 3);
    }
    if (strokes != null) {
      _paintStrokes(canvas, band, strokes);
    } else {
      _paintGlyph(canvas, band);
    }
    final pen = Paint()
      ..color = ink
      ..strokeWidth = math.max(8, band.height / 22)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in traced) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, pen.strokeWidth / 2, Paint()..color = ink);
        continue;
      }
      canvas.drawPath(Path()..addPolygon(s, false), pen);
    }
  }

  void _paintStrokes(Canvas canvas, Rect band, List<List<Offset>> strokes) {
    Offset at(Offset p) => Offset(band.left + p.dx * band.width, band.top + p.dy * band.height);
    final dot = Paint()..color = const Color(0xFF90A4AE);
    final r = math.max(3.0, band.height / 70);
    // Dotted strokes to trace over.
    for (final s in strokes) {
      final pts = [for (final p in s) at(p)];
      for (var i = 1; i < pts.length; i++) {
        final a = pts[i - 1], b = pts[i];
        final n = math.max(1, ((b - a).distance / (r * 4)).floor());
        for (var k = 0; k < n; k++) {
          canvas.drawCircle(Offset.lerp(a, b, k / n)!, r, dot);
        }
      }
      canvas.drawCircle(pts.last, r, dot);
    }
    // Each stroke's start (green, numbered) and an arrow along its first part.
    for (final (i, s) in strokes.indexed) {
      final pts = [for (final p in s) at(p)];
      final start = pts.first;
      canvas.drawCircle(start, r * 3.4, Paint()..color = _start);
      final tp = TextPainter(
        text: TextSpan(text: '${i + 1}', style: TextStyle(color: Colors.white, fontSize: r * 4, fontWeight: FontWeight.w700)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, start - Offset(tp.width / 2, tp.height / 2));
      final next = pts.firstWhere((p) => (p - start).distance > band.height / 6, orElse: () => pts.last);
      final dir = next - start;
      if (dir.distance < 1) continue;
      final u = dir / dir.distance;
      final tip = start + u * (band.height / 6 + r * 3);
      final arrow = Paint()
        ..color = _start
        ..strokeWidth = r
        ..strokeCap = StrokeCap.round;
      final from = start + u * (r * 4);
      canvas.drawLine(from, tip, arrow);
      final side = Offset(-u.dy, u.dx);
      canvas.drawLine(tip, tip - u * r * 3 + side * r * 2, arrow);
      canvas.drawLine(tip, tip - u * r * 3 - side * r * 2, arrow);
    }
    // "Watch": the strokes written in order.
    if (watch > 0) {
      final total = strokes.length;
      final pen = Paint()
        ..color = const Color(0xFFFF7043)
        ..strokeWidth = r * 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;
      for (final (i, s) in strokes.indexed) {
        final f = ((watch * total) - i).clamp(0.0, 1.0);
        if (f <= 0) break;
        final pts = [for (final p in s) at(p)];
        final upto = math.max(2, (pts.length * f).ceil());
        canvas.drawPath(Path()..addPolygon(pts.take(upto).toList(), false), pen);
      }
    }
  }

  void _paintGlyph(Canvas canvas, Rect band) {
    // Letters with no stroke data: the letter faint, outlined, filling the band.
    final fontSize = band.height * (script == TraceScript.hindi ? 0.95 : 1.05);
    TextPainter painter(Paint? fg, Color? color) => TextPainter(
      text: TextSpan(
        text: letter,
        style: TextStyle(fontSize: fontSize, height: 1, foreground: fg, color: color, fontFamilyFallback: KxFonts.fallback),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final fill = painter(null, const Color(0x2290A4AE));
    final at = Offset(band.center.dx - fill.width / 2, band.top - (script == TraceScript.hindi ? fontSize * 0.12 : fontSize * 0.08));
    fill.paint(canvas, at);
    painter(
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(2, band.height / 90)
        ..color = const Color(0xFF90A4AE),
      null,
    ).paint(canvas, at);
  }

  @override
  bool shouldRepaint(TracingPainter old) => true;
}

/// Letter tracing in the panel: the script, the letter, the pad, Watch, Clear and "Put on the
/// board" (the letter, big and faint on four-line paper, for the pen).
class TracingActivity extends StatefulWidget {
  const TracingActivity({super.key, this.wb, this.initialScript = TraceScript.english});

  final WhiteboardController? wb;
  final TraceScript initialScript;

  @override
  State<TracingActivity> createState() => _TracingActivityState();
}

class _TracingActivityState extends State<TracingActivity> with SingleTickerProviderStateMixin {
  late TraceScript _script = widget.initialScript;
  int _i = 0;
  final _pad = GlobalKey<TracingPadState>();
  late final _watch = AnimationController(vsync: this, duration: const Duration(seconds: 3));

  @override
  void dispose() {
    _watch.dispose();
    super.dispose();
  }

  List<String> get _letters => traceLetters[_script]!;
  String get _letter => _letters[_i % _letters.length];

  void _go(int d) => setState(() {
    _i = (_i + d) % _letters.length;
    _watch.reset();
  });

  void _toBoard(Map<String, String> words) {
    final wb = widget.wb;
    if (wb == null) return;
    wb.background = BoardBackground.fourLine;
    final size = measureBoardText(_letter, 220, font: BoardFont.andika);
    wb.insert([TextElement(id: newElementId(), position: Offset.zero, text: _letter, color: const Color(0x5590A4AE), fontSize: 220, size: size, font: BoardFont.andika)]);
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(words['onBoard']!)));
  }

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    final words = (primaryStringTable[s.lang] ?? primaryStringTable['en'])!;
    final names = {TraceScript.english: s['english'], TraceScript.hindi: s['hindi'], TraceScript.kannada: s['kannada'], TraceScript.digits: s['digits']};
    return LayoutBuilder(
      builder: (context, box) {
        final narrow = box.maxWidth < 520;
        final controls = Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          alignment: WrapAlignment.center,
          children: [
            BigButton(key: const Key('trace-prev'), icon: Icons.chevron_left, label: s['previous'], onTap: () => _go(-1)),
            BigButton(key: const Key('trace-watch'), icon: Icons.play_arrow, label: s['watch'], onTap: () => _watch.forward(from: 0)),
            BigButton(key: const Key('trace-clear'), icon: Icons.cleaning_services_outlined, label: s['clear'], onTap: () => _pad.currentState?.clear()),
            if (widget.wb != null) BigButton(key: const Key('trace-board'), icon: Icons.open_in_new, label: s['toBoard'], onTap: () => _toBoard(words)),
            BigButton(key: const Key('trace-next'), icon: Icons.chevron_right, label: s['next'], onTap: () => _go(1)),
          ],
        );
        final pad = TracingPad(key: _pad, letter: _letter, script: _script, watch: _watch);
        // A short panel (a phone's sheet) scrolls, with the sheet of paper a fixed height.
        final short = box.maxHeight < 560;
        final column = Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SegmentedButton<TraceScript>(
                key: const Key('trace-script'),
                showSelectedIcon: false,
                segments: [for (final t in TraceScript.values) ButtonSegment(value: t, label: Text(names[t]!, key: Key('trace-script-${t.name}')))],
                selected: {_script},
                onSelectionChanged: (v) => setState(() {
                  _script = v.first;
                  _i = 0;
                  _watch.reset();
                }),
              ),
              const SizedBox(height: Kx.s8),
              SizedBox(
                height: narrow ? 56 : 64,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final (i, l) in _letters.indexed)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          key: Key('trace-letter-$l'),
                          label: Text(l, style: const TextStyle(fontSize: 24, fontFamilyFallback: KxFonts.fallback)),
                          selected: i == _i % _letters.length,
                          showCheckmark: false,
                          onSelected: (_) => setState(() {
                            _i = i;
                            _watch.reset();
                          }),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s8),
              Text('${s['strokeOrder']}: ${traceHint(_script, words)}', key: const Key('trace-hint'), style: context.text.bodyMedium),
              const SizedBox(height: Kx.s8),
              if (short) SizedBox(height: math.max(260, math.min(box.maxWidth * 0.75, 420)), child: pad) else Expanded(child: pad),
              const SizedBox(height: Kx.s8),
              controls,
            ],
          );
        return short ? SingleChildScrollView(padding: const EdgeInsets.all(Kx.s12), child: column) : Padding(padding: const EdgeInsets.all(Kx.s12), child: column);
      },
    );
  }
}

/// A large, labelled button for little hands (64 px tall).
class BigButton extends StatelessWidget {
  const BigButton({super.key, required this.icon, required this.label, required this.onTap, this.color});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => FilledButton.tonalIcon(
    style: FilledButton.styleFrom(minimumSize: const Size(64, 64), backgroundColor: color, textStyle: context.text.titleMedium),
    onPressed: onTap,
    icon: Icon(icon, size: 28),
    label: Text(label),
  );
}
