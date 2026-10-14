import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';
import 'stop_change_screen.dart';

/// The student's bus: the route, the stop and pickup time, and, while the bus is on the road,
/// how many minutes and stops away it is. Refreshes by itself every [every].
class BusScreen extends StatefulWidget {
  const BusScreen({super.key, required this.api, required this.studentId, this.every = const Duration(seconds: 20), this.openFile = openWithSystem});

  final StudentApi api;
  final String studentId;
  final Duration every;

  /// Opens the bus pass PDF; tests pass their own.
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BusScreen(api: api, studentId: studentId)));

  @override
  State<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends State<BusScreen> {
  StudentBus? _bus;
  ApiException? _error;
  Timer? _timer;
  List<StopChangeRequest>? _changes;
  List<PublicRoute>? _routes;
  bool _passBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
    _loadChanges();
    _timer = Timer.periodic(widget.every, (_) => _load());
  }

  Future<void> _loadChanges() async {
    try {
      final (changes, routes) = await (widget.api.stopChangeRequests(widget.studentId), widget.api.transportRoutes()).wait;
      if (mounted) {
        setState(() {
          _changes = changes;
          _routes = routes;
        });
      }
    } on ParallelWaitError {
      if (mounted) setState(() => _changes = const []);
    }
  }

  Future<void> _changeStop() async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => StopChangeScreen(api: widget.api, studentId: widget.studentId, currentStopId: _bus?.stopId)));
    if (sent == true && mounted) {
      say(context, context.l10n.trChangeSent);
      await _loadChanges();
    }
  }

  Future<void> _pass() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _passBusy = true);
    try {
      final bytes = await widget.api.busPassPdf(widget.studentId);
      final ok = await widget.openFile(bytes, 'bus-pass.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.fileOpenFailed)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _passBusy = false);
    }
  }

  String _stopName(String id) {
    for (final r in _routes ?? const <PublicRoute>[]) {
      for (final s in r.stops) {
        if (s.id == id) return '${s.name} · ${r.name}';
      }
    }
    return '';
  }

  Widget _statusPill(BuildContext context, String status) {
    final l = context.l10n;
    final (label, tone) = switch (status) {
      'approved' => (l.trApproved, KxTone.success),
      'rejected' => (l.trRejected, KxTone.danger),
      'cancelled' => (l.trCancelled, KxTone.neutral),
      _ => (l.trPending, KxTone.warning),
    };
    final t = kxTone(context, tone);
    return ConstrainedBox(constraints: const BoxConstraints(maxWidth: 120), child: Pill(label, background: t.bg, foreground: t.fg));
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
        onRefresh: () => Future.wait([_load(), _loadChanges()]),
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
              const SizedBox(height: Kx.s16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('busPass'),
                      onPressed: _passBusy ? null : _pass,
                      icon: _passBusy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.badge_outlined),
                      label: Text(l.trBusPass),
                    ),
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: FilledButton.tonalIcon(
                      key: const Key('changeStop'),
                      onPressed: (_changes ?? const []).any((c) => c.status == 'pending') ? null : _changeStop,
                      icon: const Icon(Icons.edit_location_alt_outlined),
                      label: Text(l.trChangeStop),
                    ),
                  ),
                ],
              ),
            ],
            if (b != null && !b.assigned && _changes != null && !_changes!.any((c) => c.status == 'pending'))
              Center(child: TextButton.icon(key: const Key('askForStop'), onPressed: _changeStop, icon: const Icon(Icons.add_location_alt_outlined), label: Text(l.trAskForStop))),
            if ((_changes ?? const []).isNotEmpty) ...[
              SectionTitle(l.trChangeRequests),
              for (final r in _changes!)
                Card(
                  key: Key('stopChange-${r.id}'),
                  child: ListTile(
                    leading: const Icon(Icons.edit_location_alt_outlined),
                    title: Text(_stopName(r.toStopId).isEmpty ? l.trNewStop : _stopName(r.toStopId)),
                    subtitle: Text([
                      l.trFromDay(context.fmt.date(r.effectiveOn)),
                      if (r.feeDeltaPaise > 0) l.trFeeMore(Fmt.rupees(r.feeDeltaPaise)),
                      if (r.feeDeltaPaise < 0) l.trFeeLess(Fmt.rupees(-r.feeDeltaPaise)),
                      if (r.decisionNote.isNotEmpty) r.decisionNote,
                    ].join(' · ')),
                    trailing: _statusPill(context, r.status),
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
