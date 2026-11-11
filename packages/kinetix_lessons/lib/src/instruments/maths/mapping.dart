import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Relations and functions on finite sets: the Cartesian product as a lattice of points, arrow
/// diagrams, properties of a relation on one set, equivalence classes and composition machines.
///
/// Preset: {"mode": "grid"|"arrow"|"self"|"classes"|"compose", "A": [1,2,3,4], "B": [1,…,6],
/// "rules": {"b = a + k": "b == a + k", …}, "rule": "b = a + k", "k": 2, "kRange": [1, 3],
/// "m": 3 (classes), "f": "2*x + 1", "g": "x^2", "fName": "f(x) = 2x + 1", "gName": "g(x) = x²",
/// "x0": 1.5, "order": "gf"}.
class MappingInstrument extends StatefulWidget {
  const MappingInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<MappingInstrument> createState() => _MappingState();
}

class _MappingState extends State<MappingInstrument> {
  String mode = 'arrow';
  List<int> A = [], B = [];
  Map<String, String> rules = {};
  String rule = '';
  double k = 2, kMin = 1, kMax = 3;
  Set<(int, int)> toggled = {}; // taps that flip a pair in or out of R
  int m = 3, c = 7;
  String f = '2*x + 1', g = 'x^2', fName = 'f(x) = 2x + 1', gName = 'g(x) = x²';
  double x0 = 1.5;
  bool gf = true;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Arrow diagram': {'mode': 'arrow', 'A': [1, 2, 3, 4], 'B': [1, 2, 3, 4, 5, 6], 'rules': {'b = a + k': 'b == a + k', 'b = k·a': 'b == k*a', 'a divides b': 'mod(b, a) == 0', 'a < b': 'a < b'}, 'rule': 'b = a + k', 'k': 2},
    'A × B': {'mode': 'grid', 'A': [1, 2, 3], 'B': [1, 2, 3, 4], 'rules': {'b = a + 1': 'b == a + 1', 'a ≤ b': 'a <= b'}, 'rule': 'a ≤ b'},
    'Properties': {'mode': 'self', 'A': [1, 2, 3, 4, 5, 6], 'rules': {'a ≤ b': 'a <= b', 'a < b': 'a < b', '|a − b| ≤ k': 'abs(a - b) <= k', 'k divides a − b': 'mod(a - b, k) == 0'}, 'rule': 'k divides a − b', 'k': 2, 'kRange': [1, 5]},
    'Composition': {'mode': 'compose'},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Arrow diagram']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> p) {
    mode = ps(p, 'mode', 'arrow');
    List<int> li(String key, List<int> f) => p[key] is List ? [for (final e in p[key] as List) (e as num).round()] : f;
    A = li('A', [1, 2, 3, 4]);
    B = li('B', mode == 'self' ? A : [1, 2, 3, 4, 5, 6]);
    if (mode == 'self') B = A;
    rules = p['rules'] is Map ? {for (final e in (p['rules'] as Map).entries) '${e.key}': '${e.value}'} : {'b = a + k': 'b == a + k'};
    rule = rules.containsKey(p['rule']) ? p['rule'] as String : rules.keys.first;
    k = pd(p, 'k', 2);
    final kr = pl(p, 'kRange', [1, 3]);
    kMin = kr[0];
    kMax = kr[1];
    toggled = {};
    m = pint(p, 'm', 3);
    c = pint(p, 'c', 7);
    f = ps(p, 'f', '2*x + 1');
    g = ps(p, 'g', 'x^2');
    fName = ps(p, 'fName', 'f(x) = 2x + 1');
    gName = ps(p, 'gName', 'g(x) = x²');
    x0 = pd(p, 'x0', 1.5);
    gf = ps(p, 'order', 'gf') == 'gf';
  }

  bool usesK() => rules[rule]?.contains('k') ?? false;

  bool inR(int a, int b) {
    final v = Expr.safe(rules[rule] ?? '0')({'a': a.toDouble(), 'b': b.toDouble(), 'k': k, 'x': a.toDouble(), 'y': b.toDouble()});
    final base = v != 0 && !v.isNaN;
    return toggled.contains((a, b)) ? !base : base;
  }

  List<(int, int)> get pairs => [for (final a in A) for (final b in B) if (inR(a, b)) (a, b)];

  @override
  Widget build(BuildContext context) {
    final R = pairs;
    final dom = {for (final p in R) p.$1}, ran = {for (final p in R) p.$2};
    late final List<Readout> ro;
    String title = 'Relations', formula = '';
    switch (mode) {
      case 'grid':
        title = 'A × B as a lattice of points';
        formula = 'n(A × B) = n(A) · n(B)';
        ro = [
          Readout('n(A × B)', '${A.length * B.length}', '', IX.accent),
          Readout('n(R)', '${R.length}', '', IX.positive),
          Readout('Relations from A to B', fmt(math.pow(2, A.length * B.length).toDouble(), 0), '', IX.inkSoft),
          Readout('Domain of R', '{${dom.toList()..sort()}}'.replaceAll('[', '').replaceAll(']', ''), '', IX.green),
        ];
      case 'self':
        final refl = A.every((a) => inR(a, a));
        final sym = R.every((p) => inR(p.$2, p.$1));
        final trans = R.every((p) => R.where((q) => q.$1 == p.$2).every((q) => inR(p.$1, q.$2)));
        title = 'Reflexive, symmetric, transitive?';
        formula = refl && sym && trans ? 'R is an equivalence relation' : 'R is not an equivalence relation';
        ro = [
          Readout('Reflexive', refl ? 'Yes' : 'No', '', refl ? IX.green : MX.red),
          Readout('Symmetric', sym ? 'Yes' : 'No', '', sym ? IX.green : MX.red),
          Readout('Transitive', trans ? 'Yes' : 'No', '', trans ? IX.green : MX.red),
          Readout('Pairs in R', '${R.length}', '', IX.accent),
        ];
      case 'classes':
        title = 'Equivalence classes';
        formula = 'a R b  ⇔  $m divides a − b';
        ro = [
          Readout('Class of $c', '[${c % m}]', '', IX.accent),
          Readout('Number of classes', '$m', '', IX.positive),
          Readout('Members 0 to 23', '${((23 - c % m) ~/ m) + 1}', '', IX.green),
        ];
      case 'compose':
        final fx = Expr.safe(f), gx = Expr.safe(g);
        final mid = (gf ? fx : gx)({'x': x0}), out = (gf ? gx : fx)({'x': mid});
        final other = (gf ? fx : gx)({'x': (gf ? gx : fx)({'x': x0})});
        title = gf ? 'Composition g ∘ f' : 'Composition f ∘ g';
        formula = gf ? '(g ∘ f)(x) = g(f(x))' : '(f ∘ g)(x) = f(g(x))';
        ro = [
          Readout('Input x', fmt(x0, 2), '', IX.ink),
          Readout('After the first machine', fmt(mid, 2), '', IX.accent),
          Readout(gf ? '(g ∘ f)(x)' : '(f ∘ g)(x)', fmt(out, 2), '', IX.positive),
          Readout(gf ? '(f ∘ g)(x), other order' : '(g ∘ f)(x), other order', fmt(other, 2), '', IX.inkSoft),
        ];
      default:
        final isFn = A.every((a) => R.where((p) => p.$1 == a).length == 1);
        final oneOne = isFn && ran.length == A.length;
        final onto = isFn && ran.length == B.length;
        title = 'Arrow diagram';
        formula = isFn ? 'f : A → B is ${oneOne && onto ? 'one-one and onto' : oneOne ? 'one-one, not onto' : onto ? 'onto, not one-one' : 'neither one-one nor onto'}' : 'R is not a function';
        ro = [
          Readout('n(R)', '${R.length}', '', IX.accent),
          Readout('Domain', '${dom.length} elements', '', IX.green),
          Readout('Range', '${ran.length} elements', '', IX.positive),
          Readout('Function?', isFn ? 'Yes' : 'No', '', isFn ? IX.green : MX.red),
        ];
    }
    return InstrumentFrame(
      id: 'maths-mapping',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Relations and functions',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'rule': rule, 'k': k, 'pairs': [for (final p in R) [p.$1, p.$2]]},
      readouts: ro,
      controls: [
        if (mode != 'classes' && mode != 'compose' && rules.length > 1) segs<String>('Rule', {for (final r in rules.keys) r: r}, rule, (v) => setState(() { rule = v; toggled = {}; })),
        if (mode != 'classes' && mode != 'compose' && usesK()) IxSlider(label: 'k', value: k, min: kMin, max: kMax, divisions: (kMax - kMin).round().clamp(1, 100), format: (v) => fmt(v, 0), onChanged: (v) => setState(() { k = v; toggled = {}; })),
        if (mode == 'grid' || mode == 'self') Text('Tap a point to put a pair in R or take it out.', style: IX.text(17, c: IX.inkSoft)),
        if (mode == 'classes') ...[
          IxSlider(label: 'm', value: m.toDouble(), min: 2, max: 6, divisions: 4, format: (v) => fmt(v, 0), onChanged: (v) => setState(() => m = v.round())),
          IxSlider(label: 'Element c', value: c.toDouble(), min: 0, max: 23, divisions: 23, format: (v) => fmt(v, 0), onChanged: (v) => setState(() => c = v.round())),
        ],
        if (mode == 'compose') ...[
          IxSegments<bool>(label: 'Order', options: const {true: 'g ∘ f', false: 'f ∘ g'}, value: gf, onChanged: (v) => setState(() => gf = v)),
          IxSlider(label: 'x', value: x0, min: -3, max: 3, divisions: 60, format: (v) => fmt(v, 1), onChanged: (v) => setState(() => x0 = v)),
        ],
      ],
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        return GestureDetector(
          onTapUp: (d) {
            if (mode != 'grid' && mode != 'self') return;
            final hit = _MapPainter.gridHit(this, size, d.localPosition);
            if (hit != null) setState(() => toggled = {...toggled}..toggle(hit));
          },
          child: CustomPaint(size: size, painter: _MapPainter(this)),
        );
      }),
    );
  }
}

