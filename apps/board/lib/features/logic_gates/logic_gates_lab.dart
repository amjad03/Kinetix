import 'dart:async';

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../extras/board_table.dart';
import 'logic_circuit.dart';

FeatureStrings logicStrings(BuildContext context) => FeatureStrings(boardLang(context), logicStringTable);

const logicStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Logic gates',
    'input': 'Switch',
    'clock': 'Clock',
    'led': 'LED',
    'step': 'Clock step',
    'run': 'Run clock',
    'stop': 'Stop clock',
    'table': 'Truth table',
    'canvas': 'Circuit',
    'delete': 'Delete part',
    'clear': 'Clear',
    'toBoard': 'Truth table to board',
    'placed': 'Truth table added to the board',
    'hint': 'Drag from a round pin on the right of a part to a pin on the left of another to wire them. Tap a switch to flip it.',
    'tooMany': 'The truth table needs 4 inputs or fewer, and at least one LED.',
    'tableHint': 'The row for the switches now is highlighted.',
  },
  'hi': {
    'title': 'लॉजिक गेट',
    'input': 'स्विच',
    'clock': 'क्लॉक',
    'led': 'एलईडी',
    'step': 'क्लॉक का एक चरण',
    'run': 'क्लॉक चलाएँ',
    'stop': 'क्लॉक रोकें',
    'table': 'सत्यता सारणी',
    'canvas': 'परिपथ',
    'delete': 'हिस्सा हटाएँ',
    'clear': 'साफ़ करें',
    'toBoard': 'सत्यता सारणी बोर्ड पर',
    'placed': 'सत्यता सारणी बोर्ड पर जोड़ दी गई',
    'hint': 'किसी हिस्से के दाएँ गोल पिन से दूसरे के बाएँ पिन तक खींचकर तार जोड़ें। स्विच को छूकर पलटें।',
    'tooMany': 'सत्यता सारणी के लिए 4 या कम इनपुट और कम से कम एक एलईडी चाहिए।',
    'tableHint': 'अभी के स्विच वाली पंक्ति चिह्नित है।',
  },
  'kn': {
    'title': 'ಲಾಜಿಕ್ ಗೇಟ್‌ಗಳು',
    'input': 'ಸ್ವಿಚ್',
    'clock': 'ಕ್ಲಾಕ್',
    'led': 'ಎಲ್‌ಇಡಿ',
    'step': 'ಕ್ಲಾಕ್ ಹಂತ',
    'run': 'ಕ್ಲಾಕ್ ಓಡಿಸಿ',
    'stop': 'ಕ್ಲಾಕ್ ನಿಲ್ಲಿಸಿ',
    'table': 'ಸತ್ಯ ಕೋಷ್ಟಕ',
    'canvas': 'ಸರ್ಕ್ಯೂಟ್',
    'delete': 'ಭಾಗ ಅಳಿಸಿ',
    'clear': 'ಅಳಿಸಿ',
    'toBoard': 'ಸತ್ಯ ಕೋಷ್ಟಕ ಬೋರ್ಡ್‌ಗೆ',
    'placed': 'ಸತ್ಯ ಕೋಷ್ಟಕವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಲಾಗಿದೆ',
    'hint': 'ಒಂದು ಭಾಗದ ಬಲದ ಸುತ್ತಿನ ಪಿನ್‌ನಿಂದ ಇನ್ನೊಂದರ ಎಡ ಪಿನ್‌ಗೆ ಎಳೆದು ತಂತಿ ಜೋಡಿಸಿ. ಸ್ವಿಚ್ ಒತ್ತಿ ಬದಲಿಸಿ.',
    'tooMany': 'ಸತ್ಯ ಕೋಷ್ಟಕಕ್ಕೆ 4 ಅಥವಾ ಕಡಿಮೆ ಇನ್‌ಪುಟ್ ಮತ್ತು ಕನಿಷ್ಠ ಒಂದು ಎಲ್‌ಇಡಿ ಬೇಕು.',
    'tableHint': 'ಈಗಿನ ಸ್ವಿಚ್‌ಗಳ ಸಾಲು ಗುರುತಾಗಿದೆ.',
  },
};

/// Interactive logic gates: drop gates, switches, a clock and LEDs on the circuit board, wire
/// them by dragging from a part's output pin to another's input pin, flip the switches and watch the
/// signals (green is 1) and LEDs follow at once. A truth table shows every case and can go on the board.
class LogicGatesLab extends StatefulWidget {
  const LogicGatesLab({super.key, required this.wb, this.circuit});

  final WhiteboardController wb;
  final LogicCircuit? circuit;

