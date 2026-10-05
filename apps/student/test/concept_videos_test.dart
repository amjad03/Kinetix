import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/demo/demo_api.dart';
import 'package:kinetix_student/features/learn/concept_videos.dart';

import 'helpers.dart';

void main() {
  tearDown(() => ConceptVideoScreen.surfaceOverride = null);

  Future<void> openTopic(WidgetTester tester) async {
    await openTab(tester, 'Learn');
    await tester.enterText(find.byKey(const Key('question')), 'Explain underwriting commission');
    await tester.pump();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    final list = find.descendant(of: find.byKey(const Key('askList')), matching: find.byType(Scrollable)).first;
    await scrollTo(tester, find.byKey(const Key('source-t1')), scrollable: list);
    await tester.tap(find.byKey(const Key('source-t1')));
    await tester.pumpAndSettle();
  }

  testWidgets("a topic shows its concept videos, and one plays full screen", (tester) async {
    ConceptVideoScreen.surfaceOverride = (v) => ColoredBox(key: Key('surface-${v.youtubeVideoId}'), color: Colors.black);
    final (api, _) = await pumpApp(tester);
    await openTopic(tester);
    expect(api.calls, contains('conceptVideos t1'));
    await scrollTo(tester, find.byKey(const Key('conceptVideos')));
    expect(find.text('Concept videos'), findsOneWidget);
    expect(find.text('Underwriting commission in 5 minutes'), findsOneWidget);
    expect(find.text('4:05 · हिन्दी'), findsOneWidget);

    await tester.tap(find.byKey(const Key('conceptVideo-cv1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('conceptVideoScreen')), findsOneWidget);
    expect(find.byKey(const Key('surface-abcdefghij1')), findsOneWidget);
    await tester.tap(find.byType(CloseButton));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('conceptVideoScreen')), findsNothing);
  });

  testWidgets('a topic without videos shows no video section', (tester) async {
    final (_, _) = await pumpApp(tester, setup: (api) => api.conceptVideoList = {});
    await openTopic(tester);
    expect(find.byKey(const Key('conceptVideos')), findsNothing);
  });

  test("YouTube's privacy-enhanced player, only for real ids; the demo has sample videos", () async {
    final html = playerHtml('abcdefghij1', language: 'hi');
    expect(html, contains('youtube-nocookie.com'));
    expect(html, contains("hl: 'hi'"));
    expect(() => playerHtml('<script>'), throwsArgumentError);
    expect(playerMayNavigate('https://www.youtube.com/watch?v=abcdefghij1', mainFrame: true), isFalse);
    expect(const ConceptVideo(id: 'x', youtubeVideoId: 'abcdefghij1', title: 'x', language: 'en', durationSeconds: 3723).durationLabel, '1:02:03');
    final demo = DemoStudentApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    expect((await demo.conceptVideos('t5')).map((v) => v.language), ['en', 'hi']);
    expect(await demo.conceptVideos('t1'), isEmpty);
  });
}
