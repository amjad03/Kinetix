import 'package:flutter/material.dart';
import 'package:zynetix_ink/zynetix_ink.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import 'organiser_build.dart';
import 'organiser_strings.dart';
import 'teaching_aids.dart' show aidStrings;
import 'venn_expr.dart';

export 'organiser_build.dart';
export 'organiser_strings.dart';
export 'venn_expr.dart';

/// The organisers to pick from. Tap one to edit its words, its parts and its own options (timeline
/// direction and dates, cause and effect direction, Venn set notation…) and its colours, then add
/// it to the board as ordinary text and shapes that can be written on and moved.
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
    Organiser.causeOrEffect: Icons.rule,
    Organiser.pyramid: Icons.change_history,
    Organiser.spider: Icons.bug_report_outlined,
    Organiser.concept: Icons.share_outlined,
    Organiser.storyMap: Icons.auto_stories_outlined,
  };

  @override
  State<OrganisersPanel> createState() => OrganisersPanelState();
}

class OrganisersPanelState extends State<OrganisersPanel> {
  Organiser? _open;
  int _count = 0, _per = 0, _theme = 0;
  var _vertical = false, _scale = false, _oneToMany = false, _universe = true;
  var _picks = <int>[];
  final _expr = TextEditingController();
  List<TextEditingController> _fields = [];
  List<String> _defaults = [];

  /// Fields replaced when the number of parts changed; they are let go with the panel (a field
  /// still on screen must not be disposed under its text box).
  final _retired = <TextEditingController>[];

  @override
  void dispose() {
    for (final f in [..._fields, ..._retired, _expr]) {
      f.dispose();
    }
    super.dispose();
  }

  String _name(Organiser o, FeatureStrings s, FeatureStrings os) => oldOrganiserNames.contains(o) ? s[o.name] : os[o.name];

  OrganiserOptions _opts() => OrganiserOptions(
    count: _count == 0 ? null : _count,
    perGroup: _per == 0 && organiserPerGroup(_open ?? Organiser.swot)?.$2 != 0 ? null : _per,
    theme: _theme,
    vertical: _vertical,
    scaleByDate: _scale,
    oneToMany: _oneToMany,
    expression: _expr.text,
    universe: _universe,
    picks: _picks,
  );

  void _select(Organiser o, FeatureStrings s) {
    _count = organiserCount(o)?.$2 ?? 0;
    _per = organiserPerGroup(o)?.$2 ?? 0;
    _picks = List.filled(8, 0);
    _open = o;
    _fields = [];
    _defaults = [];
    _setFields(o, s);
    setState(() {});
  }

  void _setFields(Organiser o, FeatureStrings s) {
    // Keep only what the teacher typed (not the old defaults) for the labels that still exist.
    final old = {for (var i = 0; i < _fields.length; i++) if (i < _defaults.length && _fields[i].text != _defaults[i]) i: _fields[i].text};
    final defaults = organiserLabels(o, s, count: _count == 0 ? null : _count, options: _opts());
    _retired.addAll(_fields);
    _defaults = defaults;
    _fields = [for (final (i, d) in defaults.indexed) TextEditingController(text: old[i] ?? d)];
  }

