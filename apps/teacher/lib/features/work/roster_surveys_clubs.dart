import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// Course registration rosters for the offerings I teach. The term and offering lists are limited
/// to heads of department by the server; a plain teacher sees the server's reason.
class CourseRosterScreen extends StatefulWidget {
  const CourseRosterScreen({super.key, required this.api, required this.userId});

  final TeacherApi api;

  /// The signed-in teacher: offerings are kept when this person is the faculty.
  final String userId;

  @override
  State<CourseRosterScreen> createState() => _CourseRosterScreenState();
}

class _CourseRosterScreenState extends State<CourseRosterScreen> {
  String? _termId;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.courseRosterTitle)),
      body: AsyncBody<List<TermInfo>>(
        load: widget.api.courseTerms,
        isEmpty: (t) => t.isEmpty,
        empty: l.rosterNoTerms,
        builder: (context, terms, reload) {
          final termId = _termId ?? terms.last.id;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(Kx.s16),
            children: [
              DropdownButtonFormField<String>(
                key: const Key('termPicker'),
                initialValue: termId,
                decoration: InputDecoration(labelText: l.rosterTermLabel),
                items: [for (final t in terms) DropdownMenuItem(value: t.id, child: Text(t.name))],
                onChanged: (v) => setState(() => _termId = v),
              ),
              const SizedBox(height: Kx.s12),
              _Offerings(key: ValueKey(termId), api: widget.api, termId: termId, userId: widget.userId),
            ],
          );
        },
      ),
    );
  }
}

class _Offerings extends StatelessWidget {
  const _Offerings({super.key, required this.api, required this.termId, required this.userId});

  final TeacherApi api;
  final String termId;
  final String userId;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return FutureBuilder<List<OfferingInfo>>(
      future: api.courseOfferings(termId).then((all) => all.where((o) => o.facultyId == userId).toList()),
      builder: (context, snap) {
        if (snap.hasError) {
          final e = snap.error;
          return e is ApiException ? ErrorBanner.api(e) : ErrorBanner('$e');
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final rows = snap.data!;
        if (rows.isEmpty) return Text(l.rosterNoOfferings, key: const Key('noOfferings'));
        return Column(
          children: [
            for (final o in rows)
              ListTile(
                key: Key('offering-${o.id}'),
                contentPadding: EdgeInsets.zero,
                title: Text('${o.subjectCode} · ${o.subjectName}'),
                subtitle: Text(l.rosterCounts('${o.registered}', '${o.waitlisted}')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => OfferingRosterScreen(api: api, offering: o))),
              ),
          ],
        );
      },
    );
  }
}

/// Who is registered for one course, then the waitlist in order.
class OfferingRosterScreen extends StatelessWidget {
  const OfferingRosterScreen({super.key, required this.api, required this.offering});

  final TeacherApi api;
  final OfferingInfo offering;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text('${offering.subjectCode} · ${offering.subjectName}')),
      body: AsyncBody<List<RosterEntry>>(
        load: () => api.offeringRoster(offering.id),
        isEmpty: (rows) => rows.isEmpty,
        empty: l.rosterEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final r in rows)
              ListTile(
                key: Key('student-${r.studentId}'),
                leading: KxAvatar(name: r.fullName, size: 40),
                title: Text(r.fullName),
                subtitle: Text(r.rollNo),
                trailing: r.status == 'waitlisted' ? Text(l.rosterWaitlist('${r.waitlistPos ?? ''}')) : null,
              ),
          ],
        ),
      ),
    );
  }
}

/// Open surveys addressed to me.
class SurveysScreen extends StatefulWidget {
  const SurveysScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<SurveysScreen> createState() => _SurveysScreenState();
}

class _SurveysScreenState extends State<SurveysScreen> {
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.surveysTitle)),
      body: AsyncBody<List<SurveyInfo>>(
        key: ValueKey(_round),
        load: widget.api.mySurveys,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.surveysEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final s in rows)
              ListTile(
                key: Key('survey-${s.id}'),
                leading: Icon(s.answered ? Icons.check_circle_outline : Icons.poll_outlined),
                title: Text(s.title),
                subtitle: Text([if (s.answered) l.surveyAnswered, if (s.anonymous) l.surveyAnonymous, if (s.closesAt != null) l.surveyClosesOn(f.when(s.closesAt!))].join(' · ')),
                trailing: s.answered ? null : const Icon(Icons.chevron_right),
                onTap: s.answered
                    ? null
                    : () async {
                        final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => SurveyAnswerScreen(api: widget.api, survey: s)));
                        if (sent == true && mounted) setState(() => _round++);
                      },
              ),
          ],
        ),
      ),
    );
  }
}

