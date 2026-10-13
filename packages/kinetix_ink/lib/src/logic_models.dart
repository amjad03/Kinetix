import 'dart:math' as math;
import 'dart:ui';

// The digital logic engine behind the logic gates lab and its board panel: gates with 1 to 8
// inputs, switches, clocks, LEDs, a hex 7-segment display and edge-triggered flip-flops (SR, D,
// JK, T); settled values, a clocked step that ripples through flip-flops clocked by others, truth
// tables, the Boolean expression behind each output, Quine–McCluskey minimisation (the K-map's
// groups), a parser for typed expressions, a circuit built from one, and textbook presets
// (adders, MUX/DEMUX, encoder/decoder, counters, a shift register). Pure Dart.

/// The gates a class meets, from the buffer to XNOR.
enum GateType { and, or, not, nand, nor, xor, xnor, buffer }

/// What a part of the circuit is: a gate, an input switch, a clock input, an output LED, an
/// edge-triggered flip-flop or a hex 7-segment display (four inputs, 8-4-2-1 from the top).
enum PartKind { gate, input, clock, led, flipFlop, segment7 }

/// The flip-flops: each is rising-edge triggered on its clock pin (the middle or lower pin).
enum FlipFlopType { sr, d, jk, t }

/// The most inputs a gate takes.
const maxGateInputs = 8;

/// The output of [g] for [inputs] (NOT and the buffer read the first input only; XOR and XNOR on
/// more than two inputs are odd and even parity). A missing input reads 0.
bool gateOutput(GateType g, List<bool> inputs) {
  final ins = inputs.length >= 2 ? inputs : [...inputs, for (var i = inputs.length; i < 2; i++) false];
  final a = ins[0];
  final all = ins.every((x) => x);
  final any = ins.any((x) => x);
  final odd = ins.where((x) => x).length.isOdd;
  return switch (g) {
    GateType.and => all,
    GateType.or => any,
    GateType.not => !a,
    GateType.nand => !all,
    GateType.nor => !any,
    GateType.xor => odd,
    GateType.xnor => !odd,
    GateType.buffer => a,
  };
}

/// How many input pins [g] has to begin with.
int gateInputs(GateType g) => g == GateType.not || g == GateType.buffer ? 1 : 2;

/// Whether [g] can take more than two inputs.
bool gateGrows(GateType g) => g != GateType.not && g != GateType.buffer;

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

String flipFlopName(FlipFlopType f) => switch (f) {
  FlipFlopType.sr => 'SR',
  FlipFlopType.d => 'D',
  FlipFlopType.jk => 'JK',
  FlipFlopType.t => 'T',
};

/// The input pin names of a flip-flop, top to bottom ('>' is the clock).
List<String> flipFlopPins(FlipFlopType f) => switch (f) {
  FlipFlopType.sr => const ['S', '>', 'R'],
  FlipFlopType.d => const ['D', '>'],
  FlipFlopType.jk => const ['J', '>', 'K'],
  FlipFlopType.t => const ['T', '>'],
};

/// The state a flip-flop takes at a rising clock edge from [q] and its input pins [ins] (SR with
/// both set holds: the forbidden case).
bool flipFlopNext(FlipFlopType f, bool q, List<bool> ins) {
  bool at(int i) => i < ins.length && ins[i];
  return switch (f) {
    FlipFlopType.sr => at(0) ? (at(2) ? q : true) : (at(2) ? false : q),
    FlipFlopType.d => at(0),
    FlipFlopType.jk => at(0) && at(2) ? !q : (at(0) ? true : (at(2) ? false : q)),
    FlipFlopType.t => at(0) ? !q : q,
  };
}

/// The segments (a to g) lit for hex digit [d] on a 7-segment display.
List<bool> sevenSegments(int d) {
  const masks = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71];
  final m = masks[d & 15];
  return [for (var i = 0; i < 7; i++) (m >> i) & 1 == 1];
}

/// One part on the circuit board. Input switches and clocks carry a [value] the teacher flips; a
/// flip-flop keeps its [state] (Q).
class LogicPart {
  LogicPart({required this.id, required this.kind, this.gate, this.flipFlop, required this.pos, this.value = false, this.label = '', int? inputs, this.state = false})
    : _inputs = inputs;

  final String id;
  final PartKind kind;
  final GateType? gate;
  final FlipFlopType? flipFlop;

  /// Top-left corner on the circuit board.
  Offset pos;
  bool value;
  String label;
  bool state;
  int? _inputs;

  /// A gate's input count (2 to [maxGateInputs] for the gates that grow).
  int get gateInputCount => _inputs ?? gateInputs(gate!);
  set gateInputCount(int n) => _inputs = gateGrows(gate!) ? n.clamp(2, maxGateInputs) : 1;

  int get inputCount => switch (kind) {
    PartKind.gate => gateInputCount,
    PartKind.led => 1,
    PartKind.flipFlop => flipFlopPins(flipFlop!).length,
    PartKind.segment7 => 4,
    _ => 0,
  };

  int get outputCount => switch (kind) {
    PartKind.led || PartKind.segment7 => 0,
    PartKind.flipFlop => 2,
    _ => 1,
  };
  bool get hasOutput => outputCount > 0;

  Size get size => switch (kind) {
    PartKind.gate => Size(96, math.max(64, 22.0 * inputCount)),
    PartKind.input => const Size(64, 44),
    PartKind.clock => const Size(72, 44),
    PartKind.led => const Size(44, 44),
    PartKind.flipFlop => const Size(96, 96),
    PartKind.segment7 => const Size(80, 120),
  };

  Rect get rect => pos & size;

