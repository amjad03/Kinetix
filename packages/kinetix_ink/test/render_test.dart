import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  testWidgets('renders a page to a PNG scaled to the width asked for', (tester) async {
    final stroke = Stroke(id: 's', style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 4), points: [const InkPoint(10, 10), const InkPoint(500, 300)]);
    final png = (await tester.runAsync(() => renderPagePng([stroke], BoardBackground.grid, const Size(1920, 1080), maxWidth: 960)))!;
    expect(png.sublist(0, 8), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG signature
    // Width and height are big-endian at bytes 16..23 of the IHDR chunk.
    int be(int o) => (png[o] << 24) | (png[o + 1] << 16) | (png[o + 2] << 8) | png[o + 3];
    expect((be(16), be(20)), (960, 540));
  });
}
