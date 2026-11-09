// Start-up on slow panels: the lessons' catalogue is not read while the app starts, and the
// chapters and the question bank are decoded off the UI isolate. Also measures, on this test
// harness, how long the UI isolate is held up by each, with and without OffThread
// (`flutter test test/classroom_edition/startup_test.dart --reporter expanded` prints it).
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/lessons/lessons_panel.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/local/off_thread.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The longest the UI isolate went without running a 1 ms timer while [work] ran: how long a
/// frame would have waited.
Future<Duration> _longestStall(Future<void> Function() work) async {
  var longest = Duration.zero;
  final sw = Stopwatch()..start();
  var last = sw.elapsed;
  final t = Timer.periodic(const Duration(milliseconds: 1), (_) {
    final now = sw.elapsed;
    if (now - last > longest) longest = now - last;
    last = now;
  });
  await work();
  // One more tick, so a stall at the very end counts too.
  await Future<void>.delayed(const Duration(milliseconds: 2));
  t.cancel();
  return longest;
}

String _ms(Duration d) => '${(d.inMicroseconds / 1000).toStringAsFixed(1)} ms';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBoardFonts);
  setUp(() {
    OffThread.enabled = true;
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => OffThread.enabled = false);

  test('the catalogue is not read while the app starts; the start screen line asks for it', () async {
    final lib = LessonLibrary(bundle: rootBundle);
    LessonLibrary.instance = lib;
    installLessonHooks();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(lib.loaded, isNull, reason: 'installLessonHooks no longer loads the catalogue');
    final before = LessonLibrary.loadedCount.value;
    // The start screen asks for its "Next lesson" line: null now, and the catalogue loads.
    expect(nextLessonLineFor(const CeClass(id: 'c', year: 2, section: 'A'), 'Physics', library: lib), isNull);
    for (var i = 0; i < 100 && lib.loaded == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    expect(lib.loaded, isNotNull);
    expect(LessonLibrary.loadedCount.value, before + 1, reason: 'the start screen draws again');
    LessonLibrary.instance = LessonLibrary();
  });

  test('chapters and the bank decode off the UI isolate, with the same result', () async {
    final lib = LessonLibrary(bundle: rootBundle);
    final cat = await lib.catalogue();
    final id = cat.chapters.firstWhere((c) => c.id == 'puc1-chemistry-02-structure-of-atom', orElse: () => cat.chapters.first).id;
    final off = await lib.chapter(id);
    OffThread.enabled = false;
    final on = await LessonLibrary(bundle: rootBundle).chapter(id);
    expect(off.lessons.keys, on.lessons.keys);
    expect(off.questions.length, on.questions.length);
    OffThread.enabled = true;
    ClassBank.testBundle = rootBundle;
    addTearDown(() => ClassBank.testBundle = null);
    final bank = await ClassBank.load(year: 1, subject: 'Physics');
    expect(bank.chapters, isNotEmpty);
  });

  test('how long the UI isolate is held up (this harness; a panel is several times slower)', () async {
    final catalogueText = await rootBundle.loadString('${LessonLibrary.root}/catalogue.json', cache: false);
    final chapterIds = ['puc1-chemistry-02-structure-of-atom', 'puc2-physics-01-electric-charges-and-fields', 'puc1-biology-08-cell-the-unit-of-life'];
    final results = <String, (Duration, Duration)>{};

    Future<(Duration, Duration)> both(Future<void> Function() work) async {
      OffThread.enabled = false;
      await work(); // warm up the asset cache and the code
      final onUi = await _longestStall(work);
      OffThread.enabled = true;
      final offUi = await _longestStall(work);
      return (onUi, offUi);
    }

    results['lessons catalogue (${(catalogueText.length / 1024).round()} KB JSON), at start-up before'] = await both(() => decodeJsonTextOffThread(catalogueText));
    for (final id in chapterIds) {
      results['chapter $id'] = await both(() => LessonLibrary(bundle: rootBundle).chapter(id));
    }
    ClassBank.testBundle = rootBundle;
    addTearDown(() => ClassBank.testBundle = null);
    var n = 0;
    results['question bank, 2nd PUC Biology'] = await both(() async {
      // A new bundle key each time, so the bank's cache does not answer.
      await ClassBank.load(year: 2, subject: 'Biology', bundle: _Fresh(n++));
    });
    // ignore: avoid_print
    print('Longest UI-isolate stall: decoded on the UI isolate → off it (OffThread)');
    for (final e in results.entries) {
      // ignore: avoid_print
      print('  ${e.key}: ${_ms(e.value.$1)} → ${_ms(e.value.$2)}');
    }
    // Off the UI isolate, no single stall comes near a dropped second of frames.
    for (final e in results.entries) {
      expect(e.value.$2, lessThan(const Duration(milliseconds: 250)), reason: e.key);
    }
    expect(jsonEncode(results.keys.toList()), isNotEmpty);
  });

  testWidgets('cold start on this harness: the board, its store and the first frame of the start screen', (tester) async {
    OffThread.enabled = false;
    LessonLibrary.instance = LessonLibrary(bundle: rootBundle);
    final sw = Stopwatch()..start();
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    final started = sw.elapsed;
    installLessonHooks();
    await pumpApp(tester, board);
    final firstFrame = sw.elapsed;
    expect(find.byKey(const Key('ce-greeting')), findsOneWidget);
    // What start-up used to do as well: read and decode the catalogue on the UI isolate.
    final cat = Stopwatch()..start();
    await tester.runAsync(() => LessonLibrary(bundle: rootBundle).catalogue());
    cat.stop();
    // ignore: avoid_print
    print('Cold start (harness): board and store ${_ms(started)}, start screen drawn at ${_ms(firstFrame)}; '
        'the catalogue read it no longer does at start-up: ${_ms(cat.elapsed)}');
    await closeBoard(tester, board);
    LessonLibrary.instance = LessonLibrary();
  });
}

/// rootBundle under another identity (ClassBank caches per bundle).
class _Fresh extends CachingAssetBundle {
  _Fresh(this.n);
  final int n;
  @override
  Future<ByteData> load(String key) => rootBundle.load(key);
}
