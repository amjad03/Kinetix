import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/home/home_tab.dart';
import 'package:kinetix_parent/features/messages/messages_tab.dart';
import 'package:kinetix_parent/features/profile/profile_tab.dart';
import 'package:kinetix_parent/widgets/common.dart';

import 'helpers.dart';

/// The app in English, Hindi and Kannada: every main screen at a small and a large phone with
/// normal and larger text (a RenderFlex overflow fails the test), the Language setting, and the
/// language before sign-in.
void main() {
  /// Taps a bottom-bar destination by its icon (labels change with the language).
  Future<void> openTab(WidgetTester tester, IconData icon) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.byIcon(icon)));
    await tester.pumpAndSettle();
  }

  /// [WidgetTester.pageBack] finds the back button by its English tooltip.
  Future<void> back(WidgetTester tester) async {
    await tester.tap(find.byType(BackButton).last);
    await tester.pumpAndSettle();
  }

  Finder home() => find.descendant(of: find.byType(HomeTab), matching: find.byType(Scrollable)).first;

  Future<void> show(WidgetTester tester, Finder f) async {
    await tester.scrollUntilVisible(f, 300, scrollable: home());
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
  }

  Future<void> openCardLink(WidgetTester tester, String card) async {
    final link = find.descendant(of: find.byKey(Key(card)), matching: find.byType(CardLink));
    await show(tester, link);
    await tester.tap(link);
    await tester.pumpAndSettle();
  }

  Future<void> tapShown(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> scrollDown(WidgetTester tester) async {
    // The page's own list (a SelectableText inside it has a Scrollable too).
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -3000));
    await tester.pumpAndSettle();
  }

  /// Home, attendance, homework, results, fees (pay sheet and receipt), library, a recording, a
  /// board, messages, updates and profile.
  Future<void> visitEverything(WidgetTester tester) async {
    for (var i = 0; i < 12; i++) {
      await tester.drag(home(), const Offset(0, -400));
      await tester.pumpAndSettle();
    }
    await tester.drag(home(), const Offset(0, 20000));
    await tester.pumpAndSettle();

    await openCardLink(tester, 'attendanceCard');
    await scrollDown(tester);
    await back(tester);

    await show(tester, find.byType(HomeworkRow).first);
    await tester.tap(find.byType(HomeworkRow).first);
    await tester.pumpAndSettle();
    await back(tester);

    await show(tester, find.byKey(const Key('assessment-a1')));
    await tester.tap(find.byKey(const Key('assessment-a1')));
    await tester.pumpAndSettle();
    await scrollDown(tester);
    await back(tester);
    await openCardLink(tester, 'resultsCard');
    await scrollDown(tester);
    await back(tester);

    await show(tester, find.byKey(const Key('feesView')));
    await tester.tap(find.byKey(const Key('feesView')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('pay-i1')), 300, scrollable: find.byType(Scrollable).first);
    await tapShown(tester, find.byKey(const Key('pay-i1')));
    await tapShown(tester, find.byKey(const Key('payPart')));
    await tapShown(tester, find.byKey(const Key('payContinue')));
    Navigator.of(tester.element(find.byKey(const Key('amountField')))).pop();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('payment-p1')), 300, scrollable: find.byType(Scrollable).first);
    await tapShown(tester, find.byKey(const Key('payment-p1')));
    await scrollDown(tester);
    await back(tester);
    await back(tester);

    await openCardLink(tester, 'libraryCard');
    await scrollDown(tester);
    await back(tester);

    await show(tester, find.byKey(const Key('recording-r1')));
    await tester.tap(find.byKey(const Key('recording-r1')));
    await tester.pumpAndSettle();
    await back(tester);

    final board = find.byKey(const Key('board-wb1'));
    await show(tester, board);
    await tester.tap(board);
    await tester.pumpAndSettle();
    await back(tester);

    await openTab(tester, Icons.forum_outlined);
    await tester.tap(find.byKey(const Key('thread-cv1')));
    await tester.pumpAndSettle();
    await back(tester);
    await tester.tap(find.byKey(const Key('newMessage')));
    await tester.pumpAndSettle();
    await back(tester);
    expect(find.byType(MessagesTab), findsOneWidget);

    await openTab(tester, Icons.notifications_outlined);
    await scrollDown(tester);

    await openTab(tester, Icons.person_outline);
    final profile = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const Key('languageSetting')), 300, scrollable: profile);
    await tapShown(tester, find.byKey(const Key('languageSetting')));
    Navigator.of(tester.element(find.byType(SimpleDialog))).pop();
    await tester.pumpAndSettle();
    await tester.drag(profile, const Offset(0, -3000));
    await tester.pumpAndSettle();
  }

  const sizes = {'360x640': Size(360, 640), '430x932': Size(430, 932)};
  // Words from the bottom bar and the Home attendance card in each language.
  const words = {
    'en': ['Home', 'Messages', 'Attendance'],
    'hi': ['होम', 'संदेश', 'उपस्थिति'],
    'kn': ['ಮುಖಪುಟ', 'ಸಂದೇಶಗಳು', 'ಹಾಜರಾತಿ'],
  };

  for (final lang in ['en', 'hi', 'kn']) {
    for (final MapEntry(key: name, value: size) in sizes.entries) {
      for (final scale in [1.0, 1.3]) {
        testWidgets('$lang at $name, text ×$scale: every main screen lays out', (tester) async {
          await pumpApp(tester, size: size, textScale: scale, prefs: {'language': lang});
          for (final w in words[lang]!) {
            expect(find.text(w), findsWidgets, reason: w);
          }
          await visitEverything(tester);
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('$lang: sign-in fits a 360-px phone at 2× text', (tester) async {
      await pumpApp(tester, signedIn: false, size: const Size(360, 640), textScale: 2, prefs: {'language': lang});
      await tester.ensureVisible(find.byKey(const Key('signIn')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('signIn')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  group('Hindi and Kannada content', () {
    testWidgets('Hindi: dates, money and plurals read naturally with Western digits', (tester) async {
      await pumpApp(tester, prefs: {'language': 'hi'});
      final card = find.byKey(const Key('attendanceCard'));
      expect(find.descendant(of: card, matching: find.text('30 कक्षाओं में से 24 में उपस्थित')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('पिछले 30 दिन')), findsOneWidget);
      await tester.scrollUntilVisible(find.text('कल जमा करना है'), 300, scrollable: home());
      expect(find.text('कल जमा करना है'), findsOneWidget);
      // Fees in Indian grouping, digits Western.
      await tester.scrollUntilVisible(find.byKey(const Key('feesDue')), 300, scrollable: home());
      expect(tester.widget<Text>(find.byKey(const Key('feesDue'))).data, matches(RegExp(r'^₹[0-9,]+$')));
      expect(find.textContaining(RegExp('[०-९]')), findsNothing);
    });

    testWidgets('Kannada: the overdue book shows the fine so far', (tester) async {
      await pumpApp(tester, prefs: {'language': 'kn', 'selected_child': 'c2'});
      await tester.scrollUntilVisible(find.byKey(const Key('libraryCard')), 300, scrollable: home());
      expect(find.text('4 ದಿನ ತಡವಾಗಿದೆ'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('fineSoFar-l3'))).data, 'ಇಲ್ಲಿಯವರೆಗೆ ₹8 ದಂಡ');
      expect(find.textContaining(RegExp('[೦-೯]')), findsNothing);
    });

    testWidgets('server content (names, titles, notification text) is shown as sent', (tester) async {
      await pumpApp(tester, prefs: {'language': 'kn'});
      expect(find.text('Aarav Patel'), findsOneWidget);
      expect(find.text('BCom Sem 3 A'), findsOneWidget);
      await openTab(tester, Icons.notifications_outlined);
      expect(find.text('ಸೂಚನೆಗಳು'), findsWidgets);
    });
  });

  group('language setting', () {
    testWidgets('defaults to the account language from GET /v1/me', (tester) async {
      final (api, state) = await pumpApp(
        tester,
        setup: (api) => api.profile = Me(
          id: 'u1',
          fullName: 'Rajesh Patel',
          roles: ['guardian'],
          preferredLanguage: 'kn',
          institution: 'Demo College',
          email: 'parent@demo.kinetix.in',
          phone: '+919800000001',
        ),
      );
      expect(state.chosenLanguage, isNull);
      expect(find.text('ಮುಖಪುಟ'), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('language')), isEmpty);
    });

    testWidgets('picking हिन्दी in Profile translates the app, remembers it and tells the server', (tester) async {
      final (api, state) = await pumpApp(tester);
      await openTab(tester, Icons.person_outline);
      final profile = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.byKey(const Key('languageSetting')), 300, scrollable: profile);
      expect(find.descendant(of: find.byKey(const Key('languageSetting')), matching: find.text('English')), findsOneWidget);
      await tester.tap(find.byKey(const Key('languageSetting')));
      await tester.pumpAndSettle();
      expect(find.text('English'), findsWidgets);
      expect(find.text('ಕನ್ನಡ'), findsOneWidget);
      await tester.tap(find.byKey(const Key('language-hi')));
      await tester.pumpAndSettle();

      expect(find.text('होम'), findsOneWidget);
      expect(find.text('प्रोफ़ाइल'), findsWidgets);
      expect(find.descendant(of: find.byKey(const Key('languageSetting')), matching: find.text('हिन्दी')), findsOneWidget);
      expect(state.prefs.getString('language'), 'hi');
      expect(api.calls, contains('language hi'));
      expect(state.prefs.getBool('language_unsynced'), isNull);
      expect(api.profile.preferredLanguage, 'hi');

      // Kept across a restart, even though the account said English before.
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, prefs: {'language': 'hi'});
      expect(find.text('होम'), findsOneWidget);
    });

    testWidgets('a save that fails offline is retried quietly on the next start', (tester) async {
      final (api, state) = await pumpApp(tester, setup: (api) => api.failLanguage = true);
      await openTab(tester, Icons.person_outline);
      final profile = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.byKey(const Key('languageSetting')), 300, scrollable: profile);
      await tester.tap(find.byKey(const Key('languageSetting')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('language-kn')));
      await tester.pumpAndSettle();
      expect(find.text('ಮುಖಪುಟ'), findsOneWidget);
      expect(api.calls, contains('language kn'));
      expect(state.prefs.getBool('language_unsynced'), isTrue);
      expect(find.byType(ErrorBanner), findsNothing);

      await tester.pumpWidget(const SizedBox());
      final (api2, state2) = await pumpApp(tester, prefs: {'language': 'kn', 'language_unsynced': true});
      expect(api2.calls, contains('language kn'));
      expect(state2.prefs.getBool('language_unsynced'), isNull);
    });

    testWidgets('before sign-in the app follows the device when it is Hindi or Kannada', (tester) async {
      tester.platformDispatcher.localesTestValue = const [Locale('kn', 'IN'), Locale('en', 'IN')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      await pumpApp(tester, signedIn: false);
      expect(find.text('ಸೈನ್ ಇನ್'), findsWidgets);
      expect(find.text('ಸಂಸ್ಥೆಯ ಕೋಡ್'), findsOneWidget);

      tester.platformDispatcher.localesTestValue = const [Locale('ta', 'IN'), Locale('hi', 'IN')];
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, signedIn: false);
      expect(find.text('साइन इन'), findsWidgets);

      tester.platformDispatcher.localesTestValue = const [Locale('fr')];
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, signedIn: false);
      expect(find.text('Sign in'), findsWidgets);
    });

    testWidgets('the lesson player follows the app language', (tester) async {
      await pumpApp(tester, prefs: {'language': 'hi'});
      await show(tester, find.byKey(const Key('recording-r1')));
      await tester.tap(find.byKey(const Key('recording-r1')));
      await tester.pumpAndSettle();
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(tester.widget<IconButton>(find.byKey(const Key('lessonPlay'))).tooltip, 'चलाएँ');
    });
  });
}
