import 'dart:async';
import 'dart:io' show Directory, File, Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_windows/webview_windows.dart' as win;

import '../../l10n/l10n.dart';
import 'concept_videos.dart';
import '../board/panel/panel_host.dart';

/// The page the player runs in. It is the embed's origin (and Referer, which YouTube's embedded
/// player requires); nothing is served from it but the player page itself.
const playerHost = 'player.kinetix.local';
const playerOrigin = 'https://$playerHost';

final _videoId = RegExp(r'^[A-Za-z0-9_-]{11}$');

/// YouTube's official IFrame player (privacy-enhanced youtube-nocookie.com host), full screen and
/// playing at once, captions and controls in [language]. The id is checked, so nothing but an id
/// reaches the page.
String playerHtml(String videoId, {String language = 'en'}) {
  if (!_videoId.hasMatch(videoId)) throw ArgumentError.value(videoId, 'videoId');
  final hl = const {'en', 'hi', 'kn'}.contains(language) ? language : 'en';
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
    playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, hl: '$hl', cc_lang_pref: '$hl', origin: '$playerOrigin' },
    events: { onReady: function (e) { e.target.playVideo(); } }
  });
}
</script></body></html>''';
}

/// A concept video, in the split panel. Close returns to the board.
class ConceptVideoPlayer extends StatelessWidget {
  const ConceptVideoPlayer({super.key, required this.video});

  final ConceptVideo video;

  /// Tests replace the WebView (there is no platform view in widget tests).
  @visibleForTesting
  static Widget Function(ConceptVideo video)? surfaceOverride;

  /// Plays [video] in the board's split panel.
  static Future<void> open(BuildContext context, ConceptVideo video) => showPanelDialog<void>(context: context, builder: (_) => ConceptVideoPlayer(video: video));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      key: const Key('conceptVideoPlayer'),
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(child: _surface(context)),
          Positioned(
            top: Kx.s16,
            left: Kx.s16,
            right: Kx.s16,
            child: Row(
              children: [
                IconButton.filledTonal(
                  key: const Key('conceptVideoClose'),
                  iconSize: 32,
                  tooltip: l.close,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
                const SizedBox(width: Kx.s16),
                Expanded(
                  child: Text(
                    video.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _surface(BuildContext context) {
    final override = surfaceOverride;
    if (override != null) return override(video);
    final html = playerHtml(video.youtubeVideoId, language: video.language);
    if (!kIsWeb && Platform.isAndroid) return _AndroidPlayer(html: html);
    if (!kIsWeb && Platform.isWindows) return _WindowsPlayer(html: html);
    return _Unsupported();
  }
}

class _Unsupported extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Kx.s32),
      child: Text(
        context.l10n.conceptVideosUnsupported,
        key: const Key('conceptVideoUnsupported'),
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontSize: 20),
      ),
    ),
  );
}

/// Only the player page may load in the main frame: the YouTube logo and "Watch on YouTube"
/// would otherwise leave the board (and kiosk mode) for youtube.com.
bool playerMayNavigate(String url, {required bool mainFrame}) =>
    !mainFrame || url.startsWith(playerOrigin) || url == 'about:blank';

/// Android panels: the system WebView.
class _AndroidPlayer extends StatefulWidget {
  const _AndroidPlayer({required this.html});
  final String html;

  @override
  State<_AndroidPlayer> createState() => _AndroidPlayerState();
}

class _AndroidPlayerState extends State<_AndroidPlayer> {
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

/// Windows panels and OPS PCs: WebView2. The player page is written to a temporary folder served
/// as https://player.kinetix.local, so the embed has a proper origin.
class _WindowsPlayer extends StatefulWidget {
  const _WindowsPlayer({required this.html});
  final String html;

  @override
  State<_WindowsPlayer> createState() => _WindowsPlayerState();
}

class _WindowsPlayerState extends State<_WindowsPlayer> {
  final _controller = win.WebviewController();
  StreamSubscription<String>? _urls;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      await _controller.initialize();
      await _controller.setBackgroundColor(Colors.black);
      await _controller.setPopupWindowPolicy(win.WebviewPopupWindowPolicy.deny);
      final dir = Directory('${(await getTemporaryDirectory()).path}/kinetix_player')..createSync(recursive: true);
      File('${dir.path}/player.html').writeAsStringSync(widget.html);
      await _controller.addVirtualHostNameMapping(playerHost, dir.path, win.WebviewHostResourceAccessKind.allow);
      const page = '$playerOrigin/player.html';
      _urls = _controller.url.listen((u) {
        if (!playerMayNavigate(u, mainFrame: true)) unawaited(_controller.loadUrl(page));
      });
      await _controller.loadUrl(page);
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      // No WebView2 runtime on this PC, most likely.
      debugPrint('Concept video player unavailable: $e');
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    unawaited(_urls?.cancel());
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return _Unsupported();
    if (!_ready) return const Center(child: CircularProgressIndicator());
    return win.Webview(_controller);
  }
}
