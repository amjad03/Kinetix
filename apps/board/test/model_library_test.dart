import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/features/search/catalogue_browser.dart';
import 'package:kinetix_board/features/search/catalogue_facets.dart';
import 'package:kinetix_board/features/search/model_downloads.dart';
import 'package:kinetix_board/features/search/model_request.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'contrast/contrast_test.dart' show lowContrast;
import 'support/fake_cloud.dart';

/// A GLB header of its own length: enough for the cache to keep it as a viewer model.
Uint8List _glb() {
  final b = ByteData(20)
    ..setUint32(0, 0x46546C67, Endian.little)
    ..setUint32(4, 2, Endian.little)
    ..setUint32(8, 20, Endian.little);
  return b.buffer.asUint8List();
}

/// Downloads held in memory, so the widget tests need no files: [hold] keeps a download
/// running until [finish].
class _FakeDownloads extends ModelDownloads {
  final saved = <String>{};
  final _running = <String, Completer<bool>>{};
  final _at = <String, double>{};
  bool fail = false;

  @override
  ModelAvailability of(ModelEntry e) => e.remote == null ? ModelAvailability.bundled : (saved.contains(e.remote!.id) ? ModelAvailability.downloaded : ModelAvailability.cloud);

  @override
  double? progress(String id) => _at[id];

  @override
  bool get busy => _running.isNotEmpty;

  @override
  List<RemoteModelInfo> missing(Iterable<ModelEntry> entries) => [
    for (final e in entries)
      if (e.remote case final r? when !saved.contains(r.id)) r,
  ];

  @override
  Future<bool> download(RemoteModelInfo m) {
    final c = _running[m.id] = Completer<bool>();
    _at[m.id] = 0.4;
    notifyListeners();
    return c.future;
  }

