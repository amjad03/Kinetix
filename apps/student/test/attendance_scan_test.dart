// QR self-marking: the code goes with where the phone is; a scan held by the anti-proxy checks says why, in the
// student's language; a refused scan shows the server's message.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/api.dart';
import 'package:zynetix_student/core/scan_location.dart';
import 'package:zynetix_student/features/attendance/attendance_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

class _Here implements ScanLocator {
  _Here(this.fix);
  final ScanLocation? fix;
  @override
  Future<ScanLocation?> current() async => fix;
}

class _Refusing extends FakeStudentApi {
  @override
  Future<AttendanceScan> scanAttendance(String code, {ScanLocation? location}) async =>
      throw ApiException(403, 'This phone has already been used to mark another student. Use your own phone, or ask your teacher.');
}

Widget _host(Widget child, {String language = 'en'}) => MaterialApp(
  theme: ZynetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

Future<void> _scan(WidgetTester tester, String code) async {
  await tester.enterText(find.byKey(const Key('attendance-code-field')), code);
  await tester.pump();
  expect(tester.widget<FilledButton>(find.byKey(const Key('attendance-code-submit'))).onPressed, isNotNull);
  await tester.tap(find.byKey(const Key('attendance-code-submit')));
  await tester.pumpAndSettle();
}

void main() {
  const campus = ScanLocation(lat: 13.0573, lng: 77.5016, accuracyM: 14);

  testWidgets('sends the location with the code and confirms the mark', (tester) async {
    final api = FakeStudentApi();
    await tester.pumpWidget(_host(AttendanceCodeScreen(api: api, locator: _Here(campus))));
    await _scan(tester, '1234 5678');
    expect(api.calls, contains('scan 1234 5678'));
    expect(api.lastScanLocation?.toJson(), {'lat': 13.0573, 'lng': 77.5016, 'accuracyM': 14.0});
    expect(find.text('You are marked present.'), findsOneWidget);
  });

  testWidgets('a held scan says it waits for the teacher and why (Kannada too)', (tester) async {
    final api = FakeStudentApi()..nextScan = const AttendanceScan(outcome: 'flagged', alreadyMarked: false, reasons: ['outside_campus', 'new_device']);
    await tester.pumpWidget(_host(AttendanceCodeScreen(api: api, locator: _Here(null))));
    await _scan(tester, '87654321');
    expect(api.lastScanLocation, isNull);
    expect(find.text('Your scan is waiting for your teacher to confirm: you seem to be outside the campus, this is not the phone you usually mark from.'), findsOneWidget);

    await tester.pumpWidget(_host(AttendanceCodeScreen(api: api, locator: _Here(campus)), language: 'kn'));
    await tester.pumpAndSettle();
    await _scan(tester, '87654321');
    expect(find.textContaining('ಶಿಕ್ಷಕರ ದೃಢೀಕರಣಕ್ಕಾಗಿ'), findsOneWidget);
  });

  testWidgets('a refused scan (a shared phone) shows the reason', (tester) async {
    await tester.pumpWidget(_host(AttendanceCodeScreen(api: _Refusing(), locator: _Here(campus))));
    await _scan(tester, '11112222');
    expect(find.textContaining('already been used to mark another student'), findsOneWidget);
  });

  test('reads the server answer', () {
    final r = AttendanceScan.fromJson({'status': null, 'alreadyMarked': false, 'outcome': 'flagged', 'reasons': ['late_scan']});
    expect(r.held, isTrue);
    expect(r.reasons, ['late_scan']);
    expect(AttendanceScan.fromJson({'status': 'present', 'alreadyMarked': true}).held, isFalse);
  });
}
