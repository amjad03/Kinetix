import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/backup/marks_export.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/l10n/ce_kannada.dart';
import 'package:kinetix_board/classroom_edition/l10n/ce_strings.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/settings/pin_pad.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_pdf_text.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:pdf/widgets.dart' as pw;

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Every word the Classroom edition shows is in its string table, in English and Kannada
/// (P1 item 9), and the ಕನ್ನಡ / English switch on the start screen changes the whole edition.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    CeLang.code = 'en';
  });

  // The edition's code, and the board files that show its words.
  final files = [
    for (final f in Directory('lib/classroom_edition').listSync(recursive: true).whereType<File>())
      if (f.path.endsWith('.dart') && !f.path.contains('/l10n/')) f,
    File('lib/features/board/board_screen.dart'),
    File('lib/features/board/layout/board_chrome.dart'),
    File('lib/features/board/context/context_switcher.dart'),
  ];
  // Where the keys are looked up: the code above and the table's own helpers (days, students).
  final keyFiles = [...files, File('lib/classroom_edition/l10n/ce_strings.dart')];

  /// The string literal starting at [s][i] (a quote), and where it ends; `${…}` skipped whole.
  (String, int) literal(String s, int i) {
    final q = s[i];
    final b = StringBuffer();
    var j = i + 1;
    while (j < s.length && s[j] != q) {
      if (s[j] == r'\') {
        b.write(s.substring(j, j + 2));
        j += 2;
      } else if (s.startsWith(r'${', j)) {
        j++;
        var depth = 0;
        do {
          if (s[j] == '{') depth++;
          if (s[j] == '}') depth--;
          j++;
        } while (depth > 0 && j < s.length);
        b.write(r'${}');
      } else {
        b.write(s[j++]);
      }
    }
    return (b.toString(), j + 1);
  }

  /// The English keys the code looks up: `ce('…')`, `ceTr('…')`, `ceIn(lang, '…')`, the days.
  Set<String> usedKeys() {
    final keys = <String>{};
    final call = RegExp(r"(?:(?:\.ce|\bceTr)\(|\bceIn\([^,()]+,)\s*'");
    final days = RegExp(r"short \? '([^']+)' : '([^']+)'");
    for (final f in keyFiles) {
      final s = f.readAsLinesSync().where((l) => !l.trimLeft().startsWith('//')).join('\n');
      for (final m in call.allMatches(s)) {
        keys.add(literal(s, m.end - 1).$1.replaceAll(r"\'", "'"));
      }
      for (final m in days.allMatches(s)) {
        keys.addAll([m[1]!, m[2]!]);
      }
    }
    return keys;
  }

  Set<String> placeholders(String s) => {for (final m in RegExp(r'\{(\w+)\}').allMatches(s)) m[1]!};

  // Names, codes and symbols that read the same in Kannada.
  const sameInKannada = {'Zynetix Board', 'Classroom edition', '1st PUC', '2nd PUC', '…', 'AB', 'CSV', 'PDF'};

  test('every string the edition uses has Kannada, with the same placeholders', () {
    final used = usedKeys();
    expect(used.length, greaterThan(500));
    final missing = [for (final k in used) if (!ceKannada.containsKey(k)) k];
    expect(missing, isEmpty, reason: 'add these to l10n/ce_kannada.dart');
    for (final k in used) {
      final kn = ceKannada[k]!;
      expect(placeholders(kn), placeholders(k), reason: k);
      if (!sameInKannada.contains(k)) expect(CePdfText.hasKannada(kn), isTrue, reason: '“$k” is not in Kannada: “$kn”');
    }
    final unused = [for (final k in ceKannada.keys) if (!used.contains(k)) k];
    expect(unused, isEmpty, reason: 'no code uses these any more');
  });

  test('no bare Text(\'…\') left in the Classroom edition', () {
    // Proper nouns and labels that are the same in both languages.
    const allowed = {'Zynetix Classroom', 'English', 'ಕನ್ನಡ', 'English · ಕನ್ನಡ'};
    // Question papers, worksheets and the mastery map print as English-medium exam papers
    // (their questions are English), so their printed headings stay English.
    const englishPapers = {'class_tools/paper_pdf.dart'};
    final shown = RegExp(r'''\b(?:Text|tooltip:|labelText:|hintText:|helperText:|semanticsLabel:|message:)\s*\(?\s*(?:const\s+)?['"]''');
    final bare = <String>[];
    for (final f in files.where((f) => f.path.contains('classroom_edition'))) {
      final rel = f.path.split('classroom_edition/').last;
      if (englishPapers.contains(rel)) continue;
      final lines = f.readAsLinesSync();
      for (final (n, line) in lines.indexed) {
        if (line.trimLeft().startsWith('//')) continue;
        for (final m in shown.allMatches(line)) {
          final (text, _) = literal(line, m.end - 1);
          final words = text.replaceAll(r'${}', '').replaceAll(RegExp(r'\$\w+'), '').replaceAll(RegExp(r'\b(PUC|PDF|CSV|KCET|NEET|JEE)\b'), '');
          if (RegExp('[A-Za-z]{2,}').hasMatch(words) && !allowed.contains(text)) bare.add('$rel:${n + 1}: $text');
        }
      }
    }
    expect(bare, isEmpty, reason: 'put these in the string table (context.ce / ceTr)');
  });

  test('placeholders and days', () {
    expect(ceIn('en', 'Remove {name}?', {'name': 'Lakshmi Rao'}), 'Remove Lakshmi Rao?');
    expect(ceIn('kn', 'Remove {name}?', {'name': 'Lakshmi Rao'}), 'Lakshmi Rao ಅವರನ್ನು ತೆಗೆದುಹಾಕಬೇಕೆ?');
    expect(ceIn('hi', 'Start my class'), 'Start my class', reason: 'Hindi reads as English in this edition');
    expect(ceDayIn('kn', 1), 'ಸೋಮವಾರ');
    expect(ceDayIn('kn', 6, short: true), 'ಶನಿ');
    expect(ceDayIn('en', 7), 'Sunday');
  });

  testWidgets('the ಕನ್ನಡ / English switch on the start screen turns the edition into Kannada and back', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    expect(find.text('Start my class'), findsOneWidget);
    expect(tester.getSize(find.byKey(const Key('ce-lang-kn'))).height, greaterThanOrEqualTo(64));
    await tapKey(tester, 'ce-lang-kn');
    expect(board.boardLanguage, BoardLanguage.kn);
    expect(find.text('ನನ್ನ ತರಗತಿ ಆರಂಭಿಸಿ'), findsOneWidget);
    expect(find.text('ಸೋಮವಾರ, 2ನೇ ಅವಧಿ. ನಿಮ್ಮ ತರಗತಿ ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸಿದ್ಧವಿದೆ.'), findsOneWidget);
    expect(find.text('Start my class'), findsNothing);
    // Saved on the board.
    expect(await board.classroom.deviceStore.setting('language'), 'kn');
    // The board in Kannada: the Simple board's own buttons too.
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    expect(find.text('ಬಣ್ಣಗಳು'), findsWidgets);
    expect(find.text('ತರಗತಿ ಸಾಧನಗಳು'), findsWidgets);
    expect(find.text('ಈಗ ನಾನು ಏನು ಮಾಡಲಿ?'), findsOneWidget);
    board.showClassroomStart();
    await settle(tester);
    await tapKey(tester, 'ce-lang-en');
    expect(find.text('Start my class'), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('Kannada in the PDFs is drawn by the text engine (pictures), English stays text', (tester) async {
    const cls = CeClass(id: 'c1a', year: 1, section: 'A', rollCount: 5);
    final test = MarksTest(id: 'm1', title: 'Unit test 1', at: DateTime(2026, 11, 2), outOf: 25, marks: const {1: 20, 2: 15.5, 3: 18});
    final kn = CePdfText(), en = CePdfText();
    final pdfs = (await tester.runAsync(() async {
      final a = await marksPdf(college: 'Soundarya PU College', cls: cls, subject: 'Physics', test: test, theme: pw.ThemeData.base(), lang: 'kn', pdfText: kn);
      final b = await marksPdf(college: 'Soundarya PU College', cls: cls, subject: 'Physics', test: test, theme: pw.ThemeData.base(), lang: 'en', pdfText: en);
      final c = await recoveryCodePdf('K7QF-2MXD-9RTA', 'Soundarya PU College', lang: 'kn');
      return [a, b, c];
    }))!;
    for (final p in pdfs) {
      expect(String.fromCharCodes(p.sublist(0, 5)), '%PDF-');
    }
    // Kannada headings, "Absent" and the summary went in as pictures; nothing in English did.
    expect(kn.pictures, greaterThanOrEqualTo(5));
    expect(en.pictures, 0);
    expect(_count(pdfs[0], '/Image'), greaterThan(_count(pdfs[1], '/Image')));
  });
}

int _count(Uint8List bytes, String what) => RegExp(RegExp.escape(what)).allMatches(String.fromCharCodes(bytes)).length;
