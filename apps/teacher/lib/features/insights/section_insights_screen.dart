import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/insights_models.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/class_picker.dart';
import '../../widgets/common.dart';
import '../work/mentoring_screens.dart' show riskText;

/// A class at a glance: attendance and marks average for the class, and each student with their
/// risk flag, those who need attention first.
class SectionInsightsScreen extends StatefulWidget {
  const SectionInsightsScreen({super.key, required this.api, this.initial});

  final TeacherApi api;
  final TeacherClass? initial;

  @override
  State<SectionInsightsScreen> createState() => _SectionInsightsScreenState();
}

class _SectionInsightsScreenState extends State<SectionInsightsScreen> {
  List<TeacherClass>? _classes;
  TeacherClass? _class;
  SectionInsights? _insights;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  Future<void> _loadClasses() async {
    setState(() => _error = null);
    try {
      final classes = await widget.api.classes();
      if (!mounted) return;
      setState(() => _classes = classes);
      final first = classes.contains(widget.initial) ? widget.initial : classes.firstOrNull;
      if (first != null) await _choose(first);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _choose(TeacherClass c) async {
    setState(() {
      _class = c;
      _insights = null;
      _error = null;
    });
    try {
      final i = await widget.api.sectionInsights(c.section.id);
      if (mounted && _class == c) setState(() => _insights = i);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final classes = _classes;
    final data = _insights;
    String pct(int? v) => v == null ? '–' : '$v%';
    return Scaffold(
      appBar: AppBar(title: Text(l.insightsTitle)),
      body: ListView(
        padding: const EdgeInsets.only(bottom: Kx.s32),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: ErrorBanner.api(_error!, onRetry: _class == null ? _loadClasses : () => _choose(_class!)),
            ),
          if (classes == null && _error == null)
            const Padding(padding: EdgeInsets.all(Kx.s32), child: Center(child: CircularProgressIndicator()))
          else if (classes != null && classes.isEmpty)
            KxEmptyState(icon: Icons.event_busy_outlined, message: l.noClassesInTimetable)
          else if (classes != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
              child: ClassSubjectPicker(classes: classes, section: _class?.section, subject: _class?.subject, onChanged: _choose),
            ),
            if (data == null && _error == null)
              const Padding(padding: EdgeInsets.all(Kx.s32), child: Center(child: CircularProgressIndicator()))
            else if (data != null) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Row(
                  children: [
                    Expanded(child: _Stat(key: const Key('classAttendance'), label: l.insightsAttendance, value: pct(data.classAttendancePct))),
                    const SizedBox(width: Kx.s12),
                    Expanded(child: _Stat(key: const Key('classMarks'), label: l.insightsMarks, value: pct(data.classMarksAvgPct))),
                    const SizedBox(width: Kx.s12),
                    Expanded(child: _Stat(key: const Key('classFlagged'), label: l.insightsFlagged, value: '${data.flaggedCount}')),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s8),
              if (data.students.isEmpty) KxEmptyState(icon: Icons.groups_outlined, message: l.noStudentsInClass),
              for (final s in data.byRisk)
                ListTile(
                  key: Key('insight-${s.studentId}'),
                  leading: Icon(Icons.flag_outlined, color: s.level == 'high' ? c.error : (s.flagged ? c.tertiary : c.outline)),
                  title: Text('${s.studentName} · ${s.rollNo}'),
                  subtitle: Text([l.insightsAttendanceValue(pct(s.attendancePct)), l.insightsMarksValue(pct(s.marksAvgPct)), if (s.failingMarks > 0) l.menteeFailing('${s.failingMarks}')].join(' · ')),
                  trailing: s.flagged ? Text(riskText(l, s.level), style: context.text.labelMedium?.copyWith(color: s.level == 'high' ? c.error : c.tertiary)) : null,
                ),
            ],
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => KxCard(
    child: Column(
      children: [
        Text(value, style: context.text.headlineSmall),
        Text(label, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant), textAlign: TextAlign.center),
      ],
    ),
  );
}
