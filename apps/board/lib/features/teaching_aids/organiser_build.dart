import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

import '../../l10n/feature_strings.dart';
import '../extras/board_table.dart';
import 'organiser_strings.dart';
import 'venn_expr.dart';

/// The graphic organisers the board has.
enum Organiser { venn2, venn3, kwl, tchart, mindmap, cycle, fishbone, flow, timeline, hierarchy, swot, frayer, fiveW, compare, causeEffect, causeOrEffect, pyramid, spider, concept, storyMap }

/// The first seven names are in the teaching aids' own strings; the rest are in the organiser strings.
const oldOrganiserNames = {Organiser.venn2, Organiser.venn3, Organiser.kwl, Organiser.tchart, Organiser.mindmap, Organiser.cycle, Organiser.fishbone};

/// How many parts a template can have (rows, branches, steps, events, categories): (smallest,
/// default, largest); null when the template has a fixed shape.
(int, int, int)? organiserCount(Organiser o) => switch (o) {
  Organiser.mindmap => (3, 6, 8),
  Organiser.cycle => (3, 4, 8),
  Organiser.fishbone => (2, 4, 6),
  Organiser.flow => (2, 4, 8),
  Organiser.timeline => (2, 5, 10),
  Organiser.hierarchy => (2, 3, 6),
  Organiser.causeEffect => (1, 3, 8),
  Organiser.causeOrEffect => (2, 4, 8),
  Organiser.pyramid => (3, 4, 6),
  Organiser.kwl || Organiser.tchart || Organiser.compare => (3, 5, 8),
  Organiser.spider => (3, 5, 8),
  Organiser.concept => (3, 4, 6),
  _ => null,
};

/// A second count some templates have: (smallest, default, largest), e.g. causes per category.
(int, int, int)? organiserPerGroup(Organiser o) => switch (o) {
  Organiser.fishbone => (1, 2, 4),
  Organiser.hierarchy => (0, 0, 3),
  _ => null,
};

/// Colour sets that fill every template alike (four tints each).
const organiserThemes = <(String, List<Color>)>[
  ('classic', [Color(0x334F8CFF), Color(0x33FF5A5F), Color(0x333CB44B), Color(0x33F9AB00)]),
  ('ocean', [Color(0x331565C0), Color(0x3300838F), Color(0x333949AB), Color(0x3326A69A)]),
  ('sunset', [Color(0x33D84315), Color(0x33F9A825), Color(0x33AD1457), Color(0x336A1B9A)]),
  ('forest', [Color(0x332E7D32), Color(0x33827717), Color(0x33558B2F), Color(0x3300695C)]),
];

/// Everything a teacher can set on a template besides the texts.
class OrganiserOptions {
  const OrganiserOptions({
    this.count,
    this.perGroup,
    this.theme = 0,
    this.vertical = false,
    this.scaleByDate = false,
    this.oneToMany = false,
    this.expression = '',
    this.universe = true,
    this.picks = const [],
    this.labels,
  });

  /// Rows, branches, steps, events or categories (see [organiserCount]).
  final int? count;

  /// Causes per category, sub-items per branch (see [organiserPerGroup]).
  final int? perGroup;
  final int theme;

  /// Timeline: top to bottom instead of left to right.
  final bool vertical;

  /// Timeline: place events by their dates.
  final bool scaleByDate;

  /// Cause and effect: one cause leads to many effects (else many causes lead to one effect).
  final bool oneToMany;

  /// Venn: the set expression to shade (see [parseVenn]).
  final String expression;

  /// Venn: draw the universe box.
  final bool universe;

  /// Cause or effect: for each statement 0 unmarked, 1 cause, 2 effect.
  final List<int> picks;

  /// The teacher's texts in place of the defaults.
  final List<String>? labels;
}

/// Hands out the labels of a template in order: the teacher's text for each, else the default.
class _Labels {
  _Labels(this.edits, this.defaults);
  final List<String>? edits;
  final List<String> defaults;
  int _i = 0;

