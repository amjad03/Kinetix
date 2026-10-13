import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import '../college/biz/kit_editors.dart' show NumField;
import 'eee_strings.dart';

/// Opens the editor of an electrical engineering panel (RLC and phasors, three-phase, single-line
/// diagram, waveform generator); returns the edited panel (same id and place), or null when
/// cancelled.
Future<KitElement?> editEeeKit(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: EeeEditorDialog(element: e)));

/// The editor: the panel drawn live, worked out, above its controls. The phasors turn while
/// "Animate" is on; on the single-line diagram buses and elements drag and snap to the buses.
class EeeEditorDialog extends StatefulWidget {
  const EeeEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<EeeEditorDialog> createState() => _EeeEditorDialogState();
}

class _EeeEditorDialogState extends State<EeeEditorDialog> with SingleTickerProviderStateMixin {
  late final KitKind _kind = widget.element.kind;
  late RlcCircuit _rlc = RlcCircuit.fromJson(widget.element.data);
  late ThreePhase _three = ThreePhase.fromJson(widget.element.data);
  late SingleLineDiagram _sld = SingleLineDiagram.fromJson(widget.element.data);
  late WaveformPanel _wave = WaveformPanel.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _titleOf());

  // Animation: the phasors turn at 60°/s while it runs.
  late final Ticker _ticker = createTicker(_tick);
  Duration _last = Duration.zero;

  // The per-unit calculator.
  double _zOld = 0.2, _mvaOld = 50, _kvOld = 11, _mvaNew = 100, _kvNew = 11;

  // A bus (b) or element (e) held on the single-line diagram.
  ({bool bus, int index})? _held;

  String _titleOf() => switch (_kind) {
    KitKind.rlc => _rlc.title,
    KitKind.threePhase => _three.title,
    KitKind.singleLine => _sld.title,
    KitKind.waveform => _wave.title,
    _ => '',
  };

  Map<String, Object?> get _data => switch (_kind) {
    KitKind.rlc => _rlc.copyWith(title: _title.text).toJson(),
    KitKind.threePhase => _three.copyWith(title: _title.text).toJson(),
    KitKind.singleLine => _sld.copyWith(title: _title.text).toJson(),
    KitKind.waveform => _wave.copyWith(title: _title.text).toJson(),
    _ => widget.element.data,
  };

  KitElement get _current => widget.element.copyWith(data: _data);

  @override
  void dispose() {
    _ticker.dispose();
    _title.dispose();
    super.dispose();
  }

  void _tick(Duration now) {
    final dt = (now - _last).inMicroseconds / 1e6;
    _last = now;
    final step = 60 * dt;
    setState(() {
      if (_kind == KitKind.rlc) _rlc = _rlc.copyWith(wt: (_rlc.wt + step) % 360);
      if (_kind == KitKind.threePhase) _three = _three.copyWith(wt: (_three.wt + step) % 360);
    });
  }

  void _animate(bool on) {
    setState(() {
      if (on) {
        _last = Duration.zero;
        _ticker.start();
      } else {
        _ticker.stop();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = eeeStrings(context);
    final natural = KitElement.naturalSizeOf(_kind);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 780.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        Widget paint = CustomPaint(key: const Key('eee-preview'), size: size, painter: _Painter(_current));
        if (_kind == KitKind.singleLine) {
          paint = RawGestureDetector(
            gestures: {
              _GrabDrag: GestureRecognizerFactoryWithHandlers<_GrabDrag>(() => _GrabDrag((p) => _hit(p * k, natural) != null), (r) {
                r
                  ..onStart = (d) {
                    _held = _hit(d.localPosition * k, natural);
                  }
                  ..onUpdate = (d) {
                    _drag(d.localPosition * k, natural);
                  }
                  ..onEnd = (_) {
                    _held = null;
                  };
              }),
            },
            child: paint,
          );
        }
        return Center(child: paint);
      },
    );
    return AlertDialog(
      key: const Key('eee-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('eee-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s12),
              ...switch (_kind) {
                KitKind.rlc => _rlcControls(s),
                KitKind.threePhase => _threeControls(s),
                KitKind.singleLine => _sldControls(s),
                KitKind.waveform => _waveControls(s),
                _ => const <Widget>[],
              },
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('eee-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  Widget _labelled(String label, Widget child) => Row(mainAxisSize: MainAxisSize.min, children: [Text('$label  ', style: context.text.bodySmall), child]);

  Widget _num(String key, String label, double v, ValueChanged<double> on, {double width = 130}) => SizedBox(width: width, child: NumField(key: Key(key), value: v, label: label, onChanged: on));

  Widget _animateSwitch(FeatureStrings s) => SwitchListTile(
    key: const Key('eee-animate'),
    contentPadding: EdgeInsets.zero,
    title: Text(s['animate']),
    value: _ticker.isActive,
    onChanged: _animate,
  );

  // --- RLC ---------------------------------------------------------------------------------------

  List<Widget> _rlcControls(FeatureStrings s) {
    final m = _rlc;
    void set(RlcCircuit x) => setState(() => _rlc = x);
    final res = m.solve();
    final f0 = m.resonance;
    final fTop = math.max(200.0, (f0 ?? 0) * 3).roundToDouble();
    return [
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['circuit'], DropdownButton<RlcTopology>(
            key: const Key('rlc-topology'),
            value: m.topology,
            items: [DropdownMenuItem(value: RlcTopology.series, child: Text(s['series'])), DropdownMenuItem(value: RlcTopology.parallel, child: Text(s['parallel']))],
            onChanged: (t) => set(_rlc.copyWith(topology: t)),
          )),
          _num('rlc-r', s['r'], m.r, (v) => set(_rlc.copyWith(r: math.max(0, v))), width: 100),
          _num('rlc-l', s['l'], m.l * 1000, (v) => set(_rlc.copyWith(l: math.max(0, v) / 1000)), width: 110),
          _num('rlc-c', s['c'], m.c * 1e6, (v) => set(_rlc.copyWith(c: math.max(0, v) / 1e6)), width: 110),
          _num('rlc-f', s['f'], m.f, (v) => set(_rlc.copyWith(f: math.max(0, v))), width: 100),
          _num('rlc-v', s['v'], m.v, (v) => set(_rlc.copyWith(v: math.max(0, v))), width: 100),
        ],
      ),
      Text(s['frequency'], style: context.text.bodySmall),
      Slider(key: const Key('rlc-f-slider'), value: m.f.clamp(1, fTop).toDouble(), min: 1, max: fTop, label: '${eeeNum(m.f)} Hz', onChanged: (v) => set(_rlc.copyWith(f: v.roundToDouble()))),
      if (f0 != null)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(key: const Key('rlc-at-resonance'), onPressed: () => set(_rlc.copyWith(f: double.parse(f0.toStringAsFixed(2)))), icon: const Icon(Icons.vertical_align_center), label: Text(s['atResonance'])),
        ),
      Wrap(
        spacing: Kx.s8,
        children: [
          FilterChip(key: const Key('rlc-response'), label: Text(s['response']), selected: m.showResponse, onSelected: (v) => set(_rlc.copyWith(showResponse: v))),
          FilterChip(key: const Key('rlc-triangle'), label: Text(s['powerTriangle']), selected: m.showTriangle, onSelected: (v) => set(_rlc.copyWith(showTriangle: v))),
        ],
      ),
      _animateSwitch(s),
      Text(s['rotate'], style: context.text.bodySmall),
      Slider(key: const Key('rlc-wt'), value: m.wt % 360, max: 360, onChanged: (v) => set(_rlc.copyWith(wt: v))),
      Text(
        '|Z| = ${eeeNum(res.z)} Ω   φ = ${eeeNum(res.phi)}°   I = ${eeeNum(res.i)} A   pf = ${res.pf.toStringAsFixed(3)}${f0 == null ? '' : '   f₀ = ${eeeNum(f0)} Hz'}',
        key: const Key('rlc-result'),
        style: context.text.titleMedium,
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  // --- Three-phase -------------------------------------------------------------------------------

  List<Widget> _threeControls(FeatureStrings s) {
    final m = _three;
    void set(ThreePhase x) => setState(() => _three = x);
    return [
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['connection'], DropdownButton<ThreePhaseConnection>(
            key: const Key('three-conn'),
            value: m.connection,
            items: [DropdownMenuItem(value: ThreePhaseConnection.star, child: Text(s['star'])), DropdownMenuItem(value: ThreePhaseConnection.delta, child: Text(s['delta']))],
            onChanged: (c) => set(_three.copyWith(connection: c)),
          )),
          _num('three-vl', s['vLine'], m.vLine, (v) => set(_three.copyWith(vLine: math.max(0, v))), width: 140),
          _num('three-z', s['zPhase'], m.zPhase, (v) => set(_three.copyWith(zPhase: math.max(1e-6, v))), width: 140),
          _num('three-phi', s['phi'], m.phi, (v) => set(_three.copyWith(phi: v.clamp(-90, 90).toDouble())), width: 150),
        ],
      ),
      Slider(key: const Key('three-phi-slider'), value: m.phi.clamp(-90, 90).toDouble(), min: -90, max: 90, divisions: 180, label: 'φ = ${eeeNum(m.phi)}°', onChanged: (v) => set(_three.copyWith(phi: v))),
      FilterChip(key: const Key('three-line'), label: Text(m.star ? s['showLineV'] : s['showLineI']), selected: m.showLine, onSelected: (v) => set(_three.copyWith(showLine: v))),
      _animateSwitch(s),
      Text(
        'V_ph = ${eeeNum(m.vPhase)} V   I_ph = ${eeeNum(m.iPhase)} A   I_L = ${eeeNum(m.iLine)} A   P = ${eeeSi(m.power, 'W')}',
        key: const Key('three-result'),
        style: context.text.titleMedium,
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  // --- Single-line diagram -----------------------------------------------------------------------

  /// What is under [p] (panel coordinates): an element's symbol first, else a bus bar.
  ({bool bus, int index})? _hit(Offset p, Size natural) {
    final f = SldFrame(natural);
    for (final (i, e) in _sld.elements.indexed) {
      if ((f.centre(_sld, e) - p).distance < 34) return (bus: false, index: i);
    }
    for (final (i, b) in _sld.buses.indexed) {
      if ((f.busX(b.x) - p.dx).abs() < 14 && p.dy > f.top - 30 && p.dy < f.bottom + 30) return (bus: true, index: i);
    }
    return null;
  }

  void _drag(Offset p, Size natural) {
    final h = _held;
    if (h == null) return;
    final f = SldFrame(natural);
    final d = _sld;
    if (h.bus) {
      setState(() => _sld = d.copyWith(buses: [for (final (i, b) in d.buses.indexed) i == h.index ? b.copyWith(x: f.fracX(p.dx)) : b]));
      return;
    }
    final e = d.elements[h.index];
    final x = f.fracX(p.dx), y = f.fracY(p.dy);
    SldElement moved;
    if (e.series) {
      // Snap into the branch between the two buses either side.
      final pair = d.busesAround(x);
      moved = pair == null ? e.copyWith(y: y) : e.copyWith(a: pair.$1, b: pair.$2, y: y);
    } else {
      // Snap to the nearest bus, on the side it was dropped.
      final bus = d.nearestBus(x);
      moved = bus < 0 ? e.copyWith(y: y) : e.copyWith(a: bus, side: p.dx < f.busX(d.buses[bus].x) ? -1 : 1, y: y);
    }
    // A series element moved sets its branch's row: the first of the branch takes the height.
    final elements = [for (final (i, x) in d.elements.indexed) i == h.index ? moved : x];
    if (moved.series) {
      final first = elements.indexWhere((x) => x.series && {x.a, x.b}.containsAll({moved.a, moved.b}));
      if (first >= 0 && first != h.index) elements[first] = elements[first].copyWith(y: y);
    }
    setState(() => _sld = d.copyWith(elements: elements));
  }

  List<Widget> _sldControls(FeatureStrings s) {
    final d = _sld;
    void set(SingleLineDiagram x) => setState(() => _sld = x);
    final fault = d.fault();
    final kinds = {
      SldKind.generator: (s['generator'], Icons.circle_outlined),
      SldKind.transformer: (s['transformer'], Icons.join_inner),
      SldKind.line: (s['line'], Icons.horizontal_rule),
      SldKind.load: (s['load'], Icons.arrow_forward),
      SldKind.motor: (s['motor'], Icons.settings_outlined),
      SldKind.breaker: (s['breaker'], Icons.check_box_outline_blank),
      SldKind.isolator: (s['isolator'], Icons.call_split),
    };
    String busName(int i) => i >= 0 && i < d.buses.length ? d.buses[i].name : '—';
    void setElement(int i, SldElement e) => set(_sld.copyWith(elements: [for (final (j, x) in _sld.elements.indexed) j == i ? e : x]));
    void setBus(int i, SldBus b) => set(_sld.copyWith(buses: [for (final (j, x) in _sld.buses.indexed) j == i ? b : x]));
    void add(SldKind k) {
      final n = d.elements.where((e) => e.kind == k).length + 1;
      final prefix = switch (k) {
        SldKind.generator => 'G',
        SldKind.transformer => 'T',
        SldKind.line => 'L',
        SldKind.load => 'Load ',
        SldKind.motor => 'M',
        SldKind.breaker => 'CB',
        SldKind.isolator => 'Isolator ',
      };
      final series = sldSeries(k);
      final pair = d.busesAround(0.5);
      final e = SldElement(
        k,
        '$prefix$n',
        a: series ? (pair?.$1 ?? 0) : (k == SldKind.generator ? 0 : math.max(0, d.buses.length - 1)),
        b: series ? (pair?.$2 ?? -1) : -1,
        side: k == SldKind.generator ? -1 : 1,
        y: 0.25 + 0.1 * (n % 5),
        mva: k == SldKind.load ? 20 : 100,
        kv: d.buses.isEmpty ? 11 : d.buses.first.kv,
        x: k == SldKind.transformer ? 0.1 : 0.15,
        ohms: k == SldKind.line ? 10 : 0,
      );
      set(d.copyWith(elements: [...d.elements, e]));
    }

    return [
      Text(s['dragSld'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _num('sld-mva', s['baseMva'], d.baseMva, (v) => set(_sld.copyWith(baseMva: math.max(0.001, v))), width: 140),
          _num('sld-e', s['prefault'], d.prefault, (v) => set(_sld.copyWith(prefault: math.max(0, v))), width: 140),
          _labelled(s['faultAt'], DropdownButton<int>(
            key: const Key('sld-fault'),
            value: d.faultBus >= 0 && d.faultBus < d.buses.length ? d.faultBus : -1,
            items: [DropdownMenuItem(value: -1, child: Text(s['none'])), for (final (i, b) in d.buses.indexed) DropdownMenuItem(value: i, child: Text(b.name))],
            onChanged: (v) => set(_sld.copyWith(faultBus: v)),
          )),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        children: [
          ActionChip(
            key: const Key('sld-add-bus'),
            avatar: const Icon(Icons.add, size: 18),
            label: Text(s['bus']),
            onPressed: () => set(d.copyWith(buses: [...d.buses, SldBus('Bus ${d.buses.length + 1}', kv: d.buses.isEmpty ? 11 : d.buses.last.kv, x: d.buses.isEmpty ? 0.5 : math.min(1, d.buses.map((b) => b.x).reduce(math.max) + 0.2))])),
          ),
          for (final MapEntry(key: k, value: (label, icon)) in kinds.entries) ActionChip(key: Key('sld-add-${k.name}'), avatar: Icon(icon, size: 18), label: Text(label), onPressed: () => add(k)),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Text(s['buses'], style: context.text.titleSmall),
      for (final (i, b) in d.buses.indexed)
        Padding(
          key: ValueKey('sld-bus-$i-${d.buses.length}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(width: 120, child: _TextCell(key: Key('sld-bus-name-$i'), value: b.name, label: s['name'], onChanged: (v) => setBus(i, _sld.buses[i].copyWith(name: v.trim().isEmpty ? 'Bus' : v.trim())))),
              _num('sld-bus-kv-$i', s['kv'], b.kv, (v) => setBus(i, _sld.buses[i].copyWith(kv: math.max(0.001, v))), width: 100),
              IconButton(
                key: Key('sld-bus-remove-$i'),
                tooltip: s['remove'],
                icon: const Icon(Icons.delete_outline),
                onPressed: () => set(_removeBus(_sld, i)),
              ),
            ],
          ),
        ),
      const SizedBox(height: Kx.s8),
      Text(s['elements'], style: context.text.titleSmall),
      for (final (i, e) in d.elements.indexed)
        Padding(
          key: ValueKey('sld-el-$i-${d.elements.length}-${e.kind.name}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(kinds[e.kind]!.$2, size: 20),
              SizedBox(width: 120, child: _TextCell(key: Key('sld-el-label-$i'), value: e.label, label: kinds[e.kind]!.$1, onChanged: (v) => setElement(i, _sld.elements[i].copyWith(label: v)))),
              Text(e.series ? '${busName(e.a)} – ${busName(e.b)}' : busName(e.a), style: context.text.bodySmall),
              if (e.kind == SldKind.generator || e.kind == SldKind.motor || e.kind == SldKind.transformer) ...[
                _num('sld-el-mva-$i', s['mva'], e.mva, (v) => setElement(i, _sld.elements[i].copyWith(mva: math.max(0, v))), width: 90),
                _num('sld-el-kv-$i', s['kv'], e.kv, (v) => setElement(i, _sld.elements[i].copyWith(kv: math.max(0, v))), width: 90),
                _num('sld-el-x-$i', s['xpu'], e.x, (v) => setElement(i, _sld.elements[i].copyWith(x: math.max(0, v))), width: 90),
              ],
              if (e.kind == SldKind.line) _num('sld-el-ohm-$i', s['xOhm'], e.ohms, (v) => setElement(i, _sld.elements[i].copyWith(ohms: math.max(0, v))), width: 100),
              if (e.kind == SldKind.load) _num('sld-el-mva-$i', s['mva'], e.mva, (v) => setElement(i, _sld.elements[i].copyWith(mva: math.max(0, v))), width: 90),
              if (e.kind == SldKind.breaker || e.kind == SldKind.isolator)
                FilterChip(key: Key('sld-el-closed-$i'), label: Text(s['closed']), selected: e.closed, onSelected: (v) => setElement(i, _sld.elements[i].copyWith(closed: v))),
              if (d.perUnit(e).isFinite) Text('= ${d.perUnit(e).toStringAsFixed(4)} pu', key: Key('sld-el-pu-$i'), style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              IconButton(key: Key('sld-el-remove-$i'), tooltip: s['remove'], icon: const Icon(Icons.delete_outline), onPressed: () => set(_sld.copyWith(elements: [..._sld.elements]..removeAt(i)))),
            ],
          ),
        ),
      const SizedBox(height: Kx.s12),
      Text(
        fault == null ? s['noFault'] : '${s['faultLevel']}: ${eeeNum(fault.mva)} MVA   I_f = ${eeeNum(fault.ka)} kA   X_th = ${fault.xth.toStringAsFixed(4)} pu',
        key: const Key('sld-result'),
        style: context.text.titleMedium?.copyWith(color: fault == null ? null : const Color(0xFFC62828)),
      ),
      Text(s['teachingNote'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s16),
      Text(s['puCalc'], style: context.text.titleSmall),
      const SizedBox(height: Kx.s4),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        children: [
          _num('pu-z', s['zOld'], _zOld, (v) => setState(() => _zOld = v), width: 110),
          _num('pu-mva-old', s['mvaOld'], _mvaOld, (v) => setState(() => _mvaOld = v), width: 110),
          _num('pu-kv-old', s['kvOld'], _kvOld, (v) => setState(() => _kvOld = v), width: 110),
          _num('pu-mva-new', s['mvaNew'], _mvaNew, (v) => setState(() => _mvaNew = v), width: 110),
          _num('pu-kv-new', s['kvNew'], _kvNew, (v) => setState(() => _kvNew = v), width: 110),
        ],
      ),
      const SizedBox(height: Kx.s4),
      Text(
        'Z_new = ${eeeNum(_zOld)} × (${eeeNum(_kvOld)}/${eeeNum(_kvNew)})² × (${eeeNum(_mvaNew)}/${eeeNum(_mvaOld)}) = ${_puNew.isFinite ? _puNew.toStringAsFixed(4) : '—'} pu',
        key: const Key('pu-result'),
        style: context.text.titleSmall,
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  double get _puNew => perUnitChange(_zOld, mvaOld: _mvaOld, kvOld: _kvOld, mvaNew: _mvaNew, kvNew: _kvNew);

  /// [d] without bus [i]: elements on it go, the others' bus numbers follow.
  static SingleLineDiagram _removeBus(SingleLineDiagram d, int i) {
    int shift(int b) => b > i ? b - 1 : b;
    return d.copyWith(
      buses: [...d.buses]..removeAt(i),
      elements: [for (final e in d.elements) if (e.a != i && (!e.series || e.b != i)) e.copyWith(a: shift(e.a), b: e.series ? shift(e.b) : -1)],
      faultBus: d.faultBus == i ? -1 : shift(d.faultBus),
    );
  }

  // --- Waveforms ---------------------------------------------------------------------------------

  List<Widget> _waveControls(FeatureStrings s) {
    final m = _wave;
    void set(WaveformPanel x) => setState(() => _wave = x);
    final names = {WaveKind.sine: s['sine'], WaveKind.square: s['square'], WaveKind.triangle: s['triangle'], WaveKind.sawtooth: s['sawtooth'], WaveKind.pwm: s['pwm']};
    Widget waveRow(String id, Wave w, ValueChanged<Wave> on) => Wrap(
      key: ValueKey('wave-$id-${w.kind.name}'),
      spacing: Kx.s12,
      runSpacing: Kx.s8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        DropdownButton<WaveKind>(
          key: Key('wave-$id-kind'),
          value: w.kind,
          items: [for (final k in WaveKind.values) DropdownMenuItem(value: k, child: Text(names[k]!))],
          onChanged: (k) => on(w.copyWith(kind: k)),
        ),
        _num('wave-$id-amp', s['amplitude'], w.amplitude, (v) => on(w.copyWith(amplitude: v)), width: 120),
        _num('wave-$id-freq', s['f'], w.freq, (v) => on(w.copyWith(freq: math.max(0, v))), width: 110),
        _num('wave-$id-phase', s['phase'], w.phase, (v) => on(w.copyWith(phase: v)), width: 110),
        _num('wave-$id-offset', s['offset'], w.offset, (v) => on(w.copyWith(offset: v)), width: 110),
        if (w.kind == WaveKind.pwm) _num('wave-$id-duty', s['duty'], w.duty * 100, (v) => on(w.copyWith(duty: (v / 100).clamp(0, 1).toDouble())), width: 110),
      ],
    );
    final st = m.stats();
    return [
      Text(s['waveA'], style: context.text.titleSmall),
      waveRow('a', m.a, (w) => set(_wave.copyWith(a: w))),
      if (m.a.kind == WaveKind.pwm)
        Slider(key: const Key('wave-duty-slider'), value: m.a.duty, divisions: 100, label: '${(m.a.duty * 100).round()} %', onChanged: (v) => set(_wave.copyWith(a: _wave.a.copyWith(duty: v)))),
      SwitchListTile(key: const Key('wave-sum'), contentPadding: EdgeInsets.zero, title: Text(s['superpose']), value: m.superpose, onChanged: (v) => set(_wave.copyWith(superpose: v))),
      if (m.superpose) waveRow('b', m.b, (w) => set(_wave.copyWith(b: w))),
      SwitchListTile(key: const Key('wave-harm'), contentPadding: EdgeInsets.zero, title: Text(s['harmonics']), value: m.harmonics, onChanged: (v) => set(_wave.copyWith(harmonics: v))),
      if (m.harmonics) ...[
        Text('${s['terms']}: ${m.terms}', style: context.text.bodySmall),
        Slider(key: const Key('wave-terms'), value: m.terms.toDouble(), min: 1, max: 49, divisions: 48, label: '${m.terms}', onChanged: (v) => set(_wave.copyWith(terms: v.round()))),
      ],
      Text('${s['cycles']}: ${eeeNum(m.cycles)}', style: context.text.bodySmall),
      Slider(key: const Key('wave-cycles'), value: m.cycles.clamp(0.5, 10).toDouble(), min: 0.5, max: 10, divisions: 19, onChanged: (v) => set(_wave.copyWith(cycles: v))),
      Text(
        'RMS = ${eeeNum(st.rms)}   ${s['avg']} = ${eeeNum(st.average)}   ${s['peak']} = ${eeeNum(st.peak)}   FF = ${st.formFactor?.toStringAsFixed(3) ?? '—'}   CF = ${st.crestFactor?.toStringAsFixed(3) ?? '—'}',
        key: const Key('wave-result'),
        style: context.text.titleMedium,
      ),
      const SizedBox(height: Kx.s8),
    ];
  }
}

/// A pan that takes the pointer as soon as it lands on something that drags.
class _GrabDrag extends PanGestureRecognizer {
  _GrabDrag(this.hits);
  final bool Function(Offset local) hits;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    if (hits(event.localPosition)) resolve(GestureDisposition.accepted);
  }
}

class _Painter extends CustomPainter {
  _Painter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size, rotation: 0));

  @override
  bool shouldRepaint(_Painter old) => !identical(old.e, e);
}

class _TextCell extends StatefulWidget {
  const _TextCell({super.key, required this.value, required this.label, required this.onChanged});
  final String value, label;
  final ValueChanged<String> onChanged;

  @override
  State<_TextCell> createState() => _TextCellState();
}

class _TextCellState extends State<_TextCell> {
  late final _c = TextEditingController(text: widget.value);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: _c, decoration: InputDecoration(isDense: true, labelText: widget.label), onChanged: widget.onChanged);
}
