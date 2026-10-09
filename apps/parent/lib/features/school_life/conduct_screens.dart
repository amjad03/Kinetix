import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/conduct.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// "2026-09-10" as "Thu 10 Sep" in the app's language; anything else as sent.
String _day(BuildContext context, String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : context.fmt.shortDay(d);
}

String _severity(AppLocalizations l, String s) => switch (s) {
  'major' => l.severity_major,
  'severe' => l.severity_severe,
  _ => l.severity_minor,
};

KxTone _severityTone(String s) => switch (s) {
  'major' => KxTone.warning,
  'severe' => KxTone.danger,
  _ => KxTone.neutral,
};

String _incidentStatus(AppLocalizations l, String s) => switch (s) {
  'under_review' => l.incidentStatus_under_review,
  'action_taken' => l.incidentStatus_action_taken,
  'appealed' => l.incidentStatus_appealed,
  'closed' => l.incidentStatus_closed,
  _ => l.incidentStatus_reported,
};

String _method(AppLocalizations l, String m) => switch (m) {
  'call' => l.noticeMethod_call,
  'meeting' => l.noticeMethod_meeting,
  'letter' => l.noticeMethod_letter,
  _ => l.noticeMethod_message,
};

Widget _sub(BuildContext context, String text) => Text(text, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant));

Widget _points(BuildContext context, int points) => Text(points > 0 ? '+$points' : '$points', style: context.text.titleMedium);

List<Widget> _recognitions(BuildContext context, List<HouseRecognition> items) => [
  for (final r in items)
    ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(r.reason),
      subtitle: Text(_day(context, r.awardedOn)),
      trailing: _points(context, r.points),
    ),
];

/// A child's clubs and posts held, events attended, house and points, co-curricular grades and
/// achievements, read only. The school can switch this off for parents.
class ActivitiesScreen extends StatelessWidget {
  const ActivitiesScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<ChildActivities>(
      title: l.activitiesTitle(child.firstName),
      load: () => api.activities(child.id),
      builder: (context, a, reload) => [
        if (a.isEmpty) EmptyNote(l.activitiesEmpty),
        if (a.houseName != null)
          Card(
            key: const Key('activitiesHouse'),
            child: ListTile(
              leading: const Icon(Icons.emoji_events_outlined),
              title: Text(a.houseName!),
              subtitle: Text([l.activitiesHousePoints(a.housePoints), if (a.houseCaptain) l.activitiesCaptain].join(' · ')),
            ),
          ),
        if (a.clubs.isNotEmpty) ...[
          Heading(l.activitiesClubs),
          for (final c in a.clubs)
            ListTile(
              key: Key('club-${c.club}'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.groups_outlined),
              title: Text(c.club),
              subtitle: Text([c.posts.isEmpty ? l.clubRoleMember : c.posts.join(', '), l.activitiesClubStats(c.points, c.activities)].join(' · ')),
            ),
        ],
        if (a.events.isNotEmpty) ...[
          Heading(l.activitiesEvents),
          for (final e in a.events)
            ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.celebration_outlined), title: Text(e.title), subtitle: Text(_day(context, e.on))),
        ],
        if (a.grades.isNotEmpty) ...[
          Heading(a.coCurricularTerm == null ? l.coCurricular : l.activitiesGrades(a.coCurricularTerm!)),
          for (final g in a.grades)
            ListTile(key: Key('grade-${g.activity}'), contentPadding: EdgeInsets.zero, title: Text(g.activity), subtitle: g.remark.isEmpty ? null : Text(g.remark), trailing: Text(g.grade, style: context.text.titleMedium)),
        ],
        if (a.achievements.isNotEmpty) ...[
          Heading(l.activitiesAchievements),
          for (final x in a.achievements)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.military_tech_outlined),
              title: Text(x.title),
              subtitle: Text([x.club, x.level, x.position, if (x.on.isNotEmpty) _day(context, x.on)].where((s) => s.isNotEmpty).join(' · ')),
            ),
        ],
        if (a.recognitions.isNotEmpty) ...[Heading(l.activitiesRecognitions), ..._recognitions(context, a.recognitions)],
      ],
    );
  }
}

