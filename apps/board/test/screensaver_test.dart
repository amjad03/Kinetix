import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/features/screensaver/screensaver.dart';
import 'package:zynetix_board/l10n/l10n.dart';

Widget _app(Widget home) => MaterialApp(localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales, home: home);

void main() {
  testWidgets('the screensaver shows the room, the period on now and next, and notices; a touch wakes the board', (t) async {
    var woke = false;
    await t.pumpWidget(
      _app(
        BoardScreensaver(
          refresh: null,
          onWake: () => woke = true,
          load: () async => {
            'institution': 'Soundarya College',
            'room': 'Room 1',
            'time': '10:05',
            'current': {'subject': 'Corporate Accounting', 'section': 'BCom Sem 3 A', 'startsAt': '10:00', 'endsAt': '10:55'},
            'next': {'subject': 'Business Law', 'section': 'BCom Sem 3 A', 'startsAt': '11:00', 'endsAt': '11:55'},
            'notices': [
              {'id': 'n1', 'title': 'Fire drill at 11:00', 'body': '', 'priority': 'emergency'},
              {'id': 'n2', 'title': 'Sports day on Friday', 'body': 'Ground, 9 am'},
            ],
          },
        ),
      ),
    );
    await t.pump();
    expect(find.text('10:05'), findsOneWidget);
    expect(find.textContaining('Corporate Accounting'), findsOneWidget);
    expect(find.textContaining('Business Law'), findsOneWidget);
    expect(find.text('Fire drill at 11:00'), findsOneWidget);
    expect(find.text('Sports day on Friday'), findsOneWidget);
    await t.tap(find.byKey(const Key('screensaver')));
    expect(woke, isTrue);
  });

  testWidgets('no class on: says so', (t) async {
    await t.pumpWidget(_app(BoardScreensaver(refresh: null, onWake: () {}, load: () async => {'institution': 'X', 'room': 'R', 'time': '13:00', 'current': null, 'next': null, 'notices': []})));
    await t.pump();
    expect(find.text('No class right now'), findsOneWidget);
  });

  testWidgets('the attendance code shows full screen with its digits; without a class it says so', (t) async {
    await t.pumpWidget(
      _app(BoardAttendanceCodeScreen(autoRefresh: false, load: () async => {'code': '12345678', 'ttlSeconds': 30, 'section': 'BCom Sem 3 A', 'subject': 'Corporate Accounting'})),
    );
    await t.pump();
    expect(find.byKey(const Key('attendance-qr')), findsOneWidget);
    expect(find.text('12345678'), findsOneWidget);
    expect(find.byTooltip('Close'), findsOneWidget);

    await t.pumpWidget(_app(BoardAttendanceCodeScreen(key: const Key('none'), autoRefresh: false, load: () async => throw Exception('404'))));
    await t.pump();
    expect(find.byKey(const Key('no-class')), findsOneWidget);
  });

  testWidgets('the attendance code fits a phone-sized window at twice the text size', (t) async {
    t.view.physicalSize = const Size(320, 640);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(320, 640), textScaler: TextScaler.linear(2)),
        child: _app(BoardAttendanceCodeScreen(autoRefresh: false, load: () async => {'code': '12345678', 'ttlSeconds': 30, 'section': 'BCom Sem 3 A', 'subject': 'Corporate Accounting'})),
      ),
    );
    await t.pump();
    expect(t.takeException(), isNull);
  });
}
