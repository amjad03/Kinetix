import 'frames.dart';

enum SortAlgo { bubble, insertion, selection, merge, quick, heap }

enum SearchAlgo { linear, binary }

/// The steps of sorting [input] ascending with [algo]. The last frame shows the sorted array.
List<AlgoFrame> sortSteps(SortAlgo algo, List<int> input) {
  final s = _Sorter(List.of(input));
  s.add({}, const Say('sortStart'));
  switch (algo) {
    case SortAlgo.bubble:
      s.bubble();
    case SortAlgo.insertion:
      s.insertion();
    case SortAlgo.selection:
      s.selection();
    case SortAlgo.merge:
      s.mergeSort(0, s.a.length);
    case SortAlgo.quick:
      s.quick(0, s.a.length - 1);
    case SortAlgo.heap:
      s.heap();
  }
  s.sorted.clear();
  s.add({for (var i = 0; i < s.a.length; i++) i: Mark.sorted}, Say('sortDone', [s.comparisons, s.swaps]));
  return s.frames;
}

class _Sorter {
  _Sorter(this.a);

  final List<int> a;
  final frames = <AlgoFrame>[];
  final sorted = <int>{};
  int comparisons = 0, swaps = 0;

  void add(Map<int, Mark> marks, Say say, {Map<String, int> pointers = const {}, (int, int)? split}) {
    frames.add(AlgoFrame(ArrayView(List.of(a), marks: {for (final i in sorted) i: Mark.sorted, ...marks}, pointers: pointers, split: split), say));
  }

  bool less(int i, int j, {Map<String, int> pointers = const {}}) {
    comparisons++;
    add({i: Mark.compare, j: Mark.compare}, Say('compare', [a[i], a[j]]), pointers: pointers);
    return a[i] < a[j];
  }

  void swap(int i, int j, {Map<String, int> pointers = const {}}) {
    if (i == j) return;
    swaps++;
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
    add({i: Mark.swap, j: Mark.swap}, Say('swap', [a[j], a[i]]), pointers: pointers);
  }

  void bubble() {
    final n = a.length;
    for (var pass = 0; pass < n - 1; pass++) {
      var swapped = false;
      for (var j = 0; j < n - 1 - pass; j++) {
        if (less(j + 1, j, pointers: {'j': j})) {
          swap(j, j + 1, pointers: {'j': j});
          swapped = true;
        }
      }
      sorted.add(n - 1 - pass);
      add({}, Say('inPlace', [a[n - 1 - pass]]));
      if (!swapped) {
        // No swaps in a pass: the rest is already in order.
        for (var k = 0; k < n; k++) {
          sorted.add(k);
        }
        add({}, const Say('noSwaps'));
        return;
      }
    }
    sorted.add(0);
  }

  void insertion() {
    for (var i = 1; i < a.length; i++) {
      add({i: Mark.active}, Say('pickKey', [a[i]]), pointers: {'i': i});
      var j = i;
      while (j > 0 && less(j, j - 1, pointers: {'i': i, 'j': j})) {
        swap(j, j - 1, pointers: {'i': i, 'j': j - 1});
        j--;
      }
    }
  }

  void selection() {
    final n = a.length;
    for (var i = 0; i < n - 1; i++) {
      var min = i;
      for (var j = i + 1; j < n; j++) {
        if (less(j, min, pointers: {'i': i, 'min': min, 'j': j})) {
          min = j;
          add({min: Mark.pivot}, Say('newMin', [a[min]]), pointers: {'i': i, 'min': min});
        }
      }
      swap(i, min, pointers: {'i': i, 'min': min});
      sorted.add(i);
    }
    sorted.add(n - 1);
  }

  void mergeSort(int lo, int hi) {
    if (hi - lo < 2) return;
    final mid = (lo + hi) ~/ 2;
    add({}, Say('split', [lo, hi - 1]), split: (lo, hi));
    mergeSort(lo, mid);
    mergeSort(mid, hi);
    final left = a.sublist(lo, mid), right = a.sublist(mid, hi);
    var i = 0, j = 0, k = lo;
    while (i < left.length && j < right.length) {
      comparisons++;
      if (left[i] <= right[j]) {
        a[k++] = left[i++];
      } else {
        a[k++] = right[j++];
      }
      // What is left of both halves waits after the merged part (nothing is lost on screen).
      a.setRange(k, hi, [...left.sublist(i), ...right.sublist(j)]);
      add({k - 1: Mark.active}, Say('mergeTake', [a[k - 1]]), split: (lo, hi));
    }
    while (i < left.length) {
      a[k++] = left[i++];
    }
    while (j < right.length) {
      a[k++] = right[j++];
    }
    add({for (var x = lo; x < hi; x++) x: Mark.active}, Say('merged', [lo, hi - 1]), split: (lo, hi));
  }

