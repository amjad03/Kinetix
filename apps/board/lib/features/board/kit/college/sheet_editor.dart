import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';

/// Opens the spreadsheet editor on [sheet]; returns the edited sheet (same id, re-laid out at
/// the same zoom), or null when cancelled.
Future<SheetElement?> editSheet(BuildContext context, SheetElement sheet) =>
    showPanelDialog<SheetElement>(context: context, builder: (_) => BoardChromeTheme(child: SheetEditorDialog(sheet: sheet)));

/// A grid that shows each cell's value; tapping a cell puts what was typed in it in the edit
/// field above (numbers, words, or a formula such as =SUM(B2:B6)). Columns take a number
/// format; a chart can be drawn from two ranges.
class SheetEditorDialog extends StatefulWidget {
  const SheetEditorDialog({super.key, required this.sheet});
  final SheetElement sheet;

  @override
  State<SheetEditorDialog> createState() => _SheetEditorDialogState();
}

class _SheetEditorDialogState extends State<SheetEditorDialog> {
  late SheetElement _s = widget.sheet;
  var _r = 0, _c = 0;
  late final _cell = TextEditingController(text: _s.cell(0, 0));
  late final _labels = TextEditingController(text: _s.chart?.labels ?? 'A2:A${_s.rows}');
  late final _values = TextEditingController(text: _s.chart?.values ?? 'B2:B${_s.rows}');
  final _focus = FocusNode();

