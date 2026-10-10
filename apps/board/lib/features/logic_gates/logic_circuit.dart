import 'dart:ui';

/// The gates a class meets, from the buffer to XNOR.
enum GateType { and, or, not, nand, nor, xor, xnor, buffer }

/// What a part of the circuit is: a gate, an input switch, a clock input, or an output LED.
enum PartKind { gate, input, clock, led }

/// The output of [g] for [inputs] (NOT and the buffer read the first input only).
bool gateOutput(GateType g, List<bool> inputs) {
  final a = inputs.isNotEmpty && inputs[0];
  final b = inputs.length > 1 && inputs[1];
  return switch (g) {
    GateType.and => a && b,
    GateType.or => a || b,
    GateType.not => !a,
    GateType.nand => !(a && b),
    GateType.nor => !(a || b),
    GateType.xor => a != b,
    GateType.xnor => a == b,
    GateType.buffer => a,
  };
}

/// How many input pins [g] has.
int gateInputs(GateType g) => g == GateType.not || g == GateType.buffer ? 1 : 2;

String gateName(GateType g) => switch (g) {
  GateType.and => 'AND',
  GateType.or => 'OR',
  GateType.not => 'NOT',
  GateType.nand => 'NAND',
  GateType.nor => 'NOR',
  GateType.xor => 'XOR',
  GateType.xnor => 'XNOR',
  GateType.buffer => 'BUFFER',
};

/// One part on the circuit board. Input switches and clocks carry a [value] the teacher flips.
class LogicPart {
  LogicPart({required this.id, required this.kind, this.gate, required this.pos, this.value = false, this.label = ''});

  final String id;
  final PartKind kind;
  final GateType? gate;

  /// Top-left corner on the circuit board.
  Offset pos;
  bool value;
  String label;

  int get inputCount => switch (kind) {
    PartKind.gate => gateInputs(gate!),
    PartKind.led => 1,
    _ => 0,
  };
  bool get hasOutput => kind != PartKind.led;

  Size get size => switch (kind) {
    PartKind.gate => const Size(96, 64),
    PartKind.input => const Size(64, 44),
    PartKind.clock => const Size(72, 44),
    PartKind.led => const Size(44, 44),
  };

  Rect get rect => pos & size;

  /// Where input pin [i] is.
  Offset inPin(int i) {
    final n = inputCount;
    return pos + Offset(0, size.height * (n == 1 ? 0.5 : (i == 0 ? 0.3 : 0.7)));
  }

  Offset get outPin => pos + Offset(size.width, size.height / 2);
}

/// A wire from a part's output to input pin [pin] of part [to].
class LogicWire {
  const LogicWire(this.from, this.to, this.pin);
  final String from, to;
  final int pin;
}

/// A circuit of gates, switches, clocks and LEDs. Wiring may not make a loop (every output is
/// settled from the inputs), and each input pin has at most one wire.
class LogicCircuit {
  final parts = <LogicPart>[];
  final wires = <LogicWire>[];
  int _next = 1;

  LogicPart? part(String id) => parts.where((p) => p.id == id).firstOrNull;

  LogicPart add(PartKind kind, Offset pos, {GateType? gate}) {
    final n = parts.where((p) => p.kind == kind).length;
    final label = switch (kind) {
      PartKind.input => String.fromCharCode(0x41 + n % 26),
      PartKind.led => 'Q${n + 1}',
      PartKind.clock => 'CLK${n == 0 ? '' : n + 1}',
      PartKind.gate => '',
    };
    final p = LogicPart(id: 'p${_next++}', kind: kind, gate: gate, pos: pos, label: label);
    parts.add(p);
    return p;
  }

  void remove(String id) {
    parts.removeWhere((p) => p.id == id);
    wires.removeWhere((w) => w.from == id || w.to == id);
  }

  /// Joins [from]'s output to input [pin] of [to], replacing a wire already there. False when it is not
  /// possible (no such pin, or the wire would close a loop).
  bool connect(String from, String to, int pin) {
    final a = part(from), b = part(to);
    if (a == null || b == null || !a.hasOutput || pin < 0 || pin >= b.inputCount || from == to) return false;
    if (_reaches(to, from)) return false;
    wires.removeWhere((w) => w.to == to && w.pin == pin);
    wires.add(LogicWire(from, to, pin));
    return true;
  }

  /// Takes the wire off input [pin] of [to]; returns where it came from.
  String? detach(String to, int pin) {
    final w = wires.where((w) => w.to == to && w.pin == pin).firstOrNull;
    if (w != null) wires.remove(w);
    return w?.from;
  }

  /// Whether [from]'s output feeds (directly or not) into [target].
  bool _reaches(String from, String target) {
    if (from == target) return true;
    return wires.where((w) => w.from == from).any((w) => _reaches(w.to, target));
  }

  /// Every part's output now (an LED's "output" is what it shows).
  Map<String, bool> evaluate() {
    final memo = <String, bool>{};
    bool out(String id) {
      if (memo.containsKey(id)) return memo[id]!;
      final p = part(id)!;
      final ins = [
        for (var i = 0; i < p.inputCount; i++)
          switch (wires.where((w) => w.to == id && w.pin == i).firstOrNull) {
            final w? => out(w.from),
            null => false,
          },
      ];
      return memo[id] = switch (p.kind) {
        PartKind.input || PartKind.clock => p.value,
        PartKind.gate => gateOutput(p.gate!, ins),
        PartKind.led => ins.first,
      };
    }

    for (final p in parts) {
      out(p.id);
    }
    return memo;
  }

  /// One tick of every clock input.
  void tick() {
    for (final p in parts) {
      if (p.kind == PartKind.clock) p.value = !p.value;
    }
  }

  List<LogicPart> get inputs => [...parts.where((p) => p.kind == PartKind.input), ...parts.where((p) => p.kind == PartKind.clock)];
  List<LogicPart> get leds => parts.where((p) => p.kind == PartKind.led).toList();

  /// Every combination of the inputs (at most [maxInputs]) with each LED's value; restores the switches.
  List<({List<bool> ins, List<bool> outs})> truthTable({int maxInputs = 4}) {
    final ins = inputs;
    if (ins.isEmpty || ins.length > maxInputs) return const [];
    final saved = [for (final p in ins) p.value];
    final rows = <({List<bool> ins, List<bool> outs})>[];
    for (var m = 0; m < 1 << ins.length; m++) {
      final row = [for (var i = 0; i < ins.length; i++) (m >> (ins.length - 1 - i)) & 1 == 1];
      for (var i = 0; i < ins.length; i++) {
        ins[i].value = row[i];
      }
      final v = evaluate();
      rows.add((ins: row, outs: [for (final l in leds) v[l.id]!]));
    }
    for (var i = 0; i < ins.length; i++) {
      ins[i].value = saved[i];
    }
    return rows;
  }
}
