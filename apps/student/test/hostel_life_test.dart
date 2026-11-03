// Hostel life for a resident: the gate QR with the in/out state and recent moves, raising a room complaint, the
// week's mess menu (today first) and the anti-ragging helplines, in English and in Kannada.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:zynetix_student/core/campus_services.dart';
import 'package:zynetix_student/features/campus/hostel_life_screens.dart';
import 'package:zynetix_student/features/campus/hostel_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {String language = 'en'}) => MaterialApp(
  theme: ZynetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester, {double width = 390}) {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> tapOn(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

void main() {
  late FakeStudentApi api;
  setUp(() {
    api = FakeStudentApi();
    api.hostelView = HostelView(
      resident: true,
      block: 'Vidyaranya Block',
      room: 'V-102',
      bed: 'B',
      outNow: true,
      gateLog: [
        GateMove(id: 'g2', direction: 'out', at: DateTime(2026, 10, 5, 17, 10), withPass: true),
        GateMove(id: 'g1', direction: 'in', at: DateTime(2026, 10, 4, 21, 40), minutesLate: 40, method: 'manual'),
      ],
    );
  });

  testWidgets('the gate QR shows the code, that the resident is out, and the late return', (tester) async {
    phone(tester);
    await tester.pumpWidget(host(GateQrScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(api.calls, containsAll(['gateQr s1', 'hostel s1']));
    expect(tester.widget<QrImageView>(find.byKey(const Key('gateQr'))), isNotNull);
    expect(find.text('You are out'), findsOneWidget);
    expect(find.textContaining('On an out-pass'), findsOneWidget);
    expect(find.textContaining('Entered by hand · 40 min late'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a resident raises a complaint and sees it waiting', (tester) async {
    phone(tester);
    await tester.pumpWidget(host(HostelComplaintsScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Ceiling fan makes a noise at night'), findsOneWidget);
    expect(find.text('Resolved'), findsOneWidget);

    await tapOn(tester, find.byKey(const Key('hlRaise')));
    await tapOn(tester, find.byKey(const Key('hlSend')));
    expect(find.text('Say what is wrong, in a few words.'), findsOneWidget);
    await tapOn(tester, find.byKey(const Key('cat-cleanliness')));
    await tester.enterText(find.byKey(const Key('hlText')), 'Bathroom on the second floor not cleaned since Sunday');
    await tapOn(tester, find.byKey(const Key('hlSend')));
    expect(api.calls, contains('raiseComplaint cleanliness Bathroom on the second floor not cleaned since Sunday'));
    expect(find.text('Complaint sent to the warden.'), findsOneWidget);
    expect(find.text('Open'), findsOneWidget);
  });

  testWidgets('the mess menu starts with today', (tester) async {
    phone(tester);
    // 2026-10-06 is a Tuesday.
    await tester.pumpWidget(host(MessMenuScreen(api: api, now: () => DateTime(2026, 10, 6, 8))));
    await tester.pumpAndSettle();
    final tue = tester.getTopLeft(find.byKey(const Key('menuDay-2')));
    final mon = tester.getTopLeft(find.byKey(const Key('menuDay-1')));
    expect(tue.dy, lessThan(mon.dy));
    expect(find.text('Tuesday · Today'), findsOneWidget);
    expect(find.text('Bisi bele bath, boondi raita'), findsOneWidget);
    expect(find.text('Breakfast'), findsNWidgets(2));
  });

  testWidgets('the hostel screen opens the gate QR, complaints and menu, and shows the helplines', (tester) async {
    phone(tester);
    final called = <String>[];
    await tester.pumpWidget(host(Scaffold(body: ListView(children: [HostelSafetyCard(api: api, call: (n) async => called.add(n))]))));
    await tester.pumpAndSettle();
    expect(find.text('National anti-ragging helpline'), findsOneWidget);
    expect(find.text('1800-180-5522'), findsOneWidget);
    await tapOn(tester, find.byTooltip('Call').first);
    expect(called, ['18001805522']);

    await tester.pumpWidget(host(HostelScreen(api: api, studentId: 's1', now: () => DateTime(2026, 10, 5, 9))));
    await tester.pumpAndSettle();
    await tapOn(tester, find.byKey(const Key('hsGateQr')));
    expect(find.byKey(const Key('gateQr')), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapOn(tester, find.byKey(const Key('hsComplaints')));
    expect(find.byKey(const Key('hlRaise')), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapOn(tester, find.byKey(const Key('hsMessMenu')));
    expect(find.byKey(const Key('menuDay-1')), findsOneWidget);
  });

  testWidgets('reads in Kannada without overflow at 360 px', (tester) async {
    phone(tester, width: 360);
    await tester.pumpWidget(host(GateQrScreen(api: api, studentId: 's1'), language: 'kn'));
    await tester.pumpAndSettle();
    expect(find.text('ನೀವು ಹೊರಗಿದ್ದೀರಿ'), findsOneWidget);
    await tester.pumpWidget(host(HostelComplaintsScreen(api: api, studentId: 's1'), language: 'kn'));
    await tester.pumpAndSettle();
    expect(find.text('ದೂರು ನೀಡಿ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
