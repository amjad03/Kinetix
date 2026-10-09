import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/load_view.dart';

/// The class diary for my section, newest first: classwork, homework notes and notices.
class DiaryScreen extends StatelessWidget {
  const DiaryScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DiaryScreen(api: api)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadScreen<List<DiaryEntry>>(
      title: l.slDiaryTitle,
      load: api.classDiary,
      builder: (context, entries, reload) => [
        if (entries.isEmpty) EmptyNote(l.slDiaryEmpty),
        for (final e in entries)
          KxCard(
            key: Key('diary-${e.id}'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.fmt.longDay(e.date), style: context.text.titleSmall),
                Text([if (e.subject != null) e.subject!, if (e.author.isNotEmpty) l.slDiaryBy(e.author)].join(' · '), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                _part(context, l.slDiaryClasswork, e.classwork),
                _part(context, l.slDiaryHomework, e.homeworkNote),
                _part(context, l.slDiaryNotice, e.notice),
              ],
            ),
          ),
      ],
    );
  }

  Widget _part(BuildContext context, String label, String text) => text.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)), Text(text, style: context.text.bodyLarge)]),
        );
}

/// My clubs and posts held, events, house and points, co-curricular grades and achievements.
class MyActivitiesScreen extends StatelessWidget {
  const MyActivitiesScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MyActivitiesScreen(api: api)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadScreen<MyActivities>(
      title: l.slActivitiesTitle,
      load: api.myActivities,
      builder: (context, a, reload) => [
        if (a.isEmpty) EmptyNote(l.slActivitiesEmpty),
        if (a.houseName != null)
          Card(
            key: const Key('activitiesHouse'),
            child: ListTile(leading: const Icon(Icons.emoji_events_outlined), title: Text(a.houseName!), subtitle: Text([l.slHousePoints(a.housePoints), if (a.houseCaptain) l.slCaptain].join(' · '))),
          ),
        if (a.clubs.isNotEmpty) ...[
          Heading(l.slClubs),
          for (final c in a.clubs)
            ListTile(
              key: Key('club-${c.club}'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.groups_outlined),
              title: Text(c.club),
              subtitle: Text([c.posts.isEmpty ? l.slMember : c.posts.join(', '), l.slClubStats(c.points, c.activities)].join(' · ')),
            ),
        ],
        if (a.events.isNotEmpty) ...[
          Heading(l.slEvents),
          for (final e in a.events) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.celebration_outlined), title: Text(e.title), subtitle: Text(isoDayText(context, e.on))),
        ],
        if (a.grades.isNotEmpty) ...[
          Heading(a.term == null ? l.slCoCurricular : l.slGrades(a.term!)),
          for (final g in a.grades) ListTile(key: Key('grade-${g.activity}'), contentPadding: EdgeInsets.zero, title: Text(g.activity), subtitle: g.remark.isEmpty ? null : Text(g.remark), trailing: Text(g.grade, style: context.text.titleMedium)),
        ],
        if (a.achievements.isNotEmpty) ...[
          Heading(l.slAchievements),
          for (final x in a.achievements)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.military_tech_outlined),
              title: Text(x.title),
              subtitle: Text([x.club, x.level, x.position, if (x.on.isNotEmpty) isoDayText(context, x.on)].where((s) => s.isNotEmpty).join(' · ')),
            ),
        ],
        if (a.recognitions.isNotEmpty) ...[
          Heading(l.slRecognitions),
          for (final r in a.recognitions)
            ListTile(contentPadding: EdgeInsets.zero, title: Text(r.reason), subtitle: Text(isoDayText(context, r.awardedOn)), trailing: Text(r.points > 0 ? '+${r.points}' : '${r.points}', style: context.text.titleMedium)),
        ],
      ],
    );
  }
}

String _promotion(AppLocalizations l, String status) => switch (status) {
  'promoted' => l.slPromoted,
  'promoted_with_grace' => l.slPromotedGrace,
  'detained' => l.slDetained,
  _ => l.slPromotionPending,
};

