import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../extras/board_table.dart';
import 'teaching_aids.dart' show aidStrings;

/// The graphic organisers the board has.
enum Organiser { venn2, venn3, kwl, tchart, mindmap, cycle, fishbone, flow, timeline, hierarchy, swot, frayer, fiveW, compare, causeEffect, pyramid }

/// The first seven names are in the teaching aids' own strings; the rest are here.
const _oldNames = {Organiser.venn2, Organiser.venn3, Organiser.kwl, Organiser.tchart, Organiser.mindmap, Organiser.cycle, Organiser.fishbone};

/// How many parts a template can have (branches, steps, events…): (smallest, default, largest);
/// null when the template has a fixed shape.
(int, int, int)? organiserCount(Organiser o) => switch (o) {
  Organiser.mindmap => (3, 6, 8),
  Organiser.cycle => (3, 4, 8),
  Organiser.fishbone => (1, 3, 4),
  Organiser.flow => (2, 4, 6),
  Organiser.timeline => (3, 5, 8),
  Organiser.hierarchy => (2, 3, 6),
  Organiser.causeEffect => (1, 3, 5),
  Organiser.pyramid => (3, 4, 6),
  _ => null,
};

/// Hands out the labels of a template in order: the teacher's text for each, else the default.
class _Labels {
  _Labels(this.edits, this.defaults);
  final List<String>? edits;
  final List<String> defaults;
  int _i = 0;

  /// The text for a label whose default is [def] (blank cells keep their spacing).
  String t(String def) {
    if (def.trim().isEmpty) return def;
    defaults.add(def);
    final i = _i++;
    final e = edits != null && i < edits!.length ? edits![i] : null;
    return e == null || e.trim().isEmpty ? def : e;
  }
}

/// A graphic organiser as ordinary board elements, ready to write in. [count] sets the number
/// of branches, steps or events (see [organiserCount]); [labels] are the texts to use in place
/// of the defaults, in the order [organiserLabels] lists them.
List<BoardElement> organiserElements(Organiser o, FeatureStrings s, Color ink, {int? count, List<String>? labels}) =>
    _build(o, s, FeatureStrings(s.lang, organiserStringTable), ink, count, _Labels(labels, []));

/// The default texts of an organiser's labels, in order (what the editor lists).
List<String> organiserLabels(Organiser o, FeatureStrings s, {int? count}) {
  final l = _Labels(null, []);
  _build(o, s, FeatureStrings(s.lang, organiserStringTable), const Color(0xFF000000), count, l);
  return l.defaults;
}

