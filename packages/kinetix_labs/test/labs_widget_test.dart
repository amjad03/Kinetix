import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

const _sizes = [Size(1920, 1080), Size(1280, 720), Size(400, 800)];

Future<void> _pump(WidgetTester tester, Widget child, {Size size = const Size(1920, 1080), bool dark = true}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: dark ? KinetixTheme.boardChrome() : KinetixTheme.light(),
    home: Scaffold(body: child),
  ));
  await tester.pump(const Duration(milliseconds: 50));
}

String _readout(WidgetTester tester, String key) {
  final texts = tester.widgetList<RichText>(find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(RichText)));
  return texts.map((t) => t.text.toPlainText()).join(' | ');
}

void main() {
  test('catalogue ids are stable', () {
    expect(LabCatalogue.ids, containsAll(['lab.ohms-law', 'lab.lens-mirror', 'lab.pendulum', 'lab.break-even', 'lab.graph-plotter']));
    for (final e in LabCatalogue.entries) {
      expect(e.title, isNotEmpty);
      expect(e.levels, isNotEmpty);
    }
  });

  for (final dark in [true, false]) {
    for (final size in _sizes) {
      testWidgets('every lab fits ${size.width.toInt()}×${size.height.toInt()} (${dark ? 'dark' : 'light'})', (tester) async {
        for (final e in LabCatalogue.entries) {
          for (final preset in [null, ...e.presets.take(2)]) {
            await _pump(tester, LabView(id: e.id, preset: preset), size: size, dark: dark);
            await tester.pump(const Duration(milliseconds: 200));
            expect(tester.takeException(), isNull, reason: '${e.id} $preset');
          }
        }
        await tester.pumpWidget(const SizedBox());
      });
    }
  }

  testWidgets('an unknown lab id shows a message', (tester) async {
    await _pump(tester, const LabView(id: 'lab.cold-fusion'));
    expect(find.textContaining('lab.cold-fusion'), findsOneWidget);
  });

  testWidgets("Ohm's law: the voltage slider changes the ammeter reading", (tester) async {
    await _pump(tester, const LabView(id: 'lab.ohms-law'));
    expect(_readout(tester, 'readout-current'), contains('0.600'));
    await tester.drag(find.descendant(of: find.byKey(const ValueKey('slider-voltage')), matching: find.byType(Slider)), const Offset(150, 0));
    await tester.pump();
    expect(_readout(tester, 'readout-current'), isNot(contains('0.600')));

    // Three resistors in parallel: R = 1/(1/5 + 1/10 + 1/15).
    await tester.tap(find.text('3'));
    await tester.pump();
    await tester.tap(find.text('Parallel'));
    await tester.pump();
    expect(_readout(tester, 'readout-req'), contains('2.73'));
    await tester.tap(find.text('Series'));
    await tester.pump();
    expect(_readout(tester, 'readout-req'), contains('30.00'));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Lens and mirror: object positions give the textbook images', (tester) async {
    await _pump(tester, const LabView(id: 'lab.lens-mirror'));
    expect(_readout(tester, 'readout-v'), contains('+16.67'));
    await tester.tap(find.text('At F'));
    await tester.pump();
    expect(_readout(tester, 'readout-v'), contains('∞'));
    await tester.tap(find.text('Between F and O'));
    await tester.pump();
    expect(_readout(tester, 'readout-nature'), contains('Virtual, erect'));
    expect(_readout(tester, 'readout-m'), contains('+2.00'));

    // Dragging the object on the diagram moves it.
    await tester.tap(find.text('At 2F'));
    await tester.pump();
    expect(_readout(tester, 'readout-m'), contains('−1.00'));
    await tester.drag(find.byKey(const ValueKey('optics-canvas')), const Offset(-120, 0));
    await tester.pump();
    expect(_readout(tester, 'readout-m'), isNot(contains('−1.00')));
  });

  testWidgets('Lens and mirror opens as a mirror with a preset', (tester) async {
    await _pump(tester, const LabView(id: 'lab.lens-mirror', preset: 'mirror'));
    expect(find.text('Ray diagrams: mirrors'), findsOneWidget);
    expect(_readout(tester, 'readout-v'), contains('−16.67'));
    await tester.tap(find.text('Convex mirror'));
    await tester.pump();
    expect(_readout(tester, 'readout-nature'), contains('Virtual, erect'));
  });

  testWidgets('Pendulum: the stopwatch times 10 oscillations', (tester) async {
    await _pump(tester, const LabView(id: 'lab.pendulum'));
    expect(_readout(tester, 'readout-formula'), contains('2.007'));
    await tester.tap(find.byKey(const ValueKey('stopwatch-start')));
    for (var i = 0; i < 26 * 30; i++) {
      await tester.pump(const Duration(milliseconds: 33));
      if (!_readout(tester, 'readout-measured').contains('–')) break;
    }
    // Exact period at 10° for L = 1 m is 2.011 s.
    expect(_readout(tester, 'readout-measured'), contains('2.01'));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Break-even: raising the fixed cost moves the BEP', (tester) async {
    await _pump(tester, const LabView(id: 'lab.break-even'));
    expect(_readout(tester, 'readout-bep-units'), contains('5,000.00'));
    expect(_readout(tester, 'readout-bep-sales'), contains('₹5,00,000.00'));
    expect(_readout(tester, 'readout-mos'), contains('37.50%'));
    await tester.drag(find.descendant(of: find.byKey(const ValueKey('slider-fixed')), matching: find.byType(Slider)), const Offset(80, 0));
    await tester.pump();
    expect(_readout(tester, 'readout-bep-units'), isNot(contains('5,000.00')));
  });

  testWidgets('Graph plotter: coefficients move the roots; custom expressions parse', (tester) async {
    await _pump(tester, const LabView(id: 'lab.graph-plotter'));
    expect(_readout(tester, 'readout-roots'), contains('x = −1.00'));
    expect(_readout(tester, 'readout-roots'), contains('x = 3.00'));
    expect(_readout(tester, 'readout-vertex'), contains('(1.00, −4.00)'));
    await tester.drag(find.descendant(of: find.byKey(const ValueKey('coef-c')), matching: find.byType(Slider)), const Offset(300, 0));
    await tester.pump();
    expect(_readout(tester, 'readout-roots'), isNot(contains('x = 3.00')));

    await tester.tap(find.text('Custom'));
    await tester.pump();
    await tester.enterText(find.byKey(const ValueKey('custom-expr')), '(x - 1)(x + 2)');
    await tester.pump();
    expect(_readout(tester, 'readout-roots'), contains('x = −2.00'));
    expect(_readout(tester, 'readout-roots'), contains('x = 1.00'));
    await tester.enterText(find.byKey(const ValueKey('custom-expr')), '2 +');
    await tester.pump();
    expect(find.textContaining('too soon'), findsOneWidget);

    // Sine in degrees and panning.
    await tester.tap(find.text('Sine'));
    await tester.pump();
    expect(_readout(tester, 'readout-roots'), contains('x = 0.00°'));
    await tester.drag(find.byKey(const ValueKey('plot-canvas')), const Offset(200, 0));
    await tester.pump(const Duration(milliseconds: 500)); // let the double-tap timer expire
    expect(tester.takeException(), isNull);
  });
}
