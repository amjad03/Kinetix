import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/board_controller.dart';
import '../../../l10n/l10n.dart';
import '../../ai/ai_controller.dart';
import '../side_panel.dart';
import 'builders.dart';
import 'subject_data.dart';
import 'subjects.dart';

/// The subject kit beside the board: "This lesson" first, then the subject's own material
/// (formula sheets, constants, the periodic table, ions, key dates, a word wall, logic gates,
/// number bases) and, for the little ones, class stars. Everything taps onto the board.
class SubjectKitPanel extends StatefulWidget {
  const SubjectKitPanel({
    super.key,
    required this.board,
    required this.wb,
    required this.style,
    required this.primary,
    required this.onAi,
    required this.onPanel,
    required this.onSplit,
    this.initialTab,
  });

  final BoardController board;
  final WhiteboardController wb;
  final SubjectStyle style;
  final bool primary;

  /// Opens the AI panel at a tool.
  final ValueChanged<AiView> onAi;
  final ValueChanged<PanelKind> onPanel;

  /// Opens 3D models or labs next to the board.
  final ValueChanged<SplitContent> onSplit;
  final KitTab? initialTab;

  @override
  State<SubjectKitPanel> createState() => _SubjectKitPanelState();
}

class _SubjectKitPanelState extends State<SubjectKitPanel> {
  late KitTab _tab;
  String _q = '';

