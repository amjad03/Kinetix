import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/pathways.dart';
import '../../l10n/l10n.dart';
import '../../widgets/load_view.dart';

String mockKindLabel(AppLocalizations l, String k) => switch (k) {
  'technical' => l.prepMockTechnical,
  'communication' => l.prepCommunication,
  _ => l.prepMockHr,
};

/// A score out of 10 with at most one decimal: 7.5, 8.
String _ten(double v) => v == v.roundToDouble() ? '${v.round()}' : v.toStringAsFixed(1);

/// A mock interview (HR or technical) or communication practice: choose the role and how many
/// questions, answer each in text, then see a score and notes for every question.
class MockInterviewScreen extends StatefulWidget {
  const MockInterviewScreen({super.key, required this.api, required this.kind});

  final StudentApi api;

  /// `hr`, `technical` or `communication`.
  final String kind;

  @override
  State<MockInterviewScreen> createState() => _MockInterviewScreenState();
}

class _MockInterviewScreenState extends State<MockInterviewScreen> {
  final _role = TextEditingController();
  int _count = 3;
  MockInterview? _interview;
  List<TextEditingController> _answers = [];
  MockResult? _result;
  bool _busy = false;
  late Future<List<MockSummary>> _past = widget.api.myMockInterviews();

  @override
  void dispose() {
    _role.dispose();
    for (final c in _answers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    MockInterview? m;
    final ok = await attempt(context, () async => m = await widget.api.startMockInterview(kind: widget.kind, role: _role.text.trim(), count: _count));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) {
        _interview = m;
        _answers = [for (final _ in m!.questions) TextEditingController()];
      }
    });
  }

  Future<void> _submit() async {
    final l = context.l10n;
    if (_answers.any((c) => c.text.trim().isEmpty)) return say(context, l.mockAnswerAll);
    setState(() => _busy = true);
    MockResult? r;
    final ok = await attempt(context, () async => r = await widget.api.submitMockInterview(_interview!.id, [for (final c in _answers) (answer: c.text.trim(), seconds: null)]));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) _result = r;
    });
  }

  void _again() => setState(() {
    for (final c in _answers) {
      c.dispose();
    }
    _answers = [];
    _interview = null;
    _result = null;
    _past = widget.api.myMockInterviews();
  });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(mockKindLabel(l, widget.kind))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: switch ((_interview, _result)) {
          (_, final r?) => _results(context, r),
          (final m?, _) => _questions(context, m),
          _ => _setup(context),
        },
      ),
    );
  }

  List<Widget> _setup(BuildContext context) {
    final l = context.l10n;
    return [
      Text(widget.kind == 'communication' ? l.mockIntroCommunication : l.mockIntro, style: context.text.bodyLarge),
      const SizedBox(height: Kx.s12),
      if (widget.kind != 'communication') TextField(key: const Key('mockRole'), controller: _role, maxLength: 120, decoration: InputDecoration(labelText: l.mockRole, hintText: l.mockRoleHint)),
      DropdownButtonFormField<int>(
        key: const Key('mockCount'),
        initialValue: _count,
        decoration: InputDecoration(labelText: l.mockCount),
        items: [for (final n in const [3, 4, 5, 6]) DropdownMenuItem(value: n, child: Text(l.testQuestions(n)))],
        onChanged: (v) => setState(() => _count = v ?? 3),
      ),
      const SizedBox(height: Kx.s16),
      FilledButton(key: const Key('startMock'), onPressed: _busy ? null : _start, child: Text(l.mockStart)),
      FutureBuilder<List<MockSummary>>(
        future: _past,
        builder: (context, snap) {
          final past = [for (final s in snap.data ?? const <MockSummary>[]) if (s.kind == widget.kind && s.status == 'completed') s];
          if (past.isEmpty) return const SizedBox.shrink();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Heading(l.mockPast),
              for (final s in past.take(5))
                ListTile(
                  key: Key('past-${s.id}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(s.role.isEmpty ? mockKindLabel(l, s.kind) : s.role),
                  subtitle: Text(dayText(context, s.createdAt)),
                  trailing: Text(s.score == null ? '' : _ten(s.score!), style: context.text.titleMedium),
                ),
            ],
          );
        },
      ),
    ];
  }

  List<Widget> _questions(BuildContext context, MockInterview m) {
    final l = context.l10n;
    return [
      for (var i = 0; i < m.questions.length; i++) ...[
        Text('${i + 1}. ${m.questions[i]}', style: context.text.titleSmall),
        const SizedBox(height: Kx.s4),
        TextField(key: Key('mockAnswer-$i'), controller: _answers[i], minLines: 3, maxLines: 8, maxLength: 3000, decoration: InputDecoration(hintText: l.mockAnswerHint)),
        const SizedBox(height: Kx.s8),
      ],
      FilledButton(key: const Key('submitMock'), onPressed: _busy ? null : _submit, child: Text(l.mockSubmit)),
    ];
  }

  List<Widget> _results(BuildContext context, MockResult r) {
    final l = context.l10n;
    return [
      Text(l.mockScore(_ten(r.score)), key: const Key('mockScore'), style: context.text.headlineMedium),
      for (var i = 0; i < r.questions.length; i++)
        KxCard(
          key: Key('mockResult-$i'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(r.questions[i], style: context.text.titleSmall),
              if (i < r.perQuestion.length) ...[
                Text(l.mockQuestionScore(_ten(r.perQuestion[i].score)), style: context.text.titleMedium),
                for (final n in r.perQuestion[i].notes) Text('• $n'),
              ],
            ],
          ),
        ),
      if (r.overall.isNotEmpty) ...[Heading(l.mockOverall), for (final n in r.overall) Text('• $n')],
      const SizedBox(height: Kx.s16),
      OutlinedButton(key: const Key('mockAgain'), onPressed: _again, child: Text(l.mockAgain)),
    ];
  }
}
