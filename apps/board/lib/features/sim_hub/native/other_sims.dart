import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../../l10n/feature_strings.dart';
import '../../board/kit/key_dates_data.dart';
import 'native_strings.dart';

/// One round of the money-creation process: a deposit, what the bank lends, what it keeps.
class BankRound {
  const BankRound(this.deposit, this.lent, this.reserve);
  final double deposit, lent, reserve;
}

/// The rounds of deposit creation from an initial [deposit] at reserve ratio [rr] (0..1).
List<BankRound> moneyRounds(double deposit, double rr, {int rounds = 10}) {
  final out = <BankRound>[];
  var d = deposit;
  for (var i = 0; i < rounds; i++) {
    final reserve = d * rr;
    out.add(BankRound(d, d - reserve, reserve));
    d -= reserve;
  }
  return out;
}

/// The money multiplier, 1 / reserve ratio.
double moneyMultiplier(double rr) => rr <= 0 ? double.infinity : 1 / rr;

/// A small macro model of money and banking: an initial deposit, the reserve ratio, and how the
/// banks lend it out round by round up to the limit deposit / ratio.
class MacroMoneySim extends StatefulWidget {
  const MacroMoneySim({super.key});
  @override
  State<MacroMoneySim> createState() => _MacroState();
}

class _MacroState extends State<MacroMoneySim> {
  double _deposit = 1000, _rr = 0.1;

  @override
  Widget build(BuildContext context) {
    final s = NativeSimStrings.of(context);
    final rounds = moneyRounds(_deposit, _rr);
    final total = _deposit * moneyMultiplier(_rr);
    Widget cell(String t) => Padding(padding: const EdgeInsets.all(4), child: Text(t));
    return ListView(padding: const EdgeInsets.all(12), children: [
      Text(s.f('macroDeposit', {'n': _deposit.round()})),
      Slider(key: const Key('macro-deposit'), value: _deposit, min: 100, max: 10000, divisions: 99, onChanged: (v) => setState(() => _deposit = v)),
      Text(s.f('macroRatio', {'n': (_rr * 100).round()})),
      Slider(key: const Key('macro-rr'), value: _rr, min: 0.02, max: 0.5, divisions: 48, onChanged: (v) => setState(() => _rr = v)),
      Text(s.f('macroMultiplier', {'n': moneyMultiplier(_rr).toStringAsFixed(1)}), key: const Key('macro-mult'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      Text(s.f('macroTotal', {'a': total.round(), 'b': (total - _deposit).round()})),
      const SizedBox(height: 8),
      Table(border: TableBorder.all(color: Colors.black26), children: [
        TableRow(children: [for (final k in ['macroRound', 'macroDepositCol', 'macroLent', 'macroReserve']) cell(s[k])]),
        for (var i = 0; i < rounds.length; i++)
          TableRow(children: [for (final t in ['${i + 1}', rounds[i].deposit.toStringAsFixed(0), rounds[i].lent.toStringAsFixed(0), rounds[i].reserve.toStringAsFixed(0)]) Padding(padding: const EdgeInsets.all(4), child: Text(t))]),
      ]),
    ]);
  }
}

/// Timeline made from the board's key dates (assets/history): pick a region and subject, scroll
/// the events oldest first.
class KeyDatesTimeline extends StatefulWidget {
  const KeyDatesTimeline({super.key, this.data});

  /// Tests pass a small list; otherwise the bundled key dates load.
  final KeyDatesData? data;
  @override
  State<KeyDatesTimeline> createState() => _TimelineState();
}

class _TimelineState extends State<KeyDatesTimeline> {
  String _region = 'india';
  String? _topic;
  String _q = '';
  late final Future<KeyDatesData> _data = widget.data != null ? Future.value(widget.data) : KeyDatesData.load();

  @override
  Widget build(BuildContext context) => FutureBuilder<KeyDatesData>(
    future: _data,
    builder: (context, snap) {
      if (!snap.hasData) return const Center(child: CircularProgressIndicator());
      final s = NativeSimStrings.of(context);
      final lang = boardLang(context);
      final events = snap.data!.search(query: _q, region: _region == 'all' ? null : _region, topic: _topic);
      return Column(children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            SegmentedButton<String>(
              segments: [for (final r in ['india', 'world', 'all']) ButtonSegment(value: r, label: Text(s[r]))],
              selected: {_region},
              onSelectionChanged: (s) => setState(() => _region = s.first),
            ),
            ChoiceChip(label: Text(s['science']), selected: _topic == 'science', onSelected: (v) => setState(() => _topic = v ? 'science' : null)),
            SizedBox(width: 200, child: TextField(key: const Key('timeline-search'), decoration: InputDecoration(hintText: s['timelineSearch'], isDense: true), onChanged: (v) => setState(() => _q = v))),
            Text(s.f('timelineCount', {'n': events.length})),
          ]),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: events.length,
            itemBuilder: (_, i) => ListTile(
              dense: true,
              leading: SizedBox(width: 90, child: Text(events[i].whenIn(lang), style: const TextStyle(fontWeight: FontWeight.bold))),
              title: Text(events[i].textIn(lang)),
            ),
          ),
        ),
      ]);
    },
  );
}

