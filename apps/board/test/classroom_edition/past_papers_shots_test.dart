// Screenshots of Past papers at 1920 × 1080 from the real code, on invented fixture papers
// (PAPERS_SHOTS=<dir> to write them; nothing is written without it).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/past_papers/exam_rules.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_import.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_library.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_storage.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';
import 'papers_fixtures.dart';

final _out = Platform.environment['PAPERS_SHOTS'];

Future<void> _shot(WidgetTester tester, String name) async {
  final out = _out;
  if (out == null) return;
  final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('papers-shot')));
  final png = await tester.runAsync(() async {
    final img = await box.toImage();
    return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
  });
  Directory(out).createSync(recursive: true);
  File('$out/$name.png').writeAsBytesSync(png!);
}

void main() {
  setUpAll(loadScreenFonts);
  setUp(() {
    ClassBank.clearCache();
    usePdfium();
  });
  tearDown(() {
    PaperLibrary.sharedForTests = null;
    Edition.classroom = Edition.built == 'classroom';
  });

  Future<void> loaded(WidgetTester tester, [int n = 12]) async {
    for (var i = 0; i < n; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('past papers', skip: _out == null, (tester) async {
    final lib = PaperLibrary(MemoryPaperStorage());
    PaperLibrary.sharedForTests = lib;
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('papers-shot'), child: appFor(board)));
    await settle(tester);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    await tapKey(tester, 'ce-class-tools');
    await tapKey(tester, 'ce-tool-papers');
    await loaded(tester);
    await tapKey(tester, 'panel-full');
    await loaded(tester, 3);
    await _shot(tester, 'papers-01-empty');

    // Add papers: the PIN, then the form with what the file names say.
    final kcet = (await tester.runAsync(() => fixturePdf('Sample KCET-style chemistry paper', pages: 2)))!;
    final kcetKey = (await tester.runAsync(() => fixturePdf('Sample KCET answer key', pages: 1, key: true)))!;
    final pack = (await tester.runAsync(fixturePack))!;
    pickPaperFiles = () async => [(name: 'KCET_2022_Chemistry.pdf', bytes: kcet), (name: 'kcet 2022 chemistry answer key.pdf', bytes: kcetKey), (name: 'sample-papers.zip', bytes: pack)];
    addTearDown(() => pickPaperFiles = () async => const []);
    await tapKey(tester, 'ce-papers-empty-add');
    await enterSchoolPin(tester);
    await tapKey(tester, 'ce-papers-pick');
    await loaded(tester, 4);
    await tester.enterText(find.byKey(const Key('ce-papers-source-0')), 'Sample (made up for screenshots)');
    await settle(tester);
    await _shot(tester, 'papers-07-import-form');
    await tapKey(tester, 'ce-papers-add-go');
    await loaded(tester, 10);
    await tapKey(tester, 'ce-papers-add-done');
    await loaded(tester, 4);
    final puc = (await tester.runAsync(() => fixturePdf('Sample PUC-style physics paper', pages: 3)))!;
    await tester.runAsync(() => lib.addPdf(puc, const PaperDraft(exam: Exam.puc2, year: 2024, session: 'March', subjects: ['Physics'], source: 'Sample (made up)'), fileName: 'puc.pdf'));
    await loaded(tester, 3);
    await _shot(tester, 'papers-02-library');

    // The NEET paper: viewer, answer key, timer, practice.
    final neet = lib.papers.firstWhere((p) => p.exam == Exam.neet);
    await tapKey(tester, 'ce-paper-${neet.id}');
    await tapKey(tester, 'ce-paper-show');
    await loaded(tester, 20);
    await _shot(tester, 'papers-03-viewer');
    await tapKey(tester, 'ce-viewer-key');
    await loaded(tester, 20);
    await _shot(tester, 'papers-04-answer-key');
    await tapKey(tester, 'ce-viewer-timer');
    await loaded(tester, 3);
    await tapKey(tester, 'ce-timer-start');
    await loaded(tester, 3);
    await _shot(tester, 'papers-05-timer');
    await tapKey(tester, 'ce-timer-close');
    await tapKey(tester, 'ce-viewer-close');
    await loaded(tester, 3);
    await tapKey(tester, 'ce-paper-practise');
    await loaded(tester, 4);
    await tapKey(tester, 'ce-practice-start');
    await loaded(tester, 4);
    await tapKey(tester, 'ce-practice-option-2');
    await tapKey(tester, 'ce-practice-reveal');
    await _shot(tester, 'papers-06-practice');
    await tapKey(tester, 'ce-practice-next');
    await tapKey(tester, 'ce-practice-next');
    await tapKey(tester, 'ce-practice-next');
    await loaded(tester, 20);
    await _shot(tester, 'papers-06b-practice-picture');
    await tapKey(tester, 'ce-practice-close');
    await loaded(tester, 3);
    await _shot(tester, 'papers-08-practice-setup');
    await closeBoard(tester, board);
  });
}
