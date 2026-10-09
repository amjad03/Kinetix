// Device trust on the Teacher App profile: offer to trust a new phone, and fit a 360dp phone in Kannada.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/features/profile/device_trust_tile.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  setUpAll(loadAppFonts);

  testWidgets('offers to trust a new phone, then shows it as trusted', (tester) async {
    final api = FakeTeacherApi();
    await tester.pumpWidget(localizedApp(home: Scaffold(body: DeviceTrustTile(api: api))));
    await tester.pumpAndSettle();
    expect(find.text('Not trusted yet. Trust it so a sign-in from this phone is not flagged as new.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('deviceTrustButton')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('trustDevice Teacher App'));
    expect(find.text('Trusted'), findsOneWidget);
    expect(find.byKey(const Key('deviceTrustButton')), findsNothing);
  });

  testWidgets('shows nothing when the phone has no install id', (tester) async {
    final api = FakeTeacherApi()..deviceStateValue = 'none';
    await tester.pumpWidget(localizedApp(home: Scaffold(body: DeviceTrustTile(api: api))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deviceTrust')), findsNothing);
  });

  testWidgets('Hindi and Kannada fit a 360dp phone without overflow', (tester) async {
    phone(tester, size: const Size(360, 640), textScale: 1.3);
    for (final lang in ['hi', 'kn']) {
      final s = strings(lang);
      await tester.pumpWidget(localizedApp(home: Scaffold(body: DeviceTrustTile(api: FakeTeacherApi())), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.deviceTrustTitle), findsOneWidget);
      expect(find.text(s.deviceTrustButton), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });
}
