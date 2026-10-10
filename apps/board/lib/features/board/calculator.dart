import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'panel/panel_host.dart';

/// The index just after the bracket that closes the one opened at [open] in [s].
int _closing(String s, int open) {
  var depth = 0;
  for (var i = open; i < s.length; i++) {
    if (s[i] == '(') depth++;
    if (s[i] == ')' && --depth == 0) return i + 1;
  }
  return s.length;
}

/// Sine, cosine and tangent take degrees (and their inverses give degrees) by working in
/// radians underneath: `sin(30)` becomes `sin((30)*pi/180)`.
String _degrees(String s) => _deg(s).replaceAll('#', '');

// The '#' marks calls already turned, so the loop does not meet them again.
String _deg(String s) {
  var out = s;
  while (true) {
    final m = RegExp(r'(?<![a-z#])(asin|acos|atan|sin|cos|tan)\(').firstMatch(out);
    if (m == null) return out;
    final open = m.end - 1, close = _closing(out, open);
    if (close <= open + 1 || out[close - 1] != ')') return out;
    final inner = _deg(out.substring(open + 1, close - 1));
    final name = m[1]!;
    final rep = name.startsWith('a') ? '($name#($inner)*180/pi)' : '$name#(($inner)*pi/180)';
    out = out.replaceRange(m.start, close, rep);
  }
}

/// 5! and 0! (whole numbers up to 170).
String _factorials(String s) => s.replaceAllMapped(RegExp(r'(\d+)!'), (m) {
  final n = int.parse(m[1]!);
  if (n > 170) return 'x';
  var f = 1.0;
  for (var i = 2; i <= n; i++) {
    f *= i;
  }
  return '$f';
});

/// The value of a calculator sum (+ − × ÷ ^ % √ π e, brackets, sin cos tan and their inverses,
/// ln, log, exp and n!), or null when it cannot be worked out. A trailing `%` is a hundredth.
/// With [degrees] the trig functions work in degrees.
double? evaluateSum(String sum, {bool degrees = false}) {
  var s = sum.replaceAll('√', 'sqrt').replaceAllMapped(RegExp(r'(\d+(?:\.\d+)?)%'), (m) => '(${m[1]}/100)').trim();
  if (s.isEmpty) return null;
  s = _factorials(s);
  if (degrees) s = _degrees(s);
  final f = compileGraph(s);
  final v = f?.call(0);
  return v == null || v.isNaN || v.isInfinite ? null : v;
}

