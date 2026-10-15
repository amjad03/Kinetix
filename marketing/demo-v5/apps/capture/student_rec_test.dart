// Student App screen recordings (demo build data). One clip per run: CLIP=<id>.
// Copied into apps/student/test/ by tools/capture_apps.sh, with zz_rec.dart, and deleted after.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_lesson/zynetix_lesson.dart';
import 'package:zynetix_student/app.dart';
import 'package:zynetix_student/core/app_state.dart';
import 'package:zynetix_student/core/models.dart';
import 'package:zynetix_student/core/token_store.dart';
import 'package:zynetix_student/demo/demo.dart';
import 'package:zynetix_student/demo/demo_api.dart';

import 'zz_rec.dart';

final clip = Platform.environment['CLIP'] ?? '';

Finder k(String key) => find.byKey(Key(key));

/// The demo backend, with the hand-in time taken from the demo clock (the in-memory fake stamps
/// every hand-in "4 Oct, 5:00 am").
class _Api extends DemoStudentApi {
  _Api({required DateTime Function() clock}) : _now = clock, super(clock: clock);
  final DateTime Function() _now;

  @override
  Future<Submission> submitHomework(
    String homeworkId,
    String studentId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  }) async {
    await super.submitHomework(homeworkId, studentId, text: text, files: files, onProgress: onProgress);
    final j = Map<String, dynamic>.of(submissions['$homeworkId/$studentId']!);
    j['submittedAt'] = _now().toUtc().toIso8601String();
    submissions['$homeworkId/$studentId'] = j;
    return Submission.fromJson(j);
  }
}

class StudentRig {
  StudentRig(this.t, this.r);
  final WidgetTester t;
  final Rec r;
  late DemoStudentApi api;

  Future<void> boot() async {
    Demo.enabled = true;
    addTearDown(() => Demo.enabled = false);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    addTearDown(() => LessonAudio.debugFactory = null);
    await loadAllFonts();
    phoneView(t);
    r.recording = false;
    r.startAt(11, 20);
    SharedPreferences.setMockInitialValues({});
    api = _Api(clock: r.now);
    final state = AppState(
      api,
      await SharedPreferences.getInstance(),
      tokens: MemoryTokenStore(),
      live: DemoLiveConnection.connector(api, delay: const Duration(hours: 2)),
    );
    await t.pumpWidget(r.wrap(StudentApp(state: state)));
    await state.restore();
    await r.skip(1);
  }

  Future<void> bootSignedIn() async {
    await boot();
    await t.tap(k('demoSignIn0'));
    await r.skip(2);
    r.recording = true;
  }

  Finder get bar => find.byWidgetPredicate((w) => w is NavigationBar);
  Future<void> tab(String name, {String? label}) => r.tap(find.descendant(of: bar, matching: find.text(name)), label: label);
}

