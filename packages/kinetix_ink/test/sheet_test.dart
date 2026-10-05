import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

SheetElement sheet(int rows, int cols, List<String> cells, {List<SheetFormat>? formats, SheetChart? chart}) =>
    SheetElement.sized(rows: rows, cols: cols, cells: cells, color: const Color(0xFF7A4F00), formats: formats, chart: chart);

void main() {
  group('Indian number formats', () {
    test('lakh and crore grouping', () {
      expect(indianGrouping(1234567.5), '12,34,567.50');
      expect(indianGrouping(999, decimals: 0), '999');
      expect(indianGrouping(1000, decimals: 0), '1,000');
      expect(indianGrouping(123456789, decimals: 0), '12,34,56,789');
      expect(formatInr(-250000), '-₹2,50,000.00');
      expect(formatLakh(1235000), '₹12.35 L');
      expect(formatCrore(123000000), '₹12.30 Cr');
      expect(formatSheetNumber(0.18, SheetFormat.percent), '18%');
    });

    test('numbers as typed', () {
      expect(parseSheetNumber('1,25,000'), 125000);
      expect(parseSheetNumber('₹ 500'), 500);
      expect(parseSheetNumber('18%'), closeTo(0.18, 1e-12));
      expect(parseSheetNumber('(2,000)'), -2000);
      expect(parseSheetNumber('Cash'), isNull);
    });

    test('references', () {
      expect(columnName(0), 'A');
      expect(columnName(27), 'AB');
      expect(parseCellRef(r'$B$3'), (2, 1));
      expect(parseRange('A1:B2'), [(0, 0), (0, 1), (1, 0), (1, 1)]);
    });
  });

  group('formulas', () {
    test('SUM, AVERAGE, arithmetic, precedence and percent', () {
      final s = sheet(5, 2, [
        'Item', 'Amount', //
        'Rent', '1,20,000',
        'Salaries', '3,00,000',
        'Total', '=SUM(B2:B3)',
        'GST', '=B4*18%+(2-1)^2*0',
      ]);
      final v = evaluateSheet(s);
      expect(v[7].number, 420000);
      expect(v[9].number, closeTo(75600, 1e-9));
      final t = sheet(1, 6, ['2', '4', '=AVERAGE(A1:B1)', '=A1+B1*C1', '=MAX(A1:D1)-MIN(A1:B1)', '=ROUND(10/3, 2)']);
      final w = evaluateSheet(t);
      expect(w[2].number, 3);
      expect(w[3].number, 14);
      expect(w[4].number, 12);
      expect(w[5].number, 3.33);
    });

    test('IF, COUNT, ABS, SQRT and absolute references', () {
      final v = evaluateSheet(sheet(1, 5, ['9', '=IF(A1>5, 1, 0)', r'=COUNT(A1:B1)+$A$1', '=ABS(-3)', '=SQRT(A1)']));
      expect([for (final x in v) x.number], [9, 1, 11, 3, 3]);
    });

    test('errors: division by zero, cycles, references outside, words, nonsense', () {
      final v = evaluateSheet(sheet(1, 6, ['=1/0', '=C1', '=B1', '=Z9', 'words', '=E1+1']));
      expect(v[0].error, '#DIV/0!');
      expect(v[1].error, '#CYCLE!');
      expect(v[2].error, '#CYCLE!');
      expect(v[3].error, '#REF!');
      expect(v[4].text, 'words');
      expect(v[5].error, '#VALUE!');
      expect(evaluateSheet(sheet(1, 1, ['=1+']))[0].error, '#ERR!');
    });

    test('column formats and chart data', () {
      final s = sheet(3, 2, ['Year', 'Sales', '2024', '1250000', '2025', '=B2*2'],
          formats: [SheetFormat.general, SheetFormat.lakh], chart: const SheetChart(kind: SheetChartKind.bar, labels: 'A2:A3', values: 'B2:B3'));
      expect(displaySheetCell(s, 2, 1), '₹25.00 L');
      expect(displaySheetCell(s, 0, 1), 'Sales');
      final d = sheetChartData(s);
      expect(d.labels, ['2024', '2025']);
      expect(d.values, [1250000, 2500000]);
    });
  });

  group('the element', () {
    test('saves and reads back (board format v2), and older boards skip what they do not know', () {
      final s = sheet(2, 2, ['Dr', 'Cr', '=1+1', '5'], formats: [SheetFormat.inr, SheetFormat.general],
              chart: const SheetChart(kind: SheetChartKind.pie, labels: 'A1:B1', values: 'A2:B2'))
          .copyWith(header: false, rotation: 0.25, widths: [180, 120]);
      final board = SavedBoard(background: BoardBackground.plain, canvas: const Size(1920, 1080), pages: [[s]]);
      final json = jsonDecode(jsonEncode(board.toJson())) as Map<String, dynamic>;
      final item = (json['pages'] as List).first['strokes'][0] as Map<String, dynamic>;
      expect(item['t'], 'sheet');
      expect(item['out'], ['Dr', 'Cr', '₹2.00', '5']);
      expect(item['cv'], {'l': ['Dr', 'Cr'], 'v': [2.0, 5.0]});
      final back = SavedBoard.fromJson(json).pages.single.single as SheetElement;
      expect(back.cells, s.cells);
      expect(back.rows, 2);
      expect(back.formats, s.formats);
      expect(back.widths, [180, 120]);
      expect(back.header, isFalse);
      expect(back.chart, s.chart);
      expect(back.rotation, closeTo(0.25, 1e-3));
      expect(back.rect.width, closeTo(s.rect.width, 0.1));
      expect(decodeElement({'t': 'sheet', 'r': [0, 0, 1, 1]}, 'x'), isNull);
    });

    test('moves, scales, grows its grid at the same zoom, and edits cells', () {
      final s = sheet(2, 2, ['a', 'b', '1', '2']);
      expect(s.rect.size, s.naturalSize);
      final big = s.scaled(Offset.zero, 2, 2);
      expect(big.scale, closeTo(2, 1e-9));
      final grown = big.resizedGrid(3, 3);
      expect(grown.cell(1, 1), '2');
      expect(grown.cell(2, 2), '');
      expect(grown.scale, closeTo(2, 1e-9));
      expect(s.translated(const Offset(10, 5)).rect.topLeft, const Offset(10, 5));
      expect(s.withCell(0, 1, 'x').cell(0, 1), 'x');
    });

    test('paints without errors', () {
      final s = sheet(3, 2, ['Year', 'Sales', '2024', '10', '2025', '=B2*2'],
          chart: const SheetChart(kind: SheetChartKind.line, labels: 'A2:A3', values: 'B2:B3'));
      final rec = ui.PictureRecorder();
      final canvas = Canvas(rec);
      paintElement(canvas, s, BoardBackground.plain);
      paintElement(canvas, s.copyWith(chart: const SheetChart(kind: SheetChartKind.pie, labels: 'A2:A3', values: 'B2:B3')), BoardBackground.plain);
      rec.endRecording().dispose();
    });
  });
}
