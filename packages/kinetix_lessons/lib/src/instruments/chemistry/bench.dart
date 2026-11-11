import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../design.dart';

/// The live values of a chemistry instrument: every slider, choice and clock is a number.
typedef V = Map<String, double>;

extension VX on V {
  double g(String k, [double d = 0]) => this[k] ?? d;
  int i(String k, [int d = 0]) => (this[k] ?? d).round();
}

/// A control on the right rail.
sealed class Knob {
  const Knob(this.key, this.label);
  final String key, label;
}

/// A slider. [step] snaps it; [fmt] writes the value.
class Slide extends Knob {
  const Slide(super.key, super.label, this.min, this.max, {this.unit = '', this.digits = 1, this.step, this.fmt});
  final double min, max;
  final String unit;
  final int digits;
  final double? step;
  final String Function(double)? fmt;
}

/// A choice. The value is the option's index; a preset may name it by [ids] (or by label).
class Pick extends Knob {
  const Pick(super.key, super.label, this.options, {this.ids, this.chips = false});
  final List<String> options;
  final List<String>? ids;
  final bool chips;
}

/// A button that changes the values (add acid, spark, react, reset).
class Act extends Knob {
  const Act(String label, this.run, {this.icon = Icons.play_arrow_rounded}) : super('', label);
  final void Function(V v) run;
  final IconData icon;
}

/// A line of guidance in the controls card.
class Note extends Knob {
  const Note(String text) : super('', text);
}

/// One view of an instrument: what it draws, reads out and lets the teacher change.
class Mode {
  const Mode({
    required this.title,
    required this.subtitle,
    this.formula,
    this.titleOf,
    this.defaults = const {},
    this.knobs = const [],
    required this.readouts,
    required this.paint,
    this.presets = const {},
    this.tick,
    this.autoRun = false,
    this.rotate = false,
    this.drag,
    this.knobsOf,
  });
  final String title, subtitle;
  final String? formula;
  final String Function(V v)? titleOf;
  final Map<String, double> defaults;
  final List<Knob> knobs;
  final List<Knob> Function(V v)? knobsOf;
  final List<Readout> Function(V v) readouts;
  final void Function(Canvas c, Size s, V v) paint;
  final Map<String, Map<String, num>> presets;

  /// Advances a running view by dt seconds; it runs while v['_run'] is 1.
  final void Function(V v, double dt)? tick;
  final bool autoRun;

  /// Dragging the stage turns a 3-D model (yaw, pitch).
  final bool rotate;

  /// Dragging the stage sets a value from the finger position.
  final void Function(V v, Offset at, Size size)? drag;
}

/// The chemistry bench: one parameterised instrument with several views ([modes]). The lesson
/// preset picks the view with "mode" and sets any value by its key.
class ChemBench extends StatefulWidget {
  const ChemBench({super.key, required this.id, required this.modes, this.preset = const {}});
  final String id;
  final Map<String, Mode> modes;
  final Map<String, dynamic> preset;
  @override
  State<ChemBench> createState() => _ChemBenchState();
}

class _ChemBenchState extends State<ChemBench> with SingleTickerProviderStateMixin {
  late String mode;
  final V v = {};
  int? active;
  late final Ticker _ticker = createTicker(_tick);
  Duration _last = Duration.zero;

  Mode get m => widget.modes[mode]!;

  @override
  void initState() {
    super.initState();
    final want = widget.preset['mode'];
    mode = widget.modes.containsKey(want) ? want as String : widget.modes.keys.first;
    _reset(widget.preset);
    if (m.autoRun) v['_run'] = 1;
    _sync();
  }

  List<Knob> get _knobs => m.knobsOf?.call(v) ?? m.knobs;

  void _reset(Map<String, dynamic> p) {
    v
      ..clear()
      ..addAll(m.defaults)
      ..['yaw'] = m.defaults['yaw'] ?? 0.6
      ..['pitch'] = m.defaults['pitch'] ?? -0.35;
    for (final e in p.entries) {
      final val = e.value;
      if (val is num) {
        v[e.key] = val.toDouble();
      } else if (val is bool) {
        v[e.key] = val ? 1 : 0;
      } else if (val is String && e.key != 'mode') {
        for (final k in [...m.knobs, ...?m.knobsOf?.call(v)]) {
          if (k is Pick && k.key == e.key) {
            final ids = k.ids ?? k.options;
            final i = ids.indexOf(val);
            if (i >= 0) v[k.key] = i.toDouble();
          }
        }
      }
    }
  }

