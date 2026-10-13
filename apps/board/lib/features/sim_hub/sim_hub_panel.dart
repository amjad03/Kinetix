import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../board/side_panel.dart' show PanelPage;
import '../phet/phet_view.dart';
import 'native/map_sims.dart';
import 'native/other_sims.dart';
import 'native/psych_tests.dart';
import 'sim_entry.dart';
import 'sim_server.dart';

/// The hub's words: its filters, list, viewer notices and subjects.
FeatureStrings simHubStrings(String lang) => FeatureStrings(lang, simHubStringTable);

const simHubStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Simulations hub',
    'subject': 'Subject',
    'allSubjects': 'All subjects',
    'class': 'Class',
    'allClasses': 'All classes',
    'classN': 'Class {n}',
    'classRange': 'Class {a}–{b}',
    'college': 'College',
    'search': 'Search',
    'worksOffline': 'Works offline',
    'pinnedHere': 'Pinned to this page:',
    'offline': 'Offline',
    'onlineOnly': 'Online only',
    'pin': 'Pin to this page',
    'noViewer': 'This panel cannot show web simulations.',
    'viewerBeside': 'The 3D viewer is open beside the board.',
    'noPicture': 'Could not picture the simulation',
    'pictureAdded': 'Picture of the simulation added to the board',
    'physics': 'Physics',
    'chemistry': 'Chemistry',
    'biology': 'Biology',
    'earth': 'Earth science',
    'maths': 'Maths',
    'electronics': 'Electronics',
    'cs': 'Computer science',
    'economics': 'Economics',
    'psychology': 'Psychology',
    'geography': 'Geography',
    'history': 'History',
    'language': 'Language',
    'general': 'General',
    'saved': 'Saved for offline',
    'offlineSaved': 'No internet. Showing the copy saved when this simulation was last opened online ({date}).',
    'offlineNever': '{title} is an online simulation and the board has no internet. Open it once while connected and it is kept for offline use, or choose one of the Offline sims.',
  },
  'hi': {
    'title': 'सिमुलेशन हब',
    'subject': 'विषय',
    'allSubjects': 'सभी विषय',
    'class': 'कक्षा',
    'allClasses': 'सभी कक्षाएँ',
    'classN': 'कक्षा {n}',
    'classRange': 'कक्षा {a}–{b}',
    'college': 'कॉलेज',
    'search': 'खोजें',
    'worksOffline': 'ऑफ़लाइन चलते हैं',
    'pinnedHere': 'इस पेज पर पिन:',
    'offline': 'ऑफ़लाइन',
    'onlineOnly': 'केवल ऑनलाइन',
    'pin': 'इस पेज पर पिन करें',
    'noViewer': 'यह पैनल वेब सिमुलेशन नहीं दिखा सकता।',
    'viewerBeside': '3D व्यूअर बोर्ड के बगल में खुला है।',
    'noPicture': 'सिमुलेशन का चित्र नहीं बन सका',
    'pictureAdded': 'सिमुलेशन का चित्र बोर्ड पर जोड़ा गया',
    'physics': 'भौतिकी',
    'chemistry': 'रसायन विज्ञान',
    'biology': 'जीव विज्ञान',
    'earth': 'पृथ्वी विज्ञान',
    'maths': 'गणित',
    'electronics': 'इलेक्ट्रॉनिकी',
    'cs': 'कंप्यूटर विज्ञान',
    'economics': 'अर्थशास्त्र',
    'psychology': 'मनोविज्ञान',
    'geography': 'भूगोल',
    'history': 'इतिहास',
    'language': 'भाषा',
    'general': 'सामान्य',
    'saved': 'ऑफ़लाइन के लिए सहेजा गया',
    'offlineSaved': 'इंटरनेट नहीं है। यह सिमुलेशन पिछली बार ऑनलाइन खुलने पर सहेजी गई प्रति में दिख रहा है ({date})।',
    'offlineNever': '{title} ऑनलाइन सिमुलेशन है और बोर्ड पर इंटरनेट नहीं है। इसे एक बार इंटरनेट से जुड़कर खोलें, फिर यह ऑफ़लाइन के लिए सहेज लिया जाता है, या कोई ऑफ़लाइन सिमुलेशन चुनें।',
  },
  'kn': {
    'title': 'ಸಿಮ್ಯುಲೇಶನ್ ಹಬ್',
    'subject': 'ವಿಷಯ',
    'allSubjects': 'ಎಲ್ಲ ವಿಷಯಗಳು',
    'class': 'ತರಗತಿ',
    'allClasses': 'ಎಲ್ಲ ತರಗತಿಗಳು',
    'classN': 'ತರಗತಿ {n}',
    'classRange': 'ತರಗತಿ {a}–{b}',
    'college': 'ಕಾಲೇಜು',
    'search': 'ಹುಡುಕಿ',
    'worksOffline': 'ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕೆಲಸ ಮಾಡುವವು',
    'pinnedHere': 'ಈ ಪುಟಕ್ಕೆ ಪಿನ್ ಮಾಡಿದವು:',
    'offline': 'ಆಫ್‌ಲೈನ್',
    'onlineOnly': 'ಆನ್‌ಲೈನ್ ಮಾತ್ರ',
    'pin': 'ಈ ಪುಟಕ್ಕೆ ಪಿನ್ ಮಾಡಿ',
    'noViewer': 'ಈ ಪ್ಯಾನೆಲ್ ವೆಬ್ ಸಿಮ್ಯುಲೇಶನ್‌ಗಳನ್ನು ತೋರಿಸಲಾರದು.',
    'viewerBeside': '3D ವೀಕ್ಷಕ ಬೋರ್ಡ್‌ನ ಪಕ್ಕದಲ್ಲಿ ತೆರೆದಿದೆ.',
    'noPicture': 'ಸಿಮ್ಯುಲೇಶನ್‌ನ ಚಿತ್ರ ತೆಗೆಯಲಾಗಲಿಲ್ಲ',
    'pictureAdded': 'ಸಿಮ್ಯುಲೇಶನ್‌ನ ಚಿತ್ರವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಲಾಗಿದೆ',
    'physics': 'ಭೌತಶಾಸ್ತ್ರ',
    'chemistry': 'ರಸಾಯನಶಾಸ್ತ್ರ',
    'biology': 'ಜೀವಶಾಸ್ತ್ರ',
    'earth': 'ಭೂ ವಿಜ್ಞಾನ',
    'maths': 'ಗಣಿತ',
    'electronics': 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್',
    'cs': 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ',
    'economics': 'ಅರ್ಥಶಾಸ್ತ್ರ',
    'psychology': 'ಮನೋವಿಜ್ಞಾನ',
    'geography': 'ಭೂಗೋಳ',
    'history': 'ಇತಿಹಾಸ',
    'language': 'ಭಾಷೆ',
    'general': 'ಸಾಮಾನ್ಯ',
    'saved': 'ಆಫ್‌ಲೈನ್‌ಗಾಗಿ ಉಳಿಸಲಾಗಿದೆ',
    'offlineSaved': 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಈ ಸಿಮ್ಯುಲೇಶನ್ ಕೊನೆಯ ಬಾರಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ತೆರೆದಾಗ ಉಳಿಸಿದ ಪ್ರತಿಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ ({date}).',
    'offlineNever': '{title} ಆನ್‌ಲೈನ್ ಸಿಮ್ಯುಲೇಶನ್ ಆಗಿದ್ದು ಬೋರ್ಡ್‌ಗೆ ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಸಂಪರ್ಕದಲ್ಲಿರುವಾಗ ಒಮ್ಮೆ ತೆರೆದರೆ ಅದು ಆಫ್‌ಲೈನ್‌ಗಾಗಿ ಉಳಿಯುತ್ತದೆ, ಅಥವಾ ಆಫ್‌ಲೈನ್ ಸಿಮ್ ಆರಿಸಿ.',
  },
};