  static double _spread(int n, int i) => n == 1 ? 0.5 : (n == 2 ? (i == 0 ? 0.3 : 0.7) : (i + 1) / (n + 1));

  /// Where input pin [i] is.
  Offset inPin(int i) => pos + Offset(0, size.height * _spread(inputCount, i));

  /// Where output pin [k] is (a flip-flop's Q on top, Q' below).
  Offset outPinAt(int k) => pos + Offset(size.width, size.height * _spread(outputCount, k));
  Offset get outPin => outPinAt(0);

  Map<String, Object?> toJson() => {
    'id': id,
    'k': kind.name,
    if (gate != null) 'g': gate!.name,
    if (flipFlop != null) 'ff': flipFlop!.name,
    'x': pos.dx.roundToDouble(),
    'y': pos.dy.roundToDouble(),
    if (value) 'v': true,
    if (state) 'q': true,
    if (label.isNotEmpty) 'l': label,
    if (_inputs != null) 'n': _inputs,
  };

  static LogicPart? fromJson(Object? o) {
    if (o is! Map) return null;
    final kind = PartKind.values.asNameMap()[o['k']];
    final id = o['id'];
    if (kind == null || id is! String) return null;
    final gate = GateType.values.asNameMap()[o['g']];
    final ff = FlipFlopType.values.asNameMap()[o['ff']];
    if (kind == PartKind.gate && gate == null || kind == PartKind.flipFlop && ff == null) return null;
    double d(Object? v) => v is num ? v.toDouble() : 0;
    final n = o['n'];
    return LogicPart(
      id: id,
      kind: kind,
      gate: gate,
      flipFlop: ff,
      pos: Offset(d(o['x']), d(o['y'])),
      value: o['v'] == true,
      state: o['q'] == true,
      label: o['l'] is String ? o['l'] as String : '',
      inputs: n is num && gate != null ? (gateGrows(gate) ? n.round().clamp(2, maxGateInputs) : 1) : null,
    );
  }
}

/// A wire from output [fromPin] of part [from] to input pin [pin] of part [to].
class LogicWire {
  const LogicWire(this.from, this.to, this.pin, {this.fromPin = 0});
  final String from, to;
  final int pin, fromPin;
}

/// The key of output [k] of part [id] in the values from [LogicCircuit.evaluate].
String outKey(String id, int k) => k == 0 ? id : '$id.$k';

/// A circuit of gates, switches, clocks, LEDs, flip-flops and displays. Wiring may not make a
/// loop of gates alone (every gate output is settled from the inputs); a loop through a
/// flip-flop is how counters and registers are made. Each input pin has at most one wire.
class LogicCircuit {
  LogicCircuit();

  factory LogicCircuit.fromJson(Map<String, Object?> j) {
    final c = LogicCircuit()..title = j['t'] is String ? j['t'] as String : '';
    for (final p in j['parts'] is List ? j['parts'] as List : const []) {
      final part = LogicPart.fromJson(p);
      if (part != null && c.part(part.id) == null) c.parts.add(part);
    }
    for (final w in j['wires'] is List ? j['wires'] as List : const []) {
      if (w is List && w.length >= 3 && w[0] is String && w[1] is String && w[2] is num) {
        final a = c.part(w[0] as String), b = c.part(w[1] as String);
        final pin = (w[2] as num).round(), fp = w.length > 3 && w[3] is num ? (w[3] as num).round() : 0;
        if (a != null && b != null && pin >= 0 && pin < b.inputCount && fp >= 0 && fp < a.outputCount && !c.wires.any((x) => x.to == b.id && x.pin == pin)) {
          c.wires.add(LogicWire(a.id, b.id, pin, fromPin: fp));
        }
      }
    }
    final n = j['next'];
    c._next = n is num ? math.max(n.round(), c.parts.length + 1) : c.parts.length + 1;
    while (c.parts.any((p) => p.id == 'p${c._next}')) {
      c._next++;
    }
    return c;
  }

  Map<String, Object?> toJson() => {
    if (title.isNotEmpty) 't': title,
    'parts': [for (final p in parts) p.toJson()],
    'wires': [for (final w in wires) [w.from, w.to, w.pin, if (w.fromPin != 0) w.fromPin]],
    'next': _next,
  };

  /// A copy to simulate on without touching this one.
  LogicCircuit copy() => LogicCircuit.fromJson(toJson());

  /// Takes the parts and wires of [other] in place of this circuit's.
  void replaceWith(LogicCircuit other) {
    parts
      ..clear()
      ..addAll(other.parts);
    wires
      ..clear()
      ..addAll(other.wires);
    _next = other._next;
    title = other.title;
  }

  String title = '';
  final parts = <LogicPart>[];
  final wires = <LogicWire>[];
  int _next = 1;

  LogicPart? part(String id) => parts.where((p) => p.id == id).firstOrNull;

  LogicPart add(PartKind kind, Offset pos, {GateType? gate, FlipFlopType? flipFlop, int? inputs}) {
    // The first free name, so a switch added after A was deleted is not a second B.
    final used = {for (final p in parts) p.label};
    String first(String Function(int n) name) {
      for (var n = 0;; n++) {
        if (!used.contains(name(n))) return name(n);
      }
    }

    final label = switch (kind) {
      PartKind.input => first((n) => n < 26 ? String.fromCharCode(0x41 + n) : 'X${n - 25}'),
      PartKind.led => first((n) => 'Q${n + 1}'),
      PartKind.clock => first((n) => 'CLK${n == 0 ? '' : n + 1}'),
      PartKind.flipFlop => first((n) => 'FF${n + 1}'),
      PartKind.segment7 => first((n) => 'DISP${n + 1}'),
      PartKind.gate => '',
    };
    final p = LogicPart(id: 'p${_next++}', kind: kind, gate: gate, flipFlop: flipFlop ?? (kind == PartKind.flipFlop ? FlipFlopType.d : null), pos: pos, label: label);
    if (inputs != null && gate != null) p.gateInputCount = inputs;
    parts.add(p);
    return p;
  }

