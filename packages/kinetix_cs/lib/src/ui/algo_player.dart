import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../algo/frames.dart';
import '../algo/sorting.dart';
import '../algo/structures.dart';
import '../algo/trees_graphs.dart';
import '../strings.dart';
import 'draw.dart';
import 'elements_view.dart';

enum AlgoKind { bubble, insertion, selection, merge, quick, heap, linear, binary, stack, queue, list, hash, bst, bfs, dfs, dijkstra }

/// The kit's list: groups of algorithms, in teaching order.
const algoGroups = <String, List<AlgoKind>>{
  'grpSorting': [AlgoKind.bubble, AlgoKind.insertion, AlgoKind.selection, AlgoKind.merge, AlgoKind.quick, AlgoKind.heap],
  'grpSearching': [AlgoKind.linear, AlgoKind.binary],
  'grpStructures': [AlgoKind.stack, AlgoKind.queue, AlgoKind.list, AlgoKind.hash],
  'grpTrees': [AlgoKind.bst, AlgoKind.bfs, AlgoKind.dfs, AlgoKind.dijkstra],
};

IconData algoIcon(AlgoKind k) => switch (k) {
  AlgoKind.bubble || AlgoKind.insertion || AlgoKind.selection || AlgoKind.merge || AlgoKind.quick || AlgoKind.heap => Icons.bar_chart,
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
    AlgoKind.bfs || AlgoKind.dfs || AlgoKind.dijkstra => () {
      final g = TeachGraph.parse(values);
      if (g.n == 0) return const <AlgoFrame>[];
      final start = ((extra.trim().isEmpty ? 'A' : extra.trim()).toUpperCase().codeUnitAt(0) - 65).clamp(0, g.n - 1);
      return kind == AlgoKind.dijkstra ? dijkstraSteps(g, start) : traverseGraphSteps(g, start, bfs: kind == AlgoKind.bfs);
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
  AlgoKind.bfs || AlgoKind.dfs || AlgoKind.dijkstra => ('edges', 'A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2', 'startAt', 'A', const []),
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
        const SizedBox(height: 12),
        Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x22000000))),
            child: frame == null ? Center(child: Text(s.t('badInput'))) : ElementsView(frameElements(frame)),
          ),
        ),
        const SizedBox(height: 8),
        if (frame != null)
          Text(_caption(s, frame), key: const Key('algo-caption'), style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
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
            const SizedBox(width: 8),
            FilledButton.icon(
              key: const Key('algo-put'),
              icon: const Icon(Icons.add_to_photos_outlined),
              label: Text(s.t('putStep')),
              onPressed: frame == null ? null : () => widget.onInsert(frameElements(frame, caption: _caption(s, frame))),
            ),
          ],
        ),
      ],
    );
  }
}
