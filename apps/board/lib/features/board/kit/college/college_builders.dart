import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../builders.dart' show wrapWords;
import 'finance.dart' show Working, n2;
import 'pert.dart';
import 'stats.dart';

// College templates and drawings made of ordinary board elements around (0, 0): sheets for
// accounts, sticky notes for frames that are filled in, and shapes and text for charts. The
// board places them in view and groups them, so they move, erase and undo like anything else.
// Template words are in English, as in the textbooks and the formats they follow.

TextElement _text(String t, Offset at, Color c, {double size = 20, bool bold = false, bool center = false}) {
  final s = measureBoardText(t, size, bold: bold);
  return TextElement(id: newElementId(), position: center ? at - Offset(s.width / 2, s.height / 2) : at, text: t, color: c, fontSize: size, size: s, bold: bold);
}

Stroke _shape(ShapeKind kind, Offset a, Offset b, Color c, {double w = 3, Color? fill}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: c, width: w, shape: kind),
  shape: kind,
  fill: fill,
  points: shapePoints(kind, a, b),
);

Stroke _line(Offset a, Offset b, Color c, {double w = 2.5, ShapeKind kind = ShapeKind.line}) => _shape(kind, a, b, c, w: w);

Stroke _dot(Offset c, double r, Color col) => _shape(ShapeKind.circle, c, c + Offset(r, 0), col, w: 1.5, fill: col);

/// Sticky-note colours for frames.
const noteColors = [Color(0xFFFFE58A), Color(0xFFC8E6C9), Color(0xFFF8BBD0), Color(0xFFBBDEFB), Color(0xFFFFE0B2), Color(0xFFE1BEE7), Color(0xFFB2EBF2)];

NoteElement _note(String text, Rect r, Color c, {double fontSize = 20}) => NoteElement(id: newElementId(), rect: r, text: text, color: c, fontSize: fontSize);

/// A title over a frame.
TextElement _title(String t, Color accent, {double y = -56, double x = 0}) => _text(t, Offset(x, y), accent, size: 30, bold: true);

// --- Working --------------------------------------------------------------------------------

/// A worked answer: its title, the steps, the answer in the accent colour, and its table as
/// a sheet underneath.
List<BoardElement> workingElements(Working w, Color ink, Color accent) {
  final out = <BoardElement>[_text(w.title, Offset.zero, accent, size: 28, bold: true)];
  var y = out.first.bounds.height + 12;
  if (w.steps.isNotEmpty) {
    final body = _text(w.steps.map((s) => wrapWords(s, 70)).join('\n'), Offset(0, y), ink, size: 21);
    out.add(body);
    y += body.size.height + 12;
  }
  final ans = _text(w.answer, Offset(0, y), accent, size: 24, bold: true);
  out.add(ans);
  y += ans.size.height + 20;
  if (w.table case final t? when t.length > 1) out.add(tableSheet(t, accent).translated(Offset(0, y)));
  return out;
}

/// Rows of words and numbers as a sheet (first row the heading).
SheetElement tableSheet(List<List<String>> rows, Color accent, {List<double>? widths}) {
  final cols = rows.fold(0, (m, r) => math.max(m, r.length));
  return SheetElement.sized(
    rows: rows.length,
    cols: cols,
    cells: [for (final r in rows) for (var c = 0; c < cols; c++) c < r.length ? r[c] : ''],
    color: accent,
    widths: widths ?? [for (var c = 0; c < cols; c++) c == 0 ? 120 : 160],
  );
}

/// A blank sheet for the left rail's spreadsheet tool.
SheetElement blankSheet(Color accent, {int rows = 6, int cols = 4}) => SheetElement.sized(rows: rows, cols: cols, cells: const [], color: accent);

// --- Accounts -------------------------------------------------------------------------------

enum AccountsTemplate { journal, ledger, trialBalance, finalAccounts, balanceSheet, cashBook, bankReconciliation }

const _inr = SheetFormat.inr, _gen = SheetFormat.general;

List<String> _blankRows(int n, int cols) => List.filled(n * cols, '');

