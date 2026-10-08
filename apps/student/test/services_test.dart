// Exams, leave, the bus, hostel gate passes and certificates: what a student asks the campus for.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/campus_services.dart';
import 'package:kinetix_student/features/campus/bus_screen.dart';
import 'package:kinetix_student/features/campus/certificates_screen.dart';
import 'package:kinetix_student/features/campus/gate_pass_screen.dart';
import 'package:kinetix_student/features/campus/leave_screen.dart';
import 'package:kinetix_student/features/exams/exams_tab.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget host(Widget child) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: const Locale('en'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  late FakeStudentApi api;
  final opened = <String>[];
  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add('$name $mime ${String.fromCharCodes(bytes.take(5))}');
    return true;
  }

  setUp(() {
    api = FakeStudentApi();
    opened.clear();
  });

  group('Exams', () {
    Future<void> pumpExams(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(ExamsTab(api: api, student: api.record!, openFile: fakeOpen)));
      await tester.pumpAndSettle();
    }

    testWidgets('lists the timetable with room and seat, and opens the hall ticket PDF', (tester) async {
      await pumpExams(tester);
      expect(find.text('Semester 3 end exam'), findsOneWidget);
      expect(find.text('Corporate Accounting'), findsOneWidget);
      expect(find.textContaining('Hall 2 · Seat 14'), findsWidgets);
      await tapAndSettleOn(tester, find.byKey(const Key('hallTicket-ex1')));
      expect(opened, ['hall-ticket-HT-EX1-U03BC001.pdf application/pdf %PDF-']);
      expect(api.calls, contains('hallTicket ex1'));
    });

    testWidgets('a withheld hall ticket says why and offers no download', (tester) async {
      api.examSessions[0] = ExamSessionWithheld.of(api.examSessions[0], 'Fee dues');
      await pumpExams(tester);
      expect(find.byKey(const Key('hallTicketWithheld')), findsOneWidget);
      expect(find.text('Hall ticket withheld: Fee dues'), findsOneWidget);
      expect(find.byKey(const Key('hallTicket-ex1')), findsNothing);
    });

    testWidgets('a server refusal on the hall ticket shows in words, and no hall ticket yet says so', (tester) async {
      api.hallTicketError = ApiException(403, 'Hall ticket withheld: Fee dues');
      await pumpExams(tester);
      await tapAndSettleOn(tester, find.byKey(const Key('hallTicket-ex1')));
      expect(find.text('Hall ticket withheld: Fee dues'), findsOneWidget);
      expect(opened, isEmpty);
    });

    testWidgets('results show CGPA, SGPA, grades, and a revaluation request goes through once', (tester) async {
      await pumpExams(tester);
      expect(find.byKey(const Key('cgpa')), findsOneWidget);
      expect(find.text('CGPA 7.90'), findsOneWidget);
      expect(find.text('SGPA 7.90'), findsOneWidget);
      expect(find.text('82% · Grade A'), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const Key('revalue-sub1')), 200, scrollable: find.byType(Scrollable).first);
      await tapAndSettleOn(tester, find.byKey(const Key('revalue-sub1')));
      // Too short: asked again.
      await tester.enterText(find.byKey(const Key('revalReason')), 'a');
      await tapAndSettleOn(tester, find.byKey(const Key('revalSend')));
      expect(find.text('Write a few words (at least 3 letters).'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('revalReason')), 'Question 3 was marked wrong');
      await tapAndSettleOn(tester, find.byKey(const Key('revalSend')));
      expect(api.calls, contains('revaluation ex0 sub1 Question 3 was marked wrong'));
      expect(find.text('Revaluation requested'), findsOneWidget);
      expect(find.byKey(const Key('revalue-sub1')), findsNothing);
    });

    testWidgets('empty and failing states', (tester) async {
      api.examSessions = [];
      api.results = const ExamResults(cgpa: null, terms: []);
      await pumpExams(tester);
      expect(find.byKey(const Key('noExams')), findsOneWidget);
      expect(find.byKey(const Key('noResults')), findsOneWidget);
      api.examsError = ApiException(0, '', problem: ApiProblem.unreachable);
      await tester.drag(find.byType(ListView), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('Leave', () {
    Future<void> pumpLeave(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(LeaveScreen(api: api, studentId: 's1', now: () => DateTime(2026, 10, 5, 9))));
      await tester.pumpAndSettle();
    }

    testWidgets('lists applications with their state', (tester) async {
      await pumpLeave(tester);
      expect(find.text('Fever'), findsOneWidget);
      expect(find.text('Approved'), findsOneWidget);
    });

    testWidgets('applies for a day, validates the reason, and a waiting request can be withdrawn', (tester) async {
      await pumpLeave(tester);
      await tapAndSettleOn(tester, find.byKey(const Key('applyLeave')));
      await tapAndSettleOn(tester, find.byKey(const Key('sendLeave')));
      expect(find.text('Write a few words (at least 3 letters).'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('leaveReason')), 'Cousin wedding');
      await tapAndSettleOn(tester, find.byKey(const Key('sendLeave')));
      expect(api.calls, contains('applyLeave 2026-10-05 2026-10-05 Cousin wedding'));
      expect(find.text('Request sent to your class teacher.'), findsOneWidget);
      expect(find.text('Cousin wedding'), findsOneWidget);
      expect(find.text('Waiting'), findsOneWidget);

      await tapAndSettleOn(tester, find.byKey(const Key('withdraw-lv2')));
      expect(api.calls, contains('cancelLeave lv2'));
      expect(find.text('Withdrawn'), findsOneWidget);
    });

    testWidgets('an empty list and a failed load say so', (tester) async {
      api.leaves = [];
      await pumpLeave(tester);
      expect(find.text('No leave applications yet.'), findsOneWidget);
      api.leaveError = ApiException(500, 'boom');
      await tester.drag(find.byType(ListView), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('Bus', () {
    Future<void> pumpBus(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(BusScreen(api: api, studentId: 's1', every: const Duration(hours: 1))));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the live ETA, the stop and the route', (tester) async {
      await pumpBus(tester);
      expect(find.text('Arrives at your stop in about 6 min'), findsOneWidget);
      expect(find.text('1 stop away'), findsOneWidget);
      expect(find.textContaining('Route 4'), findsOneWidget);
      expect(find.byKey(const Key('busStop-st2')), findsOneWidget);
      expect(find.textContaining('07:30'.replaceFirst('07:30', '7:30')), findsWidgets);
    });

    testWidgets('a bus that is not running, and a student without a seat', (tester) async {
      api.busInfo = const StudentBus(assigned: true, routeName: 'Route 4', stopId: 'st1', stopName: 'Banashankari', stops: [BusStop(id: 'st1', name: 'Banashankari', seq: 1)]);
      await pumpBus(tester);
      expect(find.byKey(const Key('busNotRunning')), findsOneWidget);
      api.busInfo = const StudentBus(assigned: false);
      await tester.drag(find.byType(ListView), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('You do not have a bus seat. Ask the transport office.'), findsOneWidget);
    });
  });

  group('Gate pass', () {
    Future<void> pumpPasses(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(GatePassScreen(api: api, studentId: 's1', now: () => DateTime(2026, 10, 5, 9))));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the room and the passes, and a request goes to the warden', (tester) async {
      await pumpPasses(tester);
      expect(find.text('Block A · Room 101'), findsOneWidget);
      expect(find.text('Weekend at home'), findsOneWidget);
      await tapAndSettleOn(tester, find.byKey(const Key('requestGatePass')));
      await tapAndSettleOn(tester, find.byKey(const Key('sendGatePass')));
      expect(find.text('Write a few words (at least 3 letters).'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('gpReason')), 'Doctor');
      await tester.enterText(find.byKey(const Key('gpDestination')), 'Jayanagar hospital');
      await tapAndSettleOn(tester, find.byKey(const Key('sendGatePass')));
      expect(api.calls, contains('gatePass Doctor Jayanagar hospital'));
      expect(find.text('Request sent to the warden.'), findsOneWidget);
      expect(find.text('Waiting for the warden'), findsOneWidget);
    });

    testWidgets('a day scholar is told gate passes are for residents', (tester) async {
      api.hostelView = const HostelView(resident: false);
      await pumpPasses(tester);
      expect(find.textContaining('hostel residents'), findsOneWidget);
      expect(find.byKey(const Key('requestGatePass')), findsNothing);
    });
  });

  group('Certificates', () {
    Future<void> pumpCerts(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(CertificatesScreen(api: api, studentId: 's1', openFile: fakeOpen)));
      await tester.pumpAndSettle();
    }

    testWidgets('an issued certificate downloads as a PDF', (tester) async {
      await pumpCerts(tester);
      expect(find.text('Ready to download'), findsOneWidget);
      expect(find.text('No. BON/2026/0007'), findsOneWidget);
      await tapAndSettleOn(tester, find.byKey(const Key('download-c1')));
      expect(api.calls, contains('certPdf c1'));
      expect(opened.single, endsWith('application/pdf %PDF-'));
    });

    testWidgets('requests a certificate; a required field must be filled first', (tester) async {
      await pumpCerts(tester);
      await tapAndSettleOn(tester, find.byKey(const Key('requestCertificate')));
      await tester.tap(find.byKey(const Key('certTemplate')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Study certificate').last);
      await tester.pumpAndSettle();
      await tapAndSettleOn(tester, find.byKey(const Key('sendCertificate')));
      expect(find.text('Fill in this field.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('certField-purpose')), 'Scholarship');
      await tapAndSettleOn(tester, find.byKey(const Key('sendCertificate')));
      expect(api.calls, contains('requestCert ct2 '));
      expect(find.text('Request sent to the office.'), findsOneWidget);
      expect(find.text('Waiting for the office'), findsOneWidget);
    });

    testWidgets('with no templates, says so; an empty list says so', (tester) async {
      api.certTemplates = const [];
      api.certs = [];
      await pumpCerts(tester);
      expect(find.text('No certificates yet.'), findsOneWidget);
      await tapAndSettleOn(tester, find.byKey(const Key('requestCertificate')));
      expect(find.text('The college has no certificates open for request.'), findsOneWidget);
    });
  });

  group('In the app', () {
    testWidgets('Home has the next class, four tiles and Continue learning; Exams is a tab; More lists the campus entries', (tester) async {
      await pumpApp(tester);
      expect(find.byKey(const Key('nextClassCard')), findsOneWidget);
      for (final k in ['tileAttendance', 'tileAssignments', 'tileExam', 'tileStreak']) {
        expect(find.byKey(Key(k)), findsOneWidget, reason: k);
      }
      expect(find.descendant(of: find.byKey(const Key('tileStreak')), matching: find.textContaining('1 day')), findsOneWidget);
      expect(find.byKey(const Key('continueLearning')), findsOneWidget);
      for (final label in ['Home', 'My Learning', 'Exams', 'More']) {
        expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)), findsOneWidget, reason: label);
      }

      await openTab(tester, 'Exams');
      expect(find.text('Semester 3 end exam'), findsOneWidget);

      await openTab(tester, 'More');
      for (final k in ['openLeave', 'openBus', 'openGatePass', 'openWallet', 'openCertificates']) {
        // Scroll the More list down until the entry is built.
        for (var i = 0; i < 20 && find.byKey(Key(k)).evaluate().isEmpty; i++) {
          await tester.drag(find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first, const Offset(0, -300));
          await tester.pumpAndSettle();
        }
        expect(find.byKey(Key(k)), findsOneWidget, reason: k);
      }
    });

    testWidgets('the upcoming exam tile counts the days and opens Exams', (tester) async {
      await pumpApp(tester);
      expect(find.descendant(of: find.byKey(const Key('tileExam')), matching: find.textContaining('days')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('tileExam')), matching: find.text('Corporate Accounting')), findsOneWidget);
      await tester.tap(find.byKey(const Key('tileExam')));
      await tester.pumpAndSettle();
      expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 2);
    });

    testWidgets('the bell opens notifications and More is where the avatar leads', (tester) async {
      await pumpApp(tester);
      await tester.tap(find.byKey(const Key('openUpdates')));
      await tester.pumpAndSettle();
      expect(find.text('Updates'), findsWidgets);
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('openProfile')));
      await tester.pumpAndSettle();
      expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 3);
    });
  });
}

Future<void> tapAndSettleOn(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

/// Test helper: the same session with its hall ticket withheld.
abstract final class ExamSessionWithheld {
  static ExamSession of(ExamSession s, String reason) => ExamSession(
    id: s.id,
    name: s.name,
    kind: s.kind,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    status: s.status,
    papers: s.papers,
    hallTicket: HallTicket(ticketNo: s.hallTicket!.ticketNo, blocked: true, blockedReason: reason),
  );
}
