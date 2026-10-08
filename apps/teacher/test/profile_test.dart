// Profile editing and photo, the class-and-subject picker, and awarding badges from the roster.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/homework/homework_form.dart';
import 'package:kinetix_teacher/features/roster/roster_screen.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  testWidgets('edits the name, email and subjects; the phone stays read-only', (tester) async {
    phone(tester);
    final state = await pumpApp(tester, api, prefs: {'token': 'tok'});
    await openProfile(tester);
    await tapAndSettle(tester, find.byKey(const Key('editProfile')));
    expect(find.byType(KxProfileEditScreen), findsOneWidget);
    expect(find.textContaining('only your institution’s office can change it'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('nameField')), 'Anita R. Sharma');
    await tester.enterText(find.byKey(const Key('subjectField')), 'Accountancy');
    await tapAndSettle(tester, find.byKey(const Key('addSubject')));
    await tapAndSettle(tester, find.byKey(const Key('saveProfile')));
    expect(api.calls, contains('profile Anita R. Sharma anita@demo.kinetix.in Accountancy'));
    expect(state.me!.fullName, 'Anita R. Sharma');
    expect(find.text('Anita R. Sharma'), findsOneWidget);
    expect(find.text('Accountancy'), findsOneWidget);
  });

  testWidgets('shows the photo once uploaded, in the profile and the app bar', (tester) async {
    phone(tester);
    final state = await pumpApp(tester, api, prefs: {'token': 'tok'});
    state.updateMe(await api.uploadPhoto(onePixelPng));
    await tester.pumpAndSettle();
    final avatar = tester.widget<KxAvatar>(find.descendant(of: find.byKey(const Key('profileButton')), matching: find.byType(KxAvatar)));
    expect(avatar.image, isA<MemoryImage>());
    await openProfile(tester);
    final big = tester.widget<KxAvatar>(find.descendant(of: find.byKey(const Key('profileAvatar')), matching: find.byType(KxAvatar)));
    expect(big.image, isA<MemoryImage>());
  });

  testWidgets('homework: one picker for class and subject, grouped by class', (tester) async {
    phone(tester);
    const sec2 = Ref('sec2', 'BCom Sem 5 B');
    const cost = Ref('sub2', 'Cost Accounting');
    api.teacherClasses = [TeacherClass(api.section, api.subject), TeacherClass(api.section, cost), TeacherClass(sec2, cost)];
    await tester.pumpWidget(localizedApp(home: HomeworkForm(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('BCom Sem 3 A · Corporate Accounting'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('classSubjectField')));
    expect(find.text('BCom Sem 5 B'), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const ValueKey('kxPickerItem-BCom Sem 5 B · Cost Accounting')));
    expect(find.text('BCom Sem 5 B · Cost Accounting'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('titleField')), 'Exercise 3');
    await tapAndSettle(tester, find.byKey(const Key('assignHomework')));
    expect(api.calls, contains('createHomework sec2 sub2 Exercise 3'));
  });

  testWidgets('awards a badge from the class roster', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: RosterScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Aarav Patel'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const ValueKey('award-s2')));
    expect(find.text('Award a badge to Ananya Gowda'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('badge-master_of_maths')));
    expect(api.calls, contains('badge s2 sec1 master_of_maths'));
    expect(find.text('Master of Maths awarded to Ananya Gowda'), findsOneWidget);
  });

  testWidgets('awarding in Kannada', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: RosterScreen(api: api), language: 'kn'));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const ValueKey('award-s1')));
    expect(find.text('ಗಣಿತ ಪರಿಣತ'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('badge-best_leader')));
    expect(find.text('Aarav Patel ಅವರಿಗೆ “ಅತ್ಯುತ್ತಮ ನಾಯಕ” ಬ್ಯಾಡ್ಜ್ ನೀಡಲಾಗಿದೆ'), findsOneWidget);
  });
}
