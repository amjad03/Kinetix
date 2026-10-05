import 'package:flutter/material.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

import '../../core/models.dart';

/// The levels of virtual lab that suit [student]: their degree level, or the
/// class number in their section's name ("Class 10 A", "10-B", "UKG").
Set<LabLevel> labLevelsFor(StudentProfile student) {
  switch (student.programLevel) {
    case 'ug':
      return {LabLevel.ug};
    case 'pg':
      return {LabLevel.pg};
  }
  final name = student.sectionName.toLowerCase();
  for (final l in [LabLevel.lkg, LabLevel.ukg]) {
    if (RegExp('\\b${l.code}\\b').hasMatch(name)) return {l};
  }
  // Karnataka pre-university: I PUC is class 11, II PUC class 12.
  if (RegExp(r'\bii\s*puc\b').hasMatch(name)) return {LabLevel.class12};
  if (RegExp(r'\bi\s*puc\b').hasMatch(name)) return {LabLevel.class11};
  final n = RegExp(r'\b(\d{1,2})\b').firstMatch(name);
  final level = LabLevel.fromCode(n?.group(1));
  return {?level};
}

/// Virtual labs for self-study: search and filter by subject and class, then
/// do the experiment, record readings and see what they show. Works offline.
class LabsView extends StatelessWidget {
  const LabsView({super.key, required this.student});

  final StudentProfile student;

  @override
  Widget build(BuildContext context) => LabBrowser(key: const Key('labBrowser'), initialLevels: labLevelsFor(student));
}
