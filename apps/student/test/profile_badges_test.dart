import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_live.dart';
import 'helpers.dart';

final onePixel = Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]);

/// The profile is editable (photo, name, email) and shows the badges teachers awarded.
void main() {
  testWidgets('edits the name and email; the phone is read-only with the reason', (tester) async {
    final (api, state) = await pumpApp(tester);
    await openTab(tester, 'Profile');
    await tester.tap(find.byKey(const Key('editProfile')));
    await tester.pumpAndSettle();
    expect(find.textContaining('only your institution’s office can change it'), findsOneWidget);
    expect(find.byKey(const Key('subjectField')), findsNothing);

    await tester.enterText(find.byKey(const Key('nameField')), 'Aarav S. Patel');
    await tester.enterText(find.byKey(const Key('emailField')), 'aarav.p@demo.kinetix.in');
    await tester.tap(find.byKey(const Key('saveProfile')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('profile Aarav S. Patel aarav.p@demo.kinetix.in'));
    expect(state.me!.fullName, 'Aarav S. Patel');
    expect(find.text('Aarav S. Patel'), findsOneWidget);
  });

  testWidgets('shows the photo once uploaded', (tester) async {
    final (api, state) = await pumpApp(tester);
    state.updateMe(await api.uploadPhoto(onePixel));
    await openTab(tester, 'Profile');
    final avatar = tester.widget<KxAvatar>(find.descendant(of: find.byKey(const Key('profileAvatar')), matching: find.byType(KxAvatar)));
    expect(avatar.image, isA<MemoryImage>());
  });

  testWidgets('badges on the profile, and a toast when one arrives', (tester) async {
    final server = FakeLiveServer();
    final (api, _) = await pumpApp(tester, live: server, setup: (api) => api.addBadge(api.record!.id, 'good_attempt', subject: 'Corporate Accounting'));
    await openTab(tester, 'Profile');
    expect(find.byKey(const Key('shelf-good_attempt')), findsOneWidget);
    expect(find.text('Good Attempt'), findsOneWidget);

    // A teacher awards one on the board: a toast, and the shelf refreshes.
    api.addBadge(api.record!.id, 'young_scientist', teacher: 'Ravi Kumar');
    server.last.send(const LiveBadgeAwarded(badge: 'young_scientist', teacher: 'Ravi Kumar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('New badge: Young Scientist!'), findsOneWidget);
    expect(find.text('From Ravi Kumar'), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 7));
    expect(find.byKey(const Key('shelf-young_scientist')), findsOneWidget);

    await tester.tap(find.byKey(const Key('shelf-good_attempt')));
    await tester.pumpAndSettle();
    expect(find.text('From Ms. Kavya Rao'), findsOneWidget);
  });

  testWidgets('no badges yet, in Hindi', (tester) async {
    await pumpApp(tester, prefs: {'language': 'hi'});
    await openTab(tester, 'प्रोफ़ाइल');
    expect(find.text('अभी कोई बैज नहीं'), findsOneWidget);
  });
}
