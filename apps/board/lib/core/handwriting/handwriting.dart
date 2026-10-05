import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'mlkit_handwriting.dart';
import 'windows_handwriting.dart';

export 'mlkit_handwriting.dart';
export 'windows_handwriting.dart';

/// The handwriting reader for this board: ML Kit Digital Ink on Android panels, the Windows
/// handwriting recogniser on Windows panels, none elsewhere (words then stay as ink; maths and
/// shapes are read on the board on every platform). All of them run on the panel: no ink or
/// handwriting leaves it.
HandwritingRecognizer platformHandwriting() {
  if (kIsWeb) return const NoHandwritingRecognizer();
  return switch (defaultTargetPlatform) {
    TargetPlatform.android => MlKitHandwriting(),
    TargetPlatform.windows => WindowsHandwriting(),
    _ => const NoHandwritingRecognizer(),
  };
}
