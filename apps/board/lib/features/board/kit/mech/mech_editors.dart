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
import 'mech_strings.dart';

/// Opens the editor of a mechanical engineering panel (drawing sheet, cycle charts, free-body
/// diagram); returns the edited panel (same id and place), or null when cancelled.
Future<KitElement?> editMechKit(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: MechEditorDialog(element: e)));

/// The editor: the panel drawn live, worked out, above its controls. Force arrows drag on the
/// free-body diagram.
class MechEditorDialog extends StatefulWidget {
  const MechEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<MechEditorDialog> createState() => _MechEditorDialogState();
}

class _MechEditorDialogState extends State<MechEditorDialog> {
  late final KitKind _kind = widget.element.kind;
  late DrawingSheet _sheet = DrawingSheet.fromJson(widget.element.data);
  late ThermoCycle _cycle = ThermoCycle.fromJson(widget.element.data);
  late FbdModel _fbd = FbdModel.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _titleOf());

  // A force arrow held on the drawing, and the scale it was drawn at when the drag began.
  int? _held;
  ({Offset centre, double perM, double perN})? _frame;

  String _titleOf() => switch (_kind) {
    KitKind.drawingSheet => _sheet.title,
    KitKind.thermoCycle => _cycle.heading,
    KitKind.fbd => _fbd.title,
    _ => '',
  };

  Map<String, Object?> get _data => switch (_kind) {
    KitKind.drawingSheet => _sheet.copyWith(title: _title.text).toJson(),
    KitKind.thermoCycle => _cycle.copyWith(title: _title.text == cycleNames[_cycle.kind] ? '' : _title.text).toJson(),
    KitKind.fbd => _fbd.copyWith(title: _title.text).toJson(),
    _ => widget.element.data,
  };

  KitElement get _current => widget.element.copyWith(data: _data);

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = mechStrings(context);
    final natural = KitElement.naturalSizeOf(_kind);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 780.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        Widget paint = CustomPaint(key: const Key('mech-preview'), size: size, painter: _Painter(_current));
        if (_kind == KitKind.fbd) {
          paint = RawGestureDetector(
            gestures: {
              _GrabDrag: GestureRecognizerFactoryWithHandlers<_GrabDrag>(() => _GrabDrag((p) => _hit(p * k, natural) != null), (r) {
                r
                  ..onStart = (d) {
                    _held = _hit(d.localPosition * k, natural);
                    _frame = fbdFrame(_fbd, natural, forces: _fbd.solve().forces);
                  }
                  ..onUpdate = (d) {
                    _drag(d.localPosition * k);
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
      key: const Key('mech-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('mech-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s12),
              ...switch (_kind) {
                KitKind.drawingSheet => _sheetControls(s),
                KitKind.thermoCycle => _cycleControls(s),
                KitKind.fbd => _fbdControls(s),
                _ => const <Widget>[],
              },
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('mech-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  // --- Dragging force arrows -------------------------------------------------------------------

  /// The force whose arrow head is under [p] (panel coordinates).
  int? _hit(Offset p, Size natural) {
    final r = _fbd.solve();
    final f = fbdFrame(_fbd, natural, forces: r.forces);
    int? best;
    var bestD = 30.0;
    for (final (i, force) in r.forces.indexed) {
      if (force.unknown != FbdUnknown.none) continue; // found, not set
      final d = (fbdHead(f, force) - p).distance;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  void _drag(Offset p) {
    final i = _held, f = _frame;
    if (i == null || f == null) return;
    final force = _fbd.forces[i];
    final d = p - fbdTail(f, force);
    final magnitude = (d.distance / f.perN * 10).round() / 10;
    final angle = (math.atan2(-d.dy, d.dx) * 180 / math.pi / 5).round() * 5.0;
    setState(() => _fbd = _fbd.copyWith(forces: [for (final (j, x) in _fbd.forces.indexed) j == i ? x.copyWith(magnitude: magnitude, angle: angle) : x]));
  }

  // --- Drawing sheet ---------------------------------------------------------------------------

  List<Widget> _sheetControls(FeatureStrings s) {
    final sh = _sheet;
    void set(DrawingSheet m) => setState(() => _sheet = m);
    final gridNames = {DrawingGrid.none: s['gridNone'], DrawingGrid.square: s['gridSquare'], DrawingGrid.isometric: s['gridIso']};
    return [
      Wrap(
        spacing: Kx.s16,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['projection'], DropdownButton<DrawingProjection>(
            key: const Key('sheet-proj'),
            value: sh.projection,
            items: [DropdownMenuItem(value: DrawingProjection.first, child: Text(s['first'])), DropdownMenuItem(value: DrawingProjection.third, child: Text(s['third']))],
            onChanged: (p) => set(sh.copyWith(projection: p)),
          )),
          _labelled(s['scale'], DropdownButton<String>(
            key: const Key('sheet-scale'),
            value: sh.scale,
            items: [for (final x in drawingScales) DropdownMenuItem(value: x, child: Text(x))],
            onChanged: (x) => set(sh.copyWith(scale: x)),
          )),
          _labelled(s['sheet'], DropdownButton<SheetSize>(
            key: const Key('sheet-size'),
            value: sh.size,
            items: [for (final x in SheetSize.values) DropdownMenuItem(value: x, child: Text(x.name.toUpperCase()))],
            onChanged: (x) => set(sh.copyWith(size: x)),
          )),
          _labelled(s['grid'], DropdownButton<DrawingGrid>(
            key: const Key('sheet-grid'),
            value: sh.grid,
            items: [for (final g in DrawingGrid.values) DropdownMenuItem(value: g, child: Text(gridNames[g]!))],
            onChanged: (g) => set(sh.copyWith(grid: g)),
          )),
          SizedBox(width: 100, child: NumField(key: const Key('sheet-grid-mm'), value: sh.gridMm, label: s['gridMm'], onChanged: (v) => set(sh.copyWith(gridMm: v.clamp(2, 50).toDouble())))),
        ],
      ),
      Wrap(
        spacing: Kx.s8,
        children: [
          FilterChip(key: const Key('sheet-xy'), label: Text(s['xyLine']), selected: sh.showXY, onSelected: (v) => set(sh.copyWith(showXY: v))),
          FilterChip(key: const Key('sheet-miter'), label: Text(s['miter']), selected: sh.showMiter, onSelected: (v) => set(sh.copyWith(showMiter: v))),
          FilterChip(key: const Key('sheet-legend'), label: Text(s['legend']), selected: sh.showLegend, onSelected: (v) => set(sh.copyWith(showLegend: v))),
        ],
      ),
      const SizedBox(height: Kx.s12),
      Text(s['points'], style: context.text.titleSmall),
      for (final (i, p) in sh.points.indexed)
        Padding(
          key: ValueKey('sheet-point-$i-${sh.points.length}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(width: 70, child: _TextCell(key: Key('sheet-point-label-$i'), value: p.label, label: s['point'], onChanged: (v) => _setPoint(i, p.copyWith(label: v.trim().isEmpty ? '?' : v.trim())))),
              SizedBox(width: 120, child: NumField(key: Key('sheet-point-x-$i'), value: p.x, label: s['along'], onChanged: (v) => _setPoint(i, p.copyWith(x: v)))),
              SizedBox(width: 120, child: NumField(key: Key('sheet-point-h-$i'), value: p.h, label: s['above'], onChanged: (v) => _setPoint(i, p.copyWith(h: v)))),
              SizedBox(width: 140, child: NumField(key: Key('sheet-point-d-$i'), value: p.d, label: s['front'], onChanged: (v) => _setPoint(i, p.copyWith(d: v)))),
              IconButton(key: Key('sheet-point-remove-$i'), tooltip: s['remove'], onPressed: () => set(sh.copyWith(points: [...sh.points]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('sheet-add-point'),
          onPressed: () {
            final next = String.fromCharCode('A'.codeUnitAt(0) + sh.points.length % 26);
            set(sh.copyWith(points: [...sh.points, DrawingPoint(next, x: 30.0 + 40 * sh.points.length, h: 20, d: 20)]));
          },
          icon: const Icon(Icons.add_circle_outline),
          label: Text(s['addPoint']),
        ),
      ),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        children: [
          SizedBox(width: 220, child: _TextCell(key: const Key('sheet-name'), value: sh.name, label: s['name'], onChanged: (v) => set(_sheet.copyWith(name: v)))),
          SizedBox(width: 220, child: _TextCell(key: const Key('sheet-inst'), value: sh.institution, label: s['institution'], onChanged: (v) => set(_sheet.copyWith(institution: v)))),
          SizedBox(width: 90, child: _TextCell(key: const Key('sheet-no'), value: sh.sheetNo, label: s['sheetNo'], onChanged: (v) => set(_sheet.copyWith(sheetNo: v)))),
        ],
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  void _setPoint(int i, DrawingPoint p) => setState(() => _sheet = _sheet.copyWith(points: [for (final (j, x) in _sheet.points.indexed) j == i ? p : x]));

  Widget _labelled(String label, Widget child) => Row(mainAxisSize: MainAxisSize.min, children: [Text('$label  ', style: context.text.bodySmall), child]);

  // --- Cycles ----------------------------------------------------------------------------------

  List<Widget> _cycleControls(FeatureStrings s) {
    final c = _cycle;
    void set(ThermoCycle m) => setState(() => _cycle = m);
    final res = c.solve();
    Widget num(String key, String label, double v, ThermoCycle Function(double) on, {double width = 150}) =>
        SizedBox(width: width, child: NumField(key: Key('cycle-$key'), value: v, label: label, onChanged: (x) => set(on(x))));
    final kinds = {CycleKind.otto: s['otto'], CycleKind.diesel: s['diesel'], CycleKind.dual: s['dual'], CycleKind.brayton: s['brayton'], CycleKind.carnot: s['carnot'], CycleKind.rankine: s['rankine']};
    final gas = c.kind != CycleKind.rankine;
    return [
      _labelled(s['cycle'], DropdownButton<CycleKind>(
        key: const Key('cycle-kind'),
        value: c.kind,
        items: [for (final k in CycleKind.values) DropdownMenuItem(value: k, child: Text(kinds[k]!))],
        onChanged: (k) {
          if (_title.text == cycleNames[c.kind] || _title.text.isEmpty) _title.text = cycleNames[k]!;
          set(c.copyWith(kind: k));
        },
      )),
      const SizedBox(height: Kx.s8),
      Wrap(
        key: ValueKey('cycle-fields-${c.kind.name}'),
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        children: [
          if (gas) ...[
            num('gamma', s['gamma'], c.gamma, (x) => c.copyWith(gamma: x), width: 110),
            num('p1', s['p1'], c.p1, (x) => c.copyWith(p1: x), width: 110),
            num('t1', c.kind == CycleKind.carnot ? s['tLow'] : s['t1'], c.t1, (x) => c.copyWith(t1: x), width: 150),
          ],
          if (c.kind == CycleKind.otto || c.kind == CycleKind.diesel || c.kind == CycleKind.dual) num('r', s['r'], c.r, (x) => c.copyWith(r: x), width: 170),
          if (c.kind == CycleKind.diesel || c.kind == CycleKind.dual) num('rc', s['rc'], c.rc, (x) => c.copyWith(rc: x)),
          if (c.kind == CycleKind.dual || c.kind == CycleKind.brayton) num('rp', s['rp'], c.rp, (x) => c.copyWith(rp: x)),
          if (c.kind == CycleKind.otto || c.kind == CycleKind.brayton) num('tmax', s['tMax'], c.tMax, (x) => c.copyWith(tMax: x), width: 200),
          if (c.kind == CycleKind.carnot) ...[
            num('tmax', s['tHigh'], c.tMax, (x) => c.copyWith(tMax: x), width: 170),
            num('e', s['expansion'], c.expansion, (x) => c.copyWith(expansion: x), width: 200),
          ],
          if (!gas) ...[
            num('pb', s['boiler'], c.boilerBar, (x) => c.copyWith(boilerBar: x), width: 180),
            num('pc', s['condenser'], c.condenserBar, (x) => c.copyWith(condenserBar: x), width: 200),
          ],
        ],
      ),
      if (c.kind == CycleKind.otto || c.kind == CycleKind.diesel || c.kind == CycleKind.dual)
        Slider(key: const Key('cycle-r-slider'), value: c.r.clamp(2, 25).toDouble(), min: 2, max: 25, divisions: 46, label: 'r = ${mechNum(c.r, 1)}', onChanged: (v) => set(c.copyWith(r: v))),
      if (c.kind == CycleKind.brayton)
        Slider(key: const Key('cycle-rp-slider'), value: c.rp.clamp(1.5, 40).toDouble(), min: 1.5, max: 40, divisions: 77, label: 'rp = ${mechNum(c.rp, 1)}', onChanged: (v) => set(c.copyWith(rp: v))),
      SwitchListTile(key: const Key('cycle-shade'), contentPadding: EdgeInsets.zero, title: Text(s['shade']), value: c.shade, onChanged: (v) => set(c.copyWith(shade: v))),
      Text(
        res.ok ? 'η = ${mechNum(res.efficiency * 100, 2)} %   w = ${mechNum(res.work, 1)} kJ/kg' : res.error!,
        key: const Key('cycle-result'),
        style: context.text.titleMedium,
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  // --- Free-body diagrams ----------------------------------------------------------------------

  List<Widget> _fbdControls(FeatureStrings s) {
    final m = _fbd;
    void set(FbdModel x) => setState(() => _fbd = x);
    final res = m.solve();
    final bodies = {FbdBody.block: s['block'], FbdBody.incline: s['incline'], FbdBody.beam: s['beam'], FbdBody.sphere: s['sphere'], FbdBody.pulley: s['pulley']};
    final unknowns = {FbdUnknown.none: s['known'], FbdUnknown.magnitude: s['findMagnitude'], FbdUnknown.force: s['findForce']};
    return [
      Text(s['dragForce'], style: context.text.bodySmall),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _labelled(s['body'], DropdownButton<FbdBody>(
            key: const Key('fbd-body'),
            value: m.body,
            items: [for (final b in FbdBody.values) DropdownMenuItem(value: b, child: Text(bodies[b]!))],
            onChanged: (b) => set(m.copyWith(body: b)),
          )),
          SizedBox(width: 110, child: NumField(key: const Key('fbd-mass'), value: m.mass, label: s['mass'], onChanged: (v) => set(_fbd.copyWith(mass: math.max(0, v))))),
          if (m.body == FbdBody.incline) SizedBox(width: 110, child: NumField(key: const Key('fbd-theta'), value: m.theta, label: s['theta'], onChanged: (v) => set(_fbd.copyWith(theta: v.clamp(0, 89).toDouble())))),
          SizedBox(width: 100, child: NumField(key: const Key('fbd-mu'), value: m.mu, label: s['mu'], onChanged: (v) => set(_fbd.copyWith(mu: math.max(0, v))))),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        children: [
          ActionChip(key: const Key('fbd-add-weight'), avatar: const Icon(Icons.south, size: 18), label: Text(s['addWeight']), onPressed: () => _addForce(m.weight())),
          ActionChip(key: const Key('fbd-add-normal'), avatar: const Icon(Icons.north, size: 18), label: Text(s['addNormal']), onPressed: () => _addForce(m.normal())),
          ActionChip(key: const Key('fbd-add-friction'), avatar: const Icon(Icons.west, size: 18), label: Text(s['addFriction']), onPressed: () => _addForce(m.friction())),
          ActionChip(key: const Key('fbd-add-force'), avatar: const Icon(Icons.add, size: 18), label: Text(s['addForce']), onPressed: () => _addForce(FbdForce('F${m.forces.length + 1}', magnitude: 10, angle: 45))),
          FilterChip(key: const Key('fbd-components'), label: Text(s['components']), selected: m.showComponents, onSelected: (v) => set(_fbd.copyWith(showComponents: v))),
        ],
      ),
      const SizedBox(height: Kx.s8),
      Text(s['forces'], style: context.text.titleSmall),
      for (final (i, f) in m.forces.indexed)
        Padding(
          key: ValueKey('fbd-force-$i-${m.forces.length}-${f.unknown.name}'),
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(width: 70, child: _TextCell(key: Key('fbd-label-$i'), value: f.label, label: s['label'], onChanged: (v) => _setForce(i, _fbd.forces[i].copyWith(label: v.trim().isEmpty ? 'F' : v.trim())))),
              SizedBox(
                width: 100,
                child: f.unknown == FbdUnknown.none
                    ? NumField(key: Key('fbd-f-$i'), value: f.magnitude, label: s['magnitude'], onChanged: (v) => _setForce(i, _fbd.forces[i].copyWith(magnitude: v)))
                    : InputDecorator(decoration: InputDecoration(isDense: true, labelText: s['magnitude']), child: Text(mechNum(res.forces[i].magnitude, 2), key: Key('fbd-found-$i'))),
              ),
              SizedBox(
                width: 90,
                child: f.unknown == FbdUnknown.force
                    ? InputDecorator(decoration: InputDecoration(isDense: true, labelText: s['angle']), child: Text(mechNum(res.forces[i].angle, 1)))
                    : NumField(key: Key('fbd-a-$i'), value: f.angle, label: s['angle'], onChanged: (v) => _setForce(i, _fbd.forces[i].copyWith(angle: v))),
              ),
              SizedBox(width: 80, child: NumField(key: Key('fbd-x-$i'), value: f.x, label: s['px'], onChanged: (v) => _setForce(i, _fbd.forces[i].copyWith(x: v)))),
              SizedBox(width: 80, child: NumField(key: Key('fbd-y-$i'), value: f.y, label: s['py'], onChanged: (v) => _setForce(i, _fbd.forces[i].copyWith(y: v)))),
              DropdownButton<FbdUnknown>(
                key: Key('fbd-u-$i'),
                value: f.unknown,
                items: [for (final u in FbdUnknown.values) DropdownMenuItem(value: u, child: Text(unknowns[u]!))],
                // One unknown at a time: marking this one clears the others.
                onChanged: (u) => set(_fbd.copyWith(forces: [for (final (j, x) in _fbd.forces.indexed) j == i ? x.copyWith(unknown: u) : (u == FbdUnknown.none ? x : x.copyWith(unknown: FbdUnknown.none))])),
              ),
              IconButton(key: Key('fbd-remove-$i'), tooltip: s['remove'], onPressed: () => set(_fbd.copyWith(forces: [..._fbd.forces]..removeAt(i))), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      const SizedBox(height: Kx.s12),
      Text(
        '${res.balanced ? '✓' : '✗'} ΣFx = ${mechNum(res.sumFx, 2)} N, ΣFy = ${mechNum(res.sumFy, 2)} N, ΣM = ${mechNum(res.sumM, 2)} N·m',
        key: const Key('fbd-status'),
        style: context.text.titleSmall?.copyWith(color: res.balanced ? const Color(0xFF0F8A5F) : const Color(0xFFC62828)),
      ),
      const SizedBox(height: Kx.s8),
    ];
  }

  void _addForce(FbdForce f) => setState(() => _fbd = _fbd.copyWith(forces: [..._fbd.forces, f]));

  void _setForce(int i, FbdForce f) => setState(() => _fbd = _fbd.copyWith(forces: [for (final (j, x) in _fbd.forces.indexed) j == i ? f : x]));
}

/// A pan that takes the pointer as soon as it lands on a force's arrow head.
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