  @override
  State<LogicGatesLab> createState() => _LogicGatesLabState();
}

enum _Drag { none, move, wire }

class _LogicGatesLabState extends State<LogicGatesLab> {
  late final LogicCircuit c = widget.circuit ?? LogicCircuit();
  String? _selected;
  bool _showTable = false;
  Timer? _clock;

  _Drag _drag = _Drag.none;
  String? _dragPart;
  Offset _dragAt = Offset.zero;
  Offset _grab = Offset.zero;
  String? _wireFrom;

  static const _pinHit = 16.0;

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  void _toggleClock() {
    setState(() {
      if (_clock != null) {
        _clock!.cancel();
        _clock = null;
      } else {
        _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(c.tick));
      }
    });
  }

  /// A free spot for a new part: down the left for inputs, middle for gates, right for LEDs.
  Offset _spot(PartKind k) {
    final same = c.parts.where((p) => p.kind == k).length;
    final x = switch (k) {
      PartKind.input || PartKind.clock => 24.0,
      PartKind.gate => 220.0 + (same % 3) * 140,
      PartKind.led => 640.0,
    };
    return Offset(x, 30 + (same % 6) * 90.0 + (k == PartKind.clock ? 30 : 0));
  }

  void _add(PartKind k, {GateType? gate}) {
    setState(() => _selected = c.add(k, _spot(k) , gate: gate).id);
  }

  /// The output pin of a part at [p], if any.
  LogicPart? _outAt(Offset p) => c.parts.reversed.where((x) => x.hasOutput && (x.outPin - p).distance <= _pinHit).firstOrNull;

  ({LogicPart part, int pin})? _inAt(Offset p, {String? except}) {
    for (final x in c.parts.reversed) {
      if (x.id == except) continue;
      for (var i = 0; i < x.inputCount; i++) {
        if ((x.inPin(i) - p).distance <= _pinHit) return (part: x, pin: i);
      }
    }
    return null;
  }

  LogicPart? _bodyAt(Offset p) => c.parts.reversed.where((x) => x.rect.contains(p)).firstOrNull;

  void _start(Offset p) {
    // Pick up a wire from a connected input pin, or start one from an output pin.
    final inPin = _inAt(p);
    if (inPin != null) {
      final from = c.detach(inPin.part.id, inPin.pin);
      if (from != null) {
        setState(() {
          _drag = _Drag.wire;
          _wireFrom = from;
          _dragAt = p;
        });
        return;
      }
    }
    final out = _outAt(p);
    if (out != null) {
      setState(() {
        _drag = _Drag.wire;
        _wireFrom = out.id;
        _dragAt = p;
      });
      return;
    }
    final body = _bodyAt(p);
    if (body != null) {
      setState(() {
        _drag = _Drag.move;
        _dragPart = body.id;
        _grab = p - body.pos;
        _selected = body.id;
      });
    }
  }

  void _update(Offset p) {
    switch (_drag) {
      case _Drag.wire:
        setState(() => _dragAt = p);
      case _Drag.move:
        setState(() => c.part(_dragPart!)?.pos = p - _grab);
      case _Drag.none:
        break;
    }
  }

  void _end(Offset p) {
    if (_drag == _Drag.wire && _wireFrom != null) {
      final target = _inAt(p, except: _wireFrom);
      if (target != null) c.connect(_wireFrom!, target.part.id, target.pin);
    }
    setState(() {
      _drag = _Drag.none;
      _wireFrom = null;
      _dragPart = null;
    });
  }

  void _tap(Offset p) {
    final body = _bodyAt(p);
    setState(() {
      _selected = body?.id;
      if (body != null && (body.kind == PartKind.input || body.kind == PartKind.clock)) body.value = !body.value;
    });
  }

  void _tableToBoard() {
    final s = logicStrings(context);
    final rows = c.truthTable();
    if (rows.isEmpty || c.leds.isEmpty) {
      showBoardMessage(context, s['tooMany']);
      return;
    }
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    widget.wb.insert(boardTable([
      [for (final i in c.inputs) i.label, for (final l in c.leds) l.label],
      for (final r in rows) [for (final b in [...r.ins, ...r.outs]) b ? '1' : '0'],
    ], ink, size: 26, header: const Color(0x334F8CFF)));
    showBoardMessage(context, s['placed']);
  }

  @override
  Widget build(BuildContext context) {
    final s = logicStrings(context);
    final v = c.evaluate();
    return Column(
      key: const Key('logic-gates'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(Kx.s8),
          child: Row(
            children: [
              for (final g in GateType.values)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: OutlinedButton(key: Key('lg-add-${g.name}'), onPressed: () => _add(PartKind.gate, gate: g), child: Text(gateName(g))),
                ),
              _btn(const Key('lg-add-input'), Icons.toggle_on_outlined, s['input'], () => _add(PartKind.input)),
              _btn(const Key('lg-add-clock'), Icons.schedule, s['clock'], () => _add(PartKind.clock)),
              _btn(const Key('lg-add-led'), Icons.lightbulb_outline, s['led'], () => _add(PartKind.led)),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
          child: Row(
            children: [
              _btn(const Key('lg-step'), Icons.skip_next, s['step'], () => setState(c.tick)),
              _btn(const Key('lg-run'), _clock == null ? Icons.play_arrow : Icons.pause, _clock == null ? s['run'] : s['stop'], _toggleClock),
              _btn(const Key('lg-table'), Icons.table_chart_outlined, s['table'], () => setState(() => _showTable = !_showTable)),
              _btn(const Key('lg-to-board'), Icons.dashboard_customize_outlined, s['toBoard'], _tableToBoard),
              _btn(const Key('lg-delete'), Icons.delete_outline, s['delete'], _selected == null ? null : () => setState(() {
                c.remove(_selected!);
                _selected = null;
              })),
              _btn(const Key('lg-clear'), Icons.clear_all, s['clear'], () => setState(() {
                c.parts.clear();
                c.wires.clear();
                _selected = null;
              })),
            ],
          ),
        ),
        Padding(padding: const EdgeInsets.all(Kx.s8), child: Text(s['hint'], style: context.text.bodySmall)),
        const Divider(height: 1),
        Expanded(
          flex: 3,
          child: ClipRect(
            child: GestureDetector(
              key: const Key('lg-canvas'),
              behavior: HitTestBehavior.opaque,
              // A drag starts where the finger went down, so it can begin on a small pin.
              dragStartBehavior: DragStartBehavior.down,
              onTapUp: (d) => _tap(d.localPosition),
              onPanStart: (d) => _start(d.localPosition),
              onPanUpdate: (d) => _update(d.localPosition),
              onPanEnd: (_) => _end(_dragAt),
              child: CustomPaint(
                size: Size.infinite,
                painter: _CircuitPainter(c, v, _selected, _wireFrom == null ? null : (c.part(_wireFrom!)!.outPin, _dragAt), Theme.of(context).colorScheme),
              ),
            ),
          ),
        ),
        if (_showTable) Expanded(flex: 2, child: _tableView(context, s, v)),
      ],
    );
  }

  Widget _btn(Key key, IconData icon, String label, VoidCallback? onTap) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: OutlinedButton.icon(key: key, onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label)),
  );

  Widget _tableView(BuildContext context, FeatureStrings s, Map<String, bool> v) {
    final rows = c.truthTable();
    if (rows.isEmpty || c.leds.isEmpty) return Center(key: const Key('lg-table-empty'), child: Text(s['tooMany']));
    final now = [for (final i in c.inputs) i.value];
    String bit(bool b) => b ? '1' : '0';
    return SingleChildScrollView(
      key: const Key('lg-table-view'),
      padding: const EdgeInsets.all(Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DataTable(
            columns: [for (final p in [...c.inputs, ...c.leds]) DataColumn(label: Text(p.label, style: const TextStyle(fontWeight: FontWeight.bold)))],
            rows: [
              for (final (i, r) in rows.indexed)
                DataRow(
                  selected: [for (var k = 0; k < now.length; k++) now[k] == r.ins[k]].every((x) => x),
                  cells: [for (final (k, b) in [...r.ins, ...r.outs].indexed) DataCell(Text(bit(b), key: k == 0 ? ValueKey('lg-row-$i') : null))],
                ),
            ],
          ),
          Text(s['tableHint'], style: context.text.bodySmall),
        ],
      ),
    );
  }
}