/// Whether the board can reach the internet right now; tests replace it.
Future<bool> Function() simHubOnlineCheck = () async {
  try {
    final r = await InternetAddress.lookup('example.com').timeout(const Duration(seconds: 3));
    return r.isNotEmpty;
  } catch (_) {
    return false;
  }
};

/// What the Simulations hub is showing, kept by the board screen so "Add to board" can picture
/// the open sim.
class SimHubController extends ChangeNotifier {
  String? _openId;
  PhetWebView? _view;
  final boundaryKey = GlobalKey();

  /// Opens the 3D viewer for the "3D biology models" entry.
  VoidCallback? openModel3d;

  String? get openId => _openId;
  SimEntry? get open => _openId == null ? null : simById(_openId!);

  /// Something is showing that can be pictured.
  bool get showing => _openId != null;

  void openSim(String id) {
    _openId = id;
    notifyListeners();
  }

  void close() {
    _openId = null;
    _view = null;
    notifyListeners();
  }

  /// A PNG of the open sim: PhET's own screenshot generator in the page, else the panel as
  /// Flutter draws it (native sims, tests).
  Future<Uint8List?> capture() async {
    final fromPage = await _view?.screenshot();
    if (fromPage != null) return fromPage;
    final boundary = boundaryKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return null;
    final image = await boundary.toImage(pixelRatio: math.min(1.0, 1280 / math.max(1, boundary.size.width)));
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data == null ? null : Uint8List.view(data.buffer);
  }
}

