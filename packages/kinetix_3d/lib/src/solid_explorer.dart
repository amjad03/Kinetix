import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'model.dart';
import 'model_viewer.dart';
import 'solids.dart';

/// A solid with dimension sliders and live measurements (formula, working and value).
/// Side by side when there is room, stacked in a narrow pane.
class SolidExplorer extends StatefulWidget {
  const SolidExplorer({super.key, required this.kind, this.initialDims, this.controller, this.initialFaceColors});

  /// Faces painted before (see [encodeFaceColorMap]), shown when the explorer opens.
  final String? initialFaceColors;

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
  late final ModelViewController _ctrl = widget.controller ?? ModelViewController();
  bool _lengths = true, _angles = false;

  /// Colours a tapped face can be painted (spec §20: face-level colouring).
  static const faceColours = [Color(0xFFE53935), Color(0xFFFB8C00), Color(0xFFFDD835), Color(0xFF43A047), Color(0xFF1E88E5), Color(0xFF8E24AA)];

  @override
  void dispose() {
    if (widget.controller == null) _ctrl.dispose();
    super.dispose();
  }

  Model3D _build(Solid s) => s.toModel(lengths: _lengths, angles: _angles);

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
    _model = _build(_solid);
    _ctrl.faceColors
      ..clear()
      ..addAll(decodeFaceColorMap(widget.initialFaceColors));
    _fit = _model.bounds.$2;
  }

  void _update(Solid s) {
    setState(() {
      _solid = s;
      _model = _build(s);
      // The view only zooms out when the solid outgrows it, so shrinking a dimension
      // visibly shrinks the solid.
      _fit = math.max(_fit, _model.bounds.$2);
    });
  }

  /// Show Lengths, Show Angles, Lined/Filled and face colouring.
  Widget _display(BuildContext context) => ListenableBuilder(
    listenable: _ctrl,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            FilterChip(key: const Key('solid-lengths'), label: const Text('Show lengths'), selected: _lengths, onSelected: (v) => setState(() {
              _lengths = v;
              _model = _build(_solid);
            })),
            FilterChip(key: const Key('solid-angles'), label: const Text('Show angles'), selected: _angles, onSelected: (v) => setState(() {
              _angles = v;
              _model = _build(_solid);
            })),
            SegmentedButton<bool>(
              key: const Key('solid-lined'),
              showSelectedIcon: false,
              segments: const [ButtonSegment(value: false, label: Text('Filled')), ButtonSegment(value: true, label: Text('Lined'))],
              selected: {_ctrl.wireframe},
              onSelectionChanged: (v) {
                if (v.single != _ctrl.wireframe) _ctrl.toggleWireframe();
              },
            ),
          ],
        ),
        const SizedBox(height: Kx.s8),
        Text('Colour a face: pick a colour, then tap a face', style: context.text.bodySmall),
        const SizedBox(height: Kx.s4),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final (i, c) in faceColours.indexed)
              InkResponse(
                key: Key('face-colour-$i'),
                onTap: () => _ctrl.setPaintColor(_ctrl.paintColor == c ? null : c),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(width: _ctrl.paintColor == c ? 4 : 1, color: context.colors.onSurface)),
                ),
              ),
            IconButton(key: const Key('face-colour-clear'), tooltip: 'Clear colours', onPressed: _ctrl.clearFaceColors, icon: const Icon(Icons.format_color_reset)),
          ],
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final wide = box.maxWidth >= 860;
      final viewer = ModelViewer(
        model: _model,
        controller: _ctrl,
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
      final panel = _Panel(solid: _solid, onChanged: _update, compact: !wide, display: _display(context));
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
  const _Panel({required this.solid, required this.onChanged, required this.compact, required this.display});
  final Solid solid;
  final Widget display;
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
          const SizedBox(height: Kx.s8),
          display,
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
