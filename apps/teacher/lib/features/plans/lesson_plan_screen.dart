import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// The API's limits on a lesson plan.
const _maxObjectives = 8, _maxSteps = 15, _maxMaterials = 12, _maxTopics = 10, _maxDraftTopics = 5;

class _Step {
  _Step(LessonStep s) : minutes = TextEditingController(text: '${s.minutes}'), activity = TextEditingController(text: s.activity);
  final TextEditingController minutes;
  final TextEditingController activity;

  int get value => (int.tryParse(minutes.text.trim()) ?? 0).clamp(0, 180);

  void dispose() {
    minutes.dispose();
    activity.dispose();
  }
}

/// The lesson plan for one period on one day: topics, objectives, timed steps, materials, how
/// to check understanding and homework. KINETIX AI can write a first draft; the teacher edits
/// and saves it. A remark from the head of department's review is shown at the top.
class LessonPlanScreen extends StatefulWidget {
  const LessonPlanScreen({super.key, required this.api, required this.period, required this.date, this.onSaved});

  final TeacherApi api;
  final Period period;

  /// The day, as "2026-10-05".
  final String date;

  /// Called after each successful save.
  final VoidCallback? onSaved;

  @override
  State<LessonPlanScreen> createState() => _LessonPlanScreenState();
}

class _LessonPlanScreenState extends State<LessonPlanScreen> {
  PeriodPlan? _data;
  Syllabus? _syllabus;
  ApiException? _error;
  bool _loading = true;
  bool _saving = false;
  bool _drafting = false;
  bool _dirty = false;

  /// The content came from KINETIX AI (and [_preview]: a placeholder draft).
  bool _aiDrafted = false;
  bool _preview = false;

