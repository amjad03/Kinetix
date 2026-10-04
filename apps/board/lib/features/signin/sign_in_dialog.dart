import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';

/// "Sign in to this board": the teacher scans the QR code or types the 6-digit code in the
/// KINETIX Teacher app. Nothing secret is typed on the shared screen. The dialog closes itself
/// when the board receives the session (see [BoardController.onPaired]).
class SignInDialog extends StatefulWidget {
  const SignInDialog({super.key, required this.api, required this.boardName});

  final ApiClient api;
  final String? boardName;

  @override
  State<SignInDialog> createState() => _SignInDialogState();
}

class _SignInDialogState extends State<SignInDialog> {
  PairingCode? _code;
  String? _error;
  Timer? _refresh;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _load();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  Future<void> _load() async {
    _refresh?.cancel();
    try {
      final code = await widget.api.newPairingCode();
      if (!mounted) return;
      setState(() {
        _code = code;
        _error = null;
      });
      // Replace the code a little before it expires so the board never shows a dead code.
      final wait = code.expiresAt.difference(DateTime.now()) - const Duration(seconds: 10);
      _refresh = Timer(wait.isNegative ? const Duration(seconds: 5) : wait, _load);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is ApiException ? e.message : 'Cannot reach KINETIX Cloud. Retrying…');
      _refresh = Timer(const Duration(seconds: 5), _load);
    }
  }

  @override
  void dispose() {
    _refresh?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final code = _code;
    final secondsLeft = code == null ? 0 : code.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 999);
    Widget step(int n, String text) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 13,
            backgroundColor: c.primaryContainer,
            child: Text('$n', style: TextStyle(fontSize: 13, color: c.onPrimaryContainer)),
          ),
          const SizedBox(width: Kx.s12),
          Expanded(child: Text(text, style: context.text.bodyLarge)),
        ],
      ),
    );

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 860),
        child: Padding(
          padding: const EdgeInsets.all(Kx.s32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Sign in to ${widget.boardName ?? 'this board'}', style: context.text.headlineSmall),
                        const SizedBox(height: 4),
                        Text(
                          'Use the KINETIX Teacher app on your phone.',
                          style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  IconButton(tooltip: 'Close', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: Kx.s24),
              Wrap(
                spacing: Kx.s32,
                runSpacing: Kx.s24,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: 400,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        step(1, 'Open the KINETIX Teacher app'),
                        step(2, 'Tap Connect to board'),
                        step(3, 'Scan the QR code, or type this code'),
                        const SizedBox(height: Kx.s8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: Kx.s16),
                          decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: Kx.radiusLg),
                          child: Column(
                            children: [
                              Text(
                                code?.display ?? '••• •••',
                                key: const Key('pairing-code'),
                                style: context.text.displayMedium?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  letterSpacing: 6,
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                              const SizedBox(height: 4),
                              if (code != null)
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    SizedBox(
                                      width: 120,
                                      child: LinearProgressIndicator(value: secondsLeft / 120, borderRadius: BorderRadius.circular(4)),
                                    ),
                                    const SizedBox(width: Kx.s8),
                                    Text('New code in $secondsLeft s', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                                  ],
                                ),
                            ],
                          ),
                        ),
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: Kx.s12),
                            child: Row(
                              children: [
                                Icon(Icons.cloud_off, size: 18, color: c.error),
                                const SizedBox(width: Kx.s8),
                                Expanded(
                                  child: Text(_error!, style: TextStyle(color: c.error)),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(Kx.s16),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: Kx.radiusLg),
                    child: code == null
                        ? const SizedBox(width: 240, height: 240, child: Center(child: CircularProgressIndicator()))
                        : QrImageView(data: code.qrPayload, size: 240, padding: EdgeInsets.zero),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s24),
              Row(
                children: [
                  Icon(Icons.lock_outline, size: 18, color: c.onSurfaceVariant),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: Text(
                      'The code changes every 2 minutes and works once. No password is typed on the board.',
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
