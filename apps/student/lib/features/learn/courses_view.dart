import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/lms.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'forum_screen.dart';

/// "Courses" in My Learning: the published course for each subject with its modules and the
/// student's running grade.
class CoursesView extends StatefulWidget {
  const CoursesView({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  @override
  State<CoursesView> createState() => _CoursesViewState();
}

class _CoursesViewState extends State<CoursesView> {
  List<LmsCourseSummary>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.lmsCourses(widget.studentId);
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (items == null && _error == null) const KxLoading(),
          if (items != null && items.isEmpty) KxEmptyState(icon: Icons.school_outlined, message: l.coursesNone),
          if (items != null)
            for (final c in items) ...[
              KxCard(
                key: Key('course-${c.courseId}'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CourseScreen(api: widget.api, studentId: widget.studentId, summary: c))),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                          Text(l.courseModulesCount(c.moduleCount), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                        ],
                      ),
                    ),
                    GradeChip(overall: c.overall, letter: c.letter),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s12),
            ],
        ],
      ),
    );
  }
}

/// The running grade as "A · 82%", or a dash before anything is graded.
class GradeChip extends StatelessWidget {
  const GradeChip({super.key, required this.overall, required this.letter});

  final double? overall;
  final String? letter;

  @override
  Widget build(BuildContext context) {
    final t = kxTone(context, overall == null ? KxTone.neutral : KxTone.success);
    return Pill(overall == null ? '-' : '$letter · ${overall!.toStringAsFixed(overall! % 1 == 0 ? 0 : 1)}%', background: t.bg, foreground: t.fg);
  }
}

class CourseScreen extends StatefulWidget {
  const CourseScreen({super.key, required this.api, required this.studentId, required this.summary});

  final StudentApi api;
  final String studentId;
  final LmsCourseSummary summary;

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  LmsCourseDetail? _course;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.lmsCourse(widget.summary.courseId, widget.studentId);
      if (mounted) setState(() => _course = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = _course;
    return Scaffold(
      appBar: AppBar(title: Text(widget.summary.title)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (c == null && _error == null) const KxLoading(),
            if (c != null) ...[
              KxCard(
                key: const Key('courseGrade'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [Expanded(child: Text(l.courseGradeTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), GradeChip(overall: c.overall, letter: c.letter)]),
                    if (c.parts.isEmpty) Text(l.courseNoGrade, style: context.text.bodySmall),
                    for (final p in c.parts)
                      Padding(
                        padding: const EdgeInsets.only(top: Kx.s4),
                        child: Row(children: [Expanded(child: Text('${p.name} (${p.weight.toStringAsFixed(0)}%)')), Text(p.percent == null ? '-' : '${p.percent!.toStringAsFixed(p.percent! % 1 == 0 ? 0 : 1)}%')]),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s12),
              KxCard(
                key: const Key('openForum'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ForumScreen(api: widget.api, courseId: widget.summary.courseId, title: widget.summary.title))),
                child: Row(children: [const Icon(Icons.forum_outlined), const SizedBox(width: Kx.s12), Expanded(child: Text(l.forumTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right)]),
              ),
              const SizedBox(height: Kx.s12),
              if (c.announcements.isNotEmpty)
                KxCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(l.courseAnnouncements, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)), for (final a in c.announcements) Text(a)])),
              const SizedBox(height: Kx.s12),
              if (c.modules.isEmpty) KxEmptyState(icon: Icons.folder_open_outlined, message: l.courseNoModules),
              for (final m in c.modules) ...[
                KxCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      for (final i in m.items) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('${i.kind} · ${i.title}')),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