/// An accounts format as a sheet with its totals as formulas, and its title.
List<BoardElement> accountsTemplate(AccountsTemplate t, Color ink, Color accent) {
  SheetElement sheet(int cols, List<String> cells, List<double> widths, List<SheetFormat> formats) =>
      SheetElement.sized(rows: cells.length ~/ cols, cols: cols, cells: cells, color: accent, widths: widths, formats: formats);
  final (String title, SheetElement s) = switch (t) {
    AccountsTemplate.journal => (
      'Journal',
      sheet(5, [
        'Date', 'Particulars', 'L.F.', 'Debit (₹)', 'Credit (₹)', //
        ..._blankRows(7, 5),
        '', 'Total', '', '=SUM(D2:D8)', '=SUM(E2:E8)',
      ], [110, 340, 60, 150, 150], [_gen, _gen, _gen, _inr, _inr]),
    ),
    AccountsTemplate.ledger => (
      'Dr.  ________ Account  Cr.',
      sheet(8, [
        'Date', 'Particulars', 'J.F.', 'Amount (₹)', 'Date', 'Particulars', 'J.F.', 'Amount (₹)', //
        '', 'To Balance b/d', '', '', '', '', '', '',
        ..._blankRows(5, 8),
        '', '', '', '', '', 'By Balance c/d', '', '=SUM(D2:D7)-SUM(H2:H7)',
        '', 'Total', '', '=SUM(D2:D8)', '', 'Total', '', '=SUM(H2:H8)',
      ], [90, 220, 50, 130, 90, 220, 50, 130], [_gen, _gen, _gen, _inr, _gen, _gen, _gen, _inr]),
    ),
    AccountsTemplate.trialBalance => (
      'Trial Balance as at 31 March 20__',
      sheet(5, [
        'S. No.', 'Name of account', 'L.F.', 'Debit (₹)', 'Credit (₹)', //
        for (var i = 1; i <= 8; i++) ...['$i', '', '', '', ''],
        '', 'Total', '', '=SUM(D2:D9)', '=SUM(E2:E9)',
        '', 'Difference (should be nil)', '', '=D10-E10', '',
      ], [80, 320, 60, 150, 150], [_gen, _gen, _gen, _inr, _inr]),
    ),
    AccountsTemplate.finalAccounts => (
      'Trading and Profit & Loss Account for the year ended 31 March 20__',
      sheet(4, [
        'Particulars (Dr.)', 'Amount (₹)', 'Particulars (Cr.)', 'Amount (₹)', //
        'To Opening stock', '', 'By Sales (less returns)', '',
        'To Purchases (less returns)', '', 'By Closing stock', '',
        'To Wages', '', '', '',
        'To Carriage inwards', '', '', '',
        'To Gross profit c/d', '=SUM(D2:D5)-SUM(B2:B5)', '', '',
        'Total', '=SUM(B2:B6)', 'Total', '=SUM(D2:D6)',
        'To Salaries', '', 'By Gross profit b/d', '=B6',
        'To Rent', '', 'By Commission received', '',
        'To Depreciation', '', 'By Interest received', '',
        'To Net profit (to Capital A/c)', '=SUM(D8:D10)-SUM(B8:B10)', '', '',
        'Total', '=SUM(B8:B11)', 'Total', '=SUM(D8:D11)',
      ], [300, 150, 300, 150], [_gen, _inr, _gen, _inr]),
    ),
    AccountsTemplate.balanceSheet => ('Balance Sheet as at 31 March 20__ (Schedule III, Division I)', _scheduleIII(accent)),
    AccountsTemplate.cashBook => (
      'Cash Book (with cash and bank columns)',
      sheet(10, [
        'Date', 'Receipts', 'L.F.', 'Cash (₹)', 'Bank (₹)', 'Date', 'Payments', 'L.F.', 'Cash (₹)', 'Bank (₹)', //
        '', 'To Balance b/d', '', '', '', '', '', '', '', '',
        ..._blankRows(5, 10),
        '', '', '', '', '', '', 'By Balance c/d', '', '=SUM(D2:D7)-SUM(I2:I7)', '=SUM(E2:E7)-SUM(J2:J7)',
        '', 'Total', '', '=SUM(D2:D8)', '=SUM(E2:E8)', '', 'Total', '', '=SUM(I2:I8)', '=SUM(J2:J8)',
      ], [80, 190, 50, 110, 110, 80, 190, 50, 110, 110], [_gen, _gen, _gen, _inr, _inr, _gen, _gen, _gen, _inr, _inr]),
    ),
    AccountsTemplate.bankReconciliation => (
      'Bank Reconciliation Statement as on ________',
      sheet(3, [
        'Particulars', 'Amount (₹)', 'Amount (₹)', //
        'Balance as per Cash Book (debit balance)', '', '',
        'Add: Cheques issued but not yet presented for payment', '', '',
        '      Interest credited by the bank, not in the Cash Book', '', '',
        '      Amounts deposited directly by customers', '', '=SUM(B3:B5)',
        'Less: Cheques deposited but not yet credited', '', '',
        '      Bank charges debited, not in the Cash Book', '', '',
        '      Payments made by the bank on standing instructions', '', '=SUM(B6:B8)',
        'Balance as per Pass Book (credit balance)', '', '=C2+C5-C8',
      ], [520, 150, 150], [_gen, _inr, _inr]),
    ),
  };
  return [_text(title, Offset.zero, accent, size: 26, bold: true), s.translated(const Offset(0, 48))];
}

