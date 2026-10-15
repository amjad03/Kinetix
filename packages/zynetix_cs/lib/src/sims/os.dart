/// Operating systems for class: CPU scheduling (Gantt charts), page replacement and the
/// banker's algorithm.
library;

// --- CPU scheduling -----------------------------------------------------------------------

class Proc {
  const Proc(this.id, this.arrival, this.burst, {this.priority = 0});

  final String id;
  final int arrival;
  final int burst;

  /// Lower number = higher priority (as in most Indian syllabi).
  final int priority;
}

enum Sched { fcfs, sjf, srtf, priority, priorityPreemptive, roundRobin }

/// A stretch of the Gantt chart; [id] null is the CPU sitting idle.
class Slice {
  const Slice(this.id, this.start, this.end);

  final String? id;
  final int start;
  final int end;

  @override
  bool operator ==(Object other) => other is Slice && other.id == id && other.start == start && other.end == end;
  @override
  int get hashCode => Object.hash(id, start, end);
  @override
  String toString() => '${id ?? 'idle'}[$start-$end]';
}

class ProcResult {
  const ProcResult(this.proc, this.completion, this.firstRun);

  final Proc proc;
  final int completion;
  final int firstRun;

  int get turnaround => completion - proc.arrival;
  int get waiting => turnaround - proc.burst;
  int get response => firstRun - proc.arrival;
}

class Schedule {
  const Schedule(this.gantt, this.results);

  final List<Slice> gantt;

  /// In the order the processes were given.
  final List<ProcResult> results;

  double _avg(int Function(ProcResult) f) => results.isEmpty ? 0 : results.map(f).reduce((a, b) => a + b) / results.length;
  double get avgWaiting => _avg((r) => r.waiting);
  double get avgTurnaround => _avg((r) => r.turnaround);
  double get avgResponse => _avg((r) => r.response);
}

/// Schedules [procs] by [algo] ([quantum] for round robin). Ties go to the earlier arrival,
/// then the order given.
Schedule schedule(List<Proc> procs, Sched algo, {int quantum = 2}) {
  final n = procs.length;
  final left = [for (final p in procs) p.burst];
  final first = List<int?>.filled(n, null);
  final done = List<int?>.filled(n, null);
  final gantt = <Slice>[];
  var t = 0;

  void run(int? i, int until) {
    if (until <= t) return;
    final id = i == null ? null : procs[i].id;
    if (gantt.isNotEmpty && gantt.last.id == id && gantt.last.end == t) {
      gantt[gantt.length - 1] = Slice(id, gantt.last.start, until);
    } else {
      gantt.add(Slice(id, t, until));
    }
    if (i != null) {
      first[i] ??= t;
      left[i] -= until - t;
      if (left[i] == 0) done[i] = until;
    }
    t = until;
  }

  int? nextArrival() {
    int? a;
    for (var i = 0; i < n; i++) {
      if (left[i] > 0 && procs[i].arrival > t && (a == null || procs[i].arrival < a)) a = procs[i].arrival;
    }
    return a;
  }

  List<int> ready() => [for (var i = 0; i < n; i++) if (left[i] > 0 && procs[i].arrival <= t) i];

  int pick(List<int> r, int Function(int) key) {
    var best = r.first;
    for (final i in r.skip(1)) {
      final a = key(i), b = key(best);
      if (a < b || (a == b && procs[i].arrival < procs[best].arrival)) best = i;
    }
    return best;
  }

  if (algo == Sched.roundRobin) {
    // The ready queue: arrivals join before a process that used up its quantum.
    final order = List.generate(n, (i) => i)..sort((a, b) => procs[a].arrival.compareTo(procs[b].arrival));
    final queue = <int>[];
    var next = 0;
    void admit() {
      while (next < n && procs[order[next]].arrival <= t) {
        queue.add(order[next++]);
      }
    }

    while (done.contains(null)) {
      admit();
      if (queue.isEmpty) {
        run(null, procs[order[next]].arrival);
        continue;
      }
      final i = queue.removeAt(0);
      run(i, t + (left[i] < quantum ? left[i] : quantum));
      admit();
      if (left[i] > 0) queue.add(i);
    }
  } else {
    final preemptive = algo == Sched.srtf || algo == Sched.priorityPreemptive;
    while (done.contains(null)) {
      final r = ready();
      if (r.isEmpty) {
        run(null, nextArrival()!);
        continue;
      }
      final i = switch (algo) {
        Sched.fcfs => pick(r, (i) => procs[i].arrival),
        Sched.sjf => pick(r, (i) => procs[i].burst),
        Sched.srtf => pick(r, (i) => left[i]),
        Sched.priority || Sched.priorityPreemptive => pick(r, (i) => procs[i].priority),
        Sched.roundRobin => throw StateError('unreachable'),
      };
      // Pre-emptive: run until the next arrival, then choose again.
      final na = nextArrival();
      run(i, preemptive && na != null && na < t + left[i] ? na : t + left[i]);
    }
  }
  return Schedule(gantt, [for (var i = 0; i < n; i++) ProcResult(procs[i], done[i]!, first[i]!)]);
}

