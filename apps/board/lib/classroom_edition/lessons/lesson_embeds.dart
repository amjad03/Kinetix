import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../features/phet/phet_view.dart';
import '../../features/sim_hub/sim_entry.dart';
import '../../features/sim_hub/sim_hub_panel.dart' show simHubOnlineCheck;
import '../../features/sim_hub/sim_server.dart';
import '../ui/ce_style.dart';

/// The lesson's sims, labs and 3D from the board's own packages; PhET sims from the board's
/// offline copies (assets/simhub/phet, the Simulations hub's), so they run with no internet.
KinetixEmbeds boardLessonEmbeds({void Function(PhetWebView view)? onPhet}) => KinetixEmbeds(
  hasPhet: (id) => simCatalogue.any((e) => e.id == 'phet-$id' && e.kind == SimKindOf.bundled),
  phet: (id) => LessonPhet(key: ValueKey('phet:$id'), simId: id, onView: onPhet),
);

/// A bundled PhET sim in the lesson's visual area.
class LessonPhet extends StatefulWidget {
  const LessonPhet({super.key, required this.simId, this.onView});
  final String simId;
  final void Function(PhetWebView view)? onView;
  @override
  State<LessonPhet> createState() => _LessonPhetState();
}

class _LessonPhetState extends State<LessonPhet> {
  PhetWebView? _web;
  bool _none = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final view = PhetWebView.create();
    if (view == null) {
      if (mounted) setState(() => _none = true);
      return;
    }
    _web = view;
    widget.onView?.call(view);
    await view.load(await SimAssetServer.pageFor('phet/${widget.simId}.html'));
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _web?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_none) {
      return Center(
        child: Text('The PhET sim “${widget.simId}” opens on the board itself.', textAlign: TextAlign.center, style: zText(30, FontWeight.w500).copyWith(color: Z.onStage2)),
      );
    }
    return _web?.view() ?? const Center(child: CircularProgressIndicator());
  }
}

/// Whether the board is online (concept videos stream; tests replace it).
Future<bool> Function() lessonOnlineCheck = () => simHubOnlineCheck();

/// Opens a concept video in the browser (tests replace it).
Future<void> Function(Uri url) openLessonVideo = (u) async {
  await launchUrl(u, mode: LaunchMode.externalApplication);
};

/// A concept video: a card that opens the video only when the board is online; offline it
/// says "Needs internet".
class ConceptVideoCard extends StatefulWidget {
  const ConceptVideoCard({super.key, required this.video, required this.lang});
  final VideoRef video;
  final Lang lang;
  @override
  State<ConceptVideoCard> createState() => _ConceptVideoCardState();
}

class _ConceptVideoCardState extends State<ConceptVideoCard> {
  bool? _online;

  @override
  void initState() {
    super.initState();
    unawaited(_check());
  }

  Future<void> _check() async {
    final on = await lessonOnlineCheck();
    if (mounted) setState(() => _online = on);
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.video;
    final online = _online == true;
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(48)),
      padding: const EdgeInsets.all(64),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(online ? Icons.play_circle_fill : Icons.wifi_off, size: 140, color: online ? CeC.accent : CeC.muted),
          const SizedBox(height: 32),
          Text(v.title.t(widget.lang), textAlign: TextAlign.center, style: zTitle(48).copyWith(color: CeC.navy)),
          const SizedBox(height: 32),
          if (_online == null)
            const CircularProgressIndicator()
          else if (online)
            FilledButton.icon(
              key: const Key('lesson-video-open'),
              style: FilledButton.styleFrom(backgroundColor: CeC.accent, minimumSize: const Size(0, 96), padding: const EdgeInsets.symmetric(horizontal: 48), textStyle: zText(34)),
              onPressed: () => openLessonVideo(v.embedUrl()),
              icon: const Icon(Icons.open_in_new, size: 40),
              label: const Text('Open the video'),
            )
          else
            Container(
              key: const Key('lesson-video-offline'),
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
              decoration: BoxDecoration(color: CeC.peach, borderRadius: BorderRadius.circular(99)),
              child: Text('Needs internet', style: zText(34).copyWith(color: CeC.navy)),
            ),
        ],
      ),
    );
  }
}

/// A picture of an open PhET sim for Put on board (null when it cannot be pictured).
Future<Uint8List?> phetPicture(PhetWebView? view) async => view?.screenshot();
