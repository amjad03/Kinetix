// Diary, parent-teacher meetings, early years, health, outcome passport, surveys and campus events.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/core/school_life.dart';
import 'package:kinetix_parent/features/school_life/school_life_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {String lang = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(lang),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).last);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  late FakeParentApi api;
  final opened = <String>[];
  final aarav = Child(id: 'c1', fullName: 'Aarav Patel', rollNo: '12', sectionId: 's1', sectionName: 'BCom Sem 3 A');

  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add('$name ${String.fromCharCodes(bytes.take(5))}');
    return true;
  }

  Future<void> openHub(WidgetTester tester, String tile) async {
    tester.view.physicalSize = const Size(412, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(SchoolLifeScreen(api: api, child: aarav, openFile: fakeOpen)));
    await tester.pumpAndSettle();
    await tapKey(tester, tile);
  }

  setUp(() {
    api = FakeParentApi();
    opened.clear();
  });

  test('parses the server shapes', () {
    final e = DiaryEntry.fromJson(api.diaryJson.first);
    expect((e.acknowledged, e.subject), (false, 'Mathematics'));
    expect(HealthRecord.fromJson({'profile': null, 'visits': [], 'vaccinations': []}).profile, isNull);
    expect(CampusEvent.fromJson(api.campusEventJson.last).registered, isTrue);
    expect(SurveyAnswer('q', rating: 4).toJson(), {'questionId': 'q', 'rating': 4});
  });

  testWidgets('the hub lists every part of school life', (tester) async {
    await openHub(tester, 'lifeDiary');
    await tester.pageBack();
    await tester.pumpAndSettle();
    for (final k in ['lifeDiary', 'lifePtm', 'lifeEarly', 'lifeHealth', 'lifePassport', 'lifeSurveys', 'lifePasses', 'lifeEvents']) {
      expect(find.byKey(Key(k)), findsOneWidget);
    }
  });

  group('diary', () {
    testWidgets('lists entries and acknowledges one', (tester) async {
      await openHub(tester, 'lifeDiary');
      expect(api.calls, contains('diary c1'));
      expect(find.text('Fractions: adding unlike denominators'), findsOneWidget);
      expect(find.text('1 entry to acknowledge'), findsOneWidget);
      expect(find.byKey(const Key('ack-de2')), findsNothing);
      await tester.tap(find.byKey(const Key('ack-de1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('acknowledgeDiary c1 de1'));
      expect(find.text('Marked as read'), findsOneWidget);
      expect(find.byKey(const Key('ack-de1')), findsNothing);
      expect(find.byKey(const Key('diaryUnread')), findsNothing);
    });

    testWidgets('shows the error with Retry', (tester) async {
      api.diaryError = ApiException(500, 'Server error');
      await openHub(tester, 'lifeDiary');
      expect(find.text('Retry'), findsOneWidget);
      api.diaryError = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Classwork'), findsWidgets);
    });
  });

  group('parent-teacher meetings', () {
    testWidgets('shows meetings and my bookings, books a free slot', (tester) async {
      await openHub(tester, 'lifePtm');
      expect(find.text('Your bookings'), findsOneWidget);
      expect(find.byKey(const Key('booking-sl3')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ptm-pm1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ptmSlots pm1 c1'));
      expect(find.text('Your booking'), findsOneWidget);
      await tester.tap(find.byKey(const Key('book-sl1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ptmBook sl1 c1'));
      expect(find.text('Meeting booked'), findsOneWidget);
      expect(find.byKey(const Key('cancel-sl1')), findsOneWidget);
    });

    testWidgets('cancels a booking after asking', (tester) async {
      await openHub(tester, 'lifePtm');
      await tester.tap(find.byKey(const Key('ptm-pm1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('cancel-sl3')));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('ptmCancel')), isEmpty);
      await tester.tap(find.byKey(const Key('ptmCancelConfirm')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ptmCancel sl3'));
      expect(find.text('Booking cancelled'), findsOneWidget);
    });

    testWidgets('moves a booking to another slot of the same teacher', (tester) async {
      api.ptmSlotJson[0]
        ..['mine'] = true
        ..['student'] = 'Aarav Patel';
      await openHub(tester, 'lifePtm');
      await tester.tap(find.byKey(const Key('ptm-pm1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('move-sl1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('moveTo-sl2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ptmReschedule sl1 sl2'));
      expect(find.text('Meeting moved'), findsOneWidget);
    });

    testWidgets('a taken slot says so', (tester) async {
      api.ptmBookError = ApiException(409, 'This slot has just been booked. Choose another.');
      await openHub(tester, 'lifePtm');
      await tester.tap(find.byKey(const Key('ptm-pm1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('book-sl1')));
      await tester.pumpAndSettle();
      expect(find.text('This slot has just been booked. Choose another.'), findsOneWidget);
    });
  });

  group('early years', () {
    testWidgets('milestones with status and observations with a photo slot', (tester) async {
      await openHub(tester, 'lifeEarly');
      expect(api.calls, contains('earlyYears c1'));
      expect(find.text('Climbs and jumps with balance'), findsOneWidget);
      expect(find.text('Achieved'), findsOneWidget);
      expect(find.text('Developing'), findsOneWidget);
      expect(find.text('Painted a rainbow and named every colour'), findsOneWidget);
      expect(find.byKey(const Key('photo-o1')), findsOneWidget);
      expect(find.byKey(const Key('photo-o2')), findsNothing);
    });

    testWidgets('downloads the learning story for the chosen term', (tester) async {
      await openHub(tester, 'lifeEarly');
      await tester.tap(find.byKey(const Key('learningStory')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('term-tm2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('learningStory c1 tm2'));
      expect(opened, ['learning-story-Term 2.pdf %PDF-']);
    });
  });

  testWidgets('health shows the profile, visits and vaccinations, with no way to edit', (tester) async {
    await openHub(tester, 'lifeHealth');
    expect(api.calls, contains('health c1'));
    expect(find.text('B+'), findsOneWidget);
    expect(find.text('Peanuts'), findsOneWidget);
    expect(find.text('Headache'), findsOneWidget);
    expect(find.text('Sent home'), findsOneWidget);
    expect(find.textContaining('Typhoid'), findsOneWidget);
    expect(find.textContaining('Next due'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('the outcome passport shows skills, certificates and downloads the PDF', (tester) async {
    await openHub(tester, 'lifePassport');
    expect(api.calls, contains('passport c1'));
    expect(find.text('Verified by the school'), findsOneWidget);
    expect(find.text('Communication'), findsOneWidget);
    expect(find.text('Level 4'), findsOneWidget);
    expect(find.text('Not enough evidence yet'), findsOneWidget);
    expect(find.text('Debate winner'), findsOneWidget);
    expect(find.text('Debating club and Annual fest'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passportPdf')));
    await tester.pumpAndSettle();
    expect(opened, ['outcome-passport.pdf %PDF-']);
  });

  group('surveys', () {
    testWidgets('needs the required answers, then submits them', (tester) async {
      await openHub(tester, 'lifeSurveys');
      expect(find.text('Answered'), findsOneWidget);
      await tester.tap(find.byKey(const Key('answer-sv1')));
      await tester.pumpAndSettle();
      expect(find.text('Your answers are anonymous.'), findsOneWidget);
      await tapKey(tester, 'submitSurvey');
      expect(find.text('Please answer every question marked with a star.'), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('answerSurvey')), isEmpty);

      await tester.tap(find.byKey(const Key('star-q1-4')));
      await tester.tap(find.byKey(const Key('opt-q2-Bus')));
      await tester.enterText(find.byKey(const Key('text-q3')), 'More buses');
      await tapKey(tester, 'submitSurvey');
      expect(api.calls, contains('answerSurvey sv1 3'));
      final sent = api.surveyAnswers.single;
      expect((sent[0].rating, sent[2].text), (4, 'More buses'));
      expect(sent[1].choices, ['Bus']);
      expect(find.byKey(const Key('answer-sv1')), findsNothing);
      expect(find.text('Answered'), findsNWidgets(2));
    });

    testWidgets('an optional question may be left blank', (tester) async {
      await openHub(tester, 'lifeSurveys');
      await tester.tap(find.byKey(const Key('answer-sv1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('star-q1-5')));
      await tester.tap(find.byKey(const Key('opt-q2-Car')));
      await tapKey(tester, 'submitSurvey');
      expect(api.calls, contains('answerSurvey sv1 2'));
    });
  });

  group('event passes', () {
    testWidgets('shows the QR code to show at the door and sends feedback after check-in', (tester) async {
      await openHub(tester, 'lifePasses');
      expect(api.calls, contains('eventPasses c1'));
      expect(find.byKey(const Key('qr-p1')), findsOneWidget);
      expect(find.text('abc12345'), findsOneWidget);
      // The checked-in pass has no QR, only feedback.
      expect(find.byKey(const Key('qr-p2')), findsNothing);
      await tester.tap(find.byKey(const Key('feedback-p2')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('star-4')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('sendFeedback')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('eventFeedback ev0 c1 4 '));
      expect(find.text('Feedback sent'), findsOneWidget);
    });
  });

  group('campus events', () {
    testWidgets('registers for an event with seats and cancels another registration', (tester) async {
      await openHub(tester, 'lifeEvents');
      expect(api.calls, contains('campusEvents c1'));
      expect(find.text('40 seats left'), findsOneWidget);
      expect(find.text('Fee ₹50 · Full'), findsOneWidget);
      await tester.tap(find.byKey(const Key('register-ev1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('registerForEvent ev1 c1'));
      expect(find.text('Registered for the event'), findsOneWidget);
      expect(find.byKey(const Key('unregister-ev1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('unregister-ev2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('cancelEventRegistration ev2 c1'));
      // The full event now offers the waitlist.
      expect(find.text('Join the waitlist'), findsOneWidget);
    });
  });

  testWidgets('the screens read in Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      tester.view.physicalSize = const Size(412, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(SchoolLifeScreen(api: api, child: aarav), lang: lang));
      await tester.pumpAndSettle();
      await tapKey(tester, 'lifeDiary');
      expect(find.textContaining('Classwork'), findsNothing);
      expect(tester.takeException(), isNull);
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      await tapKey(tester, 'lifeEvents');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
  });
}
