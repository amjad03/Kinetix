import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxFonts;

import '../benches/registry.dart';
import '../content/library.dart';
import '../core/bench.dart';
import '../core/i18n.dart';
import '../core/lab.dart';

/// A lab as it stands (its settings and readings), for the board and for
/// export: [toPng] is the "Put on board" picture, [toCsv] the readings.
class LabReport {
  final VirtualLab lab;
  final LabBench bench;
  final LabParams params;
  final List<List<Object>> rows;

  const LabReport({required this.lab, required this.bench, required this.params, this.rows = const []});

  /// The lab at its starting settings with no readings (null for an unknown
  /// id or a lab that is not a bench).
  static LabReport? snapshot(String labId) {
    final l = LabLibrary.instance.byId(labId);
    final b = l == null ? null : labBenches[l.bench];
    if (l == null || b == null) return null;
    return LabReport(lab: l, bench: b, params: {...b.defaults, ...l.setup});
  }

  /// A file name for the readings, e.g. `ohms-law-readings.csv`.
  String get csvName => '${lab.id}-readings.csv';

  /// The observation table as CSV (RFC 4180: quoted when needed, CRLF).
  String toCsv() {
    String cell(String s) => s.contains(RegExp(r'[",\r\n]')) ? '"${s.replaceAll('"', '""')}"' : s;
    final cols = bench.columns;
    final out = StringBuffer()..write(['#', ...cols.map((c) => c.label)].map(cell).join(','))..write('\r\n');
    for (var i = 0; i < rows.length; i++) {
      out
        ..write(['${i + 1}', for (var k = 0; k < cols.length && k < rows[i].length; k++) _csvValue(rows[i][k])].map(cell).join(','))
        ..write('\r\n');
    }
    return out.toString();
  }

  // Numbers keep full precision in the CSV (the table rounds for display).
  static String _csvValue(Object v) => switch (v) {
        final double d => d == d.roundToDouble() && d.abs() < 1e15 ? d.toStringAsFixed(1) : '$d',
        _ => '$v',
      };

  /// A picture of the lab for the board: title, aim, the experiment as it
  /// stands, the observation table, the graph and what the readings show.
  Future<Uint8List> toPng({double width = 1400}) async {
    const margin = 48.0;
    final inner = width - 2 * margin;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Rect.fromLTWH(0, 0, width, 8000), Paint()..color = LabInk.paper);

    TextPainter para(String text, double size, {bool bold = false, Color color = LabInk.ink}) => TextPainter(
          text: TextSpan(
            text: text,
            style: TextStyle(
                fontSize: size, height: 1.35, color: color, fontWeight: bold ? FontWeight.w600 : FontWeight.w400, fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: inner);

    var y = margin;
    void write(String text, double size, {bool bold = false, Color color = LabInk.ink, double gap = 10}) {
      final tp = para(text, size, bold: bold, color: color);
      tp.paint(canvas, Offset(margin, y));
      y += tp.height + gap;
    }

    write(lab.title.text, 40, bold: true, gap: 6);
    write('${tr('Aim')}: ${lab.aim.text}', 22, color: LabInk.muted, gap: 20);

    // The experiment as it stands.
    final benchRect = Rect.fromLTWH(margin, y, inner, math.min(660.0, inner * 0.5));
    canvas.save();
    canvas.clipRect(benchRect);
    canvas.translate(benchRect.left, benchRect.top);
    bench.paint(canvas, benchRect.size, params, 0);
    canvas.restore();
    canvas.drawRect(
        benchRect,
        Paint()
          ..color = LabInk.faint
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2);
    y = benchRect.bottom + 24;

    final cols = bench.columns;
    if (rows.isNotEmpty) {
      write(tr('Observations'), 26, bold: true, gap: 8);
      final shown = rows.length > 14 ? rows.sublist(rows.length - 14) : rows;
      y += drawTable(
        canvas,
        Offset(margin, y),
        inner,
        ['#', ...cols.map((c) => c.label)],
        [
          for (var i = 0; i < shown.length; i++)
            ['${rows.length - shown.length + i + 1}', for (var k = 0; k < cols.length && k < shown[i].length; k++) cols[k].format(shown[i][k])],
        ],
        size: 18,
      );
      y += 20;
      final graph = bench.graph(params);
      if (graph != null && graph.points(rows).length >= 2) {
        final rect = Rect.fromLTWH(margin, y, math.min(900.0, inner), 440);
        canvas.drawRect(rect, Paint()..color = Colors.white);
        paintLabGraph(canvas, rect.deflate(10), graph, rows, cols);
        y = rect.bottom + 20;
      }
      final result = bench.result(rows);
      if (result != null && result.isNotEmpty) {
        write(tr('What the readings show'), 24, bold: true, gap: 6);
        write(result, 21, gap: 16);
      }
    }
    write(tr('Conclusion'), 24, bold: true, gap: 6);
    write(lab.conclusion.text, 21, gap: 0);
    y += margin;

    final picture = recorder.endRecording();
    final image = await picture.toImage(width.round(), y.ceil());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    return data!.buffer.asUint8List();
  }
}
