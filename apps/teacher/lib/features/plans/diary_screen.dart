import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// Opens the teaching diary of a period taught on [date]; [onSaved] runs once it is written.
Future<void> openDiary(BuildContext context, {required TeacherApi api, required Period period, required String date, VoidCallback? onSaved}) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DiaryScreen(api: api, period: period, date: date, onSaved: onSaved)));

/// The teaching diary of one period: the syllabus topics taught (the lesson plan's are ticked to begin with), how it
/// was taught, what was done, and why it differed from the plan. Saving marks the topics covered for the class.
class DiaryScreen extends StatefulWidget {
  const DiaryScreen({super.key, required this.api, required this.period, required this.date, this.onSaved});

  final TeacherApi api;
  final Period period;
  final String date;
  final VoidCallback? onSaved;

  @override
  State<DiaryScreen> createState() => _DiaryScreenState();
}

class _DiaryScreenState extends State<DiaryScreen> {
  Syllabus? _syllabus;
  Coverage? _coverage;
  bool _loading = true;
  ApiException? _error;
  final _picked = <String>{};
  String _delivery = 'lecture';
  final _summary = TextEditingController();
  final _why = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _summary.dispose();
    _why.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = widget.period;
      final results = await Future.wait([
        widget.api.syllabus(p.subject.id),
        widget.api.coverage(sectionId: p.section.id, subjectId: p.subject.id),
        widget.api.periodPlan(slotId: p.slotId, date: widget.date),
      ]);
      if (!mounted) return;
      final plan = results[2] as PeriodPlan;
      setState(() {
        _syllabus = results[0] as Syllabus?;
        _coverage = results[1] as Coverage;
        // The plan's topics are what was meant to be taught: start from them (those still in the syllabus).
        final inSyllabus = {for (final c in _syllabus?.chapters ?? const <SyllabusChapter>[]) for (final t in c.topics) t.id};
        _picked.addAll((plan.plan?.topics.map((t) => t.id) ?? plan.suggestedTopicIds).where(inSyllabus.contains));
        if (widget.period.batch != null) _delivery = 'practical';
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  void _say(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _save() async {
    final l = context.l10n;
    if (_picked.isEmpty && _summary.text.trim().isEmpty) {
      _say(l.diaryNeedSomething);
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.api.writeDiary(slotId: widget.period.slotId, date: widget.date, topicIds: _picked.toList(), delivery: _delivery, summary: _summary.text.trim(), deviationReason: _why.text);
      if (!mounted) return;
      widget.onSaved?.call();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.diarySaved)));
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _say(l.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = widget.period;
    final chapters = _syllabus?.chapters ?? const <SyllabusChapter>[];
    return Scaffold(
      appBar: AppBar(title: Text(l.diaryTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_error != null) ErrorBanner.api(_error!, onRetry: _load),
                Text('${p.subject.name} · ${p.section.name}${p.batch != null ? ' · ${l.batchLabel(p.batch!)}' : ''}', style: context.text.titleMedium),
                const SizedBox(height: Kx.s16),
                Text(l.diaryTopics, style: context.text.titleSmall),
                Text(l.diaryTopicsHelp, style: context.text.bodySmall),
                const SizedBox(height: Kx.s8),
                if (chapters.isEmpty) Text(l.diaryNoSyllabus, key: const Key('diaryNoSyllabus')),
                for (final c in chapters) ...[
                  Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(c.title, style: context.text.labelLarge)),
                  for (final t in c.topics)
                    CheckboxListTile(
                      key: Key('diaryTopic-${t.id}'),
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: _picked.contains(t.id),
                      title: Text(t.title),
                      subtitle: _coverage?.topics[t.id] == null ? null : Text(l.taughtOn(Fmt.of(context).shortDay(_coverage!.topics[t.id]!.coveredOn))),
                      onChanged: (v) => setState(() => v == true ? _picked.add(t.id) : _picked.remove(t.id)),
                    ),
                ],
                const SizedBox(height: Kx.s16),
                DropdownButtonFormField<String>(
                  key: const Key('diaryDelivery'),
                  initialValue: _delivery,
                  decoration: InputDecoration(labelText: l.diaryDelivery),
                  items: [for (final d in teachingDeliveries) DropdownMenuItem(value: d, child: Text(deliveryLabel(l, d)))],
                  onChanged: (v) => setState(() => _delivery = v ?? 'lecture'),
                ),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('diarySummary'), controller: _summary, decoration: InputDecoration(labelText: l.diarySummary), maxLines: 3, maxLength: 2000),
                TextField(key: const Key('diaryWhy'), controller: _why, decoration: InputDecoration(labelText: l.diaryDeviation), maxLength: 500),
                const SizedBox(height: Kx.s8),
                FilledButton.icon(
                  key: const Key('diarySave'),
                  onPressed: _saving ? null : _save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(l.diarySave),
                ),
              ],
            ),
    );
  }
}

/// The delivery's name in the app's language.
String deliveryLabel(AppLocalizations l, String d) => switch (d) {
  'tutorial' => l.delivery_tutorial,
  'practical' => l.delivery_practical,
  'seminar' => l.delivery_seminar,
  'discussion' => l.delivery_discussion,
  'demonstration' => l.delivery_demonstration,
  'revision' => l.delivery_revision,
  'test' => l.delivery_test,
  'online' => l.delivery_online,
  'field_visit' => l.delivery_field_visit,
  _ => l.delivery_lecture,
};