  void _add(Organiser o, FeatureStrings s) {
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    widget.wb.insert(organiserElements(o, s, ink, count: _count == 0 ? null : _count, labels: [for (final f in _fields) f.text], options: _opts()));
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
                  Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text(_name(o, s, os), textAlign: TextAlign.center)),
                ],
              ),
            ),
          ),
      ],
    );
  }

  /// A "− n +" row for a count.
  Widget _stepper(String label, int value, (int, int, int) range, String keyBase, void Function(int) set) => Row(
    children: [
      Expanded(child: Text(label)),
      IconButton.outlined(key: Key('$keyBase-minus'), onPressed: value <= range.$1 ? null : () => set(value - 1), icon: const Icon(Icons.remove)),
      IconButton.outlined(key: Key('$keyBase-plus'), onPressed: value >= range.$3 ? null : () => set(value + 1), icon: const Icon(Icons.add)),
    ],
  );

  /// Chips for a yes/no or one-of-many choice.
  Widget _choice(List<(Key, String, bool, VoidCallback)> items) => Wrap(
    spacing: 8,
    runSpacing: 4,
    children: [for (final (k, label, on, tap) in items) ChoiceChip(key: k, label: Text(label), selected: on, onSelected: (_) => tap())],
  );

  void _insertSymbol(String sym) {
    final t = _expr.text, sel = _expr.selection;
    final at = sel.isValid ? sel.start : t.length, end = sel.isValid ? sel.end : t.length;
    final next = t.replaceRange(at, end, sym);
    _expr.value = TextEditingValue(text: next, selection: TextSelection.collapsed(offset: at + sym.length));
    setState(() {});
  }

  Widget _vennOptions(FeatureStrings os, Organiser o) {
    final res = parseVenn(_expr.text, sets: o == Organiser.venn2 ? 2 : 3);
    final note = _expr.text.trim().isEmpty
        ? null
        : !res.ok
        ? os['vennBad']
        : res.relation != null
        ? (res.element != null ? os['vennElement'] : os['vennStatement'])
        : os['vennShaded'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: Kx.s8),
        Text(os['expression'], style: context.text.titleSmall),
        TextField(key: const Key('organiser-expr'), controller: _expr, onChanged: (_) => setState(() {}), decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: 'A ∩ B′')),
        Wrap(
          spacing: 6,
          children: [for (final (i, sym) in vennSymbols.indexed) ActionChip(key: Key('organiser-sym-$i'), label: Text(sym, style: const TextStyle(fontSize: 18)), onPressed: () => _insertSymbol(sym))],
        ),
        if (note != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(note, key: const Key('organiser-expr-result'), style: TextStyle(color: res.ok ? null : context.colors.error))),
        SwitchListTile(key: const Key('organiser-universe'), contentPadding: EdgeInsets.zero, title: Text(os['universe']), value: _universe, onChanged: (v) => setState(() => _universe = v)),
      ],
    );
  }

  Widget _editor(BuildContext context, Organiser o, FeatureStrings s, FeatureStrings os) {
    final range = organiserCount(o);
    final per = organiserPerGroup(o);
    final countKey = switch (o) {
      Organiser.kwl || Organiser.tchart || Organiser.compare || Organiser.causeEffect || Organiser.causeOrEffect => 'countRows',
      Organiser.timeline => 'countEvents',
      Organiser.fishbone => 'countCategories',
      _ => 'count',
    };
    void refresh(void Function() f) => setState(() {
      f();
      _setFields(o, s);
    });
    return ListView(
      key: const Key('organiser-editor'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          children: [
            TextButton.icon(key: const Key('organiser-back'), onPressed: () => setState(() => _open = null), icon: const Icon(Icons.arrow_back), label: Text(os['back'])),
            FilledButton.icon(key: const Key('organiser-add'), onPressed: () => _add(o, s), icon: const Icon(Icons.add_to_photos_outlined), label: Text(os['add'])),
          ],
        ),
        Text(_name(o, s, os), style: context.text.titleLarge),
        if (range != null) _stepper(os.n(countKey, _count), _count, range, 'organiser-count', (v) => refresh(() => _count = v)),
        if (per != null && per.$3 > 0) _stepper(os.n(o == Organiser.fishbone ? 'perCause' : 'perSub', _per), _per, per, 'organiser-per', (v) => refresh(() => _per = v)),
        if (o == Organiser.timeline) ...[
          _choice([
            (const Key('organiser-horizontal'), os['horizontal'], !_vertical, () => setState(() => _vertical = false)),
            (const Key('organiser-vertical'), os['vertical'], _vertical, () => setState(() => _vertical = true)),
          ]),
          SwitchListTile(key: const Key('organiser-scale'), contentPadding: EdgeInsets.zero, title: Text(os['scaleByDate']), value: _scale, onChanged: (v) => setState(() => _scale = v)),
        ],
        if (o == Organiser.causeEffect)
          _choice([
            (const Key('organiser-mode-many'), os['manyToOne'], !_oneToMany, () => refresh(() => _oneToMany = false)),
            (const Key('organiser-mode-one'), os['oneToMany'], _oneToMany, () => refresh(() => _oneToMany = true)),
          ]),
        if (o == Organiser.venn2 || o == Organiser.venn3) _vennOptions(os, o),
        const SizedBox(height: Kx.s8),
        Text(os['theme'], style: context.text.titleSmall),
        _choice([for (final (i, t) in organiserThemes.indexed) (Key('organiser-theme-${t.$1}'), os['theme_${t.$1}'], _theme == i, () => setState(() => _theme = i))]),
        const SizedBox(height: Kx.s8),
        Text(os['edit'], style: context.text.titleSmall),
        for (final (i, f) in _fields.indexed) ...[
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: TextField(key: Key('organiser-label-$i'), controller: f, decoration: const InputDecoration(isDense: true, border: OutlineInputBorder())),
          ),
          if (o == Organiser.causeOrEffect && i >= 3)
            _choice([
              for (final (v, k) in ['pickNone', 'pickCause', 'pickEffect'].indexed)
                (Key('organiser-pick-${i - 3}-$v'), os[k], (i - 3 < _picks.length ? _picks[i - 3] : 0) == v, () => setState(() => _picks[i - 3] = v)),
            ]),
        ],
      ],
    );
  }
}