  void remove(String id) {
    parts.removeWhere((p) => p.id == id);
    wires.removeWhere((w) => w.from == id || w.to == id);
  }

  /// Sets gate [id]'s input count, dropping wires to pins that went.
  void setInputs(String id, int n) {
    final p = part(id);
    if (p == null || p.kind != PartKind.gate) return;
    p.gateInputCount = n;
    wires.removeWhere((w) => w.to == id && w.pin >= p.inputCount);
  }

  /// Joins output [fromPin] of [from] to input [pin] of [to], replacing a wire already there.
  /// False when it is not possible (no such pin, or the wire would close a loop of gates).
  bool connect(String from, String to, int pin, {int fromPin = 0}) {
    final a = part(from), b = part(to);
    if (a == null || b == null || fromPin < 0 || fromPin >= a.outputCount || pin < 0 || pin >= b.inputCount) return false;
    final memory = a.kind == PartKind.flipFlop || b.kind == PartKind.flipFlop;
    if (!memory && (from == to || _reaches(to, from))) return false;
    wires.removeWhere((w) => w.to == to && w.pin == pin);
    wires.add(LogicWire(from, to, pin, fromPin: fromPin));
    return true;
  }

  /// Takes the wire off input [pin] of [to]; returns where it came from.
  String? detach(String to, int pin) => detachWire(to, pin)?.from;

  LogicWire? detachWire(String to, int pin) {
    final w = wires.where((w) => w.to == to && w.pin == pin).firstOrNull;
    if (w != null) wires.remove(w);
    return w;
  }

  /// Whether [from]'s output feeds through gates alone into [target] (a flip-flop breaks the path).
  bool _reaches(String from, String target, [Set<String>? seen]) {
    if (from == target) return true;
    final s = seen ?? <String>{};
    if (!s.add(from) || part(from)?.kind == PartKind.flipFlop) return false;
    return wires.where((w) => w.from == from).any((w) => _reaches(w.to, target, s));
  }

  LogicWire? wireInto(String id, int pin) => wires.where((w) => w.to == id && w.pin == pin).firstOrNull;

  /// Every part's output now, keyed by [outKey] (an LED's "output" is what it shows; a
  /// flip-flop's Q' is under `id.1`).
  Map<String, bool> evaluate() {
    final memo = <String, bool>{};
    final busy = <String>{};
    bool out(String id, int k) {
      final key = outKey(id, k);
      if (memo[key] case final v?) return v;
      final p = part(id);
      if (p == null || !busy.add(key)) return false;
      bool pin(int i) => switch (wireInto(id, i)) {
        final w? => out(w.from, w.fromPin),
        null => false,
      };
      final v = switch (p.kind) {
        PartKind.input || PartKind.clock => p.value,
        PartKind.gate => gateOutput(p.gate!, [for (var i = 0; i < p.inputCount; i++) pin(i)]),
        PartKind.led => pin(0),
        PartKind.flipFlop => k == 0 ? p.state : !p.state,
        PartKind.segment7 => false,
      };
      busy.remove(key);
      return memo[key] = v;
    }

    for (final p in parts) {
      out(p.id, 0);
      if (p.kind == PartKind.flipFlop) out(p.id, 1);
    }
    return memo;
  }

  /// The values on [p]'s input pins in [v].
  List<bool> inputsOf(LogicPart p, Map<String, bool> v) => [
    for (var i = 0; i < p.inputCount; i++)
      switch (wireInto(p.id, i)) {
        final w? => v[outKey(w.from, w.fromPin)] ?? false,
        null => false,
      },
  ];

  /// The hex digit a 7-segment display shows (top pin is 8, bottom is 1).
  int digitOf(LogicPart p, Map<String, bool> v) {
    final ins = inputsOf(p, v);
    var d = 0;
    for (final b in ins) {
      d = d * 2 + (b ? 1 : 0);
    }
    return d;
  }

  /// One tick of every clock input: flip-flops whose clock pin rose take their next state, and
  /// those clocked by them follow (a ripple counter).
  void tick() {
    final before = evaluate();
    for (final p in parts) {
      if (p.kind == PartKind.clock) p.value = !p.value;
    }
    settle(before);
  }

  /// Flips switch or clock [p] (a clock edge it makes reaches the flip-flops).
  void flip(LogicPart p) {
    final before = evaluate();
    p.value = !p.value;
    settle(before);
  }

  /// Clocks every flip-flop whose clock pin rose since [before], over and over while edges ripple.
  void settle(Map<String, bool> before) {
    var prev = before;
    for (var round = 0; round < 64; round++) {
      final now = evaluate();
      final next = <LogicPart, bool>{};
      for (final p in parts) {
        if (p.kind != PartKind.flipFlop) continue;
        final was = inputsOf(p, prev), ins = inputsOf(p, now);
        if (!was[1] && ins[1]) next[p] = flipFlopNext(p.flipFlop!, p.state, ins);
      }
      if (next.isEmpty) return;
      next.forEach((p, q) => p.state = q);
      prev = now;
    }
  }

  /// Every flip-flop to 0 and every clock low.
  void reset() {
    for (final p in parts) {
      if (p.kind == PartKind.flipFlop) p.state = false;
      if (p.kind == PartKind.clock) p.value = false;
    }
  }

