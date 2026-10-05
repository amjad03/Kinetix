part of 'ink_models.dart';

// --- Spreadsheets ----------------------------------------------------------------------------

/// How a sheet column shows its numbers. [inr] groups the Indian way (₹1,23,456.00); [lakh]
/// and [crore] show ₹12.35 L and ₹1.23 Cr; [number] groups without ₹; [percent] shows 0.18
/// as 18%.
enum SheetFormat { general, number, inr, lakh, crore, percent }

/// A chart drawn under a sheet's grid from two of its ranges.
enum SheetChartKind { bar, line, pie }

class SheetChart {
  const SheetChart({required this.kind, required this.labels, required this.values});

  final SheetChartKind kind;

  /// Ranges such as `A2:A6` (labels) and `B2:B6` (values).
  final String labels, values;

  @override
  bool operator ==(Object other) => other is SheetChart && other.kind == kind && other.labels == labels && other.values == values;
  @override
  int get hashCode => Object.hash(kind, labels, values);
}

/// A small spreadsheet on the board: a grid of cells holding numbers, words or formulas
/// (`=SUM(B2:B6)`, `=B2*18%`), with optional column formats in ₹ (lakh and crore) and a
/// chart from a range. [cells] holds what was typed, row by row; the board works out the
/// values (`evaluateSheet`). It is laid out at its natural size ([naturalSize]) and drawn
/// scaled to fill [rect], so resizing it zooms it.
class SheetElement extends BoardElement {
  SheetElement({
    required this.id,
    required this.rect,
    required this.rows,
    required this.cols,
    required List<String> cells,
    required this.color,
    List<SheetFormat>? formats,
    List<double>? widths,
    this.header = true,
    this.chart,
    this.rotation = 0,
  }) : cells = List.unmodifiable(List.generate(rows * cols, (i) => i < cells.length ? cells[i] : '')),
       formats = List.unmodifiable(List.generate(cols, (c) => formats != null && c < formats.length ? formats[c] : SheetFormat.general)),
       widths = List.unmodifiable(List.generate(cols, (c) => widths != null && c < widths.length ? widths[c] : defaultColumnWidth));

  /// A sheet laid out at its natural size, with its top-left corner at the origin.
  factory SheetElement.sized({
    required int rows,
    required int cols,
    required List<String> cells,
    required Color color,
    List<SheetFormat>? formats,
    List<double>? widths,
    bool header = true,
    SheetChart? chart,
  }) {
    final s = SheetElement(id: newElementId(), rect: Rect.zero, rows: rows, cols: cols, cells: cells, color: color, formats: formats, widths: widths, header: header, chart: chart);
    return s.copyWith(rect: Offset.zero & s.naturalSize);
  }

  static const defaultColumnWidth = 140.0;
  static const rowHeight = 40.0;

  /// The letters above the columns and the numbers beside the rows.
  static const headerHeight = 28.0, headerWidth = 40.0;
  static const chartHeight = 300.0;
  static const maxRows = 60, maxCols = 16;

  @override
  final String id;
  final Rect rect;
  final int rows, cols;
  final List<String> cells;
  final Color color;
  final List<SheetFormat> formats;
  final List<double> widths;

  /// The first row is a heading (bold, tinted).
  final bool header;
  final SheetChart? chart;
  @override
  final double rotation;

  String cell(int r, int c) => r < rows && c < cols ? cells[r * cols + c] : '';

  /// The size it is laid out at, before it is scaled to [rect].
  Size get naturalSize => Size(headerWidth + widths.fold(0.0, (a, b) => a + b), headerHeight + rows * rowHeight + (chart == null ? 0 : chartHeight));

  /// How much it is zoomed (the same both ways when it was resized from a corner).
  double get scale => naturalSize.width == 0 ? 1 : rect.width / naturalSize.width;

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  SheetElement copyWith({
    String? id,
    Rect? rect,
    int? rows,
    int? cols,
    List<String>? cells,
    Color? color,
    List<SheetFormat>? formats,
    List<double>? widths,
    bool? header,
    SheetChart? chart,
    bool clearChart = false,
    double? rotation,
  }) => SheetElement(
    id: id ?? this.id,
    rect: rect ?? this.rect,
    rows: rows ?? this.rows,
    cols: cols ?? this.cols,
    cells: cells ?? this.cells,
    color: color ?? this.color,
    formats: formats ?? this.formats,
    widths: widths ?? this.widths,
    header: header ?? this.header,
    chart: clearChart ? null : (chart ?? this.chart),
    rotation: rotation ?? this.rotation,
  );

  /// The same sheet with [r], [c] set to [text].
  SheetElement withCell(int r, int c, String text) {
    final next = List.of(cells);
    next[r * cols + c] = text;
    return copyWith(cells: next);
  }

  /// Rebuilt with [rows] × [cols] (cells keep their row and column), re-laid out at the same
  /// zoom and top-left corner.
  SheetElement resizedGrid(int rows, int cols) {
    rows = rows.clamp(1, maxRows);
    cols = cols.clamp(1, maxCols);
    final next = [for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) cell(r, c)];
    final k = scale;
    final s = SheetElement(id: id, rect: rect, rows: rows, cols: cols, cells: next, color: color, formats: formats, widths: widths, header: header, chart: chart, rotation: rotation);
    return s.relaidOut(k);
  }

  /// Its rect after the grid or chart changed: the same corner, at zoom [k] (default: now).
  SheetElement relaidOut([double? k]) {
    final z = k ?? scale;
    final n = naturalSize;
    return copyWith(rect: rect.topLeft & Size(n.width * z, n.height * z));
  }

  @override
  SheetElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  SheetElement scaled(Offset origin, double sx, double sy) => copyWith(rect: _scaleBox(rect, rotation, origin, sx, sy));
  @override
  SheetElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle), rotation: rotation + angle);
  @override
  SheetElement recolored(Color c) => copyWith(color: c.withValues(alpha: 1));
  @override
  SheetElement withId(String id) => copyWith(id: id);
}
