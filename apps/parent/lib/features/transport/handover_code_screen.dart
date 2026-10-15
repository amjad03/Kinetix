import 'dart:async';

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/family_care.dart';
import '../../l10n/l10n.dart';

/// The hand-over code at the bus stop, large enough to read out to the bus staff, with the minutes
/// it still works. The code comes in a notification the moment the driver starts the hand-over.
class HandoverCodeScreen extends StatefulWidget {
  const HandoverCodeScreen({super.key, required this.code, required this.childName, this.now});

  final HandoverCode code;
  final String childName;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, HandoverCode code, {required String childName}) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HandoverCodeScreen(code: code, childName: childName)));

  @override
  State<HandoverCodeScreen> createState() => _HandoverCodeScreenState();
}

class _HandoverCodeScreenState extends State<HandoverCodeScreen> {
  Timer? _tick;

  DateTime get _now => (widget.now ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final code = widget.code;
    final live = code.live(_now);
    final minutes = code.expiresAt.difference(_now).inMinutes + 1;
    return Scaffold(
      appBar: AppBar(title: Text(l.hoTitle)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Kx.s24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(live ? Icons.directions_bus : Icons.timer_off_outlined, size: 48, color: live ? c.primary : c.onSurfaceVariant),
                const SizedBox(height: Kx.s16),
                Text(widget.childName.isEmpty ? l.hoReadOutAny : l.hoReadOut(widget.childName), textAlign: TextAlign.center, style: context.text.titleMedium),
                const SizedBox(height: Kx.s24),
                FittedBox(
                  child: Text(
                    '${code.code.substring(0, 3)} ${code.code.substring(3)}',
                    key: const Key('hoCode'),
                    style: context.text.displayLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: 6,
                      fontFeatures: const [FontFeature.tabularFigures()],
                      color: live ? c.onSurface : c.onSurfaceVariant,
                      decoration: live ? null : TextDecoration.lineThrough,
                    ),
                  ),
                ),
                const SizedBox(height: Kx.s16),
                Text(
                  live ? l.hoWorksFor(minutes) : l.hoExpired,
                  key: const Key('hoState'),
                  textAlign: TextAlign.center,
                  style: context.text.bodyLarge?.copyWith(color: live ? c.onSurfaceVariant : c.error),
                ),
                const SizedBox(height: Kx.s24),
                Text(l.hoNever, textAlign: TextAlign.center, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// On the bus page: the latest hand-over code for this child while it still works, from the
/// family's notifications. Shows nothing when there is none.
class HandoverCodeCard extends StatefulWidget {
  const HandoverCodeCard({super.key, required this.api, required this.childId, required this.childName, this.now});

  final ParentApi api;
  final String childId;
  final String childName;
  final DateTime Function()? now;

  @override
  State<HandoverCodeCard> createState() => _HandoverCodeCardState();
}

class _HandoverCodeCardState extends State<HandoverCodeCard> {
  HandoverCode? _code;

  DateTime get _now => (widget.now ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final inbox = await widget.api.notifications();
      final codes = [
        for (final n in inbox.items)
          if (HandoverCode.of(n) case final c? when c.studentId == widget.childId && c.live(_now)) c,
      ];
      if (mounted) setState(() => _code = codes.isEmpty ? null : codes.first);
    } on ApiException {
      // No code to show without the notifications.
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = _code;
    if (code == null) return const SizedBox.shrink();
    final l = context.l10n;
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: KxCard(
        key: const Key('handoverCard'),
        color: c.tertiaryContainer,
        onTap: () => HandoverCodeScreen.open(context, code, childName: widget.childName),
        child: Row(
          children: [
            Icon(Icons.verified_user_outlined, color: c.onTertiaryContainer),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.hoTitle, style: context.text.labelLarge?.copyWith(color: c.onTertiaryContainer)),
                  Text(code.code, key: const Key('handoverCardCode'), style: context.text.headlineMedium?.copyWith(color: c.onTertiaryContainer, fontWeight: FontWeight.w700, letterSpacing: 4)),
                ],
              ),
            ),
            Icon(Icons.open_in_full, color: c.onTertiaryContainer),
          ],
        ),
      ),
    );
  }
}