  List<LogicPart> get inputs => [...parts.where((p) => p.kind == PartKind.input), ...parts.where((p) => p.kind == PartKind.clock)];
  List<LogicPart> get leds => parts.where((p) => p.kind == PartKind.led).toList();
  List<LogicPart> get flipFlops => parts.where((p) => p.kind == PartKind.flipFlop).toList();
  bool get sequential => parts.any((p) => p.kind == PartKind.flipFlop);

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

  /// The minterms (row numbers, first input most significant) where LED [led] is 1.
  Set<int> mintermsOf(LogicPart led, {int maxInputs = 6}) {
    final i = leds.indexOf(led);
    final rows = truthTable(maxInputs: maxInputs);
    return {for (final (m, r) in rows.indexed) if (i >= 0 && r.outs[i]) m};
  }

  /// The expression the wiring makes at [led] (or any part's output), as built from its gates.
  LogicExpr expressionOf(String id, {int fromPin = 0, int depth = 0}) {
    final p = part(id);
    if (p == null || depth > 64) return const LogicExpr.constant(false);
    LogicExpr pin(int i) => switch (wireInto(id, i)) {
      final w? => expressionOf(w.from, fromPin: w.fromPin, depth: depth + 1),
      null => const LogicExpr.constant(false),
    };
    return switch (p.kind) {
      PartKind.input || PartKind.clock => LogicExpr.variable(p.label),
      PartKind.led => pin(0),
      PartKind.flipFlop => fromPin == 0 ? LogicExpr.variable(p.label) : LogicExpr.not(LogicExpr.variable(p.label)),
      PartKind.segment7 => const LogicExpr.constant(false),
      PartKind.gate => switch (p.gate!) {
        GateType.not => LogicExpr.not(pin(0)),
        GateType.buffer => pin(0),
        final g => LogicExpr(_opOf(g), [for (var i = 0; i < p.inputCount; i++) pin(i)]),
      },
    };
  }
}

LogicOp _opOf(GateType g) => switch (g) {
  GateType.and => LogicOp.and,
  GateType.or => LogicOp.or,
  GateType.xor => LogicOp.xor,
  GateType.nand => LogicOp.nand,
  GateType.nor => LogicOp.nor,
  GateType.xnor => LogicOp.xnor,
  GateType.not => LogicOp.not,
  GateType.buffer => LogicOp.and,
};

// --- Boolean expressions ----------------------------------------------------------------------

enum LogicOp { variable, constant, not, and, or, xor, nand, nor, xnor }

/// A Boolean expression: a variable, 0 or 1, NOT of one, or AND/OR/XOR/NAND/NOR/XNOR of two or more.
class LogicExpr {
  const LogicExpr(this.op, this.args) : name = '', value = false;
  const LogicExpr.variable(this.name) : op = LogicOp.variable, args = const [], value = false;
  const LogicExpr.constant(this.value) : op = LogicOp.constant, args = const [], name = '';
  LogicExpr.not(LogicExpr a) : op = LogicOp.not, args = [a], name = '', value = false;

  final LogicOp op;
  final List<LogicExpr> args;
  final String name;
  final bool value;

  bool eval(Map<String, bool> env) => switch (op) {
    LogicOp.variable => env[name] ?? false,
    LogicOp.constant => value,
    LogicOp.not => !args[0].eval(env),
    LogicOp.and => args.every((a) => a.eval(env)),
    LogicOp.or => args.any((a) => a.eval(env)),
    LogicOp.xor => args.where((a) => a.eval(env)).length.isOdd,
    LogicOp.nand => !args.every((a) => a.eval(env)),
    LogicOp.nor => !args.any((a) => a.eval(env)),
    LogicOp.xnor => args.where((a) => a.eval(env)).length.isEven,
  };

  /// The variables in order of first appearance.
  List<String> get variables {
    final out = <String>[];
    void walk(LogicExpr e) {
      if (e.op == LogicOp.variable && !out.contains(e.name)) out.add(e.name);
      e.args.forEach(walk);
    }

    walk(this);
    return out;
  }

  int get _prec => switch (op) {
    LogicOp.or => 1,
    LogicOp.xor => 2,
    LogicOp.and => 3,
    _ => 4,
  };

  @override
  String toString() {
    String inner(LogicExpr e, int prec) {
      final s = e.toString();
      return e._prec < prec ? '($s)' : s;
    }

    return switch (op) {
      LogicOp.variable => name,
      LogicOp.constant => value ? '1' : '0',
      LogicOp.not => args[0].op == LogicOp.variable || args[0].op == LogicOp.constant ? "${args[0]}'" : "(${args[0]})'",
      LogicOp.and => args.map((a) => inner(a, 3)).join('·'),
      LogicOp.or => args.map((a) => inner(a, 1)).join(' + '),
      LogicOp.xor => args.map((a) => inner(a, 2)).join(' ⊕ '),
      LogicOp.nand => "(${LogicExpr(LogicOp.and, args)})'",
      LogicOp.nor => "(${LogicExpr(LogicOp.or, args)})'",
      LogicOp.xnor => "(${LogicExpr(LogicOp.xor, args)})'",
    };
  }
}

