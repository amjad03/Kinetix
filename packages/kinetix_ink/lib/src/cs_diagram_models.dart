import 'dart:math' as math;
import 'dart:ui' show Offset, Rect, Size;

// The figures behind the computer science diagram panels (KitElement, KitKind.csDiagram): UML
// class, use-case, sequence, activity and state diagrams, ER diagrams, relational schemas and
// finite automata (DFA / NFA, with a string run through them). A diagram is kept as a short text
// the teacher can type (PlantUML-like, as in the textbooks) plus where each box was dragged to, so
// it saves small, reopens to edit and is redrawn exactly. Pure Dart.

String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
int _i(Object? v, [int fallback = 0]) => v is num ? v.round() : fallback;

enum CsDiagramType { classes, useCase, sequence, activity, state, er, schema, automaton }

/// A box, circle or diamond of a diagram. [kind] is one of the kinds below; [lines] are a class's
/// attributes, a table's columns; [methods] a class's operations.
class DiagramNode {
  DiagramNode(this.id, this.kind, {String? label, List<String>? lines, List<String>? methods, this.owner})
    : label = label ?? id,
      lines = lines ?? [],
      methods = methods ?? [];

  final String id;
  String kind;
  String label;
  final List<String> lines;
  final List<String> methods;

  /// An ER attribute's entity or relationship.
  final String? owner;

  bool get isAttribute => const {'attribute', 'key', 'partial', 'multi', 'derived'}.contains(kind);
}

/// A line between two nodes. [kind]: line, arrow, dashed (open arrow), inherit, realize, compose,
/// aggregate, double (ER total participation). [fromMul] / [toMul]: multiplicities at the ends.
class DiagramEdge {
  DiagramEdge(this.from, this.to, this.kind, {this.label = '', this.fromMul = '', this.toMul = ''});

  final String from;
  final String to;
  final String kind;
  final String label;
  final String fromMul;
  final String toMul;
}

/// A diagram read from its text.
class ParsedDiagram {
  ParsedDiagram(this.type);

  final CsDiagramType type;
  final nodes = <String, DiagramNode>{};
  final edges = <DiagramEdge>[];
  String system = '';
  String? start;
  final accepts = <String>{};

  List<DiagramNode> get boxes => nodes.values.toList();
}

const _arrows = <String, (String, bool)>{
  '--|>': ('inherit', false),
  '<|--': ('inherit', true),
  '..|>': ('realize', false),
  '<|..': ('realize', true),
  '*--': ('compose', false),
  '--*': ('compose', true),
  'o--': ('aggregate', false),
  '--o': ('aggregate', true),
  '-->': ('arrow', false),
  '->': ('arrow', false),
  '<--': ('arrow', true),
  '<-': ('arrow', true),
  '..>': ('dashed', false),
  '<..': ('dashed', true),
  '==': ('double', false),
  '--': ('line', false),
  '..': ('dotted', false),
};

final _edgeRe = RegExp(
  r'^(.+?)\s+(?:"([^"]*)"\s+)?(' +
      (_arrows.keys.toList()..sort((a, b) => b.length.compareTo(a.length))).map(RegExp.escape).join('|') +
      r')\s+(?:"([^"]*)"\s+)?(.+?)(?:\s*:\s*(.*))?$',
);

/// The node kind a name used only in an edge gets.
String _defaultKind(CsDiagramType t) => switch (t) {
  CsDiagramType.classes => 'class',
  CsDiagramType.useCase => 'usecase',
  CsDiagramType.sequence => 'participant',
  CsDiagramType.activity => 'action',
  CsDiagramType.state || CsDiagramType.automaton => 'state',
  CsDiagramType.er => 'entity',
  CsDiagramType.schema => 'table',
};

