// The library (Profile → Work): search the catalogue with facets, reserve a title that is out, renew my book and
// leave a queue; in Kannada too.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/features/library/library_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  testWidgets('searches, narrows by a subject facet, and reserves a title whose copies are out', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LibraryScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Search by title, author or subject, then narrow by subject or language.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('libSearch')), 'accounting');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(api.calls, contains('searchLibrary accounting '));
    expect(find.text('2 titles'), findsOneWidget);
    expect(find.text('2 of 4 on the shelf'), findsOneWidget);
    expect(find.text('All copies are out'), findsOneWidget);
    // The subject facet narrows the search, and shows as a chip that clears it.
    await tapAndSettle(tester, find.byKey(const Key('libFacet-subject-Accounting')));
    expect(api.calls.last, 'searchLibrary accounting subject=Accounting');
    expect(find.byKey(const Key('libChosen-subject')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('libReserve-b2')));
    expect(api.calls, contains('reserveTitle b2'));
    expect(find.text('In the queue'), findsOneWidget);
  });

  testWidgets('shows my books with the overdue fine, renews one, and cancels a reservation', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LibraryScreen(api: api, initialTab: 1)));
    await tester.pumpAndSettle();
    expect(find.text('Library card MEM-1204'), findsOneWidget);
    expect(find.text('90 days a loan · 10 books at a time'), findsOneWidget);
    expect(find.textContaining('Was due 2026-10-28'), findsOneWidget);
    expect(find.byKey(const Key('libRenew-l2')), findsNothing); // overdue: return it first
    await tapAndSettle(tester, find.byKey(const Key('libRenew-l1')));
    expect(api.calls, contains('renewMyLoan l1'));
    expect(find.text('Due 2027-03-10'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('libCancel-r1')));
    expect(api.calls, contains('cancelMyReservation r1'));
    expect(find.byKey(const Key('libReservation-r1')), findsNothing);
  });

  testWidgets('reads in Kannada', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LibraryScreen(api: api, initialTab: 1), language: 'kn'));
    await tester.pumpAndSettle();
    expect(find.text(strings('kn').libTitle), findsOneWidget);
    expect(find.text(strings('kn').libCardNo('MEM-1204')), findsOneWidget);
  });
}
