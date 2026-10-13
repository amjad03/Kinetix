// The board's words on screen, in every panel, popover and dialog: a board set to Hindi or
// Kannada shows no English of its own (the class's own data, product names, units, symbols and
// the English dictionary and key dates may stay in Latin script), and no board shows a debug
// banner, TODO or placeholder text.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart' show ToolbarDock;
import 'package:kinetix_board/features/board/chrome.dart' show ChromeTile, PopoverScroll, ToolButton;
import 'package:kinetix_board/features/board/layout/tool_palette.dart';
import 'package:kinetix_board/features/board/sb_strings.dart';
import 'package:kinetix_board/features/sim_hub/sim_entry.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:kinetix_ink/kinetix_ink.dart' show WhiteboardCanvas;

import 'screens/screens_test.dart' show ScreenSize, Shot, sampleContent, scenes, sizes;
import 'support/fake_cloud.dart';
import 'support/screen_fonts.dart';

final _latin = RegExp(r"[A-Za-z][A-Za-z’'-]*[A-Za-z]");

Iterable<String> _words(String text) => _latin.allMatches(text).map((m) => m[0]!);

/// Names that are written in Latin script in every language (removed before looking for words).
const _names = ['KINETIX Teacher App', 'KINETIX Student App', 'Teacher App', 'Student App', 'KINETIX Board', 'KINETIX AI', 'Connect to board'];

/// Words that stay in Latin script in every language: product, font and file names, standards,
/// keys of the keyboard, units, maths and logic, and the class's own data
/// (test/support/fake_cloud.dart) and the simulations' titles and credits.
Set<String> _allowed() {
  final words = <String>{
    'KINETIX',
    'PhET',
    'Google',
    'Wikipedia',
    'WhatsApp',
    'YouTube',
    'PowerPoint',
    'Keynote',
    'GeoGebra',
    'Blockly',
    'Python',
    'NCERT',
    'CBSE',
    'ERP',
    'PIN',
    'OTP',
    'MCQ',
    'LKG',
    'UKG',
    'English',
    'Andika',
    'Kalam',
    'Inter',
    'PDF',
    'PPT',
    'PPTX',
    'JPG',
    'PNG',
    'SVG',
    'CSV',
    'Wi-Fi',
    'USB',
    'HDMI',
    'Bluetooth',
    'Android',
    'Windows',
    'macOS',
    'LaTeX',
    'KWL',
    'SWOT',
    'DNA',
    'RNA',
    'ATP',
    'III',
    'Tab',
    'Enter',
    'Space',
    'Esc',
    'Ctrl',
    'Shift',
    'AND',
    'NAND',
    'NOR',
    'NOT',
    'XOR',
    'XNOR',
    'BUFFER',
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'cosec',
    'log',
    'sqrt',
    'max',
    'min',
    'mod',
    'abs',
    'cm',
    'mm',
    'px',
    'kg',
    'dB',
    'Hz',
    'kHz',
    'MB',
    'GB',
    'am',
    'pm',
  };
  words.addAll(_words(File('test/support/fake_cloud.dart').readAsStringSync()));
  for (final e in simCatalogue) {
    words.addAll(_words('${e.title} ${e.source} ${e.licence} ${e.note ?? ''}'));
  }
  return words;
}

/// Content that is English by nature, allowed only on its own screen.
final _content = <String, List<String>>{
  'dictionary': ['assets/dictionary/hi_kn.tsv', 'assets/dictionary/wordnet.tsv'],
  'key-dates': ['assets/history/key_dates.tsv', 'assets/history/key_dates_hi_kn.tsv', 'lib/features/board/kit/subject_data.dart'],
};

