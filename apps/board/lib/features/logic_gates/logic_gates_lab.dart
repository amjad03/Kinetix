import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../extras/board_table.dart';
import 'logic_strings.dart';

export 'logic_strings.dart';

/// Interactive logic gates: drop gates (2 to 8 inputs), switches, clocks, LEDs, 7-segment
/// displays and flip-flops on the circuit board, or a ready circuit (adders, MUX/DEMUX,
/// encoder/decoder, counters, a shift register), or type an expression to have it built; wire
/// them by dragging from a part's output pin to another's input pin, flip the switches, step or
/// run the clock and watch the signals (green is 1). Below: the truth table, the expression of
/// each output with its minimal SOP/POS and K-map, and the timing diagram of the clocked run;
/// each can go on the board, and the circuit itself as a live panel that opens here again.
class LogicGatesLab extends StatefulWidget {
  const LogicGatesLab({super.key, this.wb, this.circuit});

  /// Where the board buttons put things (none when the lab edits a board panel).
  final WhiteboardController? wb;
  final LogicCircuit? circuit;

  @override
  State<LogicGatesLab> createState() => _LogicGatesLabState();
}

enum _Drag { none, move, wire }

enum _Pane { none, table, algebra, timing }

class _LogicGatesLabState extends State<LogicGatesLab> {
  late final LogicCircuit c = widget.circuit ?? LogicCircuit();
  String? _selected;
  _Pane _pane = _Pane.none;
  Timer? _clock;
  int _out = 0;
  int _cycles = 8;
  final _expr = TextEditingController();

  _Drag _drag = _Drag.none;
  String? _dragPart;
  Offset _dragAt = Offset.zero;
  Offset _grab = Offset.zero;
  ({String id, int pin})? _wireFrom;

  /// How near a finger must land to take a pin (a fingertip on a panel, not a mouse point).
  static const _pinHit = 22.0;

