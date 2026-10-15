// Teacher App screen recordings (demo build data). One clip per run: CLIP=<id>.
// Copied into apps/teacher/test/ by tools/capture_apps.sh, with zz_rec.dart, and deleted after.
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_teacher/app.dart';
import 'package:zynetix_teacher/core/app_state.dart';
import 'package:zynetix_teacher/core/secure_store.dart';
import 'package:zynetix_teacher/demo/demo.dart';
import 'package:zynetix_teacher/demo/demo_api.dart';

import 'zz_rec.dart';

final clip = Platform.environment['CLIP'] ?? '';

Finder k(String key) => find.byKey(Key(key));

/// A camera that starts but shows nothing (flutter_test has no camera): the scan screen's
/// viewfinder stays dark, as in a dim classroom, and no plugin errors are thrown.
void fakeCamera(WidgetTester t) {
  final m = t.binding.defaultBinaryMessenger;
  m.setMockMethodCallHandler(const MethodChannel('dev.steenbakker.mobile_scanner/scanner/method'), (call) async {
    switch (call.method) {
      case 'state':
        return 1;
      case 'request':
        return true;
      case 'start':
        return <String, Object?>{
          'textureId': 1,
          'cameraDirection': 1,
          'size': <String, Object?>{'width': 1080.0, 'height': 1920.0},
          'naturalDeviceOrientation': 'PORTRAIT_UP',
          'isPreviewPreTransformed': true,
          'sensorOrientation': 90,
          'handlesCropAndRotation': true,
          'currentTorchState': 0,
          'numberOfCameras': 1,
        };
    }
    return null;
  });
  for (final c in ['event', 'deviceOrientation']) {
    m.setMockStreamHandler(EventChannel('dev.steenbakker.mobile_scanner/scanner/$c'), MockStreamHandler.inline(onListen: (_, _) {}));
  }
}

/// The demo backend, but a hand-in's photo is a real notebook page (the demo only has a 1-pixel
/// placeholder image).
class _Api extends DemoTeacherApi {
  _Api({super.clock});
  static final page = File('../../marketing/demo-v5/apps/capture/assets/notes_page.jpg').readAsBytesSync();
  @override
  Future<Uint8List> submissionFile(String homeworkId, String studentId, int index) async =>
      index == 0 ? page : super.submissionFile(homeworkId, studentId, index);
}

class TeacherRig {
  TeacherRig(this.t, this.r);
  final WidgetTester t;
  final Rec r;
  late DemoTeacherApi api;
  late DemoRealtime realtime;

  /// The app on the sign-in screen (not recorded yet). The family's reply is sent by the clip.
  Future<void> boot() async {
    Demo.enabled = true;
    addTearDown(() => Demo.enabled = false);
    await loadAllFonts();
    phoneView(t);
    fakeCamera(t);
    r.recording = false;
    r.startAt(11, 20);
    SharedPreferences.setMockInitialValues({});
    api = _Api(clock: r.now);
    realtime = DemoRealtime(api, delay: const Duration(hours: 2));
    final state = AppState(api, await SharedPreferences.getInstance(), realtime: realtime, secure: MemorySecureStore());
    await t.pumpWidget(r.wrap(TeacherApp(state: state)));
    await state.restore();
    await r.skip(1);
  }

  /// Signed in on Home, not recorded; recording starts after.
  Future<void> bootSignedIn() async {
    await boot();
    await t.tap(k('demoSignIn0'));
    await r.skip(2);
    r.recording = true;
  }

  /// More → a tile further down the list.
  Future<void> openMore(String key, {String? label}) async {
    await r.tap(k('navMore'));
    await r.settle(min: 0.6, max: 1.5);
    await r.scrollTo(k(key), top: 120, bottom: 640);
    await r.hold(0.3);
    await r.tap(k(key), label: label);
    await r.settle(min: 0.5);
  }
}

