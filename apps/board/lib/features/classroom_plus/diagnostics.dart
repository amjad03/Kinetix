import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/app_info.dart';
import '../../core/board_controller.dart';
import '../../core/fleet/fleet_agent.dart';
import '../../l10n/feature_strings.dart';
import 'plus_strings.dart';

/// Device diagnostics for IT and for a teacher on the phone to support: the app version, the
/// server and the connection, changes waiting to send, storage, battery and the screen, with a
/// server check and a report to copy. Nothing here is sent anywhere.
class DiagnosticsPanel extends StatefulWidget {
  const DiagnosticsPanel({super.key, required this.board, this.probe, this.ping});

  final BoardController board;

  /// Reads storage and battery; defaults to the board's own probe.
  final DeviceProbe? probe;

  /// Asks the server once; defaults to the board's API.
  final Future<void> Function()? ping;

  @override
  State<DiagnosticsPanel> createState() => _DiagnosticsPanelState();
}

class _DiagnosticsPanelState extends State<DiagnosticsPanel> {
  DeviceSnapshot? _device;
  String? _check;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    unawaited(_read());
  }

  Future<void> _read() async {
    try {
      final d = await (widget.probe ?? widget.board.fleet.probe).read();
      if (mounted) setState(() => _device = d);
    } catch (_) {
      // Shown as unknown.
    }
  }

  Future<void> _checkServer() async {
    final s = plusStrings(context);
    final ping = widget.ping ?? widget.board.api?.ping;
    if (ping == null) {
      setState(() => _check = s['dgNotEnrolled']);
      return;
    }
    setState(() => _checking = true);
    final watch = Stopwatch()..start();
    String result;
    try {
      await ping().timeout(const Duration(seconds: 8));
      result = s.n('dgReachable', watch.elapsedMilliseconds);
    } catch (_) {
      result = s['dgUnreachable'];
    }
    if (mounted) {
      setState(() {
        _checking = false;
        _check = result;
      });
    }
  }

  /// The rows shown, as label and value.
  List<(String, String)> rows(FeatureStrings s, MediaQueryData media) {
    final b = widget.board;
    final d = _device;
    final size = media.size * media.devicePixelRatio;
    return [
      (s['dgApp'], kBoardVersion),
      (s['dgServer'], b.api?.baseUrl ?? s['dgNotEnrolled']),
      (s['dgDevice'], b.deviceName ?? s['dgUnknown']),
      (s['dgConnection'], b.online ? s['dgOnline'] : s['dgOffline']),
      (s['dgPending'], '${b.pendingOps}'),
      (s['dgStorage'], d?.storageFreeMb == null ? s['dgUnknown'] : '${(d!.storageFreeMb! / 1024).toStringAsFixed(1)} / ${((d.storageTotalMb ?? 0) / 1024).toStringAsFixed(1)} GB'),
      (s['dgBattery'], d == null ? s['dgUnknown'] : d.batteryPercent == null ? s['dgNoBattery'] : '${d.batteryPercent}%${d.charging == true ? ' ⚡' : ''}'),
      (s['dgSystem'], d == null ? s['dgUnknown'] : [d.os, d.osVersion].whereType<String>().join(' ')),
      (s['dgScreen'], '${size.width.round()} × ${size.height.round()} px'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final s = plusStrings(context);
    final c = context.colors;
    return ListenableBuilder(
      listenable: widget.board,
      builder: (context, _) {
        final list = rows(s, MediaQuery.of(context));
        return ListView(
          key: const Key('diagnostics'),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            for (final (label, value) in list)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 200, child: Text(label, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))),
                    Expanded(child: SelectableText(value, style: context.text.bodyLarge)),
                  ],
                ),
              ),
            const SizedBox(height: Kx.s16),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('dg-check'),
                  onPressed: _checking ? null : _checkServer,
                  icon: const Icon(Icons.network_check),
                  label: Text(_checking ? s['dgChecking'] : s['dgCheck']),
                ),
                OutlinedButton.icon(
                  key: const Key('dg-copy'),
                  onPressed: () {
                    unawaited(Clipboard.setData(ClipboardData(text: [for (final (l, v) in list) '$l: $v', ?_check].join('\n'))));
                    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s['dgCopied'])));
                  },
                  icon: const Icon(Icons.copy),
                  label: Text(s['dgCopy']),
                ),
                if (_check != null) Text(_check!, key: const Key('dg-result'), style: context.text.bodyLarge),
              ],
            ),
          ],
        );
      },
    );
  }
}
