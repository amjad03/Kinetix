import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import 'aiml_strings.dart';
import 'ml_algorithms.dart';
import 'ml_datasets.dart';

/// A playground panel for [d], its first model already run.
KitElement mlPanel(MlDataset d, Color accent) {
  final s = MlSettings(dataset: d, model: modelsFor(datasetTask(d)).first);
  return KitElement.sized(kind: KitKind.mlPlot, data: runPlayground(s, datasetPoints(d), title: 'Machine learning').toJson(), color: accent);
}

/// Opens the playground on [e] (a snapshot); returns the panel to put on the board, or null.
Future<KitElement?> openMlPlayground(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: MlPlayground(element: e)));

/// The playground: the plot (tap to add a point of the chosen class), the data and the model,
/// the model's knobs, and for the neural network live training (the regions redrawn each few
/// epochs) and for k-means its iterations one by one.
class MlPlayground extends StatefulWidget {
  const MlPlayground({super.key, required this.element});
  final KitElement element;

  @override
  State<MlPlayground> createState() => _MlPlaygroundState();
}

class _MlPlaygroundState extends State<MlPlayground> {
  late final MlSnapshot _start = MlSnapshot.fromJson(widget.element.data);
  late final MlSettings _s = MlSettings.fromJson(_start.settings);
  late List<MlPoint> _pts = [..._start.points];
  late final _title = TextEditingController(text: _start.title);
  int _class = 0;
  TinyMlp? _mlp;
  Timer? _timer;
  int? _kStep;
  late MlSnapshot _snap = _run();

  MlSnapshot _run() => runPlayground(_s, _pts, title: _title.text, mlp: _mlp, kmeansStep: _kStep);

  MlTask get _dataTask => datasetTask(_s.dataset);

  int get _kSteps => _s.model == MlModel.kmeans ? kMeans(_pts, _s.clusters, seed: _s.seed).length : 0;

