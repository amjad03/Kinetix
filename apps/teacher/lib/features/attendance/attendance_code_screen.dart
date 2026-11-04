import 'dart:async';

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// The period's rotating self-mark code, large enough to read from the back of the room (or cast to the board),
/// with the scans the anti-proxy checks held: the teacher accepts (marks present) or rejects each one.
class AttendanceCodeScreen extends StatefulWidget {
  const AttendanceCodeScreen({super.key, required this.api, required this.period, required this.date, required this.students, this.tick = const Duration(seconds: 1)});

  final TeacherApi api;
  final Period period;
  final String date;
  final List<Student> students;

  /// How often the countdown moves (tests pass a long tick).
  final Duration tick;

  @override
  State<AttendanceCodeScreen> createState() => _AttendanceCodeScreenState();
}

class _AttendanceCodeScreenState extends State<AttendanceCodeScreen> {
  AttendanceCode? _code;
  List<AttendanceHint> _held = const [];
  ApiException? _error;
  Timer? _timer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(widget.tick, (_) {
      final c = _code;
      if (c != null && DateTime.now().isAfter(c.expiresAt.subtract(const Duration(seconds: 2)))) _refresh();
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_busy) return;
    _busy = true;
    try {
      final code = await widget.api.attendanceCode(slotId: widget.period.slotId, date: widget.date);
      final sheet = await widget.api.attendance(slotId: widget.period.slotId, date: widget.date);
      if (!mounted) return;
      setState(() {
        _code = code;
        _held = [for (final h in sheet.hints) if (h.isHeldScan) h];
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      _busy = false;
    }
  }

  Future<void> _decide(AttendanceHint h, bool accept) async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      await widget.api.decideQrScan(h.scanId!, accept: accept);
      if (!mounted) return;
      setState(() => _held = [for (final x in _held) if (x.scanId != h.scanId) x]);
      messenger.showSnackBar(SnackBar(content: Text(accept ? l.qrScanAccepted : l.qrScanRejected)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  String _reason(AppLocalizations l, String r) => switch (r) {
    'outside_campus' => l.qrReasonOutside,
    'new_device' || 'no_device' => l.qrReasonPhone,
    'late_scan' => l.qrReasonLate,
    _ => l.qrReasonLocation,
  };

  /// Screenshots off while this is open (FLAG_SECURE on Android).
  @override
  Widget build(BuildContext context) => KxSecureScreen(child: _secureContent(context));

  Widget _secureContent(BuildContext context) {
    final l = context.l10n;
    final c = _code;
    final left = c == null ? 0 : c.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 30);
    final names = {for (final s in widget.students) s.id: s};
    return Scaffold(
      appBar: AppBar(title: Text(l.qrCodeTitle)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text('${widget.period.subject.name} · ${widget.period.section.name}', style: context.text.titleMedium),
          const SizedBox(height: Kx.s4),
          Text(l.qrCodeHelp, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s24),
          if (_error != null)
            ErrorBanner.api(_error!, onRetry: _refresh)
          else if (c == null)
            const Center(child: CircularProgressIndicator())
          else ...[
            Center(
              child: FittedBox(
                child: Text(
                  '${c.code.substring(0, 4)} ${c.code.substring(4)}',
                  key: const Key('qr-code'),
                  style: context.text.displayLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 6, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ),
            const SizedBox(height: Kx.s8),
            Center(child: Text(l.qrCodeChanges(left), key: const Key('qr-countdown'))),
          ],
          const SizedBox(height: Kx.s24),
          Text(l.qrHeldTitle(_held.length), style: context.text.titleSmall),
          const SizedBox(height: Kx.s8),
          if (_held.isEmpty)
            Text(l.qrHeldNone, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant))
          else
            for (final h in _held)
              Card(
                key: Key('held-${h.studentId}'),
                child: ListTile(
                  title: Text(names[h.studentId]?.fullName ?? h.studentId),
                  subtitle: Text([names[h.studentId]?.rollNo ?? '', ...h.reasons.map((r) => _reason(l, r))].where((x) => x.isNotEmpty).join(' · ')),
                  trailing: Wrap(
                    spacing: Kx.s4,
                    children: [
                      IconButton(key: Key('reject-${h.studentId}'), tooltip: l.qrReject, icon: const Icon(Icons.close), onPressed: () => _decide(h, false)),
                      IconButton.filledTonal(key: Key('accept-${h.studentId}'), tooltip: l.qrAccept, icon: const Icon(Icons.check), onPressed: () => _decide(h, true)),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
