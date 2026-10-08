import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Hostel: the room, the student's gate passes and where each stands, and a form to ask the
/// warden for a new pass. Only for hostel residents.
class GatePassScreen extends StatefulWidget {
  const GatePassScreen({super.key, required this.api, required this.studentId, this.now});

  final StudentApi api;
  final String studentId;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => GatePassScreen(api: api, studentId: studentId)));

  @override
  State<GatePassScreen> createState() => _GatePassScreenState();
}

class _GatePassScreenState extends State<GatePassScreen> {
  HostelView? _view;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final v = await widget.api.hostel(widget.studentId);
      if (mounted) setState(() => _view = v);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _request() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RequestSheet(api: widget.api, studentId: widget.studentId, now: widget.now?.call() ?? DateTime.now()),
    );
    if (sent == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.gatePassSent)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final v = _view;
    return Scaffold(
      appBar: AppBar(title: Text(l.gatePassTitle)),
      floatingActionButton: v != null && v.resident
          ? FloatingActionButton.extended(key: const Key('requestGatePass'), onPressed: _request, icon: const Icon(Icons.add), label: Text(l.gatePassRequest))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (v == null && _error == null) const KxLoading(),
            if (v != null && !v.resident) KxEmptyState(icon: Icons.apartment_outlined, message: l.gatePassNotResident),
            if (v != null && v.resident) ...[
              KxCard(
                child: Row(
                  children: [
                    const KxIconBox(Icons.bed_outlined),
                    const SizedBox(width: Kx.s12),
                    Expanded(child: Text(l.gatePassRoom(v.block ?? '', v.room ?? ''), key: const Key('hostelRoom'), style: context.text.titleMedium)),
                  ],
                ),
              ),
              if (v.passes.isEmpty) KxEmptyState(icon: Icons.badge_outlined, message: l.gatePassNone),
              const SizedBox(height: Kx.s12),
              for (final p in v.passes) ...[_PassCard(pass: p), const SizedBox(height: Kx.s12)],
            ],
          ],
        ),
      ),
    );
  }
}

class _PassCard extends StatelessWidget {
  const _PassCard({required this.pass});

  final GatePass pass;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (label, tone) = switch (pass.status) {
      'requested' => (l.gatePassRequested, KxTone.warning),
      'issued' => (l.gatePassIssued, KxTone.success),
      'out' => (l.gatePassOut, KxTone.primary),
      'returned' => (l.gatePassReturned, KxTone.neutral),
      'rejected' => (l.gatePassRejected, KxTone.danger),
      _ => (l.gatePassCancelled, KxTone.neutral),
    };
    final t = kxTone(context, tone);
    return KxCard(
      key: Key('pass-${pass.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(pass.reason, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: Kx.s8),
              Flexible(child: Pill(label, background: t.bg, foreground: t.fg)),
            ],
          ),
          if (pass.destination.isNotEmpty) Text(pass.destination, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          Text(l.gatePassBackLine(context.fmt.dateTime(pass.expectedBackAt)), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _RequestSheet extends StatefulWidget {
  const _RequestSheet({required this.api, required this.studentId, required this.now});

  final StudentApi api;
  final String studentId;
  final DateTime now;

  @override
  State<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends State<_RequestSheet> {
  final _reason = TextEditingController();
  final _destination = TextEditingController();
  late DateTime _back = DateTime(widget.now.year, widget.now.month, widget.now.day, 19).isAfter(widget.now)
      ? DateTime(widget.now.year, widget.now.month, widget.now.day, 19)
      : DateTime(widget.now.year, widget.now.month, widget.now.day + 1, 19);
  String? _problem;
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    _destination.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final day = await showDatePicker(context: context, initialDate: _back, firstDate: DateUtils.dateOnly(widget.now), lastDate: widget.now.add(const Duration(days: 90)));
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_back));
    if (time == null) return;
    setState(() {
      _back = DateTime(day.year, day.month, day.day, time.hour, time.minute);
      _problem = null;
    });
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_reason.text.trim().isEmpty) return setState(() => _problem = l.leaveReasonRequired);
    if (!_back.isAfter(widget.now)) return setState(() => _problem = l.gatePassBackFuture);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.requestGatePass(widget.studentId, reason: _reason.text.trim(), destination: _destination.text.trim(), backAt: _back);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.gatePassRequest, style: context.text.titleLarge),
            const SizedBox(height: Kx.s16),
            TextField(key: const Key('gpReason'), controller: _reason, maxLength: 200, decoration: InputDecoration(labelText: l.gatePassReason)),
            TextField(key: const Key('gpDestination'), controller: _destination, maxLength: 200, decoration: InputDecoration(labelText: l.gatePassDestination)),
            const SizedBox(height: Kx.s4),
            InkWell(
              key: const Key('gpBack'),
              onTap: _pick,
              borderRadius: Kx.radiusMd,
              child: InputDecorator(
                decoration: InputDecoration(labelText: l.gatePassBackBy, suffixIcon: const Icon(Icons.schedule, size: 18)),
                child: Text(context.fmt.dateTime(_back), style: context.text.bodyLarge),
              ),
            ),
            if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
            const SizedBox(height: Kx.s16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(key: const Key('sendGatePass'), onPressed: _busy ? null : _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.gatePassSend)),
            ),
          ],
        ),
      ),
    );
  }
}
