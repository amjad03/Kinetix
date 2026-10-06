import 'dart:ui';

import 'ink_models.dart';

/// Building flowcharts and mind maps by "add next": from a selected block, one more block (or a
/// whole conditional pattern) is placed beyond the chosen side, lined up and joined to it.

/// Ready-made conditional flows the ＋ palette offers beside the single blocks.
enum FlowPattern {
  /// A decision with a Yes arm straight on and a No arm to the side.
  ifElse,

  /// A decision with three labelled arms.
  switch3,

  /// A decision whose body loops back into it, with an exit arm.
  whileLoop,

  /// A loop-limit block whose body loops back into it.
  forLoop,
}

/// Words written into the blocks and on the arrows of a new pattern (the board's language).
class FlowWords {
  const FlowWords({
    this.yes = 'Yes',
    this.no = 'No',
    this.condition = 'Condition?',
    this.step = 'Step',
    this.cases = const ['Case 1', 'Case 2', 'Case 3'],
    this.loop = 'Repeat',
    this.forEach = 'For i = 1 to n',
    this.done = 'Done',
    this.topic = 'Idea',
    this.start = 'Start',
  });

  final String yes, no, condition, step, loop, forEach, done, topic, start;
  final List<String> cases;
}

/// What "add next" added: the page's new element list, the new elements' ids, and the block to
/// select afterwards (the first new one).
class FlowAddResult {
  const FlowAddResult(this.elements, this.added, this.focus);

  final List<BoardElement> elements;
  final List<String> added;
  final String focus;
}

/// Space between a block and the next.
const double flowGap = 70;

/// Adds a block of [shape] (or the blocks of [pattern]) beyond [side] of block [fromId] in
/// [elements], joined to it and lined up with it, moving sideways past blocks already there.
/// Mind-map topics get a curved branch. Returns null when [fromId] is not a block.
FlowAddResult? addNextFlow(
  List<BoardElement> elements,
  String fromId,
  FlowSide side, {
  FlowShape? shape,
  FlowPattern? pattern,
  FlowWords words = const FlowWords(),
  String Function() newId = newElementId,
}) {
  final src = elements.whereType<FlowNodeElement>().where((n) => n.id == fromId).firstOrNull;
  if (src == null) return null;
  final mind = src.shape == FlowShape.topic && (shape == null || shape == FlowShape.topic) && pattern == null;
  final out = List<BoardElement>.of(elements);
  final added = <String>[];
  final color = src.color;
  final across = side.clockwise; // sideways, for arms and for stepping past blocks

  bool free(Rect r) => !out.any((e) => e is FlowNodeElement && e.rect.inflate(flowGap / 3).overlaps(r));

  /// A block of [s] beyond [side] of [from], [offset] blocks sideways, nudged past others.
  FlowNodeElement place(Rect from, FlowShape s, String text, {FlowSide? dir, double offset = 0, bool nudge = true}) {
    final d = dir ?? side;
    final size = s.defaultSize;
    final along = d.vertical ? from.height / 2 + flowGap + size.height / 2 : from.width / 2 + flowGap + size.width / 2;
    final step = d.clockwise.vertical ? size.height + flowGap / 2 : size.width + flowGap / 2;
    var c = from.center + d.dir * along + d.clockwise.dir * (offset * step);
    var r = Rect.fromCenter(center: c, width: size.width, height: size.height);
    // Mind maps fan out; flowcharts step sideways one way, then the other.
    for (var i = 1; nudge && !free(r) && i < 12; i++) {
      final k = (i + 1) ~/ 2 * (i.isOdd ? 1 : -1);
      c = from.center + d.dir * along + d.clockwise.dir * ((offset + k) * step);
      r = Rect.fromCenter(center: c, width: size.width, height: size.height);
    }
    final n = FlowNodeElement(id: newId(), rect: r, shape: s, text: text, color: color, fontSize: src.fontSize);
    out.add(n);
    added.add(n.id);
    return n;
  }

  void link(FlowNodeElement a, FlowSide sa, FlowNodeElement b, FlowSide sb, {String label = '', bool curved = false}) {
    final l = FlowLinkElement(id: newId(), from: a.id, to: b.id, fromSide: sa, toSide: sb, label: label, color: color, curved: curved);
    // Arrows go under the blocks they join.
    out.insert(0, l);
    added.add(l.id);
  }

  if (pattern == null) {
    final s = shape ?? (mind ? FlowShape.topic : FlowShape.process);
    final n = place(src.rect, s, mind ? words.topic : '');
    link(src, side, n, side.opposite, curved: mind);
    return FlowAddResult(reflowLinks(out), added, n.id);
  }

  final head = switch (pattern) {
    FlowPattern.forLoop => place(src.rect, FlowShape.loopLimit, words.forEach),
    _ => place(src.rect, FlowShape.decision, words.condition),
  };
  link(src, side, head, side.opposite);
  switch (pattern) {
    case FlowPattern.ifElse:
      final yes = place(head.rect, FlowShape.process, words.step, nudge: false);
      link(head, side, yes, side.opposite, label: words.yes);
      final no = place(head.rect, FlowShape.process, words.step, dir: across, nudge: false);
      link(head, across, no, across.opposite, label: words.no);
    case FlowPattern.switch3:
      for (var i = 0; i < 3; i++) {
        final arm = place(head.rect, FlowShape.process, words.step, offset: i - 1.0, nudge: false);
        link(head, side, arm, side.opposite, label: words.cases[i]);
      }
    case FlowPattern.whileLoop || FlowPattern.forLoop:
      final body = place(head.rect, FlowShape.process, words.loop, nudge: false);
      final back = across.opposite;
      link(head, side, body, side.opposite, label: pattern == FlowPattern.whileLoop ? words.yes : '');
      // The way back round the outside, into the same side of the head.
      link(body, back, head, back);
      final exit = place(head.rect, FlowShape.terminal, words.done, dir: across, nudge: false);
      link(head, across, exit, across.opposite, label: pattern == FlowPattern.whileLoop ? words.no : words.done);
  }
  return FlowAddResult(reflowLinks(out), added, head.id);
}

