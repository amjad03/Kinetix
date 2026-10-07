import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart' as win;

import '../../core/board_controller.dart';
import '../../core/kiosk/kiosk_controller.dart' show PinCheck;
import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../insert/insert_actions.dart' show placePicture;
import '../projector/projector_ui.dart' show captureBoundaryPng;
import '../board/animations_hook.dart' show pngSize;

FeatureStrings safeWebStrings(BuildContext context) => FeatureStrings(boardLang(context), safeWebStringTable);

const safeWebStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Safe browser',
    'search': 'Search or type a web address',
    'go': 'Go',
    'home': 'Allowed sites',
    'back': 'Back',
    'reload': 'Reload',
    'addToBoard': 'Add to board',
    'added': 'The page is on the board',
    'linkAdded': 'This page cannot be pictured here; its link is on the board',
    'blocked': '{n} is not on the school\'s list of allowed sites.',
    'manage': 'Allowed sites',
    'manageHint': 'Set by the institution. Changing the list needs the IT PIN when the board has one.',
    'addSite': 'Add a site (e.g. ncert.nic.in)',
    'add': 'Add',
    'reset': 'Restore the default list',
    'pin': 'IT PIN',
    'wrongPin': 'Wrong PIN',
    'done': 'Done',
    'noView': 'The web view is not available on this device.',
    'fromInstitution': 'List from the institution',
    'searchIn': 'Search in',
  },
  'hi': {
    'title': 'सुरक्षित ब्राउज़र',
    'search': 'खोजें या वेब पता लिखें',
    'go': 'जाएँ',
    'home': 'अनुमत साइटें',
    'back': 'पीछे',
    'reload': 'फिर से लोड करें',
    'addToBoard': 'बोर्ड पर जोड़ें',
    'added': 'पेज बोर्ड पर है',
    'linkAdded': 'इस पेज का चित्र यहाँ नहीं लिया जा सकता; इसका लिंक बोर्ड पर है',
    'blocked': '{n} स्कूल की अनुमत साइटों की सूची में नहीं है।',
    'manage': 'अनुमत साइटें',
    'manageHint': 'संस्था द्वारा तय। बोर्ड पर IT PIN हो तो सूची बदलने के लिए उसकी ज़रूरत है।',
    'addSite': 'साइट जोड़ें (जैसे ncert.nic.in)',
    'add': 'जोड़ें',
    'reset': 'मूल सूची वापस लाएँ',
    'pin': 'IT PIN',
    'wrongPin': 'गलत PIN',
    'done': 'हो गया',
    'noView': 'इस डिवाइस पर वेब व्यू उपलब्ध नहीं है।',
    'fromInstitution': 'संस्था की सूची',
    'searchIn': 'यहाँ खोजें',
  },
  'kn': {
    'title': 'ಸುರಕ್ಷಿತ ಬ್ರೌಸರ್',
    'search': 'ಹುಡುಕಿ ಅಥವಾ ವೆಬ್ ವಿಳಾಸ ಬರೆಯಿರಿ',
    'go': 'ಹೋಗಿ',
    'home': 'ಅನುಮತಿಸಿದ ತಾಣಗಳು',
    'back': 'ಹಿಂದೆ',
    'reload': 'ಮರುಲೋಡ್',
    'addToBoard': 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ',
    'added': 'ಪುಟ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ',
    'linkAdded': 'ಈ ಪುಟದ ಚಿತ್ರ ಇಲ್ಲಿ ತೆಗೆಯಲಾಗದು; ಅದರ ಲಿಂಕ್ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ',
    'blocked': '{n} ಶಾಲೆಯ ಅನುಮತಿಸಿದ ತಾಣಗಳ ಪಟ್ಟಿಯಲ್ಲಿ ಇಲ್ಲ.',
    'manage': 'ಅನುಮತಿಸಿದ ತಾಣಗಳು',
    'manageHint': 'ಸಂಸ್ಥೆ ನಿಗದಿಪಡಿಸಿದೆ. ಬೋರ್ಡ್‌ಗೆ IT PIN ಇದ್ದರೆ ಪಟ್ಟಿ ಬದಲಿಸಲು ಅದು ಬೇಕು.',
    'addSite': 'ತಾಣ ಸೇರಿಸಿ (ಉದಾ. ncert.nic.in)',
    'add': 'ಸೇರಿಸಿ',
    'reset': 'ಮೂಲ ಪಟ್ಟಿಯನ್ನು ಮರಳಿ ತನ್ನಿ',
    'pin': 'IT PIN',
    'wrongPin': 'ತಪ್ಪು PIN',
    'done': 'ಆಯಿತು',
    'noView': 'ಈ ಸಾಧನದಲ್ಲಿ ವೆಬ್ ವ್ಯೂ ಲಭ್ಯವಿಲ್ಲ.',
    'fromInstitution': 'ಸಂಸ್ಥೆಯ ಪಟ್ಟಿ',
    'searchIn': 'ಇಲ್ಲಿ ಹುಡುಕಿ',
  },
};