  List<KitTab> get _tabs => kitTabsFor(widget.style, primary: widget.primary);
  Color get _accent => widget.style.accent;
  Color get _ink => widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
  BoardFont get _font => widget.primary ? BoardFont.andika : BoardFont.inter;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab != null && _tabs.contains(widget.initialTab) ? widget.initialTab! : (_tabs.length > 1 ? _tabs[1] : _tabs.first);
  }

  @override
  void didUpdateWidget(SubjectKitPanel old) {
    super.didUpdateWidget(old);
    if (!_tabs.contains(_tab)) _tab = _tabs.first;
  }

  void _insert(List<BoardElement> els) => widget.wb.insert(els);
  void _insertMath(String tex, {double fs = 40}) => _insert([boardMath(tex, _accent, fontSize: fs)]);
  void _insertText(String text, {double size = 26, bool bold = false, Color? color}) =>
      _insert([boardText(text, color ?? _ink, size: size, bold: bold, font: _font)]);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return PanelPage(
      icon: widget.style.icon,
      accent: _accent,
      title: l.subjectKit(l.subjectName(widget.style.subject)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              children: [
                for (final t in _tabs)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s8),
                    child: ChoiceChip(
                      key: Key('kit-${t.name}'),
                      label: Text(l.kitTabName(t)),
                      selected: _tab == t,
                      selectedColor: widget.style.container,
                      onSelected: (_) => setState(() {
                        _tab = t;
                        _q = '';
                      }),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: switch (_tab) {
              KitTab.lesson => _lesson(),
              KitTab.formulas => _formulas(mathsFormulas),
              KitTab.physics => _formulas(physicsFormulas),
              KitTab.constants => _list([for (final c in physicsConstants) (c.name, c.tex)]),
              KitTab.periodic => _periodic(),
              KitTab.ions => _ions(),
              KitTab.dates => _DatesTab(onDraw: (ev) => _insert(timeline(ev, _ink, _accent))),
              KitTab.words => _WordWall(wb: widget.wb, accent: _accent, onCard: (w) => _insert([wordCard(w, _accent)])),
              KitTab.logic => _logic(),
              KitTab.binary => _BinaryTab(onInsert: (t) => _insertText(t, size: 28, bold: true)),
              KitTab.stars => _StarsTab(board: widget.board, accent: _accent, onInsert: (t) => _insertText(t, size: 34, bold: true, color: _accent)),
            },
          ),
        ],
      ),
    );
  }

  Widget _section(String t) => Padding(
    padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8),
    child: Text(t, style: context.text.titleSmall),
  );

  Widget _search(String hint) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s12, Kx.s12, 4),
    child: TextField(
      onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
      decoration: InputDecoration(hintText: hint, isDense: true, prefixIcon: const Icon(Icons.search, size: 20)),
    ),
  );

  Widget _tex(String tex, {double size = 17}) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: BoardMath(element: MathElement(id: tex, position: Offset.zero, latex: tex, color: context.colors.onSurface, fontSize: size, size: const Size(1, 1))),
  );

  // --- This lesson ----------------------------------------------------------------------------

  Widget _lesson() {
    final l = context.l10n;
    final s = widget.board.session;
    Widget quick(AiView v, IconData icon, String label) => OutlinedButton.icon(
      key: Key('kit-ai-${v.name}'),
      onPressed: () => widget.onAi(v),
      style: OutlinedButton.styleFrom(foregroundColor: context.colors.onSurface, side: BorderSide(color: context.colors.tertiary.withValues(alpha: 0.5))),
      icon: Icon(icon, size: 18, color: context.colors.tertiary),
      label: Text(label),
    );
    return ListView(
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Text(s?.classLabel ?? l.noClassTimetabled, style: context.text.titleLarge),
        if (s?.periodLabel != null) Text(s!.periodLabel!, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        _section(l.kitAiForLesson),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            quick(AiView.home, Icons.auto_awesome, l.aiAsk),
            quick(AiView.quiz, Icons.quiz_outlined, l.toolQuiz),
            if (!widget.primary) quick(AiView.homework, Icons.assignment_outlined, l.toolHomework),
            if (!widget.primary) quick(AiView.lessonPlan, Icons.event_note_outlined, l.aiLessonPlan),
            quick(AiView.readBoard, Icons.document_scanner_outlined, l.aiReadBoard),
          ],
        ),
        _section(l.kitSeeAndDo),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonalIcon(
              key: const Key('kit-books'),
              onPressed: () => widget.onPanel(PanelKind.books),
              icon: const Icon(Icons.menu_book),
              label: Text(l.toolBooks),
            ),
            FilledButton.tonalIcon(
              key: const Key('kit-model3d'),
              onPressed: () => widget.onSplit(SplitContent.model3d),
              icon: const Icon(Icons.view_in_ar_outlined),
              label: Text(l.splitModel3d),
            ),
            FilledButton.tonalIcon(
              key: const Key('kit-lab'),
              onPressed: () => widget.onSplit(SplitContent.lab),
              icon: const Icon(Icons.science_outlined),
              label: Text(l.splitLab),
            ),
          ],
        ),
        if (widget.style.tabs.isNotEmpty) ...[
          _section(l.kitMore),
          Text(l.kitMoreHint, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
        ],
      ],
    );
  }

  // --- Formulas and lists ---------------------------------------------------------------------

  Widget _formulas(List<Formula> all) {
    // The chapter being taught comes first, when the subject name says which.
    final subject = (widget.board.session?.subjectName ?? '').toLowerCase();
    final list = all.where((f) => _q.isEmpty || f.name.toLowerCase().contains(_q) || f.chapter.toLowerCase().contains(_q)).toList()
      ..sort((a, b) {
        int rank(Formula f) => subject.isNotEmpty && subject.contains(f.chapter.toLowerCase()) ? 0 : 1;
        return rank(a).compareTo(rank(b));
      });
    String? last;
    final l = context.l10n;
    return Column(
      children: [
        _search(l.kitSearchFormulas),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s12, 0, Kx.s12, Kx.s12),
            children: [
              for (final f in list) ...[
                if (f.chapter != last) _section(last = f.chapter),
                _Tap(
                  key: Key('formula-${f.name}'),
                  onTap: () => _insertMath(f.tex),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f.name, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      _tex(f.tex),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _list(List<(String, String)> items) => ListView(
    padding: const EdgeInsets.all(Kx.s12),
    children: [
      for (final (name, tex) in items)
        _Tap(
          onTap: () => _insertMath(tex, fs: 34),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: 4),
              _tex(tex, size: 15),
            ],
          ),
        ),
    ],
  );

  Widget _ions() => ListView(
    padding: const EdgeInsets.all(Kx.s12),
    children: [
      for (final v in [1, 2, 3]) ...[
        _section(context.l10n.kitValency(v)),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final i in commonIons.where((i) => i.valency == v))
              Tooltip(
                message: i.name,
                child: ActionChip(label: _tex(i.tex, size: 15), onPressed: () => _insertMath(i.tex, fs: 36)),
              ),
          ],
        ),
      ],
    ],
  );

  // --- Periodic table -------------------------------------------------------------------------

  static const _catColors = {
    ElementCategory.alkali: Color(0xFFE57373),
    ElementCategory.alkaline: Color(0xFFFFB74D),
    ElementCategory.transition: Color(0xFFFFD54F),
    ElementCategory.postTransition: Color(0xFF90CAF9),
    ElementCategory.metalloid: Color(0xFF80CBC4),
    ElementCategory.nonmetal: Color(0xFFA5D6A7),
    ElementCategory.halogen: Color(0xFF4DD0E1),
    ElementCategory.noble: Color(0xFFCE93D8),
    ElementCategory.lanthanide: Color(0xFFF48FB1),
    ElementCategory.actinide: Color(0xFFBCAAA4),
    ElementCategory.unknown: Color(0xFFB0BEC5),
  };

  Widget _periodic() => LayoutBuilder(
    builder: (context, c) {
      final cell = (c.maxWidth - 24) / 18;
      return ListView(
        padding: const EdgeInsets.all(Kx.s12),
        children: [
          SizedBox(
            height: cell * 10.4,
            child: Stack(
              children: [
                for (final e in elements)
                  Positioned(
                    left: (e.col - 1) * cell,
                    top: (e.row - 1) * cell + (e.row >= 9 ? cell * 0.4 : 0),
                    width: cell - 1,
                    height: cell - 1,
                    child: GestureDetector(
                      key: Key('element-${e.symbol}'),
                      onTap: () => _elementSheet(e),
                      child: Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: _catColors[e.cat], borderRadius: BorderRadius.circular(2)),
                        child: Text(e.symbol, style: TextStyle(fontSize: cell * 0.42, fontWeight: FontWeight.w600, color: const Color(0xFF1B1F24))),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final e in _catColors.entries)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 10, height: 10, color: e.value),
                    const SizedBox(width: 4),
                    Text(e.key.label, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant)),
                  ],
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(context.l10n.kitPeriodicHint, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
          ),
        ],
      );
    },
  );

  void _elementSheet(ChemElement e) {
    final l = context.l10n;
    showModalBottomSheet<void>(
      context: context,
      builder: (d) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Kx.s20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${e.z}  ${e.symbol}  ·  ${e.name}', style: context.text.headlineSmall),
              Text('${e.mass} · ${e.cat.label}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Kx.s16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    key: const Key('element-card'),
                    onPressed: () {
                      Navigator.pop(d);
                      _insert(elementCard(z: e.z, symbol: e.symbol, name: e.name, mass: e.mass, color: _catColors[e.cat]!));
                    },
                    icon: const Icon(Icons.crop_square),
                    label: Text(l.kitElementCard),
                  ),
                  if (e.z <= 20)
                    FilledButton.tonalIcon(
                      onPressed: () {
                        Navigator.pop(d);
                        _insert(bohrAtom(e.z, _ink, _accent));
                      },
                      icon: const Icon(Icons.blur_circular),
                      label: Text(l.kitBohrModel),
                    ),
                  if (atomColors.containsKey(e.symbol))
                    FilledButton.tonalIcon(
                      onPressed: () {
                        Navigator.pop(d);
                        _insert(atomBall(e.symbol));
                      },
                      icon: const Icon(Icons.circle),
                      label: Text(l.kitAtomBall),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // --- Logic gates ----------------------------------------------------------------------------

  Widget _logic() {
    const gates = {
      'AND': [0, 0, 0, 1],
      'OR': [0, 1, 1, 1],
      'NAND': [1, 1, 1, 0],
      'NOR': [1, 0, 0, 0],
      'XOR': [0, 1, 1, 0],
      'XNOR': [1, 0, 0, 1],
    };
    String table(String g, List<int> out) => '$g\nA  B  |  Y\n${[for (var i = 0; i < 4; i++) '${i >> 1}  ${i & 1}  |  ${out[i]}'].join('\n')}';
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        _Tap(onTap: () => _insertText('NOT\nA  |  Y\n0  |  1\n1  |  0', size: 24), child: const Text('NOT  —  Y = NOT A', style: TextStyle(fontWeight: FontWeight.w700))),
        for (final e in gates.entries)
          _Tap(
            onTap: () => _insertText(table(e.key, e.value), size: 24),
            child: Text('${e.key}  —  ${e.value.join(' ')}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        const SizedBox(height: 8),
        Text(context.l10n.kitLogicHint, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
      ],
    );
  }
}

/// A tappable row that puts something on the board.
class _Tap extends StatelessWidget {
  const _Tap({super.key, required this.child, required this.onTap});

  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Material(
      color: context.colors.surfaceContainerLow,
      borderRadius: Kx.radiusMd,
      child: InkWell(
        borderRadius: Kx.radiusMd,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              Expanded(child: child),
              Icon(Icons.add, size: 18, color: context.colors.onSurfaceVariant),
            ],
          ),
        ),
      ),
    ),
  );
}

