import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/exam_room/exam_room.dart';

void main() {
  const view = {
    'room': {'name': 'Hall 1'},
    'sittings': [
      {
        'subject': 'Accounting',
        'session': 'Nov exam',
        'startsAt': '10:00',
        'endsAt': '13:00',
        'seats': [
          {'seatNo': 1, 'rollNo': 'R1'},
          {'seatNo': 2, 'rollNo': 'R2'},
        ],
      },
    ],
    'timetable': [
      {'date': '2026-11-10', 'startsAt': '10:00', 'endsAt': '13:00', 'subject': 'Accounting'},
    ],
    'instructions': ['Take only your own seat.'],
  };

  testWidgets('shows today\'s seat plan, the timetable and the hall rules, read-only', (tester) async {
    await tester.pumpWidget(MaterialApp(home: ExamRoomPanel(load: (_) async => ExamRoomView.fromJson(view))));
    await tester.pumpAndSettle();
    expect(find.text('Exam room: Hall 1'), findsOneWidget);
    expect(find.byKey(const Key('seat-1')), findsOneWidget);
    expect(find.text('Seat 2: R2'), findsOneWidget);
    expect(find.textContaining('Accounting'), findsWidgets);
    expect(find.text('Take only your own seat.'), findsOneWidget);
  });

  testWidgets('says so when no exam is scheduled today', (tester) async {
    await tester.pumpWidget(MaterialApp(home: ExamRoomPanel(load: (_) async => ExamRoomView.fromJson({...view, 'sittings': <Object>[]}))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('examRoomNone')), findsOneWidget);
  });
}
