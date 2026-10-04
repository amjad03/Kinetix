import 'package:flutter/material.dart';

/// What a split-screen pane can show. The whiteboard is built; the others are placeholders
/// until their viewers land (see docs/product/board-features.md).
enum PaneContent { whiteboard, document, video, web, model3d, lab }

extension PaneContentInfo on PaneContent {
  String get label => switch (this) {
        PaneContent.whiteboard => 'Whiteboard',
        PaneContent.document => 'PDF / PPT',
        PaneContent.video => 'Video',
        PaneContent.web => 'Web',
        PaneContent.model3d => '3D model',
        PaneContent.lab => 'Virtual lab',
      };

  IconData get icon => switch (this) {
        PaneContent.whiteboard => Icons.draw_outlined,
        PaneContent.document => Icons.slideshow_outlined,
        PaneContent.video => Icons.ondemand_video_outlined,
        PaneContent.web => Icons.public,
        PaneContent.model3d => Icons.view_in_ar_outlined,
        PaneContent.lab => Icons.science_outlined,
      };
}

class PlaceholderPane extends StatelessWidget {
  const PlaceholderPane({super.key, required this.content});

  final PaneContent content;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF15151A),
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(content.icon, size: 64, color: Colors.white54),
          const SizedBox(height: 12),
          Text(content.label, style: const TextStyle(color: Colors.white70, fontSize: 22)),
          const SizedBox(height: 4),
          const Text('Viewer coming in the next build', style: TextStyle(color: Colors.white38)),
        ]),
      ),
    );
  }
}