extension<T> on Set<T> {
  void toggle(T v) => contains(v) ? remove(v) : add(v);
}

class _MapPainter extends CustomPainter {
  _MapPainter(this.s);
  final _MappingState s;

  static Plane _gridPlane(_MappingState s, Size size) {
    final rect = Rect.fromLTRB(100, 70, s.mode == 'grid' ? size.width * 0.56 : size.width * 0.6, size.height - 80);
    return Plane(rect, 0, s.A.length + 0.7, 0, s.B.length + 0.7, equal: true);
  }

  static (int, int)? gridHit(_MappingState s, Size size, Offset at) {
    final pl = _gridPlane(s, size);
    for (final a in s.A) {
      for (final b in s.B) {
        if ((pl.p(s.A.indexOf(a) + 1.0, s.B.indexOf(b) + 1.0) - at).distance < 26) return (a, b);
      }
    }
    return null;
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'grid':
      case 'self':
        _grid(c, size);
        if (s.mode == 'grid') _arrows(c, Rect.fromLTRB(size.width * 0.6, 60, size.width - 30, size.height - 60));
        if (s.mode == 'self') _roster(c, Rect.fromLTRB(size.width * 0.64, 70, size.width - 40, size.height - 70));
      case 'classes':
        _classes(c, size);
      case 'compose':
        _compose(c, size);
      default:
        _arrows(c, Rect.fromLTRB(80, 60, size.width - 80, size.height - 60));
    }
  }

  void _grid(Canvas c, Size size) {
    final pl = _gridPlane(s, size);
    final ax = MPaint.stroke(IX.ink, 2);
    c.drawLine(pl.p(0, 0), pl.p(s.A.length + 0.6, 0), ax);
    c.drawLine(pl.p(0, 0), pl.p(0, s.B.length + 0.6), ax);
    IxPaint.label(c, s.mode == 'self' ? 'a ∈ A' : 'A', pl.p(s.A.length + 0.6, 0) + const Offset(10, 0), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
    IxPaint.label(c, s.mode == 'self' ? 'b ∈ A' : 'B', pl.p(0, s.B.length + 0.6) + const Offset(0, -10), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
    if (s.mode == 'self') IxPaint.dashed(c, pl.p(0.4, 0.4), pl.p(s.A.length + 0.5, s.A.length + 0.5), MPaint.stroke(IX.steel, 1.6));
    for (final (i, a) in s.A.indexed) {
      IxPaint.label(c, '$a', pl.p(i + 1.0, 0) + const Offset(0, 22), size: 20, color: IX.inkSoft, w: FontWeight.w600);
      for (final (j, b) in s.B.indexed) {
        if (i == 0) IxPaint.label(c, '$b', pl.p(0, j + 1.0) - const Offset(22, 0), size: 20, color: IX.inkSoft, w: FontWeight.w600);
        final at = pl.p(i + 1.0, j + 1.0);
        final on = s.inR(a, b);
        if (on) {
          c.drawCircle(at, 17, Paint()..color = IX.positive);
        } else {
          c.drawCircle(at, 11, Paint()..color = Colors.white);
          c.drawCircle(at, 11, MPaint.stroke(IX.steel, 2));
        }
      }
    }
    IxPaint.label(c, 'Filled: (a, b) ∈ R      Ring: (a, b) ∉ R', Offset(pl.rect.left, size.height - 34), size: 18, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  void _roster(Canvas c, Rect box) {
    final r = s.pairs;
    IxPaint.label(c, 'R = {', box.topLeft, size: 24, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
    var x = box.left + 20, y = box.top + 44;
    for (final (i, p) in r.indexed) {
      final t = '(${p.$1}, ${p.$2})${i < r.length - 1 ? ',' : ''}';
      final w = MPaint.measure(t, 21).width + 10;
      if (x + w > box.right) {
        x = box.left + 20;
        y += 34;
      }
      if (y > box.bottom - 40) {
        IxPaint.label(c, '…', Offset(x, y), size: 21, color: IX.inkSoft, align: Alignment.topLeft);
        break;
      }
      IxPaint.label(c, t, Offset(x, y), size: 21, color: p.$1 == p.$2 ? IX.accent : IX.inkSoft, align: Alignment.topLeft);
      x += w;
    }
    IxPaint.label(c, '}', Offset(box.left, y + 40), size: 24, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
  }

  void _arrows(Canvas c, Rect box) {
    final r = s.pairs;
    final ovalW = math.min(box.width * 0.22, 190.0);
    final la = Rect.fromCenter(center: Offset(box.left + ovalW / 2 + 10, box.center.dy + 10), width: ovalW, height: box.height - 60);
    final lb = Rect.fromCenter(center: Offset(box.right - ovalW / 2 - 10, box.center.dy + 10), width: ovalW, height: box.height - 60);
    for (final (o, col, name) in [(la, IX.accent, 'A'), (lb, IX.green, 'B')]) {
      c.drawOval(o, Paint()..color = col.withValues(alpha: 0.06));
      c.drawOval(o, MPaint.stroke(col, 3));
      IxPaint.label(c, name, Offset(o.center.dx, o.top - 16), size: 26, color: col, w: FontWeight.w700, align: Alignment.bottomCenter);
    }
    Offset pos(Rect o, int i, int n) => Offset(o.center.dx, o.top + o.height * (i + 1) / (n + 1));
    final dom = {for (final p in r) p.$1}, ran = {for (final p in r) p.$2};
    for (final p in r) {
      final a = pos(la, s.A.indexOf(p.$1), s.A.length), b = pos(lb, s.B.indexOf(p.$2), s.B.length);
      IxPaint.arrow(c, a + const Offset(24, 0), b - const Offset(26, 0), IX.positive.withValues(alpha: 0.85), width: 2.6, head: 15);
    }
    for (final (i, a) in s.A.indexed) {
      final at = pos(la, i, s.A.length);
      c.drawCircle(at, 20, Paint()..color = dom.contains(a) ? IX.accent : Colors.white);
      c.drawCircle(at, 20, MPaint.stroke(IX.accent, 2));
      IxPaint.label(c, '$a', at, size: 21, color: dom.contains(a) ? Colors.white : IX.accent, w: FontWeight.w600);
    }
    for (final (i, b) in s.B.indexed) {
      final at = pos(lb, i, s.B.length);
      c.drawCircle(at, 20, Paint()..color = ran.contains(b) ? IX.green : Colors.white);
      c.drawCircle(at, 20, MPaint.stroke(IX.green, 2));
      IxPaint.label(c, '$b', at, size: 21, color: ran.contains(b) ? Colors.white : IX.green, w: FontWeight.w600);
    }
    IxPaint.label(c, 'R : ${s.rule}', Offset(box.center.dx, box.bottom - 2), size: 22, color: IX.ink, w: FontWeight.w600, halo: true);
  }

  void _classes(Canvas c, Size size) {
    final m = s.m;
    final colW = (size.width - 120) / m;
    for (var r = 0; r < m; r++) {
      final x = 60 + colW * r;
      final rect = Rect.fromLTWH(x + 8, 110, colW - 16, size.height - 170);
      final hi = r == s.c % m;
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(18)), Paint()..color = hi ? IX.accentSoft : IX.page);
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(18)), MPaint.stroke(hi ? IX.accent : IX.rule, 2));
      IxPaint.label(c, '[$r]', Offset(rect.center.dx, 70), size: 30, color: hi ? IX.accent : IX.ink, w: FontWeight.w700);
      var row = 0;
      for (var n = r; n <= 23; n += m) {
        final at = Offset(rect.center.dx, rect.top + 44 + row * 58.0);
        final isC = n == s.c;
        c.drawCircle(at, 24, Paint()..color = isC ? IX.positive : Colors.white);
        c.drawCircle(at, 24, MPaint.stroke(isC ? IX.positive : (hi ? IX.accent : IX.steel), 2));
        IxPaint.label(c, '$n', at, size: 21, color: isC ? Colors.white : IX.ink, w: FontWeight.w600);
        row++;
      }
    }
    IxPaint.label(c, 'Every integer from 0 to 23 lands in exactly one class: the classes do not overlap and together make up the whole set.', Offset(size.width / 2, size.height - 30), size: 19, color: IX.inkSoft);
  }

  void _compose(Canvas c, Size size) {
    final fx = Expr.safe(s.f), gx = Expr.safe(s.g);
    final first = s.gf ? fx : gx, second = s.gf ? gx : fx;
    final n1 = s.gf ? s.fName : s.gName, n2 = s.gf ? s.gName : s.fName;
    final mid = first({'x': s.x0}), out = second({'x': mid});
    final y = size.height * 0.42;
    final xs = [size.width * 0.1, size.width * 0.5, size.width * 0.9];
    void machine(Offset at, String name, Color col) {
      final r = Rect.fromCenter(center: at, width: 250, height: 130);
      c.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 6)), const Radius.circular(20)), Paint()..color = const Color(0x1413165A));
      c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(20)), Paint()..color = col.withValues(alpha: 0.1));
      c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(20)), MPaint.stroke(col, 3));
      IxPaint.label(c, name, at, size: 24, color: col, w: FontWeight.w700);
    }

    void value(Offset at, double v, String cap) {
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: 150, height: 70), const Radius.circular(35)), Paint()..color = Colors.white);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: 150, height: 70), const Radius.circular(35)), MPaint.stroke(IX.ink, 2.5));
      IxPaint.label(c, fmt(v, 2), at, size: 28, color: IX.ink, w: FontWeight.w700);
      IxPaint.label(c, cap, at + const Offset(0, 56), size: 18, color: IX.inkSoft);
    }

    final m1 = Offset((xs[0] + xs[1]) / 2, y), m2 = Offset((xs[1] + xs[2]) / 2, y);
    IxPaint.arrow(c, Offset(xs[0] + 80, y), Offset(m1.dx - 130, y), IX.ink, width: 3);
    IxPaint.arrow(c, Offset(m1.dx + 130, y), Offset(xs[1] - 80, y), IX.ink, width: 3);
    IxPaint.arrow(c, Offset(xs[1] + 80, y), Offset(m2.dx - 130, y), IX.ink, width: 3);
    IxPaint.arrow(c, Offset(m2.dx + 130, y), Offset(xs[2] - 80, y), IX.ink, width: 3);
    machine(m1, n1, IX.accent);
    machine(m2, n2, IX.green);
    value(Offset(xs[0], y), s.x0, 'x');
    value(Offset(xs[1], y), mid, s.gf ? 'f(x)' : 'g(x)');
    value(Offset(xs[2], y), out, s.gf ? 'g(f(x))' : 'f(g(x))');
    // The other order underneath, for comparison.
    final other = (s.gf ? fx : gx)({'x': (s.gf ? gx : fx)({'x': s.x0})});
    final y2 = size.height * 0.78;
    final same = (other - out).abs() < 1e-9;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(size.width / 2, y2), width: size.width * 0.8, height: 110), const Radius.circular(18)), Paint()..color = IX.page);
    IxPaint.label(c, '${s.gf ? '(g ∘ f)' : '(f ∘ g)'}(${fmtT(s.x0)}) = ${fmt(out, 2)}      ${s.gf ? '(f ∘ g)' : '(g ∘ f)'}(${fmtT(s.x0)}) = ${fmt(other, 2)}', Offset(size.width / 2, y2 - 18), size: 26, color: IX.ink, w: FontWeight.w600);
    IxPaint.label(c, same ? 'Equal for this x, but not in general' : 'Different: composition depends on the order', Offset(size.width / 2, y2 + 24), size: 20, color: same ? IX.amber : IX.positive, w: FontWeight.w600);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
