// Printing and saving PDFs on panels with and without a print service (ui/pdf_out.dart).
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/backup/backup_page.dart' show CeFiles;
import 'package:kinetix_board/classroom_edition/help/ce_help.dart';
import 'package:kinetix_board/classroom_edition/ui/pdf_out.dart';

import '../support/board_fonts.dart';

void main() {
  setUpAll(loadBoardFonts);
  final pdf = Uint8List.fromList('%PDF-1.4 test'.codeUnits);
  final saved = <String>[];
  final printed = <String>[];
  late Future<bool> Function(Uint8List, String) saveBefore;
  late Future<void> Function(Uint8List, String) printBefore;
  setUp(() {
    saved.clear();
    printed.clear();
    saveBefore = CePdfOut.save;
    printBefore = CeFiles.print;
    CePdfOut.save = (b, name) async {
      saved.add(name);
      return true;
    };
    CeFiles.print = (b, name) async => printed.add(name);
  });
  tearDown(() {
    CePdfOut.save = saveBefore;
    CeFiles.print = printBefore;
    CePdfOut.printService.value = null;
  });

  Future<void> pumpButton(WidgetTester tester, Future<void> Function(BuildContext) onTap) => tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(builder: (context) => Center(child: ElevatedButton(key: const Key('go'), onPressed: () => onTap(context), child: const Text('go')))),
      ),
    ),
  );

  testWidgets('a board that can print prints; one without a print service says so and saves', (tester) async {
    CePdfOut.printService.value = true;
    await pumpButton(tester, (c) => cePrintOrSave(c, pdf, 'Paper.pdf', (b, n) async => printed.add(n)));
    await tester.tap(find.byKey(const Key('go')));
    await tester.pumpAndSettle();
    expect(printed, ['Paper.pdf']);
    expect(find.byKey(const Key('ce-no-printer')), findsNothing);

    CePdfOut.printService.value = false;
    expect(CePdfOut.leadWithSave, isTrue);
    await tester.tap(find.byKey(const Key('go')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ce-no-printer')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ce-no-printer-save')));
    await tester.pumpAndSettle();
    expect(saved, ['Paper.pdf']);
    expect(printed, ['Paper.pdf'], reason: 'not sent to a printer that is not there');
    expect(find.text('Saved Paper.pdf.'), findsOneWidget);
  });

  testWidgets('not known yet (or not Android): print as before', (tester) async {
    expect(CePdfOut.printService.value, isNull);
    expect(CePdfOut.leadWithSave, isFalse);
    CePdfOut.hasPrintService = () async => true;
    await CePdfOut.refresh();
    expect(CePdfOut.printService.value, isTrue);
    CePdfOut.hasPrintService = () async => throw Exception('no channel');
    await CePdfOut.refresh();
    expect(CePdfOut.printService.value, isTrue, reason: 'a failed check never hides Print');
  });

  for (final canPrint in [true, false]) {
    testWidgets('the quick-start sheet: Save PDF to USB / Downloads beside Print (print service: $canPrint)', (tester) async {
      CePdfOut.printService.value = canPrint;
      tester.view
        ..physicalSize = const Size(1920, 1080)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(const MaterialApp(home: CeHelpPage()));
      await tester.pump();
      final save = find.byKey(const Key('ce-help-save'));
      final print = find.byKey(const Key('ce-help-print'));
      expect(save, findsOneWidget);
      expect(tester.widget(save) is FilledButton, !canPrint, reason: 'Save leads on a board that cannot print');
      expect(tester.widget(print) is FilledButton, canPrint);
      await tester.runAsync(() async {
        await tester.tap(save);
        for (var i = 0; i < 40 && saved.isEmpty; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
          await tester.pump();
        }
      });
      expect(saved, ['Zynetix-Classroom-quick-start.pdf']);
    });
  }

  test('Android answers whether it has a print service; the Classroom manifest may ask', () {
    final main = File('android/app/src/main/kotlin/app/kinetix/board/MainActivity.kt').readAsStringSync();
    expect(main, contains('"zynetix/print"'));
    expect(main, contains('FEATURE_PRINTING'));
    expect(File('android/app/src/classroom/AndroidManifest.xml').readAsStringSync(), contains('android.printservice.PrintService'));
    // Every screen that prints a PDF also saves it.
    for (final f in ['class_tools/mock_view.dart', 'class_tools/worksheets_view.dart', 'class_tools/mastery_view.dart', 'help/ce_help.dart', 'settings/pin_pad.dart']) {
      final s = File('lib/classroom_edition/$f').readAsStringSync();
      expect(s, contains('cePdfSaveLabel'), reason: f);
      expect(s, contains('CePdfOut.leadWithSave'), reason: f);
    }
    expect(File('lib/classroom_edition/backup/backup_page.dart').readAsStringSync(), contains('CePdfOut.leadWithSave'));
  });
}