  List<String> _topicIds = [];
  final Map<String, String> _titles = {};
  List<TextEditingController> _objectives = [];
  List<_Step> _steps = [];
  List<TextEditingController> _materials = [];
  final _assessment = TextEditingController();
  final _homework = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [..._objectives, ..._materials, _assessment, _homework]) {
      c.dispose();
    }
    for (final s in _steps) {
      s.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.api.periodPlan(slotId: widget.period.slotId, date: widget.date);
      Syllabus? syllabus;
      try {
        syllabus = await widget.api.syllabus(widget.period.subject.id);
      } on ApiException {
        // The topic picker is extra; the plan still opens.
      }
      if (!mounted) return;
      setState(() {
        _data = data;
        _syllabus = syllabus;
        for (final ch in syllabus?.chapters ?? const <SyllabusChapter>[]) {
          for (final t in ch.topics) {
            _titles[t.id] = t.title;
          }
        }
        final plan = data.plan;
        if (plan != null) {
          for (final t in plan.topics) {
            if (t.name.isNotEmpty) _titles[t.id] = t.name;
          }
          _topicIds = [for (final t in plan.topics) t.id];
          _aiDrafted = plan.aiDrafted;
          _fill(plan.content);
        } else {
          _topicIds = data.suggestedTopicIds.take(_maxTopics).toList();
          _fill(const LessonContent());
        }
        _dirty = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Replaces the form's content. Old controllers are disposed after the frame that drops them.
  void _fill(LessonContent c, {bool keepHomework = false}) {
    final old = [..._objectives, ..._materials];
    final oldSteps = _steps;
    _objectives = [for (final o in c.objectives) TextEditingController(text: o)];
    _steps = [for (final s in c.steps) _Step(s)];
    _materials = [for (final m in c.materials) TextEditingController(text: m)];
    _assessment.text = c.assessment;
    if (!keepHomework || c.homework.trim().isNotEmpty) _homework.text = c.homework;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final o in old) {
        o.dispose();
      }
      for (final s in oldSteps) {
        s.dispose();
      }
    });
  }

  LessonContent _content() => LessonContent(
    objectives: [for (final o in _objectives) o.text.trim()].where((s) => s.isNotEmpty).toList(),
    steps: [
      for (final s in _steps)
        if (s.activity.text.trim().isNotEmpty) LessonStep(minutes: s.value.clamp(1, 180), activity: s.activity.text.trim()),
    ],
    materials: [for (final m in _materials) m.text.trim()].where((s) => s.isNotEmpty).toList(),
    assessment: _assessment.text.trim(),
    homework: _homework.text.trim(),
  );

  void _changed(VoidCallback f) => setState(() {
    f();
    _dirty = true;
  });

  void _say(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  Future<void> _draft() async {
    final l = context.l10n;
    if (!_content().isEmpty) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(ctx.l10n.replaceWithDraftTitle),
          content: Text(ctx.l10n.replaceWithDraftBody),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.cancel)),
            FilledButton(key: const Key('confirmReplace'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.replace)),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _drafting = true);
    try {
      final d = await widget.api.draftLessonPlan(
        slotId: widget.period.slotId,
        date: widget.date,
        topicIds: _topicIds.isEmpty ? null : _topicIds.take(_maxDraftTopics).toList(),
        language: Localizations.localeOf(context).languageCode,
      );
      if (!mounted) return;
      _changed(() {
        if (d.topicIds.isNotEmpty) _topicIds = d.topicIds.toList();
        _fill(d.content, keepHomework: true);
        _aiDrafted = true;
        _preview = d.preview;
      });
    } on ApiException catch (e) {
      if (mounted) _say(l.errorText(e));
    } finally {
      if (mounted) setState(() => _drafting = false);
    }
  }

  Future<void> _save() async {
    final l = context.l10n;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      final data = await widget.api.saveLessonPlan(
        slotId: widget.period.slotId,
        date: widget.date,
        topicIds: _topicIds,
        content: _content(),
        aiDrafted: _aiDrafted,
      );
      if (!mounted) return;
      setState(() {
        _data = data;
        if (data.plan case final plan?) _fill(plan.content);
        _dirty = false;
      });
      widget.onSaved?.call();
      _say(l.lessonPlanSaved);
    } on ApiException catch (e) {
      if (mounted) _say(l.errorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickTopics() async {
    final picked = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TopicPicker(syllabus: _syllabus!, selected: _topicIds, suggested: _data?.suggestedTopicIds ?? const []),
    );
    if (picked != null && mounted) _changed(() => _topicIds = picked);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = widget.period;
    final fmt = Fmt.of(context);
    final ready = _data != null;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await confirmDiscard(context, body: l.discardPlanBody)) navigator.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.lessonPlan, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                '${p.subject.name} · ${p.section.name}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant),
              ),
            ],
          ),
        ),
        bottomNavigationBar: ready
            ? SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s12),
                  child: FilledButton.icon(
                    key: const Key('saveLessonPlan'),
                    onPressed: _saving || _drafting ? null : _save,
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save_outlined, size: 18),
                    label: Text(l.savePlan),
                  ),
                ),
              )
            : null,
        body: _loading && !ready
            ? const Center(child: CircularProgressIndicator())
            : !ready
            ? ListView(
                padding: const EdgeInsets.all(Kx.s16),
                children: [if (_error != null) ErrorBanner.api(_error!, onRetry: _load)],
              )
            : Form(
                onChanged: () => setState(() => _dirty = true),
                child: ListView(
                  key: const Key('lessonPlanForm'),
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
                  children: [
                    Text(
                      '${fmt.shortDay(parseIsoDate(widget.date))} · ${fmt.clock(p.startsAt)} – ${fmt.clock(p.endsAt)}',
                      style: context.text.titleSmall,
                    ),
                    if (_data!.plan case final plan? when plan.reviewedAt != null || (plan.reviewRemark ?? '').isNotEmpty) ...[
                      const SizedBox(height: Kx.s12),
                      _ReviewCard(plan: plan),
                    ],
                    const SizedBox(height: Kx.s12),
                    _aiRow(context),
                    _Section(title: l.lessonTopics),
                    _topics(context),
                    _Section(title: l.lessonObjectives),
                    ..._textList(
                      _objectives,
                      keyPrefix: 'objective',
                      hint: l.objectiveHint,
                      max: _maxObjectives,
                      addLabel: l.addObjective,
                      maxLength: 300,
                    ),
                    _Section(title: l.lessonSteps, trailing: _total(context)),
                    for (final (i, s) in _steps.indexed) _stepRow(context, i, s),
                    if (_steps.length < _maxSteps)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          key: const Key('addStep'),
                          onPressed: () => _changed(() => _steps.add(_Step(const LessonStep(minutes: 5, activity: '')))),
                          icon: const Icon(Icons.add, size: 18),
                          label: Text(l.addStep),
                        ),
                      ),
                    _Section(title: l.lessonMaterials),
                    ..._textList(
                      _materials,
                      keyPrefix: 'material',
                      hint: l.materialHint,
                      max: _maxMaterials,
                      addLabel: l.addMaterial,
                      maxLength: 200,
                    ),
                    _Section(title: l.lessonCheck),
                    TextFormField(
                      key: const Key('assessmentField'),
                      controller: _assessment,
                      minLines: 2,
                      maxLines: 6,
                      maxLength: 800,
                      decoration: InputDecoration(hintText: l.lessonCheckHint, counterText: ''),
                    ),
                    _Section(title: l.lessonHomework),
                    TextFormField(
                      key: const Key('homeworkField'),
                      controller: _homework,
                      minLines: 2,
                      maxLines: 6,
                      maxLength: 800,
                      decoration: InputDecoration(hintText: l.lessonHomeworkHint, counterText: ''),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _aiRow(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FilledButton.tonalIcon(
          key: const Key('draftWithAi'),
          onPressed: _drafting || _saving ? null : _draft,
          icon: _drafting
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.auto_awesome, size: 18),
          label: Text(_drafting ? l.drafting : l.draftWithAi),
        ),
        if (_aiDrafted) ...[
          const SizedBox(height: Kx.s8),
          Pill(l.aiDraftLabel, key: const Key('aiDraftLabel'), icon: Icons.auto_awesome, background: c.tertiaryContainer, foreground: c.onTertiaryContainer),
          if (_preview)
            Padding(
              padding: const EdgeInsets.only(top: Kx.s4),
              child: Text(l.aiPreviewNote, key: const Key('aiPreviewNote'), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            ),
        ],
      ],
    );
  }

  Widget _topics(BuildContext context) {
    final l = context.l10n;
    final suggested = _data?.suggestedTopicIds.toSet() ?? const <String>{};
    return Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (_topicIds.isEmpty) Text(l.noTopicsChosen, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        for (final id in _topicIds)
          InputChip(
            key: Key('lessonTopic-$id'),
            avatar: suggested.contains(id) ? const Icon(Icons.event_note_outlined, size: 18) : null,
            label: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 260),
              child: Text(_titles[id] ?? '…', maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
            onDeleted: () => _changed(() => _topicIds = [..._topicIds]..remove(id)),
            deleteButtonTooltipMessage: l.remove,
          ),
        if (_syllabus != null)
          ActionChip(
            key: const Key('addTopic'),
            avatar: const Icon(Icons.add, size: 18),
            label: Text(l.chooseTopics),
            onPressed: _pickTopics,
          ),
      ],
    );
  }

  Widget _total(BuildContext context) {
    final l = context.l10n;
    final total = _steps.fold(0, (n, s) => n + s.value);
    final length = widget.period.minutes;
    final over = total > length;
    return Text(
      over ? l.stepsOver(total, length) : l.stepsTotal(total, length),
      key: const Key('stepsTotal'),
      textAlign: TextAlign.end,
      style: context.text.labelLarge?.copyWith(color: over ? context.colors.error : context.colors.onSurfaceVariant),
    );
  }

  Widget _stepRow(BuildContext context, int i, _Step s) {
    final l = context.l10n;
    return Padding(
      key: ObjectKey(s),
      padding: const EdgeInsets.only(bottom: Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 64,
            child: TextFormField(
              key: Key('stepMinutes-$i'),
              controller: s.minutes,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
              textAlign: TextAlign.center,
              decoration: InputDecoration(labelText: l.minutesShortLabel),
            ),
          ),
          const SizedBox(width: Kx.s8),
          Expanded(
            child: TextFormField(
              key: Key('stepActivity-$i'),
              controller: s.activity,
              minLines: 1,
              maxLines: 5,
              maxLength: 600,
              decoration: InputDecoration(hintText: l.stepHint, counterText: ''),
            ),
          ),
          PopupMenuButton<String>(
            key: Key('stepMenu-$i'),
            tooltip: l.moreOptions,
            onSelected: (v) => _changed(() {
              final list = [..._steps];
              switch (v) {
                case 'up':
                  list.insert(i - 1, list.removeAt(i));
                case 'down':
                  list.insert(i + 1, list.removeAt(i));
                case 'remove':
                  list.removeAt(i);
                  WidgetsBinding.instance.addPostFrameCallback((_) => s.dispose());
              }
              _steps = list;
            }),
            itemBuilder: (_) => [
              if (i > 0) PopupMenuItem(key: const Key('stepUp'), value: 'up', child: Text(l.moveUp)),
              if (i < _steps.length - 1) PopupMenuItem(key: const Key('stepDown'), value: 'down', child: Text(l.moveDown)),
              PopupMenuItem(key: const Key('stepRemove'), value: 'remove', child: Text(l.remove)),
            ],
          ),
        ],
      ),
    );
  }

  List<Widget> _textList(
    List<TextEditingController> list, {
    required String keyPrefix,
    required String hint,
    required int max,
    required String addLabel,
    required int maxLength,
  }) => [
    for (final (i, c) in list.indexed)
      Padding(
        key: ObjectKey(c),
        padding: const EdgeInsets.only(bottom: Kx.s8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextFormField(
                key: Key('$keyPrefix-$i'),
                controller: c,
                minLines: 1,
                maxLines: 4,
                maxLength: maxLength,
                decoration: InputDecoration(hintText: hint, counterText: ''),
              ),
            ),
            IconButton(
              key: Key('${keyPrefix}Remove-$i'),
              tooltip: context.l10n.remove,
              onPressed: () => _changed(() {
                list.removeAt(i);
                WidgetsBinding.instance.addPostFrameCallback((_) => c.dispose());
              }),
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    if (list.length < max)
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: Key('${keyPrefix}Add'),
          onPressed: () => _changed(() => list.add(TextEditingController())),
          icon: const Icon(Icons.add, size: 18),
          label: Text(addLabel),
        ),
      ),
  ];
}

