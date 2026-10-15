import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

/// The India map paper shows India as the Survey of India does (tool/india_outline.py refuses
/// any other outline): all of Jammu and Kashmir and Ladakh, and Arunachal Pradesh.
void main() {
  bool onMap(double lon, double lat) => indiaOutline.any((p) => p.contains(indiaMapPoint(lon, lat)));

  test('Jammu and Kashmir and Ladakh are whole: Gilgit-Baltistan, Muzaffarabad, the Shaksgam valley, Aksai Chin', () {
    for (final (name, lon, lat) in [
      ('Gilgit', 74.31, 35.92),
      ('Skardu', 75.63, 35.30),
      ('Hunza', 74.66, 36.32),
      ('Muzaffarabad', 73.47, 34.37),
      ('Shaksgam valley', 76.50, 36.05),
      ('Siachen', 77.10, 35.40),
      ('Aksai Chin', 79.50, 35.20),
      ('Leh', 77.58, 34.15),
      ('Srinagar', 74.80, 34.08),
    ]) {
      expect(onMap(lon, lat), isTrue, reason: name);
    }
  });

  test('Arunachal Pradesh, the south and the islands are on the map', () {
    for (final (name, lon, lat) in [
      ('Tawang', 91.86, 27.59),
      ('Itanagar', 93.62, 27.08),
      ('Kibithu', 96.98, 28.03),
      ('Delhi', 77.21, 28.61),
      ('Kanyakumari', 77.54, 8.10),
      ('Port Blair', 92.73, 11.62),
    ]) {
      expect(onMap(lon, lat), isTrue, reason: name);
    }
  });

  test('the neighbours are not', () {
    for (final (name, lon, lat) in [
      ('Lahore', 74.34, 31.55),
      ('Islamabad', 73.05, 33.68),
      ('Kathmandu', 85.32, 27.71),
      ('Thimphu', 89.64, 27.47),
      ('Dhaka', 90.41, 23.81),
      ('Lhasa', 91.11, 29.65),
      ('Colombo', 79.86, 6.93),
    ]) {
      expect(onMap(lon, lat), isFalse, reason: name);
    }
  });

  test('the outline sits inside the paper frame and the paper paints a whole sheet', () {
    const frame = Rect.fromLTWH(160, 90, 1600, 900);
    var all = indiaOutline.first.getBounds();
    for (final p in indiaOutline) {
      all = all.expandToInclude(p.getBounds());
    }
    expect(frame.contains(all.topLeft) && frame.contains(all.bottomRight), isTrue, reason: '$all');
    // Its extremes: about 37°6'N at the top and 6°45'N at the bottom.
    expect(all.top, closeTo(indiaMapPoint(80, 37.1).dy, 1));
    expect(all.bottom, closeTo(indiaMapPoint(80, 6.75).dy, 1));
    final rec = PictureRecorder();
    paintBoardBackground(Canvas(rec), Offset.zero & boardSheet, BoardBackground.indiaMap);
    rec.endRecording().dispose();
  });
}
