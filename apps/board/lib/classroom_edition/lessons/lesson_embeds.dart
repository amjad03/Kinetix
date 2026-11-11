import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../../features/phet/phet_strings.dart';
import '../../features/phet/phet_view.dart';
import '../../features/sim_hub/sim_entry.dart';
import '../../features/sim_hub/sim_server.dart';
import '../ui/ce_style.dart';
import '../l10n/ce_strings.dart';
import '../classroom_hooks.dart';
import '../content_pack/content_library.dart';
import '../content_pack/content_pack.dart';
import '../content_pack/pack_video_player.dart';

/// The lesson's sims, labs and 3D from the board's own packages; PhET sims from the board's
/// offline copies (assets/simhub/phet, the Simulations hub's) or from the installed content
/// pack, so they run with no internet.
KinetixEmbeds boardLessonEmbeds({void Function(PhetWebView view)? onPhet, ContentLibrary? library}) {
  SimAssetServer.localFile ??= _packFile;
  return KinetixEmbeds(
    hasPhet: (id) => phetBundled(id) || (library ?? ContentLibrary.sharedIfOpen)?.phetSims[id] != null,
    phet: (id) => LessonPhet(key: ValueKey('phet:$id'), simId: id, onView: onPhet, library: library),
  );
}

/// Whether the app itself has the PhET sim [id] (assets/simhub/phet, in this build).
bool phetBundled(String id) => simCatalogue.any((e) => e.id == 'phet-$id' && e.kind == SimKindOf.bundled && simIncluded(e));

/// `phet/<id>.html` from the content pack (served under `pack/` by [SimAssetServer]).
File? _packFile(String path) {
  final m = RegExp(r'^phet/([a-z0-9-]+)\.html$').firstMatch(path);
  return m == null ? null : ContentLibrary.sharedIfOpen?.phetFile(m[1]!);
}

/// The lesson's steps with the content pack's PhET sims for [topicId] added (before the closing
/// quiz and recap) when the lesson has no step for that sim yet.
List<Block> withPackPhet(List<Block> blocks, String topicId, {ContentLibrary? library}) {
  final l = library ?? ContentLibrary.sharedIfOpen;
  if (l == null) return blocks;
  final have = {for (final b in blocks) if (b.type == BlockType.simulation && b.s('source') == 'phet') b.s('simId')};
  final add = [
    for (final i in l.forTopic(topicId, kind: ContentKind.phet))
      if (i.id.startsWith('phet-') && !have.contains(i.id.substring(5)))
        Block(BlockType.simulation, {
          'id': 'pack-${i.id}',
          'type': 'simulation',
          'source': 'phet',
          'simId': i.id.substring(5),
          'title': {'en': i.title},
          'narration': {'en': 'Try it in the PhET sim, ${i.title}. Change one thing at a time and watch what happens.'},
          'optional': true,
          'seconds': 300,
        }),
  ];
  if (add.isEmpty) return blocks;
  var at = blocks.length;
  while (at > 0 && const {BlockType.recap, BlockType.pyq, BlockType.classQuiz}.contains(blocks[at - 1].type)) {
    at--;
  }
  return [...blocks.take(at), ...add, ...blocks.skip(at)];
}

/// A bundled PhET sim in the lesson's visual area.
class LessonPhet extends StatefulWidget {
  const LessonPhet({super.key, required this.simId, this.onView, this.library});
  final String simId;
  final void Function(PhetWebView view)? onView;
  final ContentLibrary? library;
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
    final fromPack = !phetBundled(widget.simId) && (widget.library ?? ContentLibrary.sharedIfOpen)?.phetFile(widget.simId) != null;
    await view.load(await SimAssetServer.pageFor('${fromPack ? 'pack/' : ''}phet/${widget.simId}.html'));
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _web?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Widget sim = _none
        ? Center(
            child: Text(ceTr('The PhET sim “{id}” opens on the board itself.', {'id': widget.simId}), textAlign: TextAlign.center, style: zText(30, FontWeight.w500).copyWith(color: Z.onStage2)),
          )
        : _web?.view() ?? const Center(child: CircularProgressIndicator());
    return Column(
      children: [
        Expanded(child: sim),
        // CC BY 4.0: PhET's credit, as PhET gives it, under every sim.
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(PhetStrings.attribution, key: const Key('phet-credit'), style: zText(20, FontWeight.w500).copyWith(color: Z.onStage2)),
        ),
      ],
    );
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
