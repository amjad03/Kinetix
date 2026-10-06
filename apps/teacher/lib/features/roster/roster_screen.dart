import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/class_picker.dart';
import '../../widgets/common.dart';

/// A class's students, with their photos; a badge can be awarded to any of them (the family is
/// told, and it shows in the Student and Parent Apps).
class RosterScreen extends StatefulWidget {
  const RosterScreen({super.key, required this.api, this.initial});

  final TeacherApi api;

  /// The class (and subject) to open with; the first of the teacher's classes otherwise.
  final TeacherClass? initial;

  @override
  State<RosterScreen> createState() => _RosterScreenState();
}

class _RosterScreenState extends State<RosterScreen> {
  List<TeacherClass>? _classes;
  TeacherClass? _class;
  List<Student>? _students;
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
    final sameSection = _class?.section == c.section;
    setState(() {
      _class = c;
      if (!sameSection) _students = null;
      _error = null;
    });
    if (sameSection && _students != null) return;
    try {
      final students = await widget.api.roster(c.section.id);
      if (mounted && _class == c) setState(() => _students = students);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _award(Student s) async {
    final strings = KxStrings.of(context);
    final c = _class!;
    final badge = await showKxBadgePicker(context, title: strings.awardBadgeTo(s.fullName));
    if (badge == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    final name = badge.nameIn(context);
    try {
      await widget.api.awardBadge(studentId: s.id, sectionId: c.section.id, badge: badge.api, subjectId: c.subject.id);
      messenger.showSnackBar(SnackBar(content: Text(strings.badgeAwarded(name, s.fullName))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final strings = KxStrings.of(context);
    final classes = _classes;
    final students = _students;
    return Scaffold(
      appBar: AppBar(title: Text(l.classRoster)),
      body: ListView(
        padding: const EdgeInsets.only(bottom: Kx.s32),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: ErrorBanner.api(_error!, onRetry: _loadClasses),
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
            if (students == null && _error == null)
              const Padding(padding: EdgeInsets.all(Kx.s32), child: Center(child: CircularProgressIndicator()))
            else if (students != null && students.isEmpty)
              KxEmptyState(icon: Icons.groups_outlined, message: l.noStudentsInClass)
            else if (students != null)
              for (final s in students)
                ListTile(
                  key: ValueKey('roster-${s.id}'),
                  leading: KxAvatar(name: s.fullName, image: widget.api.photo(s.photoUrl)),
                  title: Text(s.fullName),
                  subtitle: Text(s.rollNo),
                  trailing: IconButton(
                    key: ValueKey('award-${s.id}'),
                    tooltip: strings.awardBadgeTo(s.fullName),
                    icon: const Icon(Icons.military_tech_outlined),
                    onPressed: () => _award(s),
                  ),
                  onTap: () => _award(s),
                ),
          ],
        ],
      ),
    );
  }
}
