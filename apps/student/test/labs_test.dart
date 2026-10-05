import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/learn/labs_view.dart';

import 'helpers.dart';

StudentProfile _student(String section, {String? level}) =>
    StudentProfile(id: 's', fullName: 'A B', rollNo: '1', sectionId: 'x', sectionName: section, programLevel: level);

void main() {
  test("a student's labs follow their class or degree", () {
    expect(labLevelsFor(_student('BCom Sem 3 A', level: 'ug')), {LabLevel.ug});
    expect(labLevelsFor(_student('MSc Physics', level: 'pg')), {LabLevel.pg});
    expect(labLevelsFor(_student('Class 10 A', level: 'k12')), {LabLevel.class10});
    expect(labLevelsFor(_student('7-B')), {LabLevel.class7});
    expect(labLevelsFor(_student('II PUC Science')), {LabLevel.class12});
    expect(labLevelsFor(_student('I PUC Commerce')), {LabLevel.class11});
    expect(labLevelsFor(_student('UKG Sunflower')), {LabLevel.ukg});
    expect(labLevelsFor(_student('Section A')), isEmpty);
  });

  testWidgets('Learn has a Labs tab: degree labs first, search, and a lab opens', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Learn');
    await tester.tap(find.byKey(const Key('tabLabs')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('labBrowser')), findsOneWidget);
    // The demo student is in a BCom (UG) section: school-only labs are filtered out.
    await tester.enterText(find.byKey(const ValueKey('lab-search')), 'pinhole');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('lab-open-pinhole')), findsNothing);

    await tester.enterText(find.byKey(const ValueKey('lab-search')), 'Planck');
    await tester.pumpAndSettle();
    final open = find.byKey(const ValueKey('lab-open-planck-constant-led'));
    expect(open, findsOneWidget);
    await tester.tap(open);
    await tester.pumpAndSettle();
    expect(find.byType(LabScreen), findsOneWidget);
  });
}