// --- Key dates ----------------------------------------------------------------------------

class _DatesTab extends StatefulWidget {
  const _DatesTab({required this.onDraw});

  final void Function(List<(String, String)>) onDraw;

  @override
  State<_DatesTab> createState() => _DatesTabState();
}

class _DatesTabState extends State<_DatesTab> {
  final _picked = <KeyDate>{};
  String _region = 'india';

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final list = keyDates.where((d) => _region == 'all' || d.region == _region || (_region == 'india' && d.region == 'karnataka')).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(Kx.s8),
          child: Wrap(
            spacing: 6,
            children: [
              for (final (k, label) in [('india', l.kitIndia), ('world', l.kitWorld), ('all', l.kitAll)])
                ChoiceChip(label: Text(label), selected: _region == k, onSelected: (_) => setState(() => _region = k)),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            children: [
              for (final d in list)
                CheckboxListTile(
                  dense: true,
                  value: _picked.contains(d),
                  onChanged: (v) => setState(() => v == true ? _picked.add(d) : _picked.remove(d)),
                  title: Text(d.what),
                  subtitle: Text(d.when, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(Kx.s12),
          child: FilledButton.icon(
            key: const Key('kit-timeline'),
            onPressed: _picked.isEmpty
                ? null
                : () {
                    final ev = [
                      for (final d in keyDates)
                        if (_picked.contains(d)) (d.when, d.what),
                    ];
                    widget.onDraw(ev);
                    setState(_picked.clear);
                  },
            icon: const Icon(Icons.timeline),
            label: Text(_picked.isEmpty ? l.kitPickEvents : l.kitDrawTimeline(_picked.length)),
          ),
        ),
      ],
    );
  }
}

// --- Word wall ----------------------------------------------------------------------------

class _WordWall extends StatefulWidget {
  const _WordWall({required this.wb, required this.accent, required this.onCard});

