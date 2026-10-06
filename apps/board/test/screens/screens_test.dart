// Screenshots of every screen, panel, popover, dialog and sheet of the board, at the sizes it
// runs at (a 1080p and a 4K panel, a phone upright and on its side), in its three themes and in
// English, Hindi and Kannada, for reviewing the layout by eye.
//
//   KINETIX_SCREENS=1 flutter test test/screens/screens_test.dart
//
// writes test/screens/goldens/<size>/<theme>-<language>/<scene>.png and, beside them,
// problems.txt (overflows and exceptions, by scene) and missing.txt (scenes whose control was
// not found). Narrow it down with KINETIX_SCREENS_SIZES=panel,phone,
// KINETIX_SCREENS_THEMES=dark, KINETIX_SCREENS_LANGS=hi and KINETIX_SCREENS_ONLY=settings,pages.
// Without KINETIX_SCREENS the test is skipped (it takes a few minutes).
@Tags(['screens'])
library;

import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_cloud.dart';
import '../support/screen_fonts.dart';

final _env = Platform.environment;
final _enabled = _env['KINETIX_SCREENS'] != null;
Set<String>? _filter(String name) {
  final v = _env[name];
  return v == null || v.isEmpty ? null : v.split(',').map((s) => s.trim()).toSet();
}

/// A screen the board runs on: its logical size, pixel ratio and system bars.
class ScreenSize {
  const ScreenSize(this.name, this.size, this.dpr, [this.padding = EdgeInsets.zero]);
  final String name;
  final Size size;
  final double dpr;
  final EdgeInsets padding;
  bool get phone => size.shortestSide < 600;
}

const sizes = [
  ScreenSize('panel', Size(1920, 1080), 1),
  // A 4K panel: Android panels report 1920×1080 at twice the density.
  ScreenSize('4k', Size(1920, 1080), 2),
  ScreenSize('phone', Size(390, 844), 2, EdgeInsets.only(top: 32, bottom: 16)),
  ScreenSize('phone-land', Size(844, 390), 2, EdgeInsets.only(left: 32, top: 24, bottom: 12)),
];

/// What a scene sees: the tester, the board and how to reach its controls.
class Shot {
  Shot(this.tester, this.board, this.screen);
  final WidgetTester tester;
  final BoardController board;
  final ScreenSize screen;
  bool get phone => screen.phone;
  final missing = <String>[];

  WhiteboardController get wb => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;

  Future<void> settle([int frames = 8]) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    for (var i = 0; i < frames; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  bool has(String key) => find.byKey(Key(key)).evaluate().isNotEmpty;

  /// Taps [key] on screen, or in the phone's ⋯ sheet. Returns false (and notes it) when it is
  /// nowhere to be found.
  Future<bool> tap(String key, {bool quiet = false}) async {
    var f = find.byKey(Key(key));
    if (f.evaluate().isEmpty && has('phone-more') && !has('more-sheet')) {
      await tester.tap(find.byKey(const Key('phone-more')));
      await settle();
      if (f.evaluate().isEmpty) {
        Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
        await settle();
      }
    }
    f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      if (!quiet) missing.add(key);
      return false;
    }
    await tester.ensureVisible(f.first);
    await settle(3);
    await tester.tap(f.first, warnIfMissed: false);
    await settle();
    return true;
  }

  /// A menu item (bottom left on a panel; ⋮ on a phone).
  Future<bool> menu(String key) async => await tap('board-menu') && await tap(key);

  /// An item of the profile menu (the avatar; on a phone, in ⋮).
  Future<bool> profile(String key) async {
    if (phone) return await tap('board-menu') && await tap('profile-button') && await tap(key);
    return await tap('profile-button') && await tap(key);
  }

  /// A tile of the tools drawer.
  Future<bool> tool(String id) async => await tap('tool-tools') && await tap('drawer-$id');

  Future<bool> tab(String name) async {
    if (!has('split-panel')) await tap('panel-ai');
    return tap('panel-tab-$name');
  }
}

