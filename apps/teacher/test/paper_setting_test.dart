import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/demo/fake_api.dart';
import 'package:zynetix_teacher/features/work/paper_setting_screen.dart';
import 'package:zynetix_teacher/l10n/app_localizations.dart';

Widget _app(FakeTeacherApi api, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: PaperSettingScreen(api: api),
);

void main() {
  testWidgets('a teacher declines a paper setting appointment with a reason and withdraws an unlock request', (tester) async {
    final api = FakeTeacherApi();
    await tester.pumpWidget(_app(api));
    await tester.pumpAndSettle();
    expect(find.text('BCM-303 Company Law'), findsOneWidget);
    expect(find.byKey(const Key('toModerate-qp2')), findsOneWidget);
    await tester.tap(find.byKey(const Key('decline-qp1')));
    await tester.pumpAndSettle();
    // A decline needs a reason of a few words.
    expect(tester.widget<FilledButton>(find.byKey(const Key('reasonSend'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('reason')), 'On university duty that week');
    await tester.pump();
    await tester.tap(find.byKey(const Key('reasonSend')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('respondQp qp1 false On university duty that week'));
    expect(find.text('BCM-303 Company Law'), findsNothing);
    await tester.tap(find.byKey(const Key('withdraw-ur1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('cancelUnlock ur1'));
    expect(find.byKey(const Key('noUnlocks')), findsOneWidget);
  });

  testWidgets('accepts an appointment, in Hindi', (tester) async {
    final api = FakeTeacherApi();
    await tester.pumpWidget(_app(api, locale: const Locale('hi')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('accept-qp1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('respondQp qp1 true'));
    expect(find.text('नियुक्ति स्वीकार की'), findsOneWidget);
  });
}