SheetElement _scheduleIII(Color accent) {
  const rows = [
    'I. EQUITY AND LIABILITIES',
    '(1) Shareholders’ funds',
    '    (a) Share capital',
    '    (b) Reserves and surplus',
    '    (c) Money received against share warrants',
    '(2) Share application money pending allotment',
    '(3) Non-current liabilities',
    '    (a) Long-term borrowings',
    '    (b) Deferred tax liabilities (net)',
    '    (c) Other long-term liabilities',
    '    (d) Long-term provisions',
    '(4) Current liabilities',
    '    (a) Short-term borrowings',
    '    (b) Trade payables',
    '    (c) Other current liabilities',
    '    (d) Short-term provisions',
    'TOTAL',
    'II. ASSETS',
    '(1) Non-current assets',
    '    (a) Property, plant and equipment and intangible assets',
    '        (i) Property, plant and equipment',
    '        (ii) Intangible assets',
    '        (iii) Capital work-in-progress',
    '        (iv) Intangible assets under development',
    '    (b) Non-current investments',
    '    (c) Deferred tax assets (net)',
    '    (d) Long-term loans and advances',
    '    (e) Other non-current assets',
    '(2) Current assets',
    '    (a) Current investments',
    '    (b) Inventories',
    '    (c) Trade receivables',
    '    (d) Cash and cash equivalents',
    '    (e) Short-term loans and advances',
    '    (f) Other current assets',
    'TOTAL',
  ];
  // Sheet rows: 1 is the heading, so the list's row i is sheet row i + 2.
  final firstTotal = rows.indexOf('TOTAL') + 2, lastTotal = rows.length + 1;
  final cells = <String>['Particulars', 'Note No.', 'Current year (₹)', 'Previous year (₹)'];
  for (final (i, r) in rows.indexed) {
    final row = i + 2;
    if (row == firstTotal) {
      cells.addAll([r, '', '=SUM(C3:C${row - 1})', '=SUM(D3:D${row - 1})']);
    } else if (row == lastTotal) {
      cells.addAll([r, '', '=SUM(C${firstTotal + 1}:C${row - 1})', '=SUM(D${firstTotal + 1}:D${row - 1})']);
    } else {
      cells.addAll([r, '', '', '']);
    }
  }
  return SheetElement.sized(rows: rows.length + 1, cols: 4, cells: cells, color: accent, widths: const [480, 90, 170, 170], formats: const [_gen, _gen, _inr, _inr]);
}

// --- Management frames ----------------------------------------------------------------------

enum Frame {
  swot, pestle, porter, bcg, ansoff, valueChain, mckinsey7s, maslow, marketingMix4p, marketingMix7p, decisionTree, fishbone, mindMap, caseStudy, //
  caseBrief, irac, argumentMap,
}

/// Notes in a grid, [cols] across, each headed by its title.
List<BoardElement> _noteGrid(List<String> titles, int cols, {double w = 320, double h = 220, double gap = 16, List<String>? prompts}) => [
  for (final (i, t) in titles.indexed)
    _note(
      '$t\n${prompts != null && i < prompts.length ? prompts[i] : '• '}',
      Rect.fromLTWH((i % cols) * (w + gap), (i ~/ cols) * (h + gap), w, h),
      noteColors[i % noteColors.length],
    ),
];

