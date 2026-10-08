import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The student's bus: the route, the stop and pickup time, and, while the bus is on the road,
/// how many minutes and stops away it is. Refreshes by itself every [every].
class BusScreen extends StatefulWidget {
  const BusScreen({super.key, required this.api, required this.studentId, this.every = const Duration(seconds: 20)});

  final StudentApi api;
  final String studentId;
  final Duration every;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BusScreen(api: api, studentId: studentId)));

  @override
  State<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends State<BusScreen> {
  StudentBus? _bus;
  ApiException? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(widget.every, (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final b = await widget.api.bus(widget.studentId);
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
    final b = _bus;
    return Scaffold(
      appBar: AppBar(title: Text(l.busTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (b == null && _error == null) const KxLoading(),
            if (b != null && !b.assigned) KxEmptyState(icon: Icons.directions_bus_outlined, message: l.busNone),
            if (b != null && b.assigned) ...[
              _Live(bus: b),
              const SizedBox(height: Kx.s12),
              KxCard(
                child: Column(
                  children: [
                    _row(context, Icons.alt_route, l.busRoute, b.routeName ?? ''),
                    _row(context, Icons.location_on_outlined, l.busYourStop, b.stopName ?? ''),
                    if (b.pickupTime != null) _row(context, Icons.schedule, l.busPickup, context.fmt.clock(b.pickupTime!)),
                    if (b.regNo != null) _row(context, Icons.directions_bus_outlined, l.busVehicle, b.regNo!),
                  ],
                ),
              ),
              SectionTitle(l.busStopsHeading),
              KxCard(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
                child: Column(
                  children: [
                    for (final s in b.stops)
                      ConstrainedBox(
                        key: Key('busStop-${s.id}'),
                        constraints: const BoxConstraints(minHeight: Kx.target),
                        child: Row(
                          children: [
                            Icon(s.id == b.stopId ? Icons.location_on : Icons.circle, size: s.id == b.stopId ? 24 : 10, color: s.id == b.stopId ? context.colors.error : context.colors.primary),
                            const SizedBox(width: Kx.s12),
                            Expanded(child: Text(s.name, style: context.text.bodyLarge?.copyWith(fontWeight: s.id == b.stopId ? FontWeight.w600 : null))),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, IconData icon, String label, String value) => ConstrainedBox(
    constraints: const BoxConstraints(minHeight: Kx.target),
    child: Row(
      children: [
        Icon(icon, size: 20, color: context.colors.onSurfaceVariant),
        const SizedBox(width: Kx.s12),
        Expanded(
          child: Text.rich(TextSpan(children: [
            TextSpan(text: '$label: ', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            TextSpan(text: value, style: context.text.bodyLarge),
          ])),
        ),
      ],
    ),
  );
}

class _Live extends StatelessWidget {
  const _Live({required this.bus});

  final StudentBus bus;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final live = bus.bus;
    if (live == null) {
      return KxCard(
        key: const Key('busNotRunning'),
        color: c.surfaceContainerHighest,
        child: Row(children: [Icon(Icons.directions_bus_outlined, color: c.onSurfaceVariant), const SizedBox(width: Kx.s12), Expanded(child: Text(l.busNotRunning, style: context.text.bodyLarge))]),
      );
    }
    final eta = live.etaMinutes;
    return KxCard(
      key: const Key('busLive'),
      color: c.primaryContainer,
      child: Row(
        children: [
          Icon(Icons.directions_bus, color: c.onPrimaryContainer),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(eta == null ? l.busPassed : l.busEta(eta), key: const Key('busEta'), style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w600)),
                if (eta != null) Text(l.busStopsAway(live.stopsAway), style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
