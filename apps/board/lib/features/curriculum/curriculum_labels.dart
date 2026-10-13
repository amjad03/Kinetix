import '../../l10n/l10n.dart';
import '../board/kit/subjects.dart';
import 'curriculum_registry.dart';

/// The level's name: "Class 7", "B.E. Civil".
String levelName(AppLocalizations l, CurriculumLevel level) => level.grade != null ? l.curClassN(level.grade!) : level.name ?? level.id;

/// The subject's name: the board's own word for the general subjects, else as the syllabus has it.
String subjectTitle(AppLocalizations l, CurriculumSubject s) => s.localised ? l.subjectName(s.base) : s.name;

/// "Class 7 · Science", "B.E. Civil · Sem 5 · Structural Analysis".
String curriculumLabel(AppLocalizations l, CurriculumChoice c) => [
  levelName(l, c.level),
  if (c.subject.semester case final sem?) l.curSemN(sem),
  subjectTitle(l, c.subject),
].join(' · ');

/// The name of a kit that is not built yet (a `soon:` id of the registry).
// (None left: the PFD kit and the EV diagrams are built.)
String upcomingTitle(AppLocalizations l, String id) => id;