/// A LanguageTool finding.
class GrammarMatch {
  const GrammarMatch(this.message, this.offset, this.length, this.suggestions);
  final String message;
  final int offset, length;
  final List<String> suggestions;
}

/// Parses LanguageTool's `/v2/check` reply.
List<GrammarMatch> parseLanguageTool(String body) {
  final j = jsonDecode(body) as Map<String, dynamic>;
  return [
    for (final m in (j['matches'] as List? ?? const []).cast<Map<String, dynamic>>())
      GrammarMatch(m['message'] as String? ?? '', m['offset'] as int? ?? 0, m['length'] as int? ?? 0, [for (final r in (m['replacements'] as List? ?? const []).take(3)) (r as Map)['value'] as String]),
  ];
}

const languageToolUrl = 'https://api.languagetool.org/v2/check';

/// Grammar check with the public LanguageTool API. The text leaves the board, so the panel says
/// so, and offline it shows a plain message instead of failing.
class GrammarCheck extends StatefulWidget {
  const GrammarCheck({super.key, this.client});
  final http.Client? client;
  @override
  State<GrammarCheck> createState() => _GrammarState();
}

class _GrammarState extends State<GrammarCheck> {
  final _text = TextEditingController();
  List<GrammarMatch>? _matches;

  /// What went wrong, as a string key: no internet, or the service did not answer.
  String? _error;
  bool _busy = false;

  Future<void> _check() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final c = widget.client ?? http.Client();
      final r = await c.post(Uri.parse(languageToolUrl), body: {'text': _text.text, 'language': 'en-US'}).timeout(const Duration(seconds: 12));
      if (r.statusCode != 200) {
        _matches = null;
        _error = 'grammarFailed';
      } else {
        _matches = parseLanguageTool(r.body);
      }
    } catch (_) {
      _matches = null;
      _error = 'grammarOffline';
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = NativeSimStrings.of(context);
    return ListView(padding: const EdgeInsets.all(12), children: [
    Text(s['grammarOnline'], style: const TextStyle(fontStyle: FontStyle.italic)),
    TextField(key: const Key('grammar-text'), controller: _text, maxLines: 6, decoration: InputDecoration(border: const OutlineInputBorder(), hintText: s['grammarHint'])),
    const SizedBox(height: 8),
    Align(alignment: Alignment.centerLeft, child: FilledButton(key: const Key('grammar-check'), onPressed: _busy ? null : _check, child: Text(_busy ? s['grammarChecking'] : s['check']))),
    if (_error != null) Padding(padding: const EdgeInsets.all(8), child: Text(s[_error!], key: const Key('grammar-error'), style: const TextStyle(color: Colors.red))),
    if (_matches != null && _matches!.isEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(s['grammarClean'], key: const Key('grammar-clean'))),
    for (final m in _matches ?? const <GrammarMatch>[])
      ListTile(title: Text(m.message), subtitle: Text('"${_text.text.substring(m.offset.clamp(0, _text.text.length), (m.offset + m.length).clamp(0, _text.text.length))}"  ->  ${m.suggestions.join(', ')}')),
  ]);
  }
}
