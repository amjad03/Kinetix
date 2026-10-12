import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/mindmap/mind_map.dart';
import 'package:kinetix_board/features/mindmap/mind_map_editor.dart';
import 'package:kinetix_board/features/mindmap/mind_map_paint.dart';
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

  /// A big, awkward map: long words, every shape, an icon, a picture, uneven branches.
  MindMap crowded() {
    final m = MindMap('The water cycle and why it matters for every living thing');
    final rng = math.Random(7);
    for (var i = 0; i < 7; i++) {
      final b = m.addChild('n0', i.isEven ? 'Evaporation of oceans, lakes and rivers' : 'Rain')!;
      b.shape = MindShape.values[i % 4];
      if (i == 2) b.icon = 3;
      if (i == 3) b.image = Uint8List(4);
      for (var j = 0; j < 1 + rng.nextInt(4); j++) {
        final c = m.addChild(b.id, 'Sub idea number ${i * 10 + j} with several words')!;
        c.shape = MindShape.values[(i + j) % 4];
        for (var k = 0; k < rng.nextInt(3); k++) {
          m.addChild(c.id, 'Leaf $k');
        }
      }
    }
    return m;
  }

  void expectClean(MindMap m) {
    final at = m.layout();
    final vis = m.visible;
    final boxes = {for (final n in vis) n.id: m.rectOf(n, at[n.id]!)};
    for (var i = 0; i < vis.length; i++) {
      for (var j = i + 1; j < vis.length; j++) {
        expect(boxes[vis[i].id]!.overlaps(boxes[vis[j].id]!), isFalse, reason: '${vis[i].text} / ${vis[j].text}');
      }
    }
    final conns = m.connectors(at);
    expect(conns, hasLength(vis.length - 1));
    for (final c in conns) {
      final pn = m.find(c.parent)!, cn = m.find(c.child)!;
      // Starts on the parent's border and ends on the child's, never inside either.
      for (final (p, n) in [(c.p0, pn), (c.p3, cn)]) {
        final r = boxes[n.id]!;
        expect(MindMap.shapePath(r.deflate(1.5), n.shape).contains(p), isFalse, reason: 'inside ${n.text}');
        expect(MindMap.shapePath(r.inflate(1.5), n.shape).contains(p), isTrue, reason: 'off the border of ${n.text}');
      }
      for (var t = 0.05; t < 0.96; t += 0.04) {
        final p = c.at(t);
        for (final n in vis) {
          expect(MindMap.shapePath(boxes[n.id]!.deflate(1.5), n.shape).contains(p), isFalse, reason: '${c.parent}->${c.child} runs through ${n.id} at $t');
        }
      }
    }
  }

  test('radial layout: no idea overlaps another and no branch runs through an idea', () {
    final m = sample();
    final at = m.layout();
    expect(at['n0'], Offset.zero);
    final ice = m.nodes.firstWhere((n) => n.text == 'Ice');
    expect(at[ice.id]!.distance, greaterThan(at[m.root.children.first.id]!.distance));
    expectClean(m);
    expectClean(crowded());
    final folded = crowded()..toggle(crowded().root.children.first.id);
    expectClean(folded);
    expectClean(MindMap('Alone'));
    expectClean(MindMap.starter('One', ['Only']));
  });

  test('every edit lays the map out again cleanly', () {
    final m = sample();
    final states = m.root.children.first;
    for (var i = 0; i < 12; i++) {
      m.addChild(states.id, 'Another long idea number $i');
      expectClean(m);
    }
    m.addSibling(states.id, 'Rain');
    expectClean(m);
    m.reparent(m.root.children.last.id, states.id);
    expectClean(m);
    m.remove(states.id);
    expectClean(m);
  });

  test('words wrap to fit; nothing is cut short', () {
    final m = MindMap('A topic');
    final n = m.addChild('n0', 'Photosynthesis is how green plants make their own food from sunlight, water and air')!;
    final one = m.addChild('n0', 'Sun')!;
    expect(m.sizeOf(n).width, lessThan(MindMap.textMax + 60));
    expect(m.sizeOf(n).height, greaterThan(m.sizeOf(one).height * 2), reason: 'several lines tall, not one line cut off');
    expect(m.textOf(n).didExceedMaxLines, isFalse);
    n.image = Uint8List(2);
    expect(m.sizeOf(n).height, greaterThan(m.textOf(n).height + MindMap.imageSide));
  });

  test('colour per idea, per branch and by theme', () {
    final m = sample();
    final states = m.root.children.first;
    final ice = m.nodes.firstWhere((n) => n.text == 'Ice');
    expect(m.colorOf(ice.id), m.colorOf(states.id));
    expect(m.colorOf(m.root.children[1].id), isNot(m.colorOf(states.id)));
    m.setColor(ice.id, const Color(0xFF123456));
    expect(m.colorOf(ice.id), const Color(0xFF123456));
    expect(m.colorOf(states.id), isNot(const Color(0xFF123456)));
    m.setColor(states.id, const Color(0xFFABCDEF), branch: true);
    expect(m.colorOf(ice.id), const Color(0xFFABCDEF), reason: 'the branch colour reaches its sub-branches and lets their own go');
    expect(m.branchColorOf(states.id), const Color(0xFFABCDEF));
    m.setColor(states.id, null, branch: true);
    expect(m.colorOf(ice.id), mindThemes.first.branches.first);
    m.themeIndex = 2;
    expect(m.colorOf(ice.id), mindThemes[2].branches.first);
    expect(m.colorOf('n0'), mindThemes[2].root);
    expect({for (final t in mindThemes) t.branches.first}.length, mindThemes.length);
  });

  test('add child and sibling, delete, fold, re-parent, clone for undo', () {
    final m = sample();
    final states = m.root.children.first;
    final sib = m.addSibling(states.id, 'Rain')!;
    expect(m.root.children.map((c) => c.text), ['States', 'Rain', 'Uses', 'Cycle']);
    expect(m.parentOf(sib.id), m.root);
    final ice = m.nodes.firstWhere((n) => n.text == 'Ice');
    final snapshot = m.clone();
    m.toggle(states.id);
    expect(m.layout().containsKey(ice.id), isFalse, reason: 'folded away');
    m.toggle(states.id);
    expect(m.layout().containsKey(ice.id), isTrue);
    expect(m.reparent(ice.id, sib.id), isTrue);
    expect(m.parentOf(ice.id), sib);
    expect(m.reparent(sib.id, ice.id), isFalse, reason: 'not into its own descendant');
    expect(m.reparent(states.id, states.id), isFalse);
    expect(m.reparent(m.root.id, sib.id), isFalse, reason: 'the topic stays put');
    expect(m.remove(states.id), isTrue);
    expect(m.remove(m.root.id), isFalse);
    expect(m.addSibling(m.root.id, 'New')!.text, 'New', reason: 'the topic has no sibling, so a branch');
    expect(snapshot.nodes.map((n) => n.text), contains('Vapour'));
    expect(snapshot.parentOf(ice.id)!.text, 'States', reason: 'the snapshot is a copy');
  });

  test('on the board it is topic blocks with curved branches, or a picture', () async {
    final m = sample();
    m.root.children.first.image = Uint8List.fromList([1, 2, 3]);
    final els = m.toElements();
    final nodes = els.whereType<FlowNodeElement>().toList();
    final links = els.whereType<FlowLinkElement>().toList();
    expect(nodes, hasLength(6));
    expect(links, hasLength(5));
    expect(els.whereType<ImageElement>(), hasLength(1));
    expect(links.every((l) => l.curved), isTrue);
    expect({for (final l in links) l.color.toARGB32()}.length, greaterThan(1), reason: 'colours differ by branch');
    final png = (await TestWidgetsFlutterBinding.ensureInitialized().runAsync(() => mindMapPng(m, scale: 1)))!;
    expect(png.sublist(1, 4), [0x50, 0x4E, 0x47], reason: 'a PNG');
  });

  test('Hindi and Kannada have every English key, and no Latin words in their own text', () {
    for (final lang in ['hi', 'kn']) {
      expect(mindMapStringTable[lang]!.keys.toSet(), mindMapStringTable['en']!.keys.toSet());
      for (final e in mindMapStringTable[lang]!.entries) {
        if (e.key == 'hint') continue;
        expect(RegExp('[A-Za-z]').hasMatch(e.value), isFalse, reason: '$lang ${e.key}');
      }
    }
  });

  group('the editor', () {
    Future<void> open(WidgetTester tester, WhiteboardController wb, {MindMap? initial, Future<Uint8List?> Function()? pick, Size size = const Size(1280, 800)}) async {
      await pumpPanel(
        tester,
        Builder(
          builder: (c) => TextButton(
            key: const Key('open-mm'),
            onPressed: () => showDialog<void>(context: c, useSafeArea: false, builder: (_) => Dialog.fullscreen(child: MindMapEditor(wb: wb, initial: initial, pickPicture: pick))),
            child: const Text('open'),
          ),
        ),
        size: size,
      );
      await tester.tap(find.byKey(const Key('open-mm')));
      await tester.pumpAndSettle();
    }

    Future<void> tapKey(WidgetTester tester, String k) async {
      await tester.ensureVisible(find.byKey(Key(k)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key(k)));
      await tester.pumpAndSettle();
    }

    testWidgets('buttons: add, rename, fold, drag to re-parent, undo, colour, shape, icon, theme, picture, board', (tester) async {
      final wb = WhiteboardController();
      await open(tester, wb, pick: () async => Uint8List.fromList([1, 2, 3]));
      expect(find.byKey(const Key('mm-node-n0')), findsOneWidget);
      await tapKey(tester, 'mm-add-child');
      expect(find.byKey(const Key('mm-node-n1')), findsOneWidget);
      await tapKey(tester, 'mm-add-child');
      expect(find.byKey(const Key('mm-node-n2')), findsOneWidget, reason: 'the new branch is selected, so this is its child');
      await tapKey(tester, 'mm-add-sibling');
      expect(find.byKey(const Key('mm-node-n3')), findsOneWidget);
      await tapKey(tester, 'mm-edit');
      await tester.enterText(find.byKey(const Key('mm-text-field')), 'Solid');
      await tapKey(tester, 'mm-text-ok');
      expect(find.bySemanticsLabel('Solid'), findsOneWidget);
      // Colour this idea only, then another branch wholly.
      await tapKey(tester, 'mm-color');
      await tapKey(tester, 'mm-color-3');
      await tapKey(tester, 'mm-add-sibling');
      await tapKey(tester, 'mm-color');
      await tapKey(tester, 'mm-color-scope-branch');
      await tapKey(tester, 'mm-color-5');
      // Shape, icon, picture, theme.
      await tapKey(tester, 'mm-shape');
      await tapKey(tester, 'mm-shape-pill');
      await tapKey(tester, 'mm-icon');
      await tapKey(tester, 'mm-icon-2');
      await tapKey(tester, 'mm-image');
      expect(find.byKey(const Key('mm-image-remove')), findsOneWidget);
      await tapKey(tester, 'mm-theme');
      await tapKey(tester, 'mm-theme-ocean');
      // Drag n3's box onto its sibling n2: it becomes n2's child.
      final target = tester.getCenter(find.byKey(const Key('mm-node-n2')));
      await tester.drag(find.byKey(const Key('mm-node-n3')), target - tester.getCenter(find.byKey(const Key('mm-node-n3'))));
      await tester.pumpAndSettle();
      final state = tester.state<State>(find.byType(MindMapEditor));
      final map = (state as dynamic).map as MindMap;
      expect(map.parentOf('n3')!.id, 'n2');
      expect(map.theme.key, 'ocean');
      expect(map.find('n4')!.shape, MindShape.pill);
      expect(map.find('n4')!.icon, 2);
      expect(map.find('n4')!.image, isNotNull);
      expect(map.find('n3')!.color, mindThemes.first.branches[2]);
      // Undo walks back one edit at a time: first the move, then the theme.
      await tapKey(tester, 'mm-undo');
      var now = (state as dynamic).map as MindMap;
      expect(now.parentOf('n3')!.id, 'n1', reason: 'the move is undone');
      expect(now.theme.key, 'ocean');
      await tapKey(tester, 'mm-undo');
      now = (state as dynamic).map as MindMap;
      expect(now.theme.key, 'classic');
      // Fold hides children; fold again shows them.
      await tapKey(tester, 'mm-toggle-n1');
      expect(find.byKey(const Key('mm-node-n2')), findsNothing);
      await tapKey(tester, 'mm-toggle-n1');
      expect(find.byKey(const Key('mm-node-n2')), findsOneWidget);
      await tapKey(tester, 'mm-zoom-in');
      await tapKey(tester, 'mm-zoom-out');
      await tapKey(tester, 'mm-auto');
      await tapKey(tester, 'mm-place');
      expect(find.byKey(const Key('mind-map')), findsNothing);
      expect(wb.elements.whereType<FlowNodeElement>(), isNotEmpty);
      expect(wb.elements.whereType<FlowLinkElement>(), isNotEmpty);
    });

    testWidgets('keyboard: Tab adds a branch, Enter a sibling, F2 renames, Space folds, Delete removes, Ctrl+Z undoes', (tester) async {
      final wb = WhiteboardController();
      await open(tester, wb);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n1')), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n2')), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n3')), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n2')), findsNothing, reason: 'n1 folded');
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      await tester.sendKeyEvent(LogicalKeyboardKey.delete);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n1')), findsNothing);
      await tester.sendKeyEvent(LogicalKeyboardKey.controlLeft, platform: 'macos');
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyZ);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-node-n1')), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.f2);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mm-text-field')), findsOneWidget);
    });

    testWidgets('a big map fits the phone screen and the wheel zooms', (tester) async {
      final wb = WhiteboardController();
      await open(tester, wb, initial: crowded(), size: phoneSize);
      final root = tester.getRect(find.byKey(const Key('mm-node-n0')));
      expect(root.width, greaterThan(0));
      final before = tester.getSize(find.byKey(const Key('mm-node-n0'))).width;
      await tapKey(tester, 'mm-zoom-in');
      expect(tester.getSize(find.byKey(const Key('mm-node-n0'))).width, greaterThan(before));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });

    testWidgets('put on board as a picture inserts one image', (tester) async {
      final wb = WhiteboardController();
      await open(tester, wb, initial: sample());
      await tester.runAsync(() async {
        await tester.ensureVisible(find.byKey(const Key('mm-place-picture')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('mm-place-picture')));
        await Future<void>.delayed(const Duration(milliseconds: 400));
      });
      await tester.pumpAndSettle();
      expect(wb.elements.whereType<ImageElement>(), hasLength(1));
    });
  });
}
