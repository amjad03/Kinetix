import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/insert/device_files.dart';
import 'package:kinetix_board/features/insert/document_import.dart';
import 'package:kinetix_board/features/insert/picture_library.dart';
import 'package:kinetix_board/features/insert/pptx_render.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/wait.dart';

/// Files the test hands in as if the teacher had picked them.
class FakeFiles implements DeviceFiles {
  FakeFiles({this.picture, this.document, this.camera = false});
  PickedFile? picture, document;
  final bool camera;
  bool? askedCamera;

  @override
  bool get hasCamera => camera;
  @override
  Future<PickedFile?> pickPicture({bool camera = false}) async {
    askedCamera = camera;
    return picture;
  }

  @override
  Future<PickedFile?> pickDocument() async => document;
}

/// Draws each "page" as a plain picture, without PDFium.
class FakeRenderer implements PageRenderer {
  FakeRenderer(this.pages);
  final int pages;
  DocKind? kind;

  @override
  Future<List<ImportedPage>> render(Uint8List bytes, DocKind kind, {void Function(int done, int total)? onPage}) async {
    this.kind = kind;
    final png = await _png(32, 18);
    return [
      for (var i = 0; i < pages; i++) ImportedPage(png, const Size(1600, 900)),
    ];
  }
}

Future<Uint8List> _png(int w, int h) async {
  final rec = ui.PictureRecorder();
  ui.Canvas(rec).drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..color = const Color(0xFF1A73E8));
  final img = await rec.endRecording().toImage(w, h);
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  img.dispose();
  return data!.buffer.asUint8List();
}