/// The sites the safe browser opens (and their subdomains): education sites by default; the
/// institution sets its own list in the board config (`safeWeb.allow`).
abstract final class SafeWebPolicy {
  static const defaults = [
    'wikipedia.org',
    'wiktionary.org',
    'wikimedia.org',
    'ncert.nic.in',
    'diksha.gov.in',
    'epathshala.nic.in',
    'phet.colorado.edu',
    'khanacademy.org',
    'swayam.gov.in',
    'nptel.ac.in',
    'ndl.iitkgp.ac.in',
    'geogebra.org',
    'openstax.org',
    'indiacode.nic.in',
    'rbi.org.in',
  ];

  static const _key = 'kinetix.safeweb.allow', _instKey = 'kinetix.safeweb.institution';

  /// The list now (loaded with [load]).
  static List<String> allow = List.of(defaults);

  /// True when the list came from the institution's board config.
  static bool fromInstitution = false;

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      allow = p.getStringList(_key) ?? List.of(defaults);
      fromInstitution = p.getBool(_instKey) ?? false;
    } catch (_) {}
  }

  static Future<void> save(List<String> sites, {bool institution = false}) async {
    allow = [for (final s in sites) ?normaliseHost(s)];
    fromInstitution = institution;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setStringList(_key, allow);
      await p.setBool(_instKey, institution);
    } catch (_) {}
  }

  /// The board config's `safeWeb` (from KINETIX Cloud): `{"allow": ["ncert.nic.in", …]}`.
  static Future<void> applyConfig(Object? config) async {
    if (config is! Map) return;
    final list = config['allow'];
    if (list is List && list.isNotEmpty) await save([for (final s in list) '$s'], institution: true);
  }

  /// "https://www.NCERT.nic.in/x" → "ncert.nic.in"; null when it is not a host.
  static String? normaliseHost(String s) {
    var t = s.trim().toLowerCase();
    if (t.isEmpty) return null;
    if (!t.contains('://')) t = 'https://$t';
    final host = Uri.tryParse(t)?.host ?? '';
    final h = host.startsWith('www.') ? host.substring(4) : host;
    return h.contains('.') ? h : null;
  }

  /// Whether [url] may open: http(s) on an allowed site or one of its subdomains.
  static bool allows(String url, [List<String>? list]) {
    final u = Uri.tryParse(url);
    if (u == null || (u.scheme != 'https' && u.scheme != 'http')) return url == 'about:blank';
    final host = u.host.toLowerCase();
    return (list ?? allow).any((a) => host == a || host.endsWith('.$a'));
  }

  /// What the address bar's text opens: a web address if it looks like one, else a search.
  static Uri resolve(String input, {String lang = 'en', String engine = 'wikipedia'}) {
    final t = input.trim();
    final looksLikeUrl = !t.contains(' ') && (t.contains('://') || RegExp(r'^[\w-]+(\.[\w-]+)+(/.*)?$').hasMatch(t));
    if (looksLikeUrl) return Uri.parse(t.contains('://') ? t : 'https://$t');
    final q = Uri.encodeQueryComponent(t);
    return switch (engine) {
      'diksha' => Uri.parse('https://diksha.gov.in/explore?key=$q'),
      'khan' => Uri.parse('https://www.khanacademy.org/search?page_search_query=$q'),
      'phet' => Uri.parse('https://phet.colorado.edu/en/simulations/filter?type=html&search=$q'),
      _ => Uri.parse('https://${const {'hi', 'kn'}.contains(lang) ? lang : 'en'}.wikipedia.org/w/index.php?search=$q'),
    };
  }
}

