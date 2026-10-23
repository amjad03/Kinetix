import '../search/fuzzy.dart';

/// One label → asset index for the AI pen's suggestion row: what a sketch or a written word
/// could become on the board (a library picture, a live diagram, an animation, a 3D model),
/// matched by title and keywords with synonyms (engineering terms included), typos forgiven.

/// What a suggested asset is, in the order they are preferred when they match alike.
enum InkAssetKind { picture, diagram, model3d, animation }

/// Something on the board's shelves a drawing can turn into.
class InkAsset {
  InkAsset({required this.kind, required this.id, required this.title, this.keywords = const [], this.thumb, this.payload});

  final InkAssetKind kind;

  /// Unique within [kind]: the catalogue id.
  final String id;
  final String title;
  final List<String> keywords;

  /// A bundled thumbnail (asset path), when there is one.
  final String? thumb;

  /// What placing it needs (the picture, the diagram's builder...).
  final Object? payload;

  late final SearchTarget target = SearchTarget([SearchField(title), for (final k in keywords) SearchField(k, 0.7)]);

  @override
  String toString() => '${kind.name}:$id';
}

class InkAssetMatch {
  const InkAssetMatch(this.asset, this.score, this.label);
  final InkAsset asset;
  final double score;

  /// The label (or synonym) it matched.
  final String label;
}

/// Words that name the same thing on a classroom board: a drawing labelled "heart" also finds
/// "cardiac" and the circulation animation; "resistor" finds the RLC circuit. Every word of a
/// group finds the others.
const inkSynonymGroups = <List<String>>[
  // Biology
  ['heart', 'cardiac', 'human heart', 'circulation'],
  ['lungs', 'lung', 'breathing', 'respiratory system'],
  ['brain', 'nervous system', 'neuron', 'nerve impulse'],
  ['stomach', 'digestion', 'digestive system', 'intestine'],
  ['kidney', 'excretion', 'nephron'],
  ['eye', 'human eye', 'vision'],
  ['ear', 'human ear', 'hearing'],
  ['tooth', 'teeth', 'dental'],
  ['skeleton', 'bones', 'skull'],
  ['cell', 'animal cell', 'plant cell', 'organelles'],
  ['dna', 'double helix', 'dna replication', 'gene'],
  ['leaf', 'plant', 'tree', 'photosynthesis'],
  ['flower', 'pollination', 'reproduction in plants'],
  ['mushroom', 'fungi'],
  ['virus', 'bacteria', 'microbe'],
  // Earth and space
  ['sun', 'solar system', 'star'],
  ['moon', 'moon phases', 'eclipse'],
  ['earth', 'globe', 'world', 'planet'],
  ['cloud', 'rain', 'water cycle'],
  ['mountain', 'volcano', 'landform'],
  ['ocean', 'sea', 'wave', 'tide'],
  ['lightning', 'thunder', 'static electricity'],
  // Physics
  ['magnet', 'magnetic field', 'bar magnet'],
  ['lens', 'convex lens', 'concave lens', 'optics'],
  ['prism', 'refraction', 'dispersion'],
  ['mirror', 'reflection', 'plane mirror'],
  ['spring', 'oscillation', 'shm', 'pendulum'],
  ['pulley', 'simple machine', 'lever'],
  ['gear', 'gears', 'mechanism', 'machine'],
  ['atom', 'atomic structure', 'bohr model', 'electron'],
  ['sine wave', 'wave', 'waveform', 'signal', 'sine'],
  ['square wave', 'pulse', 'clock signal', 'pwm'],
  // Electrical and electronics engineering
  ['resistor', 'resistance', 'rlc circuit', 'ohm'],
  ['capacitor', 'capacitance', 'rc circuit'],
  ['inductor', 'coil', 'inductance', 'rl circuit'],
  ['battery', 'cell', 'dc source', 'voltage source'],
  ['light bulb', 'bulb', 'lamp', 'electric circuit', 'circuit'],
  ['transformer', 'single line diagram', 'power system'],
  ['generator', 'dynamo', 'motor', 'alternator'],
  ['three phase', 'star connection', 'delta connection'],
  ['diode', 'rectifier', 'pn junction'],
  ['transistor', 'bjt', 'amplifier'],
  ['and gate', 'logic gate', 'logic circuit', 'digital'],
  ['or gate', 'logic gate', 'logic circuit'],
  ['not gate', 'inverter', 'logic gate'],
  ['nand gate', 'universal gate', 'logic gate'],
  ['nor gate', 'universal gate', 'logic gate'],
  ['xor gate', 'exclusive or', 'logic gate'],
  ['adder', 'half adder', 'full adder'],
  ['flip flop', 'latch', 'sr flip flop', 'd flip flop'],
  ['multiplexer', 'mux', 'selector'],
  ['bode plot', 'frequency response', 'filter'],
  ['timing diagram', 'clock', 'waveforms'],
  // Mechanical, civil and chemical engineering
  ['beam', 'simply supported beam', 'cantilever', 'shear force', 'bending moment'],
  ['truss', 'bridge', 'frame'],
  ['free body diagram', 'fbd', 'incline', 'block', 'forces'],
  ['engine', 'otto cycle', 'thermodynamic cycle', 'pv diagram'],
  ['pump', 'compressor', 'process flow diagram', 'pfd'],
  ['valve', 'process flow diagram', 'pipe'],
  ['distillation column', 'column', 'distillation', 'tower'],
  ['heat exchanger', 'shell and tube', 'condenser'],
  ['reactor', 'cstr', 'pfr'],
  ['building', 'house', 'structure'],
  ['car', 'vehicle', 'electric vehicle', 'ev'],
  ['plug', 'charger', 'ev charging', 'socket'],
  // Chemistry
  ['benzene', 'benzene ring', 'hexagon', 'aromatic'],
  ['molecule', 'water molecule', 'h2o', 'bond'],
  ['beaker', 'flask', 'test tube', 'lab apparatus'],
  ['periodic table', 'elements'],
  // Computer science
  ['flowchart', 'flow chart', 'decision', 'diamond', 'algorithm'],
  ['database', 'er diagram', 'entity relationship', 'schema', 'table'],
  ['class diagram', 'uml', 'object oriented'],
  ['sequence diagram', 'messages', 'lifeline'],
  ['state machine', 'automaton', 'dfa', 'nfa', 'state diagram'],
  ['neural network', 'neurons', 'deep learning', 'nn'],
  ['computer', 'laptop', 'cpu', 'von neumann'],
  ['network', 'router', 'internet'],
  // Maths
  ['triangle', 'right triangle', 'geometry'],
  ['circle', 'radius', 'geometry'],
  ['cube', 'cuboid', 'box', 'solid'],
  ['cylinder', 'can', 'solid'],
  ['cone', 'ice cream cone', 'solid'],
  ['sphere', 'ball', 'globe'],
  ['pyramid', 'tetrahedron', 'solid'],
  ['graph', 'axes', 'plot', 'chart'],
  ['bar chart', 'histogram', 'chart'],
  ['pie chart', 'pie', 'chart'],
  ['map', 'india', 'india map'],
];

