import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../algo/frames.dart';
import '../algo/more.dart';
import '../algo/sorting.dart';
import '../algo/structures.dart';
import '../algo/trees_graphs.dart';
import '../strings.dart';
import 'draw.dart';
import 'elements_view.dart';
import 'pseudocode.dart';

enum AlgoKind { bubble, insertion, selection, merge, quick, heap, linear, binary, stack, queue, list, hash, bst, bfs, dfs, dijkstra, counting, cqueue, binheap, prim, kruskal, topo }

/// The graph algorithms (their input is an edge list the teacher can add to).
const graphKinds = {AlgoKind.bfs, AlgoKind.dfs, AlgoKind.dijkstra, AlgoKind.prim, AlgoKind.kruskal, AlgoKind.topo};

/// The kit's list: groups of algorithms, in teaching order.
const algoGroups = <String, List<AlgoKind>>{
  'grpSorting': [AlgoKind.bubble, AlgoKind.insertion, AlgoKind.selection, AlgoKind.merge, AlgoKind.quick, AlgoKind.heap, AlgoKind.counting],
  'grpSearching': [AlgoKind.linear, AlgoKind.binary],
  'grpStructures': [AlgoKind.stack, AlgoKind.queue, AlgoKind.cqueue, AlgoKind.list, AlgoKind.hash],
  'grpTrees': [AlgoKind.bst, AlgoKind.binheap],
  'grpGraphs': [AlgoKind.bfs, AlgoKind.dfs, AlgoKind.dijkstra, AlgoKind.prim, AlgoKind.kruskal, AlgoKind.topo],
};

IconData algoIcon(AlgoKind k) => switch (k) {
  AlgoKind.bubble || AlgoKind.insertion || AlgoKind.selection || AlgoKind.merge || AlgoKind.quick || AlgoKind.heap || AlgoKind.counting => Icons.bar_chart,
  AlgoKind.cqueue => Icons.donut_large,
  AlgoKind.binheap => Icons.change_history,
  AlgoKind.prim || AlgoKind.kruskal => Icons.share_outlined,
  AlgoKind.topo => Icons.low_priority,
  AlgoKind.linear || AlgoKind.binary => Icons.search,
  AlgoKind.stack => Icons.layers_outlined,
  AlgoKind.queue => Icons.view_week_outlined,
  AlgoKind.list => Icons.link,
  AlgoKind.hash => Icons.tag,
  AlgoKind.bst => Icons.account_tree_outlined,
  AlgoKind.bfs || AlgoKind.dfs || AlgoKind.dijkstra => Icons.hub_outlined,
};

List<int> _ints(String s) => [for (final m in RegExp(r'-?\d+').allMatches(s)) int.parse(m[0]!)];

/// The steps for [kind] from the inputs the player shows (also used by tests).
List<AlgoFrame> algoFrames(AlgoKind kind, {String values = '', String extra = '', int option = 0}) {
  final v = _ints(values).take(24).toList();
  return switch (kind) {
    AlgoKind.bubble => sortSteps(SortAlgo.bubble, v),
    AlgoKind.insertion => sortSteps(SortAlgo.insertion, v),
    AlgoKind.selection => sortSteps(SortAlgo.selection, v),
    AlgoKind.merge => sortSteps(SortAlgo.merge, v),
    AlgoKind.quick => sortSteps(SortAlgo.quick, v),
    AlgoKind.heap => sortSteps(SortAlgo.heap, v),
    AlgoKind.linear => searchSteps(SearchAlgo.linear, v, _ints(extra).firstOrNull ?? 0),
    AlgoKind.binary => searchSteps(SearchAlgo.binary, v, _ints(extra).firstOrNull ?? 0),
    AlgoKind.stack => stackSteps(Op.parseAll(values)),
    AlgoKind.queue => queueSteps(Op.parseAll(values)),
    AlgoKind.list => linkedListSteps(v, Op.parseAll(extra)),
    AlgoKind.hash => hashSteps(v, size: (_ints(extra).firstOrNull ?? 7).clamp(2, 13), probing: Probing.values[option.clamp(0, 2)]),
    AlgoKind.bst => bstSteps(v, deletes: _ints(extra), traversal: Traversal.values[option.clamp(0, 3)]),
    AlgoKind.counting => countingSortSteps(v.where((x) => x >= -50 && x <= 99).toList()),
    AlgoKind.cqueue => circularQueueSteps(Op.parseAll(values), capacity: (_ints(extra).firstOrNull ?? 5).clamp(2, 12)),
    AlgoKind.binheap => heapSteps(v, ops: Op.parseAll(extra), min: option.clamp(0, 3).isOdd, heapify: option >= 2),
    AlgoKind.bfs || AlgoKind.dfs || AlgoKind.dijkstra || AlgoKind.prim || AlgoKind.kruskal || AlgoKind.topo => () {
      final g = TeachGraph.parse(values, directed: kind == AlgoKind.topo || (option == 1 && kind != AlgoKind.prim && kind != AlgoKind.kruskal));
      if (g.n == 0) return const <AlgoFrame>[];
      final start = ((extra.trim().isEmpty ? 'A' : extra.trim()).toUpperCase().codeUnitAt(0) - 65).clamp(0, g.n - 1);
      return switch (kind) {
        AlgoKind.dijkstra => dijkstraSteps(g, start),
        AlgoKind.prim => primSteps(g, start),
        AlgoKind.kruskal => kruskalSteps(g),
        AlgoKind.topo => topoSortSteps(g),
        _ => traverseGraphSteps(g, start, bfs: kind == AlgoKind.bfs),
      };
    }(),
  };
}