String _num(double n) => n == n.roundToDouble() ? '${n.round()}' : n.toStringAsFixed(1);

/// My report cards, one per term.
class ReportCardsScreen extends StatelessWidget {
  const ReportCardsScreen({super.key, required this.api, required this.studentId, this.openFile = openWithSystem});

  final StudentApi api;
  final String studentId;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReportCardsScreen(api: api, studentId: studentId)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadScreen<List<ReportCardRow>>(
      title: l.slReportCards,
      load: () => api.reportCards(studentId),
      builder: (context, cards, reload) => [
        if (cards.isEmpty) EmptyNote(l.slReportCardsNone),
        for (final c in cards)
          ListTile(
            key: Key('reportCard-${c.id}'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.description_outlined),
            title: Text(c.termLabel),
            subtitle: Text(_promotion(l, c.promotionStatus)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => ReportCardScreen(api: api, id: c.id, openFile: openFile))),
          ),
      ],
    );
  }
}

/// One report card: marks per subject, co-curricular grades, attendance, behaviour, remarks and
/// promotion; opens as a PDF too.
class ReportCardScreen extends StatefulWidget {
  const ReportCardScreen({super.key, required this.api, required this.id, this.openFile = openWithSystem});

  final StudentApi api;
  final String id;
  final OpenFile openFile;

  @override
  State<ReportCardScreen> createState() => _ReportCardScreenState();
}

class _ReportCardScreenState extends State<ReportCardScreen> {
  String? _message;

  Future<void> _pdf() async {
    final l = context.l10n;
    try {
      final bytes = await widget.api.reportCardPdf(widget.id);
      final ok = await widget.openFile(bytes, 'report-card.pdf', 'application/pdf');
      if (!ok && mounted) setState(() => _message = l.fileOpenFailed);
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = context.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadScreen<ReportCardDetail>(
      title: l.slReportCard,
      load: () => widget.api.reportCard(widget.id),
      builder: (context, c, reload) => [
        Text(c.termLabel, style: context.text.headlineSmall),
        Card(
          key: const Key('promotionCard'),
          child: ListTile(leading: const Icon(Icons.trending_up), title: Text(_promotion(l, c.promotionStatus)), subtitle: c.promotedTo == null ? null : Text(l.slPromotedTo(c.promotedTo!))),
        ),
        for (final line in c.lines)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(line.subject),
            subtitle: line.remark.isEmpty ? null : Text(line.remark),
            trailing: Text('${_num(line.marks)}/${_num(line.maxMarks)}${line.grade.isEmpty ? '' : ' · ${line.grade}'}'),
          ),
        if (c.coCurricular.isNotEmpty) ...[
          Heading(l.slCoCurricular),
          for (final g in c.coCurricular) ListTile(key: Key('coGrade-${g.activity}'), contentPadding: EdgeInsets.zero, dense: true, title: Text(g.activity), subtitle: g.remark.isEmpty ? null : Text(g.remark), trailing: Text(g.grade, style: context.text.titleSmall)),
        ],
        if (c.attendancePercent != null)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s12),
            child: Text(
              ['${l.attendance}: ${_num(c.attendancePercent!)}%', if (c.attendancePresent != null && c.attendanceTotal != null) l.slAttendanceDays(c.attendancePresent!, c.attendanceTotal!)].join(' · '),
              key: const Key('reportAttendance'),
            ),
          ),
        if (c.behaviourGrade != null) Text(l.slBehaviourGrade(c.behaviourGrade!), key: const Key('reportBehaviour')),
        if (c.remarks.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(c.remarks)),
        if (_message != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_message!)),
        const SizedBox(height: Kx.s16),
        OutlinedButton.icon(key: const Key('reportCardPdf'), onPressed: _pdf, icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.slReportCardPdf)),
      ],
    );
  }
}
