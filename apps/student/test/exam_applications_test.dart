import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/exam_applications.dart';
import 'package:zynetix_student/demo/fake_api.dart';
import 'package:zynetix_student/features/exams/exam_applications_screen.dart';
import 'package:zynetix_student/l10n/app_localizations.dart';

Widget _app(FakeStudentApi api, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: ExamApplicationsScreen(api: api, studentId: 's1'),
);

void main() {
  testWidgets('a student adds an improvement paper and sees the fee change before saving', (tester) async {
    final api = FakeStudentApi();
    await tester.pumpWidget(_app(api));
    await tester.pumpAndSettle();
    // One backlog paper (Rs 250) is raised to the Rs 500 minimum; the held-back subject cannot be chosen.
    expect(find.byKey(const Key('appNo-supp1')), findsOneWidget);
    expect(find.text('Exam fee ₹500.00'), findsOneWidget);
    expect(find.text('Prerequisite not cleared: BCM-201'), findsOneWidget);
    final held = tester.widget<Checkbox>(find.byKey(const Key('choose-sub-law')));
    expect(held.onChanged, isNull);
    // Adding the improvement paper: 2 x 250 = 500, still Rs 500.
    await tester.tap(find.byKey(const Key('choose-sub-cost')));
    await tester.pump();
    expect(find.byKey(const Key('feeTotal-supp1')), findsOneWidget);
    expect((tester.widget<Text>(find.byKey(const Key('feeTotal-supp1')))).data, 'Exam fee ₹500.00');
    await tester.ensureVisible(find.byKey(const Key('submit-supp1')));
    await tester.tap(find.byKey(const Key('submit-supp1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('submitExamApplication supp1 sub-ca,sub-cost'));
    expect(find.textContaining('Pay the exam fee in Fees'), findsOneWidget);
  });

  testWidgets('a paid application cannot be changed and shows in Kannada', (tester) async {
    final api = FakeStudentApi();
    final a = api.applications.first;
    api.applications = [ExamApplication(sessionId: a.sessionId, sessionName: a.sessionName, windowState: 'late', closesOn: a.closesOn, blockers: const [], subjects: a.subjects, minimumPaise: a.minimumPaise, lateFeePaise: 20000, canSubmit: true, applicationNo: a.applicationNo, status: 'registered', feePaise: 70000, feeStatus: 'paid', invoiceNo: a.invoiceNo)];
    await tester.pumpWidget(_app(api, locale: const Locale('kn')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('submit-supp1')), findsNothing);
    expect(find.textContaining('ಪಾವತಿಸಲಾಗಿದೆ'), findsWidgets);
    // 500 for the backlog paper plus the Rs 200 late fee.
    expect((tester.widget<Text>(find.byKey(const Key('feeTotal-supp1')))).data, 'ಪರೀಕ್ಷಾ ಶುಲ್ಕ ₹700.00');
  });

  testWidgets('says so when no examination is open', (tester) async {
    final api = FakeStudentApi()..applications = [];
    await tester.pumpWidget(_app(api, locale: const Locale('hi')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('noApplications')), findsOneWidget);
  });

  test('works out the fee by the exam office rule (worked by hand)', () {
    final a = FakeStudentApi().applications.first;
    expect(a.feeFor({}), 0); // nothing chosen, nothing to write
    expect(a.feeFor({'sub-ca'}), 50000); // 250 raised to 500
    expect(a.feeFor({'sub-ca', 'sub-cost'}), 50000); // 250 + 250
    expect(a.feeFor({'sub-ca', 'sub-cost', 'sub-law'}), 50000); // the held-back paper costs nothing
  });
}