  String t(String def) {
    if (def.trim().isEmpty) return def;
    defaults.add(def);
    final i = _i++;
    final e = edits != null && i < edits!.length ? edits![i] : null;
    return e == null || e.trim().isEmpty ? def : e;
  }
}

/// A graphic organiser as ordinary board elements, ready to write in.
List<BoardElement> organiserElements(Organiser o, FeatureStrings s, Color ink, {int? count, List<String>? labels, OrganiserOptions options = const OrganiserOptions()}) =>
    _Build(o, s, FeatureStrings(s.lang, organiserStringTable), ink, options, count, _Labels(labels ?? options.labels, [])).build();

/// The default texts of an organiser's labels, in order (what the editor lists).
List<String> organiserLabels(Organiser o, FeatureStrings s, {int? count, OrganiserOptions options = const OrganiserOptions()}) {
  final l = _Labels(null, []);
  _Build(o, s, FeatureStrings(s.lang, organiserStringTable), const Color(0xFF000000), options, count, l).build();
  return l.defaults;
}

/// How far along a timeline each event sits (board units from the first), given their dates.
/// Evenly spaced; or in proportion to the dates when they can all be read and [scale] is on.
/// Never closer than [minGap].
List<double> timelineSpacing(List<String> dates, {required bool scale, double step = 220, double minGap = 160}) {
  final n = dates.length;
  final values = [for (final d in dates) timelineValue(d)];
  final even = [for (var i = 0; i < n; i++) i * step];
  if (!scale || n < 2 || values.any((v) => v == null)) return even;
  final v = values.cast<double>();
  final lo = v.reduce(math.min), hi = v.reduce(math.max);
  if (hi == lo) return even;
  final out = [for (final x in v) (x - lo) / (hi - lo) * (n - 1) * step];
  // Dates may be given out of order; spacing follows the order of the list.
  for (var i = 1; i < n; i++) {
    out[i] = math.max(out[i], out[i - 1] + minGap);
  }
  return out;
}

