import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/ai_pen_ui.dart';
import 'package:kinetix_board/features/board/selection_actions.dart';
import 'package:kinetix_board/l10n/gen/app_localizations.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

Stroke shape(ShapeKind k, Offset a, Offset b, {String id = 's'}) => Stroke(
  id: id,
  style: InkStyle(tool: InkTool.shape, color: Colors.black, width: 3, shape: k),
  shape: k,
  points: shapePoints(k, a, b),
);

void main() {
  Future<WhiteboardController> pump(WidgetTester tester, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: WhiteboardCanvas(
            controller: wb,
            selectionActions: (context, box) => SelectionActions(wb: wb, box: box),
          ),
        ),
      ),
    );
    wb.setView(const ViewState());
    wb.tool = BoardTool.select;
    await tester.pump();
    return wb;
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  testWidgets('panel: the bar floats above the selection and shows, hides and picks measurements', (tester) async {
    final wb = await pump(tester, const Size(1920, 1080));
    wb.add(shape(ShapeKind.rectangle, const Offset(600, 500), const Offset(900, 700)));
    wb.select({'s'});
    await tester.pumpAndSettle();
    final bar = tester.getRect(find.byKey(const Key('sel-measure')));
    expect(bar.bottom, lessThan(500)); // above the shape
    expect(tester.getSize(find.byKey(const Key('sel-measure'))).height, greaterThanOrEqualTo(44));

    // Off at first (the owner's report): one tap shows them all, another hides them.
    expect(wb.selectionMeasure.any, isFalse);
    await tapKey(tester, 'sel-measure');
    expect(measureOf(wb.elements.single), ShapeMeasure.all);
    await tapKey(tester, 'sel-measure-options');
    await tapKey(tester, 'sel-m-angles');
    expect(measureOf(wb.elements.single).angles, isFalse);
    await tapKey(tester, 'sel-measure-options');
    await tapKey(tester, 'sel-unit-px');
    expect(wb.measureUnit, MeasureUnit.px);
    await tapKey(tester, 'sel-measure');
    expect(measureOf(wb.elements.single).any, isFalse);
    wb.undo();
    expect(measureOf(wb.elements.single).lengths, isTrue);
    wb.select({'s'}); // undo clears the selection
    await tester.pumpAndSettle();

    // Line style, flip, lock.
    await tapKey(tester, 'sel-line-style');
    await tapKey(tester, 'sel-line-dashed');
    expect((wb.elements.single as Stroke).style.nib, PenNib.dashed);
    await tapKey(tester, 'sel-edit-points');
    expect(wb.editingPoints, isTrue);
    await tapKey(tester, 'sel-lock');
    expect(wb.selectionLocked, isTrue);
    expect(find.byKey(const Key('delete-selection')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('phone: a compact bar, the rest under More; handles still drag', (tester) async {
    final wb = await pump(tester, const Size(390, 844));
    wb.add(shape(ShapeKind.triangle, const Offset(80, 400), const Offset(260, 560)));
    wb.select({'s'});
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sel-more')), findsOneWidget);
    expect(find.byKey(const Key('sel-flip-h')), findsNothing);
    final barRight = tester.getRect(find.byKey(const Key('sel-more'))).right;
    expect(barRight, lessThanOrEqualTo(390));
    await tapKey(tester, 'sel-more');
    await tapKey(tester, 'more-flip-h');
    final flipped = wb.elements.single as Stroke;
    expect(flipped.vertices.first.dx, greaterThan(flipped.vertices.last.dx)); // left corner went right

    // The bottom-right handle, dragged by a finger.
    final box = wb.selectionBounds!.inflate(8);
    final g = await tester.startGesture(box.bottomRight, kind: PointerDeviceKind.touch);
    await g.moveTo(box.bottomRight + const Offset(20, 20));
    await g.moveTo(box.bottomRight + const Offset(45, 40));
    await g.up();
    await tester.pumpAndSettle();
    expect(wb.elements.single.bounds.width, greaterThan(box.width));
    expect(tester.takeException(), isNull);
  });

  testWidgets('AI pen options: measurements on new shapes are off until switched on, with units', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final board = BoardController()..skipEnrollment();
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: MeasureShapesSwitch(board: board)),
      ),
    );
    expect(board.measureShapes, isFalse);
    await tester.tap(find.byKey(const Key('measure-shapes')));
    await tester.pump();
    expect(board.measureShapes, isTrue);
    await tester.tap(find.text('px'));
    await tester.pump();
    expect(board.measureUnit, MeasureUnit.px);
  });
}
