import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'model.dart';
import 'model_viewer.dart';
import 'solids.dart';

/// A solid with dimension sliders and live measurements (formula, working and value).
/// Side by side when there is room, stacked in a narrow pane.
class SolidExplorer extends StatefulWidget {
  const SolidExplorer({super.key, required this.kind, this.initialDims, this.controller});

  final SolidKind kind;
  final Map<String, double>? initialDims;
  final ModelViewController? controller;

  @override
  State<SolidExplorer> createState() => _SolidExplorerState();
}

class _SolidExplorerState extends State<SolidExplorer> {
  late Solid _solid;
  late double _fit;
  late Model3D _model;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  @override
  void didUpdateWidget(SolidExplorer old) {
    super.didUpdateWidget(old);
    if (old.kind != widget.kind) _reset();
  }

  void _reset() {
    _solid = Solid(widget.kind, widget.initialDims);
    _model = _solid.toModel();
    _fit = _model.bounds.$2;
  }

  void _update(Solid s) {
    setState(() {
      _solid = s;
      _model = s.toModel();
      // The view only zooms out when the solid outgrows it, so shrinking a dimension
      // visibly shrinks the solid.
      _fit = math.max(_fit, _model.bounds.$2);
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final wide = box.maxWidth >= 860;
      final viewer = ModelViewer(
        model: _model,
        controller: widget.controller,
        fitRadius: _fit,
        showCaption: false,
        toolbarLeading: [
          IconButton(
            tooltip: 'Reset dimensions',
            icon: const Icon(Icons.restart_alt),
            onPressed: () => setState(_reset),
          ),
        ],
      );
      final panel = _Panel(solid: _solid, onChanged: _update, compact: !wide);
      if (wide) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: viewer),
            SizedBox(width: (box.maxWidth * 0.3).clamp(340.0, 460.0), child: panel),
          ],
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(flex: 11, child: viewer),
          Expanded(flex: 9, child: panel),
        ],
      );
    });
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.solid, required this.onChanged, required this.compact});
  final Solid solid;
  final ValueChanged<Solid> onChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ColoredBox(
      color: c.surfaceContainerLow,
      child: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text('Dimensions', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Kx.s4),
          for (final d in Solid.dimensionsOf(solid.kind)) _DimSlider(dim: d, value: solid[d.key], onChanged: (v) => onChanged(solid.copyWith(dims: {d.key: v}))),
          const SizedBox(height: Kx.s8),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: Kx.s12,
            runSpacing: Kx.s8,
            children: [
              Text('Take π as', style: context.text.bodyMedium),
              SegmentedButton<PiMode>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: PiMode.exact, label: Text('3.14159…')),
                  ButtonSegment(value: PiMode.twentyTwoBySeven, label: Text('22/7')),
                ],
                selected: {solid.piMode},
                onSelectionChanged: (s) => onChanged(solid.copyWith(piMode: s.first)),
              ),
            ],
          ),
          const SizedBox(height: Kx.s16),
          Text('Measurements', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Kx.s8),
          for (final m in solid.measurements) ...[
            _MeasurementCard(m: m, compact: compact),
            const SizedBox(height: Kx.s8),
          ],
        ],
      ),
    );
  }
}

class _DimSlider extends StatelessWidget {
  const _DimSlider({required this.dim, required this.value, required this.onChanged});
  final SolidDimension dim;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('${dim.name} (${dim.key})', style: context.text.bodyLarge)),
            Text('${formatNumber(value)} cm', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: c.primary)),
          ],
        ),
        Slider(
          key: ValueKey('dim-${dim.key}'),
          value: value.clamp(dim.min, dim.max),
          min: dim.min,
          max: dim.max,
          divisions: ((dim.max - dim.min) * 4).round(),
          label: '${dim.key} = ${formatNumber(value)} cm',
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _MeasurementCard extends StatelessWidget {
  const _MeasurementCard({required this.m, required this.compact});
  final Measurement m;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      color: c.surfaceContainerHigh,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Expanded(child: Text(m.name, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant))),
                Text(m.valueText, style: (compact ? context.text.titleLarge : context.text.headlineSmall)?.copyWith(fontWeight: FontWeight.w700, color: c.onSurface)),
              ],
            ),
            const SizedBox(height: Kx.s4),
            Text(m.formula, style: (compact ? context.text.titleMedium : context.text.titleLarge)?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
            Text('= ${m.working}', style: (compact ? context.text.bodyMedium : context.text.bodyLarge)?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