/// A date as a number of days (or years), or null when it cannot be read: 2024-03-15, 15/3/2024,
/// 1857, -300, 1.5.
double? timelineValue(String text) {
  final t = text.trim();
  final dmy = RegExp(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$').firstMatch(t);
  if (dmy != null) {
    final day = int.parse(dmy[1]!), month = int.parse(dmy[2]!);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return DateTime.utc(int.parse(dmy[3]!), month, day).millisecondsSinceEpoch / 86400000 / 365.25 + 1970;
  }
  final iso = DateTime.tryParse(t);
  if (iso != null && t.contains(RegExp(r'\d{4}-\d'))) return iso.toUtc().millisecondsSinceEpoch / 86400000 / 365.25 + 1970;
  final ym = RegExp(r'^(\d{4})[/-](\d{1,2})$').firstMatch(t);
  if (ym != null) return int.parse(ym[1]!) + (int.parse(ym[2]!) - 1) / 12;
  return double.tryParse(t);
}

class _Build {
  _Build(this.o, this.s, this.os, this.ink, this.opt, int? count, this.L) {
    final range = organiserCount(o);
    n = range == null ? 0 : (count ?? opt.count ?? range.$2).clamp(range.$1, range.$3);
    final pg = organiserPerGroup(o);
    per = pg == null ? 0 : (opt.perGroup ?? pg.$2).clamp(pg.$1, pg.$3);
    final tints = organiserThemes[opt.theme.clamp(0, organiserThemes.length - 1)].$2;
    a = tints[0];
    b = tints[1];
    c = tints[2];
    d = tints[3];
  }

  final Organiser o;
  final FeatureStrings s, os;
  final Color ink;
  final OrganiserOptions opt;
  final _Labels L;
  late final int n, per;
  late final Color a, b, c, d;
  final out = <BoardElement>[];

  Color tint(int i) => [a, c, d, b][i % 4];

  /// Words broken into lines no wider than [maxW].
  String wrap(String text, double maxW, double size, {bool bold = false}) {
    final lines = <String>[];
    for (final para in text.split('\n')) {
      var line = '';
      for (final w in para.split(' ')) {
        final tryLine = line.isEmpty ? w : '$line $w';
        if (line.isNotEmpty && measureBoardText(tryLine, size, bold: bold).width > maxW) {
          lines.add(line);
          line = w;
        } else {
          line = tryLine;
        }
      }
      lines.add(line);
    }
    return lines.join('\n');
  }

  /// A label centred on [at] (wrapped to [maxW] when given). The text comes from the label list.
  void text(String def, Offset at, {double size = 22, bool bold = false, double? maxW}) {
    var t = L.t(def);
    if (maxW != null) t = wrap(t, maxW, size, bold: bold);
    out.add(boardLabel(t, at, ink, size: size, bold: bold, center: true));
  }

  /// A label placed by a point of its own box: [ax] 0 left to 1 right, [ay] 0 top to 1 bottom.
  TextElement put(String t, Offset p, double size, {bool bold = false, double ax = 0, double ay = 0.5}) {
    final m = measureBoardText(t, size, bold: bold);
    return TextElement(id: newElementId(), position: p - Offset(m.width * ax, m.height * ay), text: t, color: ink, fontSize: size, size: m, bold: bold);
  }

  void shape(ShapeKind k, Offset p, Offset q, {Color? fill, double w = 3}) => out.add(boardShape(k, p, q, ink, fill: fill, w: w));
  void line(Offset p, Offset q, {double w = 3}) => out.add(boardLine(p, q, ink, w: w));
  void arrow(Offset p, Offset q, {double w = 3}) => out.add(boardShape(ShapeKind.arrow, p, q, ink, w: w));

  /// A filled box with its words inside.
  void box(Rect r, String def, Color fill, {double size = 20, bool bold = false, ShapeKind kind = ShapeKind.rectangle}) {
    shape(kind, r.topLeft, r.bottomRight, fill: fill);
    text(def, r.center, size: size, bold: bold, maxW: r.width - 24);
  }

  /// The point where the line from [r]'s middle towards [to] leaves the rectangle.
  Offset edge(Rect r, Offset to) {
    final dx = to.dx - r.center.dx, dy = to.dy - r.center.dy;
    if (dx == 0 && dy == 0) return r.center;
    final t = math.min(dx == 0 ? double.infinity : (r.width / 2) / dx.abs(), dy == 0 ? double.infinity : (r.height / 2) / dy.abs());
    return r.center + Offset(dx, dy) * t;
  }

  /// An arrow between two boxes, edge to edge, a little short of each.
  void link(Rect p, Rect q, {double pad = 6}) {
    final u = (q.center - p.center);
    final unit = u / u.distance;
    arrow(edge(p, q.center) + unit * pad, edge(q, p.center) - unit * pad);
  }

  List<BoardElement> build() {
    switch (o) {
      case Organiser.venn2 || Organiser.venn3:
        _venn();
      case Organiser.kwl:
        out.addAll(boardTable([
          [L.t(s['know']), L.t(s['want']), L.t(s['learnt'])],
          for (var i = 0; i < n; i++) ['                    ', '                    ', '                    '],
        ], ink, size: 22, header: a));
      case Organiser.tchart:
        text(s['pros'], const Offset(160, 20), size: 30, bold: true);
        text(s['cons'], const Offset(480, 20), size: 30, bold: true);
        line(const Offset(0, 50), Offset(640, 50), w: 4);
        line(const Offset(320, 50), Offset(320, 50 + n * 60.0), w: 4);
        for (var i = 1; i <= n; i++) {
          line(Offset(0, 50 + i * 60.0), Offset(640, 50 + i * 60.0), w: i == n ? 4 : 1.5);
        }
      case Organiser.mindmap:
        _mindmap();
      case Organiser.cycle:
        _cycle();
      case Organiser.fishbone:
        _fishbone();
      case Organiser.flow:
        _flow();
      case Organiser.timeline:
        _timeline();
      case Organiser.hierarchy:
        _hierarchy();
      case Organiser.swot:
        shape(ShapeKind.rectangle, Offset.zero, const Offset(560, 400));
        line(const Offset(280, 0), const Offset(280, 400));
        line(const Offset(0, 200), const Offset(560, 200));
        for (final (i, k) in ['strengths', 'weaknesses', 'opportunities', 'threats'].indexed) {
          final x = i.isEven ? 140.0 : 420.0, y = i < 2 ? 0.0 : 200.0;
          shape(ShapeKind.rectangle, Offset(x - 140, y), Offset(x + 140, y + 48), fill: tint(i), w: 1);
          text(os[k], Offset(x, y + 24), size: 24, bold: true, maxW: 260);
        }
      case Organiser.frayer:
        _frayer();
      case Organiser.fiveW:
        out.addAll(boardTable([
          [L.t(os['question']), L.t(os['answer'])],
          for (final k in ['who', 'what', 'when', 'where', 'why', 'how']) [L.t(os[k]), '                                        '],
        ], ink, size: 24, header: a));
      case Organiser.compare:
        out.addAll(boardTable([
          [L.t(os['feature']), L.t(os['itemA']), L.t(os['itemB'])],
          for (var i = 1; i <= n; i++) [L.t('${os['feature']} $i'), '                    ', '                    '],
        ], ink, size: 22, header: a));
      case Organiser.causeEffect:
        _causeEffect();
      case Organiser.causeOrEffect:
        _causeOrEffect();
      case Organiser.pyramid:
        for (var i = 0; i < n; i++) {
          final half = 70.0 + i * 70, y = i * 80.0;
          shape(ShapeKind.rectangle, Offset(280 - half, y), Offset(280 + half, y + 70), fill: tint(i));
          text('${os['level']} ${n - i}', Offset(280, y + 35), size: 22, maxW: half * 2 - 24);
        }
      case Organiser.spider:
        _spider();
      case Organiser.concept:
        _concept();
      case Organiser.storyMap:
        _storyMap();
    }
    return out;
  }

  // ---- Venn -------------------------------------------------------------------------------

  void _venn() {
    final k = o == Organiser.venn2 ? 2 : 3;
    final g = VennGeometry(k);
    final res = parseVenn(opt.expression, sets: k);
    if (opt.universe) {
      shape(ShapeKind.rectangle, g.universe.topLeft, g.universe.bottomRight, w: 2);
      out.add(boardLabel('U', g.universe.topLeft + const Offset(16, 8), ink, size: 24, bold: true));
    }
    final fills = [a, b, c];
    for (var i = 0; i < k; i++) {
      shape(ShapeKind.circle, g.centres[i] - Offset(g.radius, 0), g.centres[i] + Offset(g.radius, 0), fill: fills[i]);
    }
    if (res.ok) {
      for (final (set, colour) in [(res.shade, const Color(0x80F9AB00)), (res.second, const Color(0x6600B894))]) {
        for (final m in set.toList()..sort()) {
          final poly = g.regionPolygon(m);
          if (poly.length > 2) out.add(PolygonElement(id: newElementId(), points: poly, color: colour, width: 0.1, fill: colour));
        }
      }
      for (final m in res.empty) {
        out.add(boardLabel('∅', g.anchor(m), ink, size: 30, bold: true, center: true));
      }
      final el = res.element;
      if (el != null) {
        final p = g.anchor(el.$2);
        shape(ShapeKind.circle, p - const Offset(6, 0), p + const Offset(6, 0), fill: ink, w: 1);
        out.add(boardLabel(el.$1, p + const Offset(16, -14), ink, size: 22, bold: true));
      }
    }
    for (var i = 0; i < k; i++) {
      text(['A', 'B', 'C'][i], g.names[i], size: 30, bold: true);
    }
    if (opt.expression.trim().isNotEmpty && res.ok) {
      text(opt.expression.trim(), Offset(g.universe.center.dx, g.universe.bottom + 28), size: 26, bold: true);
    }
  }

  // ---- mind map ---------------------------------------------------------------------------

  void _mindmap() {
    const centre = Offset(320, 230);
    shape(ShapeKind.ellipse, centre - const Offset(100, 40), centre + const Offset(100, 40), fill: a);
    text(s['topic'], centre, size: 28, bold: true, maxW: 170);
    for (var i = 0; i < n; i++) {
      final ang = -math.pi / 2 + i * 2 * math.pi / n;
      final end = centre + Offset(math.cos(ang) * 270, math.sin(ang) * 180);
      final r = Rect.fromCenter(center: end, width: 150, height: 56);
      line(centre + Offset(math.cos(ang) * 100, math.sin(ang) * 40), edge(r, centre));
      box(r, '${s['idea']} ${i + 1}', tint(i + 1));
    }
  }

  void _cycle() {
    const centre = Offset(340, 270);
    final rx = 140.0 + n * 30, ry = 100.0 + n * 20;
    final rects = <Rect>[];
    for (var i = 0; i < n; i++) {
      final ang = -math.pi / 2 + i * 2 * math.pi / n;
      rects.add(Rect.fromCenter(center: centre + Offset(math.cos(ang) * rx, math.sin(ang) * ry), width: 150, height: 60));
    }
    for (var i = 0; i < n; i++) {
      link(rects[i], rects[(i + 1) % n], pad: 8);
      box(rects[i], '${s['step']} ${i + 1}', tint(i), kind: ShapeKind.ellipse);
    }
  }

  void _fishbone() {
    final cols = (n + 1) ~/ 2;
    const colW = 280.0, spineY = 240.0;
    final endX = cols * colW + 20;
    arrow(Offset(0, spineY), Offset(endX, spineY), w: 4);
    final eff = Rect.fromLTWH(endX + 10, spineY - 45, 170, 90);
    box(eff, s['effect'], b, size: 24, bold: true);
    for (var i = 0; i < n; i++) {
      final top = i.isEven;
      final x = 100.0 + (i ~/ 2) * colW;
      final headY = top ? 0.0 : spineY * 2 - 44;
      final head = Rect.fromLTWH(x - 75, headY, 150, 44);
      final from = Offset(x, top ? 44 : headY), to = Offset(x + 110, spineY);
      line(from, to);
      box(head, '${os['category']} ${i + 1}', tint(i), size: 18, bold: true);
      for (var k = 0; k < per; k++) {
        final f = (k + 1) / (per + 1);
        final p = Offset.lerp(from, to, f)!;
        line(p, p - const Offset(36, 0), w: 2);
        out.add(put(wrap(L.t('${s['cause']} ${i * per + k + 1}'), 120, 16), p - const Offset(40, 0), 16, ax: 1));
      }
    }
  }

  void _flow() {
    const perRow = 4;
    final rects = <Rect>[
      for (var i = 0; i < n; i++) Rect.fromLTWH(((i ~/ perRow).isEven ? i % perRow : perRow - 1 - i % perRow) * 230.0, (i ~/ perRow) * 150.0, 170, 90),
    ];
    for (var i = 0; i < n; i++) {
      box(rects[i], '${s['step']} ${i + 1}', tint(i));
      if (i < n - 1) link(rects[i], rects[i + 1], pad: 4);
    }
  }

  void _timeline() {
    final dates = <String>[], events = <String>[];
    // Read the labels first (date, event for each) so the spacing can follow the dates.
    for (var i = 0; i < n; i++) {
      dates.add(L.t(os['date']));
      events.add(L.t(os['event']));
    }
    final pos = timelineSpacing(dates, scale: opt.scaleByDate, step: opt.vertical ? 100 : 220, minGap: opt.vertical ? 90 : 170);
    if (opt.vertical) {
      arrow(const Offset(260, 0), Offset(260, pos.last + 60), w: 4);
    } else {
      arrow(const Offset(0, 140), Offset(pos.last + 220, 140), w: 4);
    }
    for (var i = 0; i < n; i++) {
      final p = 50.0 + pos[i];
      if (opt.vertical) {
        shape(ShapeKind.circle, Offset(251, p - 9), Offset(269, p + 9), fill: tint(i), w: 2);
        out.add(put(wrap(dates[i], 190, 22, bold: true), Offset(240, p), 22, bold: true, ax: 1));
        out.add(put(wrap(events[i], 260, 20), Offset(285, p), 20));
      } else {
        final x = 80.0 + pos[i];
        shape(ShapeKind.circle, Offset(x - 9, 131), Offset(x + 9, 149), fill: tint(i), w: 2);
        out.add(boardLabel(wrap(dates[i], 150, 22, bold: true), Offset(x, 100), ink, size: 22, bold: true, center: true));
        out.add(boardLabel(wrap(events[i], 150, 20), Offset(x, 200), ink, size: 20, center: true));
      }
    }
  }

  void _hierarchy() {
    final w = n * 180.0, mid = w / 2;
    final root = Rect.fromCenter(center: Offset(mid, 35), width: 200, height: 70);
    box(root, s['topic'], a, size: 26, bold: true);
    for (var i = 0; i < n; i++) {
      final x = i * 180.0 + 90;
      final r = Rect.fromCenter(center: Offset(x, 185), width: 160, height: 70);
      line(Offset(mid, 70), Offset(x, 150));
      box(r, '${s['idea']} ${i + 1}', tint(i + 1));
      for (var k = 0; k < per; k++) {
        final sub = Rect.fromCenter(center: Offset(x, 300 + k * 90.0), width: 150, height: 56);
        line(Offset(x, k == 0 ? 220 : 300 + (k - 1) * 90.0 + 28), Offset(x, sub.top));
        box(sub, '${s['idea']} ${i + 1}.${k + 1}', tint(i + 1), size: 18);
      }
    }
  }

  void _frayer() {
    shape(ShapeKind.rectangle, Offset.zero, const Offset(560, 420));
    line(const Offset(280, 0), const Offset(280, 420), w: 2);
    line(const Offset(0, 210), const Offset(560, 210), w: 2);
    shape(ShapeKind.ellipse, const Offset(205, 172), const Offset(355, 248), fill: a);
    text(os['word'], const Offset(280, 210), size: 24, bold: true, maxW: 120);
    text(os['definition'], const Offset(100, 26), bold: true, maxW: 170);
    text(os['characteristics'], const Offset(460, 26), size: 22, bold: true, maxW: 170);
    text(os['examples'], const Offset(100, 232), bold: true, maxW: 100);
    text(os['nonExamples'], const Offset(460, 232), size: 22, bold: true, maxW: 170);
  }

  // ---- cause and effect --------------------------------------------------------------------

  void _causeEffect() {
    final many = 20.0 + (n - 1) * 100 + 70;
    final mid = many / 2;
    final single = Rect.fromCenter(center: Offset(opt.oneToMany ? 95 : 520, mid), width: 190, height: 90);
    final rows = [for (var i = 0; i < n; i++) Rect.fromLTWH(opt.oneToMany ? 440 : 0, 20.0 + i * 100, 190, 70)];
    final one = opt.oneToMany ? s['cause'] : s['effect'];
    final each = opt.oneToMany ? s['effect'] : s['cause'];
    box(single, one, opt.oneToMany ? a : b, size: 24, bold: true);
    for (var i = 0; i < n; i++) {
      if (opt.oneToMany) {
        arrow(Offset(single.right + 6, single.center.dy), Offset(rows[i].left - 6, rows[i].center.dy));
      } else {
        arrow(Offset(rows[i].right + 6, rows[i].center.dy), Offset(single.left - 6, single.center.dy));
      }
      box(rows[i], '$each ${i + 1}', tint(i + (opt.oneToMany ? 1 : 0)));
    }
  }

  void _causeOrEffect() {
    const w1 = 380.0, w2 = 130.0, rowH = 64.0, headH = 44.0;
    final total = w1 + w2 * 2, height = headH + n * rowH;
    shape(ShapeKind.rectangle, Offset.zero, Offset(total, height), w: 2);
    shape(ShapeKind.rectangle, Offset.zero, Offset(total, headH), fill: a, w: 1);
    text(os['statement'], const Offset(w1 / 2, headH / 2), size: 22, bold: true, maxW: w1 - 20);
    text(s['cause'], const Offset(w1 + w2 / 2, headH / 2), size: 16, bold: true, maxW: w2 - 6);
    text(s['effect'], const Offset(w1 + w2 * 1.5, headH / 2), size: 16, bold: true, maxW: w2 - 6);
    line(const Offset(w1, 0), Offset(w1, height), w: 2);
    line(const Offset(w1 + w2, 0), Offset(w1 + w2, height), w: 2);
    for (var i = 0; i < n; i++) {
      final y = headH + i * rowH;
      line(Offset(0, y), Offset(total, y), w: 2);
      text('${os['statement']} ${i + 1}', Offset(w1 / 2, y + rowH / 2), size: 20, maxW: w1 - 24);
      final pick = i < opt.picks.length ? opt.picks[i] : 0;
      for (var k = 0; k < 2; k++) {
        final cx = w1 + w2 * (k + 0.5), cy = y + rowH / 2;
        shape(ShapeKind.circle, Offset(cx - 17, cy), Offset(cx + 17, cy), fill: pick == k + 1 ? ink : null, w: 2);
      }
    }
  }

  // ---- others ------------------------------------------------------------------------------

  void _spider() {
    const cx = 320.0;
    final rows = (n + 1) ~/ 2;
    final mid = rows * 120.0 / 2 - 10;
    shape(ShapeKind.ellipse, Offset(cx - 80, mid - 40), Offset(cx + 80, mid + 40), fill: a);
    text(s['topic'], Offset(cx, mid), size: 24, bold: true, maxW: 130);
    for (var i = 0; i < n; i++) {
      final left = i.isEven;
      final r = Rect.fromLTWH(left ? 0 : 440, (i ~/ 2) * 120.0, 200, 50);
      line(Offset(left ? cx - 78 : cx + 78, mid), Offset(left ? r.right : r.left, r.center.dy), w: 3);
      box(r, '${s['idea']} ${i + 1}', tint(i + 1));
      for (final dy in [72.0, 98.0]) {
        line(Offset(r.left, r.top + dy), Offset(r.right, r.top + dy), w: 1.5);
      }
    }
  }

  void _concept() {
    const centre = Offset(360, 280);
    final main = Rect.fromCenter(center: centre, width: 180, height: 64);
    final rects = <Rect>[];
    for (var i = 0; i < n; i++) {
      final ang = -math.pi / 2 + i * 2 * math.pi / n;
      rects.add(Rect.fromCenter(center: centre + Offset(math.cos(ang) * 330, math.sin(ang) * 215), width: 150, height: 56));
    }
    for (var i = 0; i < n; i++) {
      final from = edge(main, rects[i].center), to = edge(rects[i], main.center);
      arrow(from, to);
      final mid = Offset.lerp(from, to, 0.5)!;
      final dir = (to - from) / (to - from).distance;
      text(os['linksTo'], mid + Offset(-dir.dy, dir.dx) * 16, size: 16, maxW: 110);
    }
    box(main, os['mainConcept'], a, size: 22, bold: true);
    for (var i = 0; i < n; i++) {
      box(rects[i], '${os['concept']} ${i + 1}', tint(i + 1), size: 18, kind: ShapeKind.ellipse);
    }
  }

  void _storyMap() {
    final keys = ['characters', 'setting', 'problem', 'events', 'solution', 'lesson'];
    for (final (i, k) in keys.indexed) {
      final r = Rect.fromLTWH((i % 2) * 300.0, (i ~/ 2) * 190.0, 280, 170);
      shape(ShapeKind.rectangle, r.topLeft, r.bottomRight);
      shape(ShapeKind.rectangle, r.topLeft, Offset(r.right, r.top + 44), fill: tint(i), w: 1);
      text(os[k], Offset(r.center.dx, r.top + 22), size: 22, bold: true, maxW: 250);
    }
  }
}