/// The browser's page view: Android's WebView or WebView2 on Windows; [create] gives null where
/// there is none (tests, Linux). Every navigation is checked against the allowed sites.
abstract class SafeWebView {
  Future<void> load(Uri page);
  Widget view();
  Future<void> back();
  Future<void> reload();
  void dispose();

  static SafeWebView? Function({required bool Function(String url) allow, required void Function(String url) onBlocked, required void Function(String url) onPage})? debugOverride;

  static SafeWebView? create({required bool Function(String url) allow, required void Function(String url) onBlocked, required void Function(String url) onPage}) {
    if (debugOverride != null) return debugOverride!(allow: allow, onBlocked: onBlocked, onPage: onPage);
    if (Platform.environment.containsKey('FLUTTER_TEST')) return null;
    if (Platform.isWindows) return _WindowsSafeView(allow, onBlocked, onPage);
    if (Platform.isAndroid || Platform.isIOS) return WebViewPlatform.instance == null ? null : _AndroidSafeView(allow, onBlocked, onPage);
    return null;
  }
}

class _AndroidSafeView implements SafeWebView {
  _AndroidSafeView(bool Function(String) allow, void Function(String) onBlocked, void Function(String) onPage) {
    _c
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (r) {
            if (allow(r.url)) return NavigationDecision.navigate;
            onBlocked(r.url);
            return NavigationDecision.prevent;
          },
          onPageFinished: onPage,
        ),
      );
  }

  final _c = WebViewController();

  @override
  Future<void> load(Uri page) => _c.loadRequest(page);

  @override
  Widget view() => WebViewWidget(controller: _c, gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())});

  @override
  Future<void> back() async {
    if (await _c.canGoBack()) await _c.goBack();
  }

  @override
  Future<void> reload() => _c.reload();

  @override
  void dispose() => unawaited(_c.loadRequest(Uri.parse('about:blank')).catchError((_) {}));
}

class _WindowsSafeView implements SafeWebView {
  _WindowsSafeView(this._allow, this._onBlocked, this._onPage);

  final bool Function(String) _allow;
  final void Function(String) _onBlocked, _onPage;
  final _c = win.WebviewController();
  Future<void>? _ready;
  StreamSubscription<String>? _sub;
  String _lastAllowed = 'about:blank';

  Future<void> _init() async {
    await _c.initialize();
    await _c.setPopupWindowPolicy(win.WebviewPopupWindowPolicy.deny);
    // WebView2 here cannot refuse a navigation before it starts: a page off the list is left
    // at once for the last allowed one.
    _sub = _c.url.listen((u) {
      if (_allow(u)) {
        _lastAllowed = u;
        _onPage(u);
      } else {
        _onBlocked(u);
        unawaited(_c.loadUrl(_lastAllowed));
      }
    });
  }

  @override
  Future<void> load(Uri page) async {
    await (_ready ??= _init());
    await _c.loadUrl(page.toString());
  }

  @override
  Widget view() => ValueListenableBuilder<win.WebviewValue>(
    valueListenable: _c,
    builder: (context, v, _) => v.isInitialized ? win.Webview(_c) : const SizedBox.expand(),
  );

  @override
  Future<void> back() => _c.goBack();

  @override
  Future<void> reload() => _c.reload();

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    unawaited(_c.dispose());
  }
}

/// The safe browser in the split panel: only the institution's allowed sites; search
/// (Wikipedia in the board's language, DIKSHA, Khan Academy, PhET); and "Add to board" (a
/// picture of the page, or its link where the page cannot be pictured).
class SafeBrowserPanel extends StatefulWidget {
  const SafeBrowserPanel({super.key, required this.wb, this.board});

  final WhiteboardController wb;
  final BoardController? board;

