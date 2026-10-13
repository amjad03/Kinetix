import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../../l10n/feature_strings.dart';
import '../../../../../l10n/l10n.dart';
import '../../../chrome.dart';
import '../../../panel/panel_host.dart';
import '../../aiml/aiml_kit.dart';
import '../../chem/chem_kit.dart';
import '../../civil/civil_editors.dart';
import '../../civil/civil_samples.dart';
import '../../cs/cs_diagram_editor.dart';
import '../../cs/cs_diagram_samples.dart';
import '../../ece/ece_editors.dart';
import '../../ece/ece_samples.dart';
import '../../eee/eee_editors.dart';
import '../../eee/eee_samples.dart';
import '../../ev/ev_kit.dart';
import '../../mech/mech_editors.dart';
import '../../mech/mech_samples.dart';
import 'biz_strings.dart';
import 'market_data.dart';

/// Opens the editor of a live panel (business, civil, mechanical, electrical, electronics, chemical or EV); returns the
/// edited panel (same id and place), or null when cancelled.
Future<KitElement?> editKit(BuildContext context, KitElement e) => isCivilKit(e.kind)
    ? editCivilKit(context, e)
    : isMechKit(e.kind)
    ? editMechKit(context, e)
    : isEeeKit(e.kind)
    ? editEeeKit(context, e)
    : isEceKit(e.kind)
    ? editEceKit(context, e)
    : isCsDiagramKit(e.kind)
    ? editCsDiagram(context, e)
    : isAimlKit(e.kind)
    ? editAimlKit(context, e)
    : isChemKit(e.kind)
    ? editChemKit(context, e)
    : isEvKit(e.kind)
    ? editEvKit(context, e)
    : showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: KitEditorDialog(element: e)));

/// Reads a CSV or text file the teacher picks (from a USB stick or the board's storage); null
/// when cancelled. Tests replace it.
Future<Uint8List?> Function() pickDataFile = () async {
  final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['csv', 'tsv', 'txt']);
  return f == null ? null : await f.xFile.readAsBytes();
};

/// The editor: the panel drawn live above its controls. In a BCG matrix the bubbles drag.
class KitEditorDialog extends StatefulWidget {
  const KitEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<KitEditorDialog> createState() => _KitEditorDialogState();
}

class _KitEditorDialogState extends State<KitEditorDialog> {
  late final KitKind _kind = widget.element.kind;
  late BcgMatrix _bcg = BcgMatrix.fromJson(widget.element.data);
  late final DecisionTreeModel _tree = DecisionTreeModel.fromJson(widget.element.data);
  late BreakEvenModel _be = BreakEvenModel.fromJson(widget.element.data);
  late ChartData _chart = ChartData.fromJson(widget.element.data);
  late final _csv = TextEditingController(text: _chart.labels.isEmpty ? '' : _chart.toCsv());
  late final _title = TextEditingController(text: _titleOf());
  late final _note = TextEditingController(text: _chart.note);
  int? _dragging;

  // Slider ranges, fixed when the editor opens so the handles do not run away.
  late final double _fcMax = niceCeil(math.max(_be.fixedCost * 3, 1000));
  late final double _unitMax = niceCeil(math.max(math.max(_be.units, _be.bepUnits.isFinite ? _be.bepUnits : 0) * 3, 100));
  late final double _priceMax = niceCeil(math.max(math.max(_be.price, _be.variableCost) * 3, 10));

  String _titleOf() => switch (_kind) {
    KitKind.bcg => _bcg.title,
    KitKind.decisionTree => _tree.title,
    KitKind.breakEven => _be.title,
    KitKind.chart => _chart.title,
    _ => '',
  };

  Map<String, Object?> get _data => switch (_kind) {
    KitKind.bcg => _bcg.copyWith(title: _title.text).toJson(),
    KitKind.decisionTree => (_tree..title = _title.text).toJson(),
    KitKind.breakEven => _be.copyWith(title: _title.text).toJson(),
    KitKind.chart => _chart.copyWith(title: _title.text, note: _note.text).toJson(),
    _ => widget.element.data,
  };

