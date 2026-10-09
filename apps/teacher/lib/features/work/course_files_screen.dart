import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/course_file_models.dart';
import '../../core/files.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// Course files for the classes I teach: build a new version from the records as they stand, and open the PDF of any version.
class CourseFilesScreen extends StatefulWidget {
  const CourseFilesScreen({super.key, required this.api, this.openFile = openWithSystem});

  final TeacherApi api;
  final OpenFile openFile;

  @override
  State<CourseFilesScreen> createState() => _CourseFilesScreenState();
}

class _CourseFilesScreenState extends State<CourseFilesScreen> {
  List<CourseFileOption>? _options;
  List<CourseFileVersion> _versions = const [];
  ApiException? _error;
  String? _building;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final options = await widget.api.courseFileOptions();
      final versions = await widget.api.courseFiles();
      if (mounted) {
        setState(() {
          _options = options;
          _versions = versions;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _build(CourseFileOption o) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _building = '${o.sectionId}:${o.subjectId}');
    try {
      await widget.api.buildCourseFile(o.sectionId, o.subjectId);
      messenger.showSnackBar(SnackBar(content: Text(l.courseFilesBuilt)));
      await _load();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _building = null);
    }
  }

  Future<void> _open(CourseFileVersion v, CourseFileOption o) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.courseFilePdf(v.id);
      final ok = await widget.openFile(bytes, 'course-file-${o.code}-v${v.version}.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.courseFilesOpenFailed)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final options = _options;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.courseFilesTitle)),
            if (_error != null) SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (options == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (options != null && options.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: KxEmptyState(key: const Key('courseFilesEmpty'), icon: Icons.folder_open_outlined, message: l.courseFilesEmpty))
            else if (options != null)
              SliverList.list(
                children: [
                  for (final o in options) _OptionCard(option: o, versions: _versions.where((v) => v.sectionId == o.sectionId && v.subjectId == o.subjectId).toList(), building: _building == '${o.sectionId}:${o.subjectId}', onBuild: () => _build(o), onOpen: (v) => _open(v, o)),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({required this.option, required this.versions, required this.building, required this.onBuild, required this.onOpen});

  final CourseFileOption option;
  final List<CourseFileVersion> versions;
  final bool building;
  final VoidCallback onBuild;
  final void Function(CourseFileVersion) onOpen;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final key = '${option.sectionId}-${option.subjectId}';
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(option.subject, style: Theme.of(context).textTheme.titleMedium),
            Text(option.section, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: Kx.s8),
            if (versions.isEmpty) Text(l.courseFilesNone, style: Theme.of(context).textTheme.bodySmall),
            for (final v in versions)
              ListTile(
                key: Key('courseFile-$key-v${v.version}'),
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: Text(l.courseFilesVersion(v.version)),
                subtitle: Text(v.reviewedAt != null ? l.courseFilesReviewed : l.courseFilesAwaiting),
                trailing: const Icon(Icons.open_in_new),
                onTap: () => onOpen(v),
              ),
            const SizedBox(height: Kx.s8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                key: Key('buildCourseFile-$key'),
                onPressed: building ? null : onBuild,
                icon: building ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.add),
                label: Text(l.courseFilesBuild),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
