import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Surveys addressed to the student that are still open; tapping one opens its form.
class SurveysScreen extends StatefulWidget {
  const SurveysScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SurveysScreen(api: api)));

  @override
  State<SurveysScreen> createState() => _SurveysScreenState();
}

class _SurveysScreenState extends State<SurveysScreen> {
  List<MySurvey>? _surveys;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.mySurveys();
      if (mounted) setState(() => _surveys = [for (final x in s) if (!x.answered) x]);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _answer(MySurvey s) async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => SurveyFormScreen(api: widget.api, survey: s)));
    if (sent == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.surveySent)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _surveys;
    return Scaffold(
      appBar: AppBar(title: Text(l.surveysTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) KxEmptyState(icon: Icons.poll_outlined, message: l.surveysNone),
            if (items != null)
              for (final s in items) ...[
                KxCard(
                  key: Key('survey-${s.id}'),
                  onTap: () => _answer(s),
                  child: Row(
                    children: [
                      const KxIconBox(Icons.poll_outlined),
                      const SizedBox(width: Kx.s12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                            if (s.closesAt != null) Text(l.surveyClosesOn(context.fmt.dateTime(s.closesAt!)), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
          ],
        ),
      ),
    );
  }
}

/// One survey's questions; pops `true` once the answers are sent.
class SurveyFormScreen extends StatefulWidget {
  const SurveyFormScreen({super.key, required this.api, required this.survey});

  final StudentApi api;
  final MySurvey survey;

  @override
  State<SurveyFormScreen> createState() => _SurveyFormScreenState();
}

class _SurveyFormScreenState extends State<SurveyFormScreen> {
  final _choices = <String, Set<String>>{};
  final _ratings = <String, int>{};
  final _texts = <String, TextEditingController>{};
  bool _missing = false;
  bool _sending = false;
  ApiException? _error;

  @override
  void dispose() {
    for (final t in _texts.values) {
      t.dispose();
    }
    super.dispose();
  }

  TextEditingController _text(String id) => _texts.putIfAbsent(id, TextEditingController.new);

  bool _answered(SurveyQuestion q) => switch (q.kind) {
    'rating' => _ratings.containsKey(q.id),
    'text' => _text(q.id).text.trim().isNotEmpty,
    _ => (_choices[q.id] ?? const {}).isNotEmpty,
  };

  Future<void> _submit() async {
    final qs = widget.survey.questions;
    if (qs.any((q) => q.required && !_answered(q))) {
      setState(() => _missing = true);
      return;
    }
    final answers = [
      for (final q in qs)
        if (_answered(q))
          switch (q.kind) {
            'rating' => SurveyAnswer(q.id, rating: _ratings[q.id]),
            'text' => SurveyAnswer(q.id, text: _text(q.id).text.trim()),
            _ => SurveyAnswer(q.id, choices: [for (final o in q.options) if (_choices[q.id]!.contains(o)) o]),
          },
    ];
    setState(() {
      _missing = false;
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.submitSurvey(widget.survey.id, answers);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = widget.survey;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(s.title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
        children: [
          if (s.description.isNotEmpty) Text(s.description, style: context.text.bodyLarge),
          if (s.anonymous) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.surveyAnonymous, key: const Key('surveyAnonymous'), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
          const SizedBox(height: Kx.s12),
          for (final q in s.questions) ...[
            KxCard(
              key: Key('question-${q.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(q.prompt, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                  if (!q.required) Text(l.surveyOptional, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: Kx.s8),
                  _input(q),
                ],
              ),
            ),
            const SizedBox(height: Kx.s12),
          ],
          if (_missing) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(l.surveyRequired, key: const Key('surveyMissing'), style: context.text.bodyMedium?.copyWith(color: c.error))),
          if (_error != null) ErrorBanner(_error!),
          FilledButton(key: const Key('submitSurvey'), onPressed: _sending ? null : _submit, child: Text(l.surveySubmit)),
        ],
      ),
    );
  }

  Widget _input(SurveyQuestion q) {
    switch (q.kind) {
      case 'single':
        return RadioGroup<String>(
          groupValue: _choices[q.id]?.firstOrNull,
          onChanged: (v) => setState(() => _choices[q.id] = {?v}),
          child: Column(children: [for (final o in q.options) RadioListTile<String>(key: Key('opt-${q.id}-$o'), value: o, title: Text(o), contentPadding: EdgeInsets.zero)]),
        );
      case 'multiple':
        return Column(
          children: [
            for (final o in q.options)
              CheckboxListTile(
                key: Key('opt-${q.id}-$o'),
                value: (_choices[q.id] ?? const {}).contains(o),
                title: Text(o),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (v) => setState(() {
                  final set = _choices.putIfAbsent(q.id, () => {});
                  v == true ? set.add(o) : set.remove(o);
                }),
              ),
          ],
        );
      case 'rating':
        return Wrap(
          spacing: Kx.s8,
          children: [for (var i = 1; i <= 5; i++) ChoiceChip(key: Key('rate-${q.id}-$i'), label: Text('$i'), selected: _ratings[q.id] == i, onSelected: (_) => setState(() => _ratings[q.id] = i))],
        );
      default:
        return TextField(key: Key('text-${q.id}'), controller: _text(q.id), minLines: 2, maxLines: 5, maxLength: 3000, decoration: InputDecoration(hintText: context.l10n.surveyAnswerHint));
    }
  }
}
