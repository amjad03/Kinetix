import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'panel/panel_host.dart';

/// The value of a calculator sum (+ − × ÷ ^ % √ π and brackets), or null when it cannot be
/// worked out. A trailing `%` is a hundredth.
double? evaluateSum(String sum) {
  final s = sum.replaceAll('√', 'sqrt').replaceAllMapped(RegExp(r'(\d+(?:\.\d+)?)%'), (m) => '(${m[1]}/100)').trim();
  if (s.isEmpty) return null;
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

/// The board's calculator: a keypad, the sum and its answer, which goes on the board as text.
class BoardCalculator extends StatefulWidget {
  const BoardCalculator({super.key});

  /// Opens it; returns "sum = answer" to put on the board, or null.
  static Future<String?> show(BuildContext context) =>
      showPanelDialog<String>(context: context, builder: (_) => const BoardChromeTheme(child: BoardCalculator()));

  @override
  State<BoardCalculator> createState() => _BoardCalculatorState();
}

class _BoardCalculatorState extends State<BoardCalculator> {
  String _sum = '';

  /// The answer of the last "=", shown under the sum.
  String? _answer;
  bool _error = false;

  void _key(String k) => setState(() {
    _error = false;
    switch (k) {
      case 'C':
        _sum = '';
        _answer = null;
      case '⌫':
        _sum = _sum.isEmpty ? '' : _sum.substring(0, _sum.length - 1);
      case '=':
        final v = evaluateSum(_sum);
        if (v == null) {
          _error = true;
        } else {
          _answer = formatResult(v);
        }
      default:
        // After an answer, an operator carries on from it and a digit starts afresh.
        if (_answer != null) {
          _sum = '+−×÷^%'.contains(k) ? '$_answer$k' : k;
          _answer = null;
        } else {
          _sum += k;
        }
    }
  });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    const keys = [
      ['C', '(', ')', '⌫'],
      ['7', '8', '9', '÷'],
      ['4', '5', '6', '×'],
      ['1', '2', '3', '−'],
      ['0', '.', '%', '+'],
      ['√(', 'π', '^', '='],
    ];
    return AlertDialog(
      key: const Key('calculator'),
      icon: const Icon(Icons.calculate_outlined),
      title: Text(l.toolCalculator),
      scrollable: true,
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(Kx.s12),
              decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: Kx.radiusMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(_sum.isEmpty ? '0' : _sum, key: const Key('calc-sum'), style: context.text.titleLarge, textAlign: TextAlign.end),
                  const SizedBox(height: Kx.s4),
                  Text(
                    _error ? l.calcCannotWorkOut : (_answer == null ? ' ' : '= $_answer'),
                    key: const Key('calc-answer'),
                    style: context.text.headlineSmall?.copyWith(color: _error ? c.error : c.primary),
                    textAlign: TextAlign.end,
                  ),
                ],
              ),
            ),
            const SizedBox(height: Kx.s12),
            for (final row in keys)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s8),
                child: Row(
                  children: [
                    for (final k in row)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: Kx.s4),
                          child: k == '='
                              ? FilledButton(key: const Key('calc-='), onPressed: () => _key(k), child: Text(k, style: const TextStyle(fontSize: 20)))
                              : FilledButton.tonal(
                                  key: Key('calc-$k'),
                                  onPressed: () => _key(k),
                                  child: Text(k == '√(' ? '√' : k, style: const TextStyle(fontSize: 20)),
                                ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.close)),
        FilledButton.tonalIcon(
          key: const Key('calc-put-on-board'),
          onPressed: _answer == null ? null : () => Navigator.pop(context, '$_sum = $_answer'),
          icon: const Icon(Icons.input),
          label: Text(l.calcPutOnBoard),
        ),
      ],
    );
  }
}
