import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/obe_models.dart';
import '../../core/work_models.dart' show numText;
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// The words for a version's approval step.
String coStageText(AppLocalizations l, String stage) => switch (stage) {
  'hod' => l.obeStageHod,
  'coordinator' => l.obeStageCoordinator,
  'iqac' => l.obeStageIqac,
  'returned' => l.obeStageReturned,
  'approved' => l.obeStageApproved,
  _ => l.obeStageDraft,
};

String _decisionText(AppLocalizations l, String decision) => switch (decision) {
  'submitted' => l.obeDecisionSubmitted,
  'approved' => l.obeDecisionApproved,
  'returned' => l.obeDecisionReturned,
  _ => l.obeDecisionComment,
};

// ---- question-wise marks ------------------------------------------------------------------------------------------

/// A course's assessments this year, with how far their question tagging and question-wise marks have got.
class CourseAssessmentsScreen extends StatelessWidget {
  const CourseAssessmentsScreen({super.key, required this.api, required this.subjectId, required this.title});

  final TeacherApi api;
  final String subjectId, title;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.obeQuestionMarks)),
      body: AsyncBody<({List<CourseAssessment> rows, bool hasYear})>(
        load: () async {
          final year = await api.currentAcademicYearId();
          if (year == null) return (rows: const <CourseAssessment>[], hasYear: false);
          return (rows: await api.courseAssessments(subjectId, year), hasYear: true);
        },
        isEmpty: (d) => d.rows.isEmpty,
        empty: l.obeAssessmentsEmpty,
        builder: (context, d, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: Kx.s24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
              child: Text(title, style: context.text.titleSmall),
            ),
            for (final a in d.rows)
              ListTile(
                key: Key('obeAssessment-${a.id}'),
                leading: Icon(a.evidence == 'see' ? Icons.school_outlined : Icons.assignment_outlined),
                title: Text(a.title),
                subtitle: Text(
                  [
                    a.section,
                    a.evidence == 'see' ? l.obeEvidenceSee : l.obeEvidenceCie,
                    l.obeAssessmentProgress(a.tagged, a.questions, a.questionMarked, a.classSize),
                  ].join(' · '),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push<void>(
                    MaterialPageRoute(
                      builder: (_) => QuestionMarksScreen(api: api, assessmentId: a.id),
                    ),
                  );
                  await reload();
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// Question-wise marks for one assessment: one card per student with a field per question; the total is the sum.
class QuestionMarksScreen extends StatefulWidget {
  const QuestionMarksScreen({super.key, required this.api, required this.assessmentId});

  final TeacherApi api;
  final String assessmentId;

  @override
  State<QuestionMarksScreen> createState() => _QuestionMarksScreenState();
}

class _QuestionMarksScreenState extends State<QuestionMarksScreen> {
  QuestionPaper? _paper;
  ApiException? _error;
  bool _saving = false;

  /// Typed text per student and question, and the absent ticks.
  final Map<String, Map<String, TextEditingController>> _fields = {};
  final Map<String, bool> _absent = {};
  final Set<String> _dirty = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final row in _fields.values) {
      for (final c in row.values) {
        c.dispose();
      }
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await widget.api.questionPaper(widget.assessmentId);
      if (!mounted) return;
      setState(() {
        _error = null;
        _take(p);
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _take(QuestionPaper p) {
    _paper = p;
    _dirty.clear();
    for (final s in p.students) {
      _absent[s.id] = s.absent;
      final row = _fields.putIfAbsent(s.id, () => {});
      for (final q in p.questions) {
        final v = s.marks[q.id];
        (row[q.id] ??= TextEditingController()).text = v == null ? '' : numText(v);
      }
    }
  }

  double? _total(String studentId) {
    final p = _paper!;
    if (_absent[studentId] == true) return null;
    double sum = 0;
    var any = false;
    for (final q in p.questions) {
      final r = readQuestionMark(_fields[studentId]![q.id]!.text, q.maxMarks);
      if (r.value != null) {
        sum += r.value!;
        any = true;
      }
    }
    return any ? sum : null;
  }

  int get _invalid {
    final p = _paper!;
    var n = 0;
    for (final s in p.students) {
      if (_absent[s.id] == true) continue;
      for (final q in p.questions) {
        if (!readQuestionMark(_fields[s.id]![q.id]!.text, q.maxMarks).ok) n++;
      }
    }
    return n;
  }

  Future<void> _save() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    final p = _paper!;
    if (_invalid > 0) {
      messenger.showSnackBar(SnackBar(content: Text(l.obeMarksFix)));
      return;
    }
    final entries = [
      for (final s in p.students)
        if (_dirty.contains(s.id))
          QuestionMarksEntry(
            studentId: s.id,
            absent: _absent[s.id] == true,
            marks: {
              for (final q in p.questions)
                q.id: _absent[s.id] == true ? null : readQuestionMark(_fields[s.id]![q.id]!.text, q.maxMarks).value,
            },
          ),
    ];
    if (entries.isEmpty) return;
    setState(() => _saving = true);
    try {
      final next = await widget.api.saveQuestionMarks(p.id, entries);
      if (!mounted) return;
      setState(() => _take(next));
      messenger.showSnackBar(SnackBar(content: Text(l.obeMarksSaved)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = _paper;
    final canSave = p != null && p.editable && p.questions.isNotEmpty;
    return PopScope(
      canPop: _dirty.isEmpty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final nav = Navigator.of(context);
        if (await confirmDiscard(context)) {
          setState(_dirty.clear);
          nav.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(p?.title ?? l.obeQuestionMarks)),
        bottomNavigationBar: canSave
            ? SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
                  child: FilledButton.icon(
                    key: const Key('saveQuestionMarks'),
                    onPressed: _saving || _dirty.isEmpty ? null : _save,
                    icon: _saving
                        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save_outlined),
                    label: Text(l.obeSaveMarks),
                  ),
                ),
              )
            : null,
        body: _error != null && p == null
            ? ListView(
                padding: const EdgeInsets.all(Kx.s16),
                children: [ErrorBanner.api(_error!, onRetry: _load)],
              )
            : p == null
            ? const Center(child: CircularProgressIndicator())
            : _body(context, l, p),
      ),
    );
  }

  Widget _body(BuildContext context, AppLocalizations l, QuestionPaper p) {
    if (p.questions.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(Kx.s24),
        children: [Text(l.obeNoPaper, key: const Key('obeNoPaper'), textAlign: TextAlign.center)],
      );
    }
    return ListView(
      padding: const EdgeInsets.only(bottom: Kx.s24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
          child: Text(
            '${p.subject} · ${p.section} · ${p.evidence == 'see' ? l.obeEvidenceSee : l.obeEvidenceCie}',
            style: context.text.bodySmall,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final q in p.questions)
                Chip(
                  key: Key('qHead-${q.no}'),
                  visualDensity: VisualDensity.compact,
                  label: Text(l.obeQuestionHead(q.no, numText(q.maxMarks), p.coCodes(q).isEmpty ? '-' : p.coCodes(q))),
                ),
            ],
          ),
        ),
        if (!p.editable)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
            child: Text(l.obeMarksReadOnly, key: const Key('obeMarksReadOnly')),
          ),
        for (final s in p.students) _studentCard(context, l, p, s),
      ],
    );
  }

  Widget _studentCard(BuildContext context, AppLocalizations l, QuestionPaper p, PaperStudent s) {
    final absent = _absent[s.id] == true;
    final total = _total(s.id);
    return Card(
      key: Key('qmStudent-${s.id}'),
      margin: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('${s.rollNo} · ${s.name}', style: context.text.titleSmall)),
                Text(
                  absent ? l.obeAbsent : l.obeTotalOf(total == null ? '-' : numText(total), numText(p.paperMarks)),
                  key: Key('qmTotal-${s.id}'),
                  style: context.text.labelLarge,
                ),
              ],
            ),
            CheckboxListTile(
              key: Key('qmAbsent-${s.id}'),
              contentPadding: EdgeInsets.zero,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(l.obeAbsent),
              value: absent,
              onChanged: p.editable
                  ? (v) => setState(() {
                      _absent[s.id] = v == true;
                      _dirty.add(s.id);
                    })
                  : null,
            ),
            if (!absent)
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final q in p.questions)
                    SizedBox(
                      width: 92,
                      child: Builder(
                        builder: (context) {
                          final c = _fields[s.id]![q.id]!;
                          final ok = readQuestionMark(c.text, q.maxMarks).ok;
                          return TextField(
                            key: Key('qm-${s.id}-${q.no}'),
                            controller: c,
                            enabled: p.editable,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                            textInputAction: TextInputAction.next,
                            decoration: InputDecoration(
                              isDense: true,
                              labelText: l.obeQuestionLabel(q.no),
                              helperText: '/${numText(q.maxMarks)}',
                              errorText: ok ? null : l.obeMarkRange(numText(q.maxMarks)),
                              errorMaxLines: 2,
                            ),
                            onChanged: (_) => setState(() => _dirty.add(s.id)),
                          );
                        },
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ---- course-outcome approvals -------------------------------------------------------------------------------------

/// The CO versions waiting at a step I decide (head of department, OBE coordinator or IQAC).
class CoApprovalsScreen extends StatelessWidget {
  const CoApprovalsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.obeApprovals)),
      body: AsyncBody<List<CoApproval>>(
        load: api.coApprovals,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.obeApprovalsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final a in rows)
              ListTile(
                key: Key('coApproval-${a.id}'),
                leading: const Icon(Icons.fact_check_outlined),
                title: Text(a.subject),
                subtitle: Text(
                  [
                    l.obeApprovalLine(a.code, a.version, a.cos),
                    coStageText(l, a.stage),
                    if (a.submittedBy != null) l.obeSentBy(a.submittedBy!),
                    if (a.verbIssues > 0) l.obeVerbIssues(a.verbIssues),
                  ].join(' · '),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push<void>(
                    MaterialPageRoute(
                      builder: (_) => CoReviewScreen(api: api, coSetId: a.id, title: a.subject),
                    ),
                  );
                  await reload();
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// One version's review: its history, and approve / return / comment for the reviewer whose step it is.
class CoReviewScreen extends StatefulWidget {
  const CoReviewScreen({super.key, required this.api, required this.coSetId, required this.title});

  final TeacherApi api;
  final String coSetId, title;

  @override
  State<CoReviewScreen> createState() => _CoReviewScreenState();
}

class _CoReviewScreenState extends State<CoReviewScreen> {
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _decide(String decision, Future<void> Function() reload) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    final text = _comment.text.trim();
    if (decision == 'return' && text.isEmpty) {
      messenger.showSnackBar(SnackBar(content: Text(l.obeReturnNeedsComment)));
      return;
    }
    if (decision == 'comment' && text.isEmpty) {
      messenger.showSnackBar(SnackBar(content: Text(l.obeCommentNeeded)));
      return;
    }
    setState(() => _busy = true);
    final ok = await runOrSnack(context, () => widget.api.reviewCoSet(widget.coSetId, decision: decision, comment: text));
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) return;
    _comment.clear();
    messenger.showSnackBar(
      SnackBar(
        content: Text(switch (decision) {
          'approve' => l.obeApprovedDone,
          'return' => l.obeReturnedDone,
          _ => l.obeCommentedDone,
        }),
      ),
    );
    if (decision == 'comment') {
      await reload();
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: AsyncBody<CoReviews>(
        load: () => widget.api.coReviews(widget.coSetId),
        builder: (context, r, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: Kx.s32),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
              child: Text(coStageText(l, r.reviewStage), key: const Key('reviewStage'), style: context.text.titleSmall),
            ),
            KxSectionHeader(l.obeHistory),
            if (r.history.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Text(l.obeHistoryEmpty),
              ),
            for (final h in r.history)
              ListTile(
                dense: true,
                leading: Icon(switch (h.decision) {
                  'approved' => Icons.check_circle_outline,
                  'returned' => Icons.undo,
                  'submitted' => Icons.send_outlined,
                  _ => Icons.chat_bubble_outline,
                }),
                title: Text([_decisionText(l, h.decision), coStageText(l, h.stage), if (h.co != null) h.co!].join(' · ')),
                subtitle: Text([if (h.comment != null && h.comment!.isNotEmpty) h.comment!, if (h.actor != null) h.actor!].join('\n')),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
              child: TextField(
                key: const Key('reviewComment'),
                controller: _comment,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: InputDecoration(labelText: l.obeReviewComment, border: const OutlineInputBorder()),
              ),
            ),
            if (!r.canDecide)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Text(l.obeNotYourStep, key: const Key('notYourStep'), style: context.text.bodySmall),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
              child: Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  if (r.canDecide)
                    FilledButton(
                      key: const Key('approveCoSet'),
                      onPressed: _busy ? null : () => _decide('approve', reload),
                      child: Text(l.obeApprove),
                    ),
                  if (r.canDecide)
                    OutlinedButton(
                      key: const Key('returnCoSet'),
                      onPressed: _busy ? null : () => _decide('return', reload),
                      child: Text(l.obeReturn),
                    ),
                  TextButton(
                    key: const Key('commentCoSet'),
                    onPressed: _busy ? null : () => _decide('comment', reload),
                    child: Text(l.obeAddComment),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Asks for an optional note and sends a draft CO version for approval; true when it was sent.
Future<bool> submitCoSetFlow(BuildContext context, TeacherApi api, String coSetId) async {
  final l = context.l10n;
  final text = await showDialog<String>(context: context, builder: (_) => const _SubmitDialog());
  if (text == null || !context.mounted) return false;
  final messenger = ScaffoldMessenger.of(context);
  var warnings = const <String>[];
  final ok = await runOrSnack(context, () async => warnings = await api.submitCoSet(coSetId, comment: text));
  if (ok) messenger.showSnackBar(SnackBar(content: Text(warnings.isEmpty ? l.obeSubmitted : l.obeSubmittedWarnings(warnings.length))));
  return ok;
}

/// The note to send with a version; pops the trimmed note, or null when cancelled.
class _SubmitDialog extends StatefulWidget {
  const _SubmitDialog();

  @override
  State<_SubmitDialog> createState() => _SubmitDialogState();
}

class _SubmitDialogState extends State<_SubmitDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.obeSubmit),
      content: TextField(
        key: const Key('submitNote'),
        controller: _note,
        maxLines: 3,
        decoration: InputDecoration(labelText: l.obeReviewNote),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('confirmSubmitCoSet'),
          onPressed: () => Navigator.pop(context, _note.text.trim()),
          child: Text(l.obeSubmit),
        ),
      ],
    );
  }
}
