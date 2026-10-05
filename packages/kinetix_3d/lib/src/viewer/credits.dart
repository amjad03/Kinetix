import 'package:flutter/material.dart';

import 'manifest.dart';
import 'strings.dart';

/// Who made what in the 3D models (the full text with licences is in the package's NOTICE
/// file and assets/viewer3d/CREDITS.txt).
abstract final class Model3dCredits {
  static const threeJs = 'three.js, © 2010-2025 three.js authors, MIT License (https://threejs.org)';
  static const bodyParts3D =
      'BodyParts3D, © The Database Center for Life Science (DBCLS), Creative Commons Attribution 4.0 International '
      '(https://creativecommons.org/licenses/by/4.0/), https://dbarchive.biosciencedbc.jp/en/bodyparts3d/';
  static const naturalEarth = 'Natural Earth (https://www.naturalearthdata.com), public domain';

  /// The credit lines for [model] (or for every model), in [lang].
  static List<String> lines(String lang, {ViewerManifest? model}) {
    final s = Viewer3dStrings(lang);
    return [
      if (model != null && model.credit.isNotEmpty) '${model.title.of(lang)}: ${model.credit}',
      s.viewerCredit,
      if (model == null || model.credit.contains('BodyParts3D')) s.anatomyCredit,
      if (model == null || model.id == 'earth_layers' || model.id == 'seasons') s.earthCredit,
      if (model == null) s.madeByKinetix,
    ];
  }
}

/// The "About this model" box: who made the model, and the viewer's licence.
Future<void> showModel3dCredits(BuildContext context, {ViewerManifest? model, String? lang}) {
  final l = lang ?? viewerLangOf(context);
  final s = Viewer3dStrings(l);
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      key: const ValueKey('model3d-credits'),
      title: Text(model == null ? s.credits : model.title.of(l)),
      content: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          if (model != null) ...[Text(model.summary.of(l)), const SizedBox(height: 16), Text(s.credits, style: Theme.of(context).textTheme.titleSmall), const SizedBox(height: 6)],
          for (final line in Model3dCredits.lines(l, model: model))
            Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(line, style: Theme.of(context).textTheme.bodySmall)),
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(s.close))],
    ),
  );
}
