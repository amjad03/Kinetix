import 'dart:async';
import 'dart:convert';
import 'dart:io' show Directory, File;

import 'package:crypto/crypto.dart' show sha1;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_resources/kinetix_resources.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../board/animations_hook.dart' show AnimationScene;
import '../board/chrome.dart' show showBoardMessage;
import '../board/panel/panel_host.dart';
import '../concept_videos/concept_video_player.dart';
import '../concept_videos/concept_videos.dart';
import '../insert/document_import.dart';
import '../insert/presentation_pane.dart';

/// `GET /v1/topics/:id/resources`, or (on a server without it yet) the topic's concept videos.
Future<Object?> fetchTopicResources(ApiClient api, String topicId) async {
  try {
    return await api.topicResources(topicId);
  } on ApiException catch (e) {
    if (e.status != 404) rethrow;
    final legacy = await api.topicConceptVideos(topicId);
    return {'videos': legacy['videos'] ?? const []};
  }
}

/// Draws pages [first]..[last] of a PDF (tests replace it: there is no PDFium in widget tests).
typedef PdfPagesRenderer = Future<List<ImportedPage>> Function(Uint8List bytes, int first, int? last);

/// The topic's resources on the board (the Videos tab → Topic resources): the period's topic
/// first, any other topic of the subject from the picker. YouTube and uploaded videos play in
/// the panel, animations play in the panel, PDFs and books open beside the writing at their
/// mapped pages, links open in the browser. Lists, topics and opened PDFs are kept on the board,
/// so it all still opens offline, except videos that need the internet, which say so.
class BoardTopicResources extends StatefulWidget {
  const BoardTopicResources({super.key, required this.board, this.store});

  final BoardController board;
  final ResourceStore? store;

  @visibleForTesting
  static PdfPagesRenderer renderPdf = (bytes, first, last) => OnDeviceRenderer.renderPdfPages(bytes, first: first, last: last);

  @visibleForTesting
  static Future<bool> Function(Uri uri) launcher = (uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  };

  /// Where opened PDFs are kept (null: not kept, e.g. in tests).
  @visibleForTesting
  static Future<Directory?> Function() filesDir = () async {
    try {
      return Directory('${(await getApplicationSupportDirectory()).path}/topic_resources');
    } catch (_) {
      return null;
    }
  };

  @override
  State<BoardTopicResources> createState() => _BoardTopicResourcesState();
}

const _topicsKey = 'kx.board.topics';
const _lastTopicKey = 'kx.board.lastTopic';

class _BoardTopicResourcesState extends State<BoardTopicResources> {
  late final ResourceStore _store = widget.store ?? const PrefsResourceStore();
  late final TopicResourcesRepository _repo = TopicResourcesRepository(fetch: _fetch, store: _store);

  List<TopicRef> _period = const [];
  List<TopicRef> _syllabus = const [];
  TopicRef? _topic;
  Future<LoadedResources>? _load;
  bool _ready = false;
  String? _opening;

  ApiClient? get _api => widget.board.api;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<Object?> _fetch(String topicId) {
    final api = _api;
    if (api == null) throw StateError('No server');
    return fetchTopicResources(api, topicId);
  }

  Map<String, Object?> _encodeTopic(TopicRef t) => {'id': t.id, 'title': t.title, 'chapter': t.chapter};
  TopicRef? _decodeTopic(Object? j) => j is Map && j['id'] is String && j['title'] is String ? TopicRef(id: j['id'] as String, title: j['title'] as String, chapter: j['chapter'] as String?) : null;

  Future<void> _init() async {
    final api = _api;
    var online = false;
    if (api != null) {
      try {
        final now = PeriodVideos.fromJson(await api.conceptVideosNow());
        _period = [for (final t in now.topics) TopicRef(id: t.id, title: t.title)];
        online = true;
      } catch (_) {}
      try {
        _syllabus = TopicRef.fromOutline(await api.syllabusNow());
        online = true;
      } catch (_) {}
    }
    if (online) {
      unawaited(_store.write(_topicsKey, jsonEncode({'period': _period.map(_encodeTopic).toList(), 'syllabus': _syllabus.map(_encodeTopic).toList()})));
    } else {
      try {
        final j = jsonDecode(await _store.read(_topicsKey) ?? '{}') as Map<String, dynamic>;
        _period = [for (final t in (j['period'] as List? ?? const [])) ?_decodeTopic(t)];
        _syllabus = [for (final t in (j['syllabus'] as List? ?? const [])) ?_decodeTopic(t)];
      } catch (_) {}
    }
    TopicRef? last;
    try {
      last = _decodeTopic(jsonDecode(await _store.read(_lastTopicKey) ?? 'null'));
    } catch (_) {}
    final topic = _period.firstOrNull ?? (online ? null : last) ?? _syllabus.firstOrNull ?? last;
    if (!mounted) return;
    setState(() => _ready = true);
    if (topic != null) _pick(topic);
  }

  List<TopicRef> get _topics {
    final seen = <String>{};
    return [
      for (final t in [..._period, ..._syllabus, ?_topic])
        if (seen.add(t.id)) t,
    ];
  }

  void _pick(TopicRef t) {
    unawaited(_store.write(_lastTopicKey, jsonEncode(_encodeTopic(t))));
    setState(() {
      _topic = t;
      _load = _repo.load(t.id);
    });
  }

  String _absolute(String url) => url.startsWith('/') ? '${widget.board.serverUrl ?? ''}$url' : url;

