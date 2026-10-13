import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import 'biz/biz_strings.dart';
import 'biz/kit_editors.dart';

/// Opens the spreadsheet editor on [sheet]; returns the edited sheet (same id, re-laid out at
/// the same zoom), or null when cancelled. With [onChart], a chart built from selected cells
/// can be put on the board as a chart panel of its own.
Future<SheetElement?> editSheet(BuildContext context, SheetElement sheet, {void Function(KitElement chart)? onChart}) =>
    showPanelDialog<SheetElement>(context: context, builder: (_) => BoardChromeTheme(child: SheetEditorDialog(sheet: sheet, onChart: onChart)));

/// The cells from [r0], [c0] to [r1], [c1] of [s] as chart data: the first column labels, the
/// others series, a first row of words their names. Values are taken as worked out.
ChartData chartFromCells(SheetElement s, int r0, int c0, int r1, int c1, {KitChartKind kind = KitChartKind.bar}) {
  final values = evaluateSheet(s);
  String at(int r, int c) {
    final v = values[r * s.cols + c];
    return v.number != null ? formatGeneral(v.number!) : (v.text ?? '').replaceAll('\t', ' ');
  }

  final lines = [
    for (var r = r0; r <= r1; r++) [for (var c = c0; c <= c1; c++) at(r, c)].join('\t'),
  ];
  return ChartData.fromCsv(lines.join('\n'), kind: kind);
}

/// A grid that shows each cell's value; tapping a cell puts what was typed in it in the edit
/// field above (numbers, words, or a formula such as =SUM(B2:B6)). Columns take a number
/// format; a chart can be drawn from two ranges.
class SheetEditorDialog extends StatefulWidget {
  const SheetEditorDialog({super.key, required this.sheet, this.onChart});
  final SheetElement sheet;
  final void Function(KitElement chart)? onChart;

  @override
  State<SheetEditorDialog> createState() => _SheetEditorDialogState();
}

class _SheetEditorDialogState extends State<SheetEditorDialog> {
  late SheetElement _s = widget.sheet;
  var _r = 0, _c = 0;

  /// The far corner of a selected range (long-press), or null for one cell.
  (int, int)? _end;
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

  (int, int, int, int) get _range {
    final (er, ec) = _end ?? (_r, _c);
    return (_r < er ? _r : er, _c < ec ? _c : ec, _r > er ? _r : er, _c > ec ? _c : ec);
  }

  bool _inRange(int r, int c) {
    final (r0, c0, r1, c1) = _range;
    return r >= r0 && r <= r1 && c >= c0 && c <= c1;
  }

  /// Copies the current cell down (or right) over the selected range, or to the end of the
  /// column (row) when only one cell is selected.
  void _fill({required bool down}) => setState(() {
    final (r0, c0, r1, c1) = _range;
    final single = _end == null;
    final targets = down
        ? [for (var r = _r + 1; r <= (single ? _s.rows - 1 : r1); r++) for (var c = single ? _c : c0; c <= (single ? _c : c1); c++) (r, c)]
        : [for (var r = single ? _r : r0; r <= (single ? _r : r1); r++) for (var c = _c + 1; c <= (single ? _s.cols - 1 : c1); c++) (r, c)];
    _s = fillSheetCells(_s, _r, _c, targets);
  });

  Future<void> _chartFromSelection() async {
    final (r0, c0, r1, c1) = _range;
    final data = _end == null ? chartFromCells(_s, 0, 0, _s.rows - 1, _s.cols - 1) : chartFromCells(_s, r0, c0, r1, c1);
    final k = await editKit(context, KitElement.sized(kind: KitKind.chart, data: data.toJson(), color: _s.color));
    if (k != null) widget.onChart?.call(k);
  }

  void _select(int r, int c) => setState(() {
    _r = r;
    _c = c;
    _end = null;
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
    final b = bizStrings(context);
    final values = evaluateSheet(_s);
    const rowH = 36.0, numW = 36.0;
    final colW = [for (final w in _s.widths) (w * 0.75).clamp(60.0, 320.0)];
    Widget cell(int r, int c) {
      final v = values[r * _s.cols + c];
      final selected = r == _r && c == _c;
      final ranged = !selected && _end != null && _inRange(r, c);
      return InkWell(
        key: Key('sheet-cell-$r-$c'),
        onTap: () => _select(r, c),
        onLongPress: () => setState(() => _end = (r, c)),
        child: Container(
          width: colW[c],
          height: rowH,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          alignment: v.number != null ? Alignment.centerRight : Alignment.centerLeft,
          decoration: BoxDecoration(
            color: selected || ranged ? _s.color.withValues(alpha: ranged ? 0.08 : 0.14) : (_s.header && r == 0 ? _s.color.withValues(alpha: 0.06) : null),
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
                      DropdownMenuItem(value: SheetChartKind.scatter, child: Text(b['scatter'])),
                    ],
                    onChanged: _chart,
                  ),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  DropdownButton<SheetFormat?>(
                    key: const Key('sheet-cell-format'),
                    value: _s.cellFormats[_r * _s.cols + _c],
                    items: [
                      DropdownMenuItem(child: Text('${columnName(_c)}${_r + 1}: ${b['asColumn']}')),
                      for (final f in SheetFormat.values) DropdownMenuItem(value: f, child: Text('${columnName(_c)}${_r + 1}: ${_fmtName(l, f)}')),
                    ],
                    onChanged: (f) => setState(() => _s = _s.withCellFormat(_r, _c, f)),
                  ),
                  TextButton.icon(key: const Key('sheet-fill-down'), onPressed: () => _fill(down: true), icon: const Icon(Icons.south), label: Text(b['fillDown'])),
                  TextButton.icon(key: const Key('sheet-fill-right'), onPressed: () => _fill(down: false), icon: const Icon(Icons.east), label: Text(b['fillRight'])),
                  if (widget.onChart != null)
                    TextButton.icon(key: const Key('sheet-chart-selection'), onPressed: _chartFromSelection, icon: const Icon(Icons.insert_chart_outlined), label: Text(b['chartSelection'])),
                  Text(b['selectHint'], style: context.text.bodySmall),
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