/// Reads a diagram's text. Unknown lines are skipped (the editor shows them as they are).
ParsedDiagram parseDiagram(CsDiagramType type, String spec) {
  final d = ParsedDiagram(type);
  DiagramNode? block;
  DiagramNode node(String id, String kind, {String? owner}) => d.nodes.putIfAbsent(id, () => DiagramNode(id, kind, owner: owner));
  String endpoint(String name, {required bool source}) {
    final n = name.trim();
    if (n == '[*]' && (type == CsDiagramType.state || type == CsDiagramType.activity)) {
      final id = source ? '[*]' : '[*]end';
      node(id, source ? 'initial' : 'final').label = '';
      return id;
    }
    if (!d.nodes.containsKey(n)) node(n, _defaultKind(type));
    return n;
  }

  for (final raw in spec.split('\n')) {
    if (raw.trim().isEmpty || raw.trim().startsWith('//') || raw.trim().startsWith("'")) continue;
    final indented = raw.startsWith(' ') || raw.startsWith('\t');
    final line = raw.trim();
    if (indented && block != null) {
      _member(d, block, line, node);
      continue;
    }
    block = null;
    final em = _edgeRe.firstMatch(line);
    final words = line.split(RegExp(r'\s+'));
    final head = words.first.toLowerCase();
    if (em != null && !const {'class', 'interface', 'enum', 'abstract', 'entity', 'weak', 'table', 'state', 'action', 'usecase', 'actor'}.contains(head)) {
      final (kind, reversed) = _arrows[em[3]!]!;
      final a = endpoint(em[1]!, source: !reversed), b = endpoint(em[5]!, source: reversed);
      d.edges.add(reversed
          ? DiagramEdge(b, a, kind, label: em[6]?.trim() ?? '', fromMul: em[4] ?? '', toMul: em[2] ?? '')
          : DiagramEdge(a, b, kind, label: em[6]?.trim() ?? '', fromMul: em[2] ?? '', toMul: em[4] ?? ''));
      continue;
    }
    String rest([int skip = 1]) => words.skip(skip).join(' ').trim();
    switch (head) {
      case 'class' || 'interface' || 'enum':
        block = node(rest(), head == 'class' ? 'class' : head)..kind = head == 'class' ? 'class' : head;
      case 'abstract':
        final name = words.length > 1 && words[1].toLowerCase() == 'class' ? rest(2) : rest();
        block = node(name, 'abstract')..kind = 'abstract';
      case 'actor':
        node(rest(), 'actor').kind = 'actor';
      case 'usecase':
        block = node(rest(), 'usecase')..kind = 'usecase';
      case 'system':
        d.system = rest();
      case 'participant' || 'object':
        node(rest(), 'participant').kind = 'participant';
      case 'start' when type == CsDiagramType.automaton:
        d.start = rest();
        node(d.start!, 'state');
      case 'accept' || 'final' when type == CsDiagramType.automaton:
        for (final s in words.skip(1)) {
          d.accepts.add(s.replaceAll(',', ''));
          node(s.replaceAll(',', ''), 'state');
        }
      case 'start':
        node('[*]', 'initial').label = '';
      case 'end' || 'stop':
        node('[*]end', 'final').label = '';
      case 'action' || 'activity':
        node(rest(), 'action').kind = 'action';
      case 'decision' || 'if':
        node(rest(), 'decision').kind = 'decision';
      case 'fork' || 'join':
        node(rest(), 'fork').kind = 'fork';
      case 'state':
        block = node(rest(), 'state')..kind = 'state';
      case 'entity':
        block = node(rest(), 'entity')..kind = 'entity';
      case 'weak':
        final name = words.length > 1 && words[1].toLowerCase() == 'entity' ? rest(2) : rest();
        block = node(name, 'weak')..kind = 'weak';
      case 'relationship' || 'rel':
        block = node(rest(), 'relationship')..kind = 'relationship';
      case 'identifying':
        final name = words.length > 1 && words[1].toLowerCase().startsWith('rel') ? rest(2) : rest();
        block = node(name, 'idrel')..kind = 'idrel';
      case 'table':
        block = node(rest(), 'table')..kind = 'table';
    }
  }
  if (type == CsDiagramType.automaton) {
    if (d.start == null && d.nodes.isNotEmpty) d.start = d.nodes.keys.first;
    for (final n in d.nodes.values) {
      n.kind = 'astate';
    }
  }
  // A table's foreign keys are its edges.
  if (type == CsDiagramType.schema) {
    for (final t in d.nodes.values.toList()) {
      for (final c in t.lines) {
        final fk = schemaColumn(c).ref;
        if (fk == null) continue;
        final target = fk.split('.').first;
        if (target.isNotEmpty) {
          endpoint(target, source: false);
          d.edges.add(DiagramEdge(t.id, target, 'arrow', label: schemaColumn(c).name));
        }
      }
    }
  }
  return d;
}

