import 'package:flutter/material.dart';
import 'package:kinetix_math/kinetix_math.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../../l10n/math_text.dart';
import '../board/side_panel.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';

const mathAccent = Color(0xFF8AB4F8);

/// The maths solver. Runs on the board itself (package:kinetix_math), so it works with no
/// network and no teacher signed in.
class MathPanel extends StatefulWidget {
  const MathPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<MathPanel> createState() => _MathPanelState();
}

class _MathPanelState extends State<MathPanel> {
  late final _input = TextEditingController(text: widget.ai.mathInput);
  final _focus = FocusNode();
  MathSolution? _solution;
  String? _error;

  static const examples = ['3x + 5 = 20', '2(x − 1) = x + 4', 'x² − 5x + 6 = 0', 'x² + x + 1 = 0', '(2 + 3) × 4² ÷ 8', '√50 + sin 30'];

  @override
  void initState() {
    super.initState();
    if (_input.text.trim().isNotEmpty) _solve(focus: false);
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _solve({bool focus = true}) {
    final text = _input.text;
    widget.ai.mathInput = text;
    setState(() {
      try {
        _solution = MathSolver.solve(text);
        _error = null;
      } on MathError catch (e) {
        _solution = null;
        _error = e.message;
      }
    });
  }

  void _insert(String s) {
    final v = _input.value;
    final sel = v.selection.isValid ? v.selection : TextSelection.collapsed(offset: v.text.length);
    final text = v.text.replaceRange(sel.start, sel.end, s);
    _input.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: sel.start + s.length));
  }

  void _backspace() {
    final v = _input.value;
    final sel = v.selection.isValid ? v.selection : TextSelection.collapsed(offset: v.text.length);
    if (!sel.isCollapsed) {
      _insert('');
      return;
    }
    if (sel.start == 0) return;
    final text = v.text.replaceRange(sel.start - 1, sel.start, '');
    _input.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: sel.start - 1));
  }

  void _clear() {
    _input.clear();
    widget.ai.mathInput = '';
    setState(() {
      _solution = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return PanelPage(
      icon: Icons.functions,
      title: l.aiMathSolver,
      accent: mathAccent,
      onBack: widget.onBack,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
        children: [
          TextField(
            key: const Key('math-input'),
            controller: _input,
            focusNode: _focus,
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w500),
            decoration: InputDecoration(
              hintText: l.mathHint,
              suffixIcon: IconButton(tooltip: l.clear, onPressed: _clear, icon: const Icon(Icons.close)),
            ),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _solve(),
          ),
          const SizedBox(height: Kx.s12),
          _Keypad(onKey: _insert, onBackspace: _backspace, onSolve: _solve),
          const SizedBox(height: Kx.s8),
          Row(
            children: [
              Icon(Icons.offline_bolt_outlined, size: 18, color: c.onSurfaceVariant),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(
                  l.mathOffline,
                  style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                ),
              ),
            ],
          ),
          const SizedBox(height: Kx.s20),
          if (_error != null)
            AiNotice(key: const Key('math-error'), icon: Icons.error_outline, message: MathText(l).error(_error!), tone: AiNoticeTone.error),
          if (_solution != null) _SolutionView(solution: _solution!),
          if (_solution == null && _error == null) ...[
            Text(l.mathTryThese, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s12),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final e in examples)
                  SuggestionChip(
                    icon: Icons.functions,
                    text: e,
                    onTap: () {
                      _input.text = e;
                      _solve();
                    },
                  ),
              ],
            ),
            const SizedBox(height: Kx.s16),
            Text(
              l.mathAbout,
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onKey, required this.onBackspace, required this.onSolve});

  final ValueChanged<String> onKey;
  final VoidCallback onBackspace;
  final VoidCallback onSolve;

  /// (label, text typed, tooltip).
  static List<(String, String, String)> keys(AppLocalizations l) => [
    ('x', 'x', 'x'),
    ('x²', '²', l.mathKeySquared),
    ('xⁿ', '^', l.mathKeyPower),
    ('√', '√', l.mathKeySquareRoot),
    ('π', 'π', l.mathKeyPi),
    ('a/b', '/', l.mathKeyFraction),
    ('(', '(', l.mathKeyOpenBracket),
    (')', ')', l.mathKeyCloseBracket),
    ('×', '×', l.mathKeyTimes),
    ('÷', '÷', l.mathKeyDivide),
    ('−', '−', l.mathKeyMinus),
    ('+', '+', l.mathKeyPlus),
    ('=', '=', l.mathKeyEquals),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    Widget key(String label, String tip, VoidCallback onTap, {Key? k}) => Tooltip(
      message: tip,
      child: Material(
        key: k,
        color: c.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(Kx.rMd),
        child: InkWell(
          borderRadius: BorderRadius.circular(Kx.rMd),
          onTap: onTap,
          child: SizedBox(
            width: 56,
            height: 48,
            child: Center(child: Text(label, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: c.onSurface))),
          ),
        ),
      ),
    );
    return Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s8,
      children: [
        for (final (label, text, tip) in keys(l)) key(label, tip, () => onKey(text), k: Key('math-key-$label')),
        key('⌫', l.mathKeyDelete, onBackspace, k: const Key('math-key-back')),
        SizedBox(
          height: 48,
          child: FilledButton.icon(
            key: const Key('math-solve'),
            onPressed: onSolve,
            style: FilledButton.styleFrom(minimumSize: const Size(120, 48)),
            icon: const Icon(Icons.play_arrow),
            label: Text(l.mathSolve),
          ),
        ),
      ],
    );
  }
}

class _SolutionView extends StatelessWidget {
  const _SolutionView({required this.solution});

  final MathSolution solution;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = solution;
    final m = MathText(context.l10n);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          key: const Key('math-answer'),
          padding: const EdgeInsets.all(Kx.s20),
          decoration: BoxDecoration(color: c.primaryContainer, borderRadius: BorderRadius.circular(Kx.rLg)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m.kind(s.kind).toUpperCase(), style: context.text.labelLarge?.copyWith(color: c.onPrimaryContainer, letterSpacing: 0.8)),
              const SizedBox(height: Kx.s8),
              Text(m.answer(s.answer), style: TextStyle(fontSize: 34, fontWeight: FontWeight.w600, color: c.onPrimaryContainer, height: 1.25)),
              if (s.decimal != null) ...[
                const SizedBox(height: Kx.s4),
                Text(m.expression(s.decimal!), style: TextStyle(fontSize: 20, color: c.onPrimaryContainer.withValues(alpha: 0.8))),
              ],
            ],
          ),
        ),
        AiSectionLabel(context.l10n.mathWorking),
        for (var i = 0; i < s.steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: Kx.s12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.surfaceContainerHighest, shape: BoxShape.circle),
                  child: Text('${i + 1}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.onSurfaceVariant)),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(m.step(s.steps[i].explanation), style: TextStyle(fontSize: 16, color: c.onSurfaceVariant, height: 1.3)),
                      ),
                      const SizedBox(height: Kx.s4),
                      Text(m.expression(s.steps[i].expression), style: TextStyle(fontSize: 24, fontWeight: FontWeight.w500, color: c.onSurface, height: 1.3)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