  void _sync() {
    if (v['_run'] == 1 && m.tick != null && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (v['_run'] != 1 && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _tick(Duration t) {
    final dt = _last == Duration.zero ? 0.016 : ((t - _last).inMicroseconds / 1e6).clamp(0.0, 0.1);
    _last = t;
    setState(() {
      m.tick!(v, dt);
      v['_t'] = v.g('_t') + dt;
    });
    _sync();
  }

  void _change(void Function() f) {
    setState(() {
      f();
      active = null;
    });
    _sync();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  Widget _knob(Knob k) => switch (k) {
    Slide s => IxSlider(
      label: s.label,
      value: v.g(s.key, s.min).clamp(s.min, s.max),
      min: s.min,
      max: s.max,
      unit: s.unit,
      divisions: s.step == null ? null : ((s.max - s.min) / s.step!).round(),
      format: s.fmt ?? (x) => x.toStringAsFixed(s.digits),
      onChanged: (x) => _change(() => v[s.key] = x),
    ),
    Pick p when !p.chips && p.options.length <= 4 => IxSegments<int>(
      label: p.label,
      options: {for (var i = 0; i < p.options.length; i++) i: p.options[i]},
      value: v.i(p.key),
      onChanged: (x) => _change(() => v[p.key] = x.toDouble()),
    ),
    Pick p => Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(p.label, style: IX.text(18, w: FontWeight.w500, c: IX.inkSoft)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (var i = 0; i < p.options.length; i++) PickChip(p.options[i], selected: v.i(p.key) == i, onTap: () => _change(() => v[p.key] = i.toDouble())),
        ]),
      ]),
    ),
    Act a => SizedBox(
      height: 54,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: IX.accent, padding: const EdgeInsets.symmetric(horizontal: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        onPressed: () => _change(() => a.run(v)),
        icon: Icon(a.icon, size: 24),
        label: FittedBox(child: Text(a.label, style: IX.text(19, w: FontWeight.w600, c: Colors.white))),
      ),
    ),
    Note n => Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(n.label, style: IX.text(17, c: IX.inkSoft, height: 1.35))),
  };

  List<Widget> _controls() {
    final out = <Widget>[];
    final ks = _knobs;
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] is Act) {
        final row = <Widget>[];
        while (i < ks.length && ks[i] is Act) {
          if (row.isNotEmpty) row.add(const SizedBox(width: 10));
          row.add(Expanded(child: _knob(ks[i])));
          i++;
        }
        i--;
        out.add(Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: row)));
      } else {
        out.add(_knob(ks[i]));
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final mm = m;
    final Widget canvas = CustomPaint(painter: _BenchPainter(mm.paint, v, v.g('_t') + v.g('yaw') * 7 + v.g('pitch') * 3 + v.length), child: const SizedBox.expand());
    Widget stage = canvas;
    if (mm.rotate || mm.drag != null) {
      stage = LayoutBuilder(builder: (context, box) {
        void at(Offset p) => _change(() => mm.drag!(v, p, box.biggest));
        return GestureDetector(
          onPanDown: mm.drag == null ? null : (d) => at(d.localPosition),
          onPanUpdate: (d) {
            if (mm.drag != null) {
              at(d.localPosition);
            } else {
              _change(() {
                v['yaw'] = v.g('yaw') + d.delta.dx * 0.011;
                v['pitch'] = (v.g('pitch') + d.delta.dy * 0.011).clamp(-1.5, 1.5);
              });
            }
          },
          child: canvas,
        );
      });
    }
    return InstrumentFrame(
      id: widget.id,
      subtitle: mm.subtitle,
      title: mm.titleOf?.call(v) ?? mm.title,
      formula: mm.formula,
      state: {'mode': mode, for (final e in v.entries) if (!e.key.startsWith('_')) e.key: e.value},
      readouts: mm.readouts(v),
      controls: _controls(),
      presets: [
        for (final (i, e) in mm.presets.entries.indexed)
          Preset(e.key, () {
            setState(() {
              _reset({for (final x in e.value.entries) x.key: x.value});
              if (mm.autoRun) v['_run'] = 1;
              active = i;
            });
            _sync();
          }),
      ],
      activePreset: active,
      stage: stage,
    );
  }
}

class _BenchPainter extends CustomPainter {
  _BenchPainter(this.f, this.v, this.stamp);
  final void Function(Canvas c, Size s, V v) f;
  final V v;
  final double stamp;
  @override
  void paint(Canvas c, Size s) => f(c, s, v);
  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

class PickChip extends StatelessWidget {
  const PickChip(this.label, {super.key, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: selected ? IX.accentSoft : IX.paper,
    shape: StadiumBorder(side: BorderSide(color: selected ? IX.accent : IX.rule, width: 1.5)),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10), child: Text(label, style: IX.text(18, w: FontWeight.w600, c: selected ? IX.accent : IX.ink))),
    ),
  );
}
