import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/lms_models.dart';

/// My LMS courses and my quizzes: open a course to work on its content, live classes, students at risk and its
/// discussion queue; open a quiz to see flagged attempts, mark answers and send the best scores to internal marks.
class LmsCoursesScreen extends StatefulWidget {
  const LmsCoursesScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<LmsCoursesScreen> createState() => _LmsCoursesScreenState();
}

class _LmsCoursesScreenState extends State<LmsCoursesScreen> {
  List<TeacherCourse>? _courses;
  List<TeacherQuiz> _quizzes = const [];
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final c = await widget.api.lmsCourses();
      final q = await widget.api.lmsQuizzes();
      if (mounted) {
        setState(() {
          _courses = c;
          _quizzes = q;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final courses = _courses;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: Text(l.lmsTitle), bottom: TabBar(tabs: [Tab(text: l.lmsTitle), Tab(text: l.lmsTabQuizzes)])),
        body: TabBarView(
          children: [
            RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(Kx.s16),
                children: [
                  if (_error != null) Text(l.errorText(_error!), style: TextStyle(color: context.colors.error)),
                  if (courses == null && _error == null) const Center(child: CircularProgressIndicator()),
                  if (courses != null && courses.isEmpty) Text(l.lmsNoCourses),
                  for (final c in courses ?? const <TeacherCourse>[])
                    Card(
                      key: Key('lmsCourse-${c.id}'),
                      child: ListTile(
                        title: Text(c.title),
                        subtitle: Text('${c.subject} · ${l.lmsCourseStats(c.items, c.activeLearners)}'),
                        trailing: c.published ? const Icon(Icons.chevron_right) : Chip(label: Text(l.lmsDraft)),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LmsCourseScreen(api: widget.api, course: c))).then((_) => _load()),
                      ),
                    ),
                ],
              ),
            ),
            ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_quizzes.isEmpty) Text(l.lmsNoQuizzes),
                for (final q in _quizzes)
                  Card(
                    key: Key('lmsQuiz-${q.id}'),
                    child: ListTile(
                      title: Text(q.title),
                      subtitle: Text('${q.section} · ${l.lmsQuizStats(q.attempts, q.toMark, q.flagged)}'),
                      trailing: q.flagged > 0 ? Icon(Icons.flag_outlined, color: context.colors.error) : const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuizAttemptsScreen(api: widget.api, quiz: q))).then((_) => _load()),
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

/// One course: content (add a lesson page or a link, publish), live classes (schedule, attendance from joins),
/// students at risk, and the moderation queue.
class LmsCourseScreen extends StatefulWidget {
  const LmsCourseScreen({super.key, required this.api, required this.course});

  final TeacherApi api;
  final TeacherCourse course;

  @override
  State<LmsCourseScreen> createState() => _LmsCourseScreenState();
}

