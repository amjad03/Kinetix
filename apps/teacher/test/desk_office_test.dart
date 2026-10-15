// The attendance desk (a class's day, special classes, unmarked periods, students' leave), indents,
// room bookings, interview panels and the leave rules.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:zynetix_teacher/core/api.dart';
import 'package:zynetix_teacher/core/desk_models.dart';
import 'package:zynetix_teacher/core/hr_models.dart';
import 'package:zynetix_teacher/core/models.dart';
import 'package:zynetix_teacher/features/attendance/attendance_desk_screen.dart';
import 'package:zynetix_teacher/features/attendance/attendance_screen.dart';
import 'package:zynetix_teacher/features/hr/interviews_screen.dart';
import 'package:zynetix_teacher/features/hr/leave_screen.dart';
import 'package:zynetix_teacher/features/messages/chat_screen.dart';
import 'package:zynetix_teacher/features/work/office_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

Future<void> tapOn(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  group('Attendance desk', () {
    testWidgets('a class\'s day lists periods with their marks and special classes; a period opens the mark sheet', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: AttendanceDeskScreen(api: api, today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      expect(api.calls, containsAll(['deskClasses', 'classDay sec-7b 2026-10-14']));
      expect(find.byKey(const Key('deskPeriod-slot-1')), findsOneWidget);
      expect(find.text('3 marked'), findsOneWidget);
      expect(find.textContaining('Substitute'), findsOneWidget);
      expect(find.text('Not marked'), findsNWidgets(2));
      expect(find.text('Mathematics · Remedial'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('deskPeriod-slot-2')));
      expect(find.byType(AttendanceScreen), findsOneWidget);
    });

    testWidgets('marks a special class: leave that stands is kept, a tap changes a mark, saving makes it held', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: AttendanceDeskScreen(api: api, today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('deskSpecial-sp1')));
      expect(find.text('On duty: approved'), findsOneWidget);
      expect(find.text('Save: everyone present'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('specialRow-st3')));
      expect(find.text('Save: 1 absent'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('saveSpecial')));
      expect(api.calls, contains('markSpecial sp1 st1:present,st2:present,st3:absent'));
      expect(find.text('Marks saved. The class counts as held.'), findsOneWidget);
    });

    testWidgets('lists periods left unmarked and opens one to mark', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: AttendanceDeskScreen(api: api, today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('tabUnmarked')));
      expect(find.textContaining('2 periods of the last week'), findsOneWidget);
      expect(find.text('8 A · Mathematics'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('markUnmarked-slot-9-2026-10-12')));
      expect(find.byType(AttendanceScreen), findsOneWidget);

      api.unmarkedRows = [];
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(localizedApp(home: AttendanceDeskScreen(key: UniqueKey(), api: api, today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('tabUnmarked')));
      expect(find.text('Every period of the last week is marked.'), findsOneWidget);
    });

    testWidgets('decides students\' leave: approve with a note, decline needs a reason, the certificate opens', (tester) async {
      phone(tester);
      final opened = <String>[];
      await tester.pumpWidget(
        localizedApp(
          home: AttendanceDeskScreen(
            api: api,
            today: DateTime(2026, 10, 14),
            openFile: (Uint8List b, String name, String mime) async {
              opened.add('$name $mime');
              return true;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('tabStudentLeave')));
      expect(find.text('1 Aarav Patel · 7 B'), findsOneWidget);
      expect(find.textContaining('Inter-school chess'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('leaveDoc-al1')));
      expect(opened, ['leave-al1.pdf application/pdf']);

      await tapOn(tester, find.byKey(const Key('declineStudentLeave-al2')));
      await tapOn(tester, find.byKey(const Key('confirmStudentLeave')));
      expect(find.text('Give a reason for declining.'), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('decideStudentLeave')), isEmpty);

      await tapOn(tester, find.byKey(const Key('approveStudentLeave-al1')));
      await tester.enterText(find.byKey(const Key('studentLeaveNote')), 'Get well soon');
      await tapOn(tester, find.byKey(const Key('confirmStudentLeave')));
      expect(api.calls, contains('decideStudentLeave al1 approve Get well soon'));
      expect(find.byKey(const Key('studentLeave-al1')), findsNothing);

      await clearSnackBars(tester);
      api.decideStudentLeaveError = ApiException(403, "Only the student's teachers, the head of department or the principal decide this");
      await tapOn(tester, find.byKey(const Key('declineStudentLeave-al2')));
      await tester.enterText(find.byKey(const Key('studentLeaveNote')), 'Exams that week');
      await tapOn(tester, find.byKey(const Key('confirmStudentLeave')));
      expect(find.text("Only the student's teachers, the head of department or the principal decide this"), findsOneWidget);
    });
  });

  group('Indents', () {
    testWidgets('raises an indent with quantities, and it shows waiting for the head of department', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: IndentsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('IND-0007'), findsOneWidget);
      expect(find.text('Approved'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('raiseIndent')));
      expect(find.byKey(const Key('item-it3')), findsNothing);
      await tapOn(tester, find.byKey(const Key('sendIndent')));
      expect(find.text('Add at least one item.'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('more-it1')));
      await tapOn(tester, find.byKey(const Key('more-it1')));
      await tapOn(tester, find.byKey(const Key('more-it2')));
      expect(find.text('Estimate ₹620'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('indentReason')), 'Board work for 7 B');
      await tapOn(tester, find.byKey(const Key('sendIndent')));
      expect(api.calls, contains('raiseIndent Board work for 7 B - it1x2,it2x1'));
      expect(find.text('Indent raised. It goes for approval.'), findsOneWidget);
      expect(find.text('With the head of department'), findsOneWidget);
    });

    testWidgets('a failing list offers a retry', (tester) async {
      phone(tester);
      api.indentError = ApiException(0, 'offline', kind: ApiErrorKind.offline);
      await tester.pumpWidget(localizedApp(home: IndentsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('Rooms and halls', () {
    testWidgets('books a free time; a time that clashes with a class is refused before sending', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: RoomBookingsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('You have no bookings.'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('bookRoom')));
      expect(find.text('Seminar hall · 120 seats'), findsOneWidget);
      expect(find.text('15:00–16:00 · Staff meeting'), findsOneWidget);
      // 14:00–15:00 is free; the default time.
      expect(find.byKey(const Key('bookingClash')), findsNothing);
      await tester.enterText(find.byKey(const Key('bookingTitle')), 'Guest lecture');
      await tester.enterText(find.byKey(const Key('bookingAttendees')), '500');
      await tapOn(tester, find.byKey(const Key('sendBooking')));
      expect(find.text('Seminar hall seats 120.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('bookingAttendees')), '80');
      await tapOn(tester, find.byKey(const Key('sendBooking')));
      expect(api.calls.where((c) => c.startsWith('bookRoom rm1 ') && c.endsWith(' 14:00-15:00 Guest lecture x80')), hasLength(1));
      expect(find.text('Booking sent to the estate office.'), findsOneWidget);
      expect(find.text('Waiting'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('cancelBooking-bk1')));
      await tapOn(tester, find.byKey(const Key('confirmCancelBooking')));
      expect(api.calls, contains('cancelBooking bk1'));
      expect(find.text('Cancelled'), findsOneWidget);
    });

    testWidgets('the server\'s conflict is shown in words', (tester) async {
      phone(tester);
      api.bookingError = ApiException(409, 'The room is booked then: FB-0009 Exam briefing (14:00–15:00)', code: 'BOOKING_CONFLICT');
      api.roomDayJson = {'bookings': <Object>[], 'classes': <Object>[]};
      await tester.pumpWidget(localizedApp(home: BookRoomScreen(api: api, today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('roomFree')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('bookingTitle')), 'Club meet');
      await tapOn(tester, find.byKey(const Key('sendBooking')));
      expect(find.textContaining('FB-0009 Exam briefing'), findsOneWidget);
    });
  });

  group('Interview panels', () {
    testWidgets('scores a candidate on the day; the panel and the total show', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: InterviewsScreen(api: api, userId: 't1', today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      expect(find.text('Meera Iyer'), findsOneWidget);
      expect(find.text('To score'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('interview-iv1')));
      expect(find.text('Total 50 out of 100'), findsOneWidget);
      expect(find.byKey(const Key('panelist-p2')), findsOneWidget);
      await tester.drag(find.byKey(const Key('slider-subject_knowledge')), const Offset(400, 0));
      await tester.pumpAndSettle();
      expect(find.text('Total 60 out of 100'), findsOneWidget);
      await tapOn(tester, find.text('Select'));
      await tester.enterText(find.byKey(const Key('ivRemarks')), 'Strong in accounts');
      await tapOn(tester, find.byKey(const Key('ivSave')));
      expect(api.calls, contains('scoreInterview iv1 subject_knowledge=10,teaching_ability=5,communication=5,research=5,attitude=5 select Strong in accounts'));
      expect(find.text('Scores saved.'), findsOneWidget);
    });

    testWidgets('a past interview shows my scores, read-only; a future one cannot be scored yet', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: InterviewsScreen(api: api, userId: 't1', today: DateTime(2026, 10, 14))));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('interview-iv0')));
      expect(find.text('Total 64 out of 100'), findsOneWidget);
      expect(find.byKey(const Key('ivSave')), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.pumpWidget(localizedApp(home: InterviewsScreen(key: UniqueKey(), api: api, userId: 't1', today: DateTime(2026, 10, 1))));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('interview-iv1')));
      expect(find.byKey(const Key('ivEarly')), findsOneWidget);
      expect(find.byKey(const Key('ivSave')), findsNothing);
    });

    testWidgets('not on any panel says so', (tester) async {
      phone(tester);
      api.interviewRows = [];
      await tester.pumpWidget(localizedApp(home: InterviewsScreen(api: api, userId: 't1')));
      await tester.pumpAndSettle();
      expect(find.text('You are not on any interview panel.'), findsOneWidget);
    });
  });

  group('Leave rules', () {
    setUp(() {
      api.leaveTypeList = const [
        LeaveTypeInfo(id: 'lt-el', code: 'EL', name: 'Earned leave', paid: true, minNoticeDays: 7, maxPerRequest: 10, requiresDocument: false, halfDayAllowed: false),
        LeaveTypeInfo(id: 'lt-ml', code: 'ML', name: 'Medical leave', paid: true, requiresDocument: true),
      ];
    });

    testWidgets('shows the type\'s rules and holds back a request with too little notice', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ApplyLeaveScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('leaveRules')), findsOneWidget);
      expect(find.text('• Ask 7 days ahead'), findsOneWidget);
      expect(find.text('• No half days'), findsOneWidget);
      expect(find.text('Earned leave must be asked for 7 days ahead.'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.byKey(const Key('submitLeave'))).onPressed, isNull);
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('halfDay'))).onChanged, isNull);
    });

    testWidgets('applies with a delegate and the certificate, which is attached to the new request', (tester) async {
      phone(tester);
      final pdf = ChatUpload(name: 'certificate.pdf', mime: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits));
      final before = chatPdfPicker;
      chatPdfPicker = () async => pdf;
      addTearDown(() => chatPdfPicker = before);
      await tester.pumpWidget(localizedApp(home: ApplyLeaveScreen(api: api)));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('leaveType')));
      await tapOn(tester, find.text('Medical leave').last);
      expect(find.textContaining('A supporting document is needed for more than 2 days'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('leaveDelegate')));
      await tapOn(tester, find.text('R Krishnan').last);
      await tapOn(tester, find.byKey(const Key('leaveAddDocument')));
      await tapOn(tester, find.byKey(const Key('docPdf')));
      expect(find.text('certificate.pdf'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('leaveReason')), 'Surgery');
      await tapOn(tester, find.byKey(const Key('submitLeave')));
      expect(api.calls.where((c) => c.startsWith('applyLeave lt-ml ') && c.endsWith('Surgery delegate p2')), hasLength(1));
      expect(api.calls, contains('attachLeaveDocument lr1 certificate.pdf'));
    });

    testWidgets('my requests show the delegate and the document, and a missing document can be attached', (tester) async {
      phone(tester);
      final photo = ChatUpload(name: 'note.jpg', mime: 'image/jpeg', bytes: Uint8List(10));
      final before = chatPhotoPicker;
      chatPhotoPicker = (ImageSource _) async => photo;
      addTearDown(() => chatPhotoPicker = before);
      api.myLeaves = [
        LeaveRequestInfo.fromJson({
          'id': 'lr7',
          'user': {'id': 'me', 'fullName': 'Anita Sharma'},
          'leaveType': {'id': 'lt-ml', 'code': 'ML', 'name': 'Medical leave', 'paid': true, 'requiresDocument': true},
          'fromDate': '2026-10-20',
          'toDate': '2026-10-24',
          'halfDay': false,
          'days': 5,
          'reason': 'Surgery',
          'status': 'pending',
          'decisionNote': null,
          'delegate': {'id': 'p2', 'fullName': 'R Krishnan'},
          'hasDocument': false,
          'documentName': null,
        }),
      ];
      await tester.pumpWidget(localizedApp(home: LeaveScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.textContaining('Approvals go to R Krishnan'), findsOneWidget);
      expect(find.textContaining('Attach the supporting document'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('attach-lr7')));
      await tapOn(tester, find.byKey(const Key('docCamera')));
      expect(api.calls, contains('attachLeaveDocument lr7 note.jpg'));
      expect(find.text('Document attached.'), findsOneWidget);
    });
  });

  test('parses the desk\'s answers as the server sends them', () {
    final p = DeskPeriod.fromJson({'slotId': 's', 'date': '2026-10-14', 'startsAt': '09:00:00', 'endsAt': '09:45:00', 'sectionId': 'x', 'section': '7 B', 'subjectId': 'y', 'subject': 'Maths', 'teacherId': 't', 'teacher': 'T', 'substitute': false, 'batch': null, 'combined': 0, 'marked': 0});
    expect((p.startsAt, p.period.startsAt.minutes), ('09:00', 540));
    final r = SheetRow.fromJson({'id': 'a', 'fullName': 'A', 'rollNo': '1', 'status': 'late', 'leave': {'leaveId': 'l', 'kind': 'medical', 'countsAs': 'excused'}});
    expect((r.status, r.leave?.countsAs), (AttendanceStatus.late, AttendanceStatus.excused));
    final day = RoomDay.fromJson({'date': '2026-10-20', 'bookings': [{'startsAt': '15:00:00', 'endsAt': '16:00:00', 'title': 'B'}], 'classes': [{'startsAt': '09:00:00', 'endsAt': '09:45:00', 'section': '8 A', 'subject': 'Music'}]});
    expect([for (final u in day.uses) u.title], ['8 A · Music', 'B']);
  });

  testWidgets('Hindi and Kannada: the new screens read in their own words and fit a 360dp phone', (tester) async {
    phone(tester, size: const Size(360, 780));
    for (final lang in ['hi', 'kn']) {
      final s = strings(lang);
      final screens = <(Widget, String)>[
        (AttendanceDeskScreen(key: UniqueKey(), api: api, today: DateTime(2026, 10, 14)), s.deskTitle),
        (IndentsScreen(key: UniqueKey(), api: api), s.indentsTitle),
        (RaiseIndentScreen(key: UniqueKey(), api: api), s.indentRaise),
        (RoomBookingsScreen(key: UniqueKey(), api: api), s.bookingsTitle),
        (BookRoomScreen(key: UniqueKey(), api: api), s.bookingNew),
        (InterviewsScreen(key: UniqueKey(), api: api, userId: 't1'), s.ivTitle),
        (ApplyLeaveScreen(key: UniqueKey(), api: api), s.leaveApply),
      ];
      for (final (w, title) in screens) {
        await tester.pumpWidget(localizedApp(home: w, language: lang));
        await tester.pumpAndSettle();
        expect(find.text(title), findsWidgets, reason: '$lang $title');
      }
    }
    expect(tester.takeException(), isNull);
  });
}
