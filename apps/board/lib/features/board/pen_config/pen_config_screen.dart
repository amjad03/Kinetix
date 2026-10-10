import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/board_controller.dart';
import 'pen_config_strings.dart';

/// Pen configuration: how touch sizes tell pen, finger and palm apart (generic IFP), the active
/// stylus (pressure, eraser end, barrel buttons), two pens with their own colours, touch
/// calibration and a test area. Everything is saved per device ([BoardController.inputConfig]).
class PenConfigScreen extends StatelessWidget {
  const PenConfigScreen({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    return DefaultTabController(
      length: 5,
      child: Scaffold(
        key: const Key('pen-config'),
        appBar: AppBar(
          title: Text(s('title')),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(key: const Key('cfg-tab-touch'), text: s('touch')),
              Tab(key: const Key('cfg-tab-stylus'), text: s('stylus')),
              Tab(key: const Key('cfg-tab-dual'), text: s('dual')),
              Tab(key: const Key('cfg-tab-calibrate'), text: s('calibrate')),
              Tab(key: const Key('cfg-tab-test'), text: s('test')),
            ],
          ),
        ),
        body: TabBarView(
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _TouchTab(board: board),
            _StylusTab(board: board),
            _DualTab(board: board),
            CalibrationPad(board: board),
            TestArea(board: board),
          ],
        ),
      ),
    );
  }
}

/// Opens the pen configuration screen.
Future<void> openPenConfig(BuildContext context, BoardController board) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PenConfigScreen(board: board)));

// --- Generic IFP touch -------------------------------------------------------------------------

class _TouchTab extends StatefulWidget {
  const _TouchTab({required this.board});
  final BoardController board;

  @override
  State<_TouchTab> createState() => _TouchTabState();
}

class _TouchTabState extends State<_TouchTab> {
  InputConfig get cfg => widget.board.inputConfig;
  int _step = -1; // -1 idle, 0 pen, 1 finger, 2 palm
  final _samples = <List<double>>[[], [], []];

  void _set({double? penMax, double? palmMin, bool? autoLearn}) {
    setState(() => cfg.setThresholds(penMax: penMax, palmMin: palmMin, autoLearn: autoLearn));
    widget.board.saveInputConfig();
  }

  void _next() {
    if (_step < 2) {
      setState(() => _step++);
      return;
    }
    cfg.learn(pen: _samples[0], finger: _samples[1], palm: _samples[2]);
    widget.board.saveInputConfig();
    setState(() => _step = -1);
  }

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    return ListView(
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Text(s('touchHint')),
        SwitchListTile(
          key: const Key('cfg-autolearn'),
          title: Text(s('autoLearn')),
          subtitle: Text(s('autoLearnHint')),
          value: cfg.autoLearn,
          onChanged: (v) => _set(autoLearn: v),
        ),
        Text('${s('penMax')}: ${cfg.penMax <= 0 ? s('off') : cfg.penMax.toStringAsFixed(0)}'),
        Slider(key: const Key('cfg-penmax'), value: cfg.penMax.clamp(0, 40), max: 40, divisions: 40, onChanged: (v) => _set(penMax: v)),
        Text('${s('palmMin')}: ${cfg.palmMin <= 0 ? s('auto') : cfg.palmMin.toStringAsFixed(0)}'),
        Slider(key: const Key('cfg-palmmin'), value: cfg.palmMin.clamp(0, 120), max: 120, divisions: 60, onChanged: (v) => _set(palmMin: v)),
        const Divider(),
        Text(s('learn'), style: Theme.of(context).textTheme.titleMedium),
        if (_step < 0)
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              key: const Key('cfg-learn-start'),
              onPressed: () => setState(() {
                for (final l in _samples) {
                  l.clear();
                }
                _step = 0;
              }),
              child: Text(s('learnStart')),
            ),
          )
        else ...[
          Text(s(const ['learnPen', 'learnFinger', 'learnPalm'][_step])),
          const SizedBox(height: Kx.s8),
          Listener(
            onPointerDown: (e) {
              if (e.radiusMajor > 0) setState(() => _samples[_step].add(e.radiusMajor));
            },
            child: Container(
              key: const Key('cfg-learn-pad'),
              height: 160,
              alignment: Alignment.center,
              decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outline), borderRadius: BorderRadius.circular(Kx.s12)),
              child: Text('${s('samples')}: ${_samples[_step].length}'),
            ),
          ),
          const SizedBox(height: Kx.s8),
          FilledButton(key: const Key('cfg-learn-next'), onPressed: _next, child: Text(_step < 2 ? s('next') : s('finish'))),
        ],
      ],
    );
  }
}

// --- Active stylus -----------------------------------------------------------------------------

class _StylusTab extends StatefulWidget {
  const _StylusTab({required this.board});
  final BoardController board;

  @override
  State<_StylusTab> createState() => _StylusTabState();
}

class _StylusTabState extends State<_StylusTab> {
  InputConfig get cfg => widget.board.inputConfig;

