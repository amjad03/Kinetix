import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../../l10n/l10n.dart';
import '../chrome.dart';
import '../editors.dart';
import 'builders.dart';
import 'subjects.dart';

/// Runs a subject tool from the left rail: asks what is needed (an equation, a function, a
/// range) and puts the result in a free spot in view, selected, so it can be moved at once.
class SubjectToolRunner {
  SubjectToolRunner({required this.context, required this.wb, required this.style, required this.onOpenKit, this.primary = false});

  final BuildContext context;
  final WhiteboardController wb;
  final SubjectStyle style;

  /// Opens the subject kit at a tab (key dates for timelines).
  final void Function(KitTab tab) onOpenKit;
  final bool primary;

  Color get _ink => inkColorFor(wb.penColor, wb.background) == wb.penColor ? wb.penColor : WhiteboardController.inkBlack;
  Color get _accent => style.accent;
  BoardFont get _font => primary ? BoardFont.andika : BoardFont.inter;

  Future<T?> _dialog<T>(Widget dialog) => showDialog<T>(context: context, builder: (_) => BoardChromeTheme(child: dialog));

  /// True when [t] is on now (geometry tools showing, four-line paper).
  bool isActive(SubjectTool t) => switch (t) {
    SubjectTool.geometry => wb.ruler.value.visible || wb.protractor.value.visible || wb.tool == BoardTool.compass,
    SubjectTool.fourLine => wb.background == BoardBackground.fourLine,
    _ => false,
  };

  /// Runs [t]; [anchor] is the button's box on screen, for menus.
  Future<void> run(SubjectTool t, Rect anchor) async {
    final l = context.l10n;
    switch (t) {
      case SubjectTool.equation || SubjectTool.chemEquation:
        final tex = await _dialog<String>(MathEditorDialog(chemistry: t == SubjectTool.chemEquation));
        if (tex != null && tex.isNotEmpty) wb.insert([boardMath(tex, _accent)]);
      case SubjectTool.graph:
        final g = await _dialog<({String expression, double x, double y})>(const GraphDialog());
        if (g == null) return;
        wb.insert([
          GraphElement(
            id: newElementId(),
            rect: const Rect.fromLTWH(0, 0, 480, 360),
            expression: g.expression,
            color: _accent,
            xMin: -g.x,
            xMax: g.x,
            yMin: -g.y,
            yMax: g.y,
          ),
        ]);
      case SubjectTool.numberLine:
        final r = await _dialog<({double from, double to, double step})>(const NumberLineDialog());
        if (r != null) wb.insert(numberLine(r.from, r.to, r.step, _ink));
      case SubjectTool.geometry:
        final pick = await _menu<String>(anchor, [
          (Icons.straighten, l.toolRuler, 'ruler', wb.ruler.value.visible),
          (Icons.architecture, l.toolProtractor, 'protractor', wb.protractor.value.visible),
          (Icons.radio_button_unchecked, l.toolCompass, 'compass', wb.tool == BoardTool.compass),
        ]);
        switch (pick) {
          case 'ruler':
            wb.toggleRuler();
          case 'protractor':
            wb.toggleProtractor();
          case 'compass':
            wb.tool = wb.tool == BoardTool.compass ? BoardTool.pen : BoardTool.compass;
        }
      case SubjectTool.circuit:
        final c = await _menu<Circuit>(anchor, [for (final c in Circuit.values) (Icons.electrical_services, circuitName(l, c), c, false)]);
        if (c != null) wb.insert(circuitSymbol(c, _ink));
      case SubjectTool.atom:
        final z = await _menu<int>(anchor, [
          for (var z = 1; z <= elementSymbols.length; z++) (Icons.blur_circular, '${elementSymbols[z - 1]}  ·  ${elementNames[z - 1]}', z, false),
        ]);
        if (z != null) wb.insert(bohrAtom(z, _ink, _accent));
      case SubjectTool.flowchart:
        final s = await _menu<FlowShape>(anchor, [
          (Icons.circle_outlined, l.flowStartEnd, FlowShape.startEnd, false),
          (Icons.crop_square, l.flowProcess, FlowShape.process, false),
          (Icons.diamond_outlined, l.flowDecision, FlowShape.decision, false),
          (Icons.input, l.flowInputOutput, FlowShape.inputOutput, false),
          (Icons.arrow_forward, l.shapeArrow, FlowShape.arrow, false),
        ]);
        if (s != null) wb.insert(flowShape(s, '', _ink));
      case SubjectTool.timeline:
        onOpenKit(KitTab.dates);
      case SubjectTool.code || SubjectTool.wordCard:
        final kind = t == SubjectTool.code ? NoteKind.code : NoteKind.card;
        final text = await _dialog<String>(NoteEditorDialog(kind: kind));
        if (text == null || text.trim().isEmpty) return;
        wb.insert([
          kind == NoteKind.card
              ? wordCard(text.trim(), _accent)
              : NoteElement(id: newElementId(), rect: Offset.zero & codeBoxSize(text), text: text, color: _accent, kind: NoteKind.code),
        ]);
      case SubjectTool.fourLine:
        wb.background = wb.background == BoardBackground.fourLine ? style.paper : BoardBackground.fourLine;
      case SubjectTool.grammar:
        wb.insert(grammarLegend(_ink));
    }
    if (_font == BoardFont.andika) wb.font = BoardFont.andika;
  }

  Future<T?> _menu<T>(Rect anchor, List<(IconData, String, T, bool)> items) {
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final position = RelativeRect.fromRect(Rect.fromLTWH(anchor.right + 8, anchor.top, 1, anchor.height), Offset.zero & overlay.size);
    return showMenu<T>(
      context: context,
      position: position,
      items: [
        for (final (icon, label, value, selected) in items)
          CheckedPopupMenuItem<T>(value: value, checked: selected, child: Row(children: [Icon(icon, size: 20), const SizedBox(width: 12), Flexible(child: Text(label))])),
      ],
    );
  }
}

/// A code block's card: wide enough for its longest line, tall enough for every line.
Size codeBoxSize(String code) {
  final lines = code.replaceAll('\t', '    ').split('\n');
  final longest = lines.fold(0, (m, l) => l.length > m ? l.length : m);
  return Size((longest * 11.3 + 40).clamp(240, 1400).toDouble(), (lines.length * 25.4 + 50).clamp(100, 1000).toDouble());
}

String circuitName(AppLocalizations l, Circuit c) => switch (c) {
  Circuit.cell => l.circuitCell,
  Circuit.battery => l.circuitBattery,
  Circuit.bulb => l.circuitBulb,
  Circuit.switchOpen => l.circuitSwitchOpen,
  Circuit.switchClosed => l.circuitSwitchClosed,
  Circuit.resistor => l.circuitResistor,
  Circuit.ammeter => l.circuitAmmeter,
  Circuit.voltmeter => l.circuitVoltmeter,
  Circuit.led => l.circuitLed,
  Circuit.earth => l.circuitEarth,
  Circuit.wire => l.circuitWire,
};
