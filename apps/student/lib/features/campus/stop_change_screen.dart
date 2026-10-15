import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Asking to move to another stop (or route) from a date: every running route with its stops,
/// timings and monthly fee. The transport office decides; a change in fee shows on the request.
class StopChangeScreen extends StatefulWidget {
  const StopChangeScreen({super.key, required this.api, required this.studentId, this.currentStopId, this.now});

  final StudentApi api;
  final String studentId;
  final String? currentStopId;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  @override
  State<StopChangeScreen> createState() => _StopChangeScreenState();
}

class _StopChangeScreenState extends State<StopChangeScreen> {
  List<PublicRoute>? _routes;
  ApiException? _error;
  String? _stopId;
  late final DateTime _first = DateUtils.dateOnly((widget.now ?? DateTime.now)());
  late DateTime _on = _first.add(const Duration(days: 1));
  final _reason = TextEditingController();
  bool _busy = false;
  Object? _problem;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.transportRoutes();
      if (mounted) setState(() => _routes = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_stopId == null) return setState(() => _problem = l.trPickStop);
    if (_reason.text.trim().length < 3) return setState(() => _problem = l.trReasonNeeded);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.requestStopChange(widget.studentId, toStopId: _stopId!, effectiveOn: _on, reason: _reason.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final routes = _routes;
    return Scaffold(
      appBar: AppBar(title: Text(l.trChangeStop)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (routes == null && _error == null) const KxLoading(),
          if (routes != null && routes.isEmpty) KxEmptyState(icon: Icons.directions_bus_outlined, message: l.trNoRoutes),
          if (routes != null && routes.isNotEmpty) ...[
            Text(l.trPickStopHelp, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            RadioGroup<String>(
              groupValue: _stopId,
              onChanged: (v) => setState(() => _stopId = v),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final r in routes) ...[
                    SectionTitle(r.name),
                    for (final s in r.stops)
                      Card(
                        child: RadioListTile<String>(
                          key: Key('stop-${s.id}'),
                          value: s.id,
                          enabled: s.id != widget.currentStopId,
                          title: Text(s.name),
                          subtitle: Text(
                            [
                              if (s.landmark.isNotEmpty) s.landmark,
                              if (s.pickupTime.isNotEmpty) l.trPickupAt(s.pickupTime),
                              l.trMonthlyFee(Fmt.rupees(s.feePaise)),
                              if (s.id == widget.currentStopId) l.trYourStopNow,
                            ].join(' · '),
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: Kx.s12),
            InkWell(
              key: const Key('stopChangeOn'),
              borderRadius: Kx.radiusMd,
              onTap: () async {
                final d = await showDatePicker(context: context, initialDate: _on, firstDate: _first, lastDate: _first.add(const Duration(days: 180)));
                if (d != null) setState(() => _on = d);
              },
              child: InputDecorator(
                decoration: InputDecoration(labelText: l.trFrom, suffixIcon: const Icon(Icons.event, size: 18)),
                child: Text(context.fmt.date(_on), style: context.text.bodyLarge),
              ),
            ),
            TextField(key: const Key('stopChangeReason'), controller: _reason, maxLength: 500, maxLines: 2, decoration: InputDecoration(labelText: l.trReason)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s12), child: ErrorBanner(_problem!)),
            Text(l.trFeeNote, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s12),
            FilledButton(
              key: const Key('sendStopChange'),
              onPressed: _busy ? null : _send,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(l.trSendRequest),
            ),
          ],
        ],
      ),
    );
  }
}