void main() {
  testWidgets('teacher_signin_home', (t) async {
    final r = Rec(t, id: 'teacher_signin_home', title: 'Teacher App: one-tap sign-in and Home');
    final g = TeacherRig(t, r);
    await g.boot();
    r.recording = true;
    r.mark('Sign-in screen (demo mode)');
    await r.hold(1.8);
    await r.tap(k('demoSignIn0'), label: 'Signs in as Anita Sharma');
    await r.settle(min: 0.8);
    r.mark("Home: today's classes and quick actions");
    await r.hold(2.6);
    await r.tap(k('navClasses'), label: 'Classes tab');
    await r.settle(min: 0.6);
    r.mark('Timetable: connect to board, day strip');
    await r.hold(1.8);
    await r.scroll(-300);
    await r.settle(min: 0.3);
    r.mark('The class happening now');
    await r.hold(2.2);
    await r.tap(k('navHome'));
    await r.settle(min: 0.5);
    await r.hold(1.2);
    await r.finish();
  }, skip: clip != 'teacher_signin_home');

  testWidgets('teacher_attendance', (t) async {
    final r = Rec(t, id: 'teacher_attendance', title: 'Teacher App: take attendance');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    r.mark('Home');
    await r.hold(1.2);
    await r.tap(k('qaAttendance'), label: 'Attendance for the class now');
    await r.settle(min: 0.6);
    r.mark('Everyone starts present');
    await r.hold(2);
    await r.tap(k('status-s3'), label: 'Bhavya marked absent');
    await r.hold(0.7);
    await r.tap(k('status-s6'), label: 'Farhan marked absent');
    await r.hold(1.6);
    r.mark('10 present, 2 absent');
    await r.hold(0.6);
    await r.tap(k('submitAttendance'), label: 'Submit');
    await r.settle(min: 0.5);
    r.mark('Saved: 10 present, 2 absent');
    await r.hold(2.2);
    await r.tap(k('navClasses'), label: 'Classes tab');
    await r.settle(min: 0.6);
    await r.scroll(-300);
    await r.settle(min: 0.3);
    r.mark('Attendance taken for the 11:15 class');
    await r.hold(2.2);
    await r.finish();
  }, skip: clip != 'teacher_attendance');

  testWidgets('teacher_homework', (t) async {
    final r = Rec(t, id: 'teacher_homework', title: 'Teacher App: check homework hand-ins with a remark');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await g.openMore('openHomework', label: 'Homework');
    r.mark('Homework list');
    await r.hold(1.6);
    await r.tap(k('homework-h3'), label: 'Open "Forfeiture of shares: notes"');
    await r.settle(min: 0.5);
    r.mark('Hand-ins: handed in, checked, missing');
    await r.hold(2);
    await r.tap(k('submission-s1'), label: "Aarav's checked answer");
    await r.settle(min: 0.5);
    r.mark('Checked, with the remark "Well done"');
    await r.hold(2.2);
    await r.back();
    await r.settle(min: 0.4);
    await r.tap(k('submission-s2'), label: "Ananya's hand-in: a photo of her notes");
    await r.realWait();
    await r.settle(min: 0.5);
    await r.realWait();
    await r.hold(1.2);
    await r.tap(k('reviewRemark'));
    await r.type(find.byKey(const Key('reviewRemark')), 'Good summary. Add the journal entry.');
    await r.hold(0.4);
    await r.doneTyping();
    await r.tap(k('checkWork'), label: 'Mark as checked, with a remark');
    await r.settle(min: 0.6);
    r.mark('Checked: the student and family are told');
    await r.hold(2.4);
    await r.finish();
  }, skip: clip != 'teacher_homework');

  testWidgets('teacher_marks', (t) async {
    final r = Rec(t, id: 'teacher_marks', title: 'Teacher App: enter and publish marks');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await g.openMore('openMarks', label: 'Marks');
    r.mark('Assessments: a draft and a published test');
    await r.hold(1.5);
    await r.tap(k('assessment-a2'), label: 'Open the draft assignment');
    await r.settle(min: 0.5);
    r.mark('Enter marks out of 10');
    await r.hold(0.8);
    const marks = ['8', '9', '7', '10', '6', '8', '9', '7', '8', '10', '9', '7'];
    for (var i = 0; i < marks.length; i++) {
      final f = k('marks-s${i + 1}');
      if (t.getRect(f).bottom > r.keyboardTop - 70) {
        await r.scroll(-220, from: const Offset(200, 420), seconds: 0.5);
        await r.settle(min: 0.2, max: 1);
      }
      await r.tap(f);
      await r.type(f, marks[i], numeric: true);
    }
    await r.doneTyping();
    await r.emit(3);
    await r.tap(k('saveMarks'), label: 'Save');
    await r.settle(min: 0.6);
    await r.tap(k('publishMarks'), label: 'Publish');
    await r.settle(min: 0.4);
    r.mark('Publish to families?');
    await r.hold(1.4);
    await r.tap(k('confirmPublish'), label: 'Confirm publish');
    await r.settle(min: 0.5);
    r.mark('Published: families can see the marks');
    await r.hold(2.4);
    await r.finish();
  }, skip: clip != 'teacher_marks');

  testWidgets('teacher_plan_syllabus', (t) async {
    final r = Rec(t, id: 'teacher_plan_syllabus', title: 'Teacher App: syllabus coverage, year plan and lesson plan');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await r.tap(k('navClasses'));
    await r.settle(min: 0.5);
    await r.scroll(-300);
    await r.settle(min: 0.3);
    await r.tap(k('syllabus-slot-4-2'), label: 'Syllabus for the 11:15 class');
    await r.settle(min: 0.6);
    r.mark('Syllabus: 4 of 11 topics taught');
    await r.hold(2);
    await r.scroll(-250);
    await r.settle(min: 0.3);
    await r.hold(0.6);
    await r.tap(k('taught-t5'), label: 'Mark "Re-issue of forfeited shares" taught');
    await r.settle(min: 0.6);
    r.mark('Marked as taught today');
    await r.hold(1.8);
    await r.tap(k('openYearPlan'), label: 'Year plan');
    await r.settle(min: 0.6);
    r.mark('Year plan: behind by 1 topic');
    await r.hold(1.8);
    await r.scroll(-400);
    await r.settle(min: 0.3);
    r.mark('Week by week, late topics flagged');
    await r.hold(2);
    await r.back();
    await r.settle(min: 0.4);
    await r.back();
    await r.settle(min: 0.5);
    await r.tap(k('plan-slot-4-2'), label: 'Lesson plan for the class');
    await r.settle(min: 0.6);
    await r.hold(1);
    await r.tap(k('draftWithAi'), label: 'Draft with ZYNETIX AI');
    await r.settle(min: 0.8);
    r.mark('AI draft: next topic, objectives, timed steps');
    await r.hold(2.2);
    await r.scroll(-350);
    await r.settle(min: 0.3);
    await r.hold(1.4);
    await r.tap(k('saveLessonPlan'), label: 'Save plan');
    await r.settle(min: 0.5);
    r.mark('Lesson plan saved');
    await r.hold(2);
    await r.finish();
  }, skip: clip != 'teacher_plan_syllabus');

  testWidgets('teacher_messages', (t) async {
    final r = Rec(t, id: 'teacher_messages', title: 'Teacher App: messages with a parent, reply arrives live');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await g.openMore('openMessages', label: 'Messages');
    r.mark('Conversations with families');
    await r.hold(1.6);
    await r.tap(k('conversation-c1'), label: 'Rajesh Patel (parent of Aarav)');
    await r.settle(min: 0.6);
    r.mark('The conversation so far');
    await r.hold(2);
    await r.tap(k('messageField'));
    await r.type(find.byKey(const Key('messageField')), 'Glad he is better. Exercise 4.2 is due Saturday.');
    await r.hold(0.4);
    await r.tap(k('sendMessage'), label: 'Send');
    await r.settle(min: 0.5, max: 1.5);
    await r.doneTyping();
    await r.settle(min: 0.3);
    await r.hold(2.2);
    g.realtime.send(g.api.receiveReply());
    await r.settle(min: 0.3);
    r.mark("Rajesh's reply arrives live");
    await r.hold(3);
    await r.finish();
  }, skip: clip != 'teacher_messages');

  testWidgets('teacher_connect_board', (t) async {
    final r = Rec(t, id: 'teacher_connect_board', title: 'Teacher App: connect to the classroom board');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    r.mark('Home');
    await r.hold(1.2);
    await r.tap(k('startClass-slot-4-2'), label: 'Start class (11:15, now)');
    await r.settle(min: 0.6, max: 1.5);
    r.mark('Scan the QR code on the board');
    await r.hold(2.2);
    await r.tap(find.text('Enter code instead'), label: 'Or type the code shown on the board');
    await r.settle(min: 0.5, max: 1.5);
    await r.hold(1);
    final code = k('codeField');
    await r.tap(code);
    await r.type(code, '482913', numeric: true);
    await r.doneTyping();
    await r.settle(min: 0.4, max: 2);
    r.mark("You're connected: the board opens the class");
    await r.hold(3);
    await r.finish();
  }, skip: clip != 'teacher_connect_board');

  testWidgets('teacher_recordings_calendar', (t) async {
    final r = Rec(t, id: 'teacher_recordings_calendar', title: 'Teacher App: lesson recordings and the calendar');
    final g = TeacherRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await g.openMore('openRecordings', label: 'Recordings');
    r.mark('Board lessons recorded, shared, transcribed');
    await r.hold(2.4);
    await r.tap(k('share-r3'), label: 'Share "Pro-rata allotment" with the class');
    await r.settle(min: 0.6);
    r.mark('Students and families of absent students are told');
    await r.hold(1.8);
    await r.tap(k('confirmShare'), label: 'Share');
    await r.settle(min: 0.6);
    r.mark('Shared with the class');
    await r.hold(2);
    await r.back();
    await r.settle(min: 0.5);
    await r.scrollTo(k('openCalendar'), top: 120, bottom: 640);
    await r.hold(0.3);
    await r.tap(k('openCalendar'), label: 'Calendar');
    await r.settle(min: 0.6);
    r.mark('Holidays, exams and events');
    await r.hold(2.2);
    await r.scroll(-300);
    await r.settle(min: 0.3);
    await r.hold(1.8);
    await r.finish();
  }, skip: clip != 'teacher_recordings_calendar');
}
