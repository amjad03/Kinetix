import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/backup/backup_page.dart' show CeFiles;
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/help/ce_help.dart';
import 'package:kinetix_board/classroom_edition/help/quick_start_pdf.dart';
import 'package:kinetix_board/classroom_edition/l10n/ce_strings.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_pdf_text.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:pdf/widgets.dart' as pw;

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Help and the quick-start sheet (P1 item 25).
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    CeLang.code = 'en';
  });

  test('the how-tos: teach a class, lessons, put on board, quiz, mock test, boards, backup, timetable, PIN', () {
    expect([for (final t in helpTopics) t.id], ['teach', 'lessons', 'board', 'quiz', 'mock', 'save', 'backup', 'timetable', 'pin']);
    for (final t in helpTopics) {
      expect(t.steps.length, inInclusiveRange(3, 4), reason: t.id);
    }
  });

  testWidgets('Help from the start screen: every topic with pictures, in English and Kannada; print the quick start', (tester) async {
    Uint8List? printed;
    CeFiles.print = (pdf, name) async => printed = pdf;
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-help');
    expect(find.byKey(const Key('ce-help')), findsOneWidget);
    for (final t in helpTopics) {
      await tapKey(tester, 'ce-help-topic-${t.id}');
      expect(find.byKey(Key('ce-help-steps-${t.id}')), findsOneWidget);
      expect(find.byType(HelpPicture), findsNWidgets(t.steps.length), reason: '${t.id}: a picture for every step');
      expect(tester.getSize(find.byKey(Key('ce-help-topic-${t.id}'))).height, greaterThanOrEqualTo(64));
    }
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('ce-help-print')));
      for (var i = 0; i < 40 && printed == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    expect(printed, isNotNull);
    expect(String.fromCharCodes(printed!.sublist(0, 5)), '%PDF-');
    Navigator.of(tester.element(find.byKey(const Key('ce-help')))).pop();
    await settle(tester);

    // In Kannada.
    board.setBoardLanguage(BoardLanguage.kn);
    await settle(tester);
    await tapKey(tester, 'ce-help');
    expect(find.text('ಸಹಾಯ'), findsOneWidget);
    expect(find.text('ತರಗತಿ ಕಲಿಸಿ'), findsWidgets);
    Navigator.of(tester.element(find.byKey(const Key('ce-help')))).pop();
    await settle(tester);
    board.setBoardLanguage(BoardLanguage.en);
    await settle(tester);

    // From Settings and from the board's menu too.
    await openCeSettings(tester);
    await tapKey(tester, 'ce-settings-help');
    expect(find.byKey(const Key('ce-help')), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('the quick start is one A4 page; Kannada goes in shaped (as pictures)', (tester) async {
    final kn = CePdfText(), en = CePdfText();
    final (a, b) = (await tester.runAsync(() async {
      final a = await quickStartPdf(lang: 'en', college: 'Soundarya PU College', theme: pw.ThemeData.base(), pdfText: en);
      final b = await quickStartPdf(lang: 'kn', college: 'Soundarya PU College', theme: pw.ThemeData.base(), pdfText: kn);
      return (a, b);
    }))!;
    for (final p in [a, b]) {
      final s = String.fromCharCodes(p);
      expect(s.startsWith('%PDF-'), isTrue);
      expect(RegExp(r'/Type\s*/Page\b').allMatches(s).length, 1, reason: 'one page');
    }
    expect(en.pictures, 0);
    expect(kn.pictures, greaterThan(30));
    expect(CeLang.code, 'en', reason: 'making the sheet leaves the board language alone');
  });
}