/// "Add to board": a picture of the open sim with its source and licence under it.
Future<void> addSimShotToBoard(BuildContext context, WhiteboardController wb, SimHubController c, {required bool dark}) async {
  final sim = c.open;
  final png = await c.capture();
  if (!context.mounted) return;
  if (png == null || sim == null) {
    showBoardMessage(context, simHubStrings(boardLang(context))['noPicture']);
    return;
  }
  var w = 560.0, h = 360.0;
  if (png.length >= 24) {
    final d = ByteData.sublistView(png);
    final pw = d.getUint32(16).toDouble(), ph = d.getUint32(20).toDouble();
    if (pw > 0) {
      w = math.min(560.0, pw);
      h = w * ph / pw;
    }
  }
  final credit = '${sim.title} · ${sim.note ?? '${sim.source}, ${sim.licence}'}';
  wb.insert([
    ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: png),
    TextElement(id: newElementId(), position: Offset(0, h + 6), text: credit, color: dark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack, fontSize: 14, size: measureBoardText(credit, 14)),
  ]);
  if (context.mounted) showBoardMessage(context, simHubStrings(boardLang(context))['pictureAdded']);
}

/// The Simulations hub: sims by subject and class, bundled ones that work offline, online ones
/// with a clear message when there is no internet, and pins per board page.
class SimHubPanel extends StatefulWidget {
  const SimHubPanel({super.key, required this.controller, required this.page, this.subject, this.grade});

  final SimHubController controller;

  /// The board page now showing; pins belong to a page.
  final int Function() page;

  /// The session's subject and class, to start the filters there.
  final String? subject;
  final int? grade;

  @override
  State<SimHubPanel> createState() => _SimHubPanelState();
}

class _SimHubPanelState extends State<SimHubPanel> {
  String? _subject;
  int? _grade;
  String _query = '';
  bool _offlineOnly = false;
  SimPins? _pins;