void _member(ParsedDiagram d, DiagramNode block, String line, DiagramNode Function(String, String, {String? owner}) node) {
  switch (block.kind) {
    case 'entity' || 'weak' || 'relationship' || 'idrel':
      final (kind, name) = erAttribute(line);
      final a = node('${block.id}.$name', kind, owner: block.id)..label = name;
      a.kind = kind;
      d.edges.add(DiagramEdge(block.id, a.id, 'line'));
    case 'class' || 'abstract' || 'interface' || 'enum':
      if (line == '--') return;
      (line.contains('(') ? block.methods : block.lines).add(line);
    default:
      block.lines.add(line);
  }
}

/// An ER attribute line: `*roll_no` key, `~name` partial key, `{phone}` multivalued, `/age`
/// derived, else a plain attribute.
(String, String) erAttribute(String line) {
  final l = line.trim();
  if (l.startsWith('*')) return ('key', l.substring(1).trim());
  if (l.startsWith('~')) return ('partial', l.substring(1).trim());
  if (l.startsWith('/')) return ('derived', l.substring(1).trim());
  if (l.startsWith('{') && l.endsWith('}')) return ('multi', l.substring(1, l.length - 1).trim());
  return ('attribute', l);
}

/// A schema column line: `*usn TEXT`, `dept_id INTEGER -> department.dept_id`.
({String name, String type, bool pk, String? ref}) schemaColumn(String line) {
  var l = line.trim();
  String? ref;
  final arrow = l.indexOf('->');
  if (arrow >= 0) {
    ref = l.substring(arrow + 2).trim();
    l = l.substring(0, arrow).trim();
  }
  final pk = l.startsWith('*');
  if (pk) l = l.substring(1).trim();
  final parts = l.split(RegExp(r'\s+'));
  return (name: parts.first, type: parts.length > 1 ? parts.skip(1).join(' ') : 'TEXT', pk: pk, ref: ref);
}

// --- Sizes and layout --------------------------------------------------------------------------

/// About how wide [text] is at 18 px.
double diagramTextWidth(String text, [double size = 18]) => text.runes.length * size * 0.56;

Size diagramNodeSize(DiagramNode n) {
  double fit(Iterable<String> texts, double min, double pad) => math.max(min, texts.fold(0.0, (m, t) => math.max(m, diagramTextWidth(t))) + pad);
  return switch (n.kind) {
    'class' || 'abstract' || 'interface' || 'enum' => Size(
      fit([n.label, ...n.lines, ...n.methods], 150, 28),
      38 + (n.kind == 'interface' || n.kind == 'enum' || n.kind == 'abstract' ? 20 : 0) + math.max(1, n.lines.length) * 24 + 10 + math.max(1, n.methods.length) * 24 + 10,
    ),
    'table' => Size(fit([n.label, ...n.lines.map((c) => '${schemaColumn(c).name} ${schemaColumn(c).type}  →')], 170, 28), 40 + math.max(1, n.lines.length) * 28 + 8),
    'actor' => Size(math.max(80, diagramTextWidth(n.label) + 10), 116),
    'usecase' => Size(fit([n.label], 150, 48), 66),
    'participant' => Size(fit([n.label], 120, 32), 50),
    'initial' => const Size(30, 30),
    'final' => const Size(36, 36),
    'decision' => Size(fit([n.label], 110, 60), 76),
    'fork' => const Size(180, 12),
    'relationship' || 'idrel' => Size(fit([n.label], 130, 66), 76),
    'attribute' || 'key' || 'partial' || 'multi' || 'derived' => Size(fit([n.label], 96, 36), 46),
    'astate' => Size.square(math.max(60, diagramTextWidth(n.label) + 24)),
    _ => Size(fit([n.label], 120, 32), 54),
  };
}