/// Reads a Boolean expression as written on the board: `+` or `|` for OR, `·` `.` `*` `&` or two
/// terms side by side for AND, `⊕` or `^` for XOR, a trailing `'` or a leading `!` `~` `¬` for
/// NOT, brackets, 0 and 1. A variable is a letter and any digits after it (A, B, X1). A leading
/// `F =` names the output. Throws [FormatException] when it cannot.
({String? output, LogicExpr expr}) parseLogic(String text) {
  var s = text.trim();
  String? output;
  final eq = s.indexOf('=');
  if (eq > 0) {
    output = s.substring(0, eq).trim();
    s = s.substring(eq + 1);
    if (!RegExp(r'^[A-Za-z][A-Za-z0-9_]*$').hasMatch(output)) throw const FormatException('Output name');
  }
  final p = _Parser(s);
  final e = p.or();
  p.skip();
  if (p.i < s.length) throw FormatException('Unexpected "${s[p.i]}"', s, p.i);
  return (output: output, expr: e);
}

class _Parser {
  _Parser(this.s);
  final String s;
  int i = 0;

  void skip() {
    while (i < s.length && s[i].trim().isEmpty) {
      i++;
    }
  }

  bool eat(Set<String> chars) {
    skip();
    if (i < s.length && chars.contains(s[i])) {
      i++;
      return true;
    }
    return false;
  }

  LogicExpr _flat(LogicOp op, List<LogicExpr> xs) => xs.length == 1 ? xs.first : LogicExpr(op, xs);

  LogicExpr or() {
    final xs = [xor()];
    while (eat(const {'+', '|'})) {
      xs.add(xor());
    }
    return _flat(LogicOp.or, xs);
  }

  LogicExpr xor() {
    final xs = [and()];
    while (eat(const {'^', '⊕'})) {
      xs.add(and());
    }
    return _flat(LogicOp.xor, xs);
  }

  bool get _startsPrimary {
    skip();
    if (i >= s.length) return false;
    final c = s[i];
    return RegExp(r'[A-Za-z01(!~¬]').hasMatch(c);
  }

  LogicExpr and() {
    final xs = [unary()];
    while (true) {
      if (eat(const {'·', '.', '*', '&', '∙'})) {
        xs.add(unary());
      } else if (_startsPrimary) {
        xs.add(unary());
      } else {
        break;
      }
    }
    return _flat(LogicOp.and, xs);
  }

  LogicExpr unary() {
    if (eat(const {'!', '~', '¬'})) return LogicExpr.not(unary());
    var e = primary();
    while (eat(const {"'", '’', '′'})) {
      e = LogicExpr.not(e);
    }
    return e;
  }

  LogicExpr primary() {
    skip();
    if (i >= s.length) throw FormatException('Expression ends early', s, i);
    final c = s[i];
    if (c == '(') {
      i++;
      final e = or();
      if (!eat(const {')'})) throw FormatException('Missing )', s, i);
      return e;
    }
    if (c == '0' || c == '1') {
      i++;
      return LogicExpr.constant(c == '1');
    }
    final m = RegExp(r'[A-Za-z][0-9]*').matchAsPrefix(s, i);
    if (m == null) throw FormatException('Unexpected "$c"', s, i);
    i = m.end;
    return LogicExpr.variable(m[0]!);
  }
}

/// Each row's value of [e] over [vars] (row m: the first variable most significant).
List<bool> exprTable(LogicExpr e, List<String> vars) => [
  for (var m = 0; m < 1 << vars.length; m++) e.eval({for (var i = 0; i < vars.length; i++) vars[i]: (m >> (vars.length - 1 - i)) & 1 == 1}),
];

/// Builds the gates for [e]: switches down the left (in [vars] order, else the expression's),
/// gates in columns by depth, and an LED named [output] on the right.
LogicCircuit circuitFromExpr(LogicExpr e, {List<String>? vars, String output = 'Q1'}) {
  final c = LogicCircuit();
  final names = vars ?? (e.variables.toList()..sort());
  final ins = <String, String>{};
  for (final (i, v) in names.indexed) {
    final p = c.add(PartKind.input, Offset(24, 30 + i * 80.0))..label = v;
    ins[v] = p.id;
  }
  int depth(LogicExpr x) => x.op == LogicOp.variable ? 0 : 1 + x.args.fold(0, (m, a) => math.max(m, depth(a)));
  final total = math.max(1, depth(e));
  final perColumn = <int, int>{};
  Offset spot(int d) {
    final col = total - d;
    final row = perColumn[col] = (perColumn[col] ?? -1) + 1;
    return Offset(160 + col * 150.0, 24 + row * 110.0);
  }

  String build(LogicExpr x, int d) {
    switch (x.op) {
      case LogicOp.variable:
        return ins[x.name] ?? (ins[x.name] = (c.add(PartKind.input, Offset(24, 30 + ins.length * 80.0))..label = x.name).id);
      case LogicOp.constant:
        // An unwired NOT gives 1, an unwired buffer 0.
        return c.add(PartKind.gate, spot(d), gate: x.value ? GateType.not : GateType.buffer).id;
      case LogicOp.not:
        final g = c.add(PartKind.gate, spot(d), gate: GateType.not);
        c.connect(build(x.args[0], d - 1), g.id, 0);
        return g.id;
      default:
        var args = x.args;
        final g = switch (x.op) {
          LogicOp.and => GateType.and,
          LogicOp.or => GateType.or,
          LogicOp.xor => GateType.xor,
          LogicOp.nand => GateType.nand,
          LogicOp.nor => GateType.nor,
          _ => GateType.xnor,
        };
        // More than eight inputs: the first seven and a gate of the rest (same kind, un-negated).
        if (args.length > maxGateInputs) {
          final base = switch (g) {
            GateType.nand => LogicOp.and,
            GateType.nor => LogicOp.or,
            GateType.xnor => LogicOp.xor,
            _ => x.op,
          };
          args = [...args.take(maxGateInputs - 1), LogicExpr(base, args.skip(maxGateInputs - 1).toList())];
        }
        final part = c.add(PartKind.gate, spot(d), gate: g, inputs: args.length);
        for (final (i, a) in args.indexed) {
          c.connect(build(a, d - 1), part.id, i);
        }
        return part.id;
    }
  }

  final root = build(e, total);
  final led = c.add(PartKind.led, Offset(160 + (total + 1) * 150.0, 40))..label = output;
  c.connect(root, led.id, 0);
  return c;
}