/// Every word in Latin script on screen (text, text fields, tooltips) that [allowed] does not
/// have, with the text it is in.
Map<String, String> latinOnScreen(Set<String> allowed) {
  final found = <String, String>{};
  void check(String? text) {
    var t = text ?? '';
    for (final n in _names) {
      t = t.replaceAll(n, ' ');
    }
    // Web addresses are data (a school's model server), the same in every language.
    t = t.replaceAll(RegExp(r'https?://\S*'), ' ');
    for (final w in _words(t)) {
      if (w.length >= 3 && !allowed.contains(w)) found[w] = text!.length > 80 ? '${text.substring(0, 80)}…' : text;
    }
  }

  for (final e in find.byType(RichText).evaluate()) {
    check((e.widget as RichText).text.toPlainText());
  }
  for (final e in find.byType(EditableText).evaluate()) {
    check((e.widget as EditableText).controller.text);
  }
  for (final e in find.byType(Tooltip).evaluate()) {
    check((e.widget as Tooltip).message);
  }
  return found;
}

/// Placeholder and unfinished text, in any language.
final _unfinished = RegExp(r'\b(TODO|FIXME|TBD|Lorem ipsum|lorem ipsum|placeholder text|not bundled yet|coming soon|Coming soon)\b');

void main() {
  setUpAll(loadScreenFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async => ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  group('string tables', () {
    Set<String> placeholders(String s) => RegExp(r'\{(\w+)\}').allMatches(s).map((m) => m[1]!).toSet();
    void complete(String name, Map<String, Map<String, String>> table) {
      final en = table['en']!;
      for (final lang in ['hi', 'kn']) {
        final other = table[lang]!;
        for (final e in en.entries) {
          expect(other[e.key], isA<String>(), reason: '$name: $lang is missing ${e.key}');
          expect(placeholders(other[e.key]!), placeholders(e.value), reason: '$name $lang ${e.key}');
        }
      }
    }

    test('the smartboard strings and the Simulations hub have every English string in Hindi and Kannada', () {
      complete('SbStrings', SbStrings.table);
      complete('simHubStrings', simHubStringTable);
      for (final s in simSubjects) {
        expect(simHubStringTable['en']![s], isNotNull, reason: s);
      }
    });

    test('no TODO or placeholder text in what the board shows', () {
      final bad = <String>[];
      for (final dir in ['lib', '../../packages/kinetix_ink/lib', '../../packages/kinetix_ui/lib', '../../packages/kinetix_3d/lib']) {
        for (final f in Directory(dir).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart') && !f.path.contains('/gen/'))) {
          for (final (i, line) in f.readAsLinesSync().indexed) {
            // Strings only: a comment may say what is left to do.
            final code = line.trimLeft().startsWith('//') ? '' : line;
            for (final m in RegExp(r"'([^'\\]|\\.)*'").allMatches(code)) {
              if (_unfinished.hasMatch(m[0]!)) bad.add('${f.path}:${i + 1}: ${m[0]}');
            }
          }
        }
      }
      expect(bad, isEmpty);
    });
  });

  testWidgets('a tool has the same colour on the toolbar, in the tools drawer and in the AI panel', (tester) async {
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = await enrolledBoard();
    board.onPaired('session-token', sessionIn('en'));
    board.setToolbarTools(phone: false, ids: ['pen', 'laser', 'calculator', 'ruler', 'timer', 'models3d', 'drawer:seating-chart', 'tools', 'ai']);
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    final s = Shot(tester, board, sizes.first);
    await s.settle();
    if (find.text('Not now').evaluate().isNotEmpty) {
      await tester.tap(find.text('Not now'));
      await s.settle();
    }
    await s.tap('tool-tools');
    final drawer = {for (final e in find.byType(ChromeTile).evaluate()) (e.widget.key! as ValueKey<String>).value.replaceFirst('drawer-', ''): (e.widget as ChromeTile).color};
    for (final c in drawer.values) {
      expect(ToolPalette.all, contains(c), reason: 'every drawer tile uses the palette');
    }
    await s.tap('tool-tools');
    Color? bar(String key) => tester.widget<ToolButton>(find.byKey(Key(key))).iconColor;
    for (final (key, id) in [
      ('tool-laser', 'laser'),
      ('tbar-calculator', 'calculator'),
      ('tbar-ruler', 'ruler'),
      ('tbar-timer', 'toolkit-timer'),
      ('tbar-models3d', 'models3d'),
      ('tbar-drawer-seating-chart', 'seating-chart'),
    ]) {
      expect(bar(key), drawer[id], reason: '$key on the toolbar and $id in the drawer');
    }
    await s.tap('panel-ai');
    Color? tile(String key) => tester.widget<ChromeTile>(find.byKey(Key(key))).color;
    for (final (key, id) in [
      ('smart-calculator', 'calculator'),
      ('smart-periodic', 'periodic-table'),
      ('smart-dictionary', 'dictionary'),
      ('ai-tool-quiz', 'quick-quiz'),
      ('ai-open-model3d', 'models3d'),
      ('ai-open-lab.graph-plotter', 'graph-plotter'),
      ('ai-open-lab', 'labs'),
    ]) {
      expect(tile(key), drawer[id], reason: '$key in the AI panel and $id in the drawer');
    }
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  for (final size in const [Size(1180, 820), Size(1280, 720), Size(1440, 900), Size(1920, 1080)]) {
    final name = '${size.width.toInt()}×${size.height.toInt()}';
    testWidgets('$name: the toolbar clears the corners, popovers show their title, and the grip docks it', (tester) async {
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final board = await enrolledBoard();
      board.onPaired('session-token', sessionIn('en'));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      final s = Shot(tester, board, ScreenSize(name, size, 1));
      await s.settle();
      if (find.text('Not now').evaluate().isNotEmpty) {
        await tester.tap(find.text('Not now'));
        await s.settle();
      }
      Rect r(String key) => tester.getRect(find.byKey(Key(key)));
      final screen = Offset.zero & size;
      final bar = r('main-toolbar');
      expect(screen.contains(bar.topLeft) && screen.contains(bar.bottomRight - const Offset(1, 1)), isTrue, reason: 'on screen');
      for (final corner in ['quick-group', 'nav-extras', 'page-bar', 'board-menu', 'class-bar']) {
        expect(bar.overlaps(r(corner)), isFalse, reason: '$name: the toolbar covers $corner');
      }
      // The class bar and the search, clock and profile share the top row.
      expect(r('class-bar').overlaps(r('open-search')), isFalse);
      // A popover taller than the room opens at its top: its title is in sight, under the top bar.
      for (final (key, title) in [('tool-tools', 'Tools'), ('tool-pen', 'Pen'), ('tool-insert', 'Add')]) {
        await s.tap(key);
        // The first tap on the pen picks it; the next opens its settings.
        if (find.byType(PopoverScroll).evaluate().isEmpty) await s.tap(key);
        final t = find.descendant(of: find.byType(PopoverScroll), matching: find.text(title)).first;
        expect(tester.getRect(t).top, greaterThanOrEqualTo(56), reason: '$name $key');
        // Closed by a touch on the board beside it.
        await tester.tapAt(const Offset(24, 160));
        await s.settle();
        expect(find.byType(PopoverScroll), findsNothing, reason: '$name $key closes');
      }
      // The grip docks the toolbar left, right and back to the bottom.
      Future<void> drag(Offset to) async {
        final grip = tester.getCenter(find.byKey(const Key('toolbar-handle')));
        await tester.dragFrom(grip, to - grip);
        await s.settle();
      }

      await drag(Offset(40, size.height / 2));
      expect(board.toolbarDock, ToolbarDock.left);
      await drag(Offset(size.width - 40, size.height / 2));
      expect(board.toolbarDock, ToolbarDock.right);
      await drag(Offset(size.width / 2, size.height - 60));
      expect(board.toolbarDock, ToolbarDock.bottom);
      // Hide leaves the canvas and a restore button; restore brings everything back.
      await s.tap('hide-ui');
      expect(find.byKey(const Key('main-toolbar')), findsNothing);
      await s.tap('restore-ui');
      expect(find.byKey(const Key('main-toolbar')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }

  /// Opens each of [only] (every scene when null) on a board in [lang] at [screen]; returns the
  /// English words, unfinished text and overflows found.
  Future<List<String>> audit(WidgetTester tester, String lang, ScreenSize screen, {Set<String>? only}) async {
    tester.view
      ..physicalSize = screen.size * screen.dpr
      ..devicePixelRatio = screen.dpr
      ..padding = FakeViewPadding(top: screen.padding.top * screen.dpr, bottom: screen.padding.bottom * screen.dpr)
      ..viewPadding = FakeViewPadding(top: screen.padding.top * screen.dpr, bottom: screen.padding.bottom * screen.dpr);
    addTearDown(tester.view.reset);
    final allowed = _allowed();
    final found = <String>[];
    for (final scene in scenes) {
      if (only != null && !only.contains(scene.name)) continue;
      // The sign-in and enrolment screens are checked by l10n_test; a typed search is the teacher's.
      if ((scene.phoneOnly && !screen.phone) || (scene.panelOnly && screen.phone) || !scene.enrolled || scene.name == 'settings-search') continue;
      await tester.pumpWidget(const SizedBox());
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      final board = await enrolledBoard();
      if (scene.signedIn) board.onPaired('session-token', sessionIn(lang));
      board.setBoardLanguage(BoardLanguage.values.byName(lang));
      scene.before?.call(board);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      final s = Shot(tester, board, screen);
      await s.settle();
      final notNow = find.text(l10nFor(Locale(lang)).notNow);
      if (notNow.evaluate().isNotEmpty) {
        await tester.tap(notNow.first);
        await s.settle();
      }
      ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first)).removeCurrentSnackBar();
      if (scene.content && find.byType(WhiteboardCanvas).evaluate().isNotEmpty) sampleContent(s.wb);
      await s.settle();
      await scene.open?.call(s);
      await s.settle(12);
      expect(s.missing, isEmpty, reason: '${scene.name} at ${screen.name}');
      // Longer Hindi and Kannada words must not push anything out of its box.
      final error = tester.takeException();
      if (error != null) found.add('${scene.name}: $error'.split('\n').first);
      final words = {...allowed, for (final f in _content[scene.name] ?? const <String>[]) ..._words(File(f).readAsStringSync())};
      for (final e in latinOnScreen(words).entries) {
        found.add('${scene.name}: ${e.key} in "${e.value}"');
      }
      for (final e in find.byType(RichText).evaluate()) {
        final t = (e.widget as RichText).text.toPlainText();
        if (_unfinished.hasMatch(t)) found.add('${scene.name}: unfinished "$t"');
      }
      expect(find.byType(CheckedModeBanner), findsNothing, reason: scene.name);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    }
    return found;
  }

  for (final lang in ['hi', 'kn']) {
    testWidgets('$lang: every screen, panel and dialog of a panel is in $lang and fits', (tester) async {
      expect(await audit(tester, lang, sizes.first), isEmpty);
    }, timeout: const Timeout(Duration(minutes: 15)));

    testWidgets('$lang: the newer panels fit a phone and are in $lang', (tester) async {
      final phone = sizes.firstWhere((s) => s.name == 'phone');
      const panels = {'sim-hub', 'models3d', 'mind-map', 'organisers', 'logic-gates', 'pen-config', 'noise-meter', 'classrooms', 'training', 'seat-plan', 'exit-ticket', 'dictionary', 'periodic-table', 'key-dates', 'more-sheet'};
      expect(await audit(tester, lang, phone, only: panels), isEmpty);
    }, timeout: const Timeout(Duration(minutes: 10)));
  }
}