/// Where each node's centre goes on a panel of [size]: its dragged place from [pos], else an
/// automatic place for the diagram type.
Map<String, Offset> layoutDiagram(ParsedDiagram d, Map<String, Offset> pos, Size size) {
  final out = <String, Offset>{};
  final free = [for (final n in d.nodes.values) if (!pos.containsKey(n.id) && !n.isAttribute) n];
  const top = 110.0;
  final area = Rect.fromLTRB(80, top, size.width - 80, size.height - 60);
  switch (d.type) {
    case CsDiagramType.sequence:
      final people = d.nodes.values.toList();
      for (final (i, n) in people.indexed) {
        out[n.id] = Offset(area.left + 40 + (area.width - 80) * (people.length == 1 ? 0.5 : i / (people.length - 1)), top);
      }
      return {...out, for (final e in pos.entries) if (d.nodes.containsKey(e.key)) e.key: Offset(e.value.dx, top)};
    case CsDiagramType.useCase:
      final actors = free.where((n) => n.kind == 'actor').toList(), cases = free.where((n) => n.kind != 'actor').toList();
      for (final (i, a) in actors.indexed) {
        final left = i.isEven;
        final k = i ~/ 2, perSide = ((actors.length + 1) ~/ 2);
        out[a.id] = Offset(left ? area.left + 30 : area.right - 30, area.top + area.height * (k + 1) / (perSide + 1));
      }
      for (final (i, c) in cases.indexed) {
        final cols = cases.length > 5 ? 2 : 1;
        final rows = (cases.length / cols).ceil();
        out[c.id] = Offset(area.center.dx + (cols == 2 ? (i.isEven ? -150 : 150) : 0), area.top + 30 + (area.height - 60) * ((i ~/ cols) + 0.5) / rows);
      }
    case CsDiagramType.activity || CsDiagramType.state || CsDiagramType.automaton:
      // Layers along the flow: top to bottom (activity) or left to right.
      final layer = <String, int>{};
      final first = [
        if (d.start != null) d.start!,
        if (d.nodes.containsKey('[*]')) '[*]',
        ...d.nodes.keys.where((k) => !d.edges.any((e) => e.to == k && e.from != k)),
        if (d.nodes.isNotEmpty) d.nodes.keys.first,
      ];
      for (final f in first) {
        if (layer.containsKey(f)) continue;
        layer[f] = 0;
        final q = [f];
        for (var qi = 0; qi < q.length; qi++) {
          for (final e in d.edges.where((e) => e.from == q[qi])) {
            if (!layer.containsKey(e.to)) {
              layer[e.to] = layer[q[qi]]! + 1;
              q.add(e.to);
            }
          }
        }
      }
      for (final n in d.nodes.keys) {
        layer.putIfAbsent(n, () => 0);
      }
      final maxLayer = layer.values.fold(0, math.max);
      final byLayer = <int, List<String>>{};
      for (final n in d.nodes.keys) {
        (byLayer[layer[n]!] ??= []).add(n);
      }
      final vertical = d.type == CsDiagramType.activity;
      for (final MapEntry(key: l, value: ids) in byLayer.entries) {
        for (final (i, id) in ids.indexed) {
          final along = maxLayer == 0 ? 0.5 : l / maxLayer, across = (i + 1) / (ids.length + 1);
          out[id] = vertical
              ? Offset(area.left + area.width * across, area.top + 20 + (area.height - 40) * along)
              : Offset(area.left + 40 + (area.width - 80) * along, area.top + area.height * across);
        }
      }
    default:
      final cols = math.max(1, math.sqrt(free.length * area.width / area.height).ceil());
      final rows = math.max(1, (free.length / cols).ceil());
      for (final (i, n) in free.indexed) {
        out[n.id] = Offset(area.left + area.width * ((i % cols) + 0.5) / cols, area.top + area.height * ((i ~/ cols) + 0.5) / rows);
      }
  }
  out.addAll({for (final e in pos.entries) if (d.nodes.containsKey(e.key)) e.key: e.value});
  // ER attributes in a ring around their owner.
  final owners = <String, List<DiagramNode>>{};
  for (final n in d.nodes.values.where((n) => n.isAttribute && n.owner != null)) {
    (owners[n.owner!] ??= []).add(n);
  }
  for (final MapEntry(key: owner, value: attrs) in owners.entries) {
    final c = out[owner] ?? area.center;
    for (final (i, a) in attrs.indexed) {
      if (pos.containsKey(a.id)) {
        out[a.id] = pos[a.id]!;
        continue;
      }
      final angle = -math.pi / 2 + (attrs.length == 1 ? 0 : (i - (attrs.length - 1) / 2) * math.min(0.75, 2.6 / attrs.length));
      out[a.id] = c + Offset(math.cos(angle) * 170, math.sin(angle) * 110);
    }
  }
  return out;
}

