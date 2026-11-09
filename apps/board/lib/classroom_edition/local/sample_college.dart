import 'classroom_store.dart';

/// A PU college as the design shows it: six teachers, five classes of 40 (roll numbers only,
/// never a student's name) and a week's timetable. The demo build of the Classroom edition
/// (`--dart-define=KINETIX_DEMO=true`) starts with it, and the tests and screenshots use it.
CeSetup sampleCollege() {
  const teachers = [
    CeTeacher(id: 'lr', name: 'Lakshmi Rao', subject: 'Physics', colour: 0),
    CeTeacher(id: 'mi', name: 'Mohammed Irfan', subject: 'Chemistry', colour: 1),
    CeTeacher(id: 'ks', name: 'Kavya Shetty', subject: 'Mathematics', colour: 2),
    CeTeacher(id: 'pg', name: 'Prakash Gowda', subject: 'Biology', colour: 3),
    CeTeacher(id: 'sn', name: 'Shalini Nair', subject: 'English', colour: 4),
    CeTeacher(id: 'rk', name: 'Ravi Kulkarni', subject: 'Kannada', colour: 5),
  ];
  CeSlot slot(String id, int day, String a, String b, String cls, String subject, String t, {String room = '', String topic = ''}) =>
      CeSlot(id: id, weekday: day, start: a, end: b, classId: cls, subject: subject, teacherId: t, room: room, topic: topic);
  return CeSetup(
    college: 'Soundarya PU College',
    teachers: teachers,
    classes: CeSetup.starter.classes,
    slots: [
      slot('p0', 1, '08:55', '09:50', 'c1b', 'Mathematics', 'ks'),
      slot('p1', 1, '09:50', '10:45', 'c1a', 'Physics', 'lr', room: 'Room 12', topic: 'Electric Charges and Fields'),
      slot('p2', 1, '11:00', '11:55', 'c2b', 'Physics', 'lr', topic: 'Current Electricity'),
      slot('p3', 1, '13:30', '14:25', 'c1c', 'Physics', 'lr', topic: 'Practical: Vernier callipers'),
      slot('p4', 1, '14:30', '15:25', 'c2a', 'Physics', 'lr', topic: 'Revision: electrostatics'),
      slot('m1', 2, '08:55', '09:50', 'c1a', 'Chemistry', 'mi'),
      slot('m2', 2, '09:50', '10:45', 'c1b', 'Chemistry', 'mi'),
      slot('m3', 2, '11:00', '11:55', 'c2a', 'Chemistry', 'mi'),
      slot('k1', 2, '13:30', '14:25', 'c1a', 'Mathematics', 'ks'),
      slot('k2', 3, '13:30', '14:25', 'c1c', 'Mathematics', 'ks'),
      slot('b1', 3, '08:55', '09:50', 'c1b', 'Biology', 'pg'),
      slot('b2', 3, '09:50', '10:45', 'c2a', 'Biology', 'pg'),
      slot('b3', 3, '11:00', '11:55', 'c2b', 'Biology', 'pg'),
      slot('e1', 4, '08:55', '09:50', 'c1a', 'English', 'sn'),
      slot('e2', 4, '09:50', '10:45', 'c1b', 'English', 'sn'),
      slot('e3', 4, '11:00', '11:55', 'c1c', 'English', 'sn'),
      slot('r1', 5, '08:55', '09:50', 'c2a', 'Kannada', 'rk'),
      slot('r2', 5, '09:50', '10:45', 'c2b', 'Kannada', 'rk'),
      slot('l1', 2, '14:30', '15:25', 'c1c', 'Physics', 'lr'),
    ],
  );
}