/// A fillable frame: sticky notes to write in, with the frame's lines, arrows and axes.
List<BoardElement> frame(Frame f, Color ink, Color accent) {
  switch (f) {
    case Frame.swot:
      return [
        _title('SWOT analysis', accent),
        ..._noteGrid(['Strengths (internal, helpful)', 'Weaknesses (internal, harmful)', 'Opportunities (external, helpful)', 'Threats (external, harmful)'], 2, w: 380, h: 240),
      ];
    case Frame.pestle:
      return [
        _title('PESTLE analysis', accent),
        ..._noteGrid(['Political', 'Economic', 'Social', 'Technological', 'Legal', 'Environmental'], 3, w: 300, h: 200),
      ];
    case Frame.porter:
      const w = 300.0, h = 150.0;
      final center = Rect.fromLTWH(w + 60, h + 50, w, h);
      final around = {
        'Threat of new entrants': Rect.fromLTWH(w + 60, 0, w, h),
        'Bargaining power of suppliers': Rect.fromLTWH(0, h + 50, w, h),
        'Bargaining power of buyers': Rect.fromLTWH(2 * w + 120, h + 50, w, h),
        'Threat of substitutes': Rect.fromLTWH(w + 60, 2 * h + 100, w, h),
      };
      return [
        _title('Porter’s five forces', accent),
        _note('Competitive rivalry\n• ', center, noteColors[2]),
        for (final (i, e) in around.entries.indexed) ...[
          _note('${e.key}\n• ', e.value, noteColors[(i + 3) % noteColors.length]),
          _line(_edgeToward(e.value, center.center), _edgeToward(center, e.value.center), ink, w: 3, kind: ShapeKind.arrow),
        ],
      ];
    case Frame.bcg:
      return [
        _title('BCG growth–share matrix', accent, y: -96),
        _text('High  ←  Relative market share  →  Low', const Offset(380, -40), ink, size: 18, center: true),
        _text('Market growth rate\nHigh ↑   ↓ Low', const Offset(-120, 230), ink, size: 18, center: true),
        ..._noteGrid(['★ Stars\nhigh growth, high share', '? Question marks\nhigh growth, low share', '₹ Cash cows\nlow growth, high share', '✕ Dogs\nlow growth, low share'], 2, w: 360, h: 220, prompts: List.filled(4, '')),
      ];
    case Frame.ansoff:
      return [
        _title('Ansoff matrix', accent, y: -96),
        _text('Existing products          New products', const Offset(380, -40), ink, size: 18, center: true),
        _text('Existing\nmarkets', const Offset(-80, 110), ink, size: 18, center: true),
        _text('New\nmarkets', const Offset(-80, 346), ink, size: 18, center: true),
        ..._noteGrid(['Market penetration (lowest risk)', 'Product development', 'Market development', 'Diversification (highest risk)'], 2, w: 360, h: 220),
      ];
    case Frame.valueChain:
      final out = <BoardElement>[_title('Porter’s value chain', accent)];
      const support = ['Firm infrastructure', 'Human resource management', 'Technology development', 'Procurement'];
      for (final (i, s) in support.indexed) {
        out.add(_note('$s: ', Rect.fromLTWH(0, i * 70.0, 1000, 60), noteColors[3], fontSize: 18));
      }
      const primary = ['Inbound logistics', 'Operations', 'Outbound logistics', 'Marketing & sales', 'Service'];
      for (final (i, p) in primary.indexed) {
        out.add(_note('$p\n• ', Rect.fromLTWH(i * 204.0, 290, 192, 220), noteColors[0], fontSize: 18));
      }
      out
        ..add(PolygonElement(id: newElementId(), points: const [Offset(1020, 0), Offset(1100, 0), Offset(1180, 255), Offset(1100, 510), Offset(1020, 510)], color: accent, width: 3, fill: accent.withValues(alpha: 0.12)))
        ..add(_text('Margin', const Offset(1100, 255), accent, size: 22, bold: true, center: true))
        ..add(_text('Support activities', const Offset(0, -24), ink, size: 16))
        ..add(_text('Primary activities', const Offset(0, 520), ink, size: 16));
      return out;
    case Frame.mckinsey7s:
      const c = Offset(420, 330);
      final names = ['Strategy', 'Structure', 'Systems', 'Style', 'Staff', 'Skills'];
      final centers = [for (var i = 0; i < 6; i++) c + Offset(math.cos(-math.pi / 2 + i * math.pi / 3), math.sin(-math.pi / 2 + i * math.pi / 3)) * 280];
      Rect box(Offset o) => Rect.fromCenter(center: o, width: 220, height: 120);
      return [
        _title('McKinsey 7S framework', accent),
        for (var i = 0; i < 6; i++) ...[
          _line(centers[i], c, ink.withValues(alpha: 0.6)),
          _line(centers[i], centers[(i + 1) % 6], ink.withValues(alpha: 0.6)),
        ],
        _note('Shared values\n• ', box(c), noteColors[2]),
        for (var i = 0; i < 6; i++) _note('${names[i]}\n• ', box(centers[i]), noteColors[i < 3 ? 3 : 1]),
        _text('Hard S: Strategy, Structure, Systems   ·   Soft S: Style, Staff, Skills, Shared values', Offset(c.dx, c.dy + 420), ink, size: 16, center: true),
      ];
    case Frame.maslow:
      const levels = ['Self-actualisation', 'Esteem needs', 'Love and belonging', 'Safety needs', 'Physiological needs'];
      const h = 90.0, base = 760.0;
      final out = <BoardElement>[_title('Maslow’s hierarchy of needs', accent)];
      for (var i = 0; i < 5; i++) {
        final top = i * h, bottom = top + h;
        double half(double y) => base / 2 * (y / (5 * h));
        out
          ..add(PolygonElement(
            id: newElementId(),
            points: [Offset(base / 2 - half(top), top), Offset(base / 2 + half(top), top), Offset(base / 2 + half(bottom), bottom), Offset(base / 2 - half(bottom), bottom)],
            color: ink,
            width: 2,
            fill: noteColors[i].withValues(alpha: 0.9),
          ))
          ..add(_text(levels[i], Offset(base / 2, top + h * 0.6), ink, size: i == 0 ? 15 : 19, bold: true, center: true))
          ..add(_note('${levels[i]}: e.g. ', Rect.fromLTWH(base + 40, top + 8, 380, h - 16), noteColors[i], fontSize: 17));
      }
      return out;
    case Frame.marketingMix4p || Frame.marketingMix7p:
      final seven = f == Frame.marketingMix7p;
      return [
        _title(seven ? 'Marketing mix (7 Ps of services)' : 'Marketing mix (4 Ps)', accent),
        ..._noteGrid(['Product', 'Price', 'Place', 'Promotion', if (seven) ...['People', 'Process', 'Physical evidence']], seven ? 4 : 2, w: 300, h: 200),
      ];
    case Frame.decisionTree:
      final d = const Offset(0, 260);
      final chance = [const Offset(320, 120), const Offset(320, 400)];
      final out = <BoardElement>[
        _title('Decision tree', accent),
        _shape(ShapeKind.rectangle, d - const Offset(30, 30), d + const Offset(30, 30), ink, fill: accent.withValues(alpha: 0.2)),
        _text('Decide', d + const Offset(0, 50), ink, size: 16, center: true),
      ];
      for (final (i, c) in chance.indexed) {
        out
          ..add(_line(d + const Offset(30, 0), c - const Offset(30, 0), ink))
          ..add(_note('Option ${String.fromCharCode(65 + i)}: cost ₹', Rect.fromCenter(center: (d + c) / 2 - const Offset(0, 40), width: 200, height: 70), noteColors[0], fontSize: 16))
          ..add(_shape(ShapeKind.circle, c, c + const Offset(30, 0), ink, fill: noteColors[1]));
        for (var k = 0; k < 2; k++) {
          final end = c + Offset(300, (k == 0 ? -1 : 1) * 70);
          out
            ..add(_line(c + const Offset(30, 0), end, ink))
            ..add(_shape(ShapeKind.triangle, end + const Offset(0, -18), end + const Offset(30, 18), ink))
            ..add(_note('p = 0.__  payoff ₹', Rect.fromLTWH(end.dx + 44, end.dy - 30, 240, 60), noteColors[4], fontSize: 16));
        }
      }
      out.add(_text('□ decision   ○ chance   △ outcome   ·   EMV = Σ p × payoff', const Offset(300, 560), ink, size: 16, center: true));
      return out;
    case Frame.fishbone:
      const head = Rect.fromLTWH(1000, 200, 240, 120);
      final out = <BoardElement>[
        _title('Fishbone (Ishikawa) diagram', accent),
        _line(const Offset(0, 260), head.centerLeft, ink, w: 4, kind: ShapeKind.arrow),
        _note('Problem / effect\n', head, noteColors[2]),
      ];
      const causes = ['People', 'Methods', 'Machines', 'Materials', 'Measurement', 'Environment'];
      for (var i = 0; i < 6; i++) {
        final x = 160.0 + (i ~/ 2) * 300;
        final up = i.isEven;
        final tip = Offset(x, up ? 40 : 480);
        out
          ..add(_line(tip, Offset(x + 140, 260), ink, w: 3))
          ..add(_note('${causes[i]}\n• ', Rect.fromLTWH(x - 110, up ? -70 : 490, 220, 100), noteColors[i % noteColors.length], fontSize: 17));
      }
      return out;
    case Frame.mindMap:
      const c = Offset(500, 300);
      final out = <BoardElement>[];
      for (var i = 0; i < 6; i++) {
        final a = i * math.pi / 3;
        final p = c + Offset(math.cos(a) * 380, math.sin(a) * 230);
        out
          ..add(_line(c, p, noteColors[i].withValues(alpha: 1), w: 6))
          ..add(_note('Idea ${i + 1}\n• ', Rect.fromCenter(center: p, width: 220, height: 110), noteColors[i], fontSize: 18));
      }
      return [...out, _note('Central idea', Rect.fromCenter(center: c, width: 260, height: 120), noteColors[2], fontSize: 24)];
    case Frame.caseStudy:
      return [
        _title('Case study', accent),
        ..._noteGrid(['Background and facts', 'Problem statement', 'Alternatives', 'Criteria for choosing', 'Recommendation', 'Implementation plan'], 3, w: 320, h: 210),
      ];
    case Frame.caseBrief:
      return [
        _title('Case brief', accent),
        _note('Case name, citation, court and bench\n', const Rect.fromLTWH(0, 0, 1016, 90), noteColors[3]),
        ..._noteGrid(['Facts', 'Issues', 'Arguments: petitioner / appellant', 'Arguments: respondent', 'Held (decision)', 'Ratio decidendi', 'Obiter dicta', 'Critique / significance'], 4, w: 242, h: 230, gap: 16)
            .map((e) => e.translated(const Offset(0, 106))),
      ];
    case Frame.irac:
      return [
        _title('IRAC', accent),
        ..._noteGrid(['Issue: what is the legal question?', 'Rule: which law, section or precedent?', 'Application: apply the rule to the facts', 'Conclusion: the answer'], 1, w: 900, h: 130),
      ];
    case Frame.argumentMap:
      const claim = Rect.fromLTWH(300, 0, 400, 110);
      final reasons = [const Rect.fromLTWH(0, 200, 300, 140), const Rect.fromLTWH(350, 200, 300, 140), const Rect.fromLTWH(700, 200, 300, 140)];
      const rebut = Rect.fromLTWH(700, 420, 300, 120);
      return [
        _title('Argument map', accent),
        _note('Contention / claim\n', claim, noteColors[3]),
        _note('Reason (supports)\n• ', reasons[0], noteColors[1]),
        _note('Reason (supports)\n• ', reasons[1], noteColors[1]),
        _note('Objection (opposes)\n• ', reasons[2], noteColors[2]),
        _note('Rebuttal\n• ', rebut, noteColors[0]),
        for (final r in reasons) _line(r.topCenter, _edgeToward(claim, r.center), ink, w: 3, kind: ShapeKind.arrow),
        _line(rebut.topCenter, reasons[2].bottomCenter, ink, w: 3, kind: ShapeKind.arrow),
        _text('Authority: statute / precedent for each reason', const Offset(0, 420), ink, size: 16),
      ];
  }
}