  void finish(String id) {
    _at.remove(id);
    final ok = !fail;
    if (ok) {
      saved.add(id);
    } else {
      failed.add(id);
    }
    _running.remove(id)!.complete(ok);
    notifyListeners();
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final en = l10nFor(const Locale('en'));
  final cloud = RemoteModels.all.firstWhere((m) => m.viewer && ModelCatalogue.byId(m.id)?.remote != null);
  final cloudEntry = ModelCatalogue.byId(cloud.id)!;
  final cloudTitle = cloudEntry.titleIn('en');

  group('ModelDownloads', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('kx_models_'));
    tearDown(() => dir.deleteSync(recursive: true));

    ModelCache cache({bool offline = false}) => ModelCache(
      dir,
      fetcher: (url, progress) async {
        if (offline) throw const OfflineException();
        progress(50, 100);
        return url.endsWith('.json') ? Uint8List.fromList(utf8.encode(jsonEncode({'id': cloud.id, 'parts': []}))) : _glb();
      },
    );

    test('bundled, cloud until downloaded, then saved offline', () async {
      final d = ModelDownloads(cache: cache());
      final seen = <double?>[];
      d.addListener(() => seen.add(d.progress(cloud.id)));
      expect(d.of(ModelCatalogue.byId('heart')!), ModelAvailability.bundled);
      final entry = ModelCatalogue.byId(cloud.id)!;
      expect(d.of(entry), ModelAvailability.cloud);
      expect(d.missing([entry, ModelCatalogue.byId('heart')!]), [cloud]);

      expect(await d.download(cloud), isTrue);
      expect(d.of(entry), ModelAvailability.downloaded);
      expect(d.missing([entry]), isEmpty);
      // Progress went 0 → half way → done (null).
      expect(seen, [0.0, 0.5, null]);
      expect(d.busy, isFalse);
    });

    test('offline: the model stays in the cloud and is marked failed', () async {
      final d = ModelDownloads(cache: cache(offline: true));
      expect(await d.download(cloud), isFalse);
      expect(d.failed, {cloud.id});
      expect(d.of(ModelCatalogue.byId(cloud.id)!), ModelAvailability.cloud);
      expect(await d.downloadAll([cloud]), 1);
    });

    test('sizes read as people say them', () {
      expect(modelSize(850000), '850 KB');
      expect(modelSize(4200000), '4.2 MB');
      expect(modelSize(123000000), '123 MB');
    });
  });

  group('the 3D library grid', () {
    Future<_FakeDownloads> pump(WidgetTester tester, {String query = '', String lang = 'en', Size size = const Size(1280, 900), VoidCallback? onRequest}) async {
      screenSize(tester, size);
      final d = _FakeDownloads();
      await tester.pumpWidget(localized(lang, Scaffold(body: CatalogueBrowser(kind: CatalogueKind.model3d, initialQuery: query, downloads: d, onPick: (_) {}, onRequestModel: onRequest))));
      await tester.pumpAndSettle();
      return d;
    }

    testWidgets('tiles show where each model comes from, and a cloud model downloads with its progress', (tester) async {
      final d = await pump(tester, query: cloud.keywords.first);
      expect(find.byKey(Key('model-state-${cloudEntry.id}-cloud')), findsOneWidget);
      expect(find.text(en.model3dCloud(modelSize(cloud.bytes))), findsOneWidget);

      await tester.tap(find.byKey(Key('download-${cloudEntry.id}')));
      await tester.pump();
      expect(find.byKey(Key('model-state-${cloudEntry.id}-downloading')), findsOneWidget);
      expect(find.text(en.model3dDownloading(40)), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);

      d.finish(cloud.id);
      await tester.pumpAndSettle();
      expect(find.byKey(Key('model-state-${cloudEntry.id}-downloaded')), findsOneWidget);
      expect(find.text(en.model3dSaved), findsOneWidget);
      expect(find.byKey(const Key('download-all')), findsNothing);
      expect(find.byKey(const Key('all-offline')), findsOneWidget);
    });

    testWidgets('a failed download says so and the model stays in the cloud', (tester) async {
      final d = await pump(tester, query: cloud.keywords.first);
      d.fail = true;
      await tester.tap(find.byKey(Key('download-${cloudEntry.id}')));
      await tester.pump();
      d.finish(cloud.id);
      await tester.pump();
      expect(find.text(en.model3dDownloadFailed(cloudTitle)), findsOneWidget);
      expect(find.byKey(Key('model-state-${cloudEntry.id}-cloud')), findsOneWidget);
    });

    testWidgets('bundled models are Ready; Download all fetches every cloud model shown', (tester) async {
      final d = await pump(tester);
      expect(find.byKey(const Key('catalogue-model3d')), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('model-state-heart-bundled')), 300, scrollable: find.descendant(of: find.byKey(const Key('catalogue-model3d')), matching: find.byType(Scrollable)).first);
      expect(find.descendant(of: find.byKey(const Key('model-state-heart-bundled')), matching: find.text(en.model3dReady)), findsOneWidget);
      final cloudCount = d.missing(ModelCatalogue.entries).length;
      expect(cloudCount, greaterThan(0));
      await tester.tap(find.byKey(const Key('download-all')));
      await tester.pump();
      expect(d.busy, isTrue);
    });

    testWidgets('Request a 3D model is offered when the board can send one', (tester) async {
      var asked = 0;
      await pump(tester, onRequest: () => asked++);
      await tester.tap(find.byKey(const Key('request-model')));
      expect(asked, 1);
      await pump(tester);
      expect(find.byKey(const Key('request-model')), findsNothing);
    });

    for (final lang in ['en', 'hi', 'kn']) {
      for (final size in const [Size(360, 640), Size(1920, 1080)]) {
        testWidgets('$lang at ${size.width.toInt()}: fits and reads well', (tester) async {
          await pump(tester, lang: lang, size: size, onRequest: () {});
          expect(tester.takeException(), isNull);
          expect(find.text(l10nFor(Locale(lang)).model3dRequest), findsOneWidget);
          expect(lowContrast(), isEmpty);
        });
      }
    }
  });

  group('Request a 3D model', () {
    final requests = <http.Request>[];
    var offline = false;

    Future<BoardController> signedInBoard() async {
      requests.clear();
      offline = false;
      final cloudApi = fakeCloud();
      final board = BoardController(
        apiFactory: (url) => ApiClient(
          baseUrl: url,
          client: MockClient((req) async {
            if (req.url.path.startsWith('/v1/model-requests/')) {
              if (offline) throw http.ClientException('no network');
              requests.add(req);
              return http.Response(req.body, 200, headers: {'content-type': 'application/json'});
            }
            final copy = http.Request(req.method, req.url)
              ..headers.addAll(req.headers)
              ..body = req.body;
            return http.Response.fromStream(await cloudApi.send(copy));
          }),
        ),
        realtimeFactory: (_) => NoRealtime(),
        outboxStore: MemoryOutboxStore(),
      );
      await board.enroll('http://test', 'KX-AAAA-BBBB');
      board.onPaired('session-token', sessionIn('en'));
      return board;
    }

    Future<void> open(WidgetTester tester, BoardController board) async {
      screenSize(tester, const Size(1280, 900));
      await tester.pumpWidget(
        localized(
          'en',
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(key: const Key('go'), onPressed: () => requestModel3d(context, board, subject: 'biology', classLevel: '9'), child: const Text('go')),
            ),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('go')));
      await tester.pumpAndSettle();
    }

    testWidgets('a guest board asks the teacher to sign in', (tester) async {
      final board = BoardController()..skipEnrollment();
      await open(tester, board);
      expect(find.byKey(const Key('model-request-form')), findsNothing);
      expect(find.text(en.model3dRequestNeedsSignIn), findsOneWidget);
    });

    testWidgets('needs a name, starts on the class subject, and sends the request', (tester) async {
      final board = await tester.runAsync(signedInBoard);
      await open(tester, board!);
      expect(find.byKey(const Key('model-request-form')), findsOneWidget);
      await tester.tap(find.byKey(const Key('model-request-send')));
      await tester.pump();
      expect(find.text(en.model3dRequestNameNeeded), findsOneWidget);

      await tester.enterText(find.byKey(const Key('model-request-name')), '  Muscular system ');
      await tester.enterText(find.byKey(const Key('model-request-note')), 'For chapter 7');
      await tester.tap(find.byKey(const Key('model-request-send')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pumpAndSettle();
      expect(requests, hasLength(1));
      expect(requests.single.method, 'PUT');
      expect(jsonDecode(requests.single.body), {'name': 'Muscular system', 'subject': 'biology', 'classLevel': '9', 'note': 'For chapter 7'});
      expect(find.text(en.model3dRequestSent), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });

    testWidgets('offline, the request waits in the outbox and goes when the board is back', (tester) async {
      final board = (await tester.runAsync(signedInBoard))!;
      offline = true;
      await open(tester, board);
      await tester.enterText(find.byKey(const Key('model-request-name')), 'Diaphragm');
      await tester.tap(find.byKey(const Key('model-request-send')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pumpAndSettle();
      expect(requests, isEmpty);
      expect(board.pendingOps, 1);
      expect(find.text(en.model3dRequestSent), findsOneWidget);

      offline = false;
      await tester.runAsync(board.flushOutbox);
      expect(requests, hasLength(1));
      expect(jsonDecode(requests.single.body), {'name': 'Diaphragm', 'subject': 'biology', 'classLevel': '9'});
      expect(board.pendingOps, 0);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });

    testWidgets('Cancel sends nothing', (tester) async {
      final board = (await tester.runAsync(signedInBoard))!;
      await open(tester, board);
      await tester.tap(find.byKey(const Key('model-request-cancel')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('model-request-form')), findsNothing);
      expect(requests, isEmpty);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  });
}
