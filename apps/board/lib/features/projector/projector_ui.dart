import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'projector_controller.dart';

/// Board settings → Projector: whether the board may use a second screen, whether it starts by
/// itself when one is connected, and show/stop/blank now.
class ProjectorSettingsSection extends StatelessWidget {
  const ProjectorSettingsSection({super.key, required this.projector});

  final ProjectorController projector;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    return ListenableBuilder(
      listenable: projector,
      builder: (context, _) {
        final showing = projector.showing;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.projectorTitle, style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            Text(l.projectorHint, style: hint),
            SwitchListTile(
              key: const Key('projector-enabled'),
              contentPadding: EdgeInsets.zero,
              title: Text(l.projectorEnabled),
              value: projector.enabled,
              onChanged: projector.setEnabled,
            ),
            SwitchListTile(
              key: const Key('projector-auto'),
              contentPadding: EdgeInsets.zero,
              title: Text(l.projectorAuto),
              value: projector.auto,
              onChanged: projector.enabled ? projector.setAuto : null,
            ),
            Row(
              children: [
                Icon(showing != null ? Icons.cast_connected : Icons.cast, size: 20, color: context.colors.onSurfaceVariant),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(
                    showing != null ? l.projectorShowingOn(showing.name) : (projector.available ? projector.displays.first.name : l.projectorNone),
                    key: const Key('projector-status'),
                    style: hint,
                  ),
                ),
                if (showing != null) ...[
                  TextButton(key: const Key('projector-blank'), onPressed: () => projector.setBlank(!projector.blank), child: Text(l.projectorBlank)),
                  TextButton(key: const Key('projector-stop'), onPressed: () => unawaited(projector.hide()), child: Text(l.projectorStop)),
                ] else if (projector.available && projector.enabled)
                  FilledButton.tonal(key: const Key('projector-show'), onPressed: () => unawaited(projector.show()), child: Text(l.projectorShow)),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// A PNG of what [key]'s repaint boundary shows (the lab in the split pane), at most [maxWidth]
/// pixels wide; null when it is not on screen.
Future<Uint8List?> captureBoundaryPng(GlobalKey key, {double maxWidth = 1280}) async {
  final boundary = key.currentContext?.findRenderObject();
  if (boundary is! RenderRepaintBoundary || !boundary.hasSize || boundary.size.isEmpty) return null;
  final ratio = (maxWidth / boundary.size.width).clamp(0.1, 1.0);
  final image = await boundary.toImage(pixelRatio: ratio);
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data == null ? null : Uint8List.view(data.buffer);
  } finally {
    image.dispose();
  }
}