/// A scene: what to do before the board is shown (settings), and how to open it.
class Scene {
  const Scene(this.name, this.open, {this.before, this.content = true, this.panelOnly = false, this.phoneOnly = false, this.signedIn = true, this.enrolled = true});
  final String name;
  final Future<void> Function(Shot s)? open;
  final void Function(BoardController b)? before;
  final bool content;
  final bool panelOnly;
  final bool phoneOnly;
  final bool signedIn;
  final bool enrolled;
}

Future<void> _none(Shot s) async {}

final scenes = <Scene>[
  const Scene('board', _none),
  const Scene('board-empty', _none, content: false),
  const Scene('guest', _none, signedIn: false),
  const Scene('enroll', null, enrolled: false),
  Scene('toolbar-left', _none, before: (b) => b.setToolbarDock(ToolbarDock.left), panelOnly: true),
  Scene('toolbar-collapsed', _none, before: (b) => b.setToolbarCollapsed(true), panelOnly: true),
  Scene('pen', (s) async {
    await s.tap('tool-pen');
    if (!s.has('pen-popover')) await s.tap('tool-pen');
  }),
  Scene('ai-pen', (s) async {
    await s.tap('tool-ai-pen');
  }),
  Scene('erase', (s) async {
    await s.tap('tool-erase');
    await s.tap('tool-erase');
  }),
  Scene('shapes', (s) => s.tap('tool-shapes')),
  Scene('tools', (s) => s.tap('tool-tools')),
  Scene('insert', (s) => s.tap('tool-insert')),
  Scene('menu', (s) => s.tap('board-menu')),
  Scene('profile', (s) async => s.phone ? await s.tap('board-menu') && await s.tap('profile-button') : await s.tap('profile-button')),
  Scene('background', (s) => s.menu('tool-theme')),
  Scene('eye-comfort', (s) => s.menu('menu-eye-comfort')),
  Scene('pages', (s) => s.tap('page-overview')),
  Scene('pages-many', (s) async {
    for (var i = 0; i < 5; i++) {
      s.wb.addPage();
    }
    await s.settle();
    await s.tap('page-overview');
  }),
  Scene('more-sheet', (s) => s.tap('phone-more'), phoneOnly: true),
  Scene('settings', (s) => s.menu('menu-settings')),
  Scene('settings-search', (s) async {
    if (await s.menu('menu-settings')) {
      final field = find.descendant(of: find.byKey(const Key('settings-search')), matching: find.byType(TextField));
      await s.tester.enterText(field, 'pen');
      await s.settle();
    }
  }),
  Scene('search', (s) => s.tap('open-search')),
  Scene('whiteboards', (s) => s.menu('menu-open')),
  Scene('save', (s) => s.menu('save-board')),
  Scene('end-class', (s) => s.menu('end-class')),
  Scene('clear-confirm', (s) => s.menu('clear-board')),
  Scene('attendance', (s) async => s.phone ? s.menu('attendance-chip') : s.tap('attendance-chip')),
  Scene('help', (s) => s.profile('menu-help')),
  Scene('recordings', (s) => s.profile('menu-recordings')),
  Scene('projector', (s) => s.profile('menu-projector')),
  Scene('sign-in', (s) => s.tap('sign-in-chip'), signedIn: false),
  Scene('panel-ai', (s) => s.tab('ai')),
  Scene('panel-ai-full', (s) async {
    await s.tab('ai');
    await s.tap('panel-full');
  }, panelOnly: true),
  Scene('panel-3d', (s) => s.tab('model3d')),
  Scene('panel-labs', (s) => s.tab('labs')),
  Scene('panel-videos', (s) => s.tab('videos')),
  Scene('panel-books', (s) => s.tab('books')),
  Scene('panel-kit', (s) => s.tab('kit')),
  Scene('panel-animations', (s) => s.tab('animations')),
  Scene('panel-phet', (s) => s.tab('sims')),
  Scene('selection-shape', (s) async {
    s.wb.tool = BoardTool.select;
    s.wb.select({s.wb.elements.whereType<Stroke>().last.id});
    await s.settle();
  }),
  Scene('sims', (s) => s.tool('sims')),
  Scene('calculator', (s) => s.tool('calculator')),
  Scene('ask-class', (s) => s.tool('ask-class')),
  Scene('todays-plan', (s) => s.tool('todays-plan')),
  Scene('quiz', (s) => s.tool('quick-quiz')),
  Scene('badges', (s) => s.tool('badges')),
  Scene('graphs', (s) => s.tool('graphs')),
  Scene('timer', (s) => s.tool('toolkit-timer')),
  Scene('picker', (s) => s.tool('toolkit-picker')),
  Scene('selection', (s) async {
    s.wb.tool = BoardTool.select;
    s.wb.selectAll();
    await s.settle();
  }),
  Scene('preview-smartboard', (s) async {
    (s.board as dynamic).setPanelPreview(true);
    await s.settle();
  }, phoneOnly: true),
];

