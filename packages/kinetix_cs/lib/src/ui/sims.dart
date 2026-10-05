import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../sims/network.dart';
import '../sims/normalization.dart';
import '../sims/numbers_logic.dart';
import '../sims/os.dart';
import '../strings.dart';
import 'diagrams.dart';
import 'draw.dart';
import 'elements_view.dart';

enum SimKind { numbers, logic, osi, tcp, subnet, cpu, paging, banker, normal }

const simGroups = <String, List<SimKind>>{
  'grpNumbersLogic': [SimKind.numbers, SimKind.logic],
  'grpNetworks': [SimKind.osi, SimKind.tcp, SimKind.subnet],
  'grpOs': [SimKind.cpu, SimKind.paging, SimKind.banker],
  'grpDbms': [SimKind.normal],
};

IconData simIcon(SimKind k) => switch (k) {
  SimKind.numbers => Icons.pin_outlined,
  SimKind.logic => Icons.memory,
  SimKind.osi => Icons.layers_outlined,
  SimKind.tcp => Icons.swap_horiz,
  SimKind.subnet => Icons.lan_outlined,
  SimKind.cpu => Icons.view_timeline_outlined,
  SimKind.paging => Icons.view_module_outlined,
  SimKind.banker => Icons.account_balance_outlined,
  SimKind.normal => Icons.table_chart_outlined,
};

/// A field of a simulation's form: its CsStrings label key, default, and choices (a dropdown
/// when given, of CsStrings keys).
class SimField {
  const SimField(this.label, this.initial, {this.choices = const [], this.lines = 1, this.width = 160});

  final String label;
  final String initial;
  final List<String> choices;
  final int lines;
  final double width;
}

/// What a simulation shows: text (monospaced, also its board card) and an optional picture.
class SimOut {
  const SimOut(this.text, {this.picture = const []});

  final String text;
  final List<BoardElement> picture;

  List<BoardElement> board({Color accent = const Color(0xFF006879)}) => stack([picture, if (text.trim().isNotEmpty) [codeCard(text, language: 'output', color: accent)]]);
}

List<SimField> simFields(SimKind k) => switch (k) {
  SimKind.numbers => const [SimField('decimal', '45'), SimField('bits', '8', width: 90), SimField('bitwise', '12', width: 120)],
  SimKind.logic => const [SimField('expression', "A'B + AB'", width: 380)],
  SimKind.osi => const [SimField('message', 'GET /index.html', width: 300)],
  SimKind.tcp => const [SimField('clientIsn', '100', width: 110), SimField('serverIsn', '300', width: 110), SimField('dataBytes', '50', width: 110)],
  SimKind.subnet => const [SimField('addressPrefix', '192.168.10.77/26', width: 240), SimField('splitInto', '4', width: 110)],
  SimKind.cpu => const [
    SimField('processes', 'P1 0 8 3\nP2 1 4 1\nP3 2 9 4\nP4 3 5 2', lines: 5, width: 300),
    SimField('sched_fcfs', 'sched_fcfs', choices: ['sched_fcfs', 'sched_sjf', 'sched_srtf', 'sched_priority', 'sched_priorityPreemptive', 'sched_roundRobin']),
    SimField('quantum', '2', width: 110),
  ],
  SimKind.paging => const [
    SimField('references', '7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1', width: 380),
    SimField('frames', '3', width: 90),
    SimField('page_fifo', 'page_fifo', choices: ['page_fifo', 'page_lru', 'page_optimal']),
  ],
  SimKind.banker => const [
    SimField('allocation', '0 1 0\n2 0 0\n3 0 2\n2 1 1\n0 0 2', lines: 5, width: 150),
    SimField('max', '7 5 3\n3 2 2\n9 0 2\n2 2 2\n4 3 3', lines: 5, width: 150),
    SimField('available', '3 3 2', width: 120),
    SimField('request', 'P1: 1 0 2', width: 150),
  ],
  SimKind.normal => const [SimField('attributes', 'ABCDE', width: 200), SimField('fds', 'A->B, B->C, CD->E', lines: 3, width: 380)],
};

List<int> _ints(String s) => [for (final m in RegExp(r'-?\d+').allMatches(s)) int.parse(m[0]!)];

String _pad(Object o, int w) => '$o'.padRight(w);

