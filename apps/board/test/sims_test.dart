import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/sims/sims.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final l = lookupAppLocalizations(const Locale('en'));

  group('simulation numbers', () {
    test('pendulum period, projectile range, fractions, waves and Pythagoras', () {
      expect(simReadouts(l, SimKind.pendulum, defaultSimParams(SimKind.pendulum)), contains('T ≈ 2.01 s'));
      final p = simReadouts(l, SimKind.projectile, defaultSimParams(SimKind.projectile));
      // 20 m/s at 45°: R = v²/g = 40.8 m, H = R/4, t = √2·v/g.
      expect(p, containsAll(['Range 40.8 m', 'Max height 10.2 m', 'Time 2.89 s']));
      expect(simReadouts(l, SimKind.fractions, defaultSimParams(SimKind.fractions)), ['1/2 = 2/4', '1/2 + 2/4 = 1/1']);
      expect(simReadouts(l, SimKind.fractions, {'n1': 1, 'd1': 3, 'n2': 1, 'd2': 2}), ['1/3 < 1/2', '1/3 + 1/2 = 5/6']);
      expect(simReadouts(l, SimKind.wave, defaultSimParams(SimKind.wave)).last, 'v = fλ = 4.0 m/s');
      expect(simReadouts(l, SimKind.pythagoras, defaultSimParams(SimKind.pythagoras)), ['a² + b² = 9 + 16 = 25', 'c = √25 ≈ 5.00']);
      expect(fmtNum(2.50), '2.5');
      expect(fmtNum(3), '3');
    });
  });

  group('simulation window', () {
    Future<List<ActiveSim>> pumpWindow(WidgetTester tester, SimKind kind) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final changes = <ActiveSim>[];
      var sim = ActiveSim.of(kind);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => Center(
                child: SizedBox(
                  width: 600,
                  height: 580,
                  child: SimWindow(
                    sim: sim,
                    onChanged: (s) => setState(() {
                      changes.add(s);
                      sim = s;
                    }),
                    onClose: () {},
                    onDrag: (_) {},
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      return changes;
    }

    for (final kind in SimKind.values) {
      testWidgets('${kind.name} draws, animates and fits', (tester) async {
        await pumpWindow(tester, kind);
        expect(find.byKey(Key('sim-${kind.name}')), findsOneWidget);
        expect(find.text(simName(l, kind)), findsOneWidget);
        await tester.pump(const Duration(milliseconds: 500));
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('a slider changes the pendulum and its period', (tester) async {
      final changes = await pumpWindow(tester, SimKind.pendulum);
      await tester.drag(find.byKey(const Key('sim-slider-length')), const Offset(200, 0));
      await tester.pump();
      expect(changes, isNotEmpty);
      expect((changes.last.params['length'] as num).toDouble(), greaterThan(1));
      expect(find.textContaining('T ≈ 2.01 s'), findsNothing);
    });

    testWidgets('the fraction steppers count up and down', (tester) async {
      final changes = await pumpWindow(tester, SimKind.fractions);
      await tester.tap(find.byKey(const Key('sim-n1-up')));
      await tester.pump();
      expect(changes.last.params['n1'], 2);
      expect(find.text('2/2 > 2/4'), findsOneWidget);
    });

    testWidgets('the grapher draws what is typed, and says when it cannot read it', (tester) async {
      final changes = await pumpWindow(tester, SimKind.grapher);
      await tester.enterText(find.byKey(const Key('sim-expr')), 'sin(x');
      await tester.tap(find.byKey(const Key('sim-expr-go')));
      await tester.pump();
      expect(find.text('Cannot read that expression'), findsOneWidget);
      expect(changes, isEmpty);
      await tester.enterText(find.byKey(const Key('sim-expr')), '2x + 1');
      await tester.tap(find.byKey(const Key('sim-expr-go')));
      await tester.pump();
      expect(changes.last.params['expr'], '2x + 1');
      expect(find.text('y = 2x + 1'), findsOneWidget);
    });

    testWidgets('another simulation from the menu', (tester) async {
      final changes = await pumpWindow(tester, SimKind.wave);
      await tester.tap(find.byKey(const Key('sim-switch')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.tap(find.text('Projectile motion').last);
      await tester.pump(const Duration(seconds: 1));
      expect(changes.last.kind, SimKind.projectile);
    });
  });

  testWidgets('the board opens a simulation from Add and closes it', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
    await tester.pump();
    await tester.tap(find.byKey(const Key('tool-insert')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('insert-simulation')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('open-sim-pythagoras')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sim-window')), findsOneWidget);
    expect(find.text('Pythagoras theorem'), findsOneWidget);
    await tester.tap(find.byKey(const Key('sim-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sim-window')), findsNothing);
  });
}
