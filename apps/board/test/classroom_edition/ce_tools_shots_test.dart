// Screenshots of the Class tools from the real code, on the real (private) bank when it is built
// (CE_SHOTS=<dir> to write them; skipped without the bank).
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/class_tools/class_records.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/models.dart';

import '../support/screen_fonts.dart';
import 'ce_shots_test.dart' show shot;
import 'ce_support.dart';

final _bank = File('assets/private/class_tools/index.json').existsSync();

/// The sample college with the 2nd period given to 2nd PUC A (Electric Charges and Fields is a
/// 2nd PUC chapter).
CeSetup _college() {
  final s = sampleCollege();
  return s.copyWith(
    slots: [
      for (final x in s.slots)
        x.id == 'p1'
            ? x.copyWith(classId: 'c2a')
            : x.id == 'p4'
            ? x.copyWith(classId: 'c1a')
            : x,
    ],
  );
}

/// Earlier class quizzes for 2nd PUC A: five topics of Electric Charges and Fields, stronger on
/// the first topics, by roll number only.
Map<String, Object> _history() {
  const ch = 'puc2-physics-01-electric-charges-and-fields';
  final r = Random(7);
  final ability = [for (var i = 0; i < 40; i++) 0.25 + r.nextDouble() * 0.7];
  final quizzes = <QuizRecord>[];
  const ease = {'t1': 0.3, 't2': 0.15, 't3': 0.0, 't4': -0.08, 't5': -0.35};
  for (final e in ease.entries) {
    for (var q = 0; q < 4; q++) {
      final right = <int>[], wrong = <int>[];
      for (var roll = 1; roll <= 40; roll++) {
        if (roll == 13 && q == 0) continue;
        (r.nextDouble() < ability[roll - 1] + e.value ? right : wrong).add(roll);
      }
      quizzes.add(QuizRecord(at: DateTime(2026, 11, 2 + q), questionId: '${e.key}-$q', chapterId: ch, topic: e.key, right: right, wrong: wrong));
    }
  }
  final mock = MockRecord(
    id: 'mock-1',
    at: DateTime(2026, 10, 30),
    title: 'Mock test 1',
    maxMarks: 25,
    chapterIds: const [ch],
    marks: {for (var roll = 1; roll <= 40; roll++) roll: (8 + ability[roll - 1] * 17).roundToDouble()},
  );
  return {
    'setting.classTools.c2a': jsonEncode(ClassRecords(quizzes: quizzes, mocks: [mock]).toJson()),
  };
}

/// KaTeX's fonts (flutter_math_fork) so formulas typeset in the screenshots.
Future<void> _katex() async {
  for (final (family, files) in const [
    ('KaTeX_Main', ['Regular', 'Bold', 'Italic']),
    ('KaTeX_Math', ['Italic']),
    ('KaTeX_Size1', ['Regular']),
    ('KaTeX_Size2', ['Regular']),
    ('KaTeX_AMS', ['Regular']),
  ]) {
    final loader = FontLoader('packages/flutter_math_fork/$family');
    for (final f in files) {
      loader.addFont(rootBundle.load('packages/flutter_math_fork/lib/katex_fonts/fonts/$family-$f.ttf'));
    }
    await loader.load();
  }
}

void main() {
  setUpAll(() async {
    await loadScreenFonts();
    await _katex();
  });
  setUp(ClassBank.clearCache);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  Future<void> pumpShot(WidgetTester tester, Widget app, Size size) async {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: app));
    await settle(tester);
  }

  Future<void> loaded(WidgetTester tester) async {
    for (var i = 0; i < 20; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Marks question [q]'s roll numbers in a fixed pattern (a few wrong, a few left).
  Future<void> mark(WidgetTester tester, int q, {int upTo = 40}) async {
    for (var roll = 1; roll <= upTo; roll++) {
      if (roll == 13 || roll == 29) continue; // absent
      if ((roll * 7 + q) % 11 == 0) continue; // not marked
      final wrong = (roll * 5 + q * 3) % 7 == 0;
      final f = find.byKey(Key('ce-roll-$roll'));
      await tester.ensureVisible(f);
      await tester.tap(f);
      await tester.pump();
      if (wrong) {
        await tester.tap(f);
        await tester.pump();
      }
    }
  }

  testWidgets('class tools', skip: !_bank, (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: _college(), prefs: _history())))!;
    await pumpShot(tester, appFor(board), const Size(1920, 1080));
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    board.markAttendance({'roll-13': AttendanceMark.absent, 'roll-29': AttendanceMark.absent});
    await settle(tester);
    await tapKey(tester, 'ce-class-tools');
    await shot(tester, 'tools-07-classroom-apps');
    await tapKey(tester, 'ce-tool-quiz');
    await loaded(tester);
    await shot(tester, 'tools-08a-quiz-setup');
    await tapKey(tester, 'ce-quiz-start');
    for (var q = 1; q <= 2; q++) {
      await mark(tester, q);
      await tapKey(tester, 'ce-quiz-next');
    }
    await mark(tester, 3);
    await settle(tester);
    await shot(tester, 'tools-08-class-quiz');
    await tapKey(tester, 'ce-tools-back');
    await shot(tester, 'tools-07-class-tools-hub');
    await tapKey(tester, 'panel-full');
    await tapKey(tester, 'ce-tool-mastery');
    await shot(tester, 'tools-09-mastery-heatmap');
    for (final (tool, name) in const [
      ('mock', 'tools-10-mock-test'),
      ('drill', 'tools-11-formula-drill'),
      ('teams', 'tools-12-teams'),
      ('plan', 'tools-14-class-plan'),
      ('worksheets', 'tools-15-worksheets'),
    ]) {
      await tapKey(tester, 'ce-tools-back');
      await tapKey(tester, 'ce-tool-$tool');
      await settle(tester);
      if (tool == 'teams') await tapKey(tester, 'ce-teams-make');
      if (tool == 'drill') await tapKey(tester, 'ce-drill-show');
      await shot(tester, name);
    }
    await closeBoard(tester, board);
  });

  testWidgets('class quiz on a phone', skip: !_bank, (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: _college(), prefs: _history())))!;
    await pumpShot(tester, appFor(board), const Size(844, 390));
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    await tapKey(tester, 'ce-class-tools');
    await tapKey(tester, 'ce-tool-quiz');
    await loaded(tester);
    await tapKey(tester, 'ce-quiz-start');
    await tapKey(tester, 'ce-quiz-next');
    await tapKey(tester, 'ce-quiz-next');
    await mark(tester, 3);
    await settle(tester);
    await shot(tester, 'tools-13-phone-class-quiz');
    await closeBoard(tester, board);
  });
}