List<BoardElement> _build(Organiser o, FeatureStrings s, FeatureStrings os, Color ink, int? count, _Labels L) {
  const a = Color(0x334F8CFF), b = Color(0x33FF5A5F), c = Color(0x333CB44B), d = Color(0x33F9AB00);
  final range = organiserCount(o);
  final n = range == null ? 0 : (count ?? range.$2).clamp(range.$1, range.$3);
  TextElement label(String text, Offset at, {double size = 22, bool bold = false}) => boardLabel(L.t(text), at, ink, size: size, bold: bold, center: true);
  switch (o) {
    case Organiser.venn2:
      return [
        boardShape(ShapeKind.circle, const Offset(200, 200), const Offset(380, 200), ink, fill: a),
        boardShape(ShapeKind.circle, const Offset(440, 200), const Offset(620, 200), ink, fill: b),
        label('A', const Offset(120, 200), size: 30, bold: true),
        label('B', const Offset(520, 200), size: 30, bold: true),
        label('A ∩ B', const Offset(320, 200)),
      ];
    case Organiser.venn3:
      return [
        boardShape(ShapeKind.circle, const Offset(240, 180), const Offset(400, 180), ink, fill: a),
        boardShape(ShapeKind.circle, const Offset(420, 180), const Offset(580, 180), ink, fill: b),
        boardShape(ShapeKind.circle, const Offset(330, 330), const Offset(490, 330), ink, fill: c),
        label('A', const Offset(170, 140), size: 30, bold: true),
        label('B', const Offset(490, 140), size: 30, bold: true),
        label('C', const Offset(330, 420), size: 30, bold: true),
      ];
    case Organiser.kwl:
      return boardTable(
        [
          [L.t(s['know']), L.t(s['want']), L.t(s['learnt'])],
          for (var i = 0; i < 5; i++) ['                    ', '                    ', '                    '],
        ],
        ink,
        size: 22,
        header: a,
      );
    case Organiser.tchart:
      return [
        label(s['pros'], const Offset(160, 20), size: 30, bold: true),
        label(s['cons'], const Offset(480, 20), size: 30, bold: true),
        boardLine(const Offset(0, 50), const Offset(640, 50), ink, w: 4),
        boardLine(const Offset(320, 50), const Offset(320, 440), ink, w: 4),
      ];
    case Organiser.mindmap:
      final out = <BoardElement>[boardShape(ShapeKind.ellipse, const Offset(220, 190), const Offset(420, 270), ink, fill: a), label(s['topic'], const Offset(320, 230), size: 28, bold: true)];
      for (var i = 0; i < n; i++) {
        final ang = -math.pi / 2 + i * 2 * math.pi / n;
        final end = const Offset(320, 230) + Offset(math.cos(ang) * 260, math.sin(ang) * 170);
        final start = const Offset(320, 230) + Offset(math.cos(ang) * 105, math.sin(ang) * 45);
        out
          ..add(boardLine(start, end, ink, w: 3))
          ..add(boardShape(ShapeKind.rectangle, end - const Offset(70, 26), end + const Offset(70, 26), ink, fill: i.isEven ? b : c))
          ..add(label('${s['idea']} ${i + 1}', end, size: 20));
      }
      return out;
    case Organiser.cycle:
      final out = <BoardElement>[];
      for (var i = 0; i < n; i++) {
        final ang = -math.pi / 2 + i * 2 * math.pi / n;
        final p = const Offset(300, 240) + Offset(math.cos(ang) * 200, math.sin(ang) * 170);
        final q = const Offset(300, 240) + Offset(math.cos(ang + 2 * math.pi / n) * 200, math.sin(ang + 2 * math.pi / n) * 170);
        out
          ..add(boardShape(ShapeKind.ellipse, p - const Offset(80, 32), p + const Offset(80, 32), ink, fill: i.isEven ? a : c))
          ..add(label('${s['step']} ${i + 1}', p))
          ..add(boardShape(ShapeKind.arrow, Offset.lerp(p, q, 0.3)!, Offset.lerp(p, q, 0.7)!, ink, w: 3));
      }
      return out;
    case Organiser.fishbone:
      final out = <BoardElement>[
        boardShape(ShapeKind.arrow, const Offset(0, 200), Offset(n * 160.0 + 120, 200), ink, w: 4),
        boardShape(ShapeKind.rectangle, Offset(n * 160.0 + 130, 160), Offset(n * 160.0 + 280, 240), ink, fill: b),
        label(s['effect'], Offset(n * 160.0 + 205, 200), size: 24, bold: true),
      ];
      for (var i = 0; i < n; i++) {
        final x = 120.0 + i * 160;
        out
          ..add(boardLine(Offset(x, 60), Offset(x + 80, 200), ink, w: 3))
          ..add(boardLine(Offset(x, 340), Offset(x + 80, 200), ink, w: 3))
          ..add(label('${s['cause']} ${i * 2 + 1}', Offset(x - 20, 36), size: 18))
          ..add(label('${s['cause']} ${i * 2 + 2}', Offset(x - 20, 364), size: 18));
      }
      return out;
    case Organiser.flow:
      final out = <BoardElement>[];
      for (var i = 0; i < n; i++) {
        final x = i * 230.0;
        out
          ..add(boardShape(ShapeKind.rectangle, Offset(x, 0), Offset(x + 170, 90), ink, fill: i.isEven ? a : c))
          ..add(label('${s['step']} ${i + 1}', Offset(x + 85, 45)));
        if (i < n - 1) out.add(boardShape(ShapeKind.arrow, Offset(x + 178, 45), Offset(x + 222, 45), ink, w: 3));
      }
      return out;
    case Organiser.timeline:
      final out = <BoardElement>[boardShape(ShapeKind.arrow, const Offset(0, 120), Offset(n * 180.0 + 40, 120), ink, w: 4)];
      for (var i = 0; i < n; i++) {
        final x = 60.0 + i * 180;
        out
          ..add(boardShape(ShapeKind.circle, Offset(x - 9, 111), Offset(x + 9, 129), ink, fill: i.isEven ? b : a))
          ..add(label(os['date'], Offset(x, 80), bold: true))
          ..add(label(os['event'], Offset(x, 170), size: 20));
      }
      return out;
    case Organiser.hierarchy:
      final out = <BoardElement>[boardShape(ShapeKind.rectangle, Offset(n * 90.0 - 90, 0), Offset(n * 90.0 + 90, 70), ink, fill: a), label(s['topic'], Offset(n * 90.0, 35), size: 26, bold: true)];
      for (var i = 0; i < n; i++) {
        final x = 90.0 + i * 180 - 90;
        out
          ..add(boardLine(Offset(n * 90.0, 70), Offset(x + 80, 150), ink, w: 3))
          ..add(boardShape(ShapeKind.rectangle, Offset(x, 150), Offset(x + 160, 220), ink, fill: i.isEven ? b : c))
          ..add(label('${s['idea']} ${i + 1}', Offset(x + 80, 185), size: 20));
      }
      return out;
    case Organiser.swot:
      return [
        boardShape(ShapeKind.rectangle, const Offset(0, 0), const Offset(560, 400), ink),
        boardLine(const Offset(280, 0), const Offset(280, 400), ink, w: 3),
        boardLine(const Offset(0, 200), const Offset(560, 200), ink, w: 3),
        label(os['strengths'], const Offset(140, 24), size: 24, bold: true),
        label(os['weaknesses'], const Offset(420, 24), size: 24, bold: true),
        label(os['opportunities'], const Offset(140, 224), size: 24, bold: true),
        label(os['threats'], const Offset(420, 224), size: 24, bold: true),
      ];
    case Organiser.frayer:
      return [
        boardShape(ShapeKind.rectangle, const Offset(0, 0), const Offset(560, 420), ink),
        boardLine(const Offset(0, 0), const Offset(560, 420), ink, w: 2),
        boardLine(const Offset(560, 0), const Offset(0, 420), ink, w: 2),
        boardShape(ShapeKind.ellipse, const Offset(190, 150), const Offset(370, 270), ink, fill: a),
        label(os['word'], const Offset(280, 210), size: 26, bold: true),
        label(os['definition'], const Offset(280, 40), bold: true),
        label(os['characteristics'], const Offset(70, 210), size: 20, bold: true),
        label(os['examples'], const Offset(280, 380), bold: true),
        label(os['nonExamples'], const Offset(490, 210), size: 20, bold: true),
      ];
    case Organiser.fiveW:
      return boardTable(
        [
          [L.t(os['question']), L.t(os['answer'])],
          for (final k in ['who', 'what', 'when', 'where', 'why', 'how']) [L.t(os[k]), '                                        '],
        ],
        ink,
        size: 24,
        header: a,
      );
    case Organiser.compare:
      return boardTable(
        [
          [L.t(os['feature']), L.t(os['itemA']), L.t(os['itemB'])],
          for (var i = 1; i <= 5; i++) [L.t('${os['feature']} $i'), '                    ', '                    '],
        ],
        ink,
        size: 22,
        header: a,
      );
    case Organiser.causeEffect:
      final out = <BoardElement>[];
      final mid = (n * 100.0) / 2 + 20;
      out
        ..add(boardShape(ShapeKind.rectangle, Offset(440, mid - 40), Offset(600, mid + 40), ink, fill: b))
        ..add(label(s['effect'], Offset(520, mid), size: 24, bold: true));
      for (var i = 0; i < n; i++) {
        final y = 20.0 + i * 100;
        out
          ..add(boardShape(ShapeKind.rectangle, Offset(0, y), Offset(190, y + 70), ink, fill: i.isEven ? a : c))
          ..add(label('${s['cause']} ${i + 1}', Offset(95, y + 35), size: 20))
          ..add(boardShape(ShapeKind.arrow, Offset(200, y + 35), Offset(430, mid), ink, w: 3));
      }
      return out;
    case Organiser.pyramid:
      final out = <BoardElement>[];
      for (var i = 0; i < n; i++) {
        final half = 70.0 + i * 70;
        final y = i * 80.0;
        out
          ..add(boardShape(ShapeKind.rectangle, Offset(280 - half, y), Offset(280 + half, y + 70), ink, fill: [a, c, d, b][i % 4]))
          ..add(label('${os['level']} ${n - i}', Offset(280, y + 35), size: 22));
      }
      return out;
  }
}

