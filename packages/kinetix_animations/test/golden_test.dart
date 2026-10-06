import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';

import 'render_util.dart';

/// The key frame (the thumbnail moment) of every animation, at 960 × 540 with the KINETIX fonts,
/// against goldens in test/goldens. Update with `flutter test --update-goldens test/golden_test.dart`.
/// Small anti-aliasing differences between machines are tolerated (see [_TolerantComparator]).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await loadKxFonts();
    final base = goldenFileComparator;
    if (base is LocalFileComparator) goldenFileComparator = _TolerantComparator(base.basedir.resolve('golden_test.dart'));
  });

  for (final a in animationCatalogue) {
    test('${a.id} key frame', () async {
      const size = Size(960, 540);
      final rec = ui.PictureRecorder();
      a.painter(AnimFrame(a.thumbT)).paint(Canvas(rec), size);
      final img = await rec.endRecording().toImage(size.width.round(), size.height.round());
      await expectLater(img, matchesGoldenFile('goldens/${a.id}.png'));
      img.dispose();
    });
  }
}

/// Passes when at most 0.5 % of the pixels differ, so text rasterised on another machine does not
/// fail the build while a changed drawing still does.
class _TolerantComparator extends LocalFileComparator {
  _TolerantComparator(super.testFile);

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(imageBytes, await getGoldenBytes(golden));
    if (result.passed || result.diffPercent <= 0.005) {
      result.dispose();
      return true;
    }
    final error = await generateFailureOutput(result, golden, basedir);
    result.dispose();
    throw FlutterError(error);
  }
}
