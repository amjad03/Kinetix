import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import 'plus_strings.dart';

/// The pens a zone can pick: dark, blue, red and green.
const zoneColours = [Color(0xFF202124), Color(0xFF1A73E8), Color(0xFFD93025), Color(0xFF1E8E3E)];

/// Multi-user zones: the board split side by side into 2 to 4 zones, each with its own pen, so
/// groups write at the same time (a race at the board, group work). Each finger that lands in a
/// zone writes with that zone's pen ([WhiteboardController.zonePen]); a zone can clear only its
/// own part of the page.
class BoardZones extends ChangeNotifier {
  BoardZones(this.wb);

  final WhiteboardController wb;

  /// 0 = off, otherwise 2 to 4 zones.
  int get count => _count;
  int _count = 0;

  /// Each zone's pen colour and whether it has the eraser.
  final List<Color> colours = [];
  final List<bool> erasers = [];

  bool get active => _count > 0;

  /// Splits the board into [n] zones (0 ends them).
  void start(int n) {
    _count = n.clamp(0, 4);
    if (_count == 1) _count = 2;
    colours
      ..clear()
      ..addAll([for (var i = 0; i < _count; i++) zoneColours[(i + 1) % zoneColours.length]]);
    erasers
      ..clear()
      ..addAll(List.filled(_count, false));
    wb.zonePen = _count == 0 ? null : penAt;
    notifyListeners();
  }

  void end() => start(0);

  void setColour(int zone, Color c) {
    colours[zone] = c;
    erasers[zone] = false;
    notifyListeners();
  }

  void setEraser(int zone, bool on) {
    erasers[zone] = on;
    notifyListeners();
  }

  /// The zone a point on the board is in, from the part of the board on screen.
  int zoneAt(Offset at) {
    final area = wb.visibleArea;
    if (area == null || area.width <= 0 || _count == 0) return 0;
    return ((at.dx - area.left) / area.width * _count).floor().clamp(0, _count - 1);
  }

  /// The pen for a touch at [at] (the whiteboard asks this for each new stroke).
  ZonePen? penAt(Offset at) {
    if (_count == 0) return null;
    final z = zoneAt(at);
    return ZonePen(color: colours[z], eraser: erasers[z]);
  }

  /// Rubs out everything whose middle is in [zone] (undoable like any other change).
  void clear(int zone) {
    final keep = [for (final e in wb.elements) if (zoneAt(e.bounds.center) != zone) e];
    if (keep.length != wb.elements.length) wb.setElements(keep);
  }

  @override
  void dispose() {
    if (wb.zonePen == penAt) wb.zonePen = null;
    super.dispose();
  }
}

/// The zones over the board: a line between zones and a small bar at the top of each with its
/// pens, eraser and Clear. Touches anywhere else go through to the board.
class BoardZonesLayer extends StatelessWidget {
  const BoardZonesLayer({super.key, required this.zones});

  final BoardZones zones;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([zones, zones.wb.view]),
    builder: (context, _) {
      if (!zones.active) return const SizedBox.shrink();
      final s = plusStrings(context);
      final n = zones.count;
      return LayoutBuilder(
        builder: (context, box) {
          // The zones split the part of the board clear of the toolbars (as the pens do).
          final safe = zones.wb.safeRect;
          final left = safe.isEmpty ? 0.0 : safe.left;
          final w = (safe.isEmpty ? box.maxWidth : safe.width) / n;
          return Stack(
            key: const Key('zones-layer'),
            children: [
              for (var i = 1; i < n; i++)
                Positioned(
                  left: left + w * i - 2,
                  top: 0,
                  bottom: 0,
                  child: IgnorePointer(child: Container(width: 4, color: const Color(0x661A73E8))),
                ),
              for (var i = 0; i < n; i++)
                Positioned(
                  left: left + w * i,
                  width: w,
                  top: Kx.s8,
                  child: Center(child: _ZoneBar(zones: zones, zone: i, s: s)),
                ),
            ],
          );
        },
      );
    },
  );
}

class _ZoneBar extends StatelessWidget {
  const _ZoneBar({required this.zones, required this.zone, required this.s});

  final BoardZones zones;
  final int zone;
  final FeatureStrings s;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final eraser = zones.erasers[zone];
    return Material(
      key: Key('zone-bar-$zone'),
      color: c.surfaceContainerHigh,
      elevation: 2,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s4,
          children: [
            Text(s.n('zone', zone + 1), style: context.text.labelLarge),
            for (final (j, colour) in zoneColours.indexed)
              InkResponse(
                key: Key('zone-$zone-colour-$j'),
                onTap: () => zones.setColour(zone, colour),
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: colour,
                    shape: BoxShape.circle,
                    border: Border.all(color: !eraser && zones.colours[zone] == colour ? c.primary : c.outlineVariant, width: !eraser && zones.colours[zone] == colour ? 3 : 1),
                  ),
                ),
              ),
            IconButton(
              key: Key('zone-$zone-eraser'),
              tooltip: s['zoneEraser'],
              isSelected: eraser,
              onPressed: () => zones.setEraser(zone, !eraser),
              icon: const Icon(Icons.auto_fix_normal_outlined),
              selectedIcon: const Icon(Icons.auto_fix_normal),
            ),
            IconButton(key: Key('zone-$zone-clear'), tooltip: s['zoneClear'], onPressed: () => zones.clear(zone), icon: const Icon(Icons.layers_clear_outlined)),
            if (zone == zones.count - 1) IconButton(key: const Key('zones-end'), tooltip: s['zonesEnd'], onPressed: zones.end, icon: const Icon(Icons.close)),
          ],
        ),
      ),
    );
  }
}

/// Asks how many zones (2, 3 or 4), or ends them.
Future<void> pickZones(BuildContext context, BoardZones zones) async {
  final s = plusStrings(context);
  final n = await showDialog<int>(
    context: context,
    builder: (context) => SimpleDialog(
      title: Text(s['zones']),
      children: [
        Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s24), child: Text(s['zonesHint'])),
        for (final k in const [2, 3, 4]) SimpleDialogOption(key: Key('zones-$k'), onPressed: () => Navigator.pop(context, k), child: Text(s.n('zonesCount', k))),
        if (zones.active) SimpleDialogOption(key: const Key('zones-off'), onPressed: () => Navigator.pop(context, 0), child: Text(s['zonesEnd'])),
      ],
    ),
  );
  if (n != null) zones.start(n);
}