/// A child's behaviour: the report-card grade, notices from the school (to acknowledge),
/// incidents with the actions taken, and house recognitions.
class BehaviourScreen extends StatelessWidget {
  const BehaviourScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  Future<(ChildBehaviour, List<SchoolNotice>)> _load() async {
    final b = await api.behaviour(child.id);
    final notices = await api.schoolNotices();
    return (b, [for (final n in notices) if (n.studentId == child.id) n]);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<(ChildBehaviour, List<SchoolNotice>)>(
      title: l.behaviourTitle(child.firstName),
      load: _load,
      builder: (context, data, reload) {
        final (b, notices) = data;
        return [
          if (b.behaviourGrade != null)
            Card(
              key: const Key('behaviourGrade'),
              child: ListTile(
                leading: const Icon(Icons.verified_outlined),
                title: Text(l.behaviourGradeLine(b.behaviourGrade!)),
                subtitle: b.term == null ? null : Text(b.term!),
              ),
            ),
          if (notices.isNotEmpty) ...[Heading(l.behaviourNotices), for (final n in notices) _NoticeCard(notice: n, api: api, onChanged: reload)],
          Heading(l.behaviourIncidents),
          if (b.incidents.isEmpty) EmptyNote(l.behaviourNoIncidents),
          for (final i in b.incidents) _IncidentCard(incident: i),
          if (b.recognitions.isNotEmpty) ...[Heading(l.activitiesRecognitions), ..._recognitions(context, b.recognitions)],
        ];
      },
    );
  }
}

class _IncidentCard extends StatelessWidget {
  const _IncidentCard({required this.incident});

  final BehaviourIncident incident;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tone = kxTone(context, _severityTone(incident.severity));
    return Card(
      key: Key('incident-${incident.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(incident.kind, style: context.text.titleSmall)),
                Pill(_severity(l, incident.severity), background: tone.bg, foreground: tone.fg),
              ],
            ),
            _sub(context, '${_day(context, incident.on)} · ${_incidentStatus(l, incident.status)}'),
            if (incident.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(incident.description, style: context.text.bodyLarge)),
            for (final a in incident.actions)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.gavel_outlined, size: 18),
                    const SizedBox(width: Kx.s8),
                    Expanded(
                      child: Text(
                        [
                          l.behaviourAction(a.action),
                          if (a.detail.isNotEmpty) a.detail,
                          if (a.startsOn != null) '${_day(context, a.startsOn!)}${a.endsOn == null ? '' : ' – ${_day(context, a.endsOn!)}'}',
                          if (a.status == 'revoked') l.actionStatus_revoked,
                          if (a.status == 'reduced') l.actionStatus_reduced,
                        ].join(' · '),
                        style: context.text.bodyMedium,
                      ),
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

class _NoticeCard extends StatefulWidget {
  const _NoticeCard({required this.notice, required this.api, required this.onChanged});

  final SchoolNotice notice;
  final ParentApi api;
  final Future<void> Function() onChanged;

  @override
  State<_NoticeCard> createState() => _NoticeCardState();
}

class _NoticeCardState extends State<_NoticeCard> {
  bool _busy = false;

  Future<void> _ack() async {
    setState(() => _busy = true);
    try {
      await widget.api.acknowledgeNotice(widget.notice.id);
      if (mounted) say(context, context.l10n.noticeAckDone);
      await widget.onChanged();
    } catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final n = widget.notice;
    return Card(
      key: Key('notice-${n.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(n.kind, style: context.text.titleSmall),
            _sub(context, '${_method(l, n.method)} · ${_day(context, n.incidentOn)}'),
            Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(n.summary, style: context.text.bodyLarge)),
            if (n.meetingOn != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.noticeMeeting(_day(context, n.meetingOn!)), style: context.text.titleSmall)),
            const SizedBox(height: Kx.s12),
            if (n.acknowledged)
              Pill(l.noticeAcknowledged, icon: Icons.check_circle_outline, background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer)
            else
              FilledButton.tonal(key: Key('ackNotice-${n.id}'), onPressed: _busy ? null : _ack, child: Text(l.noticeAcknowledge)),
          ],
        ),
      ),
    );
  }
}