  @override
  void dispose() {
    _timer?.cancel();
    _title.dispose();
    super.dispose();
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// After any change: drop live training and k-means stepping, run the model again.
  void _rerun(VoidCallback f) => setState(() {
    f();
    _stop();
    _mlp = null;
    _kStep = null;
    _snap = _run();
  });

  void _train() {
    if (_timer != null) return setState(_stop);
    final labelled = [for (final p in _pts) if (p.label >= 0) p];
    if (labelled.isEmpty) return;
    setState(() {
      _mlp = TinyMlp(labelled, hidden: _s.hidden, seed: _s.seed);
      _snap = _run();
    });
    _timer = Timer.periodic(const Duration(milliseconds: 60), (_) {
      final m = _mlp;
      if (!mounted || m == null) return _stop();
      final n = math.min(math.max(1, _s.epochs ~/ 60), _s.epochs - m.epochs);
      for (var i = 0; i < n; i++) {
        m.trainEpoch(_s.lr);
      }
      setState(() {
        if (m.epochs >= _s.epochs) _stop();
        _snap = _run();
      });
    });
  }

  void _playKMeans() {
    if (_timer != null) return setState(_stop);
    final total = _kSteps;
    if (total == 0) return;
    setState(() {
      _kStep = 0;
      _snap = _run();
    });
    _timer = Timer.periodic(const Duration(milliseconds: 700), (_) {
      if (!mounted) return _stop();
      setState(() {
        final next = (_kStep ?? 0) + 1;
        if (next >= total) {
          _stop();
          _kStep = null;
        } else {
          _kStep = next;
        }
        _snap = _run();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = aimlStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.mlPlot);
    final size = MediaQuery.sizeOf(context);
    final panel = widget.element.copyWith(data: _snap.toJson());
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 860.0);
        final shown = Size(w, w * natural.height / natural.width);
        final k = natural.width / shown.width;
        return Center(
          child: GestureDetector(
            key: const Key('ml-plot'),
            onTapUp: (d) {
              final plot = mlPlotRect(natural);
              final p = d.localPosition * k;
              if (!plot.contains(p)) return;
              final v = mlFromPlot(_snap, plot, p);
              _rerun(() => _pts = [..._pts, MlPoint(v.dx, v.dy, _dataTask == MlTask.classify ? _class : -1)]);
            },
            child: CustomPaint(size: shown, painter: _Painter(panel)),
          ),
        );
      },
    );
    return AlertDialog(
      key: const Key('ml-playground'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: math.min(900, size.width - 64),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('ml-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() => _snap.title = _title.text)),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(s['tapHint'], style: context.text.bodySmall),
                  if (_dataTask == MlTask.classify)
                    for (final c in [0, 1])
                      ChoiceChip(
                        key: Key('ml-class-$c'),
                        avatar: CircleAvatar(backgroundColor: mlClassColors[c], radius: 7),
                        label: Text(s['class$c']),
                        selected: _class == c,
                        onSelected: (_) => setState(() => _class = c),
                      ),
                  ActionChip(key: const Key('ml-clear'), avatar: const Icon(Icons.clear_all, size: 18), label: Text(s['clear']), onPressed: () => _rerun(() => _pts = [])),
                  ActionChip(key: const Key('ml-reload'), avatar: const Icon(Icons.refresh, size: 18), label: Text(s['reload']), onPressed: () => _rerun(() => _pts = datasetPoints(_s.dataset))),
                ],
              ),
              const SizedBox(height: Kx.s12),
              Row(
                children: [
                  SizedBox(width: 90, child: Text(s['data'], style: context.text.titleSmall)),
                  Expanded(
                    child: DropdownButton<MlDataset>(
                      key: const Key('ml-dataset'),
                      isExpanded: true,
                      value: _s.dataset,
                      items: [for (final d in MlDataset.values) DropdownMenuItem(value: d, child: Text(s['data.${d.name}']))],
                      onChanged: (d) => _rerun(() {
                        _s.dataset = d!;
                        _pts = datasetPoints(d);
                        if (!modelsFor(datasetTask(d)).contains(_s.model)) _s.model = modelsFor(datasetTask(d)).first;
                      }),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Text(s['model'], style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final m in modelsFor(_dataTask))
                    ChoiceChip(key: Key('ml-model-${m.name}'), label: Text(s['model.${m.name}']), selected: _s.model == m, onSelected: (_) => _rerun(() => _s.model = m)),
                ],
              ),
              const SizedBox(height: Kx.s8),
              ..._knobs(s),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton.icon(
          key: const Key('ml-to-board'),
          onPressed: () {
            _stop();
            Navigator.pop(context, widget.element.copyWith(data: _snap.toJson()));
          },
          icon: const Icon(Icons.add_to_photos_outlined),
          label: Text(s['putOnBoard']),
        ),
      ],
    );
  }

  List<Widget> _knobs(FeatureStrings s) {
    Widget slider(String key, String label, double value, double min, double max, int divisions, String shown, void Function(double) set) => Row(
      children: [
        SizedBox(width: 170, child: Text(label)),
        Expanded(
          child: Slider(key: Key('ml-$key'), value: value.clamp(min, max), min: min, max: max, divisions: divisions, label: shown, onChanged: (v) => _rerun(() => set(v))),
        ),
        SizedBox(width: 64, child: Text(shown, key: Key('ml-$key-value'), textAlign: TextAlign.right)),
      ],
    );
    final lr = slider('lr', s['lr'], _s.lr, 0.01, 1, 99, _s.lr.toStringAsFixed(2), (v) => _s.lr = double.parse(v.toStringAsFixed(2)));
    final epochs = slider('epochs', s['epochs'], _s.epochs.toDouble(), 10, 1000, 99, '${_s.epochs}', (v) => _s.epochs = v.round());
    return switch (_s.model) {
      MlModel.linear => [lr, epochs],
      MlModel.polynomial => [slider('degree', s['degree'], _s.degree.toDouble(), 1, 8, 7, '${_s.degree}', (v) => _s.degree = v.round())],
      MlModel.logistic || MlModel.perceptron => [lr, epochs],
      MlModel.knn => [slider('k', s['k'], _s.k.toDouble(), 1, 15, 14, '${_s.k}', (v) => _s.k = v.round())],
      MlModel.tree => [slider('depth', s['depth'], _s.depth.toDouble(), 1, 8, 7, '${_s.depth}', (v) => _s.depth = v.round())],
      MlModel.mlp => [
        slider('hidden', s['hidden'], _s.hidden.toDouble(), 2, 16, 14, '${_s.hidden}', (v) => _s.hidden = v.round()),
        lr,
        epochs,
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.tonalIcon(
            key: const Key('ml-train'),
            onPressed: _train,
            icon: Icon(_timer != null ? Icons.stop : Icons.play_arrow),
            label: Text(_timer != null ? s['stop'] : s['train']),
          ),
        ),
      ],
      MlModel.kmeans => [
        slider('clusters', s['clusters'], _s.clusters.toDouble(), 2, 6, 4, '${_s.clusters}', (v) => _s.clusters = v.round()),
        Row(
          children: [
            SizedBox(width: 170, child: Text(s['iteration'])),
            Expanded(
              child: Builder(
                builder: (context) {
                  final total = _kSteps;
                  final at = (_kStep ?? total - 1).clamp(0, math.max(0, total - 1));
                  return Slider(
                    key: const Key('ml-kstep'),
                    value: at.toDouble(),
                    max: math.max(1, total - 1).toDouble(),
                    divisions: math.max(1, total - 1),
                    onChanged: total < 2
                        ? null
                        : (v) => setState(() {
                            _stop();
                            _kStep = v.round();
                            _snap = _run();
                          }),
                  );
                },
              ),
            ),
            IconButton(key: const Key('ml-kplay'), onPressed: _playKMeans, icon: Icon(_timer != null ? Icons.pause : Icons.play_arrow)),
          ],
        ),
      ],
    };
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