  @override
  void initState() {
    super.initState();
    final s = widget.subject?.toLowerCase();
    _subject = simSubjects.contains(s) ? s : null;
    _grade = widget.grade;
    widget.controller.addListener(_changed);
    // Warm up the loopback server while the list is on screen so a tapped tile opens at once.
    if (!Platform.environment.containsKey('FLUTTER_TEST')) unawaited(SimAssetServer.start());
    SimWarmView.prepare();
    SimPins.load().then((p) {
      if (mounted) setState(() => _pins = p);
    });
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _togglePin(SimEntry e) async {
    await _pins?.toggle(widget.page(), e.id);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final open = widget.controller.open;
    // Keyed by the sim, so opening another one (a pin, search) starts its own page.
    if (open != null) return _OpenSim(key: ValueKey(open.id), entry: open, controller: widget.controller, pinned: _pins?.isPinned(widget.page(), open.id) ?? false, onPin: () => _togglePin(open));
    final shown = filterSims(subject: _subject, grade: _grade, query: _query, offlineOnly: _offlineOnly);
    final pinned = [for (final id in _pins?.forPage(widget.page()) ?? const <String>[]) if (simById(id) != null) simById(id)!];
    final lang = boardLang(context);
    final hs = simHubStrings(lang);
    String grade(int g) => g == 13 ? hs['college'] : hs.n('classN', g);
    String grades(SimEntry e) => e.gradeMin == e.gradeMax ? grade(e.gradeMin) : hs['classRange'].replaceAll('{a}', '${e.gradeMin}').replaceAll('{b}', e.gradeMax == 13 ? hs['college'] : '${e.gradeMax}');
    // Headed like the drawer's other tools in the panel; an open simulation has its own title row.
    return PanelPage(icon: Icons.biotech, title: hs['title'], child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
        child: Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          DropdownButton<String?>(
            key: const Key('hub-subject'),
            value: _subject,
            hint: Text(hs['subject']),
            items: [DropdownMenuItem(value: null, child: Text(hs['allSubjects'])), for (final s in simSubjects) DropdownMenuItem(value: s, child: Text(hs[s]))],
            onChanged: (v) => setState(() => _subject = v),
          ),
          DropdownButton<int?>(
            key: const Key('hub-grade'),
            value: _grade,
            hint: Text(hs['class']),
            items: [DropdownMenuItem(value: null, child: Text(hs['allClasses'])), for (var g = 1; g <= 13; g++) DropdownMenuItem(value: g, child: Text(grade(g)))],
            onChanged: (v) => setState(() => _grade = v),
          ),
          SizedBox(width: 180, child: TextField(key: const Key('hub-search'), decoration: InputDecoration(hintText: hs['search'], isDense: true, prefixIcon: const Icon(Icons.search)), onChanged: (v) => setState(() => _query = v))),
          FilterChip(key: const Key('hub-offline'), label: Text(hs['worksOffline']), selected: _offlineOnly, onSelected: (v) => setState(() => _offlineOnly = v)),
        ]),
      ),
      if (pinned.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            const Icon(Icons.push_pin, size: 16),
            Text(hs['pinnedHere']),
            for (final e in pinned) ActionChip(key: Key('pinned-${e.id}'), label: Text(e.titleIn(lang)), onPressed: () => widget.controller.openSim(e.id)),
          ]),
        ),
      Expanded(
        child: ListView.builder(
          key: const Key('hub-list'),
          itemCount: shown.length,
          itemBuilder: (_, i) {
            final e = shown[i];
            final isPinned = _pins?.isPinned(widget.page(), e.id) ?? false;
            return ListTile(
              key: Key('sim-${e.id}'),
              title: Text(e.titleIn(lang)),
              // What it does, then where it is from.
              subtitle: Text('${e.descriptionIn(lang)}\n${hs[e.subject]} · ${grades(e)} · ${e.source} · ${e.licence}', key: Key('sim-desc-${e.id}')),
              isThreeLine: true,
              leading: e.thumb != null ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.asset(e.thumb!, key: Key('thumb-${e.id}'), width: 72, height: 48, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 72, height: 48))) : Icon(e.offline ? Icons.download_done : Icons.cloud_outlined, color: Kx.readable(e.offline ? Colors.green : Colors.blueGrey, Theme.of(context).scaffoldBackgroundColor)),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                Chip(label: Text(e.offline ? hs['offline'] : hs['onlineOnly']), visualDensity: VisualDensity.compact),
                IconButton(key: Key('pin-${e.id}'), icon: Icon(isPinned ? Icons.push_pin : Icons.push_pin_outlined), tooltip: hs['pin'], onPressed: () => _togglePin(e)),
              ]),
              onTap: () => widget.controller.openSim(e.id),
            );
          },
        ),
      ),
    ]));
  }
}

/// One web view created and started while the hub list is on screen, so the first tile opens
/// without the web view start-up delay. [take] hands it over; the next [prepare] makes another.
class SimWarmView {
  static PhetWebView? _view;

  /// Creates the spare view (nothing where there is no web view, as in tests).
  static void prepare() {
    _view ??= PhetWebView.create();
    final v = _view;
    if (v != null) unawaited(v.load(Uri.parse('about:blank')));
  }

  static PhetWebView? take() {
    final v = _view;
    _view = null;
    return v;
  }

  static bool get ready => _view != null;
}

class _OpenSim extends StatefulWidget {
  const _OpenSim({super.key, required this.entry, required this.controller, required this.pinned, required this.onPin});
  final SimEntry entry;
  final SimHubController controller;
  final bool pinned;
  final VoidCallback onPin;
  @override
  State<_OpenSim> createState() => _OpenSimState();
}

