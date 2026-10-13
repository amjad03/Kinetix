import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import '../college/biz/kit_editors.dart' show NumField;
import 'aiml_strings.dart';

/// A neural network diagram panel laid out at its natural size.
KitElement nnPanel(NnModel m, Color accent) => KitElement.sized(kind: KitKind.nnDiagram, data: (m..ensureWeights()).toJson(), color: accent);

/// A small network to start from: two inputs, three hidden neurons, one output.
NnModel blankNn() => NnModel(
  title: 'My network',
  layers: [NnLayer(NnLayerType.input, units: 2), NnLayer(NnLayerType.dense, units: 3, activation: NnActivation.relu), NnLayer(NnLayerType.output, units: 1, activation: NnActivation.sigmoid)],
)..ensureWeights();

/// Opens the network builder on [e]; returns the edited panel (same id and place), or null.
Future<KitElement?> editNnDiagram(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: NnEditor(element: e)));

/// The builder: the diagram drawn live above the layers' list (type, neurons or filters, kernel,
/// activation, each with its shape and parameters), ready networks, and the forward pass
/// stepped (or played) layer by layer, with numbers on a tiny net.
class NnEditor extends StatefulWidget {
  const NnEditor({super.key, required this.element});
  final KitElement element;

  @override
  State<NnEditor> createState() => _NnEditorState();
}

class _NnEditorState extends State<NnEditor> {
  late NnModel _m = NnModel.fromJson(widget.element.data)..ensureWeights();
  late final _title = TextEditingController(text: _m.title);
  Timer? _play;
  int _rev = 0;

  KitElement get _current => widget.element.copyWith(data: (_m..title = _title.text).toJson());

  @override
  void dispose() {
    _play?.cancel();
    _title.dispose();
    super.dispose();
  }

  void _changed(VoidCallback f) => setState(() {
    f();
    _m.ensureWeights();
    _m.step = _m.step.clamp(-1, _m.layers.length - 1);
    _rev++;
  });