  @override
  void dispose() {
    _clock?.cancel();
    _expr.dispose();
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

  /// A free spot for a new part: down the left for inputs, middle for gates, right for outputs.
  Offset _spot(PartKind k) {
    final same = c.parts.where((p) => p.kind == k).length;
    final x = switch (k) {
      PartKind.input || PartKind.clock => 24.0,
      PartKind.gate || PartKind.flipFlop => 220.0 + (same % 3) * 140,
      PartKind.led || PartKind.segment7 => 640.0,
    };
    return Offset(x, 30 + (same % 6) * 90.0 + (k == PartKind.clock ? 30 : 0));
  }

  void _add(PartKind k, {GateType? gate, FlipFlopType? flipFlop}) {
    setState(() => _selected = c.add(k, _spot(k), gate: gate, flipFlop: flipFlop).id);
  }

  void _load(LogicCircuit other) {
    _clock?.cancel();
    setState(() {
      _clock = null;
      c.replaceWith(other);
      _selected = null;
      _out = 0;
    });
  }

  void _build() {
    final s = logicStrings(context);
    try {
      final p = parseLogic(_expr.text);
      final vars = p.expr.variables..sort();
      if (vars.length > 8) throw const FormatException('Too many variables');
      _load(circuitFromExpr(p.expr, vars: vars, output: p.output ?? 'Q1')..title = _expr.text.trim());
    } on FormatException {
      showBoardMessage(context, s['badExpr']);
    }
  }

  /// The output pin nearest [p], if one is in reach.
  ({LogicPart part, int pin})? _outAt(Offset p) {
    ({LogicPart part, int pin})? best;
    var bestD = _pinHit;
    for (final x in c.parts.reversed) {
      for (var k = 0; k < x.outputCount; k++) {
        final d = (x.outPinAt(k) - p).distance;
        if (d <= bestD) {
          best = (part: x, pin: k);
          bestD = d;
        }
      }
    }
    return best;
  }

  /// The input pin nearest [p], if one is in reach (a gate's inputs are close together).
  ({LogicPart part, int pin})? _inAt(Offset p, {String? except}) {
    ({LogicPart part, int pin})? best;
    var bestD = _pinHit;
    for (final x in c.parts.reversed) {
      if (x.id == except && x.kind != PartKind.flipFlop) continue;
      for (var i = 0; i < x.inputCount; i++) {
        final d = (x.inPin(i) - p).distance;
        if (d < bestD) {
          best = (part: x, pin: i);
          bestD = d;
        }
      }
    }
    return best;
  }

  LogicPart? _bodyAt(Offset p) => c.parts.reversed.where((x) => x.rect.contains(p)).firstOrNull;

  void _start(Offset p) {
    // Pick up a wire from a connected input pin, or start one from an output pin.
    final inPin = _inAt(p);
    final outPin = _outAt(p);
    // Where an output and an input pin are both in reach, the nearer one is meant.
    if (inPin != null && (outPin == null || (inPin.part.inPin(inPin.pin) - p).distance <= (outPin.part.outPinAt(outPin.pin) - p).distance)) {
      final w = c.detachWire(inPin.part.id, inPin.pin);
      if (w != null) {
        setState(() {
          _drag = _Drag.wire;
          _wireFrom = (id: w.from, pin: w.fromPin);
          _dragAt = p;
        });
        return;
      }
    }
    if (outPin != null) {
      setState(() {
        _drag = _Drag.wire;
        _wireFrom = (id: outPin.part.id, pin: outPin.pin);
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
        // Kept on the circuit board: a part dragged past the edge would be lost.
        final to = p - _grab;
        setState(() => c.part(_dragPart!)?.pos = Offset(to.dx.clamp(0, double.infinity), to.dy.clamp(0, double.infinity)));
      case _Drag.none:
        break;
    }
  }

  void _end(Offset p) {
    final from = _wireFrom;
    if (_drag == _Drag.wire && from != null) {
      final target = _inAt(p, except: from.id);
      if (target != null) c.connect(from.id, target.part.id, target.pin, fromPin: from.pin);
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
      if (body != null && (body.kind == PartKind.input || body.kind == PartKind.clock)) c.flip(body);
    });
  }

  Color get _accent => Theme.of(context).colorScheme.primary;

  void _tableToBoard() {
    final s = logicStrings(context);
    final wb = widget.wb;
    final rows = c.truthTable(maxInputs: 6);
    if (wb == null) return;
    if (rows.isEmpty || c.leds.isEmpty) {
      showBoardMessage(context, s['tooMany']);
      return;
    }
    final ink = wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    wb.insert(boardTable([
      [for (final i in c.inputs) i.label, for (final l in c.leds) l.label],
      for (final r in rows) [for (final b in [...r.ins, ...r.outs]) b ? '1' : '0'],
    ], ink, size: 26, header: const Color(0x334F8CFF)));
    showBoardMessage(context, s['placed']);
  }

  void _circuitToBoard() {
    widget.wb?.insert([KitElement.sized(kind: KitKind.logicCircuit, data: c.toJson(), color: _accent)]);
    showBoardMessage(context, logicStrings(context)['circuitPlaced']);
  }

  void _timingToBoard() {
    widget.wb?.insert([KitElement.sized(kind: KitKind.timing, data: simulateTiming(c, cycles: _cycles, title: c.title.isEmpty ? 'Timing diagram' : c.title).toJson(), color: _accent)]);
    showBoardMessage(context, logicStrings(context)['timingPlaced']);
  }

  void _pick(_Pane p) => setState(() => _pane = _pane == p ? _Pane.none : p);

  @override
  Widget build(BuildContext context) {
    final s = logicStrings(context);
    final v = c.evaluate();
    final scheme = Theme.of(context).colorScheme;
    final sel = _selected == null ? null : c.part(_selected!);
    final grows = sel != null && sel.kind == PartKind.gate && gateGrows(sel.gate!);
    final hasBoard = widget.wb != null;
    final parts = [
      for (final g in GateType.values)
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: OutlinedButton(key: Key('lg-add-${g.name}'), onPressed: () => _add(PartKind.gate, gate: g), child: Text(gateName(g))),
        ),
      _btn(const Key('lg-add-input'), Icons.toggle_on_outlined, s['input'], () => _add(PartKind.input)),
      _btn(const Key('lg-add-clock'), Icons.schedule, s['clock'], () => _add(PartKind.clock)),
      _btn(const Key('lg-add-led'), Icons.lightbulb_outline, s['led'], () => _add(PartKind.led)),
      _btn(const Key('lg-add-seg'), Icons.looks_one_outlined, s['segment'], () => _add(PartKind.segment7)),
      Padding(
        padding: const EdgeInsets.only(right: 6),
        child: PopupMenuButton<FlipFlopType>(
          key: const Key('lg-add-ff'),
          tooltip: s['flipFlop'],
          onSelected: (t) => _add(PartKind.flipFlop, flipFlop: t),
          itemBuilder: (_) => [for (final t in FlipFlopType.values) PopupMenuItem(key: Key('lg-add-ff-${t.name}'), value: t, child: Text('${flipFlopName(t)} ${s['flipFlop']}'))],
          child: _menuFace(Icons.memory, s['flipFlop']),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(right: 6),
        child: PopupMenuButton<LogicPreset>(
          key: const Key('lg-presets'),
          tooltip: s['presets'],
          onSelected: (p) => _load(logicPreset(p)),
          itemBuilder: (_) => [for (final p in LogicPreset.values) PopupMenuItem(key: Key('lg-preset-${p.name}'), value: p, child: Text(logicPresetName(p)))],
          child: _menuFace(Icons.auto_awesome_mosaic_outlined, s['presets']),
        ),
      ),
    ];
    final actions = [
      _btn(const Key('lg-step'), Icons.skip_next, s['step'], () => setState(c.tick)),
      _btn(const Key('lg-run'), _clock == null ? Icons.play_arrow : Icons.pause, _clock == null ? s['run'] : s['stop'], _toggleClock),
      _btn(const Key('lg-reset'), Icons.restart_alt, s['reset'], () => setState(c.reset)),
      _iconBtn(const Key('lg-in-minus'), Icons.remove, s['inputsLess'], grows && sel.inputCount > 2 ? () => setState(() => c.setInputs(sel.id, sel.inputCount - 1)) : null),
      _iconBtn(const Key('lg-in-plus'), Icons.add, s['inputsMore'], grows && sel.inputCount < maxGateInputs ? () => setState(() => c.setInputs(sel.id, sel.inputCount + 1)) : null),
      _btn(const Key('lg-table'), Icons.table_chart_outlined, s['table'], () => _pick(_Pane.table), on: _pane == _Pane.table),
      _btn(const Key('lg-algebra'), Icons.functions, s['algebra'], () => _pick(_Pane.algebra), on: _pane == _Pane.algebra),
      _btn(const Key('lg-timing'), Icons.stacked_line_chart, s['timing'], () => _pick(_Pane.timing), on: _pane == _Pane.timing),
      if (hasBoard) ...[
        _btn(const Key('lg-to-board'), Icons.dashboard_customize_outlined, s['toBoard'], _tableToBoard),
        _btn(const Key('lg-circuit-to-board'), Icons.developer_board, s['circuitToBoard'], c.parts.isEmpty ? null : _circuitToBoard),
        _btn(const Key('lg-timing-to-board'), Icons.timeline, s['timingToBoard'], c.parts.isEmpty ? null : _timingToBoard),
      ],
      _btn(const Key('lg-delete'), Icons.delete_outline, s['delete'], _selected == null ? null : () => setState(() {
        c.remove(_selected!);
        _selected = null;
      })),
      _btn(const Key('lg-clear'), Icons.clear_all, s['clear'], () => _load(LogicCircuit())),
    ];
    final exprRow = Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, 0),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              key: const Key('lg-expr'),
              controller: _expr,
              decoration: InputDecoration(isDense: true, labelText: s['expr'], hintText: s['exprHint']),
              onSubmitted: (_) => _build(),
            ),
          ),
          const SizedBox(width: Kx.s8),
          FilledButton.icon(key: const Key('lg-build'), onPressed: _build, icon: const Icon(Icons.build_outlined, size: 18), label: Text(s['build'])),
        ],
      ),
    );
    // Every button in sight where there is room (a panel, a tablet); a phone scrolls each row
    // sideways so the circuit keeps its room.
    Widget row(List<Widget> children, EdgeInsets padding) => LayoutBuilder(
      builder: (context, box) => box.maxWidth >= 600 && MediaQuery.sizeOf(context).height >= 600
          ? Padding(padding: padding, child: Wrap(runSpacing: 6, children: children))
          : SingleChildScrollView(scrollDirection: Axis.horizontal, padding: padding, child: Row(children: children)),
    );
    final pal = LogicPalette(ink: scheme.onSurface, surface: scheme.surface, body: scheme.surfaceContainerHigh, raised: scheme.surfaceContainerHighest, primary: scheme.primary);
    return Column(
      key: const Key('logic-gates'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        row(parts, const EdgeInsets.all(Kx.s8)),
        row(actions, const EdgeInsets.symmetric(horizontal: Kx.s8)),
        exprRow,
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
                painter: _CircuitPainter(c, v, _selected, switch (_wireFrom) {
                  final f? when c.part(f.id) != null => (c.part(f.id)!.outPinAt(f.pin), _dragAt),
                  _ => null,
                }, pal),
              ),
            ),
          ),
        ),
        if (_pane != _Pane.none) const Divider(height: 1),
        if (_pane == _Pane.table) Expanded(flex: 2, child: _tableView(context, s)),
        if (_pane == _Pane.algebra) Expanded(flex: 2, child: _algebraView(context, s)),
        if (_pane == _Pane.timing) Expanded(flex: 2, child: _timingView(context, s)),
      ],
    );
  }

  Widget _menuFace(IconData icon, String label) => IgnorePointer(
    child: OutlinedButton.icon(onPressed: () {}, icon: Icon(icon, size: 18), label: Text('$label ▾')),
  );

  Widget _btn(Key key, IconData icon, String label, VoidCallback? onTap, {bool on = false}) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: on
        ? FilledButton.tonalIcon(key: key, onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label))
        : OutlinedButton.icon(key: key, onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label)),
  );

  Widget _iconBtn(Key key, IconData icon, String tip, VoidCallback? onTap) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: IconButton.outlined(key: key, tooltip: tip, onPressed: onTap, icon: Icon(icon, size: 18)),
  );

  Widget _tableView(BuildContext context, FeatureStrings s) {
    final rows = c.truthTable(maxInputs: 6);
    if (rows.isEmpty || c.leds.isEmpty) return Center(key: const Key('lg-table-empty'), child: Text(s['tooMany']));
    final now = [for (final i in c.inputs) i.value];
    String bit(bool b) => b ? '1' : '0';
    return SingleChildScrollView(
      key: const Key('lg-table-view'),
      padding: const EdgeInsets.all(Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columns: [for (final p in [...c.inputs, ...c.leds]) DataColumn(label: Text(p.label, style: const TextStyle(fontWeight: FontWeight.bold)))],
              rows: [
                for (final (i, r) in rows.indexed)
                  DataRow(
                    selected: [for (var k = 0; k < now.length; k++) now[k] == r.ins[k]].every((x) => x),
                    cells: [for (final (k, b) in [...r.ins, ...r.outs].indexed) DataCell(Text(bit(b), key: k == 0 ? ValueKey('lg-row-$i') : null))],
                  ),
              ],
            ),
          ),
          Text(s['tableHint'], style: context.text.bodySmall),
        ],
      ),
    );
  }

  static const _groupColors = [Color(0xFF1565C0), Color(0xFFC62828), Color(0xFF2E7D32), Color(0xFF8E24AA), Color(0xFFEF6C00), Color(0xFF00838F), Color(0xFF6D4C41), Color(0xFFAD1457)];

  Widget _algebraView(BuildContext context, FeatureStrings s) {
    final leds = c.leds;
    if (leds.isEmpty) return Center(key: const Key('lg-algebra-empty'), child: Text(s['noOutputs']));
    final led = leds[_out.clamp(0, leds.length - 1)];
    final vars = [for (final p in c.inputs) p.label];
    final n = vars.length;
    final tableOk = n >= 1 && n <= 6;
    final ms = tableOk ? c.mintermsOf(led) : <int>{};
    final terms = tableOk ? minimise(n, ms) : const <Implicant>[];
    final sop = tableOk ? sopText(terms, vars, allOnes: ms.length == 1 << n) : '—';
    final pos = tableOk ? posText(n, ms, vars) : '—';
    final mono = context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600);
    Widget line(String k, String label, String value) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text.rich(TextSpan(children: [TextSpan(text: '$label:  ', style: context.text.bodySmall), TextSpan(text: value, style: mono)]), key: Key(k)),
    );
    return SingleChildScrollView(
      key: const Key('lg-algebra-view'),
      padding: const EdgeInsets.all(Kx.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (leds.length > 1)
            Wrap(
              spacing: 6,
              children: [
                Text('${s['output']}: '),
                for (final (i, l) in leds.indexed) ChoiceChip(key: Key('lg-out-$i'), label: Text(l.label), selected: led == l, onSelected: (_) => setState(() => _out = i)),
              ],
            ),
          line('lg-expr-wiring', s['fromWiring'], '${led.label} = ${c.expressionOf(led.id)}'),
          line('lg-expr-sop', s['minimalSop'], '${led.label} = $sop'),
          line('lg-expr-pos', s['minimalPos'], '${led.label} = $pos'),
          if (tableOk) line('lg-minterms', s['minterms'], 'Σm(${(ms.toList()..sort()).join(', ')})'),
          const SizedBox(height: Kx.s8),
          Text(s['kmap'], style: context.text.titleSmall),
          const SizedBox(height: Kx.s8),
          if (n < 2 || n > 4) Text(s['kmapNeeds'], key: const Key('lg-kmap-none')) else _kmap(context, s, n, vars, ms, terms),
        ],
      ),
    );
  }

  Widget _kmap(BuildContext context, FeatureStrings s, int n, List<String> vars, Set<int> ms, List<Implicant> terms) {
    final (rows, cols) = kmapShape(n);
    final rowBits = n ~/ 2, colBits = n - rowBits;
    final rowL = kmapLabels(rowBits), colL = kmapLabels(colBits);
    final scheme = Theme.of(context).colorScheme;
    const cell = 52.0;
    Widget box(Widget child, {Color? fill, List<Color> rings = const []}) {
      Widget w = Container(width: cell, height: cell, alignment: Alignment.center, decoration: BoxDecoration(color: fill, border: Border.all(color: scheme.outlineVariant)), child: child);
      for (final (i, r) in rings.indexed) {
        w = Stack(alignment: Alignment.center, children: [w, IgnorePointer(child: Container(width: cell - 6 - i * 8, height: cell - 6 - i * 8, decoration: BoxDecoration(border: Border.all(color: r, width: 2.5), borderRadius: BorderRadius.circular(8))))]);
      }
      return w;
    }

    final corner = '${vars.take(rowBits).join()}\\${vars.skip(rowBits).join()}';
    return Column(
      key: const Key('lg-kmap'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Column(
            children: [
              Row(children: [box(Text(corner, style: context.text.labelSmall)), for (final l in colL) box(Text(l, style: const TextStyle(fontWeight: FontWeight.bold)))]),
              for (var r = 0; r < rows; r++)
                Row(
                  children: [
                    box(Text(rowL[r], style: const TextStyle(fontWeight: FontWeight.bold))),
                    for (var col = 0; col < cols; col++)
                      () {
                        final m = kmapMinterm(n, r, col);
                        final rings = [for (final (i, t) in terms.indexed) if (t.covers(m)) _groupColors[i % _groupColors.length]];
                        return KeyedSubtree(
                          key: Key('lg-kmap-$m'),
                          child: box(Text(ms.contains(m) ? '1' : '0', style: TextStyle(fontWeight: ms.contains(m) ? FontWeight.bold : FontWeight.normal)), fill: ms.contains(m) ? scheme.primaryContainer.withValues(alpha: 0.5) : null, rings: rings),
                        );
                      }(),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: Kx.s12,
          children: [for (final (i, t) in terms.indexed) Text(t.term(vars), style: TextStyle(color: _groupColors[i % _groupColors.length], fontWeight: FontWeight.bold))],
        ),
        Text(s['groups'], style: context.text.bodySmall),
      ],
    );
  }

  Widget _timingView(BuildContext context, FeatureStrings s) {
    final d = simulateTiming(c, cycles: _cycles, title: c.title.isEmpty ? 'Timing diagram' : c.title);
    final e = KitElement.sized(kind: KitKind.timing, data: d.toJson(), color: _accent);
    return Column(
      key: const Key('lg-timing-view'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          child: Row(
            children: [
              Text('${s['cycles']}: $_cycles'),
              Expanded(child: Slider(key: const Key('lg-cycles'), value: _cycles.toDouble(), min: 2, max: 32, divisions: 30, onChanged: (x) => setState(() => _cycles = x.round()))),
            ],
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final n = e.naturalSize;
              final k = math.min(box.maxWidth / n.width, box.maxHeight / n.height);
              return Center(child: CustomPaint(size: Size(n.width * k, n.height * k), painter: _KitPainter(e)));
            },
          ),
        ),
      ],
    );
  }
}

/// A board panel drawn at a given size (the lab's timing diagram).
class _KitPainter extends CustomPainter {
  _KitPainter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size));

  @override
  bool shouldRepaint(_KitPainter old) => old.e.data != e.data;
}

/// The circuit board: the shared circuit painter in the theme's colours.
class _CircuitPainter extends CustomPainter {
  _CircuitPainter(this.c, this.v, this.selected, this.rubber, this.pal);

  final LogicCircuit c;
  final Map<String, bool> v;
  final String? selected;
  final (Offset, Offset)? rubber;
  final LogicPalette pal;

  @override
  void paint(Canvas canvas, Size size) => paintLogicParts(canvas, c, v, pal, selected: selected, rubber: rubber);

  @override
  bool shouldRepaint(_CircuitPainter old) => true;
}
