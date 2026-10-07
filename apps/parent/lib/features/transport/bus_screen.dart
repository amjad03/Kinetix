import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'bus_map.dart';

/// "Arriving in 7 min" / "2 stops away" for the child's stop; null when there is no running bus.
String? busEtaText(AppLocalizations l, StudentBus b) {
  final bus = b.bus;
  if (!b.assigned || bus == null) return null;
  if (bus.etaMinutes == null) return l.busPassed;
  return l.busArrivingIn(bus.etaMinutes!);
}

/// "2 stops away" (or the next stop's name when it is the child's own); null when not running.
String? busStopsText(AppLocalizations l, StudentBus b) {
  final bus = b.bus;
  if (!b.assigned || bus == null || bus.etaMinutes == null) return null;
  return l.busStopsAway(bus.stopsAway, b.stopName ?? '');
}

/// A child's school bus: route, stop and pickup time, and a live OpenStreetMap view of the bus
/// with the minutes left to the child's stop (updated by `transport.position` events).
class BusScreen extends StatefulWidget {
  const BusScreen({super.key, required this.api, required this.child, required this.positions, this.mapBuilder = OsmBusMap.builder});

  final ParentApi api;
  final Child child;

  /// Live position events for any route; the screen uses the ones for its child's route.
  final Stream<BusPositionEvent> positions;

  /// Replaceable in tests.
  final BusMapBuilder mapBuilder;

  /// The map screens open with; tests replace it so no tiles are fetched.
  static BusMapBuilder defaultMapBuilder = OsmBusMap.builder;

  static Future<void> open(BuildContext context, FamilyController family, Child child, {BusMapBuilder? mapBuilder}) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              BusScreen(api: family.api, child: child, positions: family.busPositions, mapBuilder: mapBuilder ?? defaultMapBuilder),
        ),
      );

  @override
  State<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends State<BusScreen> {
  StudentBus? _bus;
  ApiException? _error;
  StreamSubscription<BusPositionEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = widget.positions.listen((e) {
      final b = _bus;
      if (b == null || !mounted) return;
      final next = b.withEvent(e);
      if (!identical(next, b)) setState(() => _bus = next);
    });
    _load();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final b = await widget.api.bus(widget.child.id);
      if (mounted) {
        setState(() {
          _bus = b;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final b = _bus;
    return Scaffold(
      appBar: AppBar(title: Text(l.busTitle(widget.child.firstName))),
      body: b == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : !b.assigned
              ? Padding(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: Text(l.busNoBus(widget.child.firstName),
                      key: const Key('busNone'), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      if (_error != null) ...[ErrorBanner(_error!, onRetry: _load), const SizedBox(height: Kx.s12)],
                      _eta(context, b),
                      const SizedBox(height: Kx.s12),
                      SizedBox(
                        height: 280,
                        child: ClipRRect(
                            borderRadius: Kx.radiusMd,
                            child: widget.mapBuilder(context, BusMapData(stops: b.stops, myStopId: b.stopId, bus: b.bus))),
                      ),
                      const SizedBox(height: Kx.s12),
                      _row(context, Icons.alt_route, l.busRoute, b.routeName ?? ''),
                      _row(context, Icons.location_on_outlined, l.busYourStop, b.stopName ?? ''),
                      if (b.pickupTime != null) _row(context, Icons.schedule, l.busPickupTime, b.pickupTime!.label),
                      if (b.regNo != null) _row(context, Icons.directions_bus_outlined, l.busVehicle, b.regNo!),
                      const SizedBox(height: Kx.s8),
                      Text(l.busStops, style: context.text.titleSmall),
                      for (final s in b.stops)
                        ListTile(
                          key: Key('busStop-${s.id}'),
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(s.id == b.stopId ? Icons.location_on : Icons.circle,
                              size: s.id == b.stopId ? 24 : 10, color: s.id == b.stopId ? c.error : c.primary),
                          title: Text(s.name, style: s.id == b.stopId ? const TextStyle(fontWeight: FontWeight.w600) : null),
                        ),
                    ],
                  ),
                ),
    );
  }

  Widget _eta(BuildContext context, StudentBus b) {
    final l = context.l10n;
    final c = context.colors;
    final eta = busEtaText(l, b);
    if (eta == null) {
      return Card(
        color: c.surfaceContainerHighest,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            children: [
              Icon(Icons.directions_bus_outlined, color: c.onSurfaceVariant),
              const SizedBox(width: Kx.s12),
              Expanded(child: Text(l.busNotRunning, key: const Key('busNotRunning'), style: context.text.bodyLarge)),
            ],
          ),
        ),
      );
    }
    return Card(
      color: c.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Row(
          children: [
            Icon(Icons.directions_bus, color: c.onPrimaryContainer),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(eta,
                      key: const Key('busEta'),
                      style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w600)),
                  if (busStopsText(l, b) case final s?)
                    Text(s, key: const Key('busStopsAway'), style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: context.colors.onSurfaceVariant),
            const SizedBox(width: Kx.s12),
            Text('$label: ', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            Expanded(child: Text(value, style: context.text.bodyLarge)),
          ],
        ),
      );
}
