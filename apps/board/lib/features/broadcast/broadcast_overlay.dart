import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';

/// Shows the principal's messages over whatever is on the board.
/// - info: a banner at the top that hides itself after 15 s
/// - important: a card the teacher closes
/// - emergency: a full-screen red takeover until the teacher acknowledges, then a red strip
///   until the sender clears it
///
/// This sits above the Navigator (in MaterialApp.builder), so every layer brings its own
/// [Material]; without one, text falls back to the yellow-underlined debug style.
class BroadcastOverlay extends StatelessWidget {
  const BroadcastOverlay({super.key, required this.messages, required this.onDismiss, required this.child, this.acknowledged = const {}});

  final List<BroadcastMessage> messages;

  /// Emergency ids already acknowledged on this board: shown as a strip, not full screen.
  final Set<String> acknowledged;
  final void Function(BroadcastMessage, {required bool acknowledge}) onDismiss;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final emergency = messages.where((m) => m.priority == BroadcastPriority.emergency).firstOrNull;
    final card = messages.where((m) => m.priority == BroadcastPriority.important).firstOrNull;
    final banner = messages.where((m) => m.priority == BroadcastPriority.info).firstOrNull;
    return Stack(
      children: [
        child,
        if (banner != null)
          Positioned(
            top: 12 + MediaQuery.paddingOf(context).top,
            left: 8,
            right: 8,
            child: Center(
              child: _Banner(key: ValueKey(banner.id), message: banner, onDismiss: onDismiss),
            ),
          ),
        if (card != null) _Card(message: card, onDismiss: onDismiss),
        if (emergency != null && !acknowledged.contains(emergency.id)) _Emergency(message: emergency, onDismiss: onDismiss),
        if (emergency != null && acknowledged.contains(emergency.id))
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            child: Material(
              color: const Color(0xFFB91C1C),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Text(
                  '⚠ ${emergency.title}: ${emergency.body}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Banner extends StatefulWidget {
  const _Banner({super.key, required this.message, required this.onDismiss});
  final BroadcastMessage message;
  final void Function(BroadcastMessage, {required bool acknowledge}) onDismiss;

  @override
  State<_Banner> createState() => _BannerState();
}

class _BannerState extends State<_Banner> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(seconds: 15), () {
      if (mounted) widget.onDismiss(widget.message, acknowledge: false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.message;
    return Material(
      elevation: 8,
      color: const Color(0xFF1D4ED8),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.campaign_outlined, color: Colors.white),
            const SizedBox(width: 12),
            // Gives way on a phone.
            Flexible(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: Text(
                  '${m.title} — ${m.body}',
                  style: const TextStyle(color: Colors.white, fontSize: 18),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            IconButton(
              tooltip: context.l10n.close,
              onPressed: () => widget.onDismiss(m, acknowledge: true),
              icon: const Icon(Icons.close, color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.message, required this.onDismiss});
  final BroadcastMessage message;
  final void Function(BroadcastMessage, {required bool acknowledge}) onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black45,
      // Scrolls on a short screen (a phone on its side).
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(8),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 640),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.l10n.broadcastFrom(message.senderName), style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 8),
                      Text(message.title, style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: 12),
                      Text(message.body, style: const TextStyle(fontSize: 22, height: 1.4)),
                      const SizedBox(height: 24),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton(onPressed: () => onDismiss(message, acknowledge: true), child: Text(context.l10n.ok)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Emergency extends StatelessWidget {
  const _Emergency({required this.message, required this.onDismiss});
  final BroadcastMessage message;
  final void Function(BroadcastMessage, {required bool acknowledge}) onDismiss;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: const Color(0xFFB91C1C),
        child: SafeArea(
          // Scrolls rather than overflows when a long message (or a longer language) meets a
          // 720p board.
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(48),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 120),
                  const SizedBox(height: 16),
                  Text(
                    message.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 64, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    message.body,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 32),
                  ),
                  const SizedBox(height: 40),
                  OutlinedButton(
                    onPressed: () => onDismiss(message, acknowledge: true),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white),
                    ),
                    child: Text(context.l10n.acknowledge),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
