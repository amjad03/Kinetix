import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/l10n.dart';
import '../core/models.dart';

/// One field for the class and subject: a searchable sheet with each class as a heading and
/// its subjects under it (replaces the separate class and subject dropdowns).
class ClassSubjectPicker extends StatelessWidget {
  const ClassSubjectPicker({super.key, required this.classes, required this.section, required this.subject, required this.onChanged});

  final List<TeacherClass> classes;
  final Ref? section;
  final Ref? subject;
  final ValueChanged<TeacherClass> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final selected = classes.where((c) => c.section == section && c.subject == subject).firstOrNull;
    return KxPicker<TeacherClass>(
      key: const Key('classSubjectField'),
      label: l.classAndSubject,
      icon: Icons.groups_outlined,
      items: [for (final c in classes) KxPickerItem(value: c, label: c.subject.name, group: c.section.name)],
      value: selected,
      onChanged: onChanged,
      validator: (c) => c == null ? l.chooseSubject : null,
    );
  }
}