FeatureStrings organiserStrings(BuildContext context) => FeatureStrings(boardLang(context), organiserStringTable);

const organiserStringTable = <String, Map<String, String>>{
  'en': {
    'flow': 'Flow chart',
    'timeline': 'Timeline',
    'hierarchy': 'Tree / hierarchy',
    'swot': 'SWOT',
    'frayer': 'Frayer model',
    'fiveW': '5 W and H',
    'compare': 'Compare table',
    'causeEffect': 'Causes to effect',
    'pyramid': 'Pyramid',
    'date': 'Date',
    'event': 'Event',
    'strengths': 'Strengths',
    'weaknesses': 'Weaknesses',
    'opportunities': 'Opportunities',
    'threats': 'Threats',
    'word': 'Word',
    'definition': 'Definition',
    'characteristics': 'Characteristics',
    'examples': 'Examples',
    'nonExamples': 'Non-examples',
    'question': 'Question',
    'answer': 'Answer',
    'who': 'Who',
    'what': 'What',
    'when': 'When',
    'where': 'Where',
    'why': 'Why',
    'how': 'How',
    'feature': 'Feature',
    'itemA': 'A',
    'itemB': 'B',
    'level': 'Level',
    'edit': 'Edit the labels',
    'count': 'Number of parts: {n}',
    'add': 'Add to the board',
    'back': 'All organisers',
    'resetLabels': 'Original labels',
  },
  'hi': {
    'flow': 'प्रवाह चार्ट',
    'timeline': 'समयरेखा',
    'hierarchy': 'वृक्ष / पदानुक्रम',
    'swot': 'स्वॉट (SWOT)',
    'frayer': 'फ्रेयर मॉडल',
    'fiveW': 'कौन, क्या, कब, कहाँ, क्यों, कैसे',
    'compare': 'तुलना तालिका',
    'causeEffect': 'कारण से प्रभाव',
    'pyramid': 'पिरामिड',
    'date': 'तिथि',
    'event': 'घटना',
    'strengths': 'ताकत',
    'weaknesses': 'कमज़ोरियाँ',
    'opportunities': 'अवसर',
    'threats': 'खतरे',
    'word': 'शब्द',
    'definition': 'परिभाषा',
    'characteristics': 'विशेषताएँ',
    'examples': 'उदाहरण',
    'nonExamples': 'गैर-उदाहरण',
    'question': 'प्रश्न',
    'answer': 'उत्तर',
    'who': 'कौन',
    'what': 'क्या',
    'when': 'कब',
    'where': 'कहाँ',
    'why': 'क्यों',
    'how': 'कैसे',
    'feature': 'विशेषता',
    'itemA': 'क',
    'itemB': 'ख',
    'level': 'स्तर',
    'edit': 'लेबल बदलें',
    'count': 'भागों की संख्या: {n}',
    'add': 'बोर्ड पर जोड़ें',
    'back': 'सभी ऑर्गनाइज़र',
    'resetLabels': 'मूल लेबल',
  },
  'kn': {
    'flow': 'ಹರಿವು ನಕ್ಷೆ',
    'timeline': 'ಕಾಲರೇಖೆ',
    'hierarchy': 'ವೃಕ್ಷ / ಶ್ರೇಣಿ',
    'swot': 'ಸ್ವಾಟ್ (SWOT)',
    'frayer': 'ಫ್ರೇಯರ್ ಮಾದರಿ',
    'fiveW': 'ಯಾರು, ಏನು, ಯಾವಾಗ, ಎಲ್ಲಿ, ಏಕೆ, ಹೇಗೆ',
    'compare': 'ಹೋಲಿಕೆ ಕೋಷ್ಟಕ',
    'causeEffect': 'ಕಾರಣದಿಂದ ಪರಿಣಾಮ',
    'pyramid': 'ಪಿರಮಿಡ್',
    'date': 'ದಿನಾಂಕ',
    'event': 'ಘಟನೆ',
    'strengths': 'ಬಲಗಳು',
    'weaknesses': 'ದೌರ್ಬಲ್ಯಗಳು',
    'opportunities': 'ಅವಕಾಶಗಳು',
    'threats': 'ಅಪಾಯಗಳು',
    'word': 'ಪದ',
    'definition': 'ವ್ಯಾಖ್ಯೆ',
    'characteristics': 'ಲಕ್ಷಣಗಳು',
    'examples': 'ಉದಾಹರಣೆಗಳು',
    'nonExamples': 'ಉದಾಹರಣೆಯಲ್ಲದವು',
    'question': 'ಪ್ರಶ್ನೆ',
    'answer': 'ಉತ್ತರ',
    'who': 'ಯಾರು',
    'what': 'ಏನು',
    'when': 'ಯಾವಾಗ',
    'where': 'ಎಲ್ಲಿ',
    'why': 'ಏಕೆ',
    'how': 'ಹೇಗೆ',
    'feature': 'ಲಕ್ಷಣ',
    'itemA': 'ಅ',
    'itemB': 'ಆ',
    'level': 'ಹಂತ',
    'edit': 'ಲೇಬಲ್‌ಗಳನ್ನು ಬದಲಿಸಿ',
    'count': 'ಭಾಗಗಳ ಸಂಖ್ಯೆ: {n}',
    'add': 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ',
    'back': 'ಎಲ್ಲ ಆರ್ಗನೈಸರ್‌ಗಳು',
    'resetLabels': 'ಮೂಲ ಲೇಬಲ್‌ಗಳು',
  },
};