/// A first block for a new flowchart (a Start terminal) or a mind map's centre topic, with its
/// top-left at the origin (for [WhiteboardController.insert]).
FlowNodeElement starterNode({required bool mindMap, required Color color, FlowWords words = const FlowWords()}) {
  final shape = mindMap ? FlowShape.topic : FlowShape.terminal;
  final size = mindMap ? const Size(240, 90) : shape.defaultSize;
  return FlowNodeElement(
    id: newElementId(),
    rect: Offset.zero & size,
    shape: shape,
    text: mindMap ? words.topic : words.start,
    color: color,
    fontSize: mindMap ? 28 : 22,
  );
}

/// New typed words whose middle lands inside a block go into that block (the AI pen writing in a
/// block, or text typed over one). [before] is the page before the change: only text that was
/// not on it is taken. Returns [after] unchanged when nothing lands in a block.
List<BoardElement> absorbTextIntoFlow(List<BoardElement> before, List<BoardElement> after) {
  if (!after.any((e) => e is FlowNodeElement)) return after;
  final old = {
    for (final e in before)
      if (e is TextElement) e.id,
  };
  final fresh = [
    for (final e in after)
      if (e is TextElement && !old.contains(e.id)) e,
  ];
  if (fresh.isEmpty) return after;
  final into = <String, String>{};
  final taken = <String>{};
  for (final t in fresh) {
    final node = after.reversed.whereType<FlowNodeElement>().where((n) => n.shape != FlowShape.comment && n.rect.contains(t.bounds.center)).firstOrNull;
    if (node == null) continue;
    final had = into[node.id] ?? node.text;
    into[node.id] = had.trim().isEmpty ? t.text.trim() : '$had ${t.text.trim()}';
    taken.add(t.id);
  }
  if (taken.isEmpty) return after;
  return [
    for (final e in after)
      if (!taken.contains(e.id)) e is FlowNodeElement && into[e.id] != null ? e.copyWith(text: into[e.id]) : e,
  ];
}
