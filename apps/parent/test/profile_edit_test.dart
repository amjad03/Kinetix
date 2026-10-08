import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'helpers.dart';

/// A parent edits their profile: photo, name and email; the phone number is the sign-in.
void main() {
  Future<void> openProfile(WidgetTester tester) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
  }

  testWidgets('edits the name and clears the email; the phone is read-only', (tester) async {
    final (api, state) = await pumpApp(tester);
    await openProfile(tester);
    await tester.tap(find.byKey(const Key('editProfile')));
    await tester.pumpAndSettle();
    expect(find.textContaining('only your institution’s office can change it'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('nameField')), 'Rajesh K. Patel');
    await tester.enterText(find.byKey(const Key('emailField')), '');
    await tester.tap(find.byKey(const Key('saveProfile')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('profile Rajesh K. Patel -'));
    expect(state.me!.email, isNull);
    expect(find.text('Rajesh K. Patel'), findsOneWidget);
  });

  testWidgets('a failed save is shown and nothing changes', (tester) async {
    final (api, state) = await pumpApp(tester, setup: (api) => api.profileError = ApiException(0, 'offline'));
    await openProfile(tester);
    final before = state.me!.fullName;
    await tester.tap(find.byKey(const Key('editProfile')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('nameField')), 'Someone Else');
    await tester.tap(find.byKey(const Key('saveProfile')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profileError')), findsOneWidget);
    expect(state.me!.fullName, before);
    expect(api.calls.where((c) => c.startsWith('profile ')), hasLength(1));
  });

  testWidgets('shows the photo once uploaded', (tester) async {
    final (api, state) = await pumpApp(tester);
    state.updateMe(await api.uploadPhoto(Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9])));
    await openProfile(tester);
    final avatar = tester.widget<KxAvatar>(find.descendant(of: find.byKey(const Key('profileAvatar')), matching: find.byType(KxAvatar)));
    expect(avatar.image, isA<MemoryImage>());
  });
}
