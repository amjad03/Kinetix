import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'board_background.dart';
import 'ink_models.dart';
import 'sheet_formula.dart';

/// The saved-board format version. 1: pages of strokes. 2: a page's `strokes` may also hold the
/// other board elements (text, pictures, equations, graphs, figures, notes, sheets, flowchart
/// blocks and arrows, each with its own `t`), and a page may list its `groups`. Readers skip kinds they do not know, so a board
/// saved by a newer app still opens in an older one, without the new kinds.
const int boardFormatVersion = 2;

/// A saved board as stored by KINETIX Cloud (`WhiteboardContent` in services/api).
class SavedBoard {
  const SavedBoard({required this.background, required this.canvas, required this.pages, this.groups = const [], this.pageBackgrounds = const []});

  /// The first page's paper (and every page's, for boards saved before pages had their own).
  final BoardBackground background;

  /// Each page's paper; a missing page uses [background].
  final List<BoardBackground> pageBackgrounds;

  /// Page [i]'s paper.
  BoardBackground backgroundOf(int i) => i < pageBackgrounds.length ? pageBackgrounds[i] : background;

  /// The screen size the board was drawn on, in logical pixels. The board is endless, so
  /// elements may lie outside it; viewers show this area and anything beyond it.
  final Size canvas;

  /// Each page's elements, bottom first.
  final List<List<BoardElement>> pages;

  /// Each page's groups, as lists of element positions on the page (missing pages: none).
  final List<List<List<int>>> groups;

  int get pageCount => pages.length;

  /// The JSON body for `PUT /v1/whiteboards/:id` (title and share are added by the caller).
  Map<String, dynamic> toJson() => {
    'v': boardFormatVersion,
    'background': background.name,
    'canvas': {'w': canvas.width.round(), 'h': canvas.height.round()},
    'pages': [
      for (var i = 0; i < pages.length; i++)
        {
          'strokes': [for (final e in pages[i]) encodeElement(e)],
          if (i < groups.length && groups[i].isNotEmpty) 'groups': groups[i],
          if (backgroundOf(i) != background) 'background': backgroundOf(i).name,
        },
    ],
  };

  /// Reads `content` from `GET /v1/whiteboards/:id`. Unknown kinds, tools or shapes are skipped,
  /// so an older app can still open a board saved by a newer one.
  factory SavedBoard.fromJson(Map<String, dynamic> j) {
    final canvas = j['canvas'] as Map<String, dynamic>?;
    var n = 0;
    final pages = <List<BoardElement>>[];
    final groups = <List<List<int>>>[];
    final board = BoardBackground.values.asNameMap()[j['background']] ?? BoardBackground.plain;
    final backgrounds = <BoardBackground>[];
    for (final raw in (j['pages'] as List<dynamic>? ?? const [])) {
      final page = raw as Map<String, dynamic>;
      backgrounds.add(BoardBackground.values.asNameMap()[page['background']] ?? board);
      final items = page['strokes'] as List<dynamic>? ?? const [];
      // Group positions refer to the stored list; skipped items shift what follows.
      final at = <int, int>{};
      final elements = <BoardElement>[];
      for (var i = 0; i < items.length; i++) {
        final e = items[i] is Map<String, dynamic> ? decodeElement(items[i] as Map<String, dynamic>, 'saved${n++}') : null;
        if (e == null) continue;
        at[i] = elements.length;
        elements.add(e);
      }
      pages.add(elements);
      groups.add([
        for (final g in (page['groups'] as List<dynamic>? ?? const []))
          if (g is List) [for (final i in g) if (i is num && at[i.toInt()] != null) at[i.toInt()]!],
      ]..removeWhere((g) => g.length < 2));
    }
    return SavedBoard(
      background: board,
      pageBackgrounds: backgrounds,
      canvas: Size(((canvas?['w'] as num?) ?? 1920).toDouble(), ((canvas?['h'] as num?) ?? 1080).toDouble()),
      pages: pages,
      groups: groups,
    );
  }

