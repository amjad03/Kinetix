import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'codebook.dart';

/// Draws answer card [number] (A on top) filling [r]: a white margin, the
/// black 7×7 pattern, the four answer letters on its edges, and the card's
/// number small in a corner. Used for the preview and the tests; the PDF
/// below lays out the same card for printing.
void paintAnswerCard(Canvas canvas, Rect r, int number, {String? name}) {
  canvas.drawRect(r, Paint()..color = Colors.white);
  // The pattern sits inside a white margin a little wider than one cell.
  final side = r.shortestSide * 0.72;
  final box = Rect.fromCenter(center: r.center, width: side, height: side);
  final cell = side / cardGrid;
  final black = Paint()..color = Colors.black;
  final cells = cardCells(number);
  for (var row = 0; row < cardGrid; row++) {
    for (var k = 0; k < cardGrid; k++) {
      if (cells[row][k]) canvas.drawRect(Rect.fromLTWH(box.left + k * cell, box.top + row * cell, cell + 0.5, cell + 0.5), black);
    }
  }
  void letter(String s, Offset at, double angle) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontSize: r.shortestSide * 0.07, color: const Color(0xFF606060), fontWeight: FontWeight.w600)),
      textDirection: TextDirection.ltr,
    )..layout();
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.rotate(angle);
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  final m = (r.shortestSide - side) / 4;
  letter('A', Offset(r.center.dx, box.top - m), 0);
  letter('B', Offset(box.right + m, r.center.dy), 1.5708);
  letter('C', Offset(r.center.dx, box.bottom + m), 3.1416);
  letter('D', Offset(box.left - m, r.center.dy), -1.5708);
}

/// One student's card on the printed sheet: the card number (bound to the student by the API)
/// and who it belongs to.
class PrintableCard {
  const PrintableCard({required this.number, this.name = '', this.rollNo = ''});
  final int number;
  final String name;
  final String rollNo;
}

/// Printable cards for a class, one large card per A4 page so they read from the back of the
/// room. [theme] carries fonts for names in Hindi or Kannada; [hint] is the line printed under
/// each card, in the teacher's language.
Future<Uint8List> answerCardsPdf({
  required String classLabel,
  required List<PrintableCard> cards,
  pw.ThemeData? theme,
  String hint = 'Hold the card with your answer at the top. Keep your fingers off the black pattern.',
}) async {
  final doc = pw.Document(title: 'KINETIX answer cards · $classLabel', theme: theme);
  for (final card in cards) {
    if (card.number < 1 || card.number > maxCards) continue;
    final cells = cardCells(card.number);
    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (ctx) {
        const side = 17 * PdfPageFormat.cm;
        const cell = side / cardGrid;
        pw.Widget letter(String s, double turns) => pw.Transform.rotate(
              angle: turns * 3.14159265 / 2,
              child: pw.Text(s, style: pw.TextStyle(fontSize: 34, color: PdfColors.grey700, fontWeight: pw.FontWeight.bold)),
            );
        return pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            pw.Text('${card.number}', style: pw.TextStyle(fontSize: 13, color: PdfColors.grey600)),
            pw.Text([classLabel, if (card.rollNo.isNotEmpty) card.rollNo, if (card.name.isNotEmpty) card.name].join(' · '),
                style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey600)),
          ]),
          pw.Spacer(),
          pw.Center(child: letter('A', 0)),
          pw.SizedBox(height: 14),
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.center, children: [
            letter('D', -1),
            pw.SizedBox(width: 14),
            pw.SizedBox(
              width: side,
              height: side,
              child: pw.Stack(children: [
                for (var r = 0; r < cardGrid; r++)
                  for (var k = 0; k < cardGrid; k++)
                    if (cells[r][k])
                      pw.Positioned(left: k * cell, top: r * cell, child: pw.Container(width: cell + 0.6, height: cell + 0.6, color: PdfColors.black)),
              ]),
            ),
            pw.SizedBox(width: 14),
            letter('B', 1),
          ]),
          pw.SizedBox(height: 14),
          pw.Center(child: letter('C', 2)),
          pw.Spacer(),
          pw.Text(hint, textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)),
        ]);
      },
    ));
  }
  return doc.save();
}