/// The node under [p] (panel coordinates), or null.
String? diagramNodeAt(ParsedDiagram d, Map<String, Offset> layout, Offset p) {
  for (final n in d.nodes.values.toList().reversed) {
    final c = layout[n.id];
    if (c == null) continue;
    final s = diagramNodeSize(n);
    if (Rect.fromCenter(center: c, width: s.width + 12, height: s.height + 12).contains(p)) return n.id;
  }
  return null;
}

// --- Automata ------------------------------------------------------------------------------------

/// The symbols an edge label stands for: "0,1" → {0, 1}; ε or eps → ε.
List<String> transitionSymbols(String label) => [
  for (final s in label.split(RegExp(r'[,\s]+')).where((s) => s.isNotEmpty)) const {'eps', 'ε', 'epsilon', 'λ'}.contains(s.toLowerCase()) ? 'ε' : s,
];

/// A DFA has no ε moves and at most one move per state and symbol.
bool isDeterministic(ParsedDiagram d) {
  final seen = <String>{};
  for (final e in d.edges) {
    for (final s in transitionSymbols(e.label)) {
      if (s == 'ε' || !seen.add('${e.from}\u0000$s')) return false;
    }
  }
  return true;
}

Set<String> _closure(ParsedDiagram d, Set<String> states) {
  final out = {...states};
  final q = [...states];
  while (q.isNotEmpty) {
    final s = q.removeLast();
    for (final e in d.edges.where((e) => e.from == s && transitionSymbols(e.label).contains('ε'))) {
      if (out.add(e.to)) q.add(e.to);
    }
  }
  return out;
}

/// Running [input] through the automaton: the set of current states before any symbol and after
/// each one (ε-closed). An empty set means the machine is stuck (rejects).
List<Set<String>> runAutomaton(ParsedDiagram d, String input) {
  if (d.start == null) return [<String>{}];
  var cur = _closure(d, {d.start!});
  final out = [cur];
  for (final ch in input.runes.map(String.fromCharCode)) {
    final next = <String>{
      for (final e in d.edges)
        if (cur.contains(e.from) && transitionSymbols(e.label).contains(ch)) e.to,
    };
    cur = _closure(d, next);
    out.add(cur);
  }
  return out;
}