/// The organisers to pick from. Tap one to edit its labels and number of parts, then add it
/// to the board as ordinary text and shapes that can be written on and moved.
class OrganisersPanel extends StatefulWidget {
  const OrganisersPanel({super.key, required this.wb});
  final WhiteboardController wb;

  static const icons = {
    Organiser.venn2: Icons.join_inner,
    Organiser.venn3: Icons.workspaces_outline,
    Organiser.kwl: Icons.view_column_outlined,
    Organiser.tchart: Icons.vertical_split_outlined,
    Organiser.mindmap: Icons.hub_outlined,
    Organiser.cycle: Icons.autorenew,
    Organiser.fishbone: Icons.account_tree_outlined,
    Organiser.flow: Icons.arrow_right_alt,
    Organiser.timeline: Icons.timeline,
    Organiser.hierarchy: Icons.schema_outlined,
    Organiser.swot: Icons.grid_view,
    Organiser.frayer: Icons.crop_square,
    Organiser.fiveW: Icons.help_outline,
    Organiser.compare: Icons.table_chart_outlined,
    Organiser.causeEffect: Icons.call_merge,
    Organiser.pyramid: Icons.change_history,
  };

  @override
  State<OrganisersPanel> createState() => OrganisersPanelState();
}

class OrganisersPanelState extends State<OrganisersPanel> {
  Organiser? _open;
  int _count = 0;
  List<TextEditingController> _fields = [];

