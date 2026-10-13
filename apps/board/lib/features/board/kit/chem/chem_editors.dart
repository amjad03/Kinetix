import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../college/biz/kit_editors.dart' show NumField;
import 'chem_strings.dart';

/// What a tap on the PFD does.
enum PfdMode { move, connect, delete }

/// The PFD editor: the diagram drawn live above its controls. In Move, symbols drag and snap to
/// the grid and a tap picks a symbol or a stream to edit; in Connect, two taps join two units
/// with a numbered stream (a dashed signal line from an instrument); in Delete, a tap removes.
class PfdEditorDialog extends StatefulWidget {
  const PfdEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<PfdEditorDialog> createState() => _PfdEditorDialogState();
}

class _PfdEditorDialogState extends State<PfdEditorDialog> {
  late PfdDiagram _d = PfdDiagram.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _d.title);
  PfdMode _mode = PfdMode.move;
  String? _unit, _pending, _held;
  int? _stream;

  KitElement get _current => widget.element.copyWith(data: _d.copyWith(title: _title.text).toJson());

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _tap(Offset p) {
    final u = _d.unitAt(p);
    final st = u == null ? _d.streamAt(p) : null;
    final si = st == null ? null : _d.streams.indexOf(st);
    setState(() {
      switch (_mode) {
        case PfdMode.move:
          _unit = u?.id;
          _stream = si;
        case PfdMode.connect:
          if (u == null) {
            _pending = null;
          } else if (_pending == null) {
            _pending = u.id;
          } else {
            final before = _d.streams.length;
            _d = _d.connect(_pending!, u.id);
            _pending = null;
            if (_d.streams.length > before) {
              _stream = _d.streams.length - 1;
              _unit = null;
            }
          }
        case PfdMode.delete:
          if (u != null) {
            _d = _d.removeUnit(u.id);
          } else if (si != null) {
            _d = _d.removeStream(si);
          }
          _unit = null;
          _stream = null;
      }
    });
  }

  void _add(PfdUnitType t) {
    final n = _d.units.length;
    final at = Offset(160 + (n % 8) * 130, 160 + ((n ~/ 8) % 3) * 160);
    setState(() {
      _d = _d.add(t, at);
      _unit = _d.units.last.id;
      _stream = null;
      _mode = PfdMode.move;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = chemStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.pfd);
    final accent = widget.element.color;
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 900.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        return Center(
          child: GestureDetector(
            onTapUp: (d) => _tap(d.localPosition * k),
            child: RawGestureDetector(
              gestures: {
                _GrabDrag: GestureRecognizerFactoryWithHandlers<_GrabDrag>(() => _GrabDrag((p) => _mode == PfdMode.move && _d.unitAt(p * k) != null), (r) {
                  r
                    ..onStart = (d) {
                      setState(() {
                        _held = _d.unitAt(d.localPosition * k)?.id;
                        _unit = _held;
                        _stream = null;
                      });
                    }
                    ..onUpdate = (d) {
                      if (_held case final id?) setState(() => _d = _d.move(id, d.localPosition * k));
                    }
                    ..onEnd = (_) {
                      _held = null;
                    };
                }),
              },
              child: CustomPaint(
                key: const Key('pfd-preview'),
                size: size,
                painter: _PfdPainter(_d, accent, unit: _unit, stream: _stream, pending: _pending),
              ),
            ),
          ),
        );
      },
    );
    return AlertDialog(
      key: const Key('pfd-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 940,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('pfd-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  for (final (m, icon) in [(PfdMode.move, Icons.open_with), (PfdMode.connect, Icons.timeline), (PfdMode.delete, Icons.delete_outline)])
                    ChoiceChip(
                      key: Key('pfd-mode-${m.name}'),
                      avatar: Icon(icon, size: 18),
                      label: Text(s['mode${m.name[0].toUpperCase()}${m.name.substring(1)}']),
                      selected: _mode == m,
                      onSelected: (_) => setState(() {
                        _mode = m;
                        _pending = null;
                      }),
                    ),
                  FilterChip(key: const Key('pfd-table'), label: Text(s['table']), selected: _d.showTable, onSelected: (v) => setState(() => _d = _d.copyWith(showTable: v))),
                ],
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                child: Text(s[switch (_mode) {
                  PfdMode.move => 'moveHint',
                  PfdMode.connect => 'connectHint',
                  PfdMode.delete => 'deleteHint',
                }], style: context.text.bodySmall),
              ),
              Text(s['addUnit'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s4,
                runSpacing: Kx.s4,
                children: [for (final t in PfdUnitType.values) ActionChip(key: Key('pfd-add-${t.name}'), label: Text(s['unit.${t.name}']), onPressed: () => _add(t))],
              ),
              const SizedBox(height: Kx.s12),
              ..._selection(s),
              const SizedBox(height: Kx.s8),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('pfd-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  List<Widget> _selection(FeatureStrings s) {
    final u = _unit == null ? null : _d.unitById(_unit!);
    if (u != null) {
      void set(PfdUnit x) => setState(() => _d = _d.copyWith(units: [for (final v in _d.units) v.id == x.id ? x : v]));
      return [
        Text('${s['unit.${u.type.name}']} ${u.tag}', style: context.text.titleSmall),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(width: 140, child: TextFormField(key: Key('pfd-tag-${u.id}'), initialValue: u.tag, decoration: InputDecoration(isDense: true, labelText: s['tag']), onChanged: (v) => set(u.copyWith(tag: v)))),
            SizedBox(
              width: 260,
              child: TextFormField(
                key: Key('pfd-label-${u.id}'),
                initialValue: u.label,
                decoration: InputDecoration(isDense: true, labelText: u.type == PfdUnitType.instrument ? s['letters'] : s['label']),
                onChanged: (v) => set(u.copyWith(label: v)),
              ),
            ),
            TextButton.icon(
              key: const Key('pfd-remove-unit'),
              onPressed: () => setState(() {
                _d = _d.removeUnit(u.id);
                _unit = null;
              }),
              icon: const Icon(Icons.delete_outline),
              label: Text(s['remove']),
            ),
          ],
        ),
      ];
    }
    final i = _stream;
    if (i == null || i >= _d.streams.length) return const [];
    final st = _d.streams[i];
    void set(PfdStream x) => setState(() => _d = _d.copyWith(streams: [..._d.streams]..[i] = x));
    return [
      Text(st.signal ? s['unit.instrument'] : '${s['stream']} ${st.number}', style: context.text.titleSmall),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (!st.signal) ...[
            SizedBox(width: 130, child: NumField(key: Key('pfd-flow-$i'), value: st.flow, label: s['flow'], onChanged: (v) => set(st.copyWith(flow: v)))),
            SizedBox(width: 100, child: NumField(key: Key('pfd-temp-$i'), value: st.temp, label: s['temp'], onChanged: (v) => set(st.copyWith(temp: v)))),
            SizedBox(width: 100, child: NumField(key: Key('pfd-p-$i'), value: st.pressure, label: s['pressure'], onChanged: (v) => set(st.copyWith(pressure: v)))),
            SizedBox(
              width: 300,
              child: TextFormField(
                key: Key('pfd-comp-$i'),
                initialValue: st.composition,
                decoration: InputDecoration(isDense: true, labelText: s['composition']),
                onChanged: (v) => set(st.copyWith(composition: v)),
              ),
            ),
          ],
          TextButton.icon(
            key: const Key('pfd-remove-stream'),
            onPressed: () => setState(() {
              _d = _d.removeStream(i);
              _stream = null;
            }),
            icon: const Icon(Icons.delete_outline),
            label: Text(s['remove']),
          ),
        ],
      ),
    ];
  }
}