/// What the player asks for: (values label, values default, extra label, extra default,
/// option keys).
(String, String, String?, String, List<String>) _inputs(AlgoKind k) => switch (k) {
  AlgoKind.linear || AlgoKind.binary => ('values', '42 7 19 88 3 56 21 64', 'find', '56', const []),
  AlgoKind.stack || AlgoKind.queue => ('operations', k == AlgoKind.stack ? 'push 10; push 20; push 30; pop; peek; push 40' : 'enqueue 10; enqueue 20; enqueue 30; dequeue; enqueue 40; dequeue', null, '', const []),
  AlgoKind.list => ('values', '10 20 30', 'operations', 'insertHead 5; insertAt 15 2; delete 20; search 30', const []),
  AlgoKind.hash => ('values', '23 43 13 27 37 16', 'tableSize', '7', const ['probe_linear', 'probe_quadratic', 'probe_chaining']),
  AlgoKind.bst => ('values', '50 30 70 20 40 60 80', 'deletes', '30', const ['trav_inorder', 'trav_preorder', 'trav_postorder', 'trav_level']),
  AlgoKind.bfs || AlgoKind.dfs || AlgoKind.dijkstra => ('edges', 'A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2', 'startAt', 'A', const ['graph_undirected', 'graph_directed']),
  AlgoKind.prim => ('edges', 'A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2', 'startAt', 'A', const []),
  AlgoKind.kruskal => ('edges', 'A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2', null, '', const []),
  AlgoKind.topo => ('edges', 'A->C, B->C, B->D, C->E, D->F, E->F, F->G', null, '', const []),
  AlgoKind.cqueue => ('operations', 'enqueue 10; enqueue 20; enqueue 30; dequeue; dequeue; enqueue 40; enqueue 50; enqueue 60; enqueue 70; enqueue 80', 'capacity', '5', const []),
  AlgoKind.binheap => ('values', '40 20 60 10 50 30', 'operations', 'insert 70; extract; extract', const ['heap_maxInsert', 'heap_minInsert', 'heap_maxHeapify', 'heap_minHeapify']),
  AlgoKind.counting => ('values', '4 2 2 8 3 3 1', null, '', const []),
  _ => ('values', '38 27 43 3 9 82 10', null, '', const []),
};

/// An algorithm, step by step: inputs, the picture, the sentence, play/pause/back/next, and
/// "Put this step on board".
class AlgoPlayer extends StatefulWidget {
  const AlgoPlayer({super.key, required this.kind, required this.onInsert, this.accent = const Color(0xFF006879)});

  final AlgoKind kind;
  final void Function(List<BoardElement> elements) onInsert;
  final Color accent;

  @override
  State<AlgoPlayer> createState() => _AlgoPlayerState();
}

class _AlgoPlayerState extends State<AlgoPlayer> {
  late final (String, String, String?, String, List<String>) _spec = _inputs(widget.kind);
  late final _values = TextEditingController(text: _spec.$2);
  late final _extra = TextEditingController(text: _spec.$4);
  int _option = 0;
  List<AlgoFrame> _frames = const [];
  int _i = 0;
  Timer? _timer;
  double _speed = 1;
  bool _showCode = true;
  late final Pseudocode _code = pseudocodeFor(widget.kind);
  final _from = TextEditingController(), _to = TextEditingController(), _weight = TextEditingController(text: '1');