/// A two-slide deck: a title slide with a coloured box, and a table.
Uint8List _deck() {
  const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  String sp(String text, {String geom = 'rect', String? fill, int y = 457200}) =>
      '<p:sp><p:spPr><a:xfrm><a:off x="457200" y="$y"/><a:ext cx="8000000" cy="1200000"/></a:xfrm><a:prstGeom prst="$geom"/>'
      '${fill == null ? '' : '<a:solidFill><a:srgbClr val="$fill"/></a:solidFill>'}</p:spPr>'
      '<p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="4000" b="1"/><a:t>$text</a:t></a:r></a:p></p:txBody></p:sp>';
  final files = {
    'ppt/presentation.xml': '<p:presentation $ns><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml':
        '<p:sld $ns><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree>${sp('Photosynthesis')}${sp('Sunlight', geom: 'ellipse', fill: '188038', y: 2400000)}</p:spTree></p:cSld></p:sld>',
    'ppt/slides/slide2.xml':
        '<p:sld $ns><p:cSld><p:spTree><p:graphicFrame><p:xfrm><a:off x="457200" y="457200"/><a:ext cx="6000000" cy="1000000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tblGrid><a:gridCol w="3000000"/><a:gridCol w="3000000"/></a:tblGrid>'
        '<a:tr h="500000"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Input</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Output</a:t></a:r></a:p></a:txBody></a:tc></a:tr>'
        '</a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>',
    'docProps/core.xml': '<cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Plants</dc:title></cp:coreProperties>',
  };
  final a = Archive();
  for (final e in files.entries) {
    final b = utf8.encode(e.value);
    a.addFile(ArchiveFile(e.key, b.length, b));
  }
  return Uint8List.fromList(ZipEncoder().encode(a));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('documents are told apart by their first bytes', () {
    expect(docKindOf(Uint8List.fromList(utf8.encode('%PDF-1.7')), 'notes.pdf'), DocKind.pdf);
    expect(docKindOf(_deck(), 'plants.pptx'), DocKind.pptx);
    expect(docKindOf(Uint8List.fromList([0xD0, 0xCF, 0x11, 0xE0, 0, 0]), 'old.ppt'), DocKind.ppt);
    expect(docKindOf(Uint8List.fromList(utf8.encode('hello')), 'a.txt'), DocKind.other);
  });

  test('imported pages become backdrops, 1600 wide', () {
    final pages = backdropPages([ImportedPage(Uint8List(4), const Size(800, 600))]);
    final img = pages.single.single as ImageElement;
    expect(img.backdrop, isTrue);
    expect(img.rect, const Rect.fromLTWH(0, 0, 1600, 1200));
  });

  test('a PowerPoint deck: its slides, title, text, shapes and tables', () async {
    final deck = parsePptx(_deck());
    expect(deck.title, 'Plants');
    expect(deck.slides, hasLength(2));
    expect(deck.size.width, closeTo(960, 0.1));
    expect(pptxSlideText(deck.slides[0]), ['Photosynthesis', 'Sunlight']);
    expect(pptxSlideText(deck.slides[1]), ['Input', 'Output']);
    expect(() => parsePptx(Uint8List.fromList(utf8.encode('nope'))), throwsFormatException);
  });

  testWidgets('a slide draws to a PNG of the right size', (tester) async {
    final deck = parsePptx(_deck());
    final png = await tester.runAsync(() => renderPptxSlide(deck.slides.first, deck.size, width: 800));
    expect(png!.sublist(1, 4), utf8.encode('PNG'));
    expect(ByteData.sublistView(png).getUint32(16), 800);
    expect(ByteData.sublistView(png).getUint32(20), 450);
  });

  group('picture library', () {
    test('every picture in the catalogue is there, with its credit', () async {
      final lib = await PictureLibrary.load();
      expect(lib.pictures, hasLength(192));
      expect(lib.shelves, contains('biology'));
      for (final p in lib.pictures.where((p) => !p.isSticker)) {
        expect(p.credit.licence, isNotEmpty, reason: p.id);
        expect(p.credit.line, contains(p.credit.licence));
      }
      expect(lib.search('heart').take(2).map((p) => p.id), contains('heart'));
      expect(lib.search('ventricle').first.id, 'heart');
      expect(shelfForSubject('Mathematics'), 'maths');
      expect(shelfForSubject('Corporate Accounting'), isNull);
    });

    testWidgets('a picture from the library goes on the board with its credit', (tester) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
      await tester.pump();
      await tester.runAsync(PictureLibrary.load);
      await tester.tap(find.byKey(const Key('tool-insert')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('insert-library')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('library-search')), 'animal cell');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('credit-animal_cell')));
      await tester.pumpAndSettle();
      expect(find.textContaining('LadyofHats'), findsOneWidget);
      await tester.tap(find.byKey(const Key('picture-animal_cell')));
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      await waitUntil(tester, () => wb.elements.whereType<ImageElement>().isNotEmpty);
      expect(wb.elements.whereType<ImageElement>(), hasLength(1));
      expect(wb.elements.whereType<TextElement>().single.text, contains('Public domain'));
    });
  });

  group('from the device', () {
    late FakeFiles files;
    setUp(() => DeviceFiles.instance = files = FakeFiles());
    tearDown(() {
      DeviceFiles.instance = PlatformFiles();
      PageRenderer.instance = const OnDeviceRenderer();
    });

    Future<WhiteboardController> pumpBoard(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
      await tester.pump();
      return tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
    }

    Future<void> insert(WidgetTester tester, String key) async {
      await tester.tap(find.byKey(const Key('tool-insert')));
      await tester.pumpAndSettle();
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      final (elements, pages) = (wb.elements.length, wb.pageCount);
      await tester.tap(find.byKey(Key(key)));
      // Until the file is on the board (or, for a file that cannot be read, a moment).
      await waitUntil(tester, () => wb.elements.length != elements || wb.pageCount != pages, timeout: const Duration(seconds: 3));
    }

    testWidgets('a picture from the board goes on it', (tester) async {
      final wb = await pumpBoard(tester);
      files.picture = PickedFile('photo.png', (await tester.runAsync(() => _png(40, 30)))!);
      expect(find.byKey(const Key('insert-camera')), findsNothing);
      await insert(tester, 'insert-picture');
      expect(files.askedCamera, isFalse);
      expect(wb.elements.single, isA<ImageElement>());
      expect((wb.elements.single as ImageElement).rect.size, const Size(40, 30));
    });

    testWidgets('a picture that cannot be read says so', (tester) async {
      final wb = await pumpBoard(tester);
      files.picture = PickedFile('broken.png', Uint8List.fromList([1, 2, 3]));
      await insert(tester, 'insert-picture');
      expect(wb.elements, isEmpty);
      expect(find.text('Could not open that picture.'), findsOneWidget);
    });

    testWidgets('a PowerPoint becomes pages after this one, under the ink', (tester) async {
      final wb = await pumpBoard(tester);
      final renderer = PageRenderer.instance = FakeRenderer(3);
      files.document = PickedFile('plants.pptx', _deck());
      await insert(tester, 'insert-document');
      expect(renderer.kind, DocKind.pptx);
      // The deck opens beside the writing (spec 28); Add All Pages puts it on the board.
      expect(find.byKey(const Key('presentation')), findsOneWidget);
      expect(wb.pageCount, 1);
      await tester.tap(find.byKey(const Key('ppt-add-all')));
      await tester.pumpAndSettle();
      expect(wb.pageCount, 4);
      expect(wb.pageIndex, 1);
      expect((wb.elements.single as ImageElement).backdrop, isTrue);
    });

    testWidgets('an old .ppt asks for .pptx or PDF', (tester) async {
      final wb = await pumpBoard(tester);
      files.document = PickedFile('old.ppt', Uint8List.fromList([0xD0, 0xCF, 0x11, 0xE0, 0, 0, 0, 0]));
      await insert(tester, 'insert-document');
      expect(wb.pageCount, 1);
      expect(find.textContaining('Save it as .pptx or PDF'), findsOneWidget);
    });

    testWidgets('a PDF that cannot be drawn says so', (tester) async {
      final wb = await pumpBoard(tester);
      PageRenderer.instance = FakeRenderer(0);
      files.document = PickedFile('notes.pdf', Uint8List.fromList(utf8.encode('%PDF-1.4 broken')));
      await insert(tester, 'insert-document');
      expect(wb.pageCount, 1);
      expect(find.textContaining('Could not open this PDF'), findsOneWidget);
    });

    testWidgets('the menu imports too', (tester) async {
      final wb = await pumpBoard(tester);
      PageRenderer.instance = FakeRenderer(2);
      files.document = PickedFile('notes.pdf', Uint8List.fromList(utf8.encode('%PDF-1.4')));
      await tester.tap(find.byKey(const Key('profile-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-import')));
      await waitUntil(tester, () => wb.pageCount == 3);
      expect(wb.pageCount, 3);
    });
  });
}