  /// Only the strokes (pen, highlighter, shapes) of [page].
  List<Stroke> strokesOf(int page) => page < pages.length ? pages[page].whereType<Stroke>().toList() : const [];
}

double _round1(double v) => (v * 10).roundToDouble() / 10;
double _round3(double v) => (v * 1000).roundToDouble() / 1000;
List<double> _rect(Rect r) => [_round1(r.left), _round1(r.top), _round1(r.width), _round1(r.height)];

Rect? _readRect(Object? raw) {
  if (raw is! List || raw.length < 4 || !raw.every((v) => v is num)) return null;
  final r = raw.cast<num>();
  return Rect.fromLTWH(r[0].toDouble(), r[1].toDouble(), r[2].toDouble(), r[3].toDouble());
}

Map<String, dynamic> encodeStroke(Stroke s) => {
  't': switch (s.style.tool) {
    InkTool.highlighter => 'highlighter',
    InkTool.shape => 'shape',
    _ => 'pen',
  },
  'c': s.style.color.toARGB32(),
  'w': s.style.width,
  if (s.shape != null) 's': s.shape!.name,
  if (s.fill != null) 'f': s.fill!.toARGB32(),
  if (s.style.nib != PenNib.round) 'n': s.style.nib.name,
  if (s.style.pressure) 'pr': [for (final p in s.points) (p.pressure * 100).round()],
  // Flat [x0, y0, x1, y1, …] to 0.1 px: plenty for ink, a third of the size of objects.
  'p': [
    for (final p in s.points) ...[_round1(p.x), _round1(p.y)],
  ],
};

Stroke? decodeStroke(Map<String, dynamic> j, String id) {
  final tool = switch (j['t']) {
    'pen' => InkTool.pen,
    'highlighter' => InkTool.highlighter,
    'shape' => InkTool.shape,
    _ => null,
  };
  final flat = (j['p'] as List<dynamic>?)?.cast<num>();
  if (tool == null || flat == null || flat.length < 2) return null;
  final shape = j['s'] == null ? null : ShapeKind.values.asNameMap()[j['s']];
  if (tool == InkTool.shape && shape == null) return null;
  final pressures = (j['pr'] as List<dynamic>?)?.cast<num>();
  return Stroke(
    id: id,
    shape: shape,
    fill: j['f'] is num ? Color((j['f'] as num).toInt()) : null,
    style: InkStyle(
      tool: tool,
      color: Color((j['c'] as num).toInt()),
      width: (j['w'] as num).toDouble(),
      shape: shape ?? ShapeKind.rectangle,
      nib: PenNib.values.asNameMap()[j['n']] ?? PenNib.round,
      pressure: pressures != null,
    ),
    points: [
      for (var i = 0; i + 1 < flat.length; i += 2)
        InkPoint(flat[i].toDouble(), flat[i + 1].toDouble(), pressures != null && i ~/ 2 < pressures.length ? pressures[i ~/ 2] / 100 : 0.5),
    ],
  );
}