/// Where a line from [r]'s centre toward [to] leaves [r].
Offset _edgeToward(Rect r, Offset to) {
  final d = to - r.center;
  if (d == Offset.zero) return r.center;
  final k = math.min(d.dx == 0 ? double.infinity : (r.width / 2) / d.dx.abs(), d.dy == 0 ? double.infinity : (r.height / 2) / d.dy.abs());
  return r.center + d * k;
}

// --- Projects: Gantt and PERT network -------------------------------------------------------

/// A Gantt chart: a bar per activity from its earliest start, critical ones in the accent.
List<BoardElement> ganttChart(Schedule s, Color ink, Color accent) {
  const left = 180.0, rowH = 48.0;
  final unit = math.min(60.0, 900 / math.max(1, s.duration));
  final out = <BoardElement>[_title('Gantt chart (critical activities highlighted)', accent)];
  final bottom = s.order.length * rowH + 10;
  for (var t = 0; t <= s.duration.ceil(); t++) {
    final x = left + t * unit;
    out.add(_line(Offset(x, -6), Offset(x, bottom), ink.withValues(alpha: 0.25), w: 1));
    if (t % math.max(1, (s.duration / 15).ceil()) == 0) out.add(_text('$t', Offset(x, bottom + 16), ink, size: 15, center: true));
  }
  for (final (i, id) in s.order.indexed) {
    final it = s.items[id]!;
    final y = i * rowH;
    final label = it.activity.name.isEmpty ? id : '$id  ${it.activity.name}';
    out
      ..add(_text(label, Offset(0, y + 8), ink, size: 18, bold: it.critical))
      ..add(_shape(ShapeKind.rectangle, Offset(left + it.es * unit, y + 6), Offset(left + it.ef * unit, y + rowH - 6), it.critical ? accent : ink,
          w: 2, fill: (it.critical ? accent : ink).withValues(alpha: it.critical ? 0.75 : 0.25)));
    if (it.slack > 0) out.add(_line(Offset(left + it.ef * unit, y + rowH / 2), Offset(left + it.lf * unit, y + rowH / 2), ink.withValues(alpha: 0.6), w: 2));
  }
  out.add(_text('Time →   (thin line: slack)', Offset(left, bottom + 40), ink, size: 15));
  return out;
}

