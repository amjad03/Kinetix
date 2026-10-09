// Course files on the teacher's phone (Profile → Work tools): build a version, open its PDF.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/course_file_models.dart';
import 'package:kinetix_teacher/features/work/course_files_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    api.courseOptionList = const [CourseFileOption(sectionId: 's1', section: 'BCom Sem 3 A', subjectId: 'sub1', subject: 'Corporate Accounting', code: 'BCOM-3.1')];
  });

  test('parses the API shapes', () {
    final v = CourseFileVersion.fromJson({'id': 'f1', 'sectionId': 's1', 'subjectId': 'sub1', 'version': 2, 'generatedAt': '2026-10-12T04:30:00.000Z', 'reviewedAt': null, 'reviewRemark': null});
    expect(v.version, 2);
    expect(v.reviewedAt, isNull);
  });

  testWidgets('shows the classes with their versions, builds a new one and opens the PDF', (tester) async {
    phone(tester);
    api.courseFileList = [CourseFileVersion(id: 'f1', sectionId: 's1', subjectId: 'sub1', version: 1, generatedAt: DateTime.utc(2026, 10, 1), reviewedAt: DateTime.utc(2026, 10, 2))];
    String? opened;
    await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api, openFile: (Uint8List b, String name, String mime) async {
      opened = '$name $mime';
      return true;
    })));
    await tester.pumpAndSettle();
    expect(find.text('Corporate Accounting'), findsOneWidget);
    expect(find.text('Version 1'), findsOneWidget);
    expect(find.text('Reviewed'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('buildCourseFile-s1-sub1')));
    expect(api.calls, contains('buildCourseFile s1 sub1'));
    expect(find.text('Version 2'), findsOneWidget);
    expect(find.text('Awaiting review'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('courseFile-s1-sub1-v2')));
    expect(api.calls, contains('courseFilePdf cf-2'));
    expect(opened, 'course-file-BCOM-3.1-v2.pdf application/pdf');
  });

  testWidgets('says so when there are no classes, in Hindi too', (tester) async {
    phone(tester);
    api.courseOptionList = [];
    await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api), language: 'hi'));
    await tester.pumpAndSettle();
    expect(find.text(strings('hi').courseFilesEmpty), findsOneWidget);
    expect(strings('kn').courseFilesTitle, isNot(strings('en').courseFilesTitle));
  });
}
