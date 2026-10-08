import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/board_controller.dart';
import '../chrome.dart';
import '../sb_strings.dart';

/// The Pen module's five capabilities (spec §13).
enum PenMode { solid, highlighter, twoSide, textAi, shapeAi }

/// Which mode the board is in now. Two Side is a settings view over the solid pen.
PenMode currentPenMode(WhiteboardController wb, BoardController board, {bool twoSide = false}) {
  if (twoSide) return PenMode.twoSide;
  if (wb.tool == BoardTool.highlighter) return PenMode.highlighter;
  if (wb.tool == BoardTool.aiPen) {
    final c = board.aiPenConvert;
    if (c.contains('text') && !c.contains('shapes')) return PenMode.textAi;
    if (c.contains('shapes') && !c.contains('text')) return PenMode.shapeAi;
  }
  return PenMode.solid;
}

/// Switches the board to [mode]: Text AI turns words into text, Shape AI tidies shapes.
void pickPenMode(PenMode mode, WhiteboardController wb, BoardController board) {
  void convert({required bool text, required bool shapes}) {
    board
      ..setAiPenConvert('text', text)
      ..setAiPenConvert('shapes', shapes)
      ..setAiPenConvert('maths', false);
  }

  switch (mode) {
    case PenMode.solid || PenMode.twoSide:
      wb.penNib = PenNib.round;
      wb.tool = BoardTool.pen;
    case PenMode.highlighter:
      wb.tool = BoardTool.highlighter;
    case PenMode.textAi:
      convert(text: true, shapes: false);
      wb.tool = BoardTool.aiPen;
    case PenMode.shapeAi:
      convert(text: false, shapes: true);
      wb.tool = BoardTool.aiPen;
  }
  wb.update(() {});
}

/// Applies the teacher's stylus tips to the board.
void applyStylusTips(WhiteboardController wb, BoardController board) {
  wb
    ..frontTip = StylusTip.values.asNameMap()[board.sbPref('frontTip') ?? ''] ?? StylusTip.write
    ..backTip = StylusTip.values.asNameMap()[board.sbPref('backTip') ?? ''] ?? StylusTip.erase;
}

/// Where a teacher's own Text AI font is kept. Tests replace it.
Future<Directory> Function() fontDirectory = getApplicationSupportDirectory;

/// Loads the teacher's own font (if any) under [customBoardFontFamily]. Safe to call again.
Future<void> loadCustomBoardFont(BoardController board) async {
  final path = board.sbPref('customFontPath');
  if (path == null) return;
  try {
    final bytes = await File(path).readAsBytes();
    await (FontLoader(customBoardFontFamily)..addFont(Future.value(ByteData.sublistView(bytes)))).load();
  } catch (e) {
    debugPrint('Custom font not loaded: $e');
  }
}

String penModeLabel(SbStrings s, PenMode m) => switch (m) {
  PenMode.solid => s('solidPen'),
  PenMode.highlighter => s('highlighter'),
  PenMode.twoSide => s('twoSide'),
  PenMode.textAi => s('textAi'),
  PenMode.shapeAi => s('shapeAi'),
};

IconData penModeIcon(PenMode m) => switch (m) {
  PenMode.solid => Icons.edit_outlined,
  PenMode.highlighter => Icons.border_color_outlined,
  PenMode.twoSide => Icons.swap_vert,
  PenMode.textAi => Icons.text_fields,
  PenMode.shapeAi => Icons.category_outlined,
};

/// The row of five modes at the top of the Pen popover.
class PenModeBar extends StatelessWidget {
  const PenModeBar({super.key, required this.mode, required this.onPick});

  final PenMode mode;
  final ValueChanged<PenMode> onPick;

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final m in PenMode.values)
          ChoiceChip(
            key: Key('pen-mode-${m.name}'),
            avatar: Icon(penModeIcon(m), size: 18),
            label: Text(penModeLabel(s, m)),
            showCheckmark: false,
            selected: mode == m,
            onSelected: (_) => onPick(m),
          ),
      ],
    );
  }
}