/// An activity-on-node network: each node shows ES | t | EF over LS | slack | LF; the
/// critical path and its arrows in the accent, with the project's duration.
List<BoardElement> pertNetwork(Schedule s, Color ink, Color accent) {
  final level = <String, int>{};
  for (final id in s.order) {
    final preds = s.items[id]!.activity.predecessors;
    level[id] = preds.isEmpty ? 0 : preds.map((p) => level[p]! + 1).reduce(math.max);
  }
  final perLevel = <int, int>{};
  final at = <String, Rect>{};
  const w = 190.0, h = 110.0, gx = 110.0, gy = 50.0;
  for (final id in s.order) {
    final l = level[id]!;
    final row = perLevel[l] = (perLevel[l] ?? -1) + 1;
    at[id] = Rect.fromLTWH(l * (w + gx), row * (h + gy), w, h);
  }
  final critical = s.criticalPath.toSet();
  final out = <BoardElement>[_title('PERT / CPM network', accent)];
  for (final id in s.order) {
    for (final p in s.items[id]!.activity.predecessors) {
      final crit = critical.contains(id) && critical.contains(p) && (s.items[id]!.es - s.items[p]!.ef).abs() < 1e-9;
      out.add(_line(at[p]!.centerRight, at[id]!.centerLeft, crit ? accent : ink, w: crit ? 5 : 2.5, kind: ShapeKind.arrow));
    }
  }
  for (final id in s.order) {
    final r = at[id]!, it = s.items[id]!;
    final c = it.critical ? accent : ink;
    out
      ..add(_shape(ShapeKind.rectangle, r.topLeft, r.bottomRight, c, w: it.critical ? 4 : 2, fill: Colors.white))
      ..add(_line(Offset(r.left, r.top + h / 2), Offset(r.right, r.top + h / 2), c, w: 1.5))
      ..add(_text('${n2(it.es)}   ${it.activity.id} (${n2(it.activity.expected)})   ${n2(it.ef)}', Offset(r.center.dx, r.top + h / 4), c, size: 18, bold: true, center: true))
      ..add(_text('${n2(it.ls)}   slack ${n2(it.slack)}   ${n2(it.lf)}', Offset(r.center.dx, r.top + 3 * h / 4), ink, size: 16, center: true));
  }
  final bottom = at.values.fold(0.0, (m, r) => math.max(m, r.bottom));
  final variance = s.variance;
  out.add(_text(
    'Critical path: ${s.criticalPath.join(' → ')}   ·   Project duration = ${n2(s.duration)}'
    '${variance > 0 ? '   ·   σ = ${n2(math.sqrt(variance))}' : ''}\nNode: ES  activity (t)  EF  /  LS  slack  LF',
    Offset(0, bottom + 30),
    accent,
    size: 20,
    bold: true,
  ));
  return out;
}

// --- Statistics charts ----------------------------------------------------------------------

/// Axis ticks at "nice" values between [lo] and [hi].
List<double> niceTicks(double lo, double hi, [int count = 6]) {
  final span = hi - lo;
  if (span <= 0 || !span.isFinite) return [lo];
  final raw = span / count;
  final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final step = [1.0, 2.0, 2.5, 5.0, 10.0].map((m) => m * mag).firstWhere((s) => s >= raw);
  return [for (var v = (lo / step).ceil() * step; v <= hi + 1e-9; v += step) double.parse(v.toStringAsFixed(10))];
}

String _tick(double v) => n2(v);

/// A horizontal axis from [lo] to [hi] mapped to x = 0…[width], at y = [y].
List<BoardElement> _xAxis(double lo, double hi, double width, double y, Color ink) => [
  _line(Offset(-10, y), Offset(width + 16, y), ink, w: 2, kind: ShapeKind.arrow),
  for (final t in niceTicks(lo, hi)) ...[
    _line(Offset((t - lo) / (hi - lo) * width, y), Offset((t - lo) / (hi - lo) * width, y + 8), ink, w: 2),
    _text(_tick(t), Offset((t - lo) / (hi - lo) * width, y + 24), ink, size: 15, center: true),
  ],
];