bool automatonAccepts(ParsedDiagram d, String input) => runAutomaton(d, input).last.any(d.accepts.contains);

// --- SQL from ER diagrams and schemas -------------------------------------------------------

String _ident(String s) => s.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9_]+'), '_').replaceAll(RegExp(r'^_+|_+$'), '');

String _type(String attr) {
  final a = attr.toLowerCase();
  if (RegExp(r'(^|_)(id|no|num|number|count|age|year|qty|quantity|credits)$').hasMatch(a)) return 'INTEGER';
  if (RegExp(r'(salary|amount|price|balance|fee|marks|cgpa|rate)').hasMatch(a)) return 'REAL';
  if (RegExp(r'(date|dob|_on$|_at$)').hasMatch(a)) return 'DATE';
  return 'TEXT';
}

/// CREATE TABLE statements for a relational schema diagram.
String schemaToSql(ParsedDiagram d) {
  final b = StringBuffer('-- Tables from the schema diagram\n');
  for (final t in d.nodes.values.where((n) => n.kind == 'table')) {
    final cols = t.lines.map(schemaColumn).toList();
    final pks = [for (final c in cols) if (c.pk) c.name];
    b.writeln('CREATE TABLE ${_ident(t.label)} (');
    final defs = <String>[
      for (final c in cols) '  ${c.name} ${c.type}${pks.length == 1 && c.pk ? ' PRIMARY KEY' : ''}${c.ref == null ? '' : ' REFERENCES ${_refSql(c.ref!)}'}',
      if (pks.length > 1) '  PRIMARY KEY (${pks.join(', ')})',
    ];
    b
      ..writeln(defs.join(',\n'))
      ..writeln(');');
  }
  return b.toString();
}

String _refSql(String ref) {
  final p = ref.split('.');
  return p.length > 1 ? '${_ident(p[0])}(${p[1].trim()})' : _ident(p[0]);
}

