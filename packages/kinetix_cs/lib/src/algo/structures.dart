import 'frames.dart';

/// An operation on a stack, queue or linked list: push/pop, enqueue/dequeue, insert/delete/
/// search. [value] is the item (or, for `insertAt`, the item and [at] the position).
class Op {
  const Op(this.name, [this.value, this.at]);

  final String name;
  final int? value;
  final int? at;

  /// "push 5", "pop", "insertAt 7 2", "delete 3" (as typed by the teacher), or null.
  static Op? parse(String s) {
    final p = s.trim().split(RegExp(r'[\s,()]+')).where((w) => w.isNotEmpty).toList();
    if (p.isEmpty) return null;
    final v = p.length > 1 ? int.tryParse(p[1]) : null, at = p.length > 2 ? int.tryParse(p[2]) : null;
    return Op(p[0].toLowerCase(), v, at);
  }

  /// A line of ops separated by ';' or new lines.
  static List<Op> parseAll(String s) => [for (final part in s.split(RegExp(r'[;\n]'))) ?Op.parse(part)];
}

/// A stack with [capacity] (overflow is shown, not thrown).
List<AlgoFrame> stackSteps(List<Op> ops, {int capacity = 6}) {
  final st = <int>[];
  final out = <AlgoFrame>[AlgoFrame(LineView(LineKind.stack, const []), const Say('stackStart'))];
  void add(Say s, [Map<int, Mark> m = const {}]) => out.add(AlgoFrame(LineView(LineKind.stack, List.of(st), marks: m, pointers: {if (st.isNotEmpty) 'top': st.length - 1}), s));
  for (final op in ops) {
    switch (op.name) {
      case 'push' when op.value != null:
        if (st.length >= capacity) {
          add(Say('overflow', [op.value!]));
        } else {
          st.add(op.value!);
          add(Say('push', [op.value!]), {st.length - 1: Mark.active});
        }
      case 'pop':
        if (st.isEmpty) {
          add(const Say('underflow'));
        } else {
          add(Say('pop', [st.last]), {st.length - 1: Mark.swap});
          st.removeLast();
          add(Say('popped', [st.length]));
        }
      case 'peek':
        add(st.isEmpty ? const Say('underflow') : Say('peek', [st.last]), {if (st.isNotEmpty) st.length - 1: Mark.found});
    }
  }
  return out;
}

/// A linear queue with [capacity].
List<AlgoFrame> queueSteps(List<Op> ops, {int capacity = 6}) {
  final q = <int>[];
  final out = <AlgoFrame>[AlgoFrame(LineView(LineKind.queue, const []), const Say('queueStart'))];
  void add(Say s, [Map<int, Mark> m = const {}]) =>
      out.add(AlgoFrame(LineView(LineKind.queue, List.of(q), marks: m, pointers: {if (q.isNotEmpty) 'front': 0, if (q.isNotEmpty) 'rear': q.length - 1}), s));
  for (final op in ops) {
    switch (op.name) {
      case 'enqueue' || 'enq' || 'push' when op.value != null:
        if (q.length >= capacity) {
          add(Say('overflow', [op.value!]));
        } else {
          q.add(op.value!);
          add(Say('enqueue', [op.value!]), {q.length - 1: Mark.active});
        }
      case 'dequeue' || 'deq' || 'pop':
        if (q.isEmpty) {
          add(const Say('underflow'));
        } else {
          add(Say('dequeue', [q.first]), {0: Mark.swap});
          q.removeAt(0);
          add(Say('queueSize', [q.length]));
        }
    }
  }
  return out;
}

/// A singly linked list: insertHead, insertTail (or insert), insertAt v i, delete v, search v.
List<AlgoFrame> linkedListSteps(List<int> start, List<Op> ops) {
  final l = List.of(start);
  final out = <AlgoFrame>[];
  void add(Say s, [Map<int, Mark> m = const {}, Map<String, int> p = const {}]) =>
      out.add(AlgoFrame(LineView(LineKind.linkedList, List.of(l), marks: m, pointers: {if (l.isNotEmpty) 'head': 0, ...p}), s));
  add(const Say('listStart'));
  void walkTo(int index) {
    for (var i = 0; i < index && i < l.length; i++) {
      add(Say('walk', [l[i]]), {i: Mark.compare}, {'cur': i});
    }
  }

  for (final op in ops) {
    final v = op.value;
    switch (op.name) {
      case 'inserthead' || 'head' when v != null:
        l.insert(0, v);
        add(Say('insertHead', [v]), {0: Mark.active});
      case 'inserttail' || 'insert' || 'tail' when v != null:
        walkTo(l.length);
        l.add(v);
        add(Say('insertTail', [v]), {l.length - 1: Mark.active});
      case 'insertat' when v != null:
        final at = (op.at ?? 0).clamp(0, l.length);
        walkTo(at);
        l.insert(at, v);
        add(Say('insertAt', [v, at]), {at: Mark.active});
      case 'delete' when v != null:
        final i = l.indexOf(v);
        walkTo(i < 0 ? l.length : i);
        if (i < 0) {
          add(Say('notFound', [v]));
        } else {
          add(Say('unlink', [v]), {i: Mark.swap}, {'cur': i});
          l.removeAt(i);
          add(Say('deleted', [v]));
        }
      case 'search' when v != null:
        final i = l.indexOf(v);
        walkTo(i < 0 ? l.length : i);
        add(i < 0 ? Say('notFound', [v]) : Say('found', [v, i]), {if (i >= 0) i: Mark.found});
    }
  }
  return out;
}

enum Probing { chaining, linear, quadratic }

/// Inserting [keys] into a table of [size] with h(k) = k mod size.
List<AlgoFrame> hashSteps(List<int> keys, {int size = 7, Probing probing = Probing.linear}) {
  final out = <AlgoFrame>[];
  final buckets = List.generate(size, (_) => <int>[]);
  List<List<int>> copy() => [for (final b in buckets) List.of(b)];
  out.add(AlgoFrame(HashView(buckets: copy()), Say('hashStart', [size])));
  for (final k in keys) {
    final h = k % size;
    out.add(AlgoFrame(HashView(buckets: copy(), key: k, marks: {h: Mark.compare}, probe: [h]), Say('hash', [k, size, h])));
    if (probing == Probing.chaining) {
      buckets[h].add(k);
      out.add(AlgoFrame(HashView(buckets: copy(), key: k, marks: {h: Mark.active}), Say('chain', [k, h])));
      continue;
    }
    final probe = <int>[];
    var placed = false;
    for (var i = 0; i < size; i++) {
      final slot = (h + (probing == Probing.linear ? i : i * i)) % size;
      probe.add(slot);
      if (buckets[slot].isEmpty) {
        buckets[slot].add(k);
        out.add(AlgoFrame(HashView(buckets: copy(), key: k, marks: {slot: Mark.active}, probe: List.of(probe)), Say('placed', [k, slot])));
        placed = true;
        break;
      }
      out.add(AlgoFrame(HashView(buckets: copy(), key: k, marks: {slot: Mark.swap}, probe: List.of(probe)), Say('collision', [slot])));
    }
    if (!placed) out.add(AlgoFrame(HashView(buckets: copy(), key: k), Say('tableFull', [k])));
  }
  return out;
}