/// Ink, a heading and a shape on the page, so the board shows how they look on its paper.
void _sampleContent(WhiteboardController wb) {
  Stroke line(List<Offset> pts, Color c, [double w = 4]) =>
      Stroke(id: newElementId(), style: InkStyle(tool: InkTool.pen, color: c, width: w), points: [for (final p in pts) InkPoint(p.dx, p.dy)]);
  final wave = [for (var x = 0; x <= 60; x++) Offset(160 + x * 8.0, 330 + 40 * (x % 12 < 6 ? (x % 6) / 6 : 1 - (x % 6) / 6))];
  wb.insert([
    TextElement(id: newElementId(), position: const Offset(160, 180), text: 'Photosynthesis', color: WhiteboardController.inkBlack, fontSize: 56, size: measureBoardText('Photosynthesis', 56)),
    line(wave, WhiteboardController.inkBlack, 5),
    Stroke(
      id: newElementId(),
      style: const InkStyle(tool: InkTool.pen, color: Color(0xFF1A73E8), width: 4),
      points: shapePoints(ShapeKind.rectangle, const Offset(160, 460), const Offset(520, 640)),
      shape: ShapeKind.rectangle,
    ),
    line([for (var a = 0; a <= 72; a++) Offset(760 + 110 * cosD(a * 5), 550 + 110 * sinD(a * 5))], const Color(0xFFD93025), 4),
  ]);
  wb
    ..clearSelection()
    ..tool = BoardTool.pen;
}

double cosD(num deg) => _cos(deg * 3.141592653589793 / 180);
double sinD(num deg) => _sin(deg * 3.141592653589793 / 180);
double _cos(double r) => ui.Offset.fromDirection(r).dx;
double _sin(double r) => ui.Offset.fromDirection(r).dy;

