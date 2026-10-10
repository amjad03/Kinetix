// The teacher's accreditation evidence screen: list, add with a photo, and the three languages.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/evidence_models.dart';
import 'package:kinetix_teacher/features/hr/my_evidence_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() => api = FakeTeacherApi());

  test('reads the API shape and recognises PNG and JPEG bytes', () {
    final e = EvidenceInfo.fromJson({'id': 'e1', 'kind': 'fdp', 'title': 'OBE workshop', 'year': 2026, 'venue': 'BCU', 'url': null, 'fileName': 'c.jpg', 'verified': true});
    expect((e.kind, e.year, e.verified, e.fileName), ('fdp', 2026, true, 'c.jpg'));
    expect(imageContentType([0x89, 0x50, 0x4e, 0x47, 0]), 'image/png');
    expect(imageContentType([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');
    expect(imageContentType([1, 2, 3, 4]), isNull);
  });

  testWidgets('shows an empty state, then adds evidence with a photo', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: MyEvidenceScreen(api: api, pickImage: () async => (bytes: Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0, 1]), name: 'cert.jpg'))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('evidenceEmpty')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('addEvidence')));
    await tester.enterText(find.byKey(const Key('evidenceTitleField')), 'Study of cooperative banks');
    await tester.enterText(find.byKey(const Key('evidenceYear')), '2026');
    await tapAndSettle(tester, find.byKey(const Key('evidenceAttach')));
    expect(find.text('Attached: cert.jpg'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('evidenceSave')));
    expect(api.calls, ['addMyEvidence publication Study of cooperative banks cert.jpg image/jpeg']);
    expect(find.text('Study of cooperative banks'), findsOneWidget);
    expect(find.text('Waiting for review'), findsOneWidget);
  });

  testWidgets('refuses a title that is too short and a non-image file', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: MyEvidenceScreen(api: api, pickImage: () async => (bytes: Uint8List.fromList([1, 2, 3]), name: 'x.bin'))));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('addEvidence')));
    await tapAndSettle(tester, find.byKey(const Key('evidenceSave')));
    expect(find.text('Write a title.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('evidenceAttach')));
    expect(find.text('Choose a JPEG or PNG photo.'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('works in Hindi and Kannada', (tester) async {
    phone(tester);
    for (final lang in ['hi', 'kn']) {
      await tester.pumpWidget(localizedApp(home: MyEvidenceScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(strings(lang).evidenceEmpty), findsOneWidget);
      expect(strings(lang).evidenceEmpty, isNot(strings('en').evidenceEmpty));
    }
  });
}