/// Draws the wires (green for 1, grey for 0), then the parts with their gate symbols, pins and LEDs.
class _CircuitPainter extends CustomPainter {
  _CircuitPainter(this.c, this.v, this.selected, this.rubber, this.scheme);

  final LogicCircuit c;
  final Map<String, bool> v;
  final String? selected;
  final (Offset, Offset)? rubber;
  final ColorScheme scheme;

  static const on = Color(0xFF2E9E4F), off = Color(0xFF8A8F98);

  @override
  void paint(Canvas canvas, Size size) {
    void wire(Offset a, Offset b, Color color) {
      final dx = (b.dx - a.dx).abs().clamp(30, 200) / 2;
      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..cubicTo(a.dx + dx, a.dy, b.dx - dx, b.dy, b.dx, b.dy);
      canvas.drawPath(path, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 4..strokeCap = StrokeCap.round);
    }

    for (final w in c.wires) {
      final a = c.part(w.from), b = c.part(w.to);
      if (a == null || b == null) continue;
      wire(a.outPin, b.inPin(w.pin), (v[w.from] ?? false) ? on : off);
    }
    if (rubber case (final a, final b)) wire(a, b, scheme.primary);
    for (final p in c.parts) {
      _part(canvas, p, v[p.id] ?? false);
    }
  }