final Map<String, Set<String>> _synonyms = () {
  final out = <String, Set<String>>{};
  for (final g in inkSynonymGroups) {
    for (final w in g) {
      out.putIfAbsent(normalizeSearch(w), () => {}).addAll(g.map(normalizeSearch).where((x) => x != normalizeSearch(w)));
    }
  }
  return out;
}();

/// Other words for [label] (normalised), from [inkSynonymGroups]; empty when it has none.
List<String> inkSynonyms(String label) => [...?_synonyms[normalizeSearch(label)]];

class InkAssetIndex {
  InkAssetIndex(Iterable<InkAsset> assets) : assets = List.unmodifiable(assets);

  final List<InkAsset> assets;

  /// The assets for a reading's [labels] (most likely first), best first: each asset scores its
  /// best match of any label or its synonyms, a label further down the list and a synonym
  /// counting less. At most [perKind] of a kind, so the row mixes pictures, diagrams, models and
  /// animations; below [minScore] is no match.
  List<InkAssetMatch> rank(Iterable<String> labels, {int max = 6, int perKind = 2, double minScore = 60}) {
    final best = <InkAsset, InkAssetMatch>{};
    var rank = 0;
    for (final label in labels) {
      final l = normalizeSearch(label);
      if (l.isEmpty) continue;
      final weight = 1 / (1 + 0.3 * rank++);
      final terms = [(l, 1.0), for (final s in inkSynonyms(l)) (s, 0.8)];
      for (final a in assets) {
        for (final (t, f) in terms) {
          final s = a.target.score(t) * weight * f;
          if (s >= minScore && s > (best[a]?.score ?? 0)) best[a] = InkAssetMatch(a, s, t);
        }
      }
    }
    final sorted = best.values.toList()
      ..sort((a, b) {
        final d = b.score.compareTo(a.score);
        return d != 0 ? d : a.asset.kind.index.compareTo(b.asset.kind.index);
      });
    final counts = <InkAssetKind, int>{};
    final out = <InkAssetMatch>[];
    for (final m in sorted) {
      final n = counts[m.asset.kind] ?? 0;
      if (n >= perKind) continue;
      counts[m.asset.kind] = n + 1;
      out.add(m);
      if (out.length == max) break;
    }
    return out;
  }
}
