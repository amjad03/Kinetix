import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/features/privacy/channel_prefs.dart';
import 'package:zynetix_student/l10n/app_localizations.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

final _en = lookupAppLocalizations(const Locale('en'));

/// Communication pass in the Student App: a notice's poll and the channels the college may use.
void main() {
  testWidgets('answers the poll on a notice and sees the results', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openTab(tester, 'Updates');
    await tester.tap(find.byKey(const Key('openAnnouncements')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('announcement-an-poll')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('announcement-an-poll')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('pollOption-0')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('pollOption-0')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementVote an-poll 0'));
    // Two people said "Yes" now: Yes 2 (100%).
    expect(find.text('2 (100%)'), findsOneWidget);
  });

  testWidgets('switches email off and WhatsApp on', (tester) async {
    final api = FakeStudentApi();
    await tester.pumpWidget(MaterialApp(theme: ZynetixTheme.light(), locale: const Locale('en'), supportedLocales: AppLocalizations.supportedLocales, localizationsDelegates: appLocalizationsDelegates, home: ChannelPrefsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text(_en.prefTitle), findsOneWidget);
    await tester.tap(find.byKey(const Key('pref-email')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pref-whatsapp')));
    await tester.pumpAndSettle();
    expect(api.channelChoices, {'sms': true, 'whatsapp': true, 'email': false, 'push': true});
  });
}
