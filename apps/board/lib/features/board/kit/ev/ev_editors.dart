import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import 'ev_strings.dart';

Widget _slider(BuildContext context, String key, String label, double v, double min, double max, ValueChanged<double> on, {String Function(double)? fmt, int? divisions}) => Row(
  children: [
    SizedBox(width: 200, child: Text('$label: ${(fmt ?? (x) => x.toStringAsFixed(1))(v)}', style: context.text.bodySmall)),
    Expanded(child: Slider(key: Key(key), value: v.clamp(min, max).toDouble(), min: min, max: max, divisions: divisions, onChanged: on)),
  ],
);

String _pct(double x) => '${(x * 100).round()}%';

/// The charging panel's editor: AC or DC, pack and charger sizes; the CC-CV curve follows.
class EvChargingEditorDialog extends StatefulWidget {
  const EvChargingEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<EvChargingEditorDialog> createState() => _EvChargingEditorDialogState();
}

class _EvChargingEditorDialogState extends State<EvChargingEditorDialog> {
  late EvChargingPanel _m = EvChargingPanel.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _m.title);

  KitElement get _current => widget.element.copyWith(data: _m.copyWith(title: _title.text).toJson());

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = evStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.evCharging);
    void set(EvChargingPanel x) => setState(() => _m = x);
    final m = _m;
    return AlertDialog(
      key: const Key('ev-charging-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 860,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('ev-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              LayoutBuilder(
                builder: (context, box) {
                  final w = math.min(box.maxWidth, 820.0);
                  return Center(
                    child: CustomPaint(key: const Key('ev-charging-preview'), size: Size(w, w * natural.height / natural.width), painter: _EvPainter(_current)),
                  );
                },
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (final v in EvChargeView.values)
                    ChoiceChip(
                      key: Key('ev-view-${v.name}'),
                      label: Text(s['view.${v.name}']),
                      selected: m.view == v,
                      onSelected: (_) => set(m.copyWith(view: v, chargerKw: v == EvChargeView.dc ? math.max(m.chargerKw, 50) : math.min(m.chargerKw, 22))),
                    ),
                  FilterChip(key: const Key('ev-connectors'), label: Text(s['connectors']), selected: m.connectors, onSelected: (v) => set(m.copyWith(connectors: v))),
                ],
              ),
              _slider(context, 'ev-kw', s['chargerKw'], m.chargerKw, 1, m.view == EvChargeView.dc ? 350 : 22, (v) => set(m.copyWith(chargerKw: (v * 10).roundToDouble() / 10))),
              _slider(context, 'ev-kwh', s['packKwh'], m.packKwh, 5, 120, (v) => set(m.copyWith(packKwh: v.roundToDouble()))),
              _slider(context, 'ev-volts', s['packVolts'], m.packVolts, 48, 800, (v) => set(m.copyWith(packVolts: v.roundToDouble())), fmt: (x) => '${x.round()} V'),
              _slider(context, 'ev-soc', s['socStart'], m.socStart, 0, 0.9, (v) => set(m.copyWith(socStart: (v * 100).roundToDouble() / 100)), fmt: _pct),
              _slider(context, 'ev-maxc', s['maxC'], m.maxC, 0.5, 4, (v) => set(m.copyWith(maxC: (v * 10).roundToDouble() / 10))),
              const SizedBox(height: Kx.s8),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('ev-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }
}

/// The power-flow editor: the mode, speed and torque on sliders, the stage efficiencies; with
/// "Animate" on, the dashes run along the arrows in the direction the power flows.
class EvFlowEditorDialog extends StatefulWidget {
  const EvFlowEditorDialog({super.key, required this.element});
  final KitElement element;

  @override
  State<EvFlowEditorDialog> createState() => _EvFlowEditorDialogState();
}

class _EvFlowEditorDialogState extends State<EvFlowEditorDialog> with SingleTickerProviderStateMixin {
  late EvPowerFlow _m = EvPowerFlow.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _m.title);
  late final Ticker _ticker = createTicker((t) => setState(() => _phase = (t.inMilliseconds / 1500) % 1));
  double _phase = 0;

  KitElement get _current => widget.element.copyWith(data: _m.copyWith(title: _title.text).toJson());

  @override
  void dispose() {
    _ticker.dispose();
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = evStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.evPowerFlow);
    void set(EvPowerFlow x) => setState(() => _m = x);
    final m = _m;
    final drive = m.mode == EvMode.driving || m.mode == EvMode.regen;
    return AlertDialog(
      key: const Key('ev-flow-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: 860,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('ev-flow-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              LayoutBuilder(
                builder: (context, box) {
                  final w = math.min(box.maxWidth, 820.0);
                  return Center(
                    child: CustomPaint(
                      key: const Key('ev-flow-preview'),
                      size: Size(w, w * natural.height / natural.width),
                      painter: _FlowPainter(m, widget.element.color, _phase),
                    ),
                  );
                },
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (final mode in EvMode.values)
                    ChoiceChip(key: Key('ev-mode-${mode.name}'), label: Text(s['mode.${mode.name}']), selected: m.mode == mode, onSelected: (_) => set(m.copyWith(mode: mode))),
                ],
              ),
              SwitchListTile(
                key: const Key('ev-animate'),
                contentPadding: EdgeInsets.zero,
                title: Text(s['animate']),
                value: _ticker.isActive,
                onChanged: (on) => setState(() {
                  if (on) {
                    _ticker.start();
                  } else {
                    _ticker.stop();
                  }
                }),
              ),
              ..._controls(s, m, set, drive),
              const SizedBox(height: Kx.s8),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('ev-flow-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  List<Widget> _controls(FeatureStrings s, EvPowerFlow m, void Function(EvPowerFlow) set, bool drive) => [
    _slider(context, 'ev-speed', s['speed'], m.speedKmh, 0, 150, (v) => set(m.copyWith(speedKmh: v.roundToDouble())), fmt: (x) => '${x.round()}'),
    if (drive) ...[
      _slider(context, 'ev-torque', s['torque'], m.torqueNm, 0, 300, (v) => set(m.copyWith(torqueNm: v.roundToDouble())), fmt: (x) => '${x.round()}'),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const Key('ev-cruise'),
          onPressed: () => set(m.copyWith(mode: EvMode.driving, torqueNm: double.parse(m.cruiseTorque.toStringAsFixed(1)))),
          icon: const Icon(Icons.speed),
          label: Text(s['cruise']),
        ),
      ),
    ],
    if (m.mode == EvMode.charging) ...[
      _slider(context, 'ev-flow-kw', s['chargerKw'], m.chargerKw, 1, 150, (v) => set(m.copyWith(chargerKw: (v * 10).roundToDouble() / 10))),
      _slider(context, 'ev-eff-c', s['effCharger'], m.effCharger, 0.8, 1, (v) => set(m.copyWith(effCharger: v)), fmt: _pct),
    ],
    _slider(context, 'ev-mass', s['mass'], m.massKg, 600, 3000, (v) => set(m.copyWith(massKg: (v / 10).roundToDouble() * 10)), fmt: (x) => '${x.round()}'),
    _slider(context, 'ev-gear', s['gear'], m.gear, 4, 14, (v) => set(m.copyWith(gear: (v * 10).roundToDouble() / 10))),
    _slider(context, 'ev-pack', s['packKwh'], m.packKwh, 5, 120, (v) => set(m.copyWith(packKwh: v.roundToDouble())), fmt: (x) => '${x.round()}'),
    _slider(context, 'ev-eff-i', s['effInverter'], m.effInverter, 0.8, 1, (v) => set(m.copyWith(effInverter: v)), fmt: _pct),
    _slider(context, 'ev-eff-m', s['effMotor'], m.effMotor, 0.8, 1, (v) => set(m.copyWith(effMotor: v)), fmt: _pct),
    _slider(context, 'ev-eff-g', s['effGear'], m.effGear, 0.8, 1, (v) => set(m.copyWith(effGear: v)), fmt: _pct),
    _slider(context, 'ev-aux', s['aux'], m.auxW, 0, 3000, (v) => set(m.copyWith(auxW: (v / 50).roundToDouble() * 50)), fmt: (x) => '${x.round()}'),
  ];
}

class _EvPainter extends CustomPainter {
  _EvPainter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size, rotation: 0));

  @override
  bool shouldRepaint(_EvPainter old) => !identical(old.e, e);
}

/// The power-flow panel with its moving dashes (the board itself shows it still).
class _FlowPainter extends CustomPainter {
  _FlowPainter(this.m, this.accent, this.phase);
  final EvPowerFlow m;
  final Color accent;
  final double phase;

  @override
  void paint(Canvas canvas, Size size) {
    final n = KitElement.naturalSizeOf(KitKind.evPowerFlow);
    canvas
      ..save()
      ..scale(size.width / n.width, size.height / n.height);
    final card = RRect.fromRectAndRadius(Offset.zero & n, const Radius.circular(10));
    canvas.drawRRect(card, Paint()..color = Colors.white);
    paintEvPowerFlow(canvas, m, n, accent, phase: phase);
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
  bool shouldRepaint(_FlowPainter old) => !identical(old.m, m) || old.phase != phase || old.accent != accent;
}
