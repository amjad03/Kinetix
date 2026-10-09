import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/academics_models.dart';
import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// "182 KB", "1.4 MB".
String fileSizeText(int bytes) => bytes >= 1024 * 1024 ? '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB' : '${(bytes / 1024).round()} KB';

/// The record counts a course file was built from, as short "label: n" phrases in the order they appear in the PDF.
List<String> courseFileFacts(AppLocalizations l, CourseFileVersion v) => [
  '${l.cfTopics}: ${v.count('topicsCovered')}/${v.count('topics')}',
  '${l.cfLessonPlans}: ${v.count('lessonPlans')}',
  '${l.cfPeriods}: ${v.count('periods')}',
  '${l.cfAttendance}: ${v.count('attendanceSessions')}',
  '${l.cfAssessments}: ${v.count('assessments')}',
  '${l.cfOutcomes}: ${v.count('outcomes')}',
  '${l.cfWhiteboards}: ${v.count('whiteboards')}',
  '${l.cfRecordings}: ${v.count('recordings')}',
];

/// My classes and subjects with the course-file versions built for them; build a new version or open a PDF.
class CourseFilesScreen extends StatefulWidget {
  const CourseFilesScreen({super.key, required this.api, this.openFile = openWithSystem});

  final TeacherApi api;
  final OpenFile openFile;

  @override
  State<CourseFilesScreen> createState() => _CourseFilesScreenState();
}

class _CourseFilesScreenState extends State<CourseFilesScreen> {
  int _round = 0;
  String? _busy;

  Future<void> _generate(CourseFileOption o) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = '${o.sectionId}:${o.subjectId}');
    CourseFileVersion? made;
    final ok = await runOrSnack(context, () async => made = await widget.api.generateCourseFile(sectionId: o.sectionId, subjectId: o.subjectId));
    if (!mounted) return;
    setState(() {
      _busy = null;
      if (ok) _round++;
    });
    if (ok) messenger.showSnackBar(SnackBar(content: Text(l.courseFileGenerated('${made?.version ?? ''}'))));
  }

  Future<void> _pdf(CourseFileVersion v) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.courseFilePdf(v.id);
      if (!await widget.openFile(bytes, 'course-file-${v.subject}-${v.section}-v${v.version}.pdf', 'application/pdf')) {
        messenger.showSnackBar(SnackBar(content: Text(l.couldNotOpenFile)));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.courseFilesTitle)),
      body: AsyncBody<(List<CourseFileOption>, List<CourseFileVersion>)>(
        key: ValueKey(_round),
        load: () async => (await widget.api.courseFileOptions(), await widget.api.courseFiles()),
        isEmpty: (d) => d.$1.isEmpty && d.$2.isEmpty,
        empty: l.courseFilesEmpty,
        builder: (context, data, reload) {
          final (options, versions) = data;
          // Every class and subject I can build for, then any with versions that are not in my list (a head sees a department's).
          final groups = <String, ({String section, String subject, String code, CourseFileOption? option, List<CourseFileVersion> versions})>{};
          for (final o in options) {
            groups['${o.sectionId}:${o.subjectId}'] = (section: o.section, subject: o.subject, code: o.code, option: o, versions: []);
          }
          for (final v in versions) {
            final g = groups.putIfAbsent('${v.sectionId}:${v.subjectId}', () => (section: v.section, subject: v.subject, code: '', option: null, versions: []));
            g.versions.add(v);
          }
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(Kx.s16),
            children: [
              for (final e in groups.entries)
                Card(
                  key: Key('courseFile-${e.key}'),
                  margin: const EdgeInsets.only(bottom: Kx.s12),
                  child: Padding(
                    padding: const EdgeInsets.all(Kx.s12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(e.value.code.isEmpty ? e.value.subject : '${e.value.subject} · ${e.value.code}', style: context.text.titleMedium),
                        Text(e.value.section, style: context.text.bodyMedium),
                        if (e.value.option != null)
                          Padding(
                            padding: const EdgeInsets.only(top: Kx.s8),
                            child: FilledButton.icon(
                              key: Key('generate-${e.key}'),
                              onPressed: _busy != null ? null : () => _generate(e.value.option!),
                              icon: _busy == e.key ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.note_add_outlined),
                              label: Text(l.courseFileGenerate),
                            ),
                          ),
                        if (e.value.versions.isEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.courseFileNone)),
                        for (final v in e.value.versions) ...[
                          const Divider(height: Kx.s24),
                          Row(
                            children: [
                              Expanded(child: Text(l.courseFileVersion('${v.version}'), key: Key('version-${v.id}'), style: context.text.titleSmall)),
                              OutlinedButton.icon(key: Key('pdf-${v.id}'), onPressed: () => _pdf(v), icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.courseFileOpenPdf)),
                            ],
                          ),
                          Text(l.courseFileMeta(v.generatedAt == null ? '' : f.shortDay(v.generatedAt!), v.generatedByName, fileSizeText(v.sizeBytes))),
                          const SizedBox(height: Kx.s8),
                          Wrap(
                            spacing: Kx.s8,
                            runSpacing: Kx.s4,
                            children: [for (final t in courseFileFacts(l, v)) Pill(t, background: c.surfaceContainerHighest, foreground: c.onSurface)],
                          ),
                          const SizedBox(height: Kx.s8),
                          Text(
                            v.reviewed ? l.courseFileReviewed(v.reviewedByName ?? '') : l.courseFileNotReviewed,
                            key: Key('review-${v.id}'),
                            style: context.text.bodyMedium?.copyWith(color: v.reviewed ? null : c.onSurfaceVariant),
                          ),
                          if ((v.reviewRemark ?? '').isNotEmpty) Text(v.reviewRemark!, key: Key('remark-${v.id}')),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
