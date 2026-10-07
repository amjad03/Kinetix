import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'location.dart';
import 'trip_controller.dart';

/// Driver mode (Profile → Driver mode, for logins with the `driver` role): pick the route and
/// direction, start the trip, and the phone shares the bus location with the families until
/// the trip is ended.
class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key, required this.api, this.location, this.awake});

  final TeacherApi api;

  /// Replaceable in tests; the phone's GPS by default.
  final LocationSource? location;
  final ScreenAwake? awake;

  static Future<void> open(BuildContext context, TeacherApi api) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DriverScreen(api: api)));

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  late final TripController _trip = TripController(
    api: widget.api,
    location: widget.location ?? const GeolocatorLocationSource(),
    awake: widget.awake ?? const WakelockScreenAwake(),
  );
  DriverHome? _home;
  ApiException? _error;
  String? _routeId;
  TripDirection _direction = TripDirection.pickup;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _trip.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final h = await widget.api.driverHome();
      if (!mounted) return;
      setState(() {
        _home = h;
        _routeId ??= h.routes.firstOrNull?.id;
      });
      final running = h.trip;
      final route = running == null ? null : h.routes.where((r) => r.id == running.routeId).firstOrNull;
      if (running != null && route != null) await _trip.resume(running, route);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final home = _home;
    return Scaffold(
      appBar: AppBar(title: Text(l.driverMode)),
      body: ListenableBuilder(
        listenable: _trip,
        builder: (context, _) {
          if (home == null) {
            return _error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(_error!, onRetry: _load));
          }
          if (home.routes.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Text(l.driverNoRoutes, key: const Key('driverNoRoutes'), style: context.text.bodyLarge),
            );
          }
          // A new list per state, so the result of ending a trip shows at the top, not scrolled away.
          return ListView(key: ValueKey(_trip.running), primary: false, padding: const EdgeInsets.all(Kx.s16), children: _trip.running ? _running(context) : _idle(context, home));
        },
      ),
    );
  }

  List<Widget> _idle(BuildContext context, DriverHome home) {
    final l = context.l10n;
    final c = context.colors;
    return [
      if (_trip.phase == TripPhase.ended) ...[
        Text(l.driverTripEnded, key: const Key('driverEnded'), style: context.text.titleMedium?.copyWith(color: c.primary)),
        const SizedBox(height: Kx.s12),
      ],
      if (_trip.error != null) ...[ErrorBanner.api(_trip.error!), const SizedBox(height: Kx.s12)],
      if (_trip.locationDenied) ...[ErrorBanner(l.driverLocationDenied), const SizedBox(height: Kx.s12)],
      if (_trip.locationServiceOff) ...[ErrorBanner(l.driverLocationOff), const SizedBox(height: Kx.s12)],
      Text(l.driverRoute, style: context.text.titleSmall),
      RadioGroup<String>(
        groupValue: _routeId,
        onChanged: (v) => setState(() => _routeId = v),
        child: Column(
          children: [
            for (final r in home.routes)
              RadioListTile<String>(
                key: Key('driverRoute-${r.id}'),
                value: r.id,
                contentPadding: EdgeInsets.zero,
                title: Text(r.name),
                subtitle: r.regNo == null ? null : Text(l.driverVehicle(r.regNo!)),
              ),
          ],
        ),
      ),
      const SizedBox(height: Kx.s8),
      Text(l.driverDirection, style: context.text.titleSmall),
      const SizedBox(height: Kx.s8),
      SegmentedButton<TripDirection>(
        key: const Key('driverDirection'),
        segments: [
          ButtonSegment(value: TripDirection.pickup, label: Text(l.driverPickup), icon: const Icon(Icons.north_east)),
          ButtonSegment(value: TripDirection.drop, label: Text(l.driverDrop), icon: const Icon(Icons.south_west)),
        ],
        selected: {_direction},
        onSelectionChanged: (s) => setState(() => _direction = s.first),
      ),
      const SizedBox(height: Kx.s24),
      FilledButton.icon(
        key: const Key('driverStart'),
        onPressed: _trip.phase == TripPhase.starting || _routeId == null
            ? null
            : () => _trip.start(home.routes.firstWhere((r) => r.id == _routeId), _direction),
        icon: const Icon(Icons.play_arrow),
        label: Text(l.driverStart),
      ),
    ];
  }

  List<Widget> _running(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final next = _trip.nextStops;
    final f = Fmt.of(context);
    return [
      Card(
        color: c.primaryContainer,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.directions_bus, color: c.onPrimaryContainer),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: Text(
                      '${l.driverRunning} · ${_trip.route!.name}',
                      key: const Key('driverRunning'),
                      style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Text(
                _trip.lastSentAt == null ? l.driverWaitingGps : l.driverLastSent(f.time(_trip.lastSentAt!)),
                key: const Key('driverLastSent'),
                style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer),
              ),
              Text(l.driverKeepOpen, style: context.text.bodySmall?.copyWith(color: c.onPrimaryContainer)),
            ],
          ),
        ),
      ),
      if (_trip.sendFailing) ...[const SizedBox(height: Kx.s12), ErrorBanner(l.driverSendFailing)],
      if (_trip.error != null) ...[const SizedBox(height: Kx.s12), ErrorBanner.api(_trip.error!)],
      const SizedBox(height: Kx.s16),
      Text(l.driverNextStops, style: context.text.titleSmall),
      if (next.isEmpty) Text(l.driverNoMoreStops, key: const Key('driverNoMoreStops')),
      for (final (i, s) in next.take(4).indexed)
        ListTile(
          key: Key('driverStop-${s.id}'),
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: Icon(i == 0 ? Icons.navigation : Icons.circle, size: i == 0 ? 24 : 10, color: c.primary),
          title: Text(s.name, style: i == 0 ? const TextStyle(fontWeight: FontWeight.w600) : null),
          trailing: s.pickupLabel == null ? null : Text(s.pickupLabel!),
        ),
      const SizedBox(height: Kx.s24),
      FilledButton.tonalIcon(key: const Key('driverEnd'), onPressed: _trip.end, icon: const Icon(Icons.stop), label: Text(l.driverEnd)),
    ];
  }
}