/// Runs [k] on [v] (the fields' values, in order). Throws FormatException on bad input.
SimOut runSim(SimKind k, List<String> v, CsStrings s) {
  switch (k) {
    case SimKind.numbers:
      final n = _ints(v[0]).firstOrNull ?? (throw const FormatException('number'));
      final bits = (_ints(v[1]).firstOrNull ?? 8).clamp(4, 32);
      final other = _ints(v[2]).firstOrNull ?? 0;
      final a = n.abs();
      final out = StringBuffer()
        ..writeln('${s.t('decimal')}: $n')
        ..writeln('${s.t('binary')}: ${n < 0 ? '-' : ''}${nibbles(a.toRadixString(2))}')
        ..writeln('${s.t('octal')}: ${n < 0 ? '-' : ''}${a.toRadixString(8)}')
        ..writeln('${s.t('hex')}: ${n < 0 ? '-' : ''}${a.toRadixString(16).toUpperCase()}')
        ..writeln('${s.t('twos')} ($bits): ${twosComplement(n, bits) ?? s.t('doesNotFit', [bits])}');
      if (n > 0 && twosComplement(-n, bits) != null) out.writeln('${s.t('twos')} ($bits) −$n: ${nibbles(twosComplement(-n, bits)!)}');
      out
        ..writeln()
        ..writeln(s.t('division', [2]));
      for (final (x, q, r) in divisionSteps(a, 2)) {
        out.writeln('  $x ÷ 2 = $q  r $r');
      }
      out.writeln('  ↑ ${a.toRadixString(2)}');
      out
        ..writeln()
        ..writeln('${s.t('placeValue')}: ${placeValues(a.toRadixString(2), 2)} = $a')
        ..writeln()
        ..writeln('${s.t('bitwise')} $other ($bits bits):');
      final mask = (1 << bits) - 1;
      String b(int x) => (x & mask).toRadixString(2).padLeft(bits, '0');
      for (final (name, op) in [('AND', BitOp.and), ('OR', BitOp.or), ('XOR', BitOp.xor)]) {
        out.writeln('  ${b(n)} $name ${b(other)} = ${b(bitOp(op, n, other, bits: bits))}  (${bitOp(op, n, other, bits: bits)})');
      }
      out
        ..writeln('  NOT ${b(n)} = ${b(bitOp(BitOp.not, n, 0, bits: bits))}')
        ..writeln('  ${b(n)} << 1 = ${b(bitOp(BitOp.shl, n, 1, bits: bits))}')
        ..write('  ${b(n)} >> 1 = ${b(bitOp(BitOp.shr, n, 1, bits: bits))}');
      return SimOut(out.toString());
    case SimKind.logic:
      final e = BoolExpr.parse(v[0]);
      final head = '${e.variables.join(' ')} | Y';
      final rows = [for (final (ins, o) in e.truthTable()) '${ins.map((x) => x ? 1 : 0).join(' ')} | ${o ? 1 : 0}'];
      return SimOut(
        [v[0].trim(), '', head, '-' * head.length, ...rows, '', '${s.t('minterms')}: Σm(${e.minterms.join(', ')})', '${s.t('sop')}: ${e.sumOfProducts}'].join('\n'),
      );
    case SimKind.osi:
      final steps = encapsulate(v[0].trim().isEmpty ? 'Hello' : v[0].trim());
      final out = StringBuffer();
      for (final (l, parts) in steps) {
        final name = s.t(l.key);
        out.writeln('${l.number} ${_pad(name, 13)} ${_pad(l.pdu, 8)} ${parts.map((p) => '[$p]').join('')}');
      }
      final pic = <BoardElement>[];
      for (final (i, (l, parts)) in steps.indexed) {
        var x = 220.0;
        final y = i * 52.0;
        pic.add(text('${l.number}  ${s.t(l.key)}', Offset(0, y + 8), size: 18, bold: true));
        for (final p in parts) {
          final w = measureBoardText(p, 18).width + 22;
          final color = switch (p) {
            'TCP' => const Color(0xFFF2A900),
            'IP' => const Color(0xFF1A73E8),
            'MAC' || 'FCS' => const Color(0xFF8E24AA),
            _ => const Color(0xFF188038),
          };
          pic
            ..add(box(Rect.fromLTWH(x, y, w, 40), fill: color.withValues(alpha: 0.3), width: 2))
            ..add(text(p, Offset(x + w / 2, y + 20), size: 18, center: true));
          x += w;
        }
      }
      return SimOut(out.toString().trimRight(), picture: pic);
    case SimKind.tcp:
      final c = tcpConversation(clientIsn: _ints(v[0]).firstOrNull ?? 100, serverIsn: _ints(v[1]).firstOrNull ?? 300, dataBytes: (_ints(v[2]).firstOrNull ?? 0).clamp(0, 1 << 20));
      final pic = <BoardElement>[
        ...lifeline(s.t('client'), length: 70.0 + c.length * 56),
        ...placed(lifeline(s.t('server'), length: 70.0 + c.length * 56), const Offset(480, 40)),
      ];
      for (final (i, seg) in c.indexed) {
        final y = 160.0 + i * 56;
        final from = Offset(seg.fromClient ? 80 : 560, y), to = Offset(seg.fromClient ? 560 : 80, y + 20);
        final label = '${seg.flags}  seq=${seg.seq}${seg.ack == null ? '' : '  ack=${seg.ack}'}${seg.bytes > 0 ? '  len=${seg.bytes}' : ''}';
        pic.addAll(connectPoints(from, to, Connector.message, label: label));
        pic.add(text(seg.state, Offset(seg.fromClient ? -60 : 600, y - 4), color: const Color(0xFF5F6368), size: 14));
      }
      return SimOut(c.map((x) => '$x   (${x.state})').join('\n'), picture: pic);
    case SimKind.subnet:
      final n = Subnet.parse(v[0]) ?? (throw const FormatException('subnet'));
      final out = StringBuffer()
        ..writeln('${_pad(s.t('network'), 14)} $n')
        ..writeln('${_pad(s.t('mask'), 14)} ${ipv4(n.mask)}  (${ipv4Bits(n.mask)})')
        ..writeln('${_pad(s.t('wildcard'), 14)} ${ipv4(n.wildcard)}')
        ..writeln('${_pad(s.t('broadcast'), 14)} ${ipv4(n.broadcast)}')
        ..writeln('${_pad(s.t('firstHost'), 14)} ${ipv4(n.firstHost)}')
        ..writeln('${_pad(s.t('lastHost'), 14)} ${ipv4(n.lastHost)}')
        ..writeln('${_pad(s.t('hosts'), 14)} ${n.hosts}')
        ..write('${_pad(s.t('ipClass'), 14)} ${n.ipClass}, ${s.t(n.isPrivate ? 'privateNet' : 'publicNet')}');
      final parts = (_ints(v[1]).firstOrNull ?? 0).clamp(0, 256);
      if (parts > 1) {
        out
          ..writeln()
          ..writeln()
          ..writeln('${s.t('splitInto')} $parts:');
        final subs = n.split(parts);
        if (subs.isEmpty) out.write('  ${s.t('badInput')}');
        for (final x in subs) {
          out.writeln('  ${_pad(x, 20)} ${ipv4(x.firstHost)} – ${ipv4(x.lastHost)}   ${s.t('broadcast')} ${ipv4(x.broadcast)}');
        }
      }
      return SimOut(out.toString().trimRight());
    case SimKind.cpu:
      final procs = <Proc>[
        for (final line in v[0].split('\n'))
          if (RegExp(r'^\s*(\S+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?').firstMatch(line) case final m?)
            Proc(m[1]!, int.parse(m[2]!), int.parse(m[3]!), priority: int.tryParse(m[4] ?? '') ?? 0),
      ].where((p) => p.burst > 0).take(12).toList();
      if (procs.isEmpty) throw const FormatException('processes');
      final algo = Sched.values.firstWhere((a) => 'sched_${a.name}' == v[1], orElse: () => Sched.fcfs);
      final sch = schedule(procs, algo, quantum: (_ints(v[2]).firstOrNull ?? 2).clamp(1, 50));
      final w = [6, 8, 6, 9, 11, 11, 8];
      final out = StringBuffer()
        ..writeln(s.t(v[1]))
        ..writeln([
          'ID',
          'Arrival',
          'Burst',
          if (algo == Sched.priority || algo == Sched.priorityPreemptive) 'Prio',
          s.t('completion'),
          s.t('turnaround'),
          s.t('waiting'),
        ].indexed.map((e) => _pad(e.$2, w[e.$1])).join(' '));
      for (final r in sch.results) {
        out.writeln([
          r.proc.id,
          r.proc.arrival,
          r.proc.burst,
          if (algo == Sched.priority || algo == Sched.priorityPreemptive) r.proc.priority,
          r.completion,
          r.turnaround,
          r.waiting,
        ].indexed.map((e) => _pad(e.$2, w[e.$1])).join(' '));
      }
      out.write('${s.t('average')}: ${s.t('turnaround')} ${sch.avgTurnaround.toStringAsFixed(2)}, ${s.t('waiting')} ${sch.avgWaiting.toStringAsFixed(2)}, ${s.t('response')} ${sch.avgResponse.toStringAsFixed(2)}');
      return SimOut(out.toString(), picture: ganttElements([for (final g in sch.gantt) (g.id, g.start, g.end)], ids: [for (final p in procs) p.id], idle: s.t('idle')));
    case SimKind.paging:
      final refs = _ints(v[0]).take(40).toList();
      final frames = (_ints(v[1]).firstOrNull ?? 3).clamp(1, 8);
      if (refs.isEmpty) throw const FormatException('refs');
      final algo = PageAlgo.values.firstWhere((a) => 'page_${a.name}' == v[2], orElse: () => PageAlgo.fifo);
      final steps = pageReplacement(refs, frames, algo);
      final cw = refs.map((r) => '$r'.length).fold(2, (a, b) => a > b ? a : b) + 1;
      final out = StringBuffer()
        ..writeln('${s.t(v[2])}, ${s.t('frames')} = $frames')
        ..writeln('Ref  ${refs.map((r) => _pad(r, cw)).join()}');
      for (var f = 0; f < frames; f++) {
        out.writeln('F${f + 1}   ${steps.map((st) => _pad(st.frames[f] ?? '-', cw)).join()}');
      }
      out
        ..writeln('     ${steps.map((st) => _pad(st.hit ? 'H' : 'F', cw)).join()}')
        ..write(s.t('faults', [steps.where((x) => !x.hit).length, steps.where((x) => x.hit).length]));
      return SimOut(out.toString());
    case SimKind.banker:
      List<List<int>> matrix(String t) => [for (final l in t.split('\n')) if (_ints(l).isNotEmpty) _ints(l)];
      final alloc = matrix(v[0]), max = matrix(v[1]), avail = _ints(v[2]);
      if (alloc.isEmpty || alloc.length != max.length || avail.isEmpty || [...alloc, ...max].any((r) => r.length != avail.length)) {
        throw const FormatException('matrix');
      }
      final r = banker(allocation: alloc, max: max, available: avail);
      final out = StringBuffer()..writeln('     ${_pad(s.t('allocation'), 12)} ${_pad(s.t('max'), 12)} ${s.t('need')}');
      for (var i = 0; i < alloc.length; i++) {
        out.writeln('${_pad('P$i', 5)}${_pad(alloc[i].join(' '), 12)} ${_pad(max[i].join(' '), 12)} ${r.need[i].join(' ')}');
      }
      out
        ..writeln('${s.t('available')}: ${avail.join(' ')}')
        ..writeln();
      for (final st in r.steps) {
        out.writeln('P${st.process}: ${s.t('need')} ${r.need[st.process].join(' ')} ≤ ${s.t('work')} ${st.workBefore.join(' ')}  →  ${s.t('work')} ${st.workAfter.join(' ')}');
      }
      out.write(r.safe ? s.t('safe', ['⟨${r.sequence.map((p) => 'P$p').join(', ')}⟩']) : s.t('unsafe'));
      final req = RegExp(r'P?\s*(\d+)\s*[:\s]\s*([\d\s]+)').firstMatch(v[3]);
      if (req != null && _ints(req[2]!).length == avail.length && int.parse(req[1]!) < alloc.length) {
        final p = int.parse(req[1]!);
        final why = bankerRequest(allocation: alloc, max: max, available: avail, process: p, request: _ints(req[2]!));
        out
          ..writeln()
          ..writeln()
          ..write('${s.t('request')} P$p (${_ints(req[2]!).join(' ')}): ${s.t(why ?? 'granted')}');
      }
      return SimOut(out.toString());
    case SimKind.normal:
      final fds = parseFds(v[1]);
      final r = {...attrsOf(v[0], words: RegExp('[a-z]{2,}').hasMatch('${v[0]}${v[1]}')), for (final f in fds) ...{...f.lhs, ...f.rhs}};
      if (r.isEmpty || r.length > 14) throw const FormatException('attributes');
      final keys = candidateKeys(r, fds);
      final (nf, violations) = normalForm(r, fds);
      const nfName = {NormalForm.first: '1NF', NormalForm.second: '2NF', NormalForm.third: '3NF', NormalForm.bcnf: 'BCNF'};
      final out = StringBuffer()
        ..writeln('R(${show(r)})')
        ..writeln('${s.t('fds')}: ${fds.join(', ')}')
        ..writeln()
        ..writeln('${s.t('closures')}:');
      final seen = <String>{};
      for (final f in fds) {
        if (seen.add(show(f.lhs))) out.writeln('  {${show(f.lhs)}}⁺ = {${show(closure(f.lhs, fds))}}');
      }
      out
        ..writeln('${s.t('keys')}: ${keys.map((k) => '{${show(k)}}').join(', ')}')
        ..writeln(s.t('highestNf', [nfName[nf]!]));
      for (final x in violations) {
        out.writeln('  ${s.t('breaks', [x.fd, nfName[x.breaks]!])}');
      }
      out
        ..writeln()
        ..writeln('${s.t('cover')}: ${minimalCover(fds).join(', ')}')
        ..writeln('${s.t('to3nf')}: ${decompose3nf(r, fds).map((x) => 'R(${show(x)})').join(', ')}')
        ..write('${s.t('toBcnf')}: ${decomposeBcnf(r, fds).map((x) => 'R(${show(x)})').join(', ')}');
      return SimOut(out.toString());
  }
}

