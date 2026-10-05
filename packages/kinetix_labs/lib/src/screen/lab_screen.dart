import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../benches/registry.dart';
import '../content/library.dart';
import '../core/bench.dart';
import '../core/i18n.dart';
import '../core/lab.dart';
import 'lab_report.dart';

/// Opens a virtual lab full screen. [onToBoard] receives a picture of the
/// experiment with its readings; [speak] reads text aloud; [mirror] shows
/// the lab to the students.
Future<void> showLab(
  BuildContext context,
  String labId, {
  LabLang? lang,
  void Function(Uint8List png, String title)? onToBoard,
  void Function(String text)? speak,
  LabMirror? mirror,
}) =>
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        body: SafeArea(
          child: LabScreen(labId: labId, lang: lang, onToBoard: onToBoard, speak: speak, mirror: mirror, onClose: () => Navigator.of(context).maybePop()),
        ),
      ),
    ));

/// Where the lab is shown to the students: [wanted] says whether a
/// students' screen is on; [send] gets the lab's state, and null on close.
class LabMirror {
  final bool Function() wanted;
  final void Function(Map<String, dynamic>? state) send;
  const LabMirror({required this.wanted, required this.send});
}

enum _Tab { controls, readings, steps, guide, viva }

/// A virtual lab: the bench with its controls, the observation table and
/// graph, the procedure, the guide (aim, principle, apparatus, precautions)
/// and viva questions. Fills whatever space it gets: side panel when wide,
/// tabs under the bench when narrow. Works on the board and on a phone.
class LabScreen extends StatefulWidget {
  final String labId;

  /// The language (default: the app's locale).
  final LabLang? lang;

  /// Shows the "Put on board" button; gets the report picture.
  final void Function(Uint8List png, String title)? onToBoard;
  final void Function(String text)? speak;
  final LabMirror? mirror;

  /// Shows a back button.
  final VoidCallback? onClose;

  /// Gets the readings as CSV (default: copied to the clipboard).
  final void Function(String csv, String fileName)? onExportCsv;

  const LabScreen({super.key, required this.labId, this.lang, this.onToBoard, this.speak, this.mirror, this.onClose, this.onExportCsv});

  @override
  State<LabScreen> createState() => LabScreenState();
}

class LabScreenState extends State<LabScreen> {
  VirtualLab? lab;
  LabBench? bench;
  LabParams params = {};
  final rows = <List<Object>>[];
  int step = 0;
  var _tab = _Tab.readings;
  bool panelOpen = true;
  final _shownAnswers = <int>{};
  bool _showConclusion = false;

  /// Assessment mode: the result and conclusion show once the student finishes.
  bool _finished = false;

  String? _why;
  Timer? _whyTimer;
  bool _placed = false;
  bool _rendering = false;
  Timer? _placedTimer;

  @override
  void initState() {
    super.initState();
    _open();
  }

  void _open() {
    final l = LabLibrary.instance.byId(widget.labId);
    final b = l == null ? null : labBenches[l.bench];
    lab = l;
    bench = b;
    params = b == null ? {} : {...b.defaults, ...l!.setup};
    if (l?.mode == LabMode.guided) _tab = _Tab.steps;
    WidgetsBinding.instance.addPostFrameCallback((_) => _mirror());
  }