  @override
  void initState() {
    super.initState();
    _build();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _values.dispose();
    _extra.dispose();
    _from.dispose();
    _to.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _build() {
    _timer?.cancel();
    _timer = null;
    // The hashing menu lists linear probing first; Probing starts with chaining.
    final option = widget.kind == AlgoKind.hash ? const [1, 2, 0][_option] : _option;
    setState(() {
      _frames = algoFrames(widget.kind, values: _values.text, extra: _extra.text, option: option);
      _i = 0;
    });
  }

  void _play() {
    if (_timer != null) {
      setState(() => _timer!.cancel());
      _timer = null;
      return;
    }
    if (_i >= _frames.length - 1) _i = 0;
    _timer = Timer.periodic(Duration(milliseconds: (900 / _speed).round()), (_) {
      if (!mounted) return;
      setState(() {
        if (_i < _frames.length - 1) {
          _i++;
        } else {
          _timer?.cancel();
          _timer = null;
        }
      });
    });
    setState(() {});
  }

  String _caption(CsStrings s, AlgoFrame f) => s.t(f.say.key, f.say.args);

  /// The graph's node count as typed (letters A, B, …).
  int get _nodes => TeachGraph.parse(_values.text).n;

  void _appendGraph(String part) {
    final t = _values.text.trim();
    _values.text = t.isEmpty ? part : '$t, $part';
    _build();
  }

  void _addNode() {
    if (_nodes < 26) _appendGraph(String.fromCharCode(65 + _nodes));
  }

  void _addEdge() {
    final a = _from.text.trim().toUpperCase(), b = _to.text.trim().toUpperCase();
    if (!RegExp(r'^[A-Z]$').hasMatch(a) || !RegExp(r'^[A-Z]$').hasMatch(b) || a == b) return;
    final w = int.tryParse(_weight.text.trim()) ?? 1;
    final directed = widget.kind == AlgoKind.topo || (_option == 1 && _spec.$5.length == 2);
    _appendGraph('$a${directed ? '->' : '-'}$b${w == 1 ? '' : ' $w'}');
  }

  void _removeEdge() {
    final edges = RegExp(r'[A-Za-z]\s*-?>?\s*[A-Za-z]\s*\d*').allMatches(_values.text).toList();
    if (edges.isEmpty) return;
    final last = edges.last;
    _values.text = (_values.text.substring(0, last.start) + _values.text.substring(last.end)).replaceAll(RegExp(r'(,\s*)+$'), '').replaceAll(RegExp(r',\s*,'), ',').trim();
    _build();
  }

  /// The pseudocode as a card for the board, the current line marked.
  List<BoardElement> _codeCard(AlgoFrame f) {
    final at = _code.lineFor(f);
    return [codeCard([for (final (i, l) in _code.lines.indexed) '${i == at ? '▶ ' : '  '}$l'].join('\n'), fontSize: 18)];
  }

  Widget _pseudocode(CsStrings s, AlgoFrame? f) {
    final at = f == null ? null : _code.lineFor(f);
    return DecoratedBox(
      key: const Key('algo-pseudocode'),
      decoration: BoxDecoration(color: const Color(0xFFF7F8FA), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x22000000))),
      child: ListView(
        padding: const EdgeInsets.all(10),
        children: [
          Text(s.t('pseudocode'), style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          for (final (i, l) in _code.lines.indexed)
            Container(
              key: i == at ? const Key('algo-line-current') : null,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(color: i == at ? widget.accent.withValues(alpha: 0.18) : null, borderRadius: BorderRadius.circular(6)),
              child: Text(
                l,
                style: TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: i == at ? FontWeight.w700 : FontWeight.w400, color: const Color(0xFF1B1F24)),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    final frame = _frames.isEmpty ? null : _frames[_i];
    final playing = _timer != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 380,
              child: TextField(key: const Key('algo-values'), controller: _values, decoration: InputDecoration(labelText: s.t(_spec.$1), isDense: true), onSubmitted: (_) => _build()),
            ),
            if (_spec.$3 != null)
              SizedBox(
                width: _spec.$3 == 'operations' ? 380 : 120,
                child: TextField(key: const Key('algo-extra'), controller: _extra, decoration: InputDecoration(labelText: s.t(_spec.$3!), isDense: true), onSubmitted: (_) => _build()),
              ),
            if (_spec.$5.isNotEmpty)
              DropdownButton<int>(
                value: _option,
                items: [for (final (i, k) in _spec.$5.indexed) DropdownMenuItem(value: i, child: Text(s.t(k)))],
                onChanged: (v) {
                  _option = v ?? 0;
                  _build();
                },
              ),
            FilledButton.tonal(key: const Key('algo-apply'), onPressed: _build, child: Text(s.t('apply'))),
          ],
        ),
        if (graphKinds.contains(widget.kind)) ...[
          const SizedBox(height: 8),
          Wrap(
            key: const Key('algo-graph-edit'),
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(key: const Key('algo-add-node'), onPressed: _addNode, icon: const Icon(Icons.add_circle_outline), label: Text(s.t('addNode'))),
              for (final (key, c, label, w) in [('algo-from', _from, 'edgeFrom', 64.0), ('algo-to', _to, 'edgeTo', 64.0), ('algo-weight', _weight, 'edgeWeight', 80.0)])
                SizedBox(width: w, child: TextField(key: Key(key), controller: c, decoration: InputDecoration(labelText: s.t(label), isDense: true))),
              OutlinedButton.icon(key: const Key('algo-add-edge'), onPressed: _addEdge, icon: const Icon(Icons.timeline), label: Text(s.t('addEdge'))),
              TextButton.icon(key: const Key('algo-remove-edge'), onPressed: _removeEdge, icon: const Icon(Icons.undo), label: Text(s.t('removeEdge'))),
            ],
          ),
        ],
        const SizedBox(height: 12),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final drawing = DecoratedBox(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x22000000))),
                child: frame == null ? Center(child: Text(s.t('badInput'))) : ElementsView(frameElements(frame)),
              );
              if (!_showCode) return drawing;
              if (box.maxWidth < 720) {
                return Column(children: [Expanded(flex: 3, child: drawing), const SizedBox(height: 8), Expanded(flex: 2, child: _pseudocode(s, frame))]);
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [Expanded(child: drawing), const SizedBox(width: 12), SizedBox(width: math.min(380, box.maxWidth * 0.34), child: _pseudocode(s, frame))],
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        if (frame != null)
          Text(_caption(s, frame), key: const Key('algo-caption'), style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
        if (frame != null && frame.stats.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              [for (final MapEntry(:key, :value) in frame.stats.entries) '${s.t(key)}: $value'].join('   ·   '),
              key: const Key('algo-stats'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(s.t('stepOf', [_frames.isEmpty ? 0 : _i + 1, _frames.length])),
            Expanded(
              child: Slider(
                value: _frames.isEmpty ? 0 : _i.toDouble(),
                max: _frames.isEmpty ? 1 : (_frames.length - 1).toDouble().clamp(1, double.infinity),
                onChanged: _frames.length < 2 ? null : (v) => setState(() => _i = v.round()),
              ),
            ),
          ],
        ),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 4,
          runSpacing: 4,
          children: [
            IconButton(tooltip: s.t('restart'), icon: const Icon(Icons.first_page), onPressed: () => setState(() => _i = 0)),
            IconButton(key: const Key('algo-back'), tooltip: s.t('back'), icon: const Icon(Icons.chevron_left), onPressed: _i > 0 ? () => setState(() => _i--) : null),
            IconButton.filled(key: const Key('algo-play'), tooltip: s.t(playing ? 'pause' : 'play'), icon: Icon(playing ? Icons.pause : Icons.play_arrow), onPressed: _frames.length > 1 ? _play : null),
            IconButton(key: const Key('algo-next'), tooltip: s.t('next'), icon: const Icon(Icons.chevron_right), onPressed: _i < _frames.length - 1 ? () => setState(() => _i++) : null),
            PopupMenuButton<double>(
              tooltip: s.t('speed'),
              icon: const Icon(Icons.speed),
              initialValue: _speed,
              onSelected: (v) {
                _speed = v;
                if (_timer != null) {
                  _timer!.cancel();
                  _timer = null;
                  _play();
                }
              },
              itemBuilder: (_) => [for (final v in const [0.5, 1.0, 2.0, 4.0]) PopupMenuItem(value: v, child: Text('${v}x'))],
            ),
            IconButton(
              key: const Key('algo-code'),
              tooltip: s.t('pseudocode'),
              isSelected: _showCode,
              icon: const Icon(Icons.code),
              onPressed: () => setState(() => _showCode = !_showCode),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              key: const Key('algo-put'),
              icon: const Icon(Icons.add_to_photos_outlined),
              label: Text(s.t('putStep')),
              onPressed: frame == null
                  ? null
                  : () {
                      final step = frameElements(frame, caption: _caption(s, frame));
                      if (!_showCode) return widget.onInsert(step);
                      final b = contentBounds(step);
                      widget.onInsert([...step, ...placed(_codeCard(frame), Offset(b.right + 48, b.top))]);
                    },
            ),
          ],
        ),
      ],
    );
  }
}
