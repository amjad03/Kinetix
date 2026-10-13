import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import '../college/biz/kit_editors.dart' show NumField;
import 'civil_samples.dart';
import 'civil_strings.dart';

/// Opens the editor of a civil engineering panel (beam, truss, level book, traverse, contours);
/// returns the edited panel (same id and place), or null when cancelled.
Future<KitElement?> editCivilKit(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: CivilEditorDialog(element: e)));

/// The editor: the panel drawn live, worked out, above its controls. Beam loads and truss joints
/// drag on the drawing.
class CivilEditorDialog extends StatefulWidget {
  const CivilEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<CivilEditorDialog> createState() => _CivilEditorDialogState();
}

class _CivilEditorDialogState extends State<CivilEditorDialog> {
  late final KitKind _kind = widget.element.kind;
  late BeamModel _beam = BeamModel.fromJson(widget.element.data);
  late TrussModel _truss = TrussModel.fromJson(widget.element.data);
  late LevelBook _level = LevelBook.fromJson(widget.element.data);
  late Traverse _trav = Traverse.fromJson(widget.element.data);
  late ContourGrid _grid = ContourGrid.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _titleOf());
  late final _levels = TextEditingController(text: _grid.toText());

  // A drag on the drawing: what is held and where it started.
  int? _held;
  BeamLoad? _heldLoad;
  Offset _from = Offset.zero;
  ({double scale, Offset origin})? _frame;

  String _titleOf() => switch (_kind) {
    KitKind.beam => _beam.title,
    KitKind.truss => _truss.title,
    KitKind.levelBook => _level.title,
    KitKind.traverse => _trav.title,
    KitKind.contour => _grid.title,
    _ => '',
  };

  Map<String, Object?> get _data => switch (_kind) {
    KitKind.beam => _beam.copyWith(title: _title.text).toJson(),
    KitKind.truss => _truss.copyWith(title: _title.text).toJson(),
    KitKind.levelBook => _level.copyWith(title: _title.text).toJson(),
    KitKind.traverse => _trav.copyWith(title: _title.text).toJson(),
    KitKind.contour => _grid.copyWith(title: _title.text).toJson(),
    _ => widget.element.data,
  };

  KitElement get _current => widget.element.copyWith(data: _data);

  @override
  void dispose() {
    _title.dispose();
    _levels.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = civilStrings(context);
    final natural = KitElement.naturalSizeOf(_kind);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 780.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        Widget paint = CustomPaint(key: const Key('civil-preview'), size: size, painter: _Painter(_current));
        if (_kind == KitKind.beam || _kind == KitKind.truss) {
          paint = RawGestureDetector(
            gestures: {
              _GrabDrag: GestureRecognizerFactoryWithHandlers<_GrabDrag>(() => _GrabDrag((p) => _hit(p * k, natural) != null), (r) {
                r
                  ..onStart = (d) {
                    _start(d.localPosition * k, natural);
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
      key: const Key('civil-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('civil-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s12),
              ...switch (_kind) {
                KitKind.beam => _beamControls(s),
                KitKind.truss => _trussControls(s),
                KitKind.levelBook => _levelControls(s),
                KitKind.traverse => _traverseControls(s),
                KitKind.contour => _contourControls(s),
                _ => const <Widget>[],
              },
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('civil-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  // --- Dragging on the drawing -----------------------------------------------------------------

  /// The load (beam) or joint (truss) under [p] (panel coordinates).
  int? _hit(Offset p, Size natural) {
    if (_kind == KitKind.beam) {
      final f = beamFrame(natural);
      if (p.dy < f.y - 130 || p.dy > f.y + 40) return null;
      int? best;
      var bestD = 36.0;
      for (final (i, l) in _beam.loads.indexed) {
        final a = beamToPx(_beam, natural, l.start), b = beamToPx(_beam, natural, l.end);
        final d = p.dx < a ? a - p.dx : (p.dx > b ? p.dx - b : 0.0);
        if (d < bestD || (d == 0 && !l.distributed)) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
    final f = trussFrame(_truss, natural);
    for (final (i, n) in _truss.nodes.indexed) {
      if ((trussToPx(f, n.x, n.y) - p).distance <= 26) return i;
    }
    return null;
  }

  void _start(Offset p, Size natural) {
    _held = _hit(p, natural);
    _from = p;
    if (_held == null) return;
    if (_kind == KitKind.beam) _heldLoad = _beam.loads[_held!];
    if (_kind == KitKind.truss) _frame = trussFrame(_truss, natural);
  }

  void _drag(Offset p, Size natural) {
    final i = _held;
    if (i == null) return;
    if (_kind == KitKind.beam) {
      final f = beamFrame(natural);
      final dx = (p.dx - _from.dx) / (f.right - f.left) * _beam.length;
      final step = _beam.length <= 4 ? 0.05 : 0.1;
      final moved = _heldLoad!.shifted((dx / step).round() * step, _beam.length);
      setState(() => _beam = _beam.copyWith(loads: [for (final (j, l) in _beam.loads.indexed) j == i ? _snap(moved) : l]));
    } else {
      final (x, y) = trussFromPx(_frame!, p);
      double r(double v) => (v * 10).round() / 10;
      setState(() => _truss = _truss.copyWith(nodes: [for (final (j, n) in _truss.nodes.indexed) j == i ? n.copyWith(x: r(x), y: r(y)) : n]));
    }
  }

  static BeamLoad _snap(BeamLoad l) {
    double r(double v) => (v * 100).round() / 100;
    return l.copyWith(x: r(l.x), x2: r(l.x2));
  }

  // --- Beam ------------------------------------------------------------------------------------

  List<Widget> _beamControls(FeatureStrings s) {
    final b = _beam;
    void set(BeamModel m) => setState(() => _beam = m);
    final typeNames = {
      BeamType.simplySupported: s['ssBeam'].split(' (').first,
      BeamType.cantilever: s['cantilever'].split(' (').first,
      BeamType.overhanging: s['overhang'],
      BeamType.propped: s['propped'],
      BeamType.fixed: s['fixedBeam'],
      BeamType.custom: s['custom'],
    };
    final supportNames = {BeamSupportKind.pin: s['pin'], BeamSupportKind.roller: s['roller'], BeamSupportKind.fixed: s['fixed']};
    final loadNames = {BeamLoadKind.point: s['point'], BeamLoadKind.udl: s['udl'], BeamLoadKind.uvl: s['uvl'], BeamLoadKind.moment: s['moment']};
    return [
      Text(s['dragLoad'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(
            width: 120,
            child: NumField(
              key: const Key('beam-length'),
              value: b.length,
              label: s['span'],
              onChanged: (v) {
                if (v <= 0) return;
                final L = v;
                set(b.copyWith(
                  length: L,
                  supports: b.type == BeamType.custom ? [for (final x in b.supports) x.copyWith(x: math.min(x.x, L))] : BeamModel.supportsFor(b.type, L),
                  loads: [for (final l in b.loads) l.copyWith(x: math.min(l.x, L), x2: math.min(l.x2, L))],
                ));
              },
            ),
          ),
          SizedBox(width: 180, child: NumField(key: const Key('beam-ei'), value: b.ei, label: s['ei'], onChanged: (v) => set(b.copyWith(ei: math.max(0, v))))),
          DropdownButton<BeamType>(
            key: const Key('beam-type'),
            value: b.type,
            items: [for (final t in BeamType.values) DropdownMenuItem(value: t, child: Text(typeNames[t]!))],
            onChanged: (t) => set(b.copyWith(type: t, supports: t == BeamType.custom ? b.supports : BeamModel.supportsFor(t!, b.length))),
          ),
        ],
      ),
      const SizedBox(height: Kx.s12),
      Text(s['supports'], style: context.text.titleSmall),
      for (final (i, sp) in b.supports.indexed)
        Padding(
          key: ValueKey('beam-support-$i-${b.supports.length}-${b.type.name}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Row(
            children: [
              DropdownButton<BeamSupportKind>(
                key: Key('beam-support-kind-$i'),
                value: sp.kind,
                items: [for (final k in BeamSupportKind.values) DropdownMenuItem(value: k, child: Text(supportNames[k]!))],
                onChanged: (k) => set(b.copyWith(type: BeamType.custom, supports: [for (final (j, x) in b.supports.indexed) j == i ? x.copyWith(kind: k) : x])),
              ),
              const SizedBox(width: Kx.s12),
              SizedBox(
                width: 110,
                child: NumField(
                  key: Key('beam-support-x-$i'),
                  value: sp.x,
                  label: s['x'],
                  onChanged: (v) => set(b.copyWith(type: BeamType.custom, supports: [for (final (j, x) in b.supports.indexed) j == i ? x.copyWith(x: v.clamp(0.0, b.length)) : x])),
                ),
              ),
              IconButton(tooltip: s['remove'], onPressed: () => set(b.copyWith(type: BeamType.custom, supports: [...b.supports]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('beam-add-support'),
          onPressed: () => set(b.copyWith(type: BeamType.custom, supports: [...b.supports, BeamSupport(b.length / 2, BeamSupportKind.roller)])),
          icon: const Icon(Icons.add_circle_outline),
          label: Text(s['addSupport']),
        ),
      ),
      Text(s['loads'], style: context.text.titleSmall),
      for (final (i, ld) in b.loads.indexed)
        Padding(
          key: ValueKey('beam-load-$i-${b.loads.length}-${ld.kind.name}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(width: 110, child: Text(loadNames[ld.kind]!, style: context.text.bodyMedium)),
              SizedBox(width: 96, child: NumField(key: Key('beam-load-x-$i'), value: ld.x, label: s['x'], onChanged: (v) => _setLoad(i, ld.copyWith(x: v.clamp(0.0, b.length))))),
              if (ld.distributed) SizedBox(width: 96, child: NumField(key: Key('beam-load-x2-$i'), value: ld.x2, label: s['x2'], onChanged: (v) => _setLoad(i, ld.copyWith(x2: v.clamp(0.0, b.length))))),
              SizedBox(width: 96, child: NumField(key: Key('beam-load-w-$i'), value: ld.w, label: s['w'], onChanged: (v) => _setLoad(i, ld.copyWith(w: v)))),
              if (ld.kind == BeamLoadKind.uvl) SizedBox(width: 96, child: NumField(key: Key('beam-load-w2-$i'), value: ld.w2, label: s['w2'], onChanged: (v) => _setLoad(i, ld.copyWith(w2: v)))),
              IconButton(key: Key('beam-load-remove-$i'), tooltip: s['remove'], onPressed: () => set(b.copyWith(loads: [...b.loads]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s8,
        children: [
          for (final k in BeamLoadKind.values)
            ActionChip(
              key: Key('beam-add-${k.name}'),
              avatar: const Icon(Icons.add, size: 18),
              label: Text(loadNames[k]!),
              onPressed: () => set(b.copyWith(loads: [
                ...b.loads,
                switch (k) {
                  BeamLoadKind.point => BeamLoad(k, x: b.length / 2, w: 10),
                  BeamLoadKind.udl => BeamLoad(k, x: 0, x2: b.length, w: 5),
                  BeamLoadKind.uvl => BeamLoad(k, x: 0, x2: b.length, w: 0, w2: 10),
                  BeamLoadKind.moment => BeamLoad(k, x: b.length / 2, w: 10),
                },
              ])),
            ),
        ],
      ),
    ];
  }

  void _setLoad(int i, BeamLoad l) => setState(() => _beam = _beam.copyWith(loads: [for (final (j, x) in _beam.loads.indexed) j == i ? l : x]));

  // --- Truss -----------------------------------------------------------------------------------

  List<Widget> _trussControls(FeatureStrings s) {
    final t = _truss;
    void set(TrussModel m) => setState(() => _truss = m);
    void setNode(int i, TrussNode n) => set(t.copyWith(nodes: [for (final (j, x) in t.nodes.indexed) j == i ? n : x]));
    final supportNames = <TrussSupportKind?, String>{null: s['none'], TrussSupportKind.pin: s['pin'], TrussSupportKind.rollerX: s['rollerX'], TrussSupportKind.rollerY: s['rollerY']};
    final names = [for (var i = 0; i < t.nodes.length; i++) t.nameOf(i)];
    return [
      Text(s['dragJoint'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s8),
      Text(s['joints'], style: context.text.titleSmall),
      for (final (i, n) in t.nodes.indexed)
        Padding(
          key: ValueKey('truss-node-$i-${t.nodes.length}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(width: 28, child: Text(names[i], style: context.text.titleSmall)),
              SizedBox(width: 80, child: NumField(key: Key('truss-x-$i'), value: n.x, label: 'x (m)', onChanged: (v) => setNode(i, n.copyWith(x: v)))),
              SizedBox(width: 80, child: NumField(key: Key('truss-y-$i'), value: n.y, label: 'y (m)', onChanged: (v) => setNode(i, n.copyWith(y: v)))),
              SizedBox(width: 86, child: NumField(key: Key('truss-fx-$i'), value: n.fx, label: s['fx'], onChanged: (v) => setNode(i, n.copyWith(fx: v)))),
              SizedBox(width: 86, child: NumField(key: Key('truss-fy-$i'), value: n.fy, label: s['fy'], onChanged: (v) => setNode(i, n.copyWith(fy: v)))),
              DropdownButton<TrussSupportKind?>(
                key: Key('truss-support-$i'),
                value: n.support,
                items: [for (final e in supportNames.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (k) => setNode(i, n.copyWith(support: k, clearSupport: k == null)),
              ),
              IconButton(
                tooltip: s['remove'],
                onPressed: () => set(TrussModel(
                  title: t.title,
                  nodes: [...t.nodes]..removeAt(i),
                  members: [
                    for (final (a, b) in t.members)
                      if (a != i && b != i) (a > i ? a - 1 : a, b > i ? b - 1 : b),
                  ],
                )),
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('truss-add-joint'),
          onPressed: () {
            final last = t.nodes.isEmpty ? const TrussNode(0, 0) : t.nodes.last;
            set(t.copyWith(nodes: [...t.nodes, TrussNode(last.x + 2, last.y, label: String.fromCharCode(65 + t.nodes.length % 26))]));
          },
          icon: const Icon(Icons.add_circle_outline),
          label: Text(s['addJoint']),
        ),
      ),
      Text(s['members'], style: context.text.titleSmall),
      const SizedBox(height: Kx.s4),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        children: [
          for (final (k, (a, b)) in t.members.indexed)
            InputChip(
              key: Key('truss-member-$k'),
              label: Text('${names[a]}${names[b]}'),
              onDeleted: () => set(t.copyWith(members: [...t.members]..removeAt(k))),
              deleteButtonTooltipMessage: s['remove'],
            ),
          if (t.nodes.length >= 2) _MemberAdder(names: names, label: s['addMember'], from: s['from'], to: s['to'], onAdd: (a, b) {
            if (a == b || t.members.any((m) => (m.$1 == a && m.$2 == b) || (m.$1 == b && m.$2 == a))) return;
            set(t.copyWith(members: [...t.members, (a, b)]));
          }),
        ],
      ),
    ];
  }

  // --- Level book ------------------------------------------------------------------------------

  List<Widget> _levelControls(FeatureStrings s) {
    final b = _level;
    void set(LevelBook m) => setState(() => _level = m);
    void setRow(int i, LevelRow r) => set(b.copyWith(rows: [for (final (j, x) in b.rows.indexed) j == i ? r : x]));
    double? opt(String t) => t.trim().isEmpty ? null : parseSheetNumber(t);
    return [
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SegmentedButton<LevelMethod>(
            key: const Key('level-method'),
            segments: [ButtonSegment(value: LevelMethod.riseFall, label: Text(s['riseFall'])), ButtonSegment(value: LevelMethod.heightOfInstrument, label: Text(s['hiMethod']))],
            selected: {b.method},
            onSelectionChanged: (v) => set(b.copyWith(method: v.first)),
          ),
          SizedBox(width: 180, child: NumField(key: const Key('level-rl'), value: b.firstRl, label: s['firstRl'], onChanged: (v) => set(b.copyWith(firstRl: v)))),
        ],
      ),
      const SizedBox(height: Kx.s8),
      for (final (i, r) in b.rows.indexed)
        Padding(
          key: ValueKey('level-row-$i-${b.rows.length}'),
          padding: const EdgeInsets.only(top: Kx.s4),
          child: Row(
            children: [
              SizedBox(width: 90, child: _Cell(key: Key('level-st-$i'), value: r.station, label: s['station'], onChanged: (v) => setRow(i, r.copyWith(station: v)))),
              const SizedBox(width: Kx.s8),
              for (final (k, label, value) in [('bs', s['bs'], r.bs), ('is', s['is'], r.ins), ('fs', s['fs'], r.fs)]) ...[
                SizedBox(
                  width: 90,
                  child: _Cell(
                    key: Key('level-$k-$i'),
                    value: value == null ? '' : value.toStringAsFixed(3),
                    label: label,
                    number: true,
                    onChanged: (t) => setRow(i, switch (k) {
                      'bs' => r.copyWith(bs: () => opt(t)),
                      'is' => r.copyWith(ins: () => opt(t)),
                      _ => r.copyWith(fs: () => opt(t)),
                    }),
                  ),
                ),
                const SizedBox(width: Kx.s8),
              ],
              Expanded(child: _Cell(key: Key('level-rm-$i'), value: r.remark, label: s['remarks'], onChanged: (v) => setRow(i, r.copyWith(remark: v)))),
              IconButton(tooltip: s['remove'], onPressed: () => set(b.copyWith(rows: [...b.rows]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('level-add'),
          onPressed: () => set(b.copyWith(rows: [...b.rows, LevelRow('${b.rows.length}')])),
          icon: const Icon(Icons.add_circle_outline),
          label: Text(s['addReading']),
        ),
      ),
    ];
  }

  // --- Traverse --------------------------------------------------------------------------------

  List<Widget> _traverseControls(FeatureStrings s) {
    final t = _trav;
    void set(Traverse m) => setState(() => _trav = m);
    void setLeg(int i, TraverseLeg l) => set(t.copyWith(legs: [for (final (j, x) in t.legs.indexed) j == i ? l : x]));
    return [
      for (final (i, l) in t.legs.indexed)
        Padding(
          key: ValueKey('trav-row-$i-${t.legs.length}'),
          padding: const EdgeInsets.only(top: Kx.s4),
          child: Row(
            children: [
              SizedBox(width: 90, child: _Cell(key: Key('trav-name-$i'), value: l.name, label: s['line'], onChanged: (v) => setLeg(i, l.copyWith(name: v)))),
              const SizedBox(width: Kx.s8),
              SizedBox(width: 130, child: NumField(key: Key('trav-len-$i'), value: l.length, label: s['length'], onChanged: (v) => setLeg(i, l.copyWith(length: math.max(0, v))))),
              const SizedBox(width: Kx.s8),
              SizedBox(width: 130, child: NumField(key: Key('trav-brg-$i'), value: l.bearing, label: s['bearing'], onChanged: (v) => setLeg(i, l.copyWith(bearing: v % 360)))),
              const SizedBox(width: Kx.s8),
              Expanded(child: Text('${quadrantalBearing(l.bearing)} · BB ${degreesMinutes(l.backBearing)}', style: context.text.bodySmall)),
              IconButton(tooltip: s['remove'], onPressed: () => set(t.copyWith(legs: [...t.legs]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('trav-add'),
          onPressed: () => set(t.copyWith(legs: [...t.legs, TraverseLeg('', length: 100, bearing: t.legs.isEmpty ? 0 : (t.legs.last.bearing + 90) % 360)])),
          icon: const Icon(Icons.add_circle_outline),
          label: Text(s['addLine']),
        ),
      ),
    ];
  }

  // --- Contours --------------------------------------------------------------------------------

  List<Widget> _contourControls(FeatureStrings s) => [
    Wrap(
      spacing: Kx.s12,
      children: [
        SizedBox(width: 160, child: NumField(key: const Key('contour-spacing'), value: _grid.spacing, label: s['spacing'], onChanged: (v) => setState(() => _grid = _grid.copyWith(spacing: math.max(0.01, v))))),
        SizedBox(width: 180, child: NumField(key: const Key('contour-interval'), value: _grid.interval, label: s['interval'], onChanged: (v) => setState(() => _grid = _grid.copyWith(interval: math.max(0.01, v))))),
      ],
    ),
    const SizedBox(height: Kx.s8),
    TextField(
      key: const Key('contour-levels'),
      controller: _levels,
      minLines: 4,
      maxLines: 12,
      style: const TextStyle(fontFamily: 'monospace'),
      decoration: InputDecoration(labelText: s['levels'], border: const OutlineInputBorder()),
      onChanged: (t) => setState(() => _grid = ContourGrid.fromText(t, title: _title.text, spacing: _grid.spacing, interval: _grid.interval)),
    ),
  ];
}

/// Picks two joints and adds the member between them.
class _MemberAdder extends StatefulWidget {
  const _MemberAdder({required this.names, required this.label, required this.from, required this.to, required this.onAdd});
  final List<String> names;
  final String label, from, to;
  final void Function(int a, int b) onAdd;

  @override
  State<_MemberAdder> createState() => _MemberAdderState();
}

class _MemberAdderState extends State<_MemberAdder> {
  int _a = 0, _b = 1;

  @override
  Widget build(BuildContext context) {
    final n = widget.names.length;
    final a = _a.clamp(0, n - 1), b = _b.clamp(0, n - 1);
    DropdownButton<int> pick(Key key, int v, ValueChanged<int> on) =>
        DropdownButton<int>(key: key, value: v, items: [for (var i = 0; i < n; i++) DropdownMenuItem(value: i, child: Text(widget.names[i]))], onChanged: (x) => setState(() => on(x!)));
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('${widget.from} '),
        pick(const Key('truss-member-a'), a, (x) => _a = x),
        Text('  ${widget.to} '),
        pick(const Key('truss-member-b'), b, (x) => _b = x),
        IconButton(key: const Key('truss-add-member'), tooltip: widget.label, onPressed: () => widget.onAdd(a, b), icon: const Icon(Icons.add_link)),
      ],
    );
  }
}

/// A pan that takes the pointer as soon as it lands on a load or a joint.
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

class _Cell extends StatefulWidget {
  const _Cell({super.key, required this.value, required this.label, required this.onChanged, this.number = false});
  final String value, label;
  final bool number;
  final ValueChanged<String> onChanged;

  @override
  State<_Cell> createState() => _CellState();
}

class _CellState extends State<_Cell> {
  late final _c = TextEditingController(text: widget.value);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    keyboardType: widget.number ? const TextInputType.numberWithOptions(decimal: true) : null,
    decoration: InputDecoration(isDense: true, labelText: widget.label),
    onChanged: widget.onChanged,
  );
}

/// A civil panel for [kind] filled with its worked example.
KitElement civilSample(KitKind kind, Color accent) => civilPanel(kind, civilData(kind), accent);
