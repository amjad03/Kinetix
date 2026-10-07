import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';

/// The page the player runs in: the embed's origin and Referer (YouTube's embedded player needs one).
const playerOrigin = 'https://player.kinetix.local';

final _videoId = RegExp(r'^[A-Za-z0-9_-]{11}$');

const _languageNames = {'en': 'English', 'hi': 'हिन्दी', 'kn': 'ಕನ್ನಡ'};

/// YouTube's official IFrame player on the privacy-enhanced youtube-nocookie.com host, filling
/// the screen and playing at once. Only a checked id reaches the page.
String playerHtml(String videoId, {String language = 'en'}) {
  if (!_videoId.hasMatch(videoId)) throw ArgumentError.value(videoId, 'videoId');
  final hl = _languageNames.containsKey(language) ? language : 'en';
  return '''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#player{position:fixed;inset:0;width:100%;height:100%}</style>
</head><body><div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
function onYouTubeIframeAPIReady() {
  new YT.Player('player', {
    host: 'https://www.youtube-nocookie.com',
    videoId: '$videoId',
    playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, hl: '$hl', cc_lang_pref: '$hl', origin: '$playerOrigin' },
    events: { onReady: function (e) { e.target.playVideo(); } }
  });
}
</script></body></html>''';
}

/// "Concept videos" on a topic page: the KINETIX channel's explainers, to preview before class and
/// revise after. Nothing shows when the topic has none (or they can't be loaded).
class ConceptVideosSection extends StatefulWidget {
  const ConceptVideosSection({super.key, required this.api, required this.topicId});

  final StudentApi api;
  final String topicId;

  @override
  State<ConceptVideosSection> createState() => _ConceptVideosSectionState();
}

class _ConceptVideosSectionState extends State<ConceptVideosSection> {
  late final Future<List<ConceptVideo>> _videos = widget.api.conceptVideos(widget.topicId);

  @override
  Widget build(BuildContext context) => FutureBuilder<List<ConceptVideo>>(
    future: _videos,
    builder: (context, snap) {
      final videos = snap.data;
      if (videos == null || videos.isEmpty) return const SizedBox.shrink();
      final l = context.l10n;
      final c = context.colors;
      return Padding(
        padding: const EdgeInsets.only(bottom: Kx.s12),
        child: Card(
          key: const Key('conceptVideos'),
          child: Padding(
            padding: const EdgeInsets.all(Kx.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.smart_display_outlined, size: 20, color: c.primary),
                    const SizedBox(width: Kx.s8),
                    Expanded(child: Text(l.conceptVideos, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500))),
                  ],
                ),
                const SizedBox(height: Kx.s4),
                Text(l.conceptVideosHint, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s8),
                for (final v in videos) _VideoRow(video: v),
                Text(l.conceptVideosFromYouTube, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _VideoRow extends StatelessWidget {
  const _VideoRow({required this.video});

  final ConceptVideo video;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final meta = [if (video.durationLabel.isNotEmpty) video.durationLabel, _languageNames[video.language] ?? video.language].join(' · ');
    return Semantics(
      button: true,
      label: context.l10n.conceptVideoPlay(video.title),
      child: InkWell(
        key: Key('conceptVideo-${video.id}'),
        borderRadius: BorderRadius.circular(Kx.rMd),
        onTap: () => ConceptVideoScreen.open(context, video),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Kx.s8),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(Kx.rSm),
                child: SizedBox(
                  width: 112,
                  height: 63,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(video.thumbnailUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => ColoredBox(color: c.surfaceContainerHighest)),
                      const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 30)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(video.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyLarge),
                    Row(
                      children: [
                        _SourceBadge(key: Key('videoSource-${video.id}'), source: video.source),
                        const SizedBox(width: Kx.s8),
                        Flexible(child: Text(meta, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Who linked a video: KINETIX, the school or the class's teacher.
class _SourceBadge extends StatelessWidget {
  const _SourceBadge({super.key, required this.source});

  final String source;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final platform = source != 'institution' && source != 'teacher';
    final label = switch (source) {
      'institution' => l.conceptVideoSourceInstitution,
      'teacher' => l.conceptVideoSourceTeacher,
      _ => l.conceptVideoSourcePlatform,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
      decoration: BoxDecoration(color: platform ? c.surfaceContainerHighest : c.tertiaryContainer, borderRadius: BorderRadius.circular(Kx.rSm)),
      child: Text(label, style: context.text.labelSmall?.copyWith(color: platform ? c.onSurfaceVariant : c.onTertiaryContainer)),
    );
  }
}

/// Only the player page may load in the main frame (no wandering off to youtube.com).
bool playerMayNavigate(String url, {required bool mainFrame}) => !mainFrame || url.startsWith(playerOrigin) || url == 'about:blank';

/// A concept video, full screen. Back or Close returns to the topic.
class ConceptVideoScreen extends StatelessWidget {
  const ConceptVideoScreen({super.key, required this.video});

  final ConceptVideo video;

  /// Tests replace the WebView (there is no platform view in widget tests).
  @visibleForTesting
  static Widget Function(ConceptVideo video)? surfaceOverride;

  static Future<void> open(BuildContext context, ConceptVideo video) =>
      Navigator.of(context).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => ConceptVideoScreen(video: video)));

  @override
  Widget build(BuildContext context) => Scaffold(
    key: const Key('conceptVideoScreen'),
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      title: Text(video.title, maxLines: 1, overflow: TextOverflow.ellipsis),
    ),
    body: SafeArea(child: _surface(context)),
  );

  Widget _surface(BuildContext context) {
    final override = surfaceOverride;
    if (override != null) return override(video);
    if (!kIsWeb && (Platform.isAndroid || Platform.isIOS)) return _Player(html: playerHtml(video.youtubeVideoId, language: video.language));
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s24),
        child: Text(context.l10n.conceptVideosUnsupported, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
      ),
    );
  }
}

class _Player extends StatefulWidget {
  const _Player({required this.html});
  final String html;

  @override
  State<_Player> createState() => _PlayerState();
}

class _PlayerState extends State<_Player> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController.fromPlatformCreationParams(
      WebViewPlatform.instance is AndroidWebViewPlatform ? AndroidWebViewControllerCreationParams() : const PlatformWebViewControllerCreationParams(),
    );
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) unawaited(platform.setMediaPlaybackRequiresUserGesture(false));
    unawaited(_controller.setJavaScriptMode(JavaScriptMode.unrestricted));
    unawaited(_controller.setBackgroundColor(Colors.black));
    unawaited(
      _controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (r) => playerMayNavigate(r.url, mainFrame: r.isMainFrame) ? NavigationDecision.navigate : NavigationDecision.prevent,
        ),
      ),
    );
    unawaited(_controller.loadHtmlString(widget.html, baseUrl: '$playerOrigin/'));
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);
}
