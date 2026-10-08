import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// Open surveys addressed to guardians, and the form to answer one.
class SurveysScreen extends StatefulWidget {
  const SurveysScreen({super.key, required this.api});

  final ParentApi api;

  @override
  State<SurveysScreen> createState() => _SurveysScreenState();
}

class _SurveysScreenState extends State<SurveysScreen> {
  int _version = 0;

  Future<void> _answer(Survey s) async {
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => SurveyFormScreen(api: widget.api, survey: s)));
    if (done == true && mounted) setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<List<Survey>>(
      key: ValueKey(_version),
      title: l.surveysTitle,
      load: widget.api.surveys,
      builder: (context, surveys, reload) => [
        if (surveys.isEmpty) EmptyNote(l.surveysNone),
        for (final s in surveys)
          Card(
            key: Key('survey-${s.id}'),
            child: ListTile(
              title: Text(s.title),
              subtitle: s.description.isEmpty ? null : Text(s.description),
              trailing: s.answered
                  ? Pill(l.surveyAnswered, icon: Icons.check_circle_outline, background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer)
                  : FilledButton.tonal(key: Key('answer-${s.id}'), onPressed: () => _answer(s), child: Text(l.surveyAnswerNow)),
            ),
          ),
      ],
    );
  }
}

/// One survey's questions; submitting needs every required question answered.
class SurveyFormScreen extends StatefulWidget {
  const SurveyFormScreen({super.key, required this.api, required this.survey});

  final ParentApi api;
  final Survey survey;

  @override
  State<SurveyFormScreen> createState() => _SurveyFormScreenState();
}

class _SurveyFormScreenState extends State<SurveyFormScreen> {
  final _choices = <String, Set<String>>{};
  final _ratings = <String, int>{};
  final _texts = <String, TextEditingController>{};
  bool _busy = false;
  String? _problem;

  @override
  void dispose() {
    for (final c in _texts.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _text(String id) => _texts.putIfAbsent(id, TextEditingController.new);

  List<SurveyAnswer>? _collect() {
    final out = <SurveyAnswer>[];
    for (final q in widget.survey.questions) {
      final answer = switch (q.kind) {
        'single' || 'multiple' => (_choices[q.id] ?? {}).isEmpty ? null : SurveyAnswer(q.id, choices: _choices[q.id]!.toList()),
        'rating' => _ratings[q.id] == null ? null : SurveyAnswer(q.id, rating: _ratings[q.id]),
        _ => _text(q.id).text.trim().isEmpty ? null : SurveyAnswer(q.id, text: _text(q.id).text.trim()),
      };
      if (answer == null) {
        if (q.required) return null;
      } else {
        out.add(answer);
      }
    }
    return out;
  }

  Future<void> _submit() async {
    final l = context.l10n;
    final answers = _collect();
    if (answers == null) {
      setState(() => _problem = l.surveyRequired);
      return;
    }
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.answerSurvey(widget.survey.id, answers);
      if (!mounted) return;
      say(context, l.surveyThanks);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.errorText(e);
        });
      }
    }
  }

  Widget _input(SurveyQuestion q) {
    final l = context.l10n;
    switch (q.kind) {
      case 'single':
        return RadioGroup<String>(
          groupValue: _choices[q.id]?.firstOrNull,
          onChanged: (v) => setState(() => _choices[q.id] = {?v}),
          child: Column(children: [for (final o in q.options) RadioListTile<String>(key: Key('opt-${q.id}-$o'), value: o, title: Text(o))]),
        );
      case 'multiple':
        return Column(
          children: [
            for (final o in q.options)
              CheckboxListTile(
                key: Key('opt-${q.id}-$o'),
                value: _choices[q.id]?.contains(o) ?? false,
                title: Text(o),
                onChanged: (on) => setState(() {
                  final set = _choices.putIfAbsent(q.id, () => {});
                  on == true ? set.add(o) : set.remove(o);
                }),
              ),
          ],
        );
      case 'rating':
        return Wrap(
          children: [
            for (var i = 1; i <= 5; i++)
              IconButton(
                key: Key('star-${q.id}-$i'),
                icon: Icon((_ratings[q.id] ?? 0) >= i ? Icons.star : Icons.star_border),
                onPressed: () => setState(() => _ratings[q.id] = i),
              ),
          ],
        );
      default:
        return TextField(key: Key('text-${q.id}'), controller: _text(q.id), minLines: 2, maxLines: 5, decoration: InputDecoration(labelText: l.surveyYourAnswer));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = widget.survey;
    return Scaffold(
      appBar: AppBar(title: Text(s.title)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (s.description.isNotEmpty) Text(s.description, style: context.text.bodyLarge),
          if (s.anonymous) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.surveyAnonymous, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant))),
          for (final q in s.questions) ...[
            Heading(q.required ? '${q.prompt} *' : q.prompt),
            _input(q),
          ],
          if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('submitSurvey'), onPressed: _busy ? null : _submit, child: Text(l.surveySubmit)),
        ],
      ),
    );
  }
}
