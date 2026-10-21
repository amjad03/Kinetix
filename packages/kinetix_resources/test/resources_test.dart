import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_resources/kinetix_resources.dart';

const _json = {
  'videos': [
    {'id': 'v1', 'title': 'Ohm\'s law', 'provider': 'youtube', 'youtubeId': 'dQw4w9WgXcQ', 'durationSec': 245, 'source': 'platform'},
    {'id': 'v2', 'title': 'Lab demo', 'provider': 'upload', 'url': 'http://10.0.0.2:4000/files/lab.mp4', 'source': 'institution'},
    {'id': 'v3', 'title': 'Link only', 'provider': 'youtube', 'url': 'https://youtu.be/abcdefghijk', 'source': 'teacher'},
    {'id': 'bad'},
    {'id': 'v4', 'title': 'Future provider', 'provider': 'vimeo', 'url': 'https://vimeo.com/1'},
  ],
  'materials': [
    {'id': 'm1', 'kind': 'book', 'title': 'Hayt, Engineering Circuit Analysis', 'url': 'http://x/book.pdf', 'chapter': '3', 'pages': '45-60'},
    {'id': 'm2', 'kind': 'link', 'title': 'NPTEL notes', 'url': 'https://nptel.ac.in'},
    {'id': 'm3', 'kind': 'hologram', 'title': 'Unknown kind'},
  ],
  'animations': [
    {'key': 'circuits', 'title': 'Electric circuits'},
    'heart',
  ],
};

void main() {
  group('parsing', () {
    test('reads the contract and skips what it cannot read', () {
      final r = TopicResources.fromJson(_json);
      expect(r.videos.map((v) => v.id), ['v1', 'v2', 'v3', 'v4']);
      expect(r.videos[0].durationLabel, '4:05');
      expect(r.videos[0].needsInternet, isTrue);
      expect(r.videos[1].needsInternet, isFalse);
      expect(r.videos[1].source, ResourceSource.institution);
      expect(r.videos[2].youtubeId, 'abcdefghijk');
      expect(r.videos[3].provider, VideoProvider.url);
      expect(r.materials[0].pages, const PageRange(45, 60));
      expect(r.materials[0].isPdf, isTrue);
      expect(r.materials[1].isPdf, isFalse);
      expect(r.materials[2].kind, MaterialKind.link);
      expect(r.animations.map((a) => a.key), ['circuits', 'heart']);
    });

    test('tolerates a missing or odd body', () {
      expect(TopicResources.fromJson(null).isEmpty, isTrue);
      expect(TopicResources.fromJson({'videos': 'x'}).isEmpty, isTrue);
    });

    test('round-trips through toJson', () {
      final r = TopicResources.fromJson(TopicResources.fromJson(_json).toJson());
      expect(r.videos.length, 4);
      expect(r.materials.first.pages, const PageRange(45, 60));
    });

    test('page ranges in several shapes', () {
      expect(PageRange.tryParse('12'), const PageRange(12, 12));
      expect(PageRange.tryParse('12–30'), const PageRange(12, 30));
      expect(PageRange.tryParse([30, 12]), const PageRange(12, 30));
      expect(PageRange.tryParse({'from': 3, 'to': 9}), const PageRange(3, 9));
      expect(PageRange.tryParse('x'), isNull);
      expect(PageRange.tryParse(0), isNull);
    });

    test('YouTube ids from links', () {
      expect(youtubeIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
      expect(youtubeIdOf('youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
      expect(youtubeIdOf('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
      expect(youtubeIdOf('https://example.com/watch?v=dQw4w9WgXcQ'), isNull);
    });

    test('topics from a syllabus outline', () {
      final t = TopicRef.fromOutline({
        'chapters': [
          {'title': 'Unit 1', 'topics': [{'id': 'a', 'title': 'KCL'}, {'id': 'b', 'title': 'KVL'}]},
          {'title': 'Unit 2', 'topics': []},
        ],
      });
      expect(t.map((x) => x.id), ['a', 'b']);
      expect(t.first.chapter, 'Unit 1');
    });
  });

  group('repository', () {
    test('keeps the list and serves it offline', () async {
      final store = MemoryResourceStore();
      var online = true;
      final repo = TopicResourcesRepository(store: store, fetch: (id) async => online ? _json : throw Exception('offline'));
      final first = await repo.load('t1');
      expect(first.offline, isFalse);
      await Future<void>.delayed(Duration.zero);
      online = false;
      final second = await repo.load('t1');
      expect(second.offline, isTrue);
      expect(second.resources.videos.length, 4);
      await expectLater(repo.load('t2'), throwsException);
    });
  });

  group('view', () {
    testWidgets('offline greys online-only videos and says why', (tester) async {
      final played = <String>[];
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: TopicResourcesView(resources: TopicResources.fromJson(_json), offline: true, onVideo: (v) => played.add(v.id)),
        ),
      ));
      expect(find.byKey(const Key('res-offline')), findsOneWidget);
      await tester.tap(find.byKey(const Key('res-video-v1')));
      await tester.pump();
      expect(played, isEmpty);
      expect(find.byType(SnackBar), findsOneWidget);
      await tester.tap(find.byKey(const Key('res-video-v2')));
      expect(played, ['v2']);
    });

    testWidgets('empty topic', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: TopicResourcesView(resources: TopicResources.empty))));
      expect(find.byKey(const Key('res-none')), findsOneWidget);
    });

    testWidgets('screen loads, opens links and switches topic', (tester) async {
      final asked = <String>[];
      final opened = <Uri>[];
      final repo = TopicResourcesRepository(store: MemoryResourceStore(), fetch: (id) async {
        asked.add(id);
        return id == 'a' ? _json : {'videos': [], 'materials': [], 'animations': []};
      });
      const topics = [TopicRef(id: 'a', title: 'KCL'), TopicRef(id: 'b', title: 'KVL')];
      await tester.pumpWidget(MaterialApp(
        home: TopicResourcesScreen(
          repository: repo,
          topic: topics.first,
          topics: topics,
          launcher: (u) async {
            opened.add(u);
            return true;
          },
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('res-video-v1')));
      await tester.pump();
      expect(opened.single.toString(), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await tester.tap(find.byKey(const Key('res-topic-picker')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('KVL').last);
      await tester.pumpAndSettle();
      expect(asked, ['a', 'b']);
      expect(find.byKey(const Key('res-none')), findsOneWidget);
    });
  });
}