  @override
  State<SafeBrowserPanel> createState() => SafeBrowserPanelState();
}

class SafeBrowserPanelState extends State<SafeBrowserPanel> {
  final _address = TextEditingController();
  final _shotKey = GlobalKey();
  SafeWebView? _view;
  String? url;
  String? blocked;
  String _engine = 'wikipedia';
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    SafeWebPolicy.load().then((_) {
      if (mounted) setState(() => _loaded = true);
    });
  }

  @override
  void dispose() {
    _view?.dispose();
    _address.dispose();
    super.dispose();
  }

  SafeWebView? _ensureView() => _view ??= SafeWebView.create(
    allow: SafeWebPolicy.allows,
    onBlocked: (u) {
      if (mounted) setState(() => blocked = Uri.tryParse(u)?.host ?? u);
    },
    onPage: (u) {
      if (!mounted) return;
      setState(() {
        url = u;
        blocked = null;
        _address.text = u;
      });
    },
  );

  /// Opens what was typed: an allowed address, or a search on an allowed site.
  Future<void> open(String input) async {
    if (input.trim().isEmpty) return;
    final target = SafeWebPolicy.resolve(input, lang: boardLang(context), engine: _engine);
    if (!SafeWebPolicy.allows(target.toString())) {
      setState(() => blocked = target.host);
      return;
    }
    setState(() {
      blocked = null;
      url = target.toString();
    });
    await _ensureView()?.load(target);
  }

  Future<void> addToBoard() async {
    final s = safeWebStrings(context);
    final u = url;
    if (u == null) return;
    Uint8List? png;
    try {
      png = await captureBoundaryPng(_shotKey, maxWidth: 1600);
    } catch (_) {}
    if (!mounted) return;
    // A platform view (Android's WebView) does not show in a picture of the panel: the page's
    // link goes on the board instead.
    if (png != null && !await _blank(png)) {
      placePicture(widget.wb, png, pngSize(png), credit: u);
      if (mounted) showBoardMessage(context, s['added']);
      return;
    }
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    widget.wb.insert([
      NoteElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 420, 140), text: '🔗 ${Uri.tryParse(u)?.host ?? u}\n$u', color: const Color(0xFFAECBFA), kind: NoteKind.card),
      TextElement(id: newElementId(), position: const Offset(0, 150), text: u, color: ink, fontSize: 14, size: measureBoardText(u, 14)),
    ]);
    if (mounted) showBoardMessage(context, s['linkAdded']);
  }

  /// Whether a picture is one flat colour (what a platform view leaves).
  static Future<bool> _blank(Uint8List png) async => png.length < 2500;

  Future<void> _manage() async {
    final board = widget.board;
    final s = safeWebStrings(context);
    if (board != null && board.kiosk.pinSet) {
      final pin = TextEditingController();
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text(s['pin']),
          content: TextField(key: const Key('safeweb-pin'), controller: pin, obscureText: true, keyboardType: TextInputType.number, autofocus: true),
          actions: [FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s['done']))],
        ),
      );
      if (ok != true) return;
      final r = await board.kiosk.checkPin(pin.text);
      if (r.check != PinCheck.ok) {
        if (mounted) showBoardMessage(context, s['wrongPin']);
        return;
      }
    }
    if (!mounted) return;
    await showDialog<void>(context: context, builder: (_) => const SafeSitesDialog());
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = safeWebStrings(context);
    final c = context.colors;
    final view = url == null ? null : _ensureView();
    final engines = {'wikipedia': 'Wikipedia', 'diksha': 'DIKSHA', 'khan': 'Khan Academy', 'phet': 'PhET'};
    Widget body;
    if (url == null) {
      body = !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(Kx.s12),
              children: [
                Text(s['home'], style: context.text.titleMedium),
                if (SafeWebPolicy.fromInstitution) Text(s['fromInstitution'], style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s8),
                Wrap(
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  children: [
                    for (final site in SafeWebPolicy.allow)
                      ActionChip(key: Key('safeweb-site-$site'), avatar: const Icon(Icons.public, size: 18), label: Text(site), onPressed: () => open(site)),
                  ],
                ),
              ],
            );
    } else if (view == null) {
      body = Center(child: Padding(padding: const EdgeInsets.all(Kx.s24), child: Text('${s['noView']}\n$url', key: const Key('safeweb-noview'), textAlign: TextAlign.center)));
    } else {
      body = RepaintBoundary(key: _shotKey, child: view.view());
    }
    return Column(
      key: const Key('safeweb-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, 0),
          child: Row(
            children: [
              IconButton(key: const Key('safeweb-home'), tooltip: s['home'], onPressed: () => setState(() => url = null), icon: const Icon(Icons.home_outlined)),
              IconButton(tooltip: s['back'], onPressed: url == null ? null : () => _view?.back(), icon: const Icon(Icons.arrow_back)),
              Expanded(
                child: TextField(
                  key: const Key('safeweb-address'),
                  controller: _address,
                  textInputAction: TextInputAction.go,
                  decoration: InputDecoration(isDense: true, hintText: s['search'], prefixIcon: const Icon(Icons.search), border: const OutlineInputBorder()),
                  onSubmitted: open,
                ),
              ),
              IconButton(key: const Key('safeweb-go'), tooltip: s['go'], onPressed: () => open(_address.text), icon: const Icon(Icons.arrow_forward)),
              IconButton(key: const Key('safeweb-manage'), tooltip: s['manage'], onPressed: _manage, icon: const Icon(Icons.admin_panel_settings_outlined)),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
          child: Row(
            children: [
              Text('${s['searchIn']}: '),
              for (final e in engines.entries)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: ChoiceChip(key: Key('safeweb-engine-${e.key}'), label: Text(e.value), selected: _engine == e.key, visualDensity: VisualDensity.compact, onSelected: (_) => setState(() => _engine = e.key)),
                ),
              const SizedBox(width: Kx.s8),
              FilledButton.tonalIcon(
                key: const Key('safeweb-add-to-board'),
                onPressed: url == null ? null : addToBoard,
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: Text(s['addToBoard']),
              ),
            ],
          ),
        ),
        if (blocked != null)
          MaterialBanner(
            key: const Key('safeweb-blocked'),
            leading: const Icon(Icons.block),
            content: Text(s.n('blocked', blocked!)),
            actions: [TextButton(onPressed: () => setState(() => blocked = null), child: Text(s['done']))],
          ),
        Expanded(child: body),
      ],
    );
  }
}