/// [v] as a calculator shows it: up to ten significant digits, no trailing zeros.
String formatResult(double v) {
  if (v == v.roundToDouble() && v.abs() < 1e15) return v.toInt().toString();
  final t = v.toStringAsPrecision(10);
  return t.contains('e') ? t : t.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// How the calculator is laid out for the room it has: one column on a phone, wider keys on a
/// tablet, and (on an interactive flat panel or any wide panel) the scientific keys beside the
/// basic ones with big keys.
enum CalcSize { phone, tablet, wide }

CalcSize calcSizeFor(double width) => width < 420 ? CalcSize.phone : (width < 760 ? CalcSize.tablet : CalcSize.wide);

FeatureStrings calcStrings(BuildContext context) => FeatureStrings(boardLang(context), calcStringTable);

const calcStringTable = <String, Map<String, String>>{
  'en': {'basic': 'Basic', 'scientific': 'Scientific', 'deg': 'Degrees', 'rad': 'Radians', 'ans': 'Ans'},
  'hi': {'basic': 'सामान्य', 'scientific': 'वैज्ञानिक', 'deg': 'डिग्री', 'rad': 'रेडियन', 'ans': 'उत्तर'},
  'kn': {'basic': 'ಸಾಮಾನ್ಯ', 'scientific': 'ವೈಜ್ಞಾನಿಕ', 'deg': 'ಡಿಗ್ರಿ', 'rad': 'ರೇಡಿಯನ್', 'ans': 'ಉತ್ತರ'},
};

/// The board's calculator, basic and scientific: a keypad, the sum and its answer, which goes
/// on the board as text. It lays itself out for the room it is given (phone, tablet, panel).
class BoardCalculator extends StatefulWidget {
  const BoardCalculator({super.key, this.scientific = false});

  /// Starts with the scientific keys.
  final bool scientific;

  /// Opens it; returns "sum = answer" to put on the board, or null.
  static Future<String?> show(BuildContext context) => showPanelDialog<String>(
    context: context,
    builder: (_) => const BoardChromeTheme(child: BoardCalculator()),
  );

  @override
  State<BoardCalculator> createState() => _BoardCalculatorState();
}

class _BoardCalculatorState extends State<BoardCalculator> {
  String _sum = '';

  /// The answer of the last "=", shown under the sum.
  String? _answer;
  bool _error = false;
  late bool _scientific = widget.scientific;
  bool _degrees = true;
  String? _last;

  static const _basic = [
    ['C', '(', ')', '⌫'],
    ['7', '8', '9', '÷'],
    ['4', '5', '6', '×'],
    ['1', '2', '3', '−'],
    ['0', '.', '%', '+'],
    ['√(', 'π', '^', '='],
  ];
  static const _sci = [
    ['sin(', 'cos(', 'tan(', 'Ans'],
    ['asin(', 'acos(', 'atan(', 'e'],
    ['ln(', 'log(', 'exp(', '!'],
    ['x²', '^(-1)', '^3', '10^'],
  ];

  void _key(String k) => setState(() {
    _error = false;
    switch (k) {
      case 'C':
        _sum = '';
        _answer = null;
      case '⌫':
        _sum = _sum.isEmpty ? '' : _sum.substring(0, _sum.length - 1);
      case '=':
        final v = evaluateSum(_sum, degrees: _degrees);
        if (v == null) {
          _error = true;
        } else {
          _answer = formatResult(v);
          _last = _answer;
        }
      case 'Ans':
        _append(_last ?? '0');
      case 'x²':
        _append('^2');
      case '10^':
        _append('10^(');
      case '^(-1)':
        _append('^(-1)');
      default:
        _append(k);
    }
  });

  /// After an answer, an operator carries on from it and anything else starts afresh.
  void _append(String k) {
    if (_answer != null) {
      _sum = '+−×÷^%!'.contains(k[0]) ? '$_answer$k' : k;
      _answer = null;
    } else {
      _sum += k;
    }
  }

  String _label(String k) => switch (k) {
    '√(' => '√',
    'asin(' => 'sin⁻¹',
    'acos(' => 'cos⁻¹',
    'atan(' => 'tan⁻¹',
    'x²' => 'x²',
    '^(-1)' => 'x⁻¹',
    '^3' => 'x³',
    '10^' => '10ˣ',
    '^' => 'xʸ',
    'Ans' => calcStrings(context)['ans'],
    _ => k.endsWith('(') ? k.substring(0, k.length - 1) : k,
  };

  Widget _pad(List<List<String>> rows, double keyH, double font) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (final row in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: Kx.s8),
          child: Row(
            children: [
              for (final k in row)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Kx.s4),
                    child: SizedBox(
                      height: keyH,
                      child: k == '='
                          ? FilledButton(
                              key: Key('calc-$k'),
                              style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                              onPressed: () => _key(k),
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(_label(k), style: TextStyle(fontSize: font)),
                              ),
                            )
                          : FilledButton.tonal(
                              key: Key('calc-$k'),
                              style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                              onPressed: () => _key(k),
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(_label(k), style: TextStyle(fontSize: font)),
                              ),
                            ),
                    ),
                  ),
                ),
            ],
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cs = calcStrings(context);
    final c = context.colors;
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth.isFinite ? box.maxWidth : MediaQuery.sizeOf(context).width;
        final size = calcSizeFor(width);
        final keyH = switch (size) {
          CalcSize.phone => 44.0,
          CalcSize.tablet => 54.0,
          CalcSize.wide => 68.0,
        };
        final font = switch (size) {
          CalcSize.phone => 18.0,
          CalcSize.tablet => 21.0,
          CalcSize.wide => 26.0,
        };
        final maxW = size == CalcSize.wide ? 880.0 : (size == CalcSize.tablet ? 520.0 : width);
        final sideBySide = size == CalcSize.wide && _scientific;
        final display = Container(
          width: double.infinity,
          padding: EdgeInsets.all(size == CalcSize.wide ? Kx.s16 : Kx.s12),
          decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: Kx.radiusMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                reverse: true,
                child: Text(_sum.isEmpty ? '0' : _sum, key: const Key('calc-sum'), style: (size == CalcSize.wide ? context.text.headlineMedium : context.text.titleLarge), textAlign: TextAlign.end),
              ),
              const SizedBox(height: Kx.s4),
              Text(
                _error ? l.calcCannotWorkOut : (_answer == null ? ' ' : '= $_answer'),
                key: const Key('calc-answer'),
                style: (size == CalcSize.wide ? context.text.headlineMedium : context.text.headlineSmall)?.copyWith(color: _error ? c.error : c.primary),
                textAlign: TextAlign.end,
              ),
            ],
          ),
        );
        final body = Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.calculate_outlined, color: c.primary),
                    const SizedBox(width: Kx.s8),
                    Text(l.toolCalculator, style: context.text.titleLarge),
                  ],
                ),
                SegmentedButton<bool>(
                  key: const Key('calc-mode'),
                  showSelectedIcon: false,
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  segments: [
                    ButtonSegment(value: false, label: Text(cs['basic'], key: const Key('calc-basic'))),
                    ButtonSegment(value: true, label: Text(cs['scientific'], key: const Key('calc-scientific'))),
                  ],
                  selected: {_scientific},
                  onSelectionChanged: (v) => setState(() => _scientific = v.first),
                ),
              ],
            ),
            const SizedBox(height: Kx.s12),
            display,
            const SizedBox(height: Kx.s12),
            if (_scientific)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  child: SegmentedButton<bool>(
                    key: const Key('calc-angle'),
                    showSelectedIcon: false,
                    style: const ButtonStyle(visualDensity: VisualDensity.compact),
                    segments: [
                      ButtonSegment(value: true, label: Text(cs['deg'])),
                      ButtonSegment(value: false, label: Text(cs['rad'])),
                    ],
                    selected: {_degrees},
                    onSelectionChanged: (v) => setState(() => _degrees = v.first),
                  ),
                ),
              ),
            if (sideBySide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _pad(_sci, keyH, font)),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: _pad(_basic, keyH, font)),
                ],
              )
            else ...[
              if (_scientific) _pad(_sci, keyH, font),
              _pad(_basic, keyH, font),
            ],
            const SizedBox(height: Kx.s4),
            Wrap(
              alignment: WrapAlignment.end,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: Kx.s8,
              children: [
                TextButton(onPressed: () => Navigator.pop(context), child: Text(l.close)),
                FilledButton.tonalIcon(
                  key: const Key('calc-put-on-board'),
                  onPressed: _answer == null ? null : () => Navigator.pop(context, '$_sum = $_answer'),
                  icon: const Icon(Icons.input),
                  label: Text(l.calcPutOnBoard),
                ),
              ],
            ),
          ],
        );
        return Material(
          key: const Key('calculator'),
          color: c.surfaceContainerHigh,
          borderRadius: Kx.radiusLg,
          child: Align(
            alignment: Alignment.topCenter,
            heightFactor: 1,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: math.min(maxW, width)),
              child: SingleChildScrollView(padding: EdgeInsets.all(size == CalcSize.phone ? Kx.s12 : Kx.s16), child: body),
            ),
          ),
        );
      },
    );
  }
}