/// Answering one survey: choices, a 1 to 5 rating or text for each question.
class SurveyAnswerScreen extends StatefulWidget {
  const SurveyAnswerScreen({super.key, required this.api, required this.survey});

  final TeacherApi api;
  final SurveyInfo survey;

  @override
  State<SurveyAnswerScreen> createState() => _SurveyAnswerScreenState();
}

class _SurveyAnswerScreenState extends State<SurveyAnswerScreen> {
  final _choices = <String, Set<String>>{};
  final _ratings = <String, int>{};
  final _texts = <String, TextEditingController>{};
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final q in widget.survey.questions) {
      if (q.kind == 'text') _texts[q.id] = TextEditingController();
    }
  }

  @override
  void dispose() {
    for (final c in _texts.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    final answers = <SurveyAnswer>[];
    for (final q in widget.survey.questions) {
      final answer = switch (q.kind) {
        'text' => _texts[q.id]!.text.trim().isEmpty ? null : SurveyAnswer(q.id, text: _texts[q.id]!.text.trim()),
        'rating' => _ratings[q.id] == null ? null : SurveyAnswer(q.id, rating: _ratings[q.id]),
        _ => (_choices[q.id] ?? {}).isEmpty ? null : SurveyAnswer(q.id, choices: _choices[q.id]!.toList()),
      };
      if (answer == null) {
        if (q.required) {
          setState(() => _error = l.surveyRequired);
          return;
        }
        continue;
      }
      answers.add(answer);
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.submitSurvey(widget.survey.id, answers);
      messenger.showSnackBar(SnackBar(content: Text(l.surveyThanks)));
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
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
          if (s.description.isNotEmpty) Text(s.description),
          if (s.anonymous) Text(l.surveyAnonymous, style: context.text.labelMedium),
          for (final q in s.questions) ...[
            const SizedBox(height: Kx.s16),
            Text('${q.prompt}${q.required ? ' *' : ''}', style: context.text.titleSmall),
            if (q.kind == 'text')
              TextField(key: Key('answer-${q.id}'), controller: _texts[q.id], maxLines: 3, decoration: InputDecoration(hintText: l.surveyAnswerHint))
            else if (q.kind == 'rating')
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (var n = 1; n <= 5; n++)
                    ChoiceChip(key: Key('rate-${q.id}-$n'), label: Text('$n'), selected: _ratings[q.id] == n, onSelected: (_) => setState(() => _ratings[q.id] = n),
                    ),
                ],
              )
            else
              for (final o in q.options)
                CheckboxListTile(
                  key: Key('option-${q.id}-$o'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(o),
                  value: (_choices[q.id] ?? {}).contains(o),
                  onChanged: (on) => setState(() {
                    final set = _choices.putIfAbsent(q.id, () => <String>{});
                    if (q.kind == 'single') set.clear();
                    on == true ? set.add(o) : set.remove(o);
                  }),
                ),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('sendSurvey'), onPressed: _busy ? null : _send, child: Text(l.surveySubmit)),
        ],
      ),
    );
  }
}

/// Clubs I coordinate, with their members and points.
class ClubsScreen extends StatelessWidget {
  const ClubsScreen({super.key, required this.api, required this.userId});

  final TeacherApi api;
  final String userId;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.clubsTitle)),
      body: AsyncBody<List<ClubInfo>>(
        load: () async => [for (final c in await api.clubs()) if (c.coordinatorId == userId) c],
        isEmpty: (rows) => rows.isEmpty,
        empty: l.clubsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final c in rows)
              ListTile(
                key: Key('club-${c.id}'),
                leading: const Icon(Icons.groups_2_outlined),
                title: Text(c.name),
                subtitle: Text([l.clubMembersCount('${c.members}'), if (c.pending > 0) l.clubPendingCount('${c.pending}')].join(' · ')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => ClubMembersScreen(api: api, club: c))),
              ),
          ],
        ),
      ),
    );
  }
}

class ClubMembersScreen extends StatelessWidget {
  const ClubMembersScreen({super.key, required this.api, required this.club});

  final TeacherApi api;
  final ClubInfo club;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(club.name)),
      body: AsyncBody<List<ClubMember>>(
        load: () => api.clubMembers(club.id),
        isEmpty: (rows) => rows.isEmpty,
        empty: l.clubNoMembers,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final m in rows)
              ListTile(
                key: Key('member-${m.studentId}'),
                leading: KxAvatar(name: m.fullName, size: 40),
                title: Text(m.fullName),
                subtitle: Text(m.rollNo),
                trailing: Text(l.clubPoints('${m.points}')),
              ),
          ],
        ),
      ),
    );
  }
}
