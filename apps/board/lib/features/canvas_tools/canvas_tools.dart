import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'graph_templates_panel.dart';

export 'graph_templates_panel.dart';

/// The board's canvas tools, for the board's toolbars to call: the geometry box (as objects on
/// the board, several at once), flowcharts and mind maps with "add next", and graph templates by
/// subject and topic. The tools themselves live in kinetix_ink (so every viewer of a board knows
/// the elements); this is where the Board opens them and keeps the screen calibration.
///
/// The geometry tools are drawn over the teacher's board only: they are instruments, not page
/// elements, so the projector mirror and the live class see what is drawn with them (strokes,
/// arcs, circles) but not the tools.
class CanvasTools {
  CanvasTools._();

  static const _calKey = 'canvasTools.pxPerCm', _inchKey = 'canvasTools.inches';
  static Future<void>? _loading;

  /// Reads this device's calibration once and saves it whenever it changes.
  static Future<void> loadCalibration() => _loading ??= () async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final px = prefs.getDouble(_calKey);
      if (px != null && px > 5 && px < 200) GeoCalibration.pxPerCm.value = px;
      GeoCalibration.inches.value = prefs.getBool(_inchKey) ?? false;
      GeoCalibration.onChanged = () async {
        final p = await SharedPreferences.getInstance();
        await p.setDouble(_calKey, GeoCalibration.pxPerCm.value);
        await p.setBool(_inchKey, GeoCalibration.inches.value);
      };
    } on Object {
      // No storage (tests, a locked-down kiosk): the device's usual density is used.
    }
  }();

  static void _open(WhiteboardController wb, GeoKind kind) {
    unawaited(loadCalibration());
    wb.addGeoTool(kind);
  }

  static void openRuler(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.ruler);
  static void openProtractor(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.protractor);

  /// The full-circle protractor.
  static void openProtractor360(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.protractor360);
  static void openSetSquare45(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.setSquare45);
  static void openSetSquare3060(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.setSquare3060);
  static void openCompass(BuildContext context, WhiteboardController wb) => _open(wb, GeoKind.compass);

  /// Matches the scales to this screen.
  static Future<void> calibrate(BuildContext context) async {
    await loadCalibration();
    if (context.mounted) await showGeoCalibrationDialog(context);
  }

  /// Starts a flowchart (a Start block) or a mind map (a centre topic), selected, so its ＋
  /// buttons show at once.
  static Future<void> insertFlowchart(BuildContext context, WhiteboardController wb) async {
    final s = ToolStrings.of(context);
    final mind = await showDialog<bool>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text(s.t('insertFlowTitle')),
        children: [
          _choice(ctx, const Key('insert-flowchart'), Icons.account_tree_outlined, s.t('flowchart'), false),
          _choice(ctx, const Key('insert-mindmap'), Icons.bubble_chart_outlined, s.t('mindMap'), true),
        ],
      ),
    );
    if (mind == null) return;
    wb.insert([starterNode(mindMap: mind, color: wb.penColor, words: s.flowWords)]);
    if (context.mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('flowchartHint')), duration: const Duration(seconds: 4)));
    }
  }

  static Widget _choice(BuildContext ctx, Key key, IconData icon, String label, bool value) => SimpleDialogOption(
    key: key,
    onPressed: () => Navigator.pop(ctx, value),
    child: Row(
      children: [
        Icon(icon),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontSize: 16)),
      ],
    ),
  );

  /// Graph templates for the period: Subject and Topic dropdowns (preselected from [subject] and
  /// [topic]), a search, and "Add to board".
  static Widget graphTemplatesPanel({required WhiteboardController controller, String? subject, String? topic}) =>
      GraphTemplatesPanel(controller: controller, subject: subject, topic: topic);
}