/// CREATE TABLE statements for an ER diagram, by the textbook mapping: an entity becomes a table
/// (key → primary key, multivalued → its own table, derived → left out); a weak entity takes its
/// owner's key; 1:N puts a foreign key on the N side; M:N (and relationship attributes on it)
/// becomes a table of its own.
String erToSql(ParsedDiagram d) {
  final b = StringBuffer('-- Tables from the ER diagram\n');
  List<DiagramNode> attrsOf(String id) => [for (final n in d.nodes.values) if (n.owner == id) n];
  final keyOf = <String, List<String>>{};
  for (final e in d.nodes.values.where((n) => n.kind == 'entity')) {
    keyOf[e.id] = [for (final a in attrsOf(e.id)) if (a.kind == 'key') _ident(a.label)];
    if (keyOf[e.id]!.isEmpty) keyOf[e.id] = ['${_ident(e.label)}_id'];
  }
  // Each relationship's entities and the cardinality written on each side.
  final rels = <String, List<(String, String)>>{};
  for (final r in d.nodes.values.where((n) => n.kind == 'relationship' || n.kind == 'idrel')) {
    rels[r.id] = [
      for (final e in d.edges)
        if (e.from == r.id && d.nodes[e.to] != null && !d.nodes[e.to]!.isAttribute) (e.to, (e.label.isEmpty ? e.toMul : e.label).trim().toUpperCase())
        else if (e.to == r.id && d.nodes[e.from] != null && !d.nodes[e.from]!.isAttribute) (e.from, (e.label.isEmpty ? e.fromMul : e.label).trim().toUpperCase()),
    ];
  }
  // Weak entities: the owner is across an identifying relationship.
  final extra = <String, List<String>>{};
  for (final w in d.nodes.values.where((n) => n.kind == 'weak')) {
    final owner = rels.entries.where((r) => d.nodes[r.key]!.kind == 'idrel' && r.value.any((x) => x.$1 == w.id)).expand((r) => r.value).map((x) => x.$1).firstWhere((x) => x != w.id, orElse: () => '');
    final partial = [for (final a in attrsOf(w.id)) if (a.kind == 'partial' || a.kind == 'key') _ident(a.label)];
    final ownerKeys = owner.isEmpty ? <String>[] : keyOf[owner] ?? [];
    keyOf[w.id] = [...ownerKeys, ...partial];
    if (owner.isNotEmpty) extra[w.id] = ['FOREIGN KEY (${ownerKeys.join(', ')}) REFERENCES ${_ident(d.nodes[owner]!.label)}(${ownerKeys.join(', ')}) ON DELETE CASCADE'];
  }
  // 1:N and 1:1: a foreign key on the N (or second) side.
  final fks = <String, List<(String, String)>>{}; // table → (column, referenced entity)
  final junctions = <String>[];
  for (final MapEntry(key: r, value: ends) in rels.entries) {
    if (d.nodes[r]!.kind == 'idrel' || ends.length != 2) {
      if (ends.length > 2) junctions.add(r);
      continue;
    }
    final (a, ca) = ends[0];
    final (b2, cb) = ends[1];
    final many = {'N', 'M', '*', 'MANY'};
    if (many.contains(ca) && many.contains(cb)) {
      junctions.add(r);
    } else {
      // The side marked N (or the second, for 1:1) holds the key of the other.
      final (holder, other) = many.contains(cb) || !many.contains(ca) ? (b2, a) : (a, b2);
      (fks[holder] ??= []).add((other, r));
    }
  }
  String cols(String id) => (keyOf[id] ?? []).join(', ');
  for (final e in d.nodes.values.where((n) => n.kind == 'entity' || n.kind == 'weak')) {
    final name = _ident(e.label);
    final defs = <String>[];
    final keys = keyOf[e.id]!;
    final attrs = attrsOf(e.id);
    final written = <String>{};
    void col(String c, String type) {
      if (written.add(c)) defs.add('  $c $type');
    }

    for (final k in keys) {
      col(k, _type(k));
    }
    for (final a in attrs.where((a) => a.kind == 'attribute')) {
      col(_ident(a.label), _type(a.label));
    }
    for (final a in attrs.where((a) => a.kind == 'derived')) {
      defs.add('  -- ${_ident(a.label)} is derived: compute it in a query');
    }
    final foreign = <String>[];
    for (final (other, r) in fks[e.id] ?? const <(String, String)>[]) {
      final ok = keyOf[other]!;
      // The referenced key keeps its name unless this table already has a column called that.
      final local = [for (final k in ok) written.contains(k) ? '${_ident(d.nodes[other]!.label)}_$k' : k];
      for (final (i, k) in ok.indexed) {
        col(local[i], _type(k));
      }
      for (final a in attrsOf(r).where((a) => a.kind == 'attribute')) {
        col(_ident(a.label), _type(a.label));
      }
      foreign.add('  FOREIGN KEY (${local.join(', ')}) REFERENCES ${_ident(d.nodes[other]!.label)}(${ok.join(', ')})');
    }
    defs
      ..add('  PRIMARY KEY (${keys.join(', ')})')
      ..addAll(foreign);
    for (final x in extra[e.id] ?? const <String>[]) {
      defs.add('  $x');
    }
    b
      ..writeln('CREATE TABLE $name (')
      ..writeln(_joinDefs(defs))
      ..writeln(');');
    for (final m in attrs.where((a) => a.kind == 'multi')) {
      b
        ..writeln('CREATE TABLE ${name}_${_ident(m.label)} (')
        ..writeln(_joinDefs([
          for (final k in keys) '  $k ${_type(k)}',
          '  ${_ident(m.label)} ${_type(m.label)}',
          '  PRIMARY KEY (${[...keys, _ident(m.label)].join(', ')})',
          '  FOREIGN KEY (${keys.join(', ')}) REFERENCES $name(${keys.join(', ')})',
        ]))
        ..writeln(');');
    }
  }
  for (final r in junctions) {
    final ends = rels[r]!;
    final defs = <String>[];
    final pk = <String>[];
    for (final (ent, _) in ends) {
      for (final k in keyOf[ent] ?? const <String>[]) {
        defs.add('  ${_ident(d.nodes[ent]!.label)}_$k ${_type(k)}');
        pk.add('${_ident(d.nodes[ent]!.label)}_$k');
      }
    }
    for (final a in attrsOf(r).where((a) => a.kind == 'attribute')) {
      defs.add('  ${_ident(a.label)} ${_type(a.label)}');
    }
    defs.add('  PRIMARY KEY (${pk.join(', ')})');
    for (final (ent, _) in ends) {
      final ks = keyOf[ent] ?? const <String>[];
      defs.add('  FOREIGN KEY (${ks.map((k) => '${_ident(d.nodes[ent]!.label)}_$k').join(', ')}) REFERENCES ${_ident(d.nodes[ent]!.label)}(${cols(ent)})');
    }
    b
      ..writeln('CREATE TABLE ${_ident(d.nodes[r]!.label)} (')
      ..writeln(_joinDefs(defs))
      ..writeln(');');
  }
  return b.toString();
}

