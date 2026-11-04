import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'bus_map.dart';
import 'handover_code_screen.dart';

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
  const BusScreen({super.key, required this.api, required this.child, required this.positions, this.mapBuilder = OsmBusMap.builder, this.openFile = openWithSystem, this.call = _dial});

  final ParentApi api;
  final Child child;

  /// Live position events for any route; the screen uses the ones for its child's route.
  final Stream<BusPositionEvent> positions;

  /// Replaceable in tests.
  final BusMapBuilder mapBuilder;

  /// Opens the bus pass PDF (tests pass a fake).
  final OpenFile openFile;

  /// Dials the crew (tests pass a fake).
  final Future<bool> Function(String phone) call;

  static Future<bool> _dial(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

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
  bool _passBusy = false;

  Future<void> _openPass() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _passBusy = true);
    try {
      final bytes = await widget.api.busPassPdf(widget.child.id);
      final ok = await widget.openFile(bytes, 'bus-pass.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.fileOpenFailed)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _passBusy = false);
    }
  }

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
                      HandoverCodeCard(api: widget.api, childId: widget.child.id, childName: widget.child.firstName),
                      _eta(context, b),
                      const SizedBox(height: Kx.s12),
                      _today(context, b.details),
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
                      if (b.details.dropTime != null) _row(context, Icons.schedule_outlined, l.busDropTime, b.details.dropTime!.label),
                      if (b.regNo != null) _row(context, Icons.directions_bus_outlined, l.busVehicle, b.regNo!),
                      if (b.details.driver != null) _crew(context, Icons.badge_outlined, l.busDriver, b.details.driver!, b.details.driverPhone, 'busCallDriver'),
                      if (b.details.attendant != null) _crew(context, Icons.support_agent_outlined, l.busAttendant, b.details.attendant!, b.details.attendantPhone, 'busCallAttendant'),
                      const SizedBox(height: Kx.s12),
                      _passAndFee(context, b.details),
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
                  if ((b.bus?.lateMinutes ?? 0) > 0)
                    Text(l.busLate(b.bus!.lateMinutes!), key: const Key('busLate'), style: context.text.bodyMedium?.copyWith(color: c.error, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Today's getting on and off, as the conductor, the pass QR or a card reader marked it.
  Widget _today(BuildContext context, BusDetails d) {
    final l = context.l10n;
    final fmt = context.fmt;
    String by(String? m) => switch (m) { 'qr' => l.busByQr, 'rfid' => l.busByCard, _ => l.busByConductor };
    return Card(
      key: const Key('busToday'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.busToday, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            if (d.today.isEmpty) Text(l.busNotMarked, key: const Key('busNotMarked'), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            for (final m in d.today)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                child: Row(
                  children: [
                    Icon(m.kind == 'board' ? Icons.login : Icons.logout, size: 20, color: context.colors.primary),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Text(
                        [m.kind == 'board' ? l.busGotOn(fmt.time(m.at)) : l.busGotOff(fmt.time(m.at)), if (m.stopName != null) m.stopName!, by(m.method)].join(' · '),
                        style: context.text.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _crew(BuildContext context, IconData icon, String label, String name, String? phone, String key) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: context.colors.onSurfaceVariant),
            const SizedBox(width: Kx.s12),
            Text('$label: ', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            Expanded(child: Text(name, style: context.text.bodyLarge)),
            if (phone != null && phone.isNotEmpty)
              IconButton(key: Key(key), tooltip: context.l10n.busCall, icon: const Icon(Icons.call_outlined), onPressed: () => widget.call(phone)),
          ],
        ),
      );

  /// The bus pass (valid until, open the PDF) and what is owed on the transport fee.
  Widget _passAndFee(BuildContext context, BusDetails d) {
    final l = context.l10n;
    final c = context.colors;
    final fmt = context.fmt;
    String day(String iso) => fmt.shortDay(DateTime.parse(iso));
    return Card(
      key: const Key('busPassFee'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.badge_outlined, color: c.primary),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.busPassTitle, style: context.text.titleSmall),
                      if (d.passUntil != null)
                        Text(d.passValid ? l.busPassValid(day(d.passUntil!)) : l.busPassExpired(day(d.passUntil!)),
                            key: const Key('busPassUntil'), style: context.text.bodyMedium?.copyWith(color: d.passValid ? c.onSurfaceVariant : c.error)),
                    ],
                  ),
                ),
                TextButton(key: const Key('busPassOpen'), onPressed: _passBusy ? null : _openPass, child: Text(l.busPassOpen)),
              ],
            ),
            const Divider(height: Kx.s24),
            Row(
              children: [
                Icon(Icons.currency_rupee, color: c.primary),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.busFeeTitle, style: context.text.titleSmall),
                      Text(
                        d.feeDuePaise <= 0
                            ? l.busFeeClear
                            : [
                                d.feeOverduePaise > 0 ? l.busFeeOverdue(Fmt.rupees(d.feeOverduePaise)) : l.busFeeDue(Fmt.rupees(d.feeDuePaise)),
                                if (d.feeNextDue != null && d.feeOverduePaise <= 0) l.busFeeNext(day(d.feeNextDue!)),
                              ].join(' · '),
                        key: const Key('busFee'),
                        style: context.text.bodyMedium?.copyWith(color: d.feeOverduePaise > 0 ? c.error : c.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
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
