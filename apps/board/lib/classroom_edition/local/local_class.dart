import '../../core/board_controller.dart';
import '../../core/models.dart';
import 'classroom_store.dart';

/// Whether the next class opened goes to the practice board (with the guided tour) rather than
/// a real class; the board screen reads and clears it when it opens.
bool ceOpenPractice = false;

/// The roster of a local class: roll numbers only. A student's id is `roll-N` and the name
/// the board shows is "Roll N" (the Classroom edition never keeps a student's name).
List<Student> rollRoster(CeClass c) => [for (final n in c.rolls) Student(id: rollStudentId(n), rollNo: '$n', fullName: 'Roll $n')];

String rollStudentId(int roll) => 'roll-$roll';

/// The board's autosave slot in a local class: one per teacher and class, so a teacher's board
/// for 1st PUC A never opens for 2nd PUC B or for another teacher (the practice board has its
/// own).
String ceAutosaveSlot(ClassroomStore store) {
  if (ceOpenPractice) return 'ce-practice';
  final t = store.currentTeacher?.id ?? CeTeacher.guestId;
  return 'ce-$t-${store.currentClass?.id ?? 'no-class'}';
}

/// The roll number of a roster entry made by [rollRoster] (null for any other student).
int? rollOf(Student s) => s.id.startsWith('roll-') ? int.tryParse(s.id.substring(5)) : null;

/// Opens [cls] on the board for [teacher] (Classroom edition, no server): a local session for
/// the period ([slot]'s times, or from now when off the timetable) with the class's roll numbers.
void startLocalClass(BoardController board, {required CeTeacher teacher, required CeClass cls, required String subject, CeSlot? slot, bool practice = false}) {
  final store = board.classroom;
  final now = store.now();
  final end = DateTime(now.year, now.month, now.day, 23, 59);
  final ctx = SessionContext(
    sessionId: 'local-${now.microsecondsSinceEpoch}',
    // The class stays open until it is ended (a lesson can run over its period).
    expiresAt: end,
    teacherId: teacher.isGuest ? 'local-guest' : 'local-${teacher.id}',
    teacherName: teacher.name,
    institutionName: store.college.isEmpty ? null : store.college,
    language: 'en',
    sectionId: cls.id,
    sectionName: cls.name,
    subjectName: subject.trim().isEmpty ? null : subject.trim(),
    periodLabel: slot?.label,
    classTerm: cls.grade,
    programLevel: 'pu',
  );
  store.startClass(teacher: teacher, cls: cls, subject: subject, slot: slot);
  ceOpenPractice = practice;
  board.startLocalClass(ctx, rollRoster(cls));
}
