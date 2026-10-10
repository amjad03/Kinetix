import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/mindmap/mind_map.dart';
import 'package:kinetix_board/features/mindmap/mind_map_editor.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/panel_harness.dart';

void main() {
  MindMap sample() {
    final m = MindMap('Water');
    final a = m.addChild('n0', 'States')!;
    m.addChild('n0', 'Uses');
    m.addChild('n0', 'Cycle');
    m.addChild(a.id, 'Ice');
    m.addChild(a.id, 'Vapour');
    return m;
  }

  test('a radial layout: the topic at the centre, branches on a ring round it, sub-branches beyond', () {
    final m = sample();
    final at = m.layout();
    expect(at['n0'], Offset.zero);
    final ring = [for (final c in m.root.children) at[c.id]!.distance];
    for (final r in ring) {
      expect(r, closeTo(MindMap.ring, 45));
    }
    // Three branches fan to three different directions.
    final angles = {for (final c in m.root.children) (math.atan2(at[c.id]!.dy, at[c.id]!.dx) * 10).round()};
    expect(angles, hasLength(3));
    final ice = m.nodes.firstWhere((n) => n.text == 'Ice');
    expect(at[ice.id]!.distance, greaterThan(at[m.root.children.first.id]!.distance));
    // No two boxes overlap.
    final boxes = [for (final n in m.nodes) m.rectOf(n, at[n.id]!)];
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        expect(boxes[i].overlaps(boxes[j]), isFalse, reason: '${m.nodes[i].text} / ${m.nodes[j].text}');
      }
    }
  });

  test('add child and sibling, delete, fold, and a colour for each branch', () {
    final m = sample();
    final states = m.root.children.first;
    final sib = m.addSibling(states.id, 'Rain')!;
    expect(m.root.children.map((c) => c.text), ['States', 'Rain', 'Uses', 'Cycle']);
    expect(m.parentOf(sib.id), m.root);
    expect(m.colorOf('n0'), isNot(m.colorOf(states.id)));
    expect(m.colorOf(m.root.children[1].id), isNot(m.colorOf(states.id)));
    // A sub-branch has its branch's colour.
    final ice = m.nodes.firstWhere((n) => n.text == 'Ice');
    expect(m.colorOf(ice.id), m.colorOf(states.id));
    m.toggle(states.id);
    expect(m.layout().containsKey(ice.id), isFalse, reason: 'folded away');
    m.toggle(states.id);
    expect(m.layout().containsKey(ice.id), isTrue);
    expect(m.remove(states.id), isTrue);
    expect(m.find(ice.id), isNull);
    expect(m.remove(m.root.id), isFalse);
    expect(m.addSibling(m.root.id, 'New')!.text, 'New', reason: 'the topic has no sibling, so a branch');
  });

  test('on the board it is topic blocks with curved branches, not a flowchart', () {
    final els = sample().toElements();
    final nodes = els.whereType<FlowNodeElement>().toList();
    final links = els.whereType<FlowLinkElement>().toList();
    expect(nodes, hasLength(6));
    expect(links, hasLength(5));
    expect(nodes.every((n) => n.shape == FlowBlock.topic), isTrue);
    expect(links.every((l) => l.curved), isTrue);
    expect({for (final l in links) l.color.toARGB32()}.length, greaterThan(1), reason: 'colours differ by branch');
  });

  test('Hindi and Kannada have every English key', () {
    for (final lang in ['hi', 'kn']) {
      expect(mindMapStringTable[lang]!.keys.toSet(), mindMapStringTable['en']!.keys.toSet());
    }
  });

  testWidgets('the editor adds a branch and a sub-branch, renames, folds, drags, and puts the map on the board', (tester) async {
    final wb = WhiteboardController();
    await pumpPanel(tester, Builder(builder: (c) => TextButton(key: const Key('open-mm'), onPressed: () => MindMapEditor.open(c, wb), child: const Text('open'))), size: const Size(1280, 800));
    await tester.tap(find.byKey(const Key('open-mm')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mm-node-n0')), findsOneWidget);
    await tester.tap(find.byKey(const Key('mm-add-child')));
    await tester.pump();
    expect(find.byKey(const Key('mm-node-n1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('mm-add-child')));
    await tester.pump();
    expect(find.byKey(const Key('mm-node-n2')), findsOneWidget, reason: 'the new branch is selected, so this is its child');
    await tester.tap(find.byKey(const Key('mm-add-sibling')));
    await tester.pump();
    expect(find.byKey(const Key('mm-node-n3')), findsOneWidget);
    // Rename the selected idea.
    await tester.tap(find.byKey(const Key('mm-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('mm-text-field')), 'Solid');
    await tester.tap(find.byKey(const Key('mm-text-ok')));
    await tester.pumpAndSettle();
    expect(find.text('Solid'), findsOneWidget);
    // Drag a branch.
    final before = tester.getCenter(find.byKey(const Key('mm-node-n1')));
    await tester.drag(find.byKey(const Key('mm-node-n1')), const Offset(0, 60));
    await tester.pump();
    expect(tester.getCenter(find.byKey(const Key('mm-node-n1'))).dy, closeTo(before.dy + 60, 1));
    // Fold n1: its children disappear.
    await tester.tap(find.byKey(const Key('mm-toggle-n1')));
    await tester.pump();
    expect(find.byKey(const Key('mm-node-n2')), findsNothing);
    await tester.tap(find.byKey(const Key('mm-toggle-n1')));
    await tester.pump();
    expect(find.byKey(const Key('mm-node-n2')), findsOneWidget);
    // Tidy up forgets the drag.
    await tester.tap(find.byKey(const Key('mm-auto')));
    await tester.pump();
    expect(tester.getCenter(find.byKey(const Key('mm-node-n1'))).dy, closeTo(before.dy, 1));
    // Put on board closes the editor over a page that has the map.
    await tester.tap(find.byKey(const Key('mm-delete')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('mm-place')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mind-map')), findsNothing);
    expect(wb.elements.whereType<FlowNodeElement>(), isNotEmpty);
  });
}