  Future<void> _video(ResourceVideo v) async {
    final lang = Localizations.maybeLocaleOf(context)?.languageCode ?? 'en';
    final topicId = _topic?.id ?? '';
    if (v.youtubeId != null) {
      await ConceptVideoPlayer.open(context, ConceptVideo(id: v.id, topicId: topicId, youtubeVideoId: v.youtubeId!, title: v.title, language: lang, durationSeconds: v.durationSec));
    } else if (v.url != null && v.provider == VideoProvider.upload) {
      await ConceptVideoPlayer.open(context, ConceptVideo(id: v.id, topicId: topicId, youtubeVideoId: '', title: v.title, language: lang), fileUrl: _absolute(v.url!));
    } else {
      await _launch(v.url);
    }
  }

  Future<void> _launch(String? url) async {
    final s = ResourceStrings.of(context);
    final uri = url == null ? null : Uri.tryParse(_absolute(url));
    final ok = uri != null && await BoardTopicResources.launcher(uri);
    if (!ok && mounted) showBoardMessage(context, s.cannotOpen);
  }

  void _animation(ResourceAnimation a) {
    final anim = animationById(a.key);
    if (anim == null) {
      showBoardMessage(context, ResourceStrings.of(context).cannotOpen);
      return;
    }
    final lang = AnimLang.values.asNameMap()[Localizations.maybeLocaleOf(context)?.languageCode] ?? AnimLang.en;
    unawaited(
      showPanelDialog<void>(
        context: context,
        builder: (ctx) => Scaffold(
          key: Key('board-res-animation-${a.key}'),
          body: SafeArea(
            child: anim.kind == AnimKind.scene3d && anim.sceneId != null
                ? AnimationScene(animation: anim, lang: lang, onBack: () => Navigator.of(ctx).pop())
                : AnimationPlayer(animation: anim, lang: lang, onBack: () => Navigator.of(ctx).pop()),
          ),
        ),
      ),
    );
  }

  /// The PDF's bytes: the copy kept on the board, else downloaded (and kept).
  Future<Uint8List> _pdfBytes(String url) async {
    final dir = await BoardTopicResources.filesDir();
    final file = dir == null ? null : File('${dir.path}/${sha1.convert(utf8.encode(url))}.pdf');
    try {
      if (file != null && file.existsSync()) return await file.readAsBytes();
    } catch (_) {}
    final bytes = await _api!.download(url);
    try {
      if (file != null) {
        await file.parent.create(recursive: true);
        await file.writeAsBytes(bytes, flush: true);
      }
    } catch (_) {}
    return bytes;
  }

  Future<void> _material(ResourceMaterial m) async {
    final url = m.url;
    if (url == null || !m.isPdf || _api == null) return _launch(url);
    final s = ResourceStrings.of(context);
    setState(() => _opening = m.id);
    try {
      final bytes = await _pdfBytes(url);
      final pages = await BoardTopicResources.renderPdf(bytes, m.pages?.first ?? 1, m.pages?.last);
      if (!mounted) return;
      if (pages.isEmpty) throw const FormatException('no pages');
      final host = presentationHost;
      final title = m.pages == null ? m.title : '${m.title} (${s.pages(m.pages!)})';
      if (host == null) throw StateError('No board to open it on');
      host(Presentation(name: title, bytes: bytes, pages: pages, left: false, isPdf: true));
    } catch (e) {
      debugPrint('Topic material not opened: $e');
      if (mounted) showBoardMessage(context, s.cannotOpen);
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ResourceStrings.of(context);
    if (!_ready) return const Center(child: CircularProgressIndicator());
    final topics = _topics;
    final topic = _topic;
    final picker = Padding(
      padding: const EdgeInsets.only(top: Kx.s8),
      child: DropdownButtonFormField<String>(
        key: const Key('board-res-topic'),
        initialValue: topic?.id,
        isExpanded: true,
        decoration: InputDecoration(labelText: s.topic, prefixIcon: const Icon(Icons.topic_outlined)),
        items: [
          for (final t in topics)
            DropdownMenuItem(
              value: t.id,
              child: Text(t.chapter == null ? t.title : '${t.title} · ${t.chapter}', overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) {
          final t = topics.where((t) => t.id == id).firstOrNull;
          if (t != null) _pick(t);
        },
      ),
    );
    final load = _load;
    if (topic == null || load == null) {
      return ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [if (topics.isNotEmpty) picker, KxEmptyState(key: const Key('board-res-no-topic'), icon: Icons.topic_outlined, message: s.none)],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_opening != null) const LinearProgressIndicator(key: Key('board-res-opening')),
        Expanded(
          child: FutureBuilder<LoadedResources>(
            future: load,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (snap.hasError) {
                return ListView(
                  padding: const EdgeInsets.all(Kx.s16),
                  children: [
                    picker,
                    KxEmptyState(
                      key: const Key('board-res-error'),
                      icon: Icons.cloud_off_outlined,
                      message: s.couldNotLoad,
                      action: OutlinedButton.icon(onPressed: () => _pick(topic), icon: const Icon(Icons.refresh), label: Text(s.tryAgain)),
                    ),
                  ],
                );
              }
              final loaded = snap.data!;
              return TopicResourcesView(
                resources: loaded.resources,
                offline: loaded.offline,
                large: true,
                header: picker,
                onVideo: (v) => unawaited(_video(v)),
                onMaterial: (m) => unawaited(_material(m)),
                onAnimation: _animation,
              );
            },
          ),
        ),
      ],
    );
  }
}
