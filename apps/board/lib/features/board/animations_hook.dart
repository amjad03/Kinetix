import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show Model3dViewer, ProcessScene;
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../insert/insert_actions.dart' show placePicture;
import 'chrome.dart';
import '../../l10n/l10n.dart';

/// The split panel's Animations tab (packages/kinetix_animations): the period's subject and
/// topic preselected; "Add to board" puts a still of the animation on the page, titled. The
/// animations made as narrated 3D scenes open in the 3D viewer (packages/kinetix_3d) right in
/// the panel, with their own "Put on board".
Widget animationsPanel(BuildContext context, {required WhiteboardController wb, String? subject, String? topic}) => AnimationsPanel(
  subject: subject,
  topic: topic,
  onAddToBoard: (png, title) {
    placePicture(wb, png, pngSize(png), credit: title);
    if (context.mounted) showBoardMessage(context, context.l10n.snapshotAdded);
  },
  sceneOpener: animationScenes,
);

/// Opens an animation's 3D scene in the panel, and gives its tile the scene's picture.
final animationScenes = SceneOpener(
  build: (context, animation, lang, onBack) => AnimationScene(animation: animation, lang: lang, onBack: onBack),
  thumbnail: (id) {
    final scene = ProcessScene.byId(id);
    return scene == null ? null : AssetImage(scene.thumbAsset);
  },
);

/// A narrated 3D scene filling the Animations tab: a back arrow and its title above the
/// viewer (which has the timeline, captions, read aloud, laser, cuts and notes).
class AnimationScene extends StatelessWidget {
  const AnimationScene({super.key, required this.animation, required this.lang, required this.onBack});

  final KxAnimation animation;
  final AnimLang lang;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Material(
        color: cs.surfaceContainer,
        child: SizedBox(
          height: 48,
          child: Row(children: [
            IconButton(key: const ValueKey('anim-scene-back'), tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back), onPressed: onBack),
            Expanded(child: Text(animation.title.of(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium)),
          ]),
        ),
      ),
      Expanded(child: Model3dViewer(key: ValueKey('scene-${animation.sceneId}'), sceneId: animation.sceneId, lang: lang.name, showTitle: false)),
    ]);
  }
}

/// A PNG's size from its header (640 × 480 when it cannot be read).
Size pngSize(Uint8List png) {
  if (png.length < 24) return const Size(640, 480);
  final d = ByteData.sublistView(png);
  final w = d.getUint32(16), h = d.getUint32(20);
  return w == 0 || h == 0 ? const Size(640, 480) : Size(w.toDouble(), h.toDouble());
}
