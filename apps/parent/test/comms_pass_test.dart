import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/core/communication.dart';
import 'package:zynetix_parent/features/calendar/calendar_screen.dart';
import 'package:zynetix_parent/features/privacy/channel_prefs.dart';

import 'package:zynetix_parent/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget localizedApp(Widget home) => MaterialApp(theme: ZynetixTheme.light(), locale: const Locale('en'), supportedLocales: AppLocalizations.supportedLocales, localizationsDelegates: appLocalizationsDelegates, home: home);

/// Communication pass: answering a notice's poll, choosing the channels the school may use, replying to an event,
/// and taking a conversation to the head of department.
void main() {
  testWidgets('answers the poll on a notice and sees how everyone answered', (tester) async {
    final (api, _) = await pumpApp(tester);
    await tester.tap(find.byKey(const Key('navUpdates')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openAnnouncements')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('announcement-an-poll')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('announcement-an-poll')));
    await tester.pumpAndSettle();
    expect(find.text('Will you attend?'), findsOneWidget);
    expect(find.text(en.pollPrompt), findsOneWidget);
    expect(find.text('1 (100%)'), findsNothing); // no results before answering
    await tester.scrollUntilVisible(find.byKey(const Key('pollOption-1')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('pollOption-1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementVote an-poll 1'));
    // One other person said "Yes": Yes 1 (50%), No 1 (50%), Not sure 0 (0%).
    expect(find.text('1 (50%)'), findsNWidgets(2));
    expect(find.text('0 (0%)'), findsOneWidget);
    expect(find.text(en.pollChange), findsOneWidget);
  });

  testWidgets('chooses the channels the school may use, with app notices always on', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(localizedApp(ChannelPrefsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text(en.prefAlwaysOn), findsOneWidget);
    final wa = find.byKey(const Key('pref-whatsapp'));
    expect(tester.widget<SwitchListTile>(wa).value, isFalse);
    await tester.tap(wa);
    await tester.pumpAndSettle();
    expect(api.calls, contains('channelPref whatsapp true'));
    expect(tester.widget<SwitchListTile>(wa).value, isTrue);
    await tester.tap(find.byKey(const Key('pref-sms')));
    await tester.pumpAndSettle();
    expect(api.channelChoices['sms'], isFalse);
  });

  testWidgets('replies to an event that asks for RSVPs and brings a guest', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(localizedApp(CalendarScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Main ground'), findsOneWidget);
    await tester.tap(find.descendant(of: find.byKey(const Key('rsvp-e1')), matching: find.text(en.rsvpGoing)));
    await tester.pumpAndSettle();
    expect(api.calls, contains('rsvp e1 going 0'));
    expect(find.text(en.rsvpSaved), findsOneWidget);
    await tester.tap(find.byKey(const Key('rsvpMore-e1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('rsvp e1 going 1'));
    expect(find.text(en.rsvpGuests(1)), findsOneWidget);
    await tester.tap(find.descendant(of: find.byKey(const Key('rsvp-e1')), matching: find.text(en.rsvpNo)));
    await tester.pumpAndSettle();
    expect(api.rsvps['e1'], ('not_going', 0));
    // Events that do not ask for replies have no buttons.
    expect(find.byKey(const Key('rsvp-e2')), findsNothing);
  });

  testWidgets('takes a teacher conversation to the head of department with the reason', (tester) async {
    final (api, _) = await pumpApp(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('openMessages')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openMessages')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('thread-cv1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chatMenu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chatEscalate')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('escalateReason')), 'No reply about the IA marks');
    await tester.pumpAndSettle(); // Send is enabled once the reason is long enough
    await tester.tap(find.byKey(const Key('escalateSend')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('escalate cv1 No reply about the IA marks'));
    expect(find.text(en.escalateDone), findsOneWidget);
  });

  test('reads the poll, the language and an emergency from the inbox', () {
    final a = Announcement.fromJson({
      'id': 'x',
      'title': 'ಭಾರಿ ಮಳೆ',
      'body': 'b',
      'priority': 'emergency',
      'language': 'kn',
      'sentAt': '2026-11-02T01:10:00Z',
      'pinned': true,
      'poll': {'question': 'q', 'options': ['a', 'b'], 'closed': false, 'myVote': 1, 'results': [{'option': 'a', 'votes': 2, 'pct': 66}, {'option': 'b', 'votes': 1, 'pct': 33}]},
    });
    expect(a.emergency, isTrue);
    expect(a.language, 'kn');
    expect(a.poll!.myVote, 1);
    expect(a.poll!.results!.first.pct, 66);
  });
}
