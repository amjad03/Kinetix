import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/api_client.dart' show ApiException;
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/cloud/cloud_service.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/pptx_export.dart';
import 'package:kinetix_board/features/board/share_whiteboard.dart';
import 'package:kinetix_board/features/cloud/cloud_sheet.dart';
import 'package:kinetix_board/features/insert/pptx_render.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Zynetix W5: PPTX export, cloud drives and sharing to Google Classroom and Moodle, with a fake server.

class FakeCloud implements CloudService {
  CloudStatus state = const CloudStatus(microsoft: CloudAccount(configured: true), google: CloudAccount(configured: true, connected: true, account: 'anita@college.in'));
  final calls = <String>[];
  final posted = <(String, String, String)>[];
  List<ShareCourse> courses = const [ShareCourse('c1', 'BCom Sem 3 A', 'A')];

  @override
  Future<CloudStatus> status() async => state;

  @override
  Future<Uri> connectUrl(CloudProvider p) async {
    calls.add('connect ${p.id}');
    return Uri.parse('https://accounts.example/auth?state=x');
  }

  @override
  Future<void> disconnect(CloudProvider p) async => calls.add('disconnect ${p.id}');

  @override
  Future<List<CloudFile>> list(CloudProvider p, {String? folder, String? query}) async {
    calls.add('list ${p.id} ${folder ?? '-'} ${query ?? '-'}');
    if (folder == 'f1') return const [CloudFile(id: 'p2', name: 'Inside.pdf', kind: CloudFileKind.pdf)];
    return const [
      CloudFile(id: 'f1', name: 'Week 3', kind: CloudFileKind.folder),
      CloudFile(id: 'p1', name: 'Ledger.pdf', kind: CloudFileKind.pdf),
    ];
  }

  @override
  Future<({String name, String mimeType, Uint8List bytes})> download(CloudProvider p, String id) async {
    calls.add('download ${p.id} $id');
    return (name: 'Inside.pdf', mimeType: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits));
  }

  @override
  Future<String?> save(CloudProvider p, String name, String mimeType, Uint8List bytes) async {
    if (!state.of(p).configured) throw ApiException(409, 'not set up', code: cloudNotConfigured);
    posted.add(('save ${p.id}', name, mimeType));
    return 'https://drive.example/x';
  }

  @override
  Future<List<ShareCourse>> classroomCourses() async => courses;

  @override
  Future<SharedTo> postToClassroom(String courseId, String title, String name, String mimeType, Uint8List bytes) async {
    posted.add(('classroom $courseId', name, mimeType));
    return const SharedTo('m1', 'https://classroom.example/m1');
  }

  @override
  Future<List<ShareCourse>> moodleCourses() async => courses;

  @override
  Future<SharedTo> postToMoodle(String courseId, String title, String name, String mimeType, Uint8List bytes) async {
    posted.add(('moodle $courseId', name, mimeType));
    return const SharedTo('90', 'https://moodle.example/d/90');
  }
}

Future<Uint8List> png(int w, int h) async {
  final r = ui.PictureRecorder();
  Canvas(r).drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..color = const Color(0xFF2196F3));
  final img = await r.endRecording().toImage(w, h);
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  img.dispose();
  return data!.buffer.asUint8List();
}

