// Every screen in English, Hindi and Kannada at 360×640 and 412×892, text scale 1.0 and 1.3,
// with the real bundled fonts: no overflow anywhere (an overflow fails the test).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  setUpAll(loadAppFonts);

  const sizes = [Size(360, 640), Size(412, 892)];
  const scales = [1.0, 1.3];

  for (final lang in ['en', 'hi', 'kn']) {
    for (final size in sizes) {
      for (final scale in scales) {
        final name = '$lang ${size.width.toInt()}×${size.height.toInt()} ×$scale';

        testWidgets('$name: signed-in screens fit', (tester) async {
          phone(tester, size: size, textScale: scale);
          final api = FakeTeacherApi();
          seed(api, language: lang);
          await pumpApp(tester, api, prefs: {'token': 'tok'});

          // Today, then connected to a board.
          await tester.drag(find.byType(CustomScrollView).first, const Offset(0, -400));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('takeAttendance-slot1')));
          await tester.longPress(find.text('Bhavya Reddy'));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('status-excused')));
          await tester.tap(find.text('Aarav Patel'));
          await tester.pump();
          await pop(tester);

          await tester.drag(find.byType(CustomScrollView).first, const Offset(0, 400));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('connectBoard')));
          await tester.enterText(find.byKey(const Key('codeField')), '123');
          await tapAndSettle(tester, find.byKey(const Key('connectWithCode')));
          await tester.enterText(find.byKey(const Key('codeField')), '111111');
          await tester.pumpAndSettle();
          await tester.enterText(find.byKey(const Key('codeField')), '482913');
          await tester.pumpAndSettle();
          await clearSnackBars(tester);
          await tapAndSettle(tester, find.byKey(const Key('connectDone')));
          await tapAndSettle(tester, find.byKey(const Key('endClassCard')));
          await tapAndSettle(tester, find.byKey(const Key('confirmEndClass')));

          // A future day and a free day.
          await tester.tap(find.text('7').hitTestable().first);
          await tester.pumpAndSettle();

          // Homework and its form.
          await tapAndSettle(tester, find.byKey(const Key('navHomework')));
          await tapAndSettle(tester, find.byKey(const Key('assignHomeworkFab')));
          await tapAndSettle(tester, find.byKey(const Key('assignHomework')));
          await pop(tester);

          // Marks, the new-assessment form and marks entry with errors, stats and dialogs.
          await tapAndSettle(tester, find.byKey(const Key('navMarks')));
          await tapAndSettle(tester, find.byKey(const Key('newAssessmentFab')));
          await tapAndSettle(tester, find.byKey(const Key('createAssessment')));
          await pop(tester);
          // Out from under the floating button.
          await tester.drag(find.byType(CustomScrollView).hitTestable().first, const Offset(0, -300));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('assessment-a1')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '30');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const ValueKey('remark-s2')));
          await tester.enterText(find.byKey(const Key('remarkField')), 'Neat working');
          await tapAndSettle(tester, find.byKey(const Key('saveRemark')));
          await tapAndSettle(tester, find.byKey(const ValueKey('remark-s2')));
          await tapAndSettle(tester, find.byKey(const Key('saveRemark')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '20');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
          await pop(tester);
          await clearSnackBars(tester);
          await tester.drag(find.byType(CustomScrollView).hitTestable().first, const Offset(0, -300));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('assessment-a2')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '8');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
          await tapAndSettle(tester, find.byKey(const Key('publishMarks')));
          await tapAndSettle(tester, find.byKey(const Key('confirmPublish')));
          await tester.enterText(find.byKey(const ValueKey('marks-s2')), '5');
          await tester.pump();
          await pop(tester);
          await tapAndSettle(tester, find.byKey(const Key('discardChanges')));

          // Messages, a chat with a failed message, and New message.
          await clearSnackBars(tester);
          await tapAndSettle(tester, find.byKey(const Key('navMessages')));
          await tapAndSettle(tester, find.byKey(const Key('conversation-c1')));
          api.sendFails = true;
          await tester.enterText(find.byKey(const Key('messageField')), 'OK');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('sendMessage')));
          await pop(tester);
          await tapAndSettle(tester, find.byKey(const Key('newMessageFab')));
          await tapAndSettle(tester, find.byKey(const Key('contact-s2')));
          await pop(tester); // the guardian sheet
          await tester.enterText(find.byKey(const Key('studentSearch')), 'bhav');
          await tester.pump();
          await tester.enterText(find.byKey(const Key('studentSearch')), 'nobody at all');
          await tester.pump();
          await pop(tester);

          // Recordings and the share dialog.
          await tapAndSettle(tester, find.byKey(const Key('navRecordings')));
          await tapAndSettle(tester, find.byKey(const Key('share-r1')));
          await tapAndSettle(tester, find.byKey(const Key('confirmShare')));
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();

          // Profile, the language picker and the sign-out dialog.
          await clearSnackBars(tester);
          await tapAndSettle(tester, find.byKey(const Key('profileButton')));
          await tapAndSettle(tester, find.byKey(const Key('languageSetting')));
          await pop(tester);
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('signOut')));
          await pop(tester);
        }, variant: TargetPlatformVariant.only(TargetPlatform.linux));

        testWidgets('$name: empty states and sign-in fit', (tester) async {
          phone(tester, size: size, textScale: scale);
          final api = FakeTeacherApi();
          seed(api, language: lang);
          api
            ..periodsByDate = {}
            ..homework = []
            ..recordings = []
            ..threads = [];
          api.assessmentRows.clear();
          await pumpApp(tester, api, prefs: {'token': 'tok'});
          for (final tab in ['navHomework', 'navMarks', 'navMessages', 'navRecordings']) {
            await tapAndSettle(tester, find.byKey(Key(tab)));
          }

          // Signed out: the sign-in screen in the device language, with every error showing.
          tester.platformDispatcher.localesTestValue = [Locale(lang)];
          addTearDown(tester.platformDispatcher.clearLocalesTestValue);
          await pumpApp(tester, FakeTeacherApi(), prefs: {});
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          await tester.enterText(find.byKey(const Key('tenant')), 'demo college');
          await tester.enterText(find.byKey(const Key('login')), '98450');
          await tester.enterText(find.byKey(const Key('password')), 'wrong');
          await tester.ensureVisible(find.byKey(const Key('showServer')));
          await tapAndSettle(tester, find.byKey(const Key('showServer')));
          await tester.enterText(find.byKey(const Key('server')), 'nonsense');
          await tester.ensureVisible(find.byKey(const Key('signIn')));
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
          await tester.enterText(find.byKey(const Key('login')), 'anita@demo.kinetix.in');
          await tester.enterText(find.byKey(const Key('server')), 'http://test');
          await tester.ensureVisible(find.byKey(const Key('signIn')));
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          expect(find.byKey(const Key('signInError')), findsOneWidget);
        });
      }
    }
  }
}