/// Box-and-whisker plot of [d] (min, Q1, median, Q3, max) on a scale.
List<BoardElement> boxPlot(Descriptive d, Color ink, Color accent) {
  const width = 700.0;
  final pad = d.range == 0 ? 1.0 : d.range * 0.08;
  final lo = d.min - pad, hi = d.max + pad;
  double x(double v) => (v - lo) / (hi - lo) * width;
  const top = 40.0, bottom = 120.0, mid = 80.0;
  return [
    _title('Box plot', accent),
    _line(Offset(x(d.min), mid), Offset(x(d.q1), mid), ink),
    _line(Offset(x(d.q3), mid), Offset(x(d.max), mid), ink),
    _line(Offset(x(d.min), top + 20), Offset(x(d.min), bottom - 20), ink),
    _line(Offset(x(d.max), top + 20), Offset(x(d.max), bottom - 20), ink),
    _shape(ShapeKind.rectangle, Offset(x(d.q1), top), Offset(x(d.q3), bottom), accent, fill: accent.withValues(alpha: 0.2)),
    _line(Offset(x(d.median), top), Offset(x(d.median), bottom), accent, w: 4),
    for (final (v, name) in [(d.min, 'Min'), (d.q1, 'Q1'), (d.median, 'Median'), (d.q3, 'Q3'), (d.max, 'Max')])
      _text('$name\n${n2(v)}', Offset(x(v), name == 'Median' ? 0 : -6), ink, size: 14, center: true),
    ..._xAxis(lo, hi, width, 170, ink),
  ];
}

/// Histogram of [d] with equal classes (Sturges' rule unless [bins] is given).
List<BoardElement> histogramChart(Descriptive d, Color ink, Color accent, {int? bins}) {
  final (:edges, :counts) = d.histogram(bins);
  const width = 700.0, height = 320.0;
  final top = counts.fold(0, math.max).toDouble();
  final bw = width / counts.length;
  final out = <BoardElement>[_title('Histogram', accent)];
  for (var i = 0; i < counts.length; i++) {
    final h = top == 0 ? 0.0 : counts[i] / top * height;
    out
      ..add(_shape(ShapeKind.rectangle, Offset(i * bw, height - h), Offset((i + 1) * bw, height), ink, w: 2, fill: accent.withValues(alpha: 0.55)))
      ..add(_text('${counts[i]}', Offset(i * bw + bw / 2, height - h - 18), ink, size: 15, center: true))
      ..add(_text('${n2(edges[i])}–${n2(edges[i + 1])}', Offset(i * bw + bw / 2, height + 22), ink, size: 13, center: true));
  }
  out
    ..add(_line(const Offset(0, height), const Offset(width + 16, height), ink, w: 2, kind: ShapeKind.arrow))
    ..add(_line(const Offset(0, height), const Offset(0, -16), ink, w: 2, kind: ShapeKind.arrow))
    ..add(_text('f', const Offset(-24, -16), ink, size: 18, bold: true));
  return out;
}

enum Dist { normal, binomial, poisson, t, chiSquare }

/// A distribution's curve (or bars, for discrete ones) with the area from [a] to [b] shaded
/// and its probability written above.
List<BoardElement> distributionChart(Dist dist, {required double p1, double p2 = 0, required double a, required double b, required Color ink, required Color accent}) {
  const width = 720.0, height = 300.0;
  final out = <BoardElement>[];
  if (dist == Dist.binomial || dist == Dist.poisson) {
    final n = dist == Dist.binomial ? p1.round() : math.max(10, (p1 + 4 * math.sqrt(p1)).ceil());
    double pmf(int k) => dist == Dist.binomial ? binomialPmf(n, p2, k) : poissonPmf(p1, k);
    final top = [for (var k = 0; k <= n; k++) pmf(k)].reduce(math.max);
    final bw = width / (n + 1);
    var area = 0.0;
    for (var k = 0; k <= n; k++) {
      final h = pmf(k) / top * height;
      final inside = k >= a.ceil() && k <= b.floor();
      if (inside) area += pmf(k);
      out.add(_shape(ShapeKind.rectangle, Offset(k * bw + bw * 0.12, height - h), Offset((k + 1) * bw - bw * 0.12, height), inside ? accent : ink,
          w: 1.5, fill: (inside ? accent : ink).withValues(alpha: inside ? 0.7 : 0.15)));
      if (n <= 30 || k % 5 == 0) out.add(_text('$k', Offset(k * bw + bw / 2, height + 18), ink, size: 13, center: true));
    }
    final name = dist == Dist.binomial ? 'Binomial (n = $n, p = ${n2(p2)})' : 'Poisson (λ = ${n2(p1)})';
    out
      ..insert(0, _title('$name:  P(${a.ceil()} ≤ X ≤ ${b.floor()}) = ${area.toStringAsFixed(4)}', accent))
      ..add(_line(const Offset(0, height), const Offset(width + 16, height), ink, w: 2, kind: ShapeKind.arrow));
    return out;
  }
  final (double lo, double hi, double Function(double) pdf, double Function(double) cdf, String name) = switch (dist) {
    Dist.normal => (p1 - 4 * p2, p1 + 4 * p2, (x) => normalPdf(x, p1, p2), (x) => normalCdf(x, p1, p2), 'Normal (μ = ${n2(p1)}, σ = ${n2(p2)})'),
    Dist.t => (-5.0, 5.0, (x) => tPdf(x, p1), (x) => tCdf(x, p1), 't (df = ${p1.round()})'),
    _ => (0.0, math.max(10.0, p1 + 5 * math.sqrt(2 * p1)), (x) => chiSquarePdf(x, p1), (x) => chiSquareCdf(x, p1), 'Chi-square (df = ${p1.round()})'),
  };
  const steps = 160;
  final xs = [for (var i = 0; i <= steps; i++) lo + (hi - lo) * i / steps];
  final ys = [for (final x in xs) pdf(x)];
  final top = ys.where((y) => y.isFinite).fold(0.0, math.max);
  Offset pt(double x, double y) => Offset((x - lo) / (hi - lo) * width, height - (y.isFinite ? math.min(y, top) : top) / top * height);
  final from = math.max(lo, a), to = math.min(hi, b);
  if (to > from) {
    final shade = [Offset(pt(from, 0).dx, height), for (var i = 0; i <= 60; i++) pt(from + (to - from) * i / 60, pdf(from + (to - from) * i / 60)), Offset(pt(to, 0).dx, height)];
    out.add(PolygonElement(id: newElementId(), points: shade, color: accent, width: 1, fill: accent.withValues(alpha: 0.35)));
  }
  out.add(PolygonElement(id: newElementId(), points: [for (var i = 0; i <= steps; i++) pt(xs[i], ys[i])], color: ink, width: 3, closed: false));
  final prob = cdf(math.min(b, 1e12)) - cdf(math.max(a, -1e12));
  final range = a <= -1e12 ? 'X ≤ ${n2(b)}' : (b >= 1e12 ? 'X ≥ ${n2(a)}' : '${n2(a)} ≤ X ≤ ${n2(b)}');
  return [_title('$name:  P($range) = ${prob.toStringAsFixed(4)}', accent), ...out, ..._xAxis(lo, hi, width, height, ink)];
}

