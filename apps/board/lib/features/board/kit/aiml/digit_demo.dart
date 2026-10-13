import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import 'aiml_strings.dart';
import 'digit_model.dart';
import 'inference_backend.dart';

/// Opens the digit recogniser; returns a chart of its last answer to put on the board, or null.
Future<KitElement?> openDigitDemo(BuildContext context, {required Color accent, InferenceBackend? backend}) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: DigitDemo(accent: accent, backend: backend ?? LocalDartBackend.shared)));

/// "A model running on the AI box", for now on the board: the teacher draws a digit, the
/// network's chances for each digit show as bars, and "How inference works" walks through the
/// layers (drawing → grid → 256 numbers → hidden layer → scores → probabilities).
class DigitDemo extends StatefulWidget {
  const DigitDemo({super.key, required this.accent, required this.backend});
  final Color accent;
  final InferenceBackend backend;

  @override
  State<DigitDemo> createState() => _DigitDemoState();
}

const _padSide = 280.0;

class _DigitDemoState extends State<DigitDemo> {
  final _strokes = <List<Offset>>[];
  double _progress = 0;
  DigitPrediction? _pred;
  int _step = 0;
  int _asked = 0;

  @override
  void initState() {
    super.initState();
    unawaited(
      widget.backend.prepare(onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      }).then((_) {
        if (mounted) setState(() => _progress = 1);
        _classify();
      }),
    );
  }

  Future<void> _classify() async {
    if (!widget.backend.ready) return;
    final ask = ++_asked;
    if (_strokes.every((s) => s.isEmpty)) {
      setState(() => _pred = null);
      return;
    }
    final p = await widget.backend.classifyDigit(rasterizeDigit(_strokes));
    if (mounted && ask == _asked) setState(() => _pred = p);
  }

  void _sample(int d) {
    setState(() {
      _strokes
        ..clear()
        ..addAll([
          for (final s in sampleDigitStrokes(d)) [for (final p in s) Offset(_padSide * (0.2 + p.dx * 0.6), _padSide * (0.1 + p.dy * 0.8))],
        ]);
    });
    _classify();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = aimlStrings(context);
    final size = MediaQuery.sizeOf(context);
    final accent = widget.accent;
    final ready = widget.backend.ready;
    final pred = _pred;
    final pad = Container(
      key: const Key('digit-pad'),
      width: _padSide,
      height: _padSide,
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: accent, width: 2), borderRadius: BorderRadius.circular(8)),
      child: GestureDetector(
        onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
        onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
        onPanEnd: (_) => _classify(),
        child: CustomPaint(size: const Size.square(_padSide), painter: _InkPainter(_strokes, _InkPainter.ink)),
      ),
    );
    final bars = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(pred == null ? s['drawHint'] : s.n('prediction', pred.digit), key: const Key('digit-prediction'), style: context.text.headlineSmall?.copyWith(color: accent)),
        const SizedBox(height: Kx.s8),
        for (var d = 0; d < 10; d++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              key: Key('digit-prob-$d'),
              children: [
                SizedBox(width: 22, child: Text('$d', style: context.text.titleSmall)),
                Expanded(
                  child: LinearProgressIndicator(
                    value: pred?.probabilities[d] ?? 0,
                    minHeight: 14,
                    color: pred?.digit == d ? accent : accent.withValues(alpha: 0.45),
                    backgroundColor: accent.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                SizedBox(width: 56, child: Text(pred == null ? '' : '${(pred.probabilities[d] * 100).toStringAsFixed(0)}%', textAlign: TextAlign.right)),
              ],
            ),
          ),
      ],
    );
    final wide = size.width > 760;
    return AlertDialog(
      key: const Key('digit-demo'),
      title: Text(s['digitDemo']),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
      content: SizedBox(
        width: math.min(860, size.width - 64),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  Chip(
                    key: const Key('digit-running-here'),
                    avatar: Icon(Icons.memory, size: 18, color: accent),
                    label: Text(s['runningHere']),
                    side: BorderSide(color: accent),
                  ),
                  Chip(key: const Key('digit-lan-box'), avatar: const Icon(Icons.router_outlined, size: 18), label: Text(s['lanBox'], style: TextStyle(color: context.text.bodySmall?.color))),
                ],
              ),
              if (!ready) ...[
                const SizedBox(height: Kx.s12),
                Text(s.n('training', (_progress * 100).round()), key: const Key('digit-training')),
                const SizedBox(height: Kx.s4),
                LinearProgressIndicator(value: _progress),
              ],
              const SizedBox(height: Kx.s12),
              Flex(
                direction: wide ? Axis.horizontal : Axis.vertical,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      pad,
                      const SizedBox(height: Kx.s8),
                      TextButton.icon(
                        key: const Key('digit-clear'),
                        onPressed: () {
                          setState(_strokes.clear);
                          _classify();
                        },
                        icon: const Icon(Icons.clear),
                        label: Text(s['clearPad']),
                      ),
                    ],
                  ),
                  const SizedBox(width: Kx.s16, height: Kx.s16),
                  if (wide) Expanded(child: bars) else bars,
                ],
              ),
              const SizedBox(height: Kx.s8),
              Text(s['samples'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s4,
                runSpacing: Kx.s4,
                children: [for (var d = 0; d < 10; d++) ActionChip(key: Key('digit-sample-$d'), label: Text('$d'), onPressed: ready ? () => _sample(d) : null)],
              ),
              if (widget.backend case final LocalDartBackend b when b.net != null) ...[
                const SizedBox(height: Kx.s4),
                Text(s.n('params', groupThousands(b.net!.parameters)), style: context.text.bodySmall),
              ],
              const SizedBox(height: Kx.s16),
              Text(s['how'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s4,
                runSpacing: Kx.s4,
                children: [
                  for (final (i, key) in _steps.indexed)
                    ChoiceChip(key: Key('digit-step-$i'), label: Text('${i + 1}. ${s['step.$key']}'), selected: _step == i, onSelected: (_) => setState(() => _step = i)),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Text(s['step.${_steps[_step]}Text'], key: const Key('digit-step-text')),
              const SizedBox(height: Kx.s8),
              SizedBox(
                height: 200,
                child: CustomPaint(key: const Key('digit-step-view'), painter: _StepPainter(_step, _strokes, pred?.trace, accent)),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton.icon(
          key: const Key('digit-to-board'),
          onPressed: pred == null
              ? null
              : () => Navigator.pop(
                  context,
                  KitElement.sized(
                    kind: KitKind.chart,
                    color: accent,
                    data: ChartData(
                      kind: KitChartKind.bar,
                      title: 'Digit recogniser: ${pred.digit} (${(pred.confidence * 100).toStringAsFixed(0)}%)',
                      labels: [for (var d = 0; d < 10; d++) '$d'],
                      series: [ChartSeries('probability (%)', [for (final p in pred.probabilities) double.parse((p * 100).toStringAsFixed(1))])],
                      xLabel: 'digit',
                      yLabel: '%',
                      note: 'Running on this board (demo)',
                    ).toJson(),
                  ),
                ),
          icon: const Icon(Icons.add_to_photos_outlined),
          label: Text(s['putOnBoard']),
        ),
      ],
    );
  }
}

const _steps = ['draw', 'grid', 'flat', 'hidden', 'output', 'probs'];

class _InkPainter extends CustomPainter {
  _InkPainter(this.strokes, this.color, {this.scale = 1});
  static const ink = Color(0xFF1B1F24);
  final List<List<Offset>> strokes;
  final Color color;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18 * scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final s in strokes) {
      if (s.isEmpty) continue;
      if (s.length == 1) {
        canvas.drawCircle(s.first * scale, 9 * scale, Paint()..color = color);
        continue;
      }
      final path = Path()..moveTo(s.first.dx * scale, s.first.dy * scale);
      for (final q in s.skip(1)) {
        path.lineTo(q.dx * scale, q.dy * scale);
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(_InkPainter old) => true;
}

/// One step of "how inference works", drawn from the network's own numbers.
class _StepPainter extends CustomPainter {
  _StepPainter(this.step, this.strokes, this.trace, this.accent);
  final int step;
  final List<List<Offset>> strokes;
  final DigitTrace? trace;
  final Color accent;

  void _label(Canvas canvas, String t, Offset at, {double size = 12, Color color = const Color(0xFF6A7078)}) {
    final tp = TextPainter(text: TextSpan(text: t, style: TextStyle(fontSize: size, color: color)), textDirection: TextDirection.ltr)..layout();
    tp.paint(canvas, at - Offset(tp.width / 2, 0));
    tp.dispose();
  }

  void _bars(Canvas canvas, Size size, List<double> v, {List<String>? names, bool signed = false, int? best}) {
    if (v.isEmpty) return;
    final hi = v.map((x) => x.abs()).fold(1e-9, math.max);
    final w = size.width / v.length;
    final base = signed ? size.height / 2 : size.height - 18;
    final room = signed ? size.height / 2 - 20 : size.height - 30;
    for (final (i, x) in v.indexed) {
      final h = x.abs() / hi * room;
      final r = Rect.fromLTWH(i * w + w * 0.15, x >= 0 ? base - h : base, w * 0.7, h);
      canvas.drawRect(r, Paint()..color = (i == best ? accent : (x >= 0 ? accent.withValues(alpha: 0.5) : const Color(0xFFC62828).withValues(alpha: 0.6))));
      if (names != null) _label(canvas, names[i], Offset(i * w + w / 2, size.height - 16));
    }
    canvas.drawLine(Offset(0, base), Offset(size.width, base), Paint()..color = const Color(0x33000000));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final t = trace;
    switch (step) {
      case 0:
        final k = size.height / _padSide;
        canvas.drawRect(Rect.fromLTWH(0, 0, _padSide * k, _padSide * k), Paint()..color = const Color(0xFFF4F6F8));
        _InkPainter(strokes, _InkPainter.ink, scale: k).paint(canvas, size);
      case 1:
        if (t == null) return;
        final cell = size.height / digitGrid;
        for (var r = 0; r < digitGrid; r++) {
          for (var c = 0; c < digitGrid; c++) {
            final v = t.input[r * digitGrid + c];
            final rect = Rect.fromLTWH(c * cell, r * cell, cell, cell);
            canvas
              ..drawRect(rect, Paint()..color = Color.lerp(Colors.white, const Color(0xFF1B1F24), v)!)
              ..drawRect(rect, Paint()
                ..color = const Color(0x22000000)
                ..style = PaintingStyle.stroke);
          }
        }
      case 2:
        if (t == null) return;
        const rows = 4, per = digitPixels ~/ rows;
        final w = size.width / per, h = (size.height - 20) / rows;
        for (var i = 0; i < digitPixels; i++) {
          canvas.drawRect(Rect.fromLTWH((i % per) * w, (i ~/ per) * h, w, h * 0.8), Paint()..color = Color.lerp(const Color(0xFFF4F6F8), const Color(0xFF1B1F24), t.input[i])!);
        }
        _label(canvas, 'x₁ … x₂₅₆', Offset(size.width / 2, size.height - 16));
      case 3:
        if (t == null) return;
        _bars(canvas, size, t.hidden);
      case 4:
        if (t == null) return;
        _bars(canvas, size, t.logits, names: [for (var d = 0; d < 10; d++) '$d'], signed: true, best: t.best);
      default:
        if (t == null) return;
        _bars(canvas, size, t.probs, names: [for (var d = 0; d < 10; d++) '$d'], best: t.best);
    }
  }

  @override
  bool shouldRepaint(_StepPainter old) => true;
}