/// Edits the allowed sites (after the IT PIN, when the board has one).
class SafeSitesDialog extends StatefulWidget {
  const SafeSitesDialog({super.key});

  @override
  State<SafeSitesDialog> createState() => _SafeSitesDialogState();
}

class _SafeSitesDialogState extends State<SafeSitesDialog> {
  late List<String> _sites = List.of(SafeWebPolicy.allow);
  final _add = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final s = safeWebStrings(context);
    return AlertDialog(
      key: const Key('safeweb-sites'),
      title: Text(s['manage']),
      content: SizedBox(
        width: 460,
        height: 420,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s['manageHint'], style: context.text.bodySmall),
            Row(
              children: [
                Expanded(child: TextField(key: const Key('safeweb-add-site'), controller: _add, decoration: InputDecoration(hintText: s['addSite']))),
                TextButton(
                  key: const Key('safeweb-add-site-go'),
                  onPressed: () {
                    final h = SafeWebPolicy.normaliseHost(_add.text);
                    if (h == null || _sites.contains(h)) return;
                    setState(() => _sites.add(h));
                    _add.clear();
                  },
                  child: Text(s['add']),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final site in _sites)
                    ListTile(
                      dense: true,
                      title: Text(site),
                      trailing: IconButton(key: Key('safeweb-remove-$site'), icon: const Icon(Icons.close), onPressed: () => setState(() => _sites.remove(site))),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => setState(() => _sites = List.of(SafeWebPolicy.defaults)), child: Text(s['reset'])),
        FilledButton(
          key: const Key('safeweb-sites-done'),
          onPressed: () async {
            await SafeWebPolicy.save(_sites);
            if (context.mounted) Navigator.pop(context);
          },
          child: Text(s['done']),
        ),
      ],
    );
  }
}