  /// Fields replaced when the number of parts changed; they are let go with the panel (a field
  /// still on screen must not be disposed under its text box).
  final _retired = <TextEditingController>[];

  @override
  void dispose() {
    for (final f in [..._fields, ..._retired]) {
      f.dispose();
    }
    super.dispose();
  }

  String _name(Organiser o, FeatureStrings s, FeatureStrings os) => _oldNames.contains(o) ? s[o.name] : os[o.name];

  void _select(Organiser o, FeatureStrings s) {
    final range = organiserCount(o);
    _count = range?.$2 ?? 0;
    _setFields(o, s);
    setState(() => _open = o);
  }

  void _setFields(Organiser o, FeatureStrings s) {
    final old = {for (var i = 0; i < _fields.length; i++) i: _fields[i].text};
    final defaults = organiserLabels(o, s, count: _count == 0 ? null : _count);
    _retired.addAll(_fields);
    // Keep what was typed for the labels that still exist.
    _fields = [for (final (i, d) in defaults.indexed) TextEditingController(text: old[i] ?? d)];
  }

  void _add(Organiser o, FeatureStrings s) {
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    widget.wb.insert(organiserElements(o, s, ink, count: _count == 0 ? null : _count, labels: [for (final f in _fields) f.text]));
    showBoardMessage(context, s['onBoard']);
  }