// --- Minimisation (Quine–McCluskey; the K-map's groups) -------------------------------------------

/// A product term over n variables: [mask] bits are the variables left out (a K-map group's
/// size is 2^popcount(mask)); the other bits of [bits] say which are true.
class Implicant {
  const Implicant(this.bits, this.mask);
  final int bits, mask;

  bool covers(int m) => (m & ~mask) == (bits & ~mask);

  int literals(int n) => n - _pop(mask);

  /// The product, e.g. AB'D ('1' when every variable is left out).
  String term(List<String> vars) {
    final n = vars.length;
    final long = vars.any((v) => v.length > 1);
    final lits = [
      for (var i = 0; i < n; i++)
        if ((mask >> (n - 1 - i)) & 1 == 0) "${vars[i]}${(bits >> (n - 1 - i)) & 1 == 1 ? '' : "'"}",
    ];
    return lits.isEmpty ? '1' : lits.join(long ? '·' : '');
  }

  /// The sum for a POS group of zeros, e.g. (A + B' + D).
  String sumTerm(List<String> vars) {
    final n = vars.length;
    final lits = [
      for (var i = 0; i < n; i++)
        if ((mask >> (n - 1 - i)) & 1 == 0) "${vars[i]}${(bits >> (n - 1 - i)) & 1 == 1 ? "'" : ''}",
    ];
    return lits.isEmpty ? '0' : (lits.length == 1 ? lits.first : '(${lits.join(' + ')})');
  }

  @override
  bool operator ==(Object other) => other is Implicant && other.mask == mask && (other.bits & ~mask) == (bits & ~mask);
  @override
  int get hashCode => Object.hash(bits & ~mask, mask);
}

int _pop(int x) {
  var c = 0;
  for (var v = x; v != 0; v &= v - 1) {
    c++;
  }
  return c;
}

/// The prime implicants of the function that is 1 on [minterms] (and may be 1 on [dontCares]).
List<Implicant> primeImplicants(int n, Set<int> minterms, {Set<int> dontCares = const {}}) {
  var current = {for (final m in {...minterms, ...dontCares}) Implicant(m, 0)};
  final primes = <Implicant>{};
  while (current.isNotEmpty) {
    final next = <Implicant>{};
    final used = <Implicant>{};
    final list = current.toList();
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        final a = list[i], b = list[j];
        if (a.mask != b.mask) continue;
        final diff = (a.bits ^ b.bits) & ~a.mask & ((1 << n) - 1);
        if (diff != 0 && diff & (diff - 1) == 0) {
          next.add(Implicant(a.bits & ~diff, a.mask | diff));
          used
            ..add(a)
            ..add(b);
        }
      }
    }
    primes.addAll(current.where((x) => !used.contains(x)));
    current = next;
  }
  return primes.toList()..sort((a, b) => a.literals(n) != b.literals(n) ? a.literals(n) - b.literals(n) : a.bits - b.bits);
}

/// A minimal sum of products for the function that is 1 on [minterms]: the essential prime
/// implicants, then the fewest (and then smallest) others that cover the rest.
List<Implicant> minimise(int n, Set<int> minterms, {Set<int> dontCares = const {}}) {
  if (minterms.isEmpty) return const [];
  final primes = primeImplicants(n, minterms, dontCares: dontCares);
  final chosen = <Implicant>[];
  final left = {...minterms};
  for (final m in minterms) {
    final by = primes.where((p) => p.covers(m)).toList();
    if (by.length == 1 && !chosen.contains(by.first)) chosen.add(by.first);
  }
  left.removeWhere((m) => chosen.any((p) => p.covers(m)));
  if (left.isEmpty) return chosen;
  final rest = primes.where((p) => !chosen.contains(p) && left.any(p.covers)).toList();
  if (rest.length <= 18) {
    for (var k = 1; k <= rest.length; k++) {
      List<Implicant>? best;
      var bestLits = 1 << 30;
      void pick(int from, List<Implicant> got) {
        if (got.length == k) {
          if (left.every((m) => got.any((p) => p.covers(m)))) {
            final lits = got.fold(0, (s, p) => s + p.literals(n));
            if (lits < bestLits) {
              bestLits = lits;
              best = [...got];
            }
          }
          return;
        }
        for (var i = from; i < rest.length; i++) {
          pick(i + 1, [...got, rest[i]]);
        }
      }

      pick(0, []);
      if (best != null) return [...chosen, ...best!];
    }
  }
  // Too many to try every set: the one covering most of what is left, each time.
  while (left.isNotEmpty) {
    rest.sort((a, b) => left.where(b.covers).length - left.where(a.covers).length);
    chosen.add(rest.first);
    left.removeWhere(rest.first.covers);
  }
  return chosen;
}

/// The minimal sum of products as text ('0' and '1' for the constants).
String sopText(List<Implicant> terms, List<String> vars, {bool allOnes = false}) =>
    allOnes ? '1' : (terms.isEmpty ? '0' : terms.map((t) => t.term(vars)).join(' + '));

