import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// A live value shown in the readouts grid.
class Readout {
  const Readout(this.label, this.value, {this.unit = '', this.highlight = false, this.key});
  final String label, value, unit;
  final bool highlight;
  final Key? key;
}

/// The common frame of every lab: title bar with reset, the simulation, live readouts,
/// controls, and a short "aim / what to observe" card. Side panel when wide, one scrolling
/// column in a narrow pane.
class LabScaffold extends StatefulWidget {
  const LabScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.aim,
    required this.observe,
    required this.simulation,
    required this.readouts,
    required this.controls,
    required this.onReset,
    this.belowSimulation,
    this.formula,
  });

  final String title, subtitle, aim;
  final List<String> observe;
  final Widget simulation;
  final List<Readout> readouts;
  final List<Widget> controls;
  final VoidCallback onReset;

  /// A second visual under the simulation (a graph), when there is room.
  final Widget? belowSimulation;

  /// The governing formula, shown above the readouts.
  final String? formula;

  @override
  State<LabScaffold> createState() => _LabScaffoldState();
}

class _LabScaffoldState extends State<LabScaffold> {
  bool? _aimOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return LayoutBuilder(builder: (context, box) {
      final wide = box.maxWidth >= 900 && box.maxHeight >= 480;
      final aimOpen = _aimOpen ?? wide;
      final header = _Header(title: widget.title, subtitle: widget.subtitle, onReset: widget.onReset, compact: !wide);
      final aim = _AimCard(
        aim: widget.aim,
        observe: widget.observe,
        open: aimOpen,
        onToggle: () => setState(() => _aimOpen = !aimOpen),
      );
      final readouts = _Readouts(readouts: widget.readouts, formula: widget.formula, wide: wide);
      if (wide) {
        final panelW = (box.maxWidth * 0.3).clamp(360.0, 460.0);
        return ColoredBox(
          color: c.surface,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    header,
                    Expanded(flex: 3, child: _SimFrame(child: widget.simulation)),
                    if (widget.belowSimulation != null) Expanded(flex: 2, child: _SimFrame(child: widget.belowSimulation!)),
                    const SizedBox(height: Kx.s12),
                  ],
                ),
              ),
              SizedBox(
                width: panelW,
                child: ColoredBox(
                  color: c.surfaceContainerLow,
                  child: ListView(
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      readouts,
                      const SizedBox(height: Kx.s16),
                      ...widget.controls,
                      const SizedBox(height: Kx.s16),
                      aim,
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }
      final simH = (box.maxWidth * 0.8).clamp(240.0, box.maxHeight.isFinite ? (box.maxHeight * 0.55).clamp(240.0, 520.0) : 420.0);
      return ColoredBox(
        color: c.surface,
        child: ListView(
          padding: const EdgeInsets.only(bottom: Kx.s24),
          children: [
            header,
            SizedBox(height: simH, child: _SimFrame(child: widget.simulation)),
            if (widget.belowSimulation != null) SizedBox(height: simH * 0.8, child: _SimFrame(child: widget.belowSimulation!)),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  readouts,
                  const SizedBox(height: Kx.s16),
                  ...widget.controls,
                  const SizedBox(height: Kx.s16),
                  aim,
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.subtitle, required this.onReset, required this.compact});
  final String title, subtitle;
  final VoidCallback onReset;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s12, Kx.s8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: (compact ? context.text.titleLarge : context.text.headlineSmall)?.copyWith(fontWeight: FontWeight.w600)),
                Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
          ),
          compact
              ? IconButton.filledTonal(tooltip: 'Reset', onPressed: onReset, icon: const Icon(Icons.restart_alt))
              : FilledButton.tonalIcon(onPressed: onReset, icon: const Icon(Icons.restart_alt), label: const Text('Reset')),
        ],
      ),
    );
  }
}

class _SimFrame extends StatelessWidget {
  const _SimFrame({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s4, Kx.s12, Kx.s8),
      child: DecoratedBox(
        decoration: BoxDecoration(color: c.surfaceContainerLowest, borderRadius: Kx.radiusLg, border: Border.all(color: c.outlineVariant)),
        child: ClipRRect(borderRadius: Kx.radiusLg, child: child),
      ),
    );
  }
}