  final WhiteboardController wb;
  final Color accent;
  final void Function(String) onCard;

  @override
  State<_WordWall> createState() => _WordWallState();
}

class _WordWallState extends State<_WordWall> {
  final _extra = <String>[];
  final _c = TextEditingController();

  static const _common = {
    'this', 'that', 'with', 'from', 'have', 'they', 'were', 'what', 'when', 'your', 'will', 'there', 'their', 'which', 'about', //
    'would', 'these', 'other', 'into', 'more', 'some', 'them', 'than', 'then', 'also', 'been', 'only', 'very', 'each', 'make',
  };

  /// Words written on the board's pages (typed, on notes and cards), newest additions first.
  List<String> get _words {
    final seen = <String>{};
    final out = <String>[];
    for (final p in widget.wb.pages) {
      for (final e in p.elements) {
        final text = switch (e) {
          TextElement(:final text) => text,
          NoteElement(:final text, :final hidden) when !hidden => text,
          _ => '',
        };
        for (final m in RegExp(r"[\p{L}][\p{L}\p{M}'-]{3,}", unicode: true).allMatches(text)) {
          final w = m[0]!;
          if (_common.contains(w.toLowerCase()) || !seen.add(w.toLowerCase())) continue;
          out.add(w);
        }
      }
    }
    return [..._extra.where((w) => !seen.contains(w.toLowerCase())), ...out];
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _add(String v) {
    if (v.trim().isEmpty) return;
    setState(() => _extra.insert(0, v.trim()));
    _c.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: widget.wb.committed,
      builder: (context, _) {
        final words = _words;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(Kx.s12),
              child: TextField(
                key: const Key('word-add'),
                controller: _c,
                decoration: InputDecoration(
                  hintText: l.kitAddWord,
                  isDense: true,
                  suffixIcon: IconButton(icon: const Icon(Icons.add), onPressed: () => _add(_c.text)),
                ),
                onSubmitted: _add,
              ),
            ),
            Expanded(
              child: words.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(Kx.s16),
                      child: Text(l.kitWordsHint, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(Kx.s12),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final w in words)
                            ActionChip(
                              key: Key('word-$w'),
                              avatar: Icon(Icons.style_outlined, size: 16, color: widget.accent),
                              label: Text(w, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                              onPressed: () => widget.onCard(w),
                            ),
                        ],
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }
}

// --- Number bases ---------------------------------------------------------------------------

class _BinaryTab extends StatefulWidget {
  const _BinaryTab({required this.onInsert});

  final void Function(String) onInsert;

  @override
  State<_BinaryTab> createState() => _BinaryTabState();
}

class _BinaryTabState extends State<_BinaryTab> {
  int _n = 13;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final bin = _n.toRadixString(2), oct = _n.toRadixString(8), hex = _n.toRadixString(16).toUpperCase();
    final bits = bin.split('');
    final working = [for (var i = 0; i < bits.length; i++) '${bits[i]}×2^${bits.length - 1 - i}'].join(' + ');
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        TextFormField(
          initialValue: '$_n',
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: l.kitDecimal),
          onChanged: (v) => setState(() => _n = (int.tryParse(v) ?? 0).clamp(0, 1 << 30)),
        ),
        const SizedBox(height: Kx.s12),
        for (final (label, v, base) in [(l.kitBinary, bin, 2), ('Octal', oct, 8), ('Hexadecimal', hex, 16)])
          _Tap(
            onTap: () => widget.onInsert('$_n (base 10) = $v (base $base)'),
            child: Text('$label:  $v', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
        _Tap(onTap: () => widget.onInsert('$bin (base 2) = $working = $_n'), child: Text(working, style: context.text.bodySmall)),
      ],
    );
  }
}

// --- Class stars ----------------------------------------------------------------------------

/// A star chart for the class (primary): a star for each good answer, kept per class on this
/// board.
class _StarsTab extends StatefulWidget {
  const _StarsTab({required this.board, required this.accent, required this.onInsert});

