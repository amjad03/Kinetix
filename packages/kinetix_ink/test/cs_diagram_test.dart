import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The computer science diagram panels: reading the diagram text, keeping it with the page,
/// running strings through automata and the SQL an ER diagram or a schema turns into.
void main() {
  test('a class diagram: classes, members and every kind of relation', () {
    final d = parseDiagram(CsDiagramType.classes, '''
abstract class Account
  - balance: double
  + withdraw(amt: double): boolean
class Savings
interface Payable
  + pay(): void
Savings --|> Account
Account ..|> Payable
Bank "1" *-- "*" Account : keeps
Library o-- Book
Member "1" -- "0..5" Loan : takes
Loan <|-- Fine
''');
    expect(d.nodes['Account']!.kind, 'abstract');
    expect(d.nodes['Account']!.lines, ['- balance: double']);
    expect(d.nodes['Account']!.methods, ['+ withdraw(amt: double): boolean']);
    expect(d.nodes['Payable']!.kind, 'interface');
    expect(d.nodes['Bank']!.kind, 'class', reason: 'a name used only in a line becomes a class');
    expect([for (final e in d.edges) (e.from, e.to, e.kind)], [
      ('Savings', 'Account', 'inherit'),
      ('Account', 'Payable', 'realize'),
      ('Bank', 'Account', 'compose'),
      ('Library', 'Book', 'aggregate'),
      ('Member', 'Loan', 'line'),
      ('Fine', 'Loan', 'inherit'),
    ]);
    final keeps = d.edges[2];
    expect((keeps.fromMul, keeps.toMul, keeps.label), ('1', '*', 'keeps'));
  });

  test('ER: entities, weak entities, key / partial / multivalued / derived attributes, cardinality', () {
    final d = parseDiagram(CsDiagramType.er, '''
entity Student
  *usn
  name
  {phone}
  /age
weak entity Guardian
  ~gname
relationship Enrols
  grade
identifying Has
Student -- Enrols : M
Enrols -- Course : N
Student == Has : 1
Has == Guardian : N
''');
    expect({for (final n in d.nodes.values) n.id: n.kind}, {
      'Student': 'entity',
      'Student.usn': 'key',
      'Student.name': 'attribute',
      'Student.phone': 'multi',
      'Student.age': 'derived',
      'Guardian': 'weak',
      'Guardian.gname': 'partial',
      'Enrols': 'relationship',
      'Enrols.grade': 'attribute',
      'Has': 'idrel',
      'Course': 'entity',
    });
    expect(d.edges.where((e) => e.kind == 'double'), hasLength(2));
    // Attributes sit round their entity.
    final layout = layoutDiagram(d, const {}, const Size(1240, 860));
    expect((layout['Student.usn']! - layout['Student']!).distance, greaterThan(80));
  });

  test('the ER diagram becomes tables by the textbook mapping', () {
    final sql = erToSql(parseDiagram(CsDiagramType.er, '''
entity Student
  *usn
  name
  {phone}
  /age
entity Department
  *dept_id
entity Course
  *code
weak entity Guardian
  ~gname
relationship Belongs to
relationship Enrols
  grade
identifying Has
Student -- Belongs to : N
Belongs to == Department : 1
Student -- Enrols : M
Enrols -- Course : N
Student == Has : 1
Has == Guardian : N
'''));
    expect(sql, contains('CREATE TABLE student (\n  usn TEXT,\n  name TEXT,\n  -- age is derived: compute it in a query\n  dept_id INTEGER,\n  PRIMARY KEY (usn),\n  FOREIGN KEY (dept_id) REFERENCES department(dept_id)\n);'));
    expect(sql, contains('CREATE TABLE student_phone ('));
    expect(sql, contains('PRIMARY KEY (usn, gname)'));
    expect(sql, contains('REFERENCES student(usn) ON DELETE CASCADE'));
    expect(sql, contains('CREATE TABLE enrols (\n  student_usn TEXT,\n  course_code TEXT,\n  grade TEXT,\n  PRIMARY KEY (student_usn, course_code)'));
  });

  test('a relational schema: primary keys, composite keys and foreign keys', () {
    final d = parseDiagram(CsDiagramType.schema, '''
table student
  *usn TEXT
  dept_id INTEGER -> department.dept_id
table enrols
  *usn TEXT -> student.usn
  *code TEXT
''');
    expect(d.nodes['department']!.kind, 'table');
    expect([for (final e in d.edges) (e.from, e.to)], [('student', 'department'), ('enrols', 'student')]);
    final sql = schemaToSql(d);
    expect(sql, contains('usn TEXT PRIMARY KEY'));
    expect(sql, contains('dept_id INTEGER REFERENCES department(dept_id)'));
    expect(sql, contains('PRIMARY KEY (usn, code)'));
  });

  test('automata: a DFA and an NFA with ε moves read strings', () {
    final dfa = parseDiagram(CsDiagramType.automaton, 'start q0\naccept q2\nq0 -> q1 : 0\nq0 -> q0 : 1\nq1 -> q1 : 0\nq1 -> q2 : 1\nq2 -> q1 : 0\nq2 -> q0 : 1\n');
    expect(isDeterministic(dfa), isTrue);
    expect(dfa.nodes.values.every((n) => n.kind == 'astate'), isTrue);
    expect([for (final w in ['1101', '0110', '01', '', '111']) automatonAccepts(dfa, w)], [true, false, true, false, false]);
    expect(runAutomaton(dfa, '101'), [
      {'q0'},
      {'q0'},
      {'q1'},
      {'q2'},
    ]);
    final nfa = parseDiagram(CsDiagramType.automaton, 'start s\naccept f\ns -> a : ε\ns -> b : eps\na -> f : x\nb -> b : y\nb -> f : x, z\n');
    expect(isDeterministic(nfa), isFalse);
    expect(runAutomaton(nfa, '').single, {'s', 'a', 'b'});
    expect([for (final w in ['x', 'yyz', 'yx', 'xy', 'q']) automatonAccepts(nfa, w)], [true, true, true, false, false]);
  });

  test('a panel keeps its text, dragged places and run with the page', () {
    final d = CsDiagram(type: CsDiagramType.automaton, title: 'Ends in 01', spec: 'start q0\naccept q1\nq0 -> q1 : 1', pos: {'q0': const Offset(200, 300)}, input: '011', step: 2);
    final k = KitElement.sized(kind: KitKind.csDiagram, data: d.toJson(), color: const Color(0xFF006879));
    final back = decodeElement(encodeElement(k), 'x')! as KitElement;
    final again = CsDiagram.fromJson(back.data);
    expect(back.kind, KitKind.csDiagram);
    expect((again.type, again.title, again.spec, again.input, again.step), (d.type, d.title, d.spec, d.input, d.step));
    expect(again.pos, {'q0': const Offset(200, 300)});
    expect(again.current, <String>{});
    expect(CsDiagram.fromJson(const {}).type, CsDiagramType.classes);
    // Every kind draws, including an empty one.
    for (final t in CsDiagramType.values) {
      final recorder = PictureRecorder();
      paintKit(Canvas(recorder), KitElement.sized(kind: KitKind.csDiagram, data: CsDiagram(type: t, spec: 'A -> B : x\nB -> A\nA -> A : y').toJson(), color: const Color(0xFF006879)));
      recorder.endRecording().dispose();
    }
  });

  test('dragging: the box under a point is found, sequence participants keep their row', () {
    final d = parseDiagram(CsDiagramType.sequence, 'actor User\nparticipant :ATM\nUser -> :ATM : insert card\n');
    final layout = layoutDiagram(d, {':ATM': const Offset(900, 500)}, const Size(1240, 860));
    expect(layout[':ATM']!.dy, layout['User']!.dy);
    expect(diagramNodeAt(d, layout, layout['User']!), 'User');
    expect(diagramNodeAt(d, layout, const Offset(5, 5)), isNull);
  });
}