class _Section extends StatelessWidget {
  const _Section({required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Kx.s20, bottom: Kx.s8),
    child: Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: Kx.s8,
      children: [
        Text(title, style: context.text.titleMedium),
        ?trailing,
      ],
    ),
  );
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.plan});

  final LessonPlan plan;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final remark = plan.reviewRemark ?? '';
    return Card(
      key: const Key('reviewCard'),
      margin: EdgeInsets.zero,
      color: c.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.rate_review_outlined, color: c.onSecondaryContainer),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    plan.reviewedAt == null ? l.reviewRemark : l.reviewedOn(Fmt.of(context).shortDay(plan.reviewedAt!)),
                    style: context.text.titleSmall?.copyWith(color: c.onSecondaryContainer),
                  ),
                  if (remark.isNotEmpty) ...[
                    const SizedBox(height: Kx.s4),
                    Text(remark, key: const Key('reviewRemark'), style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The subject's syllabus with checkboxes; the year plan's suggestions for the week are marked.
class _TopicPicker extends StatefulWidget {
  const _TopicPicker({required this.syllabus, required this.selected, required this.suggested});

  final Syllabus syllabus;
  final List<String> selected;
  final List<String> suggested;

  @override
  State<_TopicPicker> createState() => _TopicPickerState();
}

class _TopicPickerState extends State<_TopicPicker> {
  late final _picked = [...widget.selected];

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final suggested = widget.suggested.toSet();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s8, Kx.s8),
            child: Row(
              children: [
                Expanded(child: Text(l.chooseTopics, style: context.text.titleLarge)),
                FilledButton(key: const Key('topicsDone'), onPressed: () => Navigator.pop(context, _picked), child: Text(l.done)),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              controller: scroll,
              children: [
                for (final ch in widget.syllabus.chapters) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s4),
                    child: Text(ch.title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
                  ),
                  for (final t in ch.topics)
                    CheckboxListTile(
                      key: Key('pickTopic-${t.id}'),
                      value: _picked.contains(t.id),
                      onChanged: !_picked.contains(t.id) && _picked.length >= _maxTopics
                          ? null
                          : (v) => setState(() => v == true ? _picked.add(t.id) : _picked.remove(t.id)),
                      title: Text(t.title),
                      subtitle: suggested.contains(t.id) ? Text(l.suggestedThisWeek, style: TextStyle(color: c.primary)) : null,
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> openLessonPlan(BuildContext context, {required TeacherApi api, required Period period, required String date, VoidCallback? onSaved}) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => LessonPlanScreen(api: api, period: period, date: date, onSaved: onSaved)),
    );