  @override
  Widget build(BuildContext context) {
    final s = aidStrings(context);
    final os = organiserStrings(context);
    final open = _open;
    if (open != null) return _editor(context, open, s, os);
    return GridView.extent(
      key: const Key('organisers-panel'),
      padding: const EdgeInsets.all(Kx.s16),
      maxCrossAxisExtent: 170,
      mainAxisSpacing: Kx.s12,
      crossAxisSpacing: Kx.s12,
      children: [
        for (final o in Organiser.values)
          Material(
            color: context.colors.surfaceContainerLow,
            borderRadius: Kx.radiusLg,
            child: InkWell(
              key: Key('organiser-${o.name}'),
              borderRadius: Kx.radiusLg,
              onTap: () => _select(o, s),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(OrganisersPanel.icons[o], size: 44),
                  const SizedBox(height: Kx.s8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(_name(o, s, os), textAlign: TextAlign.center),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _editor(BuildContext context, Organiser o, FeatureStrings s, FeatureStrings os) {
    final range = organiserCount(o);
    return ListView(
      key: const Key('organiser-editor'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Row(
          children: [
            TextButton.icon(key: const Key('organiser-back'), onPressed: () => setState(() => _open = null), icon: const Icon(Icons.arrow_back), label: Text(os['back'])),
            const Spacer(),
            FilledButton.icon(key: const Key('organiser-add'), onPressed: () => _add(o, s), icon: const Icon(Icons.add_to_photos_outlined), label: Text(os['add'])),
          ],
        ),
        Text(_name(o, s, os), style: context.text.titleLarge),
        if (range != null)
          Row(
            children: [
              Expanded(child: Text(os.n('count', _count))),
              IconButton.outlined(
                key: const Key('organiser-count-minus'),
                onPressed: _count <= range.$1
                    ? null
                    : () => setState(() {
                        _count--;
                        _setFields(o, s);
                      }),
                icon: const Icon(Icons.remove),
              ),
              IconButton.outlined(
                key: const Key('organiser-count-plus'),
                onPressed: _count >= range.$3
                    ? null
                    : () => setState(() {
                        _count++;
                        _setFields(o, s);
                      }),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        const SizedBox(height: Kx.s8),
        Text(os['edit'], style: context.text.titleSmall),
        for (final (i, f) in _fields.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: TextField(
              key: Key('organiser-label-$i'),
              controller: f,
              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
            ),
          ),
      ],
    );
  }
}