  void _part(Canvas canvas, LogicPart p, bool high) {
    final line = Paint()..color = scheme.onSurface..style = PaintingStyle.stroke..strokeWidth = 3;
    final r = p.rect;
    final sel = p.id == selected;
    if (sel) canvas.drawRRect(RRect.fromRectAndRadius(r.inflate(8), const Radius.circular(10)), Paint()..color = scheme.primary.withValues(alpha: 0.18));
    switch (p.kind) {
      case PartKind.gate:
        _gate(canvas, p, line);
      case PartKind.input:
      case PartKind.clock:
        final body = RRect.fromRectAndRadius(r, const Radius.circular(22));
        canvas.drawRRect(body, Paint()..color = high ? on : scheme.surfaceContainerHighest);
        canvas.drawRRect(body, line);
        _text(canvas, '${p.label} ${high ? 1 : 0}', r.center, high ? Colors.white : scheme.onSurface, 16);
      case PartKind.led:
        canvas.drawCircle(r.center, 18, Paint()..color = high ? const Color(0xFFFFC107) : scheme.surfaceContainerHighest);
        if (high) canvas.drawCircle(r.center, 26, Paint()..color = const Color(0x55FFC107));
        canvas.drawCircle(r.center, 18, line);
        _text(canvas, p.label, r.center + const Offset(0, 34), scheme.onSurface, 13);
    }
    final pin = Paint()..color = scheme.primary;
    for (var i = 0; i < p.inputCount; i++) {
      canvas.drawCircle(p.inPin(i), 6, pin);
    }
    if (p.hasOutput) canvas.drawCircle(p.outPin, 6, pin);
  }

  void _gate(Canvas canvas, LogicPart p, Paint line) {
    final r = p.rect;
    final g = p.gate!;
    final inverted = g == GateType.nand || g == GateType.nor || g == GateType.xnor || g == GateType.not;
    final bodyRight = inverted ? r.right - 10 : r.right;
    final path = Path();
    switch (g) {
      case GateType.and || GateType.nand:
        path
          ..moveTo(r.left, r.top)
          ..lineTo((r.left + bodyRight) / 2, r.top)
          ..arcToPoint(Offset((r.left + bodyRight) / 2, r.bottom), radius: Radius.circular(r.height / 2))
          ..lineTo(r.left, r.bottom)
          ..close();
      case GateType.or || GateType.nor || GateType.xor || GateType.xnor:
        path
          ..moveTo(r.left, r.top)
          ..quadraticBezierTo((r.left + bodyRight) / 2 + 8, r.top, bodyRight, r.center.dy)
          ..quadraticBezierTo((r.left + bodyRight) / 2 + 8, r.bottom, r.left, r.bottom)
          ..quadraticBezierTo(r.left + 18, r.center.dy, r.left, r.top)
          ..close();
      case GateType.not || GateType.buffer:
        path
          ..moveTo(r.left, r.top + 6)
          ..lineTo(bodyRight, r.center.dy)
          ..lineTo(r.left, r.bottom - 6)
          ..close();
    }
    canvas.drawPath(path, Paint()..color = scheme.surfaceContainerHigh);
    canvas.drawPath(path, line);
    if (g == GateType.xor || g == GateType.xnor) {
      canvas.drawPath(Path()..moveTo(r.left - 8, r.top)..quadraticBezierTo(r.left + 10, r.center.dy, r.left - 8, r.bottom), line);
    }
    if (inverted) {
      canvas.drawCircle(Offset(r.right - 5, r.center.dy), 5, Paint()..color = scheme.surface);
      canvas.drawCircle(Offset(r.right - 5, r.center.dy), 5, line);
    }
    _text(canvas, gateName(g), r.center + const Offset(-2, 0), scheme.onSurface, g == GateType.buffer || g == GateType.xnor ? 10 : 12);
  }

  void _text(Canvas canvas, String t, Offset centre, Color color, double size) {
    final tp = TextPainter(text: TextSpan(text: t, style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w600)), textDirection: TextDirection.ltr)..layout();
    tp.paint(canvas, centre - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(_CircuitPainter old) => true;
}