/// Two Side: Front Tip and Back Tip, each set on its own; the change applies at once.
class TwoSideSettings extends StatelessWidget {
  const TwoSideSettings({super.key, required this.wb, required this.board});

  final WhiteboardController wb;
  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    String name(StylusTip t) => switch (t) {
      StylusTip.write => s('tipWrite'),
      StylusTip.erase => s('tipErase'),
      StylusTip.select => s('tipSelect'),
      StylusTip.highlight => s('tipHighlight'),
    };
    Widget tip(String key, String title, StylusTip value, List<StylusTip> options) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.text.labelLarge),
        const SizedBox(height: Kx.s4),
        SegmentedButton<StylusTip>(
          key: Key(key),
          showSelectedIcon: false,
          segments: [for (final o in options) ButtonSegment(value: o, label: Text(name(o)))],
          selected: {value},
          onSelectionChanged: (v) {
            board.setSbPref(key == 'front-tip' ? 'frontTip' : 'backTip', v.single.name);
            applyStylusTips(wb, board);
          },
        ),
      ],
    );
    return Column(
      key: const Key('two-side'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(s('twoSideHint'), style: context.text.bodySmall),
        const SizedBox(height: Kx.s8),
        tip('front-tip', s('frontTip'), wb.frontTip, const [StylusTip.write, StylusTip.highlight]),
        const SizedBox(height: Kx.s12),
        tip('back-tip', s('backTip'), wb.backTip, StylusTip.values),
      ],
    );
  }
}

/// Text AI: the handwriting language (13) and the font the words become.
class TextAiSettings extends StatelessWidget {
  const TextAiSettings({super.key, required this.board});

  final BoardController board;

  Future<void> _pickFont(BuildContext context) async {
    try {
      final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['ttf', 'otf']);
      if (f == null) return;
      final bytes = await f.xFile.readAsBytes();
      final dir = await fontDirectory();
      final file = File('${dir.path}/text-ai-font-${board.session?.teacherId ?? 'board'}');
      await file.writeAsBytes(bytes, flush: true);
      board
        ..setSbPref('customFontPath', file.path)
        ..setSbPref('textAiFont', BoardFont.custom.name);
      await loadCustomBoardFont(board);
    } catch (e) {
      if (context.mounted) showBoardMessage(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final font = board.textAiFont ?? BoardFont.inter;
    return Column(
      key: const Key('text-ai'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          key: const Key('text-ai-language'),
          initialValue: textAiLanguages.containsKey(board.textAiLanguage) ? board.textAiLanguage : 'en',
          decoration: InputDecoration(labelText: s('language')),
          items: [for (final e in textAiLanguages.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: (v) => board.setSbPref('textAiLang', v),
        ),
        const SizedBox(height: Kx.s12),
        Text(s('font'), style: context.text.labelLarge),
        const SizedBox(height: Kx.s4),
        Row(
          children: [
            SegmentedButton<BoardFont>(
              key: const Key('text-ai-font'),
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: BoardFont.inter, label: Text(s('fontDefault'))),
                ButtonSegment(value: BoardFont.kalam, label: Text(s('fontKalam'), style: const TextStyle(fontFamily: KxFonts.kalam))),
                ButtonSegment(value: BoardFont.custom, label: Text(s('fontCustom')), enabled: board.sbPref('customFontPath') != null),
              ],
              selected: {font == BoardFont.andika ? BoardFont.inter : font},
              onSelectionChanged: (v) => board.setSbPref('textAiFont', v.single == BoardFont.inter ? null : v.single.name),
            ),
            const SizedBox(width: Kx.s8),
            IconButton.outlined(key: const Key('text-ai-font-add'), tooltip: s('fontCustom'), onPressed: () => unawaited(_pickFont(context)), icon: const Icon(Icons.upload_file)),
          ],
        ),
      ],
    );
  }
}
