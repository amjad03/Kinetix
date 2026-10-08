import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/fees/fees_screen.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';

import 'helpers.dart';

/// Every tab and the main screens at small phones, large phones and tablets, with large text.
/// A RenderFlex overflow fails the test.
void main() {
  const sizes = {'360x640': Size(360, 640), '430x932': Size(430, 932)};

  Future<void> visitEverything(WidgetTester tester) async {
    // Today, scrolled to the end.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -3000));
    await tester.pumpAndSettle();

    // Learn: ask (preview answer), then the syllabus.
    await openTab(tester, 'Learn');
    await tester.enterText(find.byKey(const Key('question')), 'What is underwriting commission and how is it calculated?');
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    await tester.drag(find.byKey(const Key('askList')), const Offset(0, -3000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('tabSyllabus')));
    await tester.pumpAndSettle();
    // Each subject shows its progress and plan status, so with large text the tile may start off screen.
    await tester.ensureVisible(find.byKey(const Key('subjectTile-sub1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('subjectTile-sub1')));
    await tester.pumpAndSettle();
    // The class's progress sits above the chapters: with large text the topic starts off screen.
    await tester.scrollUntilVisible(find.byKey(const Key('topic-t1')), 200, scrollable: find.byType(Scrollable).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('topic-t1')));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -3000));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Updates.
    await openTab(tester, 'Updates');

    // Profile, fees and a receipt.
    await openTab(tester, 'Profile');
    await scrollTo(
      tester,
      find.byKey(const Key('openFees')),
      scrollable: find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first,
    );
    await tester.tap(find.byKey(const Key('openFees')));
    await tester.pumpAndSettle();
    await scrollTo(
      tester,
      find.byKey(const Key('payment-p1')),
      scrollable: find.descendant(of: find.byType(FeesScreen), matching: find.byType(Scrollable)).first,
    );
    await tester.tap(find.byKey(const Key('payment-p1')));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -2000));
    await tester.pumpAndSettle();
  }

  for (final MapEntry(key: name, value: size) in sizes.entries) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('no overflow at $name, text ×$scale', (tester) async {
        await pumpApp(
          tester,
          size: size,
          textScale: scale,
          setup: (api) => api.answer = Explanation(
            answer: 'Preview answer about underwriting commission.',
            keyPoints: ['Start from what the class already knows', 'Define the key terms'],
            followUps: ['Where is underwriting commission used in real life?', 'Can you show another example?'],
            preview: true,
            sources: [const TopicRef(id: 't1', title: 'Underwriting and underwriting commission')],
          ),
        );
        await visitEverything(tester);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('sign-in fits a small phone with large text', (tester) async {
    await pumpApp(tester, signedIn: false, size: const Size(360, 640), textScale: 2);
    await tester.ensureVisible(find.byKey(const Key('usePassword')));
    await tester.pumpAndSettle();
    await usePassword(tester);
    await tester.ensureVisible(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablets get a navigation rail and centred content', (tester) async {
    await pumpApp(tester, size: const Size(1280, 800));
    expect(find.byKey(const Key('rail')), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    final card = tester.getRect(find.byKey(const Key('nextClassCard')));
    expect(card.width, lessThanOrEqualTo(720));
    // Centred in the space right of the rail.
    final rail = tester.getRect(find.byKey(const Key('rail')));
    final space = (1280 - rail.right);
    expect((card.center.dx - rail.right - space / 2).abs(), lessThan(2));

    await openTab(tester, 'Learn');
    expect(find.byKey(const Key('question')), findsOneWidget);
    await visitTablet(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rotating between bar and rail keeps the tab and its state', (tester) async {
    await pumpApp(tester, size: const Size(800, 1280));
    await openTab(tester, 'Learn');
    await tester.enterText(find.byKey(const Key('question')), 'Half-typed doubt');
    tester.view.physicalSize = const Size(412, 892);
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Half-typed doubt'), findsOneWidget);
  });
}

Future<void> visitTablet(WidgetTester tester) async {
  await openTab(tester, 'Updates');
  await openTab(tester, 'Profile');
}