// --- Page replacement ---------------------------------------------------------------------

enum PageAlgo { fifo, lru, optimal }

class PageStep {
  const PageStep(this.page, this.frames, {required this.hit, this.victim});

  final int page;

  /// The frames after this reference (null = empty frame), in frame order.
  final List<int?> frames;
  final bool hit;
  final int? victim;
}

/// Each reference in [refs] with [frameCount] frames.
List<PageStep> pageReplacement(List<int> refs, int frameCount, PageAlgo algo) {
  final frames = List<int?>.filled(frameCount, null);
  final loadedAt = <int, int>{}, usedAt = <int, int>{};
  final out = <PageStep>[];
  for (var t = 0; t < refs.length; t++) {
    final p = refs[t];
    if (frames.contains(p)) {
      usedAt[p] = t;
      out.add(PageStep(p, List.of(frames), hit: true));
      continue;
    }
    var slot = frames.indexOf(null);
    int? victim;
    if (slot < 0) {
      int score(int q) => switch (algo) {
        PageAlgo.fifo => loadedAt[q]!,
        PageAlgo.lru => usedAt[q]!,
        // The page used furthest in the future (never again = furthest of all).
        PageAlgo.optimal => -(() {
          final i = refs.indexOf(q, t + 1);
          return i < 0 ? 1 << 30 : i;
        }()),
      };
      slot = 0;
      for (var k = 1; k < frameCount; k++) {
        if (score(frames[k]!) < score(frames[slot]!)) slot = k;
      }
      victim = frames[slot];
    }
    frames[slot] = p;
    loadedAt[p] = t;
    usedAt[p] = t;
    out.add(PageStep(p, List.of(frames), hit: false, victim: victim));
  }
  return out;
}

// --- Banker's algorithm -------------------------------------------------------------------

class BankerStep {
  const BankerStep(this.process, this.workBefore, this.workAfter);

  final int process;
  final List<int> workBefore;
  final List<int> workAfter;
}

class BankerResult {
  const BankerResult(this.need, this.steps, this.safe);

  final List<List<int>> need;

  /// The processes in the order they can finish.
  final List<BankerStep> steps;
  final bool safe;

  List<int> get sequence => [for (final s in steps) s.process];
}

/// Is the state safe? Scans P0, P1, … repeatedly for a process whose need fits in work.
BankerResult banker({required List<List<int>> allocation, required List<List<int>> max, required List<int> available}) {
  final n = allocation.length, m = available.length;
  final need = [for (var i = 0; i < n; i++) [for (var j = 0; j < m; j++) max[i][j] - allocation[i][j]]];
  var work = List.of(available);
  final finished = List.filled(n, false);
  final steps = <BankerStep>[];
  var progress = true;
  while (progress) {
    progress = false;
    for (var i = 0; i < n; i++) {
      if (finished[i]) continue;
      if ([for (var j = 0; j < m; j++) need[i][j] <= work[j]].every((b) => b)) {
        final after = [for (var j = 0; j < m; j++) work[j] + allocation[i][j]];
        steps.add(BankerStep(i, work, after));
        work = after;
        finished[i] = true;
        progress = true;
      }
    }
  }
  return BankerResult(need, steps, finished.every((f) => f));
}

/// Can [process]'s [request] be granted now? Null when it can (the state stays safe), else the
/// CsStrings key saying why not.
String? bankerRequest({required List<List<int>> allocation, required List<List<int>> max, required List<int> available, required int process, required List<int> request}) {
  final m = available.length;
  for (var j = 0; j < m; j++) {
    if (request[j] > max[process][j] - allocation[process][j]) return 'bankerExceedsNeed';
    if (request[j] > available[j]) return 'bankerMustWait';
  }
  final alloc = [for (final (i, row) in allocation.indexed) [for (var j = 0; j < m; j++) row[j] + (i == process ? request[j] : 0)]];
  final avail = [for (var j = 0; j < m; j++) available[j] - request[j]];
  return banker(allocation: alloc, max: max, available: avail).safe ? null : 'bankerUnsafe';
}