class _OpenSimState extends State<_OpenSim> {
  PhetWebView? _web;
  bool? _online;
  bool _viewerMissing = false;
  SimVisited? _visited;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final e = widget.entry;
    if (e.id == 'model3d') {
      widget.controller.openModel3d?.call();
      return;
    }
    if (e.kind == SimKindOf.native) {
      if (e.needsNet) _online = await simHubOnlineCheck();
      if (mounted) setState(() {});
      return;
    }
    if (e.kind == SimKindOf.online) {
      _visited = await SimVisited.load();
      _online = await simHubOnlineCheck();
      // Offline: a sim opened before is tried from the web view's saved copy; a new one cannot load.
      if (_online != true && !_visited!.has(e.id)) return _refresh();
      _fromCache = _online != true;
    }
    // Closed (back, another sim) while the online check ran: nothing to show.
    if (!mounted) return;
    final view = SimWarmView.take() ?? PhetWebView.create();
    if (view == null) {
      _viewerMissing = true;
      return _refresh();
    }
    _web = view;
    widget.controller._view = view;
    final page = e.kind == SimKindOf.bundled ? await SimAssetServer.pageFor(e.asset!) : Uri.parse(e.url!);
    if (!mounted) return;
    await view.load(page);
    if (e.kind == SimKindOf.online && _online == true) await _visited?.mark(e.id);
    _refresh();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    final web = _web;
    web?.dispose();
    // "Add to board" must not picture a page that is no longer open.
    if (web != null && widget.controller._view == web) widget.controller._view = null;
    super.dispose();
  }

  Widget _body() {
    final e = widget.entry;
    final hs = simHubStrings(boardLang(context));
    if (e.kind == SimKindOf.online && _online == false && !_fromCache) {
      return _Message(icon: Icons.cloud_off, text: hs['offlineNever'].replaceAll('{title}', e.titleIn(boardLang(context))), key: const Key('hub-offline-msg'));
    }
    if (e.kind == SimKindOf.online && _online == null) return const Center(child: CircularProgressIndicator());
    if (_viewerMissing) return _Message(icon: Icons.web_asset_off, text: hs['noViewer'], key: const Key('hub-no-viewer'));
    switch (e.kind) {
      case SimKindOf.native:
        return switch (e.id) {
          'pebl-stroop' => const StroopTest(),
          'pebl-reaction' => const ReactionTest(),
          'pebl-span' => const MemorySpanTest(),
          'macro-money' => const MacroMoneySim(),
          'map-lab' => const MapLab(),
          'geo-quiz' => const GeoQuiz(),
          'timeline' => const KeyDatesTimeline(),
          'grammar' => const GrammarCheck(),
          _ => _Message(icon: Icons.view_in_ar, text: hs['viewerBeside']),
        };
      case SimKindOf.bundled || SimKindOf.online:
        return _web?.view() ?? const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    return Column(children: [
      Row(children: [
        IconButton(key: const Key('hub-back'), icon: const Icon(Icons.arrow_back), onPressed: widget.controller.close),
        Expanded(child: Text(e.titleIn(boardLang(context)), key: const Key('hub-title'), style: const TextStyle(fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
        IconButton(key: const Key('hub-pin'), icon: Icon(widget.pinned ? Icons.push_pin : Icons.push_pin_outlined), tooltip: simHubStrings(boardLang(context))['pin'], onPressed: widget.onPin),
      ]),
      if (_fromCache)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(simHubStrings(boardLang(context))['offlineSaved'].replaceAll('{date}', _visited?.when(e.id)?.toIso8601String().substring(0, 10) ?? ''), key: const Key('hub-cache-note'), style: const TextStyle(fontSize: 12)),
        ),
      Expanded(child: RepaintBoundary(key: widget.controller.boundaryKey, child: ColoredBox(color: Theme.of(context).colorScheme.surface, child: _body()))),
      Padding(padding: const EdgeInsets.all(6), child: Text(e.note ?? '${e.source} · ${e.licence}', key: const Key('hub-credit'), style: const TextStyle(fontSize: 12))),
    ]);
  }
}

class _Message extends StatelessWidget {
  const _Message({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 48), const SizedBox(height: 12), Text(text, textAlign: TextAlign.center)])),
  );
}
