// A child's exams: the timetable, the hall ticket PDF, results with SGPA, and revaluation.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/features/exams/exams_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
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

Future<void> tapShown(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

void main() {
  late FakeParentApi api;
  final opened = <String>[];
  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add('$name $mime ${String.fromCharCodes(bytes.take(5))}');
    return true;
  }

  setUp(() {
    api = FakeParentApi();
    opened.clear();
  });

  Future<void> pumpExams(WidgetTester tester, {bool second = false}) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(ExamsScreen(api: api, child: second ? api.diya : api.aarav, openFile: fakeOpen)));
    await tester.pumpAndSettle();
  }

  testWidgets("shows the child's timetable and opens the hall ticket PDF", (tester) async {
    await pumpExams(tester);
    expect(find.text('Aarav Patel'), findsOneWidget);
    expect(find.text('Semester 3 end exam'), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
    expect(find.textContaining('Hall 2 · Seat 14'), findsWidgets);
    await tapShown(tester, find.byKey(const Key('hallTicket-ex1')));
    expect(opened, ['hall-ticket-HT-EX1-U03BC001.pdf application/pdf %PDF-']);
    expect(api.calls, contains('hallTicket ex1 c1'));
  });

  testWidgets('a hall ticket the college refuses shows the reason', (tester) async {
    api.hallTicketError = ApiException(403, 'Hall ticket withheld: Fee dues');
    await pumpExams(tester);
    await tapShown(tester, find.byKey(const Key('hallTicket-ex1')));
    expect(find.text('Hall ticket withheld: Fee dues'), findsOneWidget);
    expect(opened, isEmpty);
  });

  testWidgets('results show CGPA and SGPA; revaluation needs a reason and is asked for once', (tester) async {
    await pumpExams(tester);
    expect(find.text('CGPA 7.90'), findsOneWidget);
    expect(find.text('SGPA 7.90'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('revalue-sub1')), 200, scrollable: find.byType(Scrollable).first);
    await tapShown(tester, find.byKey(const Key('revalue-sub1')));
    await tester.enterText(find.byKey(const Key('revalReason')), 'x');
    await tapShown(tester, find.byKey(const Key('revalSend')));
    expect(find.text('Write a few words (at least 3 letters).'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('revalReason')), 'Total looks wrong');
    await tapShown(tester, find.byKey(const Key('revalSend')));
    expect(api.calls, contains('revaluation c1 ex0 sub1 Total looks wrong'));
    expect(find.text('Revaluation requested'), findsOneWidget);
    expect(find.byKey(const Key('revalue-sub1')), findsNothing);
  });

  testWidgets("another child with no exams sees empty states, and a failure offers a retry", (tester) async {
    await pumpExams(tester, second: true);
    expect(find.byKey(const Key('noExams')), findsOneWidget);
    expect(find.byKey(const Key('noResults')), findsOneWidget);
    api.examsError = ApiException(0, '', problem: ApiProblem.unreachable);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('in the app: the Academics tab and More both lead to the exams', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.byKey(const Key('homeTab-academics')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('examsCard')), 200, scrollable: find.byType(Scrollable).first);
    await tapShown(tester, find.byKey(const Key('examsCard')));
    expect(find.text('Semester 3 end exam'), findsOneWidget);
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('profile-exams-c1')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.byKey(const Key('profile-exams-c1')), findsOneWidget);
  });
}
