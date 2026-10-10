import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../board/chrome.dart' show showBoardMessage;
import '../phet/phet_view.dart';
import 'native/map_sims.dart';
import 'native/other_sims.dart';
import 'native/psych_tests.dart';
import 'sim_entry.dart';
import 'sim_server.dart';

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
    showBoardMessage(context, 'Could not picture the simulation');
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
  if (context.mounted) showBoardMessage(context, 'Picture of the simulation added to the board');
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
    if (open != null) return _OpenSim(entry: open, controller: widget.controller, pinned: _pins?.isPinned(widget.page(), open.id) ?? false, onPin: () => _togglePin(open));
    final shown = filterSims(subject: _subject, grade: _grade, query: _query, offlineOnly: _offlineOnly);
    final pinned = [for (final id in _pins?.forPage(widget.page()) ?? const <String>[]) if (simById(id) != null) simById(id)!];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.all(8),
        child: Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          DropdownButton<String?>(
            key: const Key('hub-subject'),
            value: _subject,
            hint: const Text('Subject'),
            items: [const DropdownMenuItem(value: null, child: Text('All subjects')), for (final s in simSubjects) DropdownMenuItem(value: s, child: Text(s))],
            onChanged: (v) => setState(() => _subject = v),
          ),
          DropdownButton<int?>(
            key: const Key('hub-grade'),
            value: _grade,
            hint: const Text('Class'),
            items: [const DropdownMenuItem(value: null, child: Text('All classes')), for (var g = 1; g <= 13; g++) DropdownMenuItem(value: g, child: Text(g == 13 ? 'College' : 'Class $g'))],
            onChanged: (v) => setState(() => _grade = v),
          ),
          SizedBox(width: 180, child: TextField(key: const Key('hub-search'), decoration: const InputDecoration(hintText: 'Search', isDense: true, prefixIcon: Icon(Icons.search)), onChanged: (v) => setState(() => _query = v))),
          FilterChip(key: const Key('hub-offline'), label: const Text('Works offline'), selected: _offlineOnly, onSelected: (v) => setState(() => _offlineOnly = v)),
        ]),
      ),
      if (pinned.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            const Icon(Icons.push_pin, size: 16),
            const Text('Pinned to this page:'),
            for (final e in pinned) ActionChip(key: Key('pinned-${e.id}'), label: Text(e.title), onPressed: () => widget.controller.openSim(e.id)),
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
              title: Text(e.title),
              subtitle: Text('${e.subject} · ${e.gradeMin == e.gradeMax ? 'class ${e.gradeMin}' : 'classes ${e.gradeMin}-${e.gradeMax == 13 ? 'college' : e.gradeMax}'} · ${e.source} · ${e.licence}'),
              leading: Icon(e.offline ? Icons.download_done : Icons.cloud_outlined, color: e.offline ? Colors.green : Colors.blueGrey),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                Chip(label: Text(e.offline ? 'Offline' : 'Online'), visualDensity: VisualDensity.compact),
                IconButton(key: Key('pin-${e.id}'), icon: Icon(isPinned ? Icons.push_pin : Icons.push_pin_outlined), tooltip: 'Pin to this page', onPressed: () => _togglePin(e)),
              ]),
              onTap: () => widget.controller.openSim(e.id),
            );
          },
        ),
      ),
    ]);
  }
}

class _OpenSim extends StatefulWidget {
  const _OpenSim({required this.entry, required this.controller, required this.pinned, required this.onPin});
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
      _online = await simHubOnlineCheck();
      if (_online != true) return _refresh();
    }
    final view = PhetWebView.create();
    if (view == null) {
      _viewerMissing = true;
      return _refresh();
    }
    _web = view;
    widget.controller._view = view;
    await view.load(e.kind == SimKindOf.bundled ? await SimAssetServer.pageFor(e.asset!) : Uri.parse(e.url!));
    _refresh();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _web?.dispose();
    super.dispose();
  }

  Widget _body() {
    final e = widget.entry;
    if (e.kind == SimKindOf.online && _online == false) {
      return _Message(icon: Icons.cloud_off, text: '${e.title} is an online simulation and the board has no internet. Connect it, or open one of the Offline sims.', key: const Key('hub-offline-msg'));
    }
    if (e.kind == SimKindOf.online && _online == null) return const Center(child: CircularProgressIndicator());
    if (_viewerMissing) return const _Message(icon: Icons.web_asset_off, text: 'This panel cannot show web simulations.', key: Key('hub-no-viewer'));
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
          _ => const _Message(icon: Icons.view_in_ar, text: 'The 3D viewer is open beside the board.'),
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
        Expanded(child: Text(e.title, style: const TextStyle(fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
        IconButton(key: const Key('hub-pin'), icon: Icon(widget.pinned ? Icons.push_pin : Icons.push_pin_outlined), tooltip: 'Pin to this page', onPressed: widget.onPin),
      ]),
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