class _LmsCourseScreenState extends State<LmsCourseScreen> {
  TeacherCourseDetail? _detail;
  List<TeacherLive> _live = const [];
  List<RiskStudent> _risk = const [];
  List<ModerationRow> _queue = const [];
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final id = widget.course.id;
      final d = await widget.api.lmsCourse(id);
      final live = await widget.api.courseLive(id);
      final risk = await widget.api.courseAtRisk(id);
      final queue = await widget.api.forumQueue(id);
      if (mounted) {
        setState(() {
          _detail = d;
          _live = live;
          _risk = risk.where((r) => r.level != 'none').toList();
          _queue = queue;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() f, String done) async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      await f();
      messenger.showSnackBar(SnackBar(content: Text(done)));
      await _load();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  /// A small form; returns the values or null when cancelled.
  Future<List<String>?> _ask(String title, List<(String, bool)> fields) {
    final l = context.l10n;
    final ctrls = [for (final _ in fields) TextEditingController()];
    return showDialog<List<String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (i, f) in fields.indexed)
                TextField(key: Key('lmsField$i'), controller: ctrls[i], decoration: InputDecoration(labelText: f.$1), maxLines: f.$2 ? 6 : 1, minLines: f.$2 ? 3 : 1),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.lmsCancel)),
          FilledButton(key: const Key('lmsSave'), onPressed: () => Navigator.pop(ctx, [for (final c in ctrls) c.text.trim()]), child: Text(l.lmsSave)),
        ],
      ),
    );
  }

  Future<void> _addPage(String moduleId) async {
    final l = context.l10n;
    final v = await _ask(l.lmsAddPage, [(l.lmsFieldTitle, false), (l.lmsFieldBody, true)]);
    if (v == null || v[0].isEmpty) return;
    await _run(() => widget.api.addLessonPage(moduleId, title: v[0], body: v[1]), l.lmsAdded);
  }

  Future<void> _addLink(String moduleId) async {
    final l = context.l10n;
    final v = await _ask(l.lmsAddLink, [(l.lmsFieldTitle, false), (l.lmsFieldUrl, false)]);
    if (v == null || v[0].isEmpty) return;
    await _run(() => widget.api.addCourseLink(moduleId, title: v[0], url: v[1]), l.lmsAdded);
  }

  Future<void> _schedule() async {
    final l = context.l10n;
    final v = await _ask(l.lmsSchedule, [(l.lmsFieldTitle, false), (l.lmsStartsIn, false), (l.lmsMinutes, false), (l.lmsMeetingLink, false)]);
    if (v == null || v[0].isEmpty) return;
    final hours = double.tryParse(v[1]) ?? 1;
    await _run(() => widget.api.scheduleLive(widget.course.id, title: v[0], startsAt: DateTime.now().add(Duration(minutes: (hours * 60).round())), durationMin: int.tryParse(v[2]) ?? 45, joinUrl: v[3]), l.lmsAdded);
  }

  Future<void> _attendance(TeacherLive s) async {
    final l = context.l10n;
    final rows = await widget.api.liveAttendance(s.id);
    if (!mounted) return;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.8),
          child: Column(
            children: [
              ListTile(title: Text(l.lmsAttendanceFromJoins, style: ctx.text.titleMedium)),
              Expanded(
                child: ListView(
                  children: [
                    for (final r in rows)
                      ListTile(
                        title: Text('${r.rollNo} ${r.name}'),
                        trailing: Text(switch (r.suggested) {
                          'present' => l.lmsPresent,
                          'late' => l.lmsLate,
                          _ => l.lmsAbsent,
                        }),
                      ),
                  ],
                ),
              ),
              Padding(padding: const EdgeInsets.all(Kx.s16), child: FilledButton(key: const Key('lmsSaveAttendance'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.lmsSaveAttendance))),
            ],
          ),
        ),
      ),
    );
    if (ok == true) await _run(() => widget.api.confirmLiveAttendance(s.id, [for (final r in rows) (studentId: r.studentId, status: r.suggested)]), l.lmsAttendanceSaved);
  }

  String _reason(AppLocalizations l, String r) => switch (r) {
    'inactive' => l.lmsReasonInactive,
    'low_engagement' => l.lmsReasonLowEngagement,
    'low_quiz' => l.lmsReasonLowQuiz,
    'overdue' => l.lmsReasonOverdue,
    _ => l.lmsReasonMissedLive,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _detail;
    final ml = MaterialLocalizations.of(context);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.course.title),
          bottom: TabBar(isScrollable: true, tabs: [Tab(text: l.lmsTabContent), Tab(text: l.lmsTabLive), Tab(text: '${l.lmsTabRisk} (${_risk.length})'), Tab(text: '${l.lmsTabModeration} (${_queue.length})')]),
        ),
        body: _error != null
            ? Center(child: Text(l.errorText(_error!)))
            : d == null
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  ListView(
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      Text([l.lmsCompletionRule(d.completionPct), if (d.certificate) l.lmsGivesCertificate].join(' · '), style: context.text.bodySmall),
                      const SizedBox(height: Kx.s8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: OutlinedButton(key: const Key('lmsPublishToggle'), onPressed: () => _run(() => widget.api.setLmsCoursePublished(d.id, !d.published), l.lmsDone), child: Text(d.published ? l.lmsUnpublish : l.lmsPublish)),
                      ),
                      for (final m in d.modules)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(Kx.s12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(m.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                                if (m.items.isEmpty) Text(l.lmsNoItems, style: context.text.bodySmall),
                                for (final i in m.items) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(i.title), subtitle: Text(i.kind)),
                                Wrap(
                                  spacing: Kx.s8,
                                  children: [
                                    TextButton.icon(key: Key('lmsAddPage-${m.id}'), onPressed: () => _addPage(m.id), icon: const Icon(Icons.article_outlined), label: Text(l.lmsAddPage)),
                                    TextButton.icon(onPressed: () => _addLink(m.id), icon: const Icon(Icons.link), label: Text(l.lmsAddLink)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                  ListView(
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      Align(alignment: Alignment.centerLeft, child: FilledButton.icon(key: const Key('lmsSchedule'), onPressed: _schedule, icon: const Icon(Icons.videocam_outlined), label: Text(l.lmsSchedule))),
                      if (_live.isEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(l.lmsNoLive)),
                      for (final s in _live)
                        Card(
                          key: Key('lmsLive-${s.id}'),
                          child: ListTile(
                            title: Text(s.title),
                            subtitle: Text('${ml.formatShortDate(s.startsAt)} ${ml.formatTimeOfDay(TimeOfDay.fromDateTime(s.startsAt))} · ${l.lmsJoinedCount(s.joined)}'),
                            trailing: s.attendanceMarked
                                ? Tooltip(message: l.lmsMarked, child: const Icon(Icons.check_circle_outline))
                                : s.hasPeriod && s.startsAt.isBefore(DateTime.now())
                                ? TextButton(key: Key('lmsAttendance-${s.id}'), onPressed: () => _attendance(s), child: Text(l.lmsAttendanceFromJoins))
                                : null,
                          ),
                        ),
                    ],
                  ),
                  ListView(
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      if (_risk.isEmpty) Text(l.lmsNoRisk),
                      for (final r in _risk)
                        Card(
                          key: Key('lmsRisk-${r.id}'),
                          child: ListTile(
                            leading: Icon(Icons.warning_amber_outlined, color: r.level == 'high' ? context.colors.error : null),
                            title: Text('${r.rollNo} ${r.name}'),
                            subtitle: Text('${switch (r.level) {
                              'high' => l.lmsRiskHigh,
                              'medium' => l.lmsRiskMedium,
                              _ => l.lmsRiskLow,
                            }}: ${r.reasons.map((x) => _reason(l, x)).join(', ')}. ${l.lmsEngagement(r.engagementPct)}'),
                          ),
                        ),
                    ],
                  ),
                  ListView(
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      if (_queue.isEmpty) Text(l.lmsNothingToModerate),
                      for (final q in _queue)
                        Card(
                          key: Key('lmsQueue-${q.id}'),
                          child: Padding(
                            padding: const EdgeInsets.all(Kx.s12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(q.text),
                                Text('${q.author} · ${q.held ? l.lmsHeld : l.lmsReported(q.reports)}', style: context.text.bodySmall),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    TextButton(key: Key('lmsApprove-${q.id}'), onPressed: () => _run(() => widget.api.moderateForum(q.kind, q.id, 'approve'), l.lmsDone), child: Text(l.lmsApprove)),
                                    TextButton(onPressed: () => _run(() => widget.api.moderateForum(q.kind, q.id, 'hide'), l.lmsDone), child: Text(l.lmsHide)),
                                  ],
                                ),
                              ],
                            ),
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

/// A quiz's attempts: who left the quiz too often (proctoring), answers to mark by hand, and the push of the best
/// scores to the internal-marks register.
class QuizAttemptsScreen extends StatefulWidget {
  const QuizAttemptsScreen({super.key, required this.api, required this.quiz});

  final TeacherApi api;
  final TeacherQuiz quiz;

  @override
  State<QuizAttemptsScreen> createState() => _QuizAttemptsScreenState();
}

class _QuizAttemptsScreenState extends State<QuizAttemptsScreen> {
  List<TeacherQuizAttempt>? _rows;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.api.quizAttempts(widget.quiz.id);
      if (mounted) setState(() => _rows = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  String _n(double? v) => v == null ? '-' : (v % 1 == 0 ? v.toStringAsFixed(0) : v.toStringAsFixed(2));

  Future<void> _mark(TeacherQuizAttempt a) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final ctrl = TextEditingController();
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.lmsMarkAnswer),
        content: TextField(key: const Key('lmsMarks'), controller: ctrl, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.lmsCancel)), FilledButton(key: const Key('lmsSaveMarks'), onPressed: () => Navigator.pop(ctx, ctrl.text), child: Text(l.lmsSave))],
      ),
    );
    final marks = double.tryParse(v ?? '');
    if (marks == null) return;
    try {
      await widget.api.markQuizAnswer(a.id, a.unmarked.first, marks);
      await _load();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  Future<void> _push() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await widget.api.pushQuizMarks(widget.quiz.id);
      messenger.showSnackBar(SnackBar(content: Text(l.lmsPushed(r.students, r.absent))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(title: Text(widget.quiz.title)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) Text(l.errorText(_error!)),
          if (rows == null && _error == null) const Center(child: CircularProgressIndicator()),
          Align(alignment: Alignment.centerLeft, child: FilledButton.icon(key: const Key('lmsPush'), onPressed: _push, icon: const Icon(Icons.upload_outlined), label: Text(l.lmsPushMarks))),
          const SizedBox(height: Kx.s8),
          for (final a in rows ?? const <TeacherQuizAttempt>[])
            Card(
              key: Key('lmsAttempt-${a.id}'),
              child: ListTile(
                leading: a.flagged ? Icon(Icons.flag, color: context.colors.error) : const Icon(Icons.person_outline),
                title: Text('${a.rollNo} ${a.name}'),
                subtitle: Text([l.lmsScore(_n(a.score), _n(a.maxScore)), if (a.violations > 0) l.lmsFlagged(a.violations), if (a.autoSubmitted) l.lmsAutoSubmitted].join(' · ')),
                trailing: a.unmarked.isNotEmpty ? TextButton(key: Key('lmsMark-${a.id}'), onPressed: () => _mark(a), child: Text(l.lmsToMark)) : null,
              ),
            ),
        ],
      ),
    );
  }
}
