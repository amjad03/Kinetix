import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

Future<void> _pump(WidgetTester tester, Widget child, {Size size = const Size(1280, 800)}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: KinetixTheme.board(), home: Scaffold(body: child)));
  await tester.pump();
}

int _tiles(WidgetTester tester) => find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('anim-tile-')).evaluate().length;

Future<void> _choose(WidgetTester tester, String dropKey, String item) async {
  await tester.tap(find.byKey(ValueKey(dropKey)));
  await tester.pumpAndSettle();
  await tester.tap(find.text(item).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('search and the Subject, Topic and Class dropdowns filter the thumbnails', (tester) async {
    await _pump(tester, const AnimationsPanel());
    final all = animationCatalogue.length;
    // The grid builds lazily; count what is in the catalogue through the filters instead.
    expect(_tiles(tester), greaterThan(0));

    await tester.enterText(find.byKey(const ValueKey('anim-search')), 'chloroplast');
    await tester.pump();
    expect(_tiles(tester), 1);
    expect(find.byKey(const ValueKey('anim-tile-photosynthesis')), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('anim-search')), 'zzzz-nothing');
    await tester.pump();
    expect(_tiles(tester), 0);
    await tester.tap(find.text('Clear filters'));
    await tester.pump();
    expect(_tiles(tester), greaterThan(0));

    await _choose(tester, 'anim-subject', 'Physics');
    final physics = animationCatalogue.where((a) => a.subject == 'Physics').length;
    expect(_tiles(tester), physics);
    expect(physics, lessThan(all));

    await _choose(tester, 'anim-subject', 'Biology');
    await _choose(tester, 'anim-topic', 'Life processes');
    expect(_tiles(tester), animationCatalogue.where((a) => a.subject == 'Biology' && a.topic == 'Life processes').length);

    await _choose(tester, 'anim-class', 'Class 7');
    expect(_tiles(tester), animationCatalogue.where((a) => a.subject == 'Biology' && a.topic == 'Life processes' && a.levels.contains('Class 7')).length);
  });

  testWidgets('the lesson subject and topic pick the starting filters', (tester) async {
    await _pump(tester, const AnimationsPanel(subject: 'Biology', topic: 'photosynthesis'));
    expect(find.byKey(const ValueKey('anim-tile-photosynthesis')), findsOneWidget);
    expect(_tiles(tester), animationCatalogue.where((a) => a.subject == 'Biology' && a.matchesQuery('photosynthesis')).length);
    // A board subject the catalogue does not name itself still filters by its aliases.
    await _pump(tester, const AnimationsPanel(subject: 'Geography', topic: 'Earth and space'));
    expect(_tiles(tester), animationCatalogue.where((a) => a.matchesSubject('Geography') && a.topic == 'Earth and space').length);
    expect(find.byKey(const ValueKey('anim-tile-photosynthesis')), findsNothing);
  });

  for (final size in const [Size(360, 640), Size(1920, 1080), Size(960, 1080)]) {
    testWidgets('a tap plays it full-panel; controls work at ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
      Uint8List? png;
      String? title;
      await _pump(tester, AnimationsPanel(onAddToBoard: (p, t) => (png, title) = (p, t)), size: size);
      await tester.tap(find.byKey(const ValueKey('anim-tile-photosynthesis')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byKey(const ValueKey('anim-canvas')), findsOneWidget);
      expect(tester.takeException(), isNull);

      // Pause, scrub to the Calvin cycle, toggle labels.
      await tester.tap(find.byKey(const ValueKey('anim-play')));
      await tester.pump();
      final calvin = photosynthesis.steps[4];
      // The step markers sit on the timeline; a tap jumps to the step's start.
      await tester.tap(find.byKey(const ValueKey('anim-step-4')));
      await tester.pump();
      expect(find.text(calvin.caption.en), findsOneWidget);
      // A tap near the end of the timeline scrubs to the last step.
      final track = tester.getRect(find.byKey(const ValueKey('anim-scrub')));
      await tester.tapAt(Offset(track.left + 8 + (track.width - 16) * 0.97, track.top + 14));
      await tester.pump();
      expect(find.text(photosynthesis.steps.last.caption.en), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('anim-labels')));
      await tester.pump();

      await tester.runAsync(() async {
        await tester.tap(find.byKey(const ValueKey('anim-add')));
        // Rendering the still takes a moment (longer when the machine is busy).
        for (var i = 0; i < 50 && png == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
      });
      await tester.pump();
      expect(png, isNotNull);
      expect(title, startsWith('Photosynthesis'));

      await tester.tap(find.byKey(const ValueKey('anim-back')));
      await tester.pump();
      expect(find.byKey(const ValueKey('anim-search')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

KxAnimation get photosynthesis => animationById('photosynthesis')!;