/// A simulation's form and result, with "Put on board".
class SimPanel extends StatefulWidget {
  const SimPanel({super.key, required this.kind, required this.onInsert, this.accent = const Color(0xFF006879)});

  final SimKind kind;
  final void Function(List<BoardElement> elements) onInsert;
  final Color accent;

  @override
  State<SimPanel> createState() => _SimPanelState();
}

class _SimPanelState extends State<SimPanel> {
  late final List<SimField> _fields = simFields(widget.kind);
  late final List<TextEditingController> _c = [for (final f in _fields) TextEditingController(text: f.initial)];
  SimOut? _out;
  bool _bad = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _compute(rebuild: false);
  }

  @override
  void dispose() {
    for (final c in _c) {
      c.dispose();
    }
    super.dispose();
  }

  void _compute({bool rebuild = true}) {
    final s = CsStrings.of(context);
    try {
      _out = runSim(widget.kind, [for (final c in _c) c.text], s);
      _bad = false;
    } catch (_) {
      _bad = true;
    }
    if (rebuild) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    final out = _out;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            for (final (i, f) in _fields.indexed)
              if (f.choices.isNotEmpty)
                DropdownButton<String>(
                  value: _c[i].text,
                  items: [for (final ch in f.choices) DropdownMenuItem(value: ch, child: Text(s.t(ch)))],
                  onChanged: (v) {
                    _c[i].text = v ?? f.initial;
                    _compute();
                  },
                )
              else
                SizedBox(
                  width: f.width,
                  child: TextField(
                    key: Key('sim-${f.label}'),
                    controller: _c[i],
                    minLines: f.lines,
                    maxLines: f.lines,
                    style: f.lines > 1 ? const TextStyle(fontFamily: KxFonts.code) : null,
                    decoration: InputDecoration(labelText: s.t(f.label), isDense: true, hintText: f.label == 'expression' ? s.t('exprHint') : (f.label == 'fds' ? s.t('fdHint') : null)),
                    onChanged: (_) => _compute(),
                  ),
                ),
            FilledButton.icon(
              key: const Key('sim-put'),
              icon: const Icon(Icons.add_to_photos_outlined),
              label: Text(s.t('putOnBoard')),
              onPressed: out == null || _bad ? null : () => widget.onInsert(out.board(accent: widget.accent)),
            ),
          ],
        ),
        if (_bad) Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.t('badInput'), style: const TextStyle(color: Color(0xFFD93025)))),
        const SizedBox(height: 12),
        if (out != null && out.picture.isNotEmpty)
          SizedBox(
            height: 260,
            child: DecoratedBox(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x22000000))),
              child: ElementsView(out.picture),
            ),
          ),
        if (out != null) ...[
          const SizedBox(height: 12),
          Expanded(
            child: DecoratedBox(
              decoration: BoxDecoration(color: CodeTheme.dark.background, borderRadius: BorderRadius.circular(12)),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(14),
                scrollDirection: Axis.vertical,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SelectableText(out.text, key: const Key('sim-text'), style: TextStyle(fontFamily: KxFonts.code, fontFamilyFallback: KxFonts.fallback, fontSize: 16, color: CodeTheme.dark.plain, height: 1.4)),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
