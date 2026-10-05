import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/cards/answer_cards_screen.dart';
import 'package:kinetix_teacher/features/remote/remote_link.dart';
import 'package:kinetix_teacher/features/remote/remote_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// A link the server refuses: someone else's board, or the class has ended.
class _RefusedLink extends DemoRemoteLink {
  @override
  Future<String?> attach(String boardId) async => 'Connect to this board from the Teacher App first';
}

void main() {
  final connection = BoardConnection(sessionId: 'sess1', boardName: 'Room 204 Board', boardId: 'board1', sectionName: 'BCom Sem 3 A');

  testWidgets('the phone remote turns pages, starts the timer, points, records and sends a photo', (tester) async {
    phone(tester);
    final link = DemoRemoteLink();
    remoteLinkFor = (_) => link;
    pickRemotePhoto = () async => Uint8List.fromList([0xff, 0xd8, 0xff]);
    await tester.pumpWidget(localizedApp(home: RemoteScreen(api: FakeTeacherApi(), connection: connection)));
    await tester.pumpAndSettle();
    expect(find.text('Remote · Room 204 Board'), findsOneWidget);
    expect(find.text('Page 1 of 3'), findsOneWidget);

    await tester.tap(find.byKey(const Key('remoteNextPage')));
    await tester.pumpAndSettle();
    expect(find.text('Page 2 of 3'), findsOneWidget);
    await tester.tap(find.byKey(const Key('remoteNextSlide')));
    await tester.pumpAndSettle();
    expect(find.text('Slide 2 of 12'), findsOneWidget);

    await tester.tap(find.byKey(const Key('remoteTimer2')));
    await tester.pumpAndSettle();
    expect(link.commands.last, {'type': 'timer.start', 'seconds': 120});
    expect(find.byKey(const Key('remoteTimerStop')), findsOneWidget);

    await tester.drag(find.byKey(const Key('remotePointerPad')), const Offset(60, 20));
    await tester.pumpAndSettle();
    expect(link.commands.where((c) => c['type'] == 'pointer'), isNotEmpty);
    expect(link.commands.last, {'type': 'pointer.hide'});

    await tester.ensureVisible(find.byKey(const Key('remoteRecord')));
    await tester.tap(find.byKey(const Key('remoteRecord')));
    await tester.pumpAndSettle();
    expect(find.text('Stop recording'), findsOneWidget);

    await tester.tap(find.byKey(const Key('remotePhoto')));
    await tester.pumpAndSettle();
    expect(link.photos, 1);
    expect(find.text('Photo is on the board.'), findsOneWidget);
  });

  testWidgets('a board the server will not let this phone drive shows why, with the buttons off', (tester) async {
    phone(tester);
    remoteLinkFor = (_) => _RefusedLink();
    await tester.pumpWidget(localizedApp(home: RemoteScreen(api: FakeTeacherApi(), connection: connection)));
    await tester.pumpAndSettle();
    expect(find.text('Connect to this board from the Teacher App first'), findsOneWidget);
    expect(tester.widget<IconButton>(find.byKey(const Key('remoteNextPage'))).onPressed, isNull);
  });

  testWidgets('answer cards: a printable PDF per class, in the teacher\'s language', (tester) async {
    phone(tester);
    Uint8List? printed;
    String? name;
    shareAnswerCardsPdf = (pdf, filename) async => (printed = pdf, name = filename);
    await tester.pumpWidget(localizedApp(home: AnswerCardsScreen(api: FakeTeacherApi()), language: 'hi'));
    await tester.pumpAndSettle();
    final l = strings('hi');
    expect(find.text(l.answerCards), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text(l.print));
      for (var i = 0; i < 50 && printed == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    });
    await tester.pumpAndSettle();
    expect(String.fromCharCodes(printed!.take(5)), '%PDF-');
    expect(name, startsWith('answer-cards-'));
  });
}
