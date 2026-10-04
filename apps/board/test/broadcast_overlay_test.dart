import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/broadcast/broadcast_overlay.dart';

BroadcastMessage msg(String id, BroadcastPriority p) => BroadcastMessage(
  id: id,
  title: 'Title $id',
  body: 'Body $id',
  priority: p,
  requiresAck: p == BroadcastPriority.emergency,
  senderName: 'Dr. Meera Rao',
  expiresAt: DateTime.now().add(const Duration(hours: 1)),
);

void main() {
  Future<List<(String, bool)>> pump(WidgetTester tester, List<BroadcastMessage> messages, {Set<String> acknowledged = const {}}) async {
    final dismissed = <(String, bool)>[];
    await tester.pumpWidget(
      MaterialApp(
        home: BroadcastOverlay(
          messages: messages,
          acknowledged: acknowledged,
          onDismiss: (m, {required acknowledge}) => dismissed.add((m.id, acknowledge)),
          child: const Scaffold(body: Text('board')),
        ),
      ),
    );
    return dismissed;
  }

  testWidgets('every message layer has a Material ancestor, so text is styled', (tester) async {
    for (final p in BroadcastPriority.values) {
      await pump(tester, [msg(p.name, p)]);
      final text = find.textContaining('Title ${p.name}');
      expect(
        find.ancestor(of: text, matching: find.byType(Material)),
        findsWidgets,
        reason: p.name,
      );
      // The debug fallback style underlines text in yellow.
      final style = DefaultTextStyle.of(tester.element(text)).style;
      expect(style.decoration, isNot(TextDecoration.underline), reason: p.name);
    }
    await tester.pump(const Duration(seconds: 16));
  });

  testWidgets('info banner hides itself after 15 seconds without acknowledging', (tester) async {
    final dismissed = await pump(tester, [msg('a', BroadcastPriority.info)]);
    expect(find.textContaining('Title a'), findsOneWidget);
    await tester.pump(const Duration(seconds: 16));
    expect(dismissed, [('a', false)]);
  });

  testWidgets('important message needs OK and shows the sender', (tester) async {
    final dismissed = await pump(tester, [msg('b', BroadcastPriority.important)]);
    expect(find.text('From Dr. Meera Rao'), findsOneWidget);
    await tester.tap(find.text('OK'));
    expect(dismissed, [('b', true)]);
  });

  testWidgets('emergency takes the whole screen, then shrinks to a strip once acknowledged', (tester) async {
    final dismissed = await pump(tester, [msg('c', BroadcastPriority.emergency)]);
    expect(find.text('Acknowledge'), findsOneWidget);
    await tester.tap(find.text('Acknowledge'));
    expect(dismissed, [('c', true)]);

    await pump(tester, [msg('c', BroadcastPriority.emergency)], acknowledged: {'c'});
    expect(find.text('Acknowledge'), findsNothing);
    expect(find.textContaining('Title c: Body c'), findsOneWidget);
  });
}
