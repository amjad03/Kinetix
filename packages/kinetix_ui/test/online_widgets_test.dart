import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: child),
);

void main() {
  testWidgets('the sign-in button waits for an institution, speaks the language and reports a failed sign-in', (tester) async {
    String? got;
    await tester.pumpWidget(_app(SsoSignInButton(server: 'http://127.0.0.1:9', tenant: () => '', open: (_) async => true, onToken: (t) async => got = t)));
    await tester.tap(find.byKey(const Key('ssoSignIn')));
    await tester.pump();
    expect(find.byKey(const Key('ssoFailed')), findsNothing);
    await tester.pumpWidget(_app(SsoSignInButton(server: 'http://127.0.0.1:9', tenant: () => 'soundarya', open: (_) async => true, onToken: (t) async => got = t), locale: const Locale('kn')));
    expect(find.text('ಸಂಸ್ಥೆಯ ಖಾತೆಯಿಂದ ಸೈನ್-ಇನ್ ಮಾಡಿ'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('ssoSignIn')));
      await Future<void>.delayed(const Duration(seconds: 1));
    });
    await tester.pump();
    expect(find.byKey(const Key('ssoFailed')), findsOneWidget);
    expect(got, isNull);
  });

  testWidgets('the section shows the loaded classes and hides itself when loading fails', (tester) async {
    final c = OnlineClass(id: 'a', topic: 'Revision', provider: 'zoom', startsAt: DateTime(2026, 10, 12, 18), durationMin: 30, joinUrl: 'https://zoom.us/j/1');
    await tester.pumpWidget(_app(OnlineClassesSection(load: () async => [c], onJoin: (_) {})));
    await tester.pump();
    expect(find.text('Revision'), findsOneWidget);
    await tester.pumpWidget(_app(OnlineClassesSection(key: UniqueKey(), load: () async => throw StateError('offline'), onJoin: (_) {})));
    await tester.pump();
    expect(find.byKey(const Key('onlineClassesCard')), findsNothing);
  });
}
