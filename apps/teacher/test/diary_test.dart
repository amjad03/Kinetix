// The teaching diary written from today's period card, and substitutions shown on the card.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/api.dart';
import 'package:zynetix_teacher/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() {
    api = FakeTeacherApi()..today = '2026-10-05';
    api.periodsByDate = {
      '2026-10-05': [
        api.period(isNow: true),
        Period(
          slotId: 'slot2',
          startsAt: ClockTime.parse('14:00:00'),
          endsAt: ClockTime.parse('15:40:00'),
          section: const Ref('sec2', 'BCom Sem 5 B'),
          subject: const Ref('sub2', 'Tally lab', 'BCOM-5.L'),
          substituteFor: 'Prof. Anil Shetty',
          batch: 'B1',
        ),
      ],
    };
  });

  Future<void> start(WidgetTester tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
  }

  testWidgets('a period covered for a colleague says so, with its batch', (tester) async {
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('coveringFor-slot2')));
    expect(find.text('Covering for Prof. Anil Shetty'), findsOneWidget);
    expect(find.textContaining('Batch B1'), findsOneWidget);
  });

  testWidgets('writes the diary: the plan\'s topics ticked, one more taught, saved and marked on the card', (tester) async {
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('diary-slot1')));
    // Only the period that has begun can be written (the lab is later today).
    expect(find.byTooltip('Write diary'), findsOneWidget);
    expect(find.byKey(const Key('diary-slot2')), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('diary-slot1')));
    expect(find.text('Teaching diary'), findsOneWidget);
    expect(api.calls, contains('periodPlan slot1 2026-10-05'));
    await tapAndSettle(tester, find.byKey(const Key('diaryTopic-t1')));
    await tester.enterText(find.byKey(const Key('diarySummary')), 'Worked example on super profit');
    await tester.ensureVisible(find.byKey(const Key('diarySave')));
    await tapAndSettle(tester, find.byKey(const Key('diarySave')));
    expect(api.calls, contains('writeDiary slot1 2026-10-05'));
    final body = api.diary['slot1|2026-10-05']!;
    expect(body['summary'], 'Worked example on super profit');
    expect((body['topicIds'] as List), contains('t1'));
    await tester.ensureVisible(find.byKey(const Key('diary-slot1')));
    expect(find.byTooltip('Diary written'), findsOneWidget);
  });

  testWidgets('asks for something taught, and shows the server\'s refusal', (tester) async {
    api.syllabusOutline = null;
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('diary-slot1')));
    await tapAndSettle(tester, find.byKey(const Key('diary-slot1')));
    expect(find.byKey(const Key('diaryNoSyllabus')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('diarySave')));
    await tapAndSettle(tester, find.byKey(const Key('diarySave')));
    expect(find.text('Pick the topics taught or write what was done.'), findsOneWidget);
    api.diaryError = ApiException(400, 'Say why the period fell behind its lesson plan');
    await tester.enterText(find.byKey(const Key('diarySummary')), 'Ledger entries');
    await tapAndSettle(tester, find.byKey(const Key('diarySave')));
    expect(find.text('Say why the period fell behind its lesson plan'), findsOneWidget);
    expect(find.text('Teaching diary'), findsOneWidget);
  });
}