class _Readouts extends StatelessWidget {
  const _Readouts({required this.readouts, required this.formula, required this.wide});
  final List<Readout> readouts;
  final String? formula;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (formula != null)
          Container(
            margin: const EdgeInsets.only(bottom: Kx.s12),
            padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
            decoration: BoxDecoration(color: c.primaryContainer, borderRadius: Kx.radiusMd),
            child: Text(formula!, textAlign: TextAlign.center, style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w600)),
          ),
        LayoutBuilder(builder: (context, box) {
          final cols = box.maxWidth >= 300 ? 2 : 1;
          final w = (box.maxWidth - (cols - 1) * Kx.s8) / cols;
          return Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final r in readouts)
                SizedBox(
                  key: r.key,
                  width: w,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s8),
                    decoration: BoxDecoration(color: r.highlight ? c.tertiaryContainer : c.surfaceContainerHigh, borderRadius: Kx.radiusMd),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelMedium?.copyWith(color: r.highlight ? c.onTertiaryContainer : c.onSurfaceVariant)),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(text: r.value, style: (wide ? context.text.headlineSmall : context.text.titleLarge)?.copyWith(fontWeight: FontWeight.w700, color: r.highlight ? c.onTertiaryContainer : c.onSurface)),
                              if (r.unit.isNotEmpty) TextSpan(text: ' ${r.unit}', style: context.text.titleSmall?.copyWith(color: r.highlight ? c.onTertiaryContainer : c.onSurfaceVariant)),
                            ]),
                            maxLines: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        }),
      ],
    );
  }
}

class _AimCard extends StatelessWidget {
  const _AimCard({required this.aim, required this.observe, required this.open, required this.onToggle});
  final String aim;
  final List<String> observe;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      color: c.secondaryContainer,
      child: InkWell(
        borderRadius: Kx.radiusLg,
        onTap: onToggle,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.flag_outlined, color: c.onSecondaryContainer),
                  const SizedBox(width: Kx.s8),
                  Expanded(child: Text('Aim and what to observe', style: context.text.titleSmall?.copyWith(color: c.onSecondaryContainer, fontWeight: FontWeight.w700))),
                  Icon(open ? Icons.expand_less : Icons.expand_more, color: c.onSecondaryContainer),
                ],
              ),
              if (open) ...[
                const SizedBox(height: Kx.s8),
                Text(aim, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                const SizedBox(height: Kx.s8),
                for (final o in observe)
                  Padding(
                    padding: const EdgeInsets.only(top: Kx.s4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('•  ', style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                        Expanded(child: Text(o, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer))),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A labelled slider with its value shown large.
class LabSlider extends StatelessWidget {
  const LabSlider({
    super.key,
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.divisions,
    this.format,
    this.unit = '',
  });

  final String label;
  final double value, min, max;
  final int? divisions;
  final ValueChanged<double> onChanged;
  final String Function(double)? format;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final text = format?.call(value) ?? value.toStringAsFixed(1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: context.text.bodyLarge)),
            Text('$text${unit.isEmpty ? '' : ' $unit'}', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: c.primary)),
          ],
        ),
        Slider(value: value.clamp(min, max), min: min, max: max, divisions: divisions, onChanged: onChanged),
      ],
    );
  }
}

/// A heading between groups of controls.
class LabSectionLabel extends StatelessWidget {
  const LabSectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s8),
        child: Text(text, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
      );
}

/// Theme-aware colours used inside the simulations' painters.
class LabPalette {
  LabPalette(BuildContext context)
      : ink = context.colors.onSurface,
        muted = context.colors.onSurfaceVariant,
        grid = context.colors.outlineVariant,
        surface = context.colors.surfaceContainerLowest,
        primary = context.colors.primary,
        dark = Theme.of(context).brightness == Brightness.dark,
        textStyle = context.text.labelLarge ?? const TextStyle(fontSize: 14);

  final Color ink, muted, grid, surface, primary;
  final bool dark;
  final TextStyle textStyle;

  // Fixed accents that read on both light and dark backgrounds.
  Color get red => dark ? const Color(0xFFFF8A80) : const Color(0xFFD93025);
  Color get blue => dark ? const Color(0xFF8AB4F8) : const Color(0xFF1A62D6);
  Color get green => dark ? const Color(0xFF81C995) : const Color(0xFF188038);
  Color get amber => dark ? const Color(0xFFFDD663) : const Color(0xFFB06000);
  Color get purple => dark ? const Color(0xFFD7AEFB) : const Color(0xFF8430CE);
}

/// Draws text on a canvas with the lab's font.
void paintLabel(Canvas canvas, String text, Offset at, TextStyle style, {Alignment align = Alignment.center, Color? background, double padding = 4}) {
  final tp = TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr, maxLines: 1)..layout();
  final topLeft = at - Offset((align.x + 1) / 2 * tp.width, (align.y + 1) / 2 * tp.height);
  if (background != null) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(topLeft.dx - padding, topLeft.dy - padding / 2, tp.width + padding * 2, tp.height + padding), Radius.circular(padding * 1.5)),
      Paint()..color = background,
    );
  }
  tp.paint(canvas, topLeft);
  tp.dispose();
}
