import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/canvas_tools/canvas_tools.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late WhiteboardController wb;

  setUp(() {
    SharedPreferences.setMockInitialValues({'canvasTools.pxPerCm': 50.0});
    wb = WhiteboardController();
  });
  tearDown(() => wb.dispose());

  Future<BuildContext> pump(WidgetTester tester, {Widget? body, Locale? locale}) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: locale,
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
        home: Scaffold(body: body ?? WhiteboardCanvas(controller: wb)),
      ),
    );
    return tester.element(find.byType(Scaffold));
  }

  testWidgets('each geometry tool opens on the board, several at once, with the saved calibration', (tester) async {
    final context = await pump(tester);
    CanvasTools.openRuler(context, wb);
    CanvasTools.openProtractor(context, wb);
    CanvasTools.openProtractor360(context, wb);
    CanvasTools.openSetSquare45(context, wb);
    CanvasTools.openSetSquare3060(context, wb);
    CanvasTools.openCompass(context, wb);
    await CanvasTools.loadCalibration();
    await tester.pump();
    expect(wb.geoTools.value.map((t) => t.kind), GeoKind.values);
    expect(GeoCalibration.pxPerCm.value, 50);
    expect(find.byType(GeoToolsOverlay), findsOneWidget);
    // A change is saved for this device.
    GeoCalibration.inches.value = true;
    GeoCalibration.onChanged!();
    await tester.pump();
    expect((await SharedPreferences.getInstance()).getBool('canvasTools.inches'), isTrue);
    GeoCalibration.inches.value = false;
  });

  testWidgets('insert flowchart starts a selected Start block with its + buttons', (tester) async {
    final context = await pump(tester);
    final done = CanvasTools.insertFlowchart(context, wb);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('insert-flowchart')));
    await done;
    await tester.pumpAndSettle();
    final n = wb.selectedElements.single as FlowNodeElement;
    expect((n.shape, n.text), (FlowBlock.terminal, 'Start'));
    expect(find.byKey(const Key('flow-plus-right')), findsOneWidget);
  });

  testWidgets('a mind map opens the mind map tool, in Hindi, with its own centre topic', (tester) async {
    final context = await pump(tester, locale: const Locale('hi'));
    CanvasTools.insertFlowchart(context, wb);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('insert-mindmap')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mind-map')), findsOneWidget);
    expect(find.text('मुख्य विषय'), findsOneWidget);
    expect(wb.elements, isEmpty, reason: 'nothing is on the board until Put on board');
  });

  testWidgets('the graph panel preselects from the period topic and adds the graph', (tester) async {
    await pump(
      tester,
      body: CanvasTools.graphTemplatesPanel(controller: wb, subject: 'Economics', topic: 'Market equilibrium'),
    );
    expect(find.byKey(const Key('graph-template-demandSupply')), findsOneWidget);
    expect(find.byKey(const Key('graph-template-linear')), findsNothing); // another subject
    await tester.tap(find.byKey(const Key('graph-add')));
    await tester.pump();
    final g = wb.elements.single as GraphElement;
    expect(g.curves, isNotEmpty);
    expect(g.points.single.label, 'E');
    expect(g.title, 'Demand and supply');
  });

  testWidgets('search and subject narrow the graphs', (tester) async {
    await pump(tester, body: CanvasTools.graphTemplatesPanel(controller: wb));
    await tester.enterText(find.byKey(const Key('graph-search')), 'titration');
    await tester.pump();
    expect(find.byKey(const Key('graph-template-titration')), findsOneWidget);
    expect(find.byKey(const Key('graph-template-ohm')), findsNothing);
    await tester.enterText(find.byKey(const Key('graph-search')), 'zzz');
    await tester.pump();
    expect(find.text('No graph matches that search.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('graph-search')), '');
    await tester.tap(find.byKey(const Key('graph-subject')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Physics').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('graph-template-vt')), findsOneWidget);
    expect(find.byKey(const Key('graph-template-titration')), findsNothing);
    await tester.tap(find.byKey(const Key('graph-template-shm')));
    await tester.pump(const Duration(milliseconds: 400)); // past the double-tap wait
    await tester.tap(find.byKey(const Key('graph-add')));
    await tester.pump();
    expect((wb.elements.single as GraphElement).title, 'Simple harmonic motion');
  });
}