  @override
  void dispose() {
    _cell.dispose();
    _labels.dispose();
    _values.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _select(int r, int c) => setState(() {
    _r = r;
    _c = c;
    _cell.text = _s.cell(r, c);
    _focus.requestFocus();
  });

  void _grid(int rows, int cols) => setState(() {
    _s = _s.resizedGrid(rows, cols);
    _r = _r.clamp(0, _s.rows - 1);
    _c = _c.clamp(0, _s.cols - 1);
    _cell.text = _s.cell(_r, _c);
  });

  void _chart(SheetChartKind? kind) => setState(() {
    _s = (kind == null ? _s.copyWith(clearChart: true) : _s.copyWith(chart: SheetChart(kind: kind, labels: _labels.text.trim(), values: _values.text.trim()))).relaidOut();
  });

  String _fmtName(AppLocalizations l, SheetFormat f) => switch (f) {
    SheetFormat.general => l.fmtGeneral,
    SheetFormat.number => l.fmtNumber,
    SheetFormat.inr => l.fmtInr,
    SheetFormat.lakh => l.fmtLakh,
    SheetFormat.crore => l.fmtCrore,
    SheetFormat.percent => l.fmtPercent,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final values = evaluateSheet(_s);
    const rowH = 36.0, numW = 36.0;
    final colW = [for (final w in _s.widths) (w * 0.75).clamp(60.0, 320.0)];
    Widget cell(int r, int c) {
      final v = values[r * _s.cols + c];
      final selected = r == _r && c == _c;
      return InkWell(
        key: Key('sheet-cell-$r-$c'),
        onTap: () => _select(r, c),
        child: Container(
          width: colW[c],
          height: rowH,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          alignment: v.number != null ? Alignment.centerRight : Alignment.centerLeft,
          decoration: BoxDecoration(
            color: selected ? _s.color.withValues(alpha: 0.14) : (_s.header && r == 0 ? _s.color.withValues(alpha: 0.06) : null),
            border: Border.all(color: selected ? _s.color : context.colors.outlineVariant, width: selected ? 2 : 0.5),
          ),
          child: Text(
            displaySheetCell(_s, r, c),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: _s.header && r == 0 ? FontWeight.w700 : null, color: v.error != null ? context.colors.error : null),
          ),
        ),
      );
    }

    Widget head(String t, double w) => Container(
      width: w,
      height: rowH * 0.8,
      alignment: Alignment.center,
      color: context.colors.surfaceContainerHighest,
      child: Text(t, style: context.text.labelMedium),
    );

    return AlertDialog(
      key: const Key('sheet-editor'),
      title: Text(l.sheetTitle),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, 0),
      content: SizedBox(
        width: 900,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  SizedBox(width: 44, child: Text('${columnName(_c)}${_r + 1}', style: context.text.titleSmall)),
                  Expanded(
                    child: TextField(
                      key: const Key('sheet-input'),
                      controller: _cell,
                      focusNode: _focus,
                      decoration: InputDecoration(isDense: true, hintText: l.sheetCellHint),
                      onChanged: (t) => setState(() => _s = _s.withCell(_r, _c, t)),
                      onSubmitted: (_) => _select((_r + 1) % _s.rows, _c),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 360),
                child: SingleChildScrollView(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [head('', numW), for (var c = 0; c < _s.cols; c++) head(columnName(c), colW[c])]),
                        for (var r = 0; r < _s.rows; r++) Row(children: [head('${r + 1}', numW), for (var c = 0; c < _s.cols; c++) cell(r, c)]),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  IconButton(key: const Key('sheet-add-row'), tooltip: l.sheetAddRow, onPressed: () => _grid(_s.rows + 1, _s.cols), icon: const Icon(Icons.table_rows_outlined)),
                  IconButton(key: const Key('sheet-add-col'), tooltip: l.sheetAddColumn, onPressed: () => _grid(_s.rows, _s.cols + 1), icon: const Icon(Icons.view_column_outlined)),
                  IconButton(tooltip: l.sheetRemoveRow, onPressed: _s.rows > 1 ? () => _grid(_s.rows - 1, _s.cols) : null, icon: const Icon(Icons.playlist_remove)),
                  IconButton(tooltip: l.sheetRemoveColumn, onPressed: _s.cols > 1 ? () => _grid(_s.rows, _s.cols - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
                  DropdownButton<SheetFormat>(
                    key: const Key('sheet-format'),
                    value: _s.formats[_c],
                    hint: Text(l.sheetFormat),
                    items: [for (final f in SheetFormat.values) DropdownMenuItem(value: f, child: Text('${columnName(_c)}: ${_fmtName(l, f)}'))],
                    onChanged: (f) => setState(() => _s = _s.copyWith(formats: [for (var c = 0; c < _s.cols; c++) c == _c ? f! : _s.formats[c]])),
                  ),
                  FilterChip(label: Text(l.sheetHeading), selected: _s.header, onSelected: (v) => setState(() => _s = _s.copyWith(header: v))),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(l.sheetChart, style: context.text.titleSmall),
                  SizedBox(width: 150, child: TextField(key: const Key('sheet-chart-labels'), controller: _labels, decoration: InputDecoration(isDense: true, labelText: l.sheetLabels))),
                  SizedBox(width: 150, child: TextField(key: const Key('sheet-chart-values'), controller: _values, decoration: InputDecoration(isDense: true, labelText: l.sheetValues))),
                  DropdownButton<SheetChartKind?>(
                    key: const Key('sheet-chart'),
                    value: _s.chart?.kind,
                    items: [
                      DropdownMenuItem(child: Text(l.chartNone)),
                      DropdownMenuItem(value: SheetChartKind.bar, child: Text(l.chartBar)),
                      DropdownMenuItem(value: SheetChartKind.line, child: Text(l.chartLine)),
                      DropdownMenuItem(value: SheetChartKind.pie, child: Text(l.chartPie)),
                    ],
                    onChanged: _chart,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('sheet-done'),
          onPressed: () {
            // Ranges typed after the chart was chosen still count.
            final ch = _s.chart;
            final out = ch == null ? _s : _s.copyWith(chart: SheetChart(kind: ch.kind, labels: _labels.text.trim(), values: _values.text.trim()));
            Navigator.pop(context, out.relaidOut());
          },
          child: Text(l.done),
        ),
      ],
    );
  }
}
