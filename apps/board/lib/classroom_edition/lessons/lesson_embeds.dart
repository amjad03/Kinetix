import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../../features/phet/phet_view.dart';
import '../../features/sim_hub/sim_entry.dart';
import '../../features/sim_hub/sim_server.dart';
import '../ui/ce_style.dart';
import '../l10n/ce_strings.dart';
import '../classroom_hooks.dart';
import '../content_pack/content_library.dart';
import '../content_pack/pack_video_player.dart';

/// The lesson's sims, labs and 3D from the board's own packages; PhET sims from the board's
/// offline copies (assets/simhub/phet, the Simulations hub's), so they run with no internet.
KinetixEmbeds boardLessonEmbeds({void Function(PhetWebView view)? onPhet}) => KinetixEmbeds(
  hasPhet: (id) => simCatalogue.any((e) => e.id == 'phet-$id' && e.kind == SimKindOf.bundled && simIncluded(e)),
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
        child: Text(ceTr('The PhET sim “{id}” opens on the board itself.', {'id': widget.simId}), textAlign: TextAlign.center, style: zText(30, FontWeight.w500).copyWith(color: Z.onStage2)),
      );
    }
    return _web?.view() ?? const Center(child: CircularProgressIndicator());
  }
}

/// A concept video step. Classroom never streams: the card plays the topic's video from the
/// installed content pack ([ContentLibrary]), or says it is not on this board.
class ConceptVideoCard extends StatelessWidget {
  const ConceptVideoCard({super.key, required this.video, required this.lang, this.topicId, this.step, this.host, this.library});
  final VideoRef video;
  final Lang lang;
  final String? topicId, step;
  final ClassroomHost? host;
  final ContentLibrary? library;

  @override
  Widget build(BuildContext context) {
    final l = library ?? ContentLibrary.sharedIfOpen;
    final id = topicId;
    final item = l == null || id == null ? null : l.videoFor(id, step: step);
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(48)),
      padding: const EdgeInsets.all(64),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(item != null ? Icons.play_circle_fill : Icons.sd_storage_outlined, size: 140, color: item != null ? CeC.accent : CeC.muted),
          const SizedBox(height: 32),
          Text(item?.title ?? video.title.t(lang), textAlign: TextAlign.center, style: zTitle(48).copyWith(color: CeC.navy)),
          const SizedBox(height: 32),
          if (item != null && l != null)
            FilledButton.icon(
              key: const Key('lesson-video-open'),
              style: FilledButton.styleFrom(backgroundColor: CeC.accent, minimumSize: const Size(0, 96), padding: const EdgeInsets.symmetric(horizontal: 48), textStyle: zText(34)),
              onPressed: () => unawaited(openPackVideo(context, lib: l, item: item, host: host)),
              icon: const Icon(Icons.play_arrow_rounded, size: 40),
              label: Text(context.ce('Play the video')),
            )
          else
            Container(
              key: const Key('lesson-video-offline'),
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
              decoration: BoxDecoration(color: CeC.peach, borderRadius: BorderRadius.circular(99)),
              child: Text(context.ce('Not in this board’s content pack'), style: zText(34).copyWith(color: CeC.navy)),
            ),
        ],
      ),
    );
  }
}

/// A picture of an open PhET sim for Put on board (null when it cannot be pictured).
Future<Uint8List?> phetPicture(PhetWebView? view) async => view?.screenshot();
