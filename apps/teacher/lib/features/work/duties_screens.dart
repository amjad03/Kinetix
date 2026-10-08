import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';
import '../attendance/attendance_screen.dart';

/// "09:00–10:00" from the API's HH:mm:ss times.
String timeRange(String startsAt, String endsAt) => '${startsAt.substring(0, 5)}–${endsAt.substring(0, 5)}';

/// The period a substitution covers, in the shape the attendance screen takes.
Period substitutionPeriod(SubstitutionInfo s) => Period(
  slotId: s.slotId,
  startsAt: ClockTime.parse(s.startsAt),
  endsAt: ClockTime.parse(s.endsAt),
  section: Ref(s.sectionId, s.section),
  subject: Ref(s.subjectId, s.subject),
  room: s.room == null ? null : Ref('', s.room!),
);

/// Periods I cover for colleagues, with a link to take their attendance.
class SubstitutionsScreen extends StatelessWidget {
  const SubstitutionsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.subsTitle)),
      body: AsyncBody<List<SubstitutionInfo>>(
        load: api.mySubstitutions,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.subsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            for (final s in rows)
              Card(
                key: Key('sub-${s.id}'),
                child: Padding(
                  padding: const EdgeInsets.all(Kx.s12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${f.shortDay(parseDay(s.date))} · ${timeRange(s.startsAt, s.endsAt)}', style: context.text.labelLarge),
                      Text('${s.subject} · ${s.section}', style: context.text.titleSmall),
                      Text(l.subsFor(s.originalTeacher)),
                      if (s.room != null) Text(s.room!),
                      if (s.reason.isNotEmpty) Text(s.reason),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.tonal(
                          key: Key('attendance-${s.id}'),
                          onPressed: () => Navigator.of(context).push<bool>(
                            MaterialPageRoute(builder: (_) => AttendanceScreen(api: api, period: substitutionPeriod(s), date: s.date)),
                          ),
                          child: Text(l.takeAttendance),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// My exam invigilation duties by date.
class DutiesScreen extends StatelessWidget {
  const DutiesScreen({super.key, required this.api});

  final TeacherApi api;

  String _role(AppLocalizations l, String role) => switch (role) {
    'chief' || 'chief_invigilator' => l.dutyRoleChief,
    'invigilator' => l.dutyRoleInvigilator,
    _ => role,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.dutiesTitle)),
      body: AsyncBody<List<InvigilationDuty>>(
        load: api.myInvigilation,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.dutiesEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final d in rows)
              ListTile(
                key: Key('duty-${d.id}'),
                leading: const Icon(Icons.fact_check_outlined),
                title: Text(d.session),
                subtitle: Text('${f.shortDay(parseDay(d.dutyDate))} · ${timeRange(d.startsAt, d.endsAt)}\n${d.room} · ${_role(l, d.role)}'),
                isThreeLine: true,
              ),
          ],
        ),
      ),
    );
  }
}
