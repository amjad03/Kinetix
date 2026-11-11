// Screenshots of lesson steps from the real code and content (INSTRUMENT_SHOTS=<dir> writes
// 1920 x 1080 PNGs): an instrument step per subject, a "Do the practical" lab step and a PhET
// sim from the content pack. Without INSTRUMENT_SHOTS it still checks that each step opens.
// PHET_PICTURE=<png> shows that picture as the sim (a test has no web view).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/content_pack/content_library.dart';
import 'package:kinetix_board/classroom_edition/content_pack/content_pack.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_embeds.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_progress.dart';
import 'package:kinetix_board/classroom_edition/lessons/lessons_panel.dart';
import 'package:kinetix_board/features/phet/phet_view.dart';
import 'package:kinetix_board/features/sim_hub/sim_server.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';

final _out = Platform.environment['INSTRUMENT_SHOTS'];
final _picture = Platform.environment['PHET_PICTURE'];
final MemoryImage? _image = _picture == null ? null : MemoryImage(File(_picture!).readAsBytesSync());

class _PictureView implements PhetWebView {
  @override
  Future<void> load(Uri page) async {}
  @override
  Widget view() => _image == null ? const ColoredBox(color: Colors.white) : Image(image: _image!, fit: BoxFit.contain);
  @override
  Future<Uint8List?> screenshot() async => null;
  @override
  void dispose() {}
}

void main() {
  late Directory tmp;
  setUpAll(() async {
    await loadScreenFonts();
    final loader = FontLoader('packages/flutter_math_fork/KaTeX_Main');
    loader.addFont(rootBundle.load('packages/flutter_math_fork/lib/katex_fonts/fonts/KaTeX_Main-Regular.ttf'));
    await loader.load();
  });
  setUp(() => tmp = Directory.systemTemp.createTempSync('ce-shots'));
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    ContentLibrary.debugShared = null;
    PhetWebView.debugOverride = null;
    if (tmp.existsSync()) tmp.deleteSync(recursive: true);
  });

  testWidgets('instrument, lab and PhET steps', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    LessonLibrary.instance = LessonLibrary();
    LessonProgress.instance = LessonProgress();
    // The content pack with one PhET sim for wave optics.
    final page = Uint8List.fromList('<!DOCTYPE html><html></html>'.codeUnits);
    final lib = ContentLibrary(tmp);
    await tester.runAsync(() async {
      await LessonProgress.instance.load();
      await lib.installZip(
        writeContentPack(
          ContentManifest(id: 'puc-phet', title: 'PUC PhET simulations', revision: '2026.11', items: [
            ContentItem(id: 'phet-wave-interference', kind: ContentKind.phet, title: 'Wave Interference', file: 'phet/wave-interference.html', sha256: sha256.convert(page).toString(), size: page.length, version: 1, chapterId: 'puc2-physics-10-wave-optics', topics: const ['puc2-physics-10-wave-optics.t3']),
          ]),
          {'phet/wave-interference.html': page},
        ),
      );
    });
    ContentLibrary.debugShared = lib;
    PhetWebView.debugOverride = _PictureView.new;
    // The sims' local server, started for real (outside the test's fake clock).
    await tester.runAsync(SimAssetServer.start);
    final cat = (await tester.runAsync(() => LessonLibrary.instance.catalogue()))!;

    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: appFor(board)));
    await settle(tester);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 12);
    await tapKey(tester, 'ce-lessons');
    await settle(tester, 10);
    // The panel full screen, as a teacher shows a step to the class.
    await tapKey(tester, 'panel-full');
    await settle(tester, 10);
    final state = tester.state<LessonsPanelState>(find.byType(LessonsPanel));

    Future<void> show(String name, String chapter, bool Function(Block b) want, {String? topic}) async {
      final ch = cat.chapters.firstWhere((c) => c.id == chapter);
      final pack = (await tester.runAsync(() => LessonLibrary.instance.chapter(ch.id)))!;
      for (final t in ch.topics) {
        if (topic != null && t.id != topic) continue;
        final blocks = withPackPhet(pack.lessons[t.id]!.blocks, t.id);
        final at = blocks.indexWhere(want);
        if (at < 0) continue;
        await tester.runAsync(() => state.openTopic(t, at: at));
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
        if (_image != null) await tester.runAsync(() => precacheImage(_image!, tester.element(find.byType(LessonsPanel))));
        await settle(tester, 20);
        expect(want(state.lesson!.current), isTrue, reason: name);
        final out = _out;
        if (out != null) {
          final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
          final png = await tester.runAsync(() async {
            final img = await box.toImage();
            return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
          });
          Directory(out).createSync(recursive: true);
          File('$out/$name.png').writeAsBytesSync(png!);
        }
        return;
      }
      fail('$name: no such step in $chapter');
    }

    bool instrument(Block b, String id) => b.type == BlockType.interactive && b.s('kind') == 'instrument' && b.s('instrument') == id;
    await show('1-physics-optics', 'puc2-physics-09-ray-optics-and-optical-instruments', (b) => instrument(b, 'optics'));
    await show('2-chemistry-periodic', 'puc1-chemistry-03-classification-of-elements-and-periodicity-in-properties', (b) => instrument(b, 'chem.periodic'));
    await show('3-biology-heart', 'puc1-biology-15-body-fluids-and-circulation', (b) => instrument(b, 'bio-heart'));
    await show('4-maths-conics', 'puc1-maths-10-conic-sections', (b) => instrument(b, 'maths-conics'));
    await show('5-lab-practical', 'puc2-physics-15-metre-bridge-and-potentiometer', (b) => b.type == BlockType.virtualLab && b.id.startsWith('practical-'));
    await show('6-phet-from-pack', 'puc2-physics-10-wave-optics', (b) => b.id == 'pack-phet-wave-interference', topic: 'puc2-physics-10-wave-optics.t3');
    expect(find.byKey(const Key('phet-credit')), findsOneWidget);
    state.lesson?.stopSpeech();
    await closeBoard(tester, board);
  });
}