/// The minimal product of sums: the zeros grouped, each group a sum.
String posText(int n, Set<int> minterms, List<String> vars, {Set<int> dontCares = const {}}) {
  final zeros = {for (var m = 0; m < 1 << n; m++) if (!minterms.contains(m) && !dontCares.contains(m)) m};
  if (zeros.isEmpty) return '1';
  final groups = minimise(n, zeros, dontCares: dontCares);
  if (groups.length == 1 && groups.first.mask == (1 << n) - 1) return '0';
  final sums = [for (final g in groups) g.sumTerm(vars)];
  if (sums.length == 1 && sums.first.startsWith('(')) return sums.first.substring(1, sums.first.length - 1);
  return sums.join('');
}

/// The minterm in K-map cell ([row], [col]) for [n] (2 to 4) variables: the first ⌊n/2⌋
/// variables down the side, the rest across the top, both in Gray code order.
int kmapMinterm(int n, int row, int col) {
  final colVars = n - n ~/ 2;
  int gray(int i) => i ^ (i >> 1);
  return (gray(row) << colVars) | gray(col);
}

/// The K-map's rows and columns for [n] variables.
(int rows, int cols) kmapShape(int n) => (1 << (n ~/ 2), 1 << (n - n ~/ 2));

/// The Gray code labels along an edge of [bits] variables ('0','1' or '00','01','11','10').
List<String> kmapLabels(int bits) => [for (var i = 0; i < 1 << bits; i++) (i ^ (i >> 1)).toRadixString(2).padLeft(bits, '0')];

// --- Presets ----------------------------------------------------------------------------------

/// The textbook circuits the lab offers ready-wired.
enum LogicPreset { halfAdder, fullAdder, mux2, mux4, demux4, decoder2to4, encoder4to2, srFlipFlop, dFlipFlop, jkFlipFlop, tFlipFlop, rippleCounter, syncCounter, shiftRegister }

String logicPresetName(LogicPreset p) => switch (p) {
  LogicPreset.halfAdder => 'Half adder',
  LogicPreset.fullAdder => 'Full adder',
  LogicPreset.mux2 => '2:1 multiplexer',
  LogicPreset.mux4 => '4:1 multiplexer',
  LogicPreset.demux4 => '1:4 demultiplexer',
  LogicPreset.decoder2to4 => '2-to-4 decoder',
  LogicPreset.encoder4to2 => '4-to-2 encoder',
  LogicPreset.srFlipFlop => 'SR flip-flop',
  LogicPreset.dFlipFlop => 'D flip-flop',
  LogicPreset.jkFlipFlop => 'JK flip-flop',
  LogicPreset.tFlipFlop => 'T flip-flop',
  LogicPreset.rippleCounter => '3-bit ripple counter',
  LogicPreset.syncCounter => '3-bit synchronous counter',
  LogicPreset.shiftRegister => '4-bit shift register (SIPO)',
};