  void _stopPlay() {
    _play?.cancel();
    _play = null;
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = aimlStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.nnDiagram);
    final size = MediaQuery.sizeOf(context);
    final current = _current;
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 860.0);
        return Center(
          child: CustomPaint(key: const Key('nn-preview'), size: Size(w, w * natural.height / natural.width), painter: _Painter(current)),
        );
      },
    );
    final shapes = _m.shapes();
    final last = _m.layers.length - 1;
    return AlertDialog(
      key: const Key('nn-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: math.min(900, size.width - 64),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('nn-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s8),
              Text(s.n('totalParams', groupThousands(_m.totalParams)), key: const Key('nn-total'), style: context.text.titleMedium),
              const SizedBox(height: Kx.s12),
              Text(s['presets'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final p in NnPreset.values)
                    ActionChip(
                      key: Key('nn-preset-${p.name}'),
                      label: Text(s['preset.${p.name}']),
                      onPressed: () => _changed(() {
                        _stopPlay();
                        _m = NnModel.preset(p);
                        _title.text = _m.title;
                      }),
                    ),
                ],
              ),
              const SizedBox(height: Kx.s16),
              Text(s['forward'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilledButton.tonalIcon(
                    key: const Key('nn-fwd-start'),
                    onPressed: () => setState(() {
                      _stopPlay();
                      _m.step = 0;
                    }),
                    icon: const Icon(Icons.first_page),
                    label: Text(s['start']),
                  ),
                  IconButton(key: const Key('nn-fwd-back'), tooltip: s['back'], onPressed: _m.step < 0 ? null : () => setState(() => _m.step--), icon: const Icon(Icons.chevron_left)),
                  FilledButton.icon(
                    key: const Key('nn-fwd-next'),
                    onPressed: _m.step >= last ? null : () => setState(() => _m.step++),
                    icon: const Icon(Icons.chevron_right),
                    label: Text(s['next']),
                  ),
                  IconButton(
                    key: const Key('nn-fwd-play'),
                    tooltip: s['forward'],
                    onPressed: () => setState(() {
                      if (_play != null) return _stopPlay();
                      _m.step = 0;
                      _play = Timer.periodic(const Duration(milliseconds: 800), (_) {
                        if (!mounted) return;
                        setState(() {
                          if (_m.step >= last) {
                            _stopPlay();
                          } else {
                            _m.step++;
                          }
                        });
                      });
                    }),
                    icon: Icon(_play != null ? Icons.pause : Icons.play_arrow),
                  ),
                  TextButton(
                    key: const Key('nn-fwd-reset'),
                    onPressed: () => setState(() {
                      _stopPlay();
                      _m.step = -1;
                    }),
                    child: Text(s['reset']),
                  ),
                ],
              ),
              if (_m.tiny) ...[
                const SizedBox(height: Kx.s8),
                Wrap(
                  key: ValueKey('nn-inputs-$_rev'),
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(s['inputs']),
                    for (var i = 0; i < _m.input.length; i++)
                      SizedBox(width: 90, child: NumField(key: Key('nn-x-$i'), value: _m.input[i], label: 'x${i + 1}', onChanged: (v) => setState(() => _m.input[i] = v))),
                  ],
                ),
              ] else
                Text(s['tinyOnly'], style: context.text.bodySmall),
              const SizedBox(height: Kx.s16),
              Text(s['layers'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              for (var i = 0; i < _m.layers.length; i++) _layerRow(s, i, shapes[i]),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const Key('nn-add'),
                  onPressed: () => _changed(() {
                    final at = _m.layers.isNotEmpty && _m.layers.last.type == NnLayerType.output ? _m.layers.length - 1 : _m.layers.length;
                    _m.layers.insert(at, NnLayer(_m.layers.isEmpty ? NnLayerType.input : NnLayerType.dense, units: 4, activation: _m.layers.isEmpty ? NnActivation.none : NnActivation.relu));
                    if (at < _m.weights.length) _m.weights.insert(at, null);
                  }),
                  icon: const Icon(Icons.add_circle_outline),
                  label: Text(s['addLayer']),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('nn-done'),
          onPressed: () {
            _stopPlay();
            Navigator.pop(context, _current);
          },
          child: Text(l.done),
        ),
      ],
    );
  }

  Widget _layerRow(FeatureStrings s, int i, NnShape shape) {
    final layer = _m.layers[i];
    Widget field(String key, String label, num value, void Function(double v) set, {double width = 96}) =>
        SizedBox(width: width, child: NumField(key: Key('nn-$key-$i'), value: value.toDouble(), label: label, onChanged: (v) => _changed(() => set(v))));
    int whole(double v, int lo, int hi) => v.isFinite ? v.round().clamp(lo, hi) : lo;
    final hasActivation = layer.type == NnLayerType.dense || layer.type == NnLayerType.output || layer.type == NnLayerType.conv;
    return Padding(
      key: ValueKey('nn-row-$i-$_rev'),
      padding: const EdgeInsets.only(bottom: Kx.s8),
      child: Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(width: 24, child: Text('${i + 1}', style: context.text.labelLarge)),
          DropdownButton<NnLayerType>(
            key: Key('nn-type-$i'),
            value: layer.type,
            items: [for (final t in NnLayerType.values) DropdownMenuItem(value: t, child: Text(s['layer.${t.name}']))],
            onChanged: (t) => _changed(() {
              layer.type = t!;
              if (t == NnLayerType.pool) layer.kernel = 2;
              if (t == NnLayerType.conv) layer.kernel = 3;
              if (t == NnLayerType.output && layer.activation == NnActivation.none) layer.activation = NnActivation.softmax;
            }),
          ),
          if (layer.type == NnLayerType.input) ...[
            FilterChip(
              key: Key('nn-image-$i'),
              label: Text(s['imageInput']),
              selected: layer.isImage,
              onSelected: (on) => _changed(() {
                layer.height = on ? 28 : 0;
                layer.width = on ? 28 : 0;
              }),
            ),
            if (layer.isImage) ...[
              field('h', s['height'], layer.height, (v) => layer.height = whole(v, 1, 1024)),
              field('w', s['width'], layer.width, (v) => layer.width = whole(v, 1, 1024)),
              field('c', s['channels'], layer.channels, (v) => layer.channels = whole(v, 1, 64)),
            ] else
              field('units', s['units'], layer.units, (v) => layer.units = whole(v, 1, 100000)),
          ],
          if (layer.type == NnLayerType.dense || layer.type == NnLayerType.output) field('units', s['units'], layer.units, (v) => layer.units = whole(v, 1, 100000)),
          if (layer.type == NnLayerType.conv) ...[
            field('units', s['filters'], layer.units, (v) => layer.units = whole(v, 1, 1024)),
            field('kernel', s['kernel'], layer.kernel, (v) => layer.kernel = whole(v, 1, 15)),
          ],
          if (layer.type == NnLayerType.pool) field('kernel', s['poolSize'], layer.kernel, (v) => layer.kernel = whole(v, 1, 8)),
          if (layer.type == NnLayerType.dropout) field('rate', s['rate'], layer.rate, (v) => layer.rate = v.isFinite ? v.clamp(0.0, 0.95) : 0.5),
          if (hasActivation)
            DropdownButton<NnActivation>(
              key: Key('nn-act-$i'),
              value: layer.activation,
              items: [for (final a in NnActivation.values) DropdownMenuItem(value: a, child: Text(nnActivationNames[a]!))],
              onChanged: (a) => _changed(() => layer.activation = a!),
            ),
          Text(
            shape.error ?? '${shape.text} · ${shape.params > 0 ? groupThousands(shape.params) : '0'}',
            key: Key('nn-shape-$i'),
            style: context.text.bodySmall?.copyWith(color: shape.error != null ? context.colors.error : null),
          ),
          if (i > 0)
            IconButton(
              key: Key('nn-up-$i'),
              tooltip: s['moveUp'],
              onPressed: () => _changed(() {
                _m.layers.insert(i - 1, _m.layers.removeAt(i));
                for (var k = 0; k < _m.weights.length; k++) {
                  _m.weights[k] = null;
                }
              }),
              icon: const Icon(Icons.arrow_upward),
            ),
          if (_m.layers.length > 1)
            IconButton(
              key: Key('nn-remove-$i'),
              tooltip: s['remove'],
              onPressed: () => _changed(() {
                _m.layers.removeAt(i);
                if (i < _m.weights.length) _m.weights.removeAt(i);
              }),
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
    );
  }
}

class _Painter extends CustomPainter {
  _Painter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size, rotation: 0));

  @override
  bool shouldRepaint(_Painter old) => true;
}
