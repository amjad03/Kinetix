import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/panel/panel_controller.dart';
import '../../l10n/l10n.dart';

/// The panel home on Android panels: the Zynetix board as the big first tile, then the apps the
/// admin allowed in the dashboard (Zynetix → Panel home). In kiosk mode nothing else shows;
/// outside it IT also sees the other installed apps.
class PanelHomeScreen extends StatefulWidget {
  const PanelHomeScreen({super.key, required this.home, required this.onBoard});

  final PanelHome home;

  /// Back to the whiteboard.
  final VoidCallback onBoard;

  static Future<void> open(BuildContext context, PanelHome home) =>
      Navigator.of(context).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (ctx) => PanelHomeScreen(home: home, onBoard: () => Navigator.of(ctx).pop())));

  @override
  State<PanelHomeScreen> createState() => _PanelHomeScreenState();
}

class _PanelHomeScreenState extends State<PanelHomeScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.home.refreshInstalled());
  }

  Future<void> _launch(String package, String label) async {
    final ok = await widget.home.launch(package);
    if (!ok && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.panelHomeLaunchFailed(label))));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.surfaceContainerLowest,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.home,
          builder: (context, _) {
            final tiles = widget.home.tiles;
            final others = widget.home.others;
            return ListView(
              padding: const EdgeInsets.all(Kx.s24),
              children: [
                Text(l.panelHome, style: context.text.headlineSmall),
                const SizedBox(height: Kx.s16),
                Wrap(
                  spacing: Kx.s16,
                  runSpacing: Kx.s16,
                  children: [
                    _Tile(key: const Key('panel-home-board'), label: l.panelHomeBoard, big: true, icon: Icon(Icons.draw_outlined, size: 72, color: c.onPrimaryContainer), color: c.primaryContainer, onTap: widget.onBoard),
                    for (final t in tiles)
                      _Tile(
                        key: Key('panel-app-${t.app.package}'),
                        label: t.app.label,
                        icon: _icon(t.app.iconUrl, t.installed?.icon),
                        onTap: () => unawaited(_launch(t.app.package, t.app.label)),
                      ),
                  ],
                ),
                if (tiles.isEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s16), child: Text(l.panelHomeEmpty, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))),
                if (others.isNotEmpty) ...[
                  const SizedBox(height: Kx.s24),
                  Text(l.panelHomeOtherApps, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  Wrap(
                    spacing: Kx.s12,
                    runSpacing: Kx.s12,
                    children: [for (final a in others) _Tile(key: Key('panel-other-${a.package}'), label: a.label, icon: _icon(null, a.icon), onTap: () => unawaited(_launch(a.package, a.label)))],
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _icon(String? url, Uint8List? bytes) {
    if (bytes != null && bytes.isNotEmpty) return Image.memory(bytes, width: 56, height: 56);
    if (url != null) return Image.network(url, width: 56, height: 56, errorBuilder: (_, _, _) => const Icon(Icons.apps, size: 56));
    return const Icon(Icons.apps, size: 56);
  }
}

class _Tile extends StatelessWidget {
  const _Tile({super.key, required this.label, required this.icon, required this.onTap, this.big = false, this.color});

  final String label;
  final Widget icon;
  final VoidCallback onTap;
  final bool big;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final size = big ? 240.0 : 140.0;
    return Material(
      color: color ?? context.colors.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rXl),
      child: InkWell(
        borderRadius: BorderRadius.circular(Kx.rXl),
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: big ? size : 140,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              icon,
              const SizedBox(height: Kx.s8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
                child: Text(label, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: big ? context.text.titleLarge : context.text.bodyMedium),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