LogicCircuit logicPreset(LogicPreset p) {
  final c = LogicCircuit()..title = logicPresetName(p);
  LogicPart sw(String l, int row) => c.add(PartKind.input, Offset(24, 30 + row * 80.0))..label = l;
  LogicPart led(String l, int row, [double x = 700]) => c.add(PartKind.led, Offset(x, 40 + row * 80.0))..label = l;
  LogicPart gate(GateType g, double x, double y, [int n = 2]) => c.add(PartKind.gate, Offset(x, y), gate: g, inputs: gateGrows(g) ? n : null);
  void w(LogicPart a, LogicPart b, int pin, [int fromPin = 0]) => c.connect(a.id, b.id, pin, fromPin: fromPin);
  LogicPart ff(FlipFlopType t, double x, double y, String l) => c.add(PartKind.flipFlop, Offset(x, y), flipFlop: t)..label = l;

  switch (p) {
    case LogicPreset.halfAdder:
      final a = sw('A', 0), b = sw('B', 1);
      final x = gate(GateType.xor, 240, 20), n = gate(GateType.and, 240, 140);
      final s = led('S', 0, 460), cy = led('C', 2, 460);
      w(a, x, 0); w(b, x, 1); w(a, n, 0); w(b, n, 1); w(x, s, 0); w(n, cy, 0);
    case LogicPreset.fullAdder:
      final a = sw('A', 0), b = sw('B', 1), cin = sw('Cin', 2);
      final x1 = gate(GateType.xor, 200, 20), x2 = gate(GateType.xor, 400, 40);
      final a1 = gate(GateType.and, 200, 200), a2 = gate(GateType.and, 400, 160), o = gate(GateType.or, 580, 190);
      final s = led('S', 0, 760), cout = led('Cout', 2, 760);
      w(a, x1, 0); w(b, x1, 1); w(x1, x2, 0); w(cin, x2, 1); w(x2, s, 0);
      w(a, a1, 0); w(b, a1, 1); w(x1, a2, 0); w(cin, a2, 1); w(a1, o, 1); w(a2, o, 0); w(o, cout, 0);
    case LogicPreset.mux2:
      final i0 = sw('I0', 0), i1 = sw('I1', 1), s = sw('S', 2);
      final n = gate(GateType.not, 160, 260, 1), a0 = gate(GateType.and, 320, 20), a1 = gate(GateType.and, 320, 160), o = gate(GateType.or, 500, 90);
      final y = led('Y', 1, 680);
      w(s, n, 0); w(i0, a0, 0); w(n, a0, 1); w(i1, a1, 0); w(s, a1, 1); w(a0, o, 0); w(a1, o, 1); w(o, y, 0);
    case LogicPreset.mux4:
      final ins = [for (var i = 0; i < 4; i++) sw('I$i', i)];
      final s1 = sw('S1', 4), s0 = sw('S0', 5);
      final n1 = gate(GateType.not, 150, 330, 1), n0 = gate(GateType.not, 150, 420, 1);
      w(s1, n1, 0); w(s0, n0, 0);
      final o = gate(GateType.or, 560, 120, 4);
      for (var i = 0; i < 4; i++) {
        final a = gate(GateType.and, 340, 10 + i * 100.0, 3);
        w(ins[i], a, 0);
        w(i & 2 == 0 ? n1 : s1, a, 1);
        w(i & 1 == 0 ? n0 : s0, a, 2);
        w(a, o, i);
      }
      w(o, led('Y', 2, 740), 0);
    case LogicPreset.demux4:
      final d = sw('D', 0), s1 = sw('S1', 1), s0 = sw('S0', 2);
      final n1 = gate(GateType.not, 150, 120, 1), n0 = gate(GateType.not, 150, 220, 1);
      w(s1, n1, 0); w(s0, n0, 0);
      for (var i = 0; i < 4; i++) {
        final a = gate(GateType.and, 360, 10 + i * 100.0, 3);
        w(d, a, 0);
        w(i & 2 == 0 ? n1 : s1, a, 1);
        w(i & 1 == 0 ? n0 : s0, a, 2);
        w(a, led('Y$i', i, 560), 0);
      }
    case LogicPreset.decoder2to4:
      final a = sw('A', 0), b = sw('B', 1);
      final na = gate(GateType.not, 150, 160, 1), nb = gate(GateType.not, 150, 250, 1);
      w(a, na, 0); w(b, nb, 0);
      for (var i = 0; i < 4; i++) {
        final g = gate(GateType.and, 340, 10 + i * 100.0);
        w(i & 2 == 0 ? na : a, g, 0);
        w(i & 1 == 0 ? nb : b, g, 1);
        w(g, led('Y$i', i, 540), 0);
      }
    case LogicPreset.encoder4to2:
      final ins = [for (var i = 0; i < 4; i++) sw('I$i', i)];
      final y1 = gate(GateType.or, 300, 60), y0 = gate(GateType.or, 300, 200);
      w(ins[2], y1, 0); w(ins[3], y1, 1); w(ins[1], y0, 0); w(ins[3], y0, 1);
      w(y1, led('Y1', 0, 500), 0);
      w(y0, led('Y0', 2, 500), 0);
    case LogicPreset.srFlipFlop || LogicPreset.dFlipFlop || LogicPreset.jkFlipFlop || LogicPreset.tFlipFlop:
      final t = switch (p) {
        LogicPreset.srFlipFlop => FlipFlopType.sr,
        LogicPreset.dFlipFlop => FlipFlopType.d,
        LogicPreset.jkFlipFlop => FlipFlopType.jk,
        _ => FlipFlopType.t,
      };
      final names = flipFlopPins(t);
      final f = ff(t, 300, 60, 'FF1');
      final clk = c.add(PartKind.clock, const Offset(24, 200));
      var row = 0;
      for (final (i, n) in names.indexed) {
        if (n == '>') {
          w(clk, f, i);
        } else {
          w(sw(n, row == 0 ? 0 : 3), f, i);
          row++;
        }
      }
      w(f, led('Q', 0, 520), 0);
      w(f, led("Q'", 2, 520), 0, 1);
    case LogicPreset.rippleCounter:
      final clk = c.add(PartKind.clock, const Offset(24, 120));
      final one = gate(GateType.not, 24, 260, 1);
      final ffs = [for (var i = 0; i < 3; i++) ff(FlipFlopType.t, 180 + i * 170.0, 80, 'FF$i')];
      final disp = c.add(PartKind.segment7, const Offset(760, 220));
      for (final (i, f) in ffs.indexed) {
        w(one, f, 0);
        if (i == 0) {
          w(clk, f, 1);
        } else {
          w(ffs[i - 1], f, 1, 1); // clocked by the previous Q': counts up
        }
        w(f, led('Q$i', 0, 220 + i * 170.0)..pos = Offset(220 + i * 170.0, 240), 0);
        w(f, disp, 3 - i);
      }
    case LogicPreset.syncCounter:
      final clk = c.add(PartKind.clock, const Offset(24, 120));
      final one = gate(GateType.not, 24, 260, 1);
      final ffs = [for (var i = 0; i < 3; i++) ff(FlipFlopType.jk, 260 + i * 200.0, 80, 'FF$i')];
      final and = gate(GateType.and, 400, 240);
      final disp = c.add(PartKind.segment7, const Offset(900, 220));
      w(one, ffs[0], 0); w(one, ffs[0], 2);
      w(ffs[0], ffs[1], 0); w(ffs[0], ffs[1], 2);
      w(ffs[0], and, 0); w(ffs[1], and, 1); w(and, ffs[2], 0); w(and, ffs[2], 2);
      for (final (i, f) in ffs.indexed) {
        w(clk, f, 1);
        w(f, led('Q$i', 0)..pos = Offset(300 + i * 200.0, 360), 0);
        w(f, disp, 3 - i);
      }
    case LogicPreset.shiftRegister:
      final din = sw('Din', 0);
      final clk = c.add(PartKind.clock, const Offset(24, 160));
      final ffs = [for (var i = 0; i < 4; i++) ff(FlipFlopType.d, 180 + i * 160.0, 40, 'FF$i')];
      for (final (i, f) in ffs.indexed) {
        w(i == 0 ? din : ffs[i - 1], f, 0);
        w(clk, f, 1);
        w(f, led('Q$i', 0)..pos = Offset(220 + i * 160.0, 200), 0);
      }
  }
  return c;
}