  /// Lomuto partition, the last item as pivot.
  void quick(int lo, int hi) {
    if (lo > hi) return;
    if (lo == hi) {
      sorted.add(lo);
      return;
    }
    final pivot = a[hi];
    add({hi: Mark.pivot}, Say('pivot', [pivot]), pointers: {'lo': lo, 'hi': hi});
    var i = lo;
    for (var j = lo; j < hi; j++) {
      comparisons++;
      add({hi: Mark.pivot, j: Mark.compare}, Say('compare', [a[j], pivot]), pointers: {'i': i, 'j': j});
      if (a[j] < pivot) {
        swap(i, j, pointers: {'i': i, 'j': j});
        i++;
      }
    }
    swap(i, hi, pointers: {'i': i});
    sorted.add(i);
    add({i: Mark.sorted}, Say('pivotPlaced', [pivot]));
    quick(lo, i - 1);
    quick(i + 1, hi);
  }

  void heap() {
    final n = a.length;
    add({}, const Say('buildHeap'));
    for (var i = n ~/ 2 - 1; i >= 0; i--) {
      sift(i, n);
    }
    for (var end = n - 1; end > 0; end--) {
      swap(0, end);
      sorted.add(end);
      add({}, Say('inPlace', [a[end]]));
      sift(0, end);
    }
    sorted.add(0);
  }

  void sift(int i, int n) {
    while (true) {
      final l = 2 * i + 1, r = l + 1;
      var big = i;
      if (l < n && less(big, l)) big = l;
      if (r < n && less(big, r)) big = r;
      if (big == i) return;
      swap(i, big);
      i = big;
    }
  }
}

/// The steps of looking for [target] in [input] (binary search sorts it first). The last
/// frame marks the found item or says it is not there.
List<AlgoFrame> searchSteps(SearchAlgo algo, List<int> input, int target) {
  final a = algo == SearchAlgo.binary ? (List.of(input)..sort()) : List.of(input);
  final out = <AlgoFrame>[];
  void add(Map<int, Mark> m, Say s, [Map<String, int> p = const {}]) => out.add(AlgoFrame(ArrayView(a, marks: m, pointers: p, bars: false), s));
  add({}, Say(algo == SearchAlgo.binary ? 'binaryStart' : 'linearStart', [target]));
  if (algo == SearchAlgo.linear) {
    for (var i = 0; i < a.length; i++) {
      add({i: Mark.compare, for (var k = 0; k < i; k++) k: Mark.dim}, Say('compare', [a[i], target]), {'i': i});
      if (a[i] == target) {
        add({i: Mark.found}, Say('found', [target, i]), {'i': i});
        return out;
      }
    }
  } else {
    var lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      final mid = (lo + hi) ~/ 2;
      final dim = {for (var k = 0; k < a.length; k++) if (k < lo || k > hi) k: Mark.dim};
      add({...dim, mid: Mark.compare}, Say('compare', [a[mid], target]), {'lo': lo, 'mid': mid, 'hi': hi});
      if (a[mid] == target) {
        add({...dim, mid: Mark.found}, Say('found', [target, mid]), {'mid': mid});
        return out;
      }
      if (a[mid] < target) {
        lo = mid + 1;
        add(dim, Say('goRight', [a[mid]]), {'lo': lo, 'hi': hi});
      } else {
        hi = mid - 1;
        add(dim, Say('goLeft', [a[mid]]), {'lo': lo, 'hi': hi});
      }
    }
  }
  add({for (var k = 0; k < a.length; k++) k: Mark.dim}, Say('notFound', [target]));
  return out;
}

/// The array as it ends after [frames] (for tests and for the board).
List<int> finalValues(List<AlgoFrame> frames) => (frames.last.view as ArrayView).values;