/// Any board element as JSON. Strokes keep their original encoding; the other kinds are told
/// apart by `t`. Pictures carry their bytes in `d` (base64), unless [imageRef] gives a
/// reference to bytes the reader already has (`ref`, used by live streams).
Map<String, dynamic> encodeElement(BoardElement e, {Object? Function(Uint8List bytes)? imageRef}) => switch (e) {
  Stroke() => encodeStroke(e),
  TextElement() => {
    't': 'text',
    'x': _round1(e.position.dx),
    'y': _round1(e.position.dy),
    'tx': e.text,
    'c': e.color.toARGB32(),
    'fs': _round1(e.fontSize),
    'sw': _round1(e.size.width),
    'sh': _round1(e.size.height),
    if (e.bold) 'b': true,
    if (e.font != BoardFont.inter) 'f': e.font.name,
    if (e.rotation != 0) 'a': _round3(e.rotation),
  },
  ImageElement() => {
    't': 'image',
    'r': _rect(e.rect),
    if (imageRef?.call(e.bytes) case final ref?) 'ref': ref else 'd': base64Encode(e.bytes),
    if (e.link != null) 'ln': e.link!.toJson(),
    if (e.rotation != 0) 'a': _round3(e.rotation),
    if (e.backdrop) 'bg': true,
  },
  MathElement() => {
    't': 'math',
    'x': _round1(e.position.dx),
    'y': _round1(e.position.dy),
    'tex': e.latex,
    'c': e.color.toARGB32(),
    'fs': _round1(e.fontSize),
    'sw': _round1(e.size.width),
    'sh': _round1(e.size.height),
    if (e.rotation != 0) 'a': _round3(e.rotation),
  },
  GraphElement() => encodeGraph(e),
  PolygonElement() => {
    't': 'polygon',
    'p': [
      for (final p in e.points) ...[_round1(p.dx), _round1(p.dy)],
    ],
    'c': e.color.toARGB32(),
    'w': e.width,
    if (!e.closed) 'o': true,
    if (e.fill != null) 'f': e.fill!.toARGB32(),
  },
  NoteElement() => {
    't': 'note',
    'r': _rect(e.rect),
    'tx': e.text,
    'c': e.color.toARGB32(),
    'fs': _round1(e.fontSize),
    if (e.kind != NoteKind.note) 'k': e.kind.name,
    if (e.language != null) 'lg': e.language,
    if (e.rotation != 0) 'a': _round3(e.rotation),
  },
  SheetElement() => encodeSheet(e),
  FlowNodeElement() => {
    't': 'flow',
    'id': e.id,
    'r': _rect(e.rect),
    'k': e.shape.name,
    if (e.text.isNotEmpty) 'tx': e.text,
    'c': e.color.toARGB32(),
    if (e.fill != null) 'f': e.fill!.toARGB32(),
    if (e.fontSize != 22) 'fs': _round1(e.fontSize),
  },
  FlowLinkElement() => {
    't': 'flowlink',
    'fr': e.from,
    'to': e.to,
    'sd': [e.fromSide.index, e.toSide.index],
    if (e.label.isNotEmpty) 'l': e.label,
    'c': e.color.toARGB32(),
    if (e.curved) 'cv': true,
    'p': [
      for (final p in e.points) ...[_round1(p.dx), _round1(p.dy)],
    ],
  },
};

/// A graph. `e` (and `x` for further curves) are written with the parameters already put in,
/// so readers that know nothing of parameters still plot it; `et`, `xt` and `pm` keep the
/// editable templates and their values.
Map<String, dynamic> encodeGraph(GraphElement e) {
  final templated = e.params.isNotEmpty;
  return {
    't': 'graph',
    'r': _rect(e.rect),
    'e': e.resolvedExpression,
    if (templated) 'et': e.expression,
    'v': [e.xMin, e.xMax, e.yMin, e.yMax],
    'c': e.color.toARGB32(),
    if (e.rotation != 0) 'a': _round3(e.rotation),
    if (e.curves.isNotEmpty) 'x': e.resolvedCurves,
    if (templated && e.curves.isNotEmpty) 'xt': e.curves,
    if (templated) 'pm': e.params,
    if (e.points.isNotEmpty)
      'pt': [
        for (final p in e.points) [_round3(p.x), _round3(p.y), if (p.label.isNotEmpty) p.label],
      ],
    if (e.shade != null) 'sh': [e.shade!.from, e.shade!.to, if (e.shade!.between) 1],
    if (e.xLabel.isNotEmpty) 'lx': e.xLabel,
    if (e.yLabel.isNotEmpty) 'ly': e.yLabel,
    if (e.title.isNotEmpty) 'ti': e.title,
  };
}