  void _apply(StylusConfig v) {
    setState(() => cfg.stylus = v);
    widget.board.saveInputConfig();
  }

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    final st = cfg.stylus;
    Widget action(Key key, String label, ButtonAction value, ValueChanged<ButtonAction> on) => ListTile(
      title: Text(label),
      trailing: DropdownButton<ButtonAction>(
        key: key,
        value: value,
        items: [for (final a in ButtonAction.values) DropdownMenuItem(value: a, child: Text(s('act.${a.name}')))],
        onChanged: (a) => on(a ?? value),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        SwitchListTile(key: const Key('cfg-pressure'), title: Text(s('pressure')), subtitle: Text(s('pressureHint')), value: st.pressure, onChanged: (v) => _apply(st.copyWith(pressure: v))),
        SwitchListTile(key: const Key('cfg-eraser-end'), title: Text(s('eraserEnd')), subtitle: Text(s('eraserEndHint')), value: st.eraserEnd, onChanged: (v) => _apply(st.copyWith(eraserEnd: v))),
        action(const Key('cfg-btn1'), s('button1'), st.primaryButton, (a) => _apply(st.copyWith(primaryButton: a))),
        action(const Key('cfg-btn2'), s('button2'), st.secondaryButton, (a) => _apply(st.copyWith(secondaryButton: a))),
      ],
    );
  }
}

// --- Dual pens ---------------------------------------------------------------------------------

const _dualColours = [Color(0xFF202124), Color(0xFF1A73E8), Color(0xFFD93025), Color(0xFF1E8E3E), Color(0xFFF9AB00), Color(0xFF9334E6)];

class _DualTab extends StatefulWidget {
  const _DualTab({required this.board});
  final BoardController board;

  @override
  State<_DualTab> createState() => _DualTabState();
}

class _DualTabState extends State<_DualTab> {
  InputConfig get cfg => widget.board.inputConfig;

  void _apply(DualPens v) {
    setState(() => cfg.dual = v);
    widget.board.saveInputConfig();
  }

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    final d = cfg.dual;
    Widget panel(String key, String title, Color current, ValueChanged<Color> on) => Card(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              children: [
                for (final c in _dualColours)
                  GestureDetector(
                    key: Key('$key-${c.toARGB32().toRadixString(16)}'),
                    onTap: () => on(c),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(width: c == current ? 4 : 1, color: Theme.of(context).colorScheme.outline)),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        SwitchListTile(key: const Key('cfg-dual'), title: Text(s('dualOn')), subtitle: Text(s('dualHint')), value: d.enabled, onChanged: (v) => _apply(d.copyWith(enabled: v))),
        panel('dual1', s('pen1'), d.first, (c) => _apply(d.copyWith(first: c))),
        panel('dual2', s('pen2'), d.second, (c) => _apply(d.copyWith(second: c))),
        Text('${s('tipSplit')}: ${d.tipSplit <= 0 ? s('byOrder') : d.tipSplit.toStringAsFixed(0)}'),
        Slider(key: const Key('cfg-tipsplit'), value: d.tipSplit.clamp(0, 40), max: 40, divisions: 40, onChanged: (v) => _apply(d.copyWith(tipSplit: v))),
      ],
    );
  }
}

// --- Calibration -------------------------------------------------------------------------------

/// Touch offset calibration: touch each target in turn; the average miss is saved for this
/// device and applied to every touch on the board.
class CalibrationPad extends StatefulWidget {
  const CalibrationPad({super.key, required this.board});
  final BoardController board;

  @override
  State<CalibrationPad> createState() => _CalibrationPadState();
}

class _CalibrationPadState extends State<CalibrationPad> {
  /// Target positions as fractions of the pad.
  static const _targets = [Offset(0.1, 0.12), Offset(0.9, 0.12), Offset(0.5, 0.5), Offset(0.1, 0.88), Offset(0.9, 0.88)];
  final _samples = <(Offset, Offset)>[];

  void _touch(Offset raw, Size size) {
    if (_samples.length >= _targets.length) return;
    final t = Offset(_targets[_samples.length].dx * size.width, _targets[_samples.length].dy * size.height);
    setState(() => _samples.add((t, raw)));
    if (_samples.length == _targets.length) {
      widget.board.inputConfig.calibration = TouchCalibration.fromSamples(_samples);
      widget.board.saveInputConfig();
    }
  }

