import 'dart:math' as math;

import 'finance.dart' show n2;

/// One activity of a project. With three estimates the PERT time (o + 4m + p) ÷ 6 is used.
class Activity {
  const Activity(this.id, this.duration, {this.predecessors = const [], this.name = '', this.optimistic, this.pessimistic});

  /// `B 4 A` or `B 2,4,6 A,C` or `B: Design 4 A`: id, duration (or o,m,p), then predecessors.
  static Activity? parse(String line) {
    final m = RegExp(r'^\s*([A-Za-z0-9]+)\s*(?::\s*([^0-9]*?))?\s*([\d.]+(?:\s*,\s*[\d.]+\s*,\s*[\d.]+)?)\s*(.*)$').firstMatch(line);
    if (m == null) return null;
    final times = m[3]!.split(',').map((t) => double.parse(t.trim())).toList();
    final preds = [for (final p in m[4]!.split(RegExp(r'[\s,;-]+'))) if (p.trim().isNotEmpty) p.trim()];
    return times.length == 3
        ? Activity(m[1]!, times[1], optimistic: times[0], pessimistic: times[2], predecessors: preds, name: (m[2] ?? '').trim())
        : Activity(m[1]!, times[0], predecessors: preds, name: (m[2] ?? '').trim());
  }

  final String id, name;
  final double duration;
  final double? optimistic, pessimistic;
  final List<String> predecessors;

  bool get isPert => optimistic != null && pessimistic != null;
  double get expected => isPert ? (optimistic! + 4 * duration + pessimistic!) / 6 : duration;
  double get variance => isPert ? math.pow((pessimistic! - optimistic!) / 6, 2).toDouble() : 0;
}

class Scheduled {
  Scheduled(this.activity, this.es, this.ef, this.ls, this.lf);
  final Activity activity;
  final double es, ef, ls, lf;
  double get slack => ls - es;
  bool get critical => slack.abs() < 1e-9;
}

/// The forward and backward passes over a network of activities.
class Schedule {
  Schedule._(this.items, this.order, this.duration);

  /// Null when an activity needs one that does not exist, or the network loops.
  static Schedule? of(List<Activity> acts) {
    final byId = {for (final a in acts) a.id: a};
    if (byId.length != acts.length) return null;
    for (final a in acts) {
      if (a.predecessors.any((p) => !byId.containsKey(p))) return null;
    }
    // Topological order (Kahn).
    final indeg = {for (final a in acts) a.id: a.predecessors.length};
    final order = <String>[];
    final ready = [for (final a in acts) if (a.predecessors.isEmpty) a.id];
    while (ready.isNotEmpty) {
      final id = ready.removeAt(0);
      order.add(id);
      for (final a in acts) {
        if (!a.predecessors.contains(id)) continue;
        indeg[a.id] = indeg[a.id]! - 1;
        if (indeg[a.id] == 0) ready.add(a.id);
      }
    }
    if (order.length != acts.length) return null;
    final es = <String, double>{}, ef = <String, double>{};
    for (final id in order) {
      final a = byId[id]!;
      es[id] = a.predecessors.fold(0.0, (m, p) => math.max(m, ef[p]!));
      ef[id] = es[id]! + a.expected;
    }
    final end = ef.values.fold(0.0, math.max);
    final lf = <String, double>{}, ls = <String, double>{};
    for (final id in order.reversed) {
      final succ = acts.where((s) => s.predecessors.contains(id));
      lf[id] = succ.isEmpty ? end : succ.map((s) => ls[s.id]!).reduce(math.min);
      ls[id] = lf[id]! - byId[id]!.expected;
    }
    return Schedule._({for (final id in order) id: Scheduled(byId[id]!, es[id]!, ef[id]!, ls[id]!, lf[id]!)}, order, end);
  }

  final Map<String, Scheduled> items;
  final List<String> order;
  final double duration;

  /// One critical path, start to finish (following critical activities that touch).
  List<String> get criticalPath {
    final out = <String>[];
    Scheduled? cur = items.values.where((s) => s.critical && s.activity.predecessors.isEmpty).firstOrNull;
    while (cur != null) {
      out.add(cur.activity.id);
      final id = cur.activity.id;
      final ef = cur.ef;
      cur = items.values.where((s) => s.critical && s.activity.predecessors.contains(id) && (s.es - ef).abs() < 1e-9).firstOrNull;
    }
    return out;
  }

  /// The project variance along the critical path (PERT).
  double get variance => criticalPath.fold(0.0, (v, id) => v + items[id]!.activity.variance);

  List<List<String>> get table => [
    ['Activity', 'Time', 'ES', 'EF', 'LS', 'LF', 'Slack'],
    for (final id in order)
      [id, n2(items[id]!.activity.expected), n2(items[id]!.es), n2(items[id]!.ef), n2(items[id]!.ls), n2(items[id]!.lf), n2(items[id]!.slack)],
  ];
}
