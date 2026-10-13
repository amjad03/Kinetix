import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../../logic_gates/logic_gates_lab.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import '../college/biz/kit_editors.dart' show NumField;
import 'ece_strings.dart';

/// Opens the editor of an electronics panel (logic circuit, timing diagram, signal and
/// spectrum, Bode plot, pin diagram); returns the edited panel (same id and place), or null when
/// cancelled.
Future<KitElement?> editEceKit(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: EceEditorDialog(element: e)));

/// The editor: the panel drawn live above its controls (the logic circuit opens in the full
/// builder; the timing diagram and pin diagram answer taps on the drawing).
class EceEditorDialog extends StatefulWidget {
  const EceEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<EceEditorDialog> createState() => _EceEditorDialogState();
}

class _EceEditorDialogState extends State<EceEditorDialog> {
  late final KitKind _kind = widget.element.kind;
  late final LogicCircuit _circuit = LogicCircuit.fromJson(widget.element.data);
  late final TimingDiagram _timing = TimingDiagram.fromJson(widget.element.data);
  late SignalPanel _signal = SignalPanel.fromJson(widget.element.data);
  late BodePanel _bode = BodePanel.fromJson(widget.element.data);
  late McuPinout _pins = McuPinout.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _titleOf());

  // Timing: the picked row and step; the text boxes for them.
  int _row = 0, _step = 0;
  final _rowName = TextEditingController(), _busValue = TextEditingController(), _markerLabel = TextEditingController(text: 't1');

  // Bode: the roots as typed.
  late final _polesText = TextEditingController(text: rootsText(_bode.poles));
  late final _zerosText = TextEditingController(text: rootsText(_bode.zeros));
  bool _badRoots = false;

  late final _search = TextEditingController(text: _pins.query);

  String _titleOf() => switch (_kind) {
    KitKind.logicCircuit => _circuit.title,
    KitKind.timing => _timing.title,
    KitKind.signal => _signal.title,
    KitKind.bode => _bode.title,
    KitKind.pinout => _pins.title,
    _ => '',
  };

  Map<String, Object?> get _data => switch (_kind) {
    KitKind.logicCircuit => (_circuit..title = _title.text).toJson(),
    KitKind.timing => (_timing..title = _title.text).toJson(),
    KitKind.signal => _signal.copyWith(title: _title.text).toJson(),
    KitKind.bode => _bode.copyWith(title: _title.text).toJson(),
    KitKind.pinout => _pins.copyWith(title: _title.text).toJson(),
    _ => widget.element.data,
  };

  KitElement get _current => widget.element.copyWith(data: _data);

  @override
  void initState() {
    super.initState();
    _syncRow();
  }

  @override
  void dispose() {
    for (final c in [_title, _rowName, _busValue, _markerLabel, _polesText, _zerosText, _search]) {
      c.dispose();
    }
    super.dispose();
  }

  void _syncRow() {
    if (_kind != KitKind.timing || _timing.signals.isEmpty) return;
    _row = _row.clamp(0, _timing.signals.length - 1);
    _step = _step.clamp(0, _timing.steps - 1);
    final s = _timing.signals[_row];
    _rowName.text = s.name;
    _busValue.text = s.bus ? s.values[_step] : '';
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = eceStrings(context);
    final title = TextField(key: const Key('ece-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {}));
    final actions = [
      TextButton(key: const Key('ece-cancel'), onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
      FilledButton(key: const Key('ece-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
    ];
    if (_kind == KitKind.logicCircuit) {
      final size = MediaQuery.sizeOf(context);
      return AlertDialog(
        key: const Key('ece-editor'),
        contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
        content: SizedBox(
          width: math.min(1100, size.width - 80),
          height: math.max(420, math.min(760, size.height - 200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [title, Expanded(child: LogicGatesLab(circuit: _circuit))]),
        ),
        actions: actions,
      );
    }
    final natural = KitElement.naturalSizeOf(_kind);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 780.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        Widget paint = CustomPaint(key: const Key('ece-preview'), size: size, painter: _Painter(_current));
        if (_kind == KitKind.timing || _kind == KitKind.pinout) {
          paint = GestureDetector(onTapUp: (d) => _tapPreview(d.localPosition * k, natural), child: paint);
        }
        return Center(child: paint);
      },
    );
    return AlertDialog(
      key: const Key('ece-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              title,
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s12),
              ...switch (_kind) {
                KitKind.timing => _timingControls(s),
                KitKind.signal => _signalControls(s),
                KitKind.bode => _bodeControls(s),
                KitKind.pinout => _pinControls(s),
                _ => const <Widget>[],
              },
            ],
          ),
        ),
      ),
      actions: actions,
    );
  }

  void _tapPreview(Offset p, Size natural) {
    if (_kind == KitKind.pinout) {
      final n = pinoutHit(_pins.device, natural, p);
      if (n != null) setState(() => _pins = _pins.copyWith(selected: () => n));
      return;
    }
    final g = timingGeometry(_timing, natural);
    final row = ((p.dy - g.top) / g.rowH).floor(), step = ((p.dx - g.left) / g.stepW).floor();
    if (row < 0 || row >= _timing.signals.length || step < 0 || step >= _timing.steps) return;
    setState(() {
      _row = row;
      _step = step;
      if (!_timing.signals[row].bus) _timing.cycle(row, step);
      _syncRow();
    });
  }

  Widget _labelled(String label, Widget child) => Row(mainAxisSize: MainAxisSize.min, children: [Text('$label  ', style: context.text.bodySmall), child]);

  Widget _num(String key, String label, double v, ValueChanged<double> on, {double width = 130}) => SizedBox(width: width, child: NumField(key: Key(key), value: v, label: label, onChanged: on));

  // --- Timing ------------------------------------------------------------------------------------

  List<Widget> _timingControls(FeatureStrings s) {
    final d = _timing;
    final has = d.signals.isNotEmpty;
    final sig = has ? d.signals[_row.clamp(0, d.signals.length - 1)] : null;
    void edit(VoidCallback f) => setState(() {
      f();
      _syncRow();
    });
    return [
      Text(s['tapHint'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          OutlinedButton.icon(key: const Key('timing-add-bit'), onPressed: () => edit(() {
            d.signals.add(TimingSignal(name: String.fromCharCode(0x41 + d.signals.length % 26)));
            d.fit();
            _row = d.signals.length - 1;
          }), icon: const Icon(Icons.add), label: Text(s['addBit'])),
          OutlinedButton.icon(key: const Key('timing-add-bus'), onPressed: () => edit(() {
            d.signals.add(TimingSignal(name: 'BUS', bus: true));
            d.fit();
            _row = d.signals.length - 1;
          }), icon: const Icon(Icons.add), label: Text(s['addBus'])),
          OutlinedButton.icon(key: const Key('timing-add-clock'), onPressed: () => edit(() {
            d.signals.add(TimingDiagram.clock('CLK', d.steps));
            _row = d.signals.length - 1;
          }), icon: const Icon(Icons.add), label: Text(s['addClock'])),
          _num('timing-steps', s['steps'], d.steps.toDouble(), (v) => edit(() => d.setSteps(v.round())), width: 100),
        ],
      ),
      if (sig != null) ...[
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 160,
              child: TextField(key: const Key('timing-row-name'), controller: _rowName, decoration: InputDecoration(isDense: true, labelText: s['name']), onChanged: (v) => setState(() => sig.name = v)),
            ),
            if (sig.bus)
              SizedBox(
                width: 220,
                child: TextField(
                  key: const Key('timing-bus-value'),
                  controller: _busValue,
                  decoration: InputDecoration(isDense: true, labelText: '${s['busValue']} ($_step)'),
                  onChanged: (v) => setState(() {
                    // From the picked step to where the old value ended.
                    final old = sig.values[_step];
                    for (var j = _step; j < d.steps && sig.values[j] == old; j++) {
                      sig.values[j] = v;
                    }
                  }),
                ),
              ),
            OutlinedButton.icon(key: const Key('timing-del-row'), onPressed: () => edit(() {
              d.signals.removeAt(_row);
              _row = math.max(0, _row - 1);
            }), icon: const Icon(Icons.delete_outline), label: Text(s['deleteRow'])),
          ],
        ),
      ],
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(width: 140, child: TextField(key: const Key('timing-marker-label'), controller: _markerLabel, decoration: InputDecoration(isDense: true, labelText: s['markerLabel']))),
          OutlinedButton.icon(key: const Key('timing-marker'), onPressed: () => setState(() => d.markers.add((at: _step, label: _markerLabel.text))), icon: const Icon(Icons.flag_outlined), label: Text('${s['marker']} ($_step)')),
          TextButton(key: const Key('timing-clear-markers'), onPressed: d.markers.isEmpty ? null : () => setState(d.markers.clear), child: Text(s['clearMarkers'])),
        ],
      ),
    ];
  }

  // --- Signals -----------------------------------------------------------------------------------

  List<Widget> _signalControls(FeatureStrings s) {
    final m = _signal;
    void set(SignalPanel x) => setState(() => _signal = x);
    final fields = <Widget>[
      if (m.kind != SignalKind.am && m.kind != SignalKind.fm && m.kind != SignalKind.noise) _num('sig-f1', s['f1'], m.f1, (v) => set(_signal.copyWith(f1: math.max(0, v))), width: 100),
      _num('sig-a1', s['a1'], m.a1, (v) => set(_signal.copyWith(a1: v)), width: 90),
      if (m.kind == SignalKind.sumOfSines) ...[
        _num('sig-f2', s['f2'], m.f2, (v) => set(_signal.copyWith(f2: math.max(0, v))), width: 100),
        _num('sig-a2', s['a2'], m.a2, (v) => set(_signal.copyWith(a2: v)), width: 90),
      ],
      if (m.kind == SignalKind.am || m.kind == SignalKind.fm) ...[
        _num('sig-fc', s['fc'], m.fc, (v) => set(_signal.copyWith(fc: math.max(0, v))), width: 130),
        _num('sig-fm', s['fm'], m.fm, (v) => set(_signal.copyWith(fm: math.max(0, v))), width: 130),
      ],
      if (m.kind == SignalKind.am) _num('sig-m', s['m'], m.m, (v) => set(_signal.copyWith(m: math.max(0, v))), width: 110),
      if (m.kind == SignalKind.fm) _num('sig-beta', s['beta'], m.beta, (v) => set(_signal.copyWith(beta: math.max(0, v))), width: 110),
      if (m.kind != SignalKind.noise) _num('sig-noise', s['noise'], m.noise, (v) => set(_signal.copyWith(noise: math.max(0, v))), width: 90),
      _num('sig-fs', s['fs'], m.fs, (v) => set(_signal.copyWith(fs: math.max(1, v))), width: 130),
    ];
    return [
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['signal'], DropdownButton<SignalKind>(
            key: const Key('sig-kind'),
            value: m.kind,
            items: [for (final k in SignalKind.values) DropdownMenuItem(value: k, child: Text(signalKindName(k)))],
            onChanged: (k) => set(_signal.copyWith(kind: k)),
          )),
          _labelled(s['points'], DropdownButton<int>(
            key: const Key('sig-n'),
            value: m.n,
            items: [for (final n in const [32, 64, 128, 256, 512, 1024]) DropdownMenuItem(value: n, child: Text('$n'))],
            onChanged: (n) => set(_signal.copyWith(n: n)),
          )),
          _labelled(s['window'], DropdownButton<WindowKind>(
            key: const Key('sig-window'),
            value: m.window,
            items: [for (final w in WindowKind.values) DropdownMenuItem(value: w, child: Text(windowName(w)))],
            onChanged: (w) => set(_signal.copyWith(window: w)),
          )),
          FilterChip(key: const Key('sig-phase'), label: Text(s['phase']), selected: m.showPhase, onSelected: (v) => set(_signal.copyWith(showPhase: v))),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Wrap(spacing: Kx.s12, runSpacing: Kx.s8, children: fields),
      const SizedBox(height: Kx.s8),
      Text(s['fs'], style: context.text.bodySmall),
      Slider(key: const Key('sig-fs-slider'), value: m.fs.clamp(4, 1024).toDouble(), min: 4, max: 1024, label: '${m.fs.round()} Hz', onChanged: (v) => set(_signal.copyWith(fs: v.roundToDouble()))),
      Text(s['aliasNote'], key: const Key('sig-alias-note'), style: context.text.bodySmall?.copyWith(color: m.aliased.isEmpty ? null : Theme.of(context).colorScheme.error)),
    ];
  }

  // --- Bode --------------------------------------------------------------------------------------

  List<Widget> _bodeControls(FeatureStrings s) {
    final m = _bode;
    void set(BodePanel x) => setState(() => _bode = x);
    void roots() {
      try {
        set(_bode.copyWith(poles: parseRoots(_polesText.text), zeros: parseRoots(_zerosText.text)));
        _badRoots = false;
      } on FormatException {
        setState(() => _badRoots = true);
      }
    }

    final c = m.corners;
    final at = c.isEmpty ? null : c.first;
    final unit = m.hz ? 'Hz' : 'rad/s';
    return [
      SegmentedButton<BodeMode>(
        key: const Key('bode-mode'),
        segments: [ButtonSegment(value: BodeMode.standard, label: Text(s['standard'])), ButtonSegment(value: BodeMode.polesZeros, label: Text(s['polesZeros']))],
        selected: {m.mode},
        onSelectionChanged: (v) => set(_bode.copyWith(mode: v.first)),
      ),
      const SizedBox(height: Kx.s8),
      if (m.mode == BodeMode.standard)
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _labelled(s['filter'], DropdownButton<FilterKind>(
              key: const Key('bode-filter'),
              value: m.filter,
              items: [for (final f in FilterKind.values) DropdownMenuItem(value: f, child: Text(filterName(f)))],
              onChanged: (f) => set(_bode.copyWith(filter: f)),
            )),
            _num('bode-fc', s['cornerHz'], m.fc, (v) => set(_bode.copyWith(fc: math.max(1e-3, v))), width: 140),
            if (m.filter.index >= 2) _num('bode-zeta', s['zeta'], m.zeta, (v) => set(_bode.copyWith(zeta: v.clamp(0.01, 10.0))), width: 110),
            _num('bode-k', s['gain'], m.k, (v) => set(_bode.copyWith(k: v == 0 ? 1 : v)), width: 100),
          ],
        )
      else
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s8,
          children: [
            SizedBox(width: 240, child: TextField(key: const Key('bode-poles'), controller: _polesText, decoration: InputDecoration(isDense: true, labelText: s['poles'], hintText: s['rootsHint']), onChanged: (_) => roots())),
            SizedBox(width: 240, child: TextField(key: const Key('bode-zeros'), controller: _zerosText, decoration: InputDecoration(isDense: true, labelText: s['zeros'], hintText: s['rootsHint']), onChanged: (_) => roots())),
            _num('bode-k', s['gain'], m.k, (v) => set(_bode.copyWith(k: v == 0 ? 1 : v)), width: 100),
          ],
        ),
      if (_badRoots) Text(s['badRoots'], key: const Key('bode-bad'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
      FilterChip(key: const Key('bode-asym'), label: Text(s['asymptotes']), selected: m.showAsymptotes, onSelected: (v) => set(_bode.copyWith(showAsymptotes: v))),
      if (at != null)
        Padding(
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Text(
            '${s['atCorner']} (${_fmt(m.hz ? at / (2 * math.pi) : at)} $unit): |H| = ${m.magDb(at).toStringAsFixed(2)} dB, ∠H = ${m.phaseDeg(at).toStringAsFixed(1)}°',
            key: const Key('bode-readout'),
          ),
        ),
    ];
  }

  static String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsPrecision(4);

  // --- Pins --------------------------------------------------------------------------------------

  List<Widget> _pinControls(FeatureStrings s) {
    final m = _pins;
    void set(McuPinout x) => setState(() => _pins = x);
    final chip = m.device;
    final shown = chip.pins.where(m.shows).toList();
    final sel = m.selected == null ? null : chip.pin(m.selected!);
    return [
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['chip'], DropdownButton<String>(
            key: const Key('pin-chip'),
            value: m.chip,
            items: [for (final c in mcuChips) DropdownMenuItem(value: c.id, child: Text(c.name))],
            onChanged: (id) => set(_pins.copyWith(chip: id, selected: () => null)),
          )),
          SizedBox(
            width: 300,
            child: TextField(key: const Key('pin-search'), controller: _search, decoration: InputDecoration(isDense: true, prefixIcon: const Icon(Icons.search), labelText: s['search']), onChanged: (v) => set(_pins.copyWith(query: v))),
          ),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          ChoiceChip(key: const Key('pin-type-all'), label: Text(s['allTypes']), selected: m.filter == null, onSelected: (_) => set(_pins.copyWith(filter: () => null))),
          for (final t in PinType.values)
            ChoiceChip(
              key: Key('pin-type-${t.name}'),
              avatar: CircleAvatar(backgroundColor: pinTypeColors[t], radius: 6),
              label: Text(pinTypeName(t)),
              selected: m.filter == t,
              onSelected: (_) => set(_pins.copyWith(filter: () => m.filter == t ? null : t)),
            ),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Text(sel == null ? s['noPin'] : 'Pin ${sel.number} · ${sel.name}: ${sel.functions.join(', ')}', key: const Key('pin-detail'), style: context.text.titleSmall),
      const SizedBox(height: Kx.s8),
      SizedBox(
        height: 200,
        child: ListView(
          children: [
            for (final p in shown)
              ListTile(
                key: Key('pin-${p.number}'),
                dense: true,
                selected: p.number == m.selected,
                leading: CircleAvatar(radius: 14, backgroundColor: pinTypeColors[p.primary], child: Text('${p.number}', style: const TextStyle(color: Colors.white, fontSize: 11))),
                title: Text(p.name),
                subtitle: Text(p.functions.join(', '), maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () => set(_pins.copyWith(selected: () => p.number)),
              ),
          ],
        ),
      ),
      Text(s['verify'], style: context.text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error)),
    ];
  }
}

class _Painter extends CustomPainter {
  _Painter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size));

  @override
  bool shouldRepaint(_Painter old) => true;
}
