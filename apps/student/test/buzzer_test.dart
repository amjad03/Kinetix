import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/buzzer.dart';

import 'helpers.dart';

/// The class buzzer from the Student App: closed until the teacher opens it, one press per
/// round, locked when the teacher locks it; published class notes show on Today.
void main() {
  testWidgets('no buzzer card until the teacher opens the buzzer', (tester) async {
    await pumpApp(tester);
    expect(find.byKey(const Key('buzzer-card')), findsNothing);
  });

  testWidgets('the student buzzes once and sees their place; a locked buzzer cannot be pressed', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (api) => api.buzzerStatus = const BuzzerStatus(active: true, locked: false, roundNo: 1));
    expect(find.byKey(const Key('buzzer-card')), findsOneWidget);
    await tester.tap(find.byKey(const Key('buzzer-press')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('buzz'));
    expect(find.text('You buzzed first!'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('buzzer-press'))).onPressed, isNull);

    // Next question: the teacher resets and then locks.
    api.buzzerStatus = const BuzzerStatus(active: true, locked: true, roundNo: 2);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text('The buzzer is locked'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('buzzer-press'))).onPressed, isNull);
  });

  testWidgets('published class notes show on Today', (tester) async {
    await pumpApp(tester, setup: (api) => api.notes = [const ClassNote(id: 'n1', title: 'Corporate Accounting', teacher: 'Anita Sharma', notes: 'Journal entries')]);
    expect(find.byKey(const Key('class-note-n1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-note-n1')));
    await tester.pumpAndSettle();
    expect(find.text('Journal entries'), findsOneWidget);
  });
}