  @override
  void didUpdateWidget(LabScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.labId != widget.labId) {
      rows.clear();
      step = 0;
      _shownAnswers.clear();
      _showConclusion = _finished = false;
      _open();
    }
  }

  @override
  void dispose() {
    _whyTimer?.cancel();
    _placedTimer?.cancel();
    widget.mirror?.send(null);
    super.dispose();
  }

  // ------------------------------------------------------------- changes

  void _set(String key, Object value) {
    final b = bench;
    if (b == null) return;
    setState(() => params = b.act('set:$key', {...params, key: value}));
    _mirror();
  }

  void _act(String action) {
    final b = bench;
    if (b == null) return;
    setState(() => params = b.act(action, params));
    _mirror();
  }

  /// Records the reading the bench gives now (or says why there is none).
  void record() {
    final b = bench;
    if (b == null) return;
    final r = b.read(params);
    if (r.row == null) {
      _say(r.why!);
      return;
    }
    setState(() {
      rows.add(r.row!);
      _why = null;
      if (_tab == _Tab.controls) return;
      _tab = _Tab.readings;
      panelOpen = true;
    });
    _mirror();
  }

  void _say(String text) {
    _whyTimer?.cancel();
    setState(() => _why = text);
    _whyTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _why = null);
    });
  }

  void _deleteRow(int i) {
    setState(() => rows.removeAt(i));
    _mirror();
  }

  void _reset() {
    final b = bench, l = lab;
    if (b == null || l == null) return;
    setState(() {
      params = {...b.defaults, ...l.setup};
      rows.clear();
      step = 0;
      _shownAnswers.clear();
      _showConclusion = _finished = false;
    });
    _mirror();
  }

  void _step(int i) {
    final l = lab;
    if (l == null) return;
    setState(() => step = i.clamp(0, l.steps.length - 1));
    _mirror();
  }

  List<List<String>> _formatted(LabBench b, [int? last]) {
    final list = last == null || rows.length <= last ? rows : rows.sublist(rows.length - last);
    return [
      for (final r in list) [for (var k = 0; k < r.length && k < b.columns.length; k++) b.columns[k].format(r[k])],
    ];
  }

  /// What the students see: sent whenever something changes.
  void _mirror() {
    final m = widget.mirror, l = lab, b = bench;
    if (!mounted || m == null || l == null || b == null || !m.wanted()) return;
    m.send({
      'lab': l.id,
      'b': b.kind,
      'p': params,
      'title': l.title.text,
      'step': l.steps.isEmpty ? null : l.steps[step].text,
      'n': step + 1,
      'of': l.steps.length,
      'cols': [for (final c in b.columns) c.label],
      'rows': _formatted(b, 8),
      'result': _resultVisible(l) ? b.result(rows) : null,
      'live': b.live(params),
    });
  }

  bool _resultVisible(VirtualLab l) => l.mode != LabMode.assessment || _finished;

  LabReport? get report {
    final l = lab, b = bench;
    if (l == null || b == null) return null;
    return LabReport(lab: l, bench: b, params: params, rows: List.of(rows));
  }

  Future<void> _toBoard() async {
    final r = report;
    if (r == null || widget.onToBoard == null || _rendering) return;
    setState(() => _rendering = true);
    try {
      final png = await r.toPng();
      widget.onToBoard!(png, r.lab.title.text);
      _placedTimer?.cancel();
      if (!mounted) return;
      setState(() => _placed = true);
      _placedTimer = Timer(const Duration(seconds: 2), () {
        if (mounted) setState(() => _placed = false);
      });
    } catch (e) {
      debugPrint('Lab report failed: $e');
      if (mounted) _say(tr('Could not insert that image.'));
    } finally {
      if (mounted) setState(() => _rendering = false);
    }
  }

  void _exportCsv() {
    final r = report;
    if (r == null) return;
    final csv = r.toCsv();
    if (widget.onExportCsv != null) {
      widget.onExportCsv!(csv, r.csvName);
      return;
    }
    Clipboard.setData(ClipboardData(text: csv));
    _say(tr('Readings copied as CSV.'));
  }

  // --------------------------------------------------------------- layout

  @override
  Widget build(BuildContext context) {
    currentLabLang = widget.lang ?? LabLang.of(context);
    final l = lab, b = bench;
    return Material(
      color: context.colors.surface,
      child: LayoutBuilder(builder: (context, c) {
        final wide = c.maxWidth >= 900 && c.maxHeight >= 420;
        if (l == null || b == null) {
          return Column(children: [
            _header(null, wide),
            Expanded(child: KxEmptyState(icon: Icons.science_outlined, message: tr('This lab could not be opened.'))),
          ]);
        }
        final stage = Stack(children: [
          Positioned.fill(child: LabBenchView(key: const ValueKey('lab-bench'), bench: b, params: params)),
          Positioned(left: 10, top: 10, right: 10, child: _liveStrip(b)),
          if (!wide) Positioned(right: 12, bottom: 12, child: _recordButton(compact: true)),
          if (_why != null) Positioned(left: 12, right: wide ? null : 120, bottom: 12, child: _whyCard()),
        ]);
        return Column(children: [
          _header(l, wide),
          Expanded(
            child: wide
                ? Row(children: [
                    Expanded(child: Column(children: [Expanded(child: stage), _controlsBar(b)])),
                    SizedBox(width: (c.maxWidth * 0.3).clamp(340.0, 440.0), child: _panel(l, b, wide: true)),
                  ])
                : Column(children: [
                    Expanded(child: stage),
                    _tabBar(wide: false),
                    if (panelOpen) SizedBox(height: (c.maxHeight * 0.4).clamp(150.0, 360.0), child: _tabBody(l, b)),
                  ]),
          ),
        ]);
      }),
    );
  }

  Widget _header(VirtualLab? l, bool wide) {
    final c = context.colors;
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
      decoration: BoxDecoration(color: c.surfaceContainer, border: Border(bottom: BorderSide(color: c.outlineVariant))),
      child: Row(children: [
        if (widget.onClose != null)
          IconButton(key: const ValueKey('lab-close'), tooltip: tr('Back'), icon: const Icon(Icons.arrow_back), onPressed: widget.onClose)
        else
          const SizedBox(width: Kx.s8),
        Icon(Icons.science_outlined, color: c.primary),
        const SizedBox(width: Kx.s8),
        Expanded(
          child: Text(l?.title.text ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
        ),
        if (l != null) ...[
          IconButton(key: const ValueKey('lab-reset'), tooltip: tr('Start again'), icon: const Icon(Icons.restart_alt), onPressed: _reset),
          if (l.forDegree && rows.isNotEmpty)
            IconButton(key: const ValueKey('lab-csv'), tooltip: tr('Export readings (CSV)'), icon: const Icon(Icons.file_download_outlined), onPressed: _exportCsv),
          if (wide) ...[const SizedBox(width: Kx.s4), _recordButton(compact: false)],
          if (widget.onToBoard != null) ...[
            const SizedBox(width: Kx.s4),
            wide
                ? FilledButton.icon(
                    key: const ValueKey('lab-board'),
                    style: _placed ? FilledButton.styleFrom(backgroundColor: Kx.success) : null,
                    onPressed: _rendering ? null : _toBoard,
                    icon: Icon(_placed ? Icons.check : Icons.add_photo_alternate_outlined),
                    label: Text(_placed ? tr('On the board') : tr('Put on board')),
                  )
                : IconButton.filled(
                    key: const ValueKey('lab-board'),
                    style: _placed ? IconButton.styleFrom(backgroundColor: Kx.success) : null,
                    tooltip: _placed ? tr('On the board') : tr('Put on board'),
                    onPressed: _rendering ? null : _toBoard,
                    icon: Icon(_placed ? Icons.check : Icons.add_photo_alternate_outlined),
                  ),
          ],
        ],
      ]),
    );
  }

  Widget _recordButton({required bool compact}) => compact
      ? FloatingActionButton.extended(
          key: const ValueKey('lab-record'),
          heroTag: null,
          onPressed: record,
          icon: const Icon(Icons.playlist_add),
          label: Text(tr('Record')),
        )
      : FilledButton.tonalIcon(
          key: const ValueKey('lab-record'),
          onPressed: record,
          icon: const Icon(Icons.playlist_add),
          label: Text(tr('Record reading')),
        );

  Widget _whyCard() {
    final c = context.colors;
    return Container(
      key: const ValueKey('lab-why'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      constraints: const BoxConstraints(maxWidth: 460),
      decoration: BoxDecoration(color: c.inverseSurface, borderRadius: Kx.radiusMd),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.info_outline, color: c.inversePrimary, size: 20),
        const SizedBox(width: 10),
        Flexible(child: Text(_why!, style: context.text.bodyMedium?.copyWith(color: c.onInverseSurface, height: 1.3))),
      ]),
    );
  }

  Widget _liveStrip(LabBench b) {
    final live = b.live(params);
    if (live.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, runSpacing: 6, children: [
      for (final s in live)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: const Color(0xE61B1F24), borderRadius: Kx.radiusSm),
          child: Text(s, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
        ),
    ]);
  }

  // ------------------------------------------------------------- controls

  Widget _controlsBar(LabBench b) {
    final c = context.colors;
    return Material(
      color: c.surfaceContainer,
      shape: Border(top: BorderSide(color: c.outlineVariant)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 250),
        child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Wrap(spacing: 18, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          for (final ctl in b.controls(params)) SizedBox(width: ctl is LabAction ? null : 330, child: _control(ctl)),
          ]),
        ),
      ),
    );
  }

  Widget _controlsList(LabBench b) => ListView(
        key: const ValueKey('lab-controls'),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 80),
        children: [for (final ctl in b.controls(params)) Padding(padding: const EdgeInsets.only(bottom: 6), child: _control(ctl))],
      );

  Widget _control(LabControl ctl) {
    final muted = context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant);
    switch (ctl) {
      case LabSlider s:
        final v = pNum(params, s.key, s.min).clamp(s.min, s.max);
        return Row(children: [
          SizedBox(width: 110, child: Text(s.label, style: muted)),
          Expanded(
            child: Slider(key: ValueKey('lab-${s.key}'), value: v, min: s.min, max: s.max, divisions: s.divisions, onChanged: (x) => _set(s.key, x)),
          ),
          SizedBox(
              width: 74,
              child: Text('${v.toStringAsFixed(s.decimals)}${s.unit}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
        ]);
      case LabChoice ch:
        final current = params[ch.key];
        final short = ch.options.length <= 4 && ch.options.every((o) => o.$2.length <= 18);
        return Row(children: [
          SizedBox(width: 110, child: Text(ch.label, style: muted)),
          Expanded(
            child: short
                ? Wrap(spacing: 6, runSpacing: 4, children: [
                    for (final (value, name) in ch.options)
                      ChoiceChip(
                        key: ValueKey('lab-${ch.key}-$value'),
                        label: Text(name),
                        selected: current == value,
                        visualDensity: VisualDensity.compact,
                        onSelected: (_) => _set(ch.key, value),
                      ),
                  ])
                : DropdownButton<Object>(
                    key: ValueKey('lab-${ch.key}'),
                    isExpanded: true,
                    value: ch.options.any((o) => o.$1 == current) ? current : ch.options.first.$1,
                    items: [
                      for (final (value, name) in ch.options)
                        DropdownMenuItem(key: ValueKey('lab-${ch.key}-$value'), value: value, child: Text(name, overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) => v == null ? null : _set(ch.key, v),
                  ),
          ),
        ]);
      case LabToggle g:
        return SwitchListTile(
          key: ValueKey('lab-${g.key}'),
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: Text(g.label),
          value: pBool(params, g.key),
          onChanged: (v) => _set(g.key, v),
        );
      case LabAction a:
        return a.primary
            ? FilledButton.icon(key: ValueKey('lab-action-${a.key}'), onPressed: () => _act(a.key), icon: Icon(a.icon), label: Text(a.label))
            : OutlinedButton.icon(key: ValueKey('lab-action-${a.key}'), onPressed: () => _act(a.key), icon: Icon(a.icon), label: Text(a.label));
    }
  }

  // ---------------------------------------------------------------- panel

  List<(_Tab, IconData, String)> _tabs({required bool wide}) => [
        if (!wide) (_Tab.controls, Icons.tune, tr('Controls')),
        (_Tab.readings, Icons.table_chart_outlined, tr('Readings')),
        (_Tab.steps, Icons.format_list_numbered, tr('Steps')),
        (_Tab.guide, Icons.menu_book_outlined, tr('Guide')),
        (_Tab.viva, Icons.quiz_outlined, tr('Viva')),
      ];

  Widget _panel(VirtualLab l, LabBench b, {required bool wide}) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(color: c.surfaceContainerLow, border: Border(left: BorderSide(color: c.outlineVariant))),
      child: Column(children: [_tabBar(wide: wide), Expanded(child: _tabBody(l, b))]),
    );
  }

  Widget _tabBar({required bool wide}) {
    final c = context.colors;
    final tabs = _tabs(wide: wide);
    if (wide && _tab == _Tab.controls) _tab = _Tab.readings;
    return Container(
      decoration: BoxDecoration(color: c.surfaceContainer, border: Border(bottom: BorderSide(color: c.outlineVariant), top: BorderSide(color: c.outlineVariant))),
      child: Row(children: [
        for (final (t, icon, name) in tabs)
          Expanded(
            child: InkWell(
              key: ValueKey('lab-tab-${t.name}'),
              onTap: () => setState(() {
                if (!wide && _tab == t) {
                  panelOpen = !panelOpen;
                } else {
                  _tab = t;
                  panelOpen = true;
                }
              }),
              child: Container(
                constraints: const BoxConstraints(minHeight: Kx.target),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: _tab == t && panelOpen ? c.primary : Colors.transparent, width: 3))),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(icon, size: 20, color: _tab == t && panelOpen ? c.primary : c.onSurfaceVariant),
                  const SizedBox(height: 2),
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: _tab == t && panelOpen ? c.onSurface : c.onSurfaceVariant)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _tabBody(VirtualLab l, LabBench b) => switch (_tab) {
        _Tab.controls => _controlsList(b),
        _Tab.readings => _readings(l, b),
        _Tab.steps => _steps(l),
        _Tab.guide => _guide(l),
        _Tab.viva => _viva(l),
      };

  Widget _section(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 14, 0, 6),
        child: Text(text, style: context.text.titleSmall?.copyWith(color: context.colors.primary, fontWeight: FontWeight.w600)),
      );

  Widget _readAloud(String text) => widget.speak == null
      ? const SizedBox.shrink()
      : IconButton(tooltip: tr('Read aloud'), icon: const Icon(Icons.volume_up_outlined, size: 20), onPressed: () => widget.speak!(text));

  Widget _para(String text, {Key? key, Color? color}) => Text(text, key: key, style: context.text.bodyLarge?.copyWith(height: 1.4, color: color));

  Widget _readings(VirtualLab l, LabBench b) {
    final cols = b.columns;
    final showResult = _resultVisible(l);
    final result = showResult ? b.result(rows) : null;
    final graph = b.graph(params);
    final pts = graph?.points(rows) ?? const [];
    return ListView(key: const ValueKey('lab-readings'), padding: const EdgeInsets.fromLTRB(14, 6, 14, 90), children: [
      Text(trn(rows.length, '{n} reading', '{n} readings'), style: context.text.titleSmall),
      const SizedBox(height: 8),
      if (rows.isEmpty)
        Text(tr('Set up the experiment, then tap Record reading.'), style: TextStyle(color: context.colors.onSurfaceVariant))
      else
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            key: const ValueKey('lab-table'),
            headingRowHeight: 40,
            dataRowMinHeight: 36,
            dataRowMaxHeight: 72,
            columnSpacing: 16,
            horizontalMargin: 8,
            columns: [
              const DataColumn(label: Text('#')),
              for (final c in cols)
                DataColumn(
                    label: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 150), child: Text(c.label, style: const TextStyle(fontWeight: FontWeight.w700)))),
              const DataColumn(label: SizedBox.shrink()),
            ],
            rows: [
              for (var i = 0; i < rows.length; i++)
                DataRow(cells: [
                  DataCell(Text('${i + 1}')),
                  for (var k = 0; k < cols.length; k++)
                    DataCell(ConstrainedBox(constraints: const BoxConstraints(maxWidth: 220), child: Text(k < rows[i].length ? cols[k].format(rows[i][k]) : ''))),
                  DataCell(IconButton(
                      key: ValueKey('lab-delete-$i'), tooltip: tr('Delete'), icon: const Icon(Icons.delete_outline, size: 18), onPressed: () => _deleteRow(i))),
                ]),
            ],
          ),
        ),
      if (graph != null && pts.isNotEmpty) ...[
        _section(tr('Graph')),
        Container(
          height: 220,
          decoration: BoxDecoration(color: LabInk.paper, borderRadius: Kx.radiusMd),
          child: CustomPaint(key: const ValueKey('lab-graph'), painter: _GraphPainter(graph, List.of(rows), cols), child: const SizedBox.expand()),
        ),
      ],
      if (result != null && result.isNotEmpty) ...[
        _section(tr('What the readings show')),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _para(result, key: const ValueKey('lab-result'))),
          _readAloud(result),
        ]),
      ],
      if (!showResult) ...[
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
            key: const ValueKey('lab-finish'),
            onPressed: rows.isEmpty ? null : () => setState(() => _finished = true),
            icon: const Icon(Icons.task_alt),
            label: Text(tr('I have finished: check my work')),
          ),
        ),
      ] else ...[
        _section(tr('Conclusion')),
        if (_showConclusion)
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _para(l.conclusion.text, key: const ValueKey('lab-conclusion'))),
            _readAloud(l.conclusion.text),
          ])
        else
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: const ValueKey('lab-show-conclusion'),
              onPressed: () => setState(() => _showConclusion = true),
              icon: const Icon(Icons.visibility_outlined),
              label: Text(tr('Show the conclusion')),
            ),
          ),
      ],
    ]);
  }

  Widget _steps(VirtualLab l) {
    final c = context.colors;
    return Column(children: [
      Expanded(
        child: ListView.builder(
          key: const ValueKey('lab-steps'),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          itemCount: l.steps.length,
          itemBuilder: (context, i) {
            final on = i == step;
            return InkWell(
              key: ValueKey('lab-step-$i'),
              borderRadius: Kx.radiusMd,
              onTap: () => _step(i),
              child: Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: on ? c.secondaryContainer : null,
                  borderRadius: Kx.radiusMd,
                  border: Border.all(color: on ? c.primary : c.outlineVariant),
                ),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(
                    radius: 13,
                    backgroundColor: on ? c.primary : c.surfaceContainerHighest,
                    child: Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: on ? c.onPrimary : c.onSurface)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(l.steps[i].text, style: TextStyle(fontSize: 15, height: 1.35, color: on ? c.onSecondaryContainer : c.onSurfaceVariant))),
                ]),
              ),
            );
          },
        ),
      ),
      Container(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
        decoration: BoxDecoration(border: Border(top: BorderSide(color: c.outlineVariant))),
        child: Row(children: [
          IconButton(
              key: const ValueKey('lab-step-prev'), tooltip: tr('Back'), onPressed: step > 0 ? () => _step(step - 1) : null, icon: const Icon(Icons.chevron_left)),
          Expanded(
              child: Text(tr('Step {n} of {m}', {'n': step + 1, 'm': l.steps.length}), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
          if (l.steps.isNotEmpty) _readAloud(l.steps[step].text),
          IconButton(
              key: const ValueKey('lab-step-next'),
              tooltip: tr('Next'),
              onPressed: step < l.steps.length - 1 ? () => _step(step + 1) : null,
              icon: const Icon(Icons.chevron_right)),
        ]),
      ),
    ]);
  }

  Widget _guide(VirtualLab l) => ListView(key: const ValueKey('lab-guide'), padding: const EdgeInsets.fromLTRB(14, 0, 14, 20), children: [
        if (!l.reviewed)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(tr('Not yet reviewed by a subject teacher.'), style: context.text.labelMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          ),
        _section(tr('Aim')),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: _para(l.aim.text)), _readAloud(l.aim.text)]),
        _section(tr('Principle')),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: _para(l.principle.text)), _readAloud(l.principle.text)]),
        _section(tr('Apparatus')),
        for (final a in l.apparatus) _bullet(a.text),
        _section(tr('Precautions')),
        for (final a in l.precautions) _bullet(a.text),
      ]);

  Widget _bullet(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 8, right: 8), child: Icon(Icons.circle, size: 6, color: context.colors.primary)),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15, height: 1.35))),
        ]),
      );

  Widget _viva(VirtualLab l) {
    final c = context.colors;
    return ListView.builder(
      key: const ValueKey('lab-viva'),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 20),
      itemCount: l.viva.length,
      itemBuilder: (context, i) {
        final q = l.viva[i];
        final shown = _shownAnswers.contains(i);
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
          decoration: BoxDecoration(color: c.surfaceContainerHigh, borderRadius: Kx.radiusMd),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Q${i + 1}. ', style: TextStyle(fontWeight: FontWeight.w600, color: c.primary)),
              Expanded(child: Text(q.q.text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.35))),
              _readAloud(q.q.text),
            ]),
            const SizedBox(height: 4),
            if (shown)
              Text(q.a.text, key: ValueKey('lab-answer-$i'), style: TextStyle(fontSize: 15, height: 1.35, color: c.tertiary))
            else
              TextButton(key: ValueKey('lab-show-answer-$i'), onPressed: () => setState(() => _shownAnswers.add(i)), child: Text(tr('Show answer'))),
          ]),
        );
      },
    );
  }
}

class _GraphPainter extends CustomPainter {
  final LabGraph graph;
  final List<List<Object>> rows;
  final List<LabColumn> columns;
  _GraphPainter(this.graph, this.rows, this.columns);

  @override
  void paint(Canvas canvas, Size size) => paintLabGraph(canvas, Offset.zero & size, graph, rows, columns);

  @override
  bool shouldRepaint(_GraphPainter old) => true;
}