  void _reset() {
    setState(_samples.clear);
    widget.board.inputConfig.calibration = const TouchCalibration();
    widget.board.saveInputConfig();
  }

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    final shift = widget.board.inputConfig.calibration.shift;
    final done = _samples.length >= _targets.length;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(Kx.s12),
          child: Row(
            children: [
              Expanded(child: Text(done ? '${s('calibrated')}: ${shift.dx.toStringAsFixed(1)}, ${shift.dy.toStringAsFixed(1)}' : '${s('calibrateHint')} (${_samples.length}/${_targets.length})', key: const Key('cfg-cal-status'))),
              OutlinedButton(key: const Key('cfg-cal-reset'), onPressed: _reset, child: Text(s('reset'))),
            ],
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) => Listener(
              key: const Key('cfg-cal-pad'),
              behavior: HitTestBehavior.opaque,
              onPointerDown: (e) => _touch(e.localPosition, box.biggest),
              child: CustomPaint(
                size: box.biggest,
                painter: _TargetsPainter([for (final t in _targets) Offset(t.dx * box.maxWidth, t.dy * box.maxHeight)], _samples.length, Theme.of(context).colorScheme.primary),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TargetsPainter extends CustomPainter {
  _TargetsPainter(this.targets, this.current, this.colour);
  final List<Offset> targets;
  final int current;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    for (final (i, t) in targets.indexed) {
      final p = Paint()
        ..color = i < current ? colour.withValues(alpha: 0.25) : (i == current ? colour : colour.withValues(alpha: 0.5))
        ..style = i == current ? PaintingStyle.fill : PaintingStyle.stroke
        ..strokeWidth = 3;
      canvas.drawCircle(t, i == current ? 14 : 22, p);
      canvas.drawLine(t - const Offset(30, 0), t + const Offset(30, 0), p);
      canvas.drawLine(t - const Offset(0, 30), t + const Offset(0, 30), p);
    }
  }

  @override
  bool shouldRepaint(_TargetsPainter old) => old.current != current;
}

// --- Test area ---------------------------------------------------------------------------------

/// A scratch pad that draws every touch and tells what the board sees: pen, finger or palm,
/// size, pressure, tilt and barrel buttons (with this device's calibration applied).
class TestArea extends StatefulWidget {
  const TestArea({super.key, required this.board});
  final BoardController board;

  @override
  State<TestArea> createState() => _TestAreaState();
}

class _TestAreaState extends State<TestArea> {
  final _palm = PalmDetector();
  final _lines = <int, List<Offset>>{};
  final _colours = <int, Color>{};
  String _readout = '';

  void _see(PointerEvent e, {bool down = false}) {
    final cfg = widget.board.inputConfig;
    final s = PenConfigStrings.of(context);
    final pos = e.kind == PointerDeviceKind.touch ? cfg.position(e.localPosition) : e.localPosition;
    final isPen = e.kind == PointerDeviceKind.stylus || e.kind == PointerDeviceKind.invertedStylus;
    final cls = isPen ? ContactClass.pen : (e.kind == PointerDeviceKind.touch ? cfg.classify(e.radiusMajor, learnedPalm: _palm.isPalm) : ContactClass.finger);
    if (down) {
      _lines[e.pointer] = [];
      _colours[e.pointer] = switch (cls) {
        ContactClass.pen => const Color(0xFF1A73E8),
        ContactClass.finger => const Color(0xFF1E8E3E),
        ContactClass.palm => const Color(0xFFD93025),
      };
    }
    _lines[e.pointer]?.add(pos);
    final end = e.kind == PointerDeviceKind.invertedStylus ? s('eraserEndName') : '';
    final pressure = e.pressureMax > e.pressureMin ? ((e.pressure - e.pressureMin) / (e.pressureMax - e.pressureMin)).toStringAsFixed(2) : '-';
    setState(
      () => _readout = '${s('class.${cls.name}')} $end · ${s('size')} ${e.radiusMajor.toStringAsFixed(1)} · ${s('pressureName')} $pressure · ${s('tilt')} ${e.tilt.toStringAsFixed(2)} · ${s('buttons')} ${e.buttons}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = PenConfigStrings.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(Kx.s12),
          child: Row(
            children: [
              Expanded(child: Text(_readout.isEmpty ? s('testHint') : _readout, key: const Key('cfg-test-readout'))),
              OutlinedButton(key: const Key('cfg-test-clear'), onPressed: () => setState(() {
                _lines.clear();
                _readout = '';
              }), child: Text(s('clear'))),
            ],
          ),
        ),
        Expanded(
          child: Listener(
            key: const Key('cfg-test-pad'),
            behavior: HitTestBehavior.opaque,
            onPointerDown: (e) => _see(e, down: true),
            onPointerMove: _see,
            child: CustomPaint(size: Size.infinite, painter: _LinesPainter({for (final k in _lines.keys) k: (_lines[k]!, _colours[k]!)})),
          ),
        ),
      ],
    );
  }
}

class _LinesPainter extends CustomPainter {
  _LinesPainter(this.lines);
  final Map<int, (List<Offset>, Color)> lines;

  @override
  void paint(Canvas canvas, Size size) {
    for (final (pts, c) in lines.values) {
      final p = Paint()
        ..color = c
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round;
      for (var i = 1; i < pts.length; i++) {
        canvas.drawLine(pts[i - 1], pts[i], p);
      }
      if (pts.length == 1) canvas.drawCircle(pts.first, 3, p);
    }
  }

  @override
  bool shouldRepaint(_LinesPainter old) => true;
}