void main() {
  testWidgets('student_home', (t) async {
    final r = Rec(t, id: 'student_home', title: 'Student App: sign-in and Home');
    final g = StudentRig(t, r);
    await g.boot();
    r.recording = true;
    r.mark('Sign-in screen (demo mode)');
    await r.hold(1.6);
    await r.tap(k('demoSignIn0'), label: 'Signs in as Aarav Patel');
    await r.settle(min: 0.8);
    r.mark('Home: live question from the board, next class');
    await r.hold(2.4);
    await r.tap(k('liveQuestionBanner'), label: "Answers the teacher's live question");
    await r.settle(min: 0.6);
    await r.hold(1.6);
    await r.tap(k('answer-1'), label: 'Picks B');
    await r.settle(min: 0.6);
    r.mark('Answer sent to the board');
    await r.hold(1.6);
    await r.scroll(-380);
    await r.settle(min: 0.3);
    r.mark('Attendance, assignments, exam countdown, homework due');
    await r.hold(2.2);
    await r.scroll(-420);
    await r.settle(min: 0.3);
    r.mark('Homework due and attendance');
    await r.hold(2);
    await r.scroll(-420);
    await r.settle(min: 0.3);
    r.mark('Coming up in class, ask AI, results');
    await r.hold(2);
    await r.finish();
  }, skip: clip != 'student_home');

  testWidgets('student_homework', (t) async {
    final r = Rec(t, id: 'student_homework', title: 'Student App: hand in homework, see the checked one');
    final g = StudentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.8);
    await r.scroll(-380);
    await r.settle(min: 0.3);
    r.mark('Homework due');
    await r.hold(1.2);
    await r.tap(k('homework-h1'), label: 'Opens "Exercise 4.2: Issue of shares"');
    await r.settle(min: 0.6);
    r.mark('Instructions and due date');
    await r.hold(2);
    await r.tap(k('handIn'), label: 'Hand in');
    await r.settle(min: 0.6);
    await r.hold(0.6);
    await r.tap(k('handInText'));
    await r.type(k('handInText'), 'Journal entries for Q1 to Q5 are done.');
    await r.hold(0.4);
    await r.doneTyping();
    await r.tap(k('sendHandIn'), label: 'Send');
    await r.settle(min: 0.6);
    r.mark('Handed in: the teacher sees it');
    await r.hold(2.2);
    await r.back();
    await r.settle(min: 0.5);
    await r.scrollTo(k('pastHomework'), top: 200, bottom: 600);
    await r.tap(k('pastHomework'), label: 'Past homework');
    await r.settle(min: 0.5);
    await r.scrollTo(k('homework-h3'), top: 200, bottom: 600);
    await r.hold(0.6);
    await r.tap(k('homework-h3'), label: 'The checked one');
    await r.settle(min: 0.6);
    r.mark("Checked, with the teacher's remark");
    await r.hold(1.6);
    await r.scroll(-250);
    await r.settle(min: 0.3);
    await r.hold(2);
    await r.finish();
  }, skip: clip != 'student_homework');

  testWidgets('student_marks_attendance', (t) async {
    final r = Rec(t, id: 'student_marks_attendance', title: 'Student App: results and attendance');
    final g = StudentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.8);
    await r.scrollTo(k('resultsCard'), top: 100, bottom: 760);
    await r.scrollTo(k('assessment-a1'), top: 200, bottom: 500);
    r.mark('Results: published marks with class average');
    await r.hold(2);
    await r.tap(k('assessment-a1'), label: 'Unit test 1');
    await r.settle(min: 0.6);
    r.mark("19/25, class average, highest, teacher's remark");
    await r.hold(2.6);
    await r.back();
    await r.settle(min: 0.5);
    await r.scrollTo(find.text('See attendance history'), top: 300, bottom: 650, up: true);
    await r.scrollTo(k('attendanceCard'), top: 110, bottom: 720, up: true);
    r.mark('Attendance: 88% in the last 30 days');
    await r.hold(2);
    await r.tap(find.text('See attendance history'), label: 'Attendance history');
    await r.settle(min: 0.6);
    r.mark('Every class, day by day');
    await r.hold(1.8);
    await r.tap(k('count-absent'), label: 'Only absences');
    await r.settle(min: 0.5);
    r.mark('The 2 missed classes');
    await r.hold(2.2);
    await r.finish();
  }, skip: clip != 'student_marks_attendance');

  testWidgets('student_learn', (t) async {
    final r = Rec(t, id: 'student_learn', title: 'Student App: lesson recordings and syllabus');
    final g = StudentRig(t, r);
    await g.bootSignedIn();
    // Down to the recordings without recording the long scroll.
    r.recording = false;
    await t.scrollUntilVisible(k('recordingsCard'), 300, scrollable: find.byType(Scrollable).first);
    await r.skip(1);
    await t.drag(find.byType(Scrollable).first, Offset(0, 180 - t.getRect(k('recordingsCard')).top));
    await r.skip(1.5);
    r.recording = true;
    await r.hold(0.4);
    r.mark('Lesson recordings: one missed class');
    await r.hold(1.8);
    await r.tap(k('recording-r2'), label: 'Opens the missed lesson');
    await r.settle(min: 0.6);
    r.mark('Board replay, summary and key points');
    await r.hold(1.2);
    await r.tap(k('lessonPlay'), label: 'Play');
    await r.hold(3);
    await r.back();
    await r.settle(min: 0.5);
    await g.tab('My Learning', label: 'My Learning');
    await r.settle(min: 0.6);
    await r.tap(k('tabSyllabus'), label: 'Syllabus');
    await r.settle(min: 0.6);
    r.mark('Syllabus coverage per subject');
    await r.hold(1.6);
    await r.tap(k('subjectTile-sub1'), label: 'Corporate Accounting');
    await r.settle(min: 0.6);
    r.mark('This week in class; topics taught');
    await r.hold(2);
    await r.scroll(-380);
    await r.settle(min: 0.3);
    await r.hold(2);
    await r.finish();
  }, skip: clip != 'student_learn');
}