/// Lets real image work (PDF and slides) finish, then the dialogs' animations.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 100; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump();
    if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
  }
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  group('PPTX export', () {
    testWidgets('one slide per page with the picture and the typed text as text boxes; the board reads it back', (tester) async {
      await tester.runAsync(() async {
        final deck = buildPptx([
          PptxPage(await png(160, 90), const Size(160, 90), const [PptxText('Ledger & journal', Rect.fromLTWH(10, 10, 100, 20), fontSize: 12, bold: true)]),
          PptxPage(await png(90, 160), const Size(90, 160)),
        ], title: 'Accounts');
        final zip = ZipDecoder().decodeBytes(deck);
        expect(zip.files.first.name, '[Content_Types].xml');
        expect(zip.findFile('ppt/slides/slide2.xml'), isNotNull);
        expect(zip.findFile('ppt/media/image1.png'), isNotNull);
        final slide1 = String.fromCharCodes(zip.findFile('ppt/slides/slide1.xml')!.content as List<int>);
        expect(slide1, contains('Ledger &amp; journal'));
        expect(slide1, contains('b="1"'));

        final read = parsePptx(deck);
        expect(read.title, 'Accounts');
        expect(read.slides, hasLength(2));
        expect(read.slides.first.ops.map((o) => o.runtimeType.toString()), containsAll(['_ImageOp', '_TextOp']));
        expect(read.slides.last.ops.map((o) => o.runtimeType.toString()), ['_ImageOp']);
      });
    });

    testWidgets('a board with typed text exports a slide per page', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      wb.add(const TextElement(id: 't1', position: Offset(100, 100), text: 'Photosynthesis', color: Color(0xFF000000), fontSize: 32, size: Size(300, 40)));
      wb.addPages([const []]);
      await tester.runAsync(() async {
        final deck = await boardPptx(wb, const Size(1280, 720), title: 'Biology');
        final read = parsePptx(deck);
        expect(read.slides, hasLength(2));
        expect(String.fromCharCodes(ZipDecoder().decodeBytes(deck).findFile('ppt/slides/slide1.xml')!.content as List<int>), contains('Photosynthesis'));
      });
    });
  });

  group('cloud drives', () {
    Future<List<(String, int)>> open(WidgetTester tester, FakeCloud cloud) async {
      final imported = <(String, int)>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CloudDrivesDialog(cloud: cloud, pollEvery: const Duration(milliseconds: 50), onImport: (f, name, bytes) async => imported.add((name, bytes.length))),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return imported;
    }

    testWidgets('not set up by the institution: a clear message to ask the administrator', (tester) async {
      final cloud = FakeCloud()..state = const CloudStatus();
      await open(tester, cloud);
      expect(find.byKey(const Key('cloud-not-configured')), findsOneWidget);
      expect(find.textContaining('Zynetix dashboard → Integrations'), findsOneWidget);
    });

    testWidgets('connect by QR, then browse folders and bring a file onto the board', (tester) async {
      final cloud = FakeCloud();
      final imported = await open(tester, cloud);
      // Google is connected: the files are listed.
      expect(find.byKey(const Key('cloud-account')), findsOneWidget);
      expect(find.text('Ledger.pdf'), findsOneWidget);

      // OneDrive is set up but not connected: scan to sign in, and the board notices.
      await tester.tap(find.text('OneDrive'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('cloud-connect')));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('cloud-connect-qr')), findsOneWidget);
      cloud.state = const CloudStatus(microsoft: CloudAccount(configured: true, connected: true, account: 'anita@college.in'));
      await tester.pump(const Duration(milliseconds: 60));
      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cloud-connect-qr')), findsNothing);
      expect(find.text('Week 3'), findsOneWidget);

      await tester.tap(find.text('Week 3'));
      await tester.pumpAndSettle();
      expect(cloud.calls, contains('list microsoft f1 -'));
      await tester.tap(find.text('Inside.pdf'));
      await tester.pumpAndSettle();
      expect(cloud.calls, contains('download microsoft p2'));
      expect(imported, [('Inside.pdf', 8)]);
    });
  });

  group('share to drives, Google Classroom and Moodle', () {
    Future<(BoardController, FakeCloud, WhiteboardController)> pumpShare(WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final board = BoardController();
      final cloud = FakeCloud();
      board.cloudService = cloud;
      board.session = SessionContext(sessionId: 's1', expiresAt: DateTime.now().add(const Duration(hours: 1)), teacherId: 't1', teacherName: 'Anita', language: 'en');
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await tester.binding.setSurfaceSize(const Size(1200, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showShareWhiteboard(context, board: board, wb: wb, canvas: const Size(640, 360), title: 'Ledger', ensureSaved: () async => false),
                child: const Text('share'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('share'));
      await settle(tester);
      return (board, cloud, wb);
    }

    testWidgets('posts the notes to a Classroom course, as slides when chosen', (tester) async {
      final (_, cloud, _) = await pumpShare(tester);
      expect(find.byKey(const Key('share-classroom')), findsOneWidget);
      await tester.tap(find.byKey(const Key('share-classroom')));
      await settle(tester);
      await tester.tap(find.byKey(const Key('share-course-c1')));
      await settle(tester);
      expect(cloud.posted.single.$1, 'classroom c1');
      expect(cloud.posted.single.$3, 'application/pdf');
      expect(find.text('Posted to BCom Sem 3 A'), findsOneWidget);

      await tester.tap(find.text('Slides (PowerPoint)'));
      await settle(tester);
      await tester.tap(find.byKey(const Key('share-moodle')));
      await settle(tester);
      // Moodle is not set up for posting: the link still works there (or through LTI).
      expect(find.textContaining('Moodle is not set up for posting'), findsOneWidget);

      await tester.tap(find.byKey(const Key('share-drive-google')));
      await settle(tester);
      expect(cloud.posted.last.$1, 'save google');
      expect(cloud.posted.last.$2, endsWith('.pptx'));
      expect(cloud.posted.last.$3, pptxMime);
    });

    testWidgets('a drive the institution has not set up says so', (tester) async {
      final (_, cloud, _) = await pumpShare(tester);
      cloud.state = const CloudStatus();
      await tester.tap(find.byKey(const Key('share-drive-microsoft')));
      await settle(tester);
      expect(find.textContaining('OneDrive is not set up for your institution'), findsOneWidget);
    });
  });
}