void main() {
  setUpAll(loadScreenFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async =>
        ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  final onlySizes = _filter('KINETIX_SCREENS_SIZES');
  final onlyThemes = _filter('KINETIX_SCREENS_THEMES');
  final onlyLangs = _filter('KINETIX_SCREENS_LANGS');
  final onlyScenes = _filter('KINETIX_SCREENS_ONLY');

  // English everywhere; Hindi and Kannada on a 1080p panel and a phone, in the light theme.
  final variants = <(ScreenSize, BoardTheme, String)>[
    for (final s in sizes)
      for (final t in [BoardTheme.light, BoardTheme.dark, BoardTheme.chalkboard]) (s, t, 'en'),
    for (final s in sizes.where((s) => s.name == 'panel' || s.name == 'phone'))
      for (final lang in ['hi', 'kn']) (s, BoardTheme.light, lang),
  ];

  for (final (screen, theme, lang) in variants) {
    if (onlySizes != null && !onlySizes.contains(screen.name)) continue;
    if (onlyThemes != null && !onlyThemes.contains(theme.name)) continue;
    if (onlyLangs != null && !onlyLangs.contains(lang)) continue;
    final dir = 'test/screens/goldens/${screen.name}/${theme.name}-$lang';
    testWidgets('screens: ${screen.name}, ${theme.name}, $lang', skip: !_enabled, (tester) async {
      tester.view
        ..physicalSize = screen.size * screen.dpr
        ..devicePixelRatio = screen.dpr
        ..padding = FakeViewPadding(left: screen.padding.left * screen.dpr, top: screen.padding.top * screen.dpr, right: screen.padding.right * screen.dpr, bottom: screen.padding.bottom * screen.dpr)
        ..viewPadding = FakeViewPadding(left: screen.padding.left * screen.dpr, top: screen.padding.top * screen.dpr, right: screen.padding.right * screen.dpr, bottom: screen.padding.bottom * screen.dpr);
      addTearDown(tester.view.reset);
      Directory(dir).createSync(recursive: true);
      final problems = <String>[];
      final missing = <String>[];
      final previous = FlutterError.onError;
      var step = '';
      FlutterError.onError = (d) {
        final at = RegExp(r'(lib|packages)/[\w/]+\.dart:\d+').allMatches(d.toString()).map((m) => m[0]).toSet().take(2).join(', ');
        problems.add('$step: ${d.exceptionAsString().split('\n').first} ($at)');
      };
      addTearDown(() => FlutterError.onError = previous);
      final shot = GlobalKey();
      var boards = <BoardController>[];
      for (final scene in scenes) {
        if (onlyScenes != null && !onlyScenes.contains(scene.name)) continue;
        if (scene.panelOnly && screen.phone) continue;
        if (scene.phoneOnly && !screen.phone) continue;
        step = scene.name;
        await tester.pumpWidget(const SizedBox());
        for (final b in boards) {
          b.dispose();
        }
        // Each scene starts from a new board's settings.
        SharedPreferences.setMockInitialValues({});
        FlutterSecureStorage.setMockInitialValues({});
        final BoardController board;
        if (scene.enrolled) {
          board = await enrolledBoard();
        } else {
          board = BoardController(outboxStore: MemoryOutboxStore(), realtimeFactory: (_) => NoRealtime())..stage = BoardStage.needsEnrollment;
        }
        boards = [board];
        if (scene.signedIn && scene.enrolled) board.onPaired('session-token', sessionIn(lang));
        if (!scene.signedIn || !scene.enrolled) board.setBoardLanguage(BoardLanguage.values.byName(lang));
        board.setTheme(theme);
        scene.before?.call(board);
        await tester.pumpWidget(RepaintBoundary(key: shot, child: KinetixBoardApp(controller: board)));
        final s = Shot(tester, board, screen);
        await s.settle();
        if (find.text('Not now').evaluate().isNotEmpty) {
          await tester.tap(find.text('Not now'));
          await s.settle();
        }
        if (scene.enrolled) {
          ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first)).removeCurrentSnackBar();
          if (scene.content && find.byType(WhiteboardCanvas).evaluate().isNotEmpty) _sampleContent(s.wb);
          await s.settle();
          if (scene.open != null) {
            try {
              await scene.open!(s);
            } catch (e) {
              problems.add('${scene.name}: $e'.split('\n').first);
            }
          }
          // Board messages pass in a few seconds; the screenshot shows the screen under them.
          await s.settle(12);
        }
        missing.addAll([for (final m in s.missing) '${scene.name}: $m']);
        final error = tester.takeException();
        if (error != null) problems.add('${scene.name}: $error'.split('\n').first);
        final png = await tester.runAsync(() async {
          final boundary = shot.currentContext!.findRenderObject()! as dynamic;
          final ui.Image image = await boundary.toImage(pixelRatio: screen.dpr);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          image.dispose();
          return data!.buffer.asUint8List();
        });
        File('$dir/${scene.name}.png').writeAsBytesSync(png!);
      }
      await tester.pumpWidget(const SizedBox());
      for (final b in boards) {
        b.dispose();
      }
      File('$dir/problems.txt').writeAsStringSync(problems.isEmpty ? '' : '${problems.join('\n')}\n');
      File('$dir/missing.txt').writeAsStringSync(missing.isEmpty ? '' : '${missing.join('\n')}\n');
    }, timeout: const Timeout(Duration(minutes: 30)));
  }
}