class _PfdPainter extends CustomPainter {
  _PfdPainter(this.d, this.accent, {this.unit, this.stream, this.pending});
  final PfdDiagram d;
  final Color accent;
  final String? unit, pending;
  final int? stream;

  @override
  void paint(Canvas canvas, Size size) {
    final n = KitElement.naturalSizeOf(KitKind.pfd);
    canvas
      ..save()
      ..scale(size.width / n.width, size.height / n.height);
    final card = RRect.fromRectAndRadius(Offset.zero & n, const Radius.circular(10));
    canvas.drawRRect(card, Paint()..color = Colors.white);
    paintPfd(canvas, d, n, accent, selectedUnit: unit, selectedStream: stream, pending: pending);
    canvas
      ..drawRRect(
        card,
        Paint()
          ..color = const Color(0x33000000)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      )
      ..restore();
  }

  @override
  bool shouldRepaint(_PfdPainter old) => !identical(old.d, d) || old.unit != unit || old.stream != stream || old.pending != pending || old.accent != accent;
}

/// The unit operations editor: the panel drawn live, its figures on sliders.
class UnitOpEditorDialog extends StatefulWidget {
  const UnitOpEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<UnitOpEditorDialog> createState() => _UnitOpEditorDialogState();
}

class _UnitOpEditorDialogState extends State<UnitOpEditorDialog> {
  late UnitOpPanel _m = UnitOpPanel.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _m.title);

  KitElement get _current => widget.element.copyWith(data: _m.copyWith(title: _title.text).toJson());

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Widget _slider(String key, String label, double v, double min, double max, ValueChanged<double> on, {String Function(double)? fmt, int? divisions}) => Row(
    children: [
      SizedBox(width: 190, child: Text('$label: ${(fmt ?? (x) => x.toStringAsFixed(2))(v)}', style: context.text.bodySmall)),
      Expanded(child: Slider(key: Key(key), value: v.clamp(min, max).toDouble(), min: min, max: max, divisions: divisions, onChanged: on)),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = chemStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.unitOp);
    return AlertDialog(
      key: const Key('unitop-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 860,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('unitop-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              LayoutBuilder(
                builder: (context, box) {
                  final w = math.min(box.maxWidth, 820.0);
                  return Center(
                    child: CustomPaint(
                      key: const Key('unitop-preview'),
                      size: Size(w, w * natural.height / natural.width),
                      painter: _KitPainter(_current),
                    ),
                  );
                },
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (final op in UnitOp.values)
                    ChoiceChip(key: Key('unitop-${op.name}'), label: Text(s['op.${op.name}']), selected: _m.op == op, onSelected: (_) => setState(() => _m = _m.copyWith(op: op))),
                ],
              ),
              const SizedBox(height: Kx.s8),
              ...switch (_m.op) {
                UnitOp.mccabeThiele => _mccabe(s),
                UnitOp.heatExchanger => _hx(s),
                UnitOp.reactors => _reactors(s),
              },
              const SizedBox(height: Kx.s8),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('unitop-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  List<Widget> _mccabe(FeatureStrings s) {
    final m = _m.mccabe;
    void set(McCabeThiele x) => setState(() => _m = _m.copyWith(mccabe: x));
    final rmin = m.minReflux;
    return [
      _slider('mt-alpha', s['alpha'], m.alpha, 1.1, 8, (v) => set(m.copyWith(alpha: v))),
      _slider('mt-zf', s['zF'], m.zF, 0.05, 0.95, (v) => set(m.copyWith(zF: v))),
      _slider('mt-xd', s['xD'], m.xD, 0.5, 0.995, (v) => set(m.copyWith(xD: v)), fmt: (x) => x.toStringAsFixed(3)),
      _slider('mt-xw', s['xW'], m.xW, 0.005, 0.5, (v) => set(m.copyWith(xW: v)), fmt: (x) => x.toStringAsFixed(3)),
      _slider('mt-q', s['q'], m.q, -0.5, 1.5, (v) => set(m.copyWith(q: (v * 20).roundToDouble() / 20))),
      _slider('mt-r', s['reflux'], m.reflux, 0.1, 10, (v) => set(m.copyWith(reflux: v))),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('mt-rmin'),
          onPressed: rmin.isFinite && rmin > 0 ? () => set(m.copyWith(reflux: double.parse((1.5 * rmin).toStringAsFixed(2)))) : null,
          icon: const Icon(Icons.stairs_outlined),
          label: Text(s['atRmin']),
        ),
      ),
    ];
  }

  List<Widget> _hx(FeatureStrings s) {
    final m = _m.hx;
    void set(HeatExchanger x) => setState(() => _m = _m.copyWith(hx: x));
    String deg(double x) => '${x.round()} °C';
    return [
      SwitchListTile(key: const Key('hx-counter'), contentPadding: EdgeInsets.zero, title: Text(s['counter']), value: m.counter, onChanged: (v) => set(m.copyWith(counter: v))),
      _slider('hx-thin', s['thIn'], m.thIn, 40, 400, (v) => set(m.copyWith(thIn: v.roundToDouble())), fmt: deg),
      _slider('hx-thout', s['thOut'], m.thOut, 10, 390, (v) => set(m.copyWith(thOut: v.roundToDouble())), fmt: deg),
      _slider('hx-tcin', s['tcIn'], m.tcIn, 0, 200, (v) => set(m.copyWith(tcIn: v.roundToDouble())), fmt: deg),
      Wrap(
        spacing: Kx.s12,
        children: [
          SizedBox(width: 120, child: NumField(key: const Key('hx-ch'), value: m.ch, label: s['ch'], onChanged: (v) => set(m.copyWith(ch: math.max(0.01, v))))),
          SizedBox(width: 120, child: NumField(key: const Key('hx-cc'), value: m.cc, label: s['cc'], onChanged: (v) => set(m.copyWith(cc: math.max(0.01, v))))),
          SizedBox(width: 120, child: NumField(key: const Key('hx-u'), value: m.u, label: s['u'], onChanged: (v) => set(m.copyWith(u: math.max(1, v))))),
        ],
      ),
    ];
  }

  List<Widget> _reactors(FeatureStrings s) {
    final m = _m.reactors;
    void set(ReactorCompare x) => setState(() => _m = _m.copyWith(reactors: x));
    return [
      _slider('rx-k', s['k'], m.k, 0.01, 2, (v) => set(m.copyWith(k: v)), fmt: (x) => x.toStringAsFixed(3)),
      _slider('rx-x', s['target'], m.target, 0.1, 0.99, (v) => set(m.copyWith(target: v))),
      _slider('rx-n', s['tanks'], m.tanks.toDouble(), 1, 10, (v) => set(m.copyWith(tanks: v.round())), divisions: 9, fmt: (x) => '${x.round()}'),
    ];
  }
}

class _KitPainter extends CustomPainter {
  _KitPainter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size, rotation: 0));

  @override
  bool shouldRepaint(_KitPainter old) => !identical(old.e, e);
}

/// A pan that wins at once when it starts on a symbol, so dragging a symbol does not scroll the
/// editor.
class _GrabDrag extends PanGestureRecognizer {
  _GrabDrag(this.hits);
  final bool Function(Offset local) hits;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    if (hits(event.localPosition)) resolve(GestureDisposition.accepted);
  }
}
