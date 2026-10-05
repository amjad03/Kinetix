import 'dart:typed_data';

import 'package:flutter/widgets.dart';

/// A picture of a 3D model as the class sees it (labels drawn in), for the board to place
/// on its canvas.
class Model3dSnapshot {
  const Model3dSnapshot({required this.png, required this.modelId, required this.title, this.credit = ''});

  /// PNG bytes.
  final Uint8List png;
  final String modelId;

  /// The model's title in the language it was shown in.
  final String title;

  /// Who made the model (the anatomy models must credit BodyParts3D wherever shown).
  final String credit;
}

/// Where the 3D view is shown to the students (the projector or a second screen):
/// [wanted] says whether anyone is watching; [send] gets JPEG pictures of the view (laser
/// trail and labels drawn in), and null when the model is closed.
class Model3dMirror {
  const Model3dMirror({required this.wanted, required this.send});
  final bool Function() wanted;
  final void Function(Uint8List? jpg) send;
}

/// Lets an app give every 3D viewer below it somewhere to put snapshots ("Put on board")
/// and a students' screen to mirror to, without passing them through each screen that
/// opens a model. A viewer's own arguments win over the scope's.
class Model3dScope extends InheritedWidget {
  const Model3dScope({super.key, this.onSnapshot, this.mirror, required super.child});

  final ValueChanged<Model3dSnapshot>? onSnapshot;
  final Model3dMirror? mirror;

  static Model3dScope? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<Model3dScope>();

  @override
  bool updateShouldNotify(Model3dScope old) => old.onSnapshot != onSnapshot || old.mirror != mirror;
}