  final BoardController board;
  final Color accent;
  final void Function(String) onInsert;

  @override
  State<_StarsTab> createState() => _StarsTabState();
}

class _StarsTabState extends State<_StarsTab> {
  Map<String, int> _stars = {};

  String get _key => 'kinetix.stars.${widget.board.session?.sectionName ?? 'guest'}';

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance()
        .then((p) {
          final m = <String, int>{};
          for (final r in p.getStringList(_key) ?? const <String>[]) {
            final i = r.lastIndexOf(':');
            if (i > 0) m[r.substring(0, i)] = int.tryParse(r.substring(i + 1)) ?? 0;
          }
          if (mounted) setState(() => _stars = m);
        })
        .catchError((_) {});
  }

  void _add(String id, int d) {
    setState(() => _stars[id] = math.max(0, (_stars[id] ?? 0) + d));
    final key = _key;
    final value = [for (final e in _stars.entries) '${e.key}:${e.value}'];
    SharedPreferences.getInstance().then((p) => p.setStringList(key, value)).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final roster = widget.board.roster;
    if (roster.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Text(l.kitStarsNoClass, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
      );
    }
    final top = (roster.toList()..sort((a, b) => (_stars[b.id] ?? 0).compareTo(_stars[a.id] ?? 0))).first;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(Kx.s8),
            children: [
              for (final s in roster)
                ListTile(
                  key: Key('stars-${s.id}'),
                  dense: true,
                  title: Text(s.fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Row(children: [for (var i = 0; i < math.min(10, _stars[s.id] ?? 0); i++) Icon(Icons.star, size: 16, color: widget.accent)]),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(tooltip: l.kitStarRemove, onPressed: () => _add(s.id, -1), icon: const Icon(Icons.remove_circle_outline)),
                      IconButton(key: Key('star-${s.id}'), tooltip: l.kitStarGive, onPressed: () => _add(s.id, 1), icon: Icon(Icons.star, color: widget.accent)),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if ((_stars[top.id] ?? 0) > 0)
          Padding(
            padding: const EdgeInsets.all(Kx.s12),
            child: FilledButton.icon(
              key: const Key('star-of-the-day'),
              style: FilledButton.styleFrom(backgroundColor: widget.accent),
              onPressed: () => widget.onInsert(l.kitStarOfTheDay(top.fullName)),
              icon: const Icon(Icons.emoji_events_outlined),
              label: Text(l.kitStarOfTheDay(top.fullName)),
            ),
          ),
      ],
    );
  }
}
