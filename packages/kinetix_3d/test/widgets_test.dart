import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

const _sizes = [Size(1920, 1080), Size(1280, 720), Size(400, 800)];

Future<void> _pump(WidgetTester tester, Widget child, {Size size = const Size(1280, 720), bool dark = true}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: dark ? KinetixTheme.boardChrome() : KinetixTheme.light(),
    home: Scaffold(body: child),
  ));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  for (final dark in [true, false]) {
    for (final size in _sizes) {
      testWidgets('every model renders at ${size.width.toInt()}×${size.height.toInt()} (${dark ? 'dark' : 'light'})', (tester) async {
        for (final id in ModelCatalogue.ids) {
          await _pump(tester, ModelView(key: ValueKey(id), id: id), size: size, dark: dark);
          expect(tester.takeException(), isNull, reason: id);
          expect(find.byKey(const ValueKey('kx3d-canvas')), findsOneWidget, reason: id);
        }
        // Unmount so running tickers (animated models) stop.
        await tester.pumpWidget(const SizedBox());
      });
    }
  }

  testWidgets('an unknown id shows a message instead of failing', (tester) async {
    await _pump(tester, const ModelView(id: 'chem.unobtainium'));
    expect(find.textContaining('chem.unobtainium'), findsOneWidget);
  });

  testWidgets('drag rotates, double-tap resets, toolbar toggles', (tester) async {
    final ctrl = ModelViewController(yaw: -18, pitch: 12);
    await _pump(tester, ModelViewer(model: ChemistryModels.water(), controller: ctrl));
    final canvas = find.byKey(const ValueKey('kx3d-canvas'));
    await tester.drag(canvas, const Offset(200, 60));
    await tester.pump();
    expect(ctrl.camera.yaw, isNot(closeTo(-18, 1)));
    expect(ctrl.camera.pitch, greaterThan(12));

    await tester.tap(canvas);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tap(canvas);
    await tester.pump(const Duration(milliseconds: 400));
    expect(ctrl.camera.yaw, closeTo(-18, 1e-9));
    expect(ctrl.camera.pitch, closeTo(12, 1e-9));

    await tester.tap(find.byTooltip('Labels'));
    await tester.pump();
    expect(ctrl.labels, isFalse);
    await tester.tap(find.byTooltip('Wireframe'));
    await tester.pump();
    expect(ctrl.wireframe, isTrue);
    await tester.tap(find.byTooltip('Auto-rotate'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(ctrl.camera.yaw, isNot(closeTo(-18, 1)));
    await tester.tap(find.byTooltip('Auto-rotate'));
    await tester.pump();
  });

  testWidgets('tapping a part selects it and shows its name', (tester) async {
    final ctrl = ModelViewController(yaw: -10, pitch: 34, playing: false);
    await _pump(tester, ModelViewer(model: AstronomyModels.solarSystem(), controller: ctrl), size: const Size(1280, 720));
    // The Sun sits at the centre of the view.
    await tester.tapAt(const Offset(640, 360));
    await tester.pump(const Duration(milliseconds: 400));
    expect(ctrl.selectedPartId, 'sun');
    expect(find.text('Sun'), findsWidgets);
    expect(find.textContaining('A star'), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pump();
    expect(ctrl.selectedPartId, isNull);
  });

  testWidgets('pinch-free zoom: scrolling zooms in and out', (tester) async {
    final ctrl = ModelViewController();
    await _pump(tester, ModelViewer(model: Solid(SolidKind.cube).toModel(), controller: ctrl));
    final center = tester.getCenter(find.byKey(const ValueKey('kx3d-canvas')));
    final pointer = TestPointer(1, PointerDeviceKind.mouse);
    await tester.sendEventToBinding(pointer.hover(center));
    await tester.sendEventToBinding(pointer.scroll(const Offset(0, -300)));
    await tester.pump();
    expect(ctrl.camera.zoom, greaterThan(1));
  });

  testWidgets('moving a dimension slider updates the measurements', (tester) async {
    await _pump(tester, const SolidExplorer(kind: SolidKind.cone), size: const Size(1920, 1080));
    expect(find.text('37.70 cm³'), findsOneWidget);
    expect(find.text('5.00 cm'), findsOneWidget); // slant height for r = 3, h = 4
    await tester.drag(find.byKey(const ValueKey('dim-r')), const Offset(120, 0));
    await tester.pump();
    expect(find.text('37.70 cm³'), findsNothing);

    // π = 22/7.
    await tester.tap(find.byTooltip('Reset dimensions'));
    await tester.pump();
    await tester.tap(find.text('22/7'));
    await tester.pump();
    expect(find.text('37.71 cm³'), findsOneWidget);
    expect(find.textContaining('22/7 × 3.00² × 4.00'), findsOneWidget);
  });

  testWidgets('solid explorer stacks in a narrow pane and stays scrollable', (tester) async {
    await _pump(tester, const SolidExplorer(kind: SolidKind.frustum), size: const Size(360, 640));
    expect(tester.takeException(), isNull);
    await tester.dragUntilVisible(find.text('Total surface area'), find.byType(ListView), const Offset(0, -200));
    expect(find.text('Total surface area'), findsOneWidget);
  });
}