/// Scatter diagram with the regression line of y on x.
List<BoardElement> scatterChart(Regression r, Color ink, Color accent) {
  const width = 600.0, height = 380.0;
  double pad(double lo, double hi) => hi == lo ? 1 : (hi - lo) * 0.1;
  final x0 = r.x.reduce(math.min), x1 = r.x.reduce(math.max), y0 = r.y.reduce(math.min), y1 = r.y.reduce(math.max);
  final xl = x0 - pad(x0, x1), xh = x1 + pad(x0, x1), yl = y0 - pad(y0, y1), yh = y1 + pad(y0, y1);
  Offset pt(double x, double y) => Offset((x - xl) / (xh - xl) * width, height - (y - yl) / (yh - yl) * height);
  final out = <BoardElement>[
    _title('Scatter diagram:  y = ${n2(r.a)} ${r.b < 0 ? '−' : '+'} ${n2(r.b.abs())}x,  r = ${r.r.toStringAsFixed(4)}', accent),
    ..._xAxis(xl, xh, width, height, ink),
    _line(const Offset(0, height), const Offset(0, -16), ink, w: 2, kind: ShapeKind.arrow),
    for (final t in niceTicks(yl, yh)) _text(_tick(t), Offset(-12 - measureBoardText(_tick(t), 15).width, pt(xl, t).dy - 10), ink, size: 15),
    for (var i = 0; i < r.n; i++) _dot(pt(r.x[i], r.y[i]), 7, ink),
  ];
  // The fitted line, clipped to the plot.
  final ya = r.a + r.b * xl, yb = r.a + r.b * xh;
  if (ya.isFinite && yb.isFinite) out.add(_line(pt(xl, ya.clamp(yl, yh)), pt(xh, yb.clamp(yl, yh)), accent, w: 4));
  return out;
}

/// A time series with its moving average.
List<BoardElement> seriesChart(List<double> y, List<double?> trend, int k, Color ink, Color accent) {
  const width = 700.0, height = 320.0;
  final all = [...y, ...trend.whereType<double>()];
  final lo = all.reduce(math.min), hi = all.reduce(math.max);
  final span = hi == lo ? 1.0 : hi - lo;
  Offset pt(int i, double v) => Offset(y.length == 1 ? 0 : i / (y.length - 1) * width, height - (v - lo) / span * height);
  final trendPts = [for (var i = 0; i < trend.length; i++) if (trend[i] != null) pt(i, trend[i]!)];
  return [
    _title('Time series and $k-period moving average', accent),
    PolygonElement(id: newElementId(), points: [for (var i = 0; i < y.length; i++) pt(i, y[i])], color: ink, width: 2.5, closed: false),
    for (var i = 0; i < y.length; i++) _dot(pt(i, y[i]), 5, ink),
    if (trendPts.length > 1) PolygonElement(id: newElementId(), points: trendPts, color: accent, width: 5, closed: false),
    _line(const Offset(0, height + 10), const Offset(width + 16, height + 10), ink, w: 2, kind: ShapeKind.arrow),
    for (var i = 0; i < y.length; i++)
      if (y.length <= 24 || i % 3 == 0) _text('${i + 1}', Offset(pt(i, lo).dx, height + 30), ink, size: 14, center: true),
    _text('— data   ━ trend (moving average)', Offset(0, height + 52), accent, size: 16),
  ];
}