  KitElement get _current => widget.element.copyWith(data: _data);

  @override
  void dispose() {
    _csv.dispose();
    _title.dispose();
    _note.dispose();
    super.dispose();
  }

  void _reparse() => _chart = ChartData.fromCsv(_csv.text, kind: _chart.kind, title: _title.text, note: _note.text).copyWith(yLabel: _chart.yLabel);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = bizStrings(context);
    final natural = KitElement.naturalSizeOf(_kind);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 760.0);
        final size = Size(w, w * natural.height / natural.width);
        final k = natural.width / size.width;
        Widget paint = CustomPaint(key: const Key('kit-preview'), size: size, painter: _KitPainter(_current));
        if (_kind == KitKind.bcg) {
          final plot = bcgPlot(natural);
          int? hitAt(Offset local) {
            final p = local * k;
            final maxR = math.min(plot.width, plot.height) * 0.11;
            int? hit;
            for (final (i, pr) in _bcg.products.indexed) {
              if ((_bcg.placement(pr, plot) - p).distance <= math.max(24, _bcg.radiusOf(pr, maxR))) hit = i;
            }
            return hit;
          }

          // A bubble under the finger wins the drag at once, so the dialog does not scroll.
          paint = RawGestureDetector(
            gestures: {
              _BubbleDrag: GestureRecognizerFactoryWithHandlers<_BubbleDrag>(() => _BubbleDrag((p) => hitAt(p) != null), (r) {
                r
                  ..onStart = (d) {
                    _dragging = hitAt(d.localPosition);
                  }
                  ..onUpdate = (d) {
                    final i = _dragging;
                    if (i == null) return;
                    final v = _bcg.valuesAt(d.localPosition * k, plot);
                    setState(() => _bcg = _bcg.copyWith(products: [for (final (j, p) in _bcg.products.indexed) j == i ? p.copyWith(growth: v.growth, share: v.share) : p]));
                  }
                  ..onEnd = (_) {
                    _dragging = null;
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
      key: const Key('kit-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('kit-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['title']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s12),
              ...switch (_kind) {
                KitKind.bcg => _bcgControls(s),
                KitKind.decisionTree => _treeControls(s),
                KitKind.breakEven => _breakEvenControls(s),
                KitKind.chart => _chartControls(s),
                _ => const <Widget>[],
              },
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('kit-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  // --- BCG -------------------------------------------------------------------------------------

  List<Widget> _bcgControls(FeatureStrings s) => [
    Text(s['dragHint'], style: context.text.bodySmall),
    const SizedBox(height: Kx.s8),
    for (final (i, p) in _bcg.products.indexed)
      Padding(
        key: ValueKey('bcg-row-$i-${_bcg.products.length}'),
        padding: const EdgeInsets.only(bottom: Kx.s8),
        child: Row(
          children: [
            Expanded(
              flex: 3,
              child: _TextCell(key: Key('bcg-name-$i'), value: p.name, label: s['product'], onChanged: (v) => _setProduct(i, p.copyWith(name: v))),
            ),
            const SizedBox(width: Kx.s8),
            Expanded(flex: 2, child: NumField(key: Key('bcg-growth-$i'), value: p.growth, label: s['growth'], onChanged: (v) => _setProduct(i, p.copyWith(growth: v)))),
            const SizedBox(width: Kx.s8),
            Expanded(flex: 2, child: NumField(key: Key('bcg-share-$i'), value: p.share, label: s['share'], onChanged: (v) => _setProduct(i, p.copyWith(share: math.max(0.01, v))))),
            const SizedBox(width: Kx.s8),
            Expanded(flex: 3, child: NumField(key: Key('bcg-revenue-$i'), value: p.revenue, label: s['revenue'], onChanged: (v) => _setProduct(i, p.copyWith(revenue: math.max(0, v))))),
            IconButton(
              tooltip: s['remove'],
              onPressed: () => setState(() => _bcg = _bcg.copyWith(products: [..._bcg.products]..removeAt(i))),
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        ),
      ),
    Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        key: const Key('bcg-add'),
        onPressed: () => setState(
          () => _bcg = _bcg.copyWith(products: [..._bcg.products, BcgProduct('${s['product']} ${_bcg.products.length + 1}', growth: _bcg.growthSplit, share: _bcg.shareSplit, revenue: 100)]),
        ),
        icon: const Icon(Icons.add_circle_outline),
        label: Text(s['addProduct']),
      ),
    ),
  ];

  void _setProduct(int i, BcgProduct p) => setState(() => _bcg = _bcg.copyWith(products: [for (final (j, q) in _bcg.products.indexed) j == i ? p : q]));

  // --- Decision tree ---------------------------------------------------------------------------

  List<Widget> _treeControls(FeatureStrings s) {
    final rows = <Widget>[];
    void add(DtNode n, DtNode? parent, int depth) {
      final i = rows.length;
      final kindName = {DtKind.decision: s['decision'], DtKind.chance: s['chance'], DtKind.end: s['outcome']};
      rows.add(
        Padding(
          key: ValueKey(identityHashCode(n)),
          padding: EdgeInsets.only(left: depth * 24.0, bottom: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              DropdownButton<DtKind>(
                key: Key('dt-kind-$i'),
                value: n.kind,
                items: [for (final k in DtKind.values) DropdownMenuItem(value: k, child: Text(kindName[k]!))],
                onChanged: (k) => setState(() {
                  n.kind = k!;
                  if (k == DtKind.end) n.children.clear();
                }),
              ),
              SizedBox(width: 200, child: _TextCell(key: Key('dt-label-$i'), value: n.label, label: s['label'], onChanged: (v) => setState(() => n.label = v))),
              if (parent?.kind == DtKind.chance)
                SizedBox(width: 110, child: NumField(key: Key('dt-p-$i'), value: n.probability, label: s['probability'], onChanged: (v) => setState(() => n.probability = v))),
              if (parent != null) SizedBox(width: 130, child: NumField(key: Key('dt-cost-$i'), value: n.cost, label: s['cost'], onChanged: (v) => setState(() => n.cost = v))),
              if (n.kind == DtKind.end) SizedBox(width: 150, child: NumField(key: Key('dt-payoff-$i'), value: n.payoff, label: s['payoff'], onChanged: (v) => setState(() => n.payoff = v))),
              if (n.kind != DtKind.end)
                IconButton(
                  key: Key('dt-add-$i'),
                  tooltip: s['addBranch'],
                  onPressed: () => setState(() {
                    n.children.add(DtNode(DtKind.end, label: '${s['outcome']} ${n.children.length + 1}'));
                    if (n.kind == DtKind.chance) {
                      for (final c in n.children) {
                        c.probability = double.parse((1 / n.children.length).toStringAsFixed(3));
                      }
                    }
                  }),
                  icon: const Icon(Icons.add_circle_outline),
                ),
              if (parent != null)
                IconButton(key: Key('dt-remove-$i'), tooltip: s['remove'], onPressed: () => setState(() => parent.children.remove(n)), icon: const Icon(Icons.delete_outline)),
            ],
          ),
        ),
      );
      for (final c in n.children) {
        add(c, n, depth + 1);
      }
    }

    add(_tree.root, null, 0);
    return [Text(s['treeHint'], style: context.text.bodySmall), const SizedBox(height: Kx.s8), ...rows];
  }

  // --- Break-even ------------------------------------------------------------------------------

  List<Widget> _breakEvenControls(FeatureStrings s) {
    Widget slider(String key, String label, double value, double max, BreakEvenModel Function(double) set) => Row(
      children: [
        SizedBox(width: 230, child: Text(label)),
        Expanded(
          child: Slider(key: Key('be-$key'), value: value.clamp(0.0, math.max(max, value)), max: math.max(max, value), onChanged: (v) => setState(() => _be = set(v.roundToDouble()))),
        ),
        SizedBox(width: 140, child: NumField(key: Key('be-$key-field'), value: value, label: '', onChanged: (v) => setState(() => _be = set(math.max(0, v))))),
      ],
    );
    return [
      slider('fc', s['fixedCost'], _be.fixedCost, _fcMax, (v) => _be.copyWith(fixedCost: v)),
      slider('vc', s['variableCost'], _be.variableCost, _priceMax, (v) => _be.copyWith(variableCost: v)),
      slider('sp', s['price'], _be.price, _priceMax, (v) => _be.copyWith(price: v)),
      slider('q', s['units'], _be.units, _unitMax, (v) => _be.copyWith(units: v)),
    ];
  }

  // --- Chart -----------------------------------------------------------------------------------

  List<Widget> _chartControls(FeatureStrings s) => [
    Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final k in KitChartKind.values)
          ChoiceChip(
            key: Key('chart-kind-${k.name}'),
            label: Text(s[k.name]),
            selected: _chart.kind == k,
            onSelected: (_) => setState(() => _chart = _chart.copyWith(kind: k)),
          ),
        PopupMenuButton<MarketDataset>(
          key: const Key('chart-datasets'),
          tooltip: s['datasets'],
          onSelected: (d) => setState(() {
            _chart = d.chart;
            _csv.text = d.csv.trim();
            _title.text = d.title;
            _note.text = d.chart.note;
          }),
          itemBuilder: (_) => [for (final d in marketDatasets) PopupMenuItem(key: Key('dataset-${d.id}'), value: d, child: Text(d.title))],
          child: Chip(avatar: const Icon(Icons.dataset_outlined, size: 18), label: Text(s['datasets'])),
        ),
        ActionChip(
          key: const Key('chart-import'),
          avatar: const Icon(Icons.upload_file, size: 18),
          label: Text(s['importFile']),
          onPressed: () async {
            final bytes = await pickDataFile();
            if (bytes == null || !mounted) return;
            final text = utf8.decode(bytes, allowMalformed: true);
            if (text.contains('\u0000')) {
              showBoardMessage(context, s['importFailed']);
              return;
            }
            setState(() {
              _csv.text = text.trim();
              _reparse();
            });
          },
        ),
      ],
    ),
    const SizedBox(height: Kx.s8),
    TextField(
      key: const Key('chart-data'),
      controller: _csv,
      minLines: 4,
      maxLines: 10,
      style: const TextStyle(fontFamily: 'monospace'),
      decoration: InputDecoration(labelText: s['data'], helperText: s['dataHint'], helperMaxLines: 2, border: const OutlineInputBorder()),
      onChanged: (_) => setState(_reparse),
    ),
    const SizedBox(height: Kx.s8),
    TextField(key: const Key('chart-note'), controller: _note, decoration: InputDecoration(isDense: true, labelText: s['sourceNote']), onChanged: (_) => setState(() {})),
  ];
}

/// A pan that takes the pointer as soon as it lands on a bubble.
class _BubbleDrag extends PanGestureRecognizer {
  _BubbleDrag(this.hits);
  final bool Function(Offset local) hits;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    if (hits(event.localPosition)) resolve(GestureDisposition.accepted);
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

/// A number box that follows its value when it changes from elsewhere (a dragged bubble, a
/// slider) without disturbing what is being typed.
class NumField extends StatefulWidget {
  const NumField({super.key, required this.value, required this.label, required this.onChanged});
  final double value;
  final String label;
  final ValueChanged<double> onChanged;

  @override
  State<NumField> createState() => _NumFieldState();
}

String _show(double v) => !v.isFinite ? '' : formatGeneral(double.parse(v.toStringAsFixed(2)));

class _NumFieldState extends State<NumField> {
  late final _c = TextEditingController(text: _show(widget.value));

  @override
  void didUpdateWidget(NumField old) {
    super.didUpdateWidget(old);
    final typed = parseSheetNumber(_c.text);
    if (typed == null || (typed - widget.value).abs() > 0.005) _c.text = _show(widget.value);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
    decoration: InputDecoration(isDense: true, labelText: widget.label.isEmpty ? null : widget.label),
    onChanged: (t) {
      final v = parseSheetNumber(t);
      if (v != null) widget.onChanged(v);
    },
  );
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