/// Column definitions joined with commas (a comment line takes none).
String _joinDefs(List<String> defs) {
  final real = [for (final (i, d) in defs.indexed) if (!d.trimLeft().startsWith('--')) i];
  return [
    for (final (i, d) in defs.indexed) d.trimLeft().startsWith('--') || i == real.lastOrNull ? d : '$d,',
  ].join('\n');
}

// --- The panel ---------------------------------------------------------------------------------

/// A computer science diagram panel: its [type], [title], the text [spec], the places boxes were
/// dragged to ([pos], centres in panel coordinates), and for automata the string being run and
/// how far ([input], [step]).
class CsDiagram {
  CsDiagram({required this.type, this.title = '', this.spec = '', Map<String, Offset>? pos, this.input = '', this.step = -1}) : pos = pos ?? {};

  factory CsDiagram.fromJson(Map<String, Object?> j) {
    final p = j['pos'];
    return CsDiagram(
      type: CsDiagramType.values.asNameMap()[j['type']] ?? CsDiagramType.classes,
      title: _s(j['t']),
      spec: _s(j['spec']),
      pos: {
        if (p is Map)
          for (final e in p.entries)
            if (e.value is List && (e.value as List).length == 2 && (e.value as List).every((v) => v is num))
              '${e.key}': Offset(((e.value as List)[0] as num).toDouble(), ((e.value as List)[1] as num).toDouble()),
      },
      input: _s(j['in']),
      step: _i(j['step'], -1),
    );
  }

  Map<String, Object?> toJson() => {
    'type': type.name,
    't': title,
    'spec': spec,
    if (pos.isNotEmpty) 'pos': {for (final e in pos.entries) e.key: [e.value.dx.roundToDouble(), e.value.dy.roundToDouble()]},
    if (input.isNotEmpty) 'in': input,
    if (step >= 0) 'step': step,
  };

  final CsDiagramType type;
  String title;
  String spec;
  final Map<String, Offset> pos;
  String input;

  /// How many symbols of [input] have been read (-1: the run is not shown).
  int step;

  ParsedDiagram get parsed => parseDiagram(type, spec);

  CsDiagram copy() => CsDiagram.fromJson(toJson());

  /// The automaton's current states at [step], to light up.
  Set<String> get current {
    if (type != CsDiagramType.automaton || step < 0) return const {};
    final run = runAutomaton(parsed, input);
    return run[step.clamp(0, run.length - 1)];
  }
}