/// A sheet: what was typed (`d`, row by row) and its layout; the reader works the values out
/// again. `out` (each cell as shown) and `cv` (the chart's labels and numbers) are for viewers
/// without a formula engine (the web live view); the board ignores them.
Map<String, dynamic> encodeSheet(SheetElement e) {
  final chart = e.chart == null ? null : sheetChartData(e);
  return {
    't': 'sheet',
    'r': _rect(e.rect),
    'n': [e.rows, e.cols],
    'd': e.cells,
    'c': e.color.toARGB32(),
    if (e.formats.any((f) => f != SheetFormat.general)) 'fm': [for (final f in e.formats) f.name],
    if (e.widths.any((w) => w != SheetElement.defaultColumnWidth)) 'cw': [for (final w in e.widths) _round1(w)],
    if (!e.header) 'h': false,
    if (e.chart != null) 'ch': {'k': e.chart!.kind.name, 'l': e.chart!.labels, 'v': e.chart!.values},
    'out': [for (var r = 0; r < e.rows; r++) for (var c = 0; c < e.cols; c++) displaySheetCell(e, r, c)],
    if (chart != null) 'cv': {'l': chart.labels, 'v': chart.values},
    if (e.rotation != 0) 'a': _round3(e.rotation),
  };
}

/// Reads an element written by [encodeElement]. Returns null for a kind this app does not know
/// or a malformed one, so newer boards still open. [image] resolves a `ref` to bytes.
BoardElement? decodeElement(Map<String, dynamic> j, String id, {Uint8List? Function(Object ref)? image}) {
  try {
    double n(String k, [double fallback = 0]) => (j[k] as num?)?.toDouble() ?? fallback;
    Color color([String k = 'c']) => Color(((j[k] as num?) ?? 0xFF1B1F24).toInt());
    final angle = n('a');
    switch (j['t']) {
      case 'pen' || 'highlighter' || 'shape':
        return decodeStroke(j, id);
      case 'text':
        final text = j['tx'];
        if (text is! String) return null;
        return TextElement(
          id: id,
          position: Offset(n('x'), n('y')),
          text: text,
          color: color(),
          fontSize: n('fs', 32),
          size: Size(n('sw', 32), n('sh', 40)),
          bold: j['b'] == true,
          font: BoardFont.values.asNameMap()[j['f']] ?? BoardFont.inter,
          rotation: angle,
        );
      case 'image':
        final rect = _readRect(j['r']);
        final bytes = j['d'] is String ? base64Decode(j['d'] as String) : (j['ref'] != null ? image?.call(j['ref'] as Object) : null);
        if (rect == null || bytes == null) return null;
        return ImageElement(id: id, rect: rect, bytes: bytes, rotation: angle, link: EmbedLink.fromJson(j['ln']), backdrop: j['bg'] == true);
      case 'math':
        final tex = j['tex'];
        if (tex is! String) return null;
        return MathElement(
          id: id,
          position: Offset(n('x'), n('y')),
          latex: tex,
          color: color(),
          fontSize: n('fs', 34),
          size: Size(n('sw', 160), n('sh', 48)),
          rotation: angle,
        );
      case 'graph':
        final rect = _readRect(j['r']);
        final v = (j['v'] as List<dynamic>?)?.cast<num>();
        if (rect == null || j['e'] is! String) return null;
        final pm = j['pm'] is Map
            ? {
                for (final e in (j['pm'] as Map).entries)
                  if (e.value is num) '${e.key}': (e.value as num).toDouble(),
              }
            : const <String, double>{};
        final templated = pm.isNotEmpty;
        List<String> strings(Object? raw) => raw is List ? [for (final s in raw) '$s'] : const [];
        final sh = (j['sh'] as List<dynamic>?)?.cast<num>();
        return GraphElement(
          id: id,
          rect: rect,
          expression: templated && j['et'] is String ? j['et'] as String : j['e'] as String,
          color: color(),
          xMin: v != null && v.length == 4 ? v[0].toDouble() : -10,
          xMax: v != null && v.length == 4 ? v[1].toDouble() : 10,
          yMin: v != null && v.length == 4 ? v[2].toDouble() : -10,
          yMax: v != null && v.length == 4 ? v[3].toDouble() : 10,
          rotation: angle,
          curves: templated && j['xt'] is List ? strings(j['xt']) : strings(j['x']),
          params: pm,
          points: [
            for (final p in (j['pt'] as List<dynamic>? ?? const []))
              if (p is List && p.length >= 2 && p[0] is num && p[1] is num)
                GraphPoint((p[0] as num).toDouble(), (p[1] as num).toDouble(), p.length > 2 ? '${p[2]}' : ''),
          ],
          shade: sh != null && sh.length >= 2 ? GraphShade(sh[0].toDouble(), sh[1].toDouble(), between: sh.length > 2 && sh[2] != 0) : null,
          xLabel: j['lx'] as String? ?? '',
          yLabel: j['ly'] as String? ?? '',
          title: j['ti'] as String? ?? '',
        );
      case 'polygon':
        final flat = (j['p'] as List<dynamic>?)?.cast<num>();
        if (flat == null || flat.length < 4) return null;
        return PolygonElement(
          id: id,
          points: [for (var i = 0; i + 1 < flat.length; i += 2) Offset(flat[i].toDouble(), flat[i + 1].toDouble())],
          color: color(),
          width: n('w', 3),
          closed: j['o'] != true,
          fill: j['f'] is num ? color('f') : null,
        );
      case 'note':
        final rect = _readRect(j['r']);
        if (rect == null) return null;
        return NoteElement(
          id: id,
          rect: rect,
          text: j['tx'] as String? ?? '',
          color: color(),
          fontSize: n('fs', 22),
          kind: NoteKind.values.asNameMap()[j['k']] ?? NoteKind.note,
          language: j['lg'] as String?,
          rotation: angle,
        );
      case 'flow':
        final rect = _readRect(j['r']);
        final shape = FlowBlock.values.asNameMap()[j['k']];
        if (rect == null || shape == null) return null;
        return FlowNodeElement(
          id: j['id'] is String ? j['id'] as String : id,
          rect: rect,
          shape: shape,
          text: j['tx'] as String? ?? '',
          color: color(),
          fill: j['f'] is num ? color('f') : null,
          fontSize: n('fs', 22),
        );
      case 'flowlink':
        final from = j['fr'], to = j['to'];
        final sd = (j['sd'] as List<dynamic>?)?.cast<num>();
        final flat = (j['p'] as List<dynamic>?)?.cast<num>() ?? const <num>[];
        if (from is! String || to is! String) return null;
        FlowSide side(int i, FlowSide fallback) => sd != null && sd.length == 2 && sd[i] >= 0 && sd[i] < 4 ? FlowSide.values[sd[i].toInt()] : fallback;
        return FlowLinkElement(
          id: id,
          from: from,
          to: to,
          fromSide: side(0, FlowSide.bottom),
          toSide: side(1, FlowSide.top),
          label: j['l'] as String? ?? '',
          color: color(),
          curved: j['cv'] == true,
          points: [for (var i = 0; i + 1 < flat.length; i += 2) Offset(flat[i].toDouble(), flat[i + 1].toDouble())],
        );
      case 'sheet':
        final rect = _readRect(j['r']);
        final dims = (j['n'] as List<dynamic>?)?.cast<num>();
        final cells = (j['d'] as List<dynamic>?)?.map((v) => v is String ? v : '$v').toList();
        if (rect == null || dims == null || dims.length != 2 || cells == null) return null;
        final rows = dims[0].toInt().clamp(1, SheetElement.maxRows), cols = dims[1].toInt().clamp(1, SheetElement.maxCols);
        final ch = j['ch'];
        final kind = ch is Map ? SheetChartKind.values.asNameMap()[ch['k']] : null;
        return SheetElement(
          id: id,
          rect: rect,
          rows: rows,
          cols: cols,
          cells: cells,
          color: color(),
          formats: [for (final f in (j['fm'] as List<dynamic>? ?? const [])) SheetFormat.values.asNameMap()[f] ?? SheetFormat.general],
          widths: [for (final w in (j['cw'] as List<dynamic>? ?? const [])) (w as num).toDouble().clamp(40.0, 600.0)],
          header: j['h'] != false,
          chart: kind == null ? null : SheetChart(kind: kind, labels: '${ch['l'] ?? ''}', values: '${ch['v'] ?? ''}'),
          rotation: angle,
        );
    }
  } on Object {
    // A malformed element from a newer or broken writer: skip it, keep the board.
  }
  return null;
}
