import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../board/phone_chrome.dart';

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

  /// The server's refusal, or [_unreachable] when there is no connection.
  ApiException? _error;
  bool _unreachable = false;
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
        _unreachable = false;
      });
      // Replace the code a little before it expires so the board never shows a dead code.
      final wait = code.expiresAt.difference(DateTime.now()) - const Duration(seconds: 10);
      _refresh = Timer(wait.isNegative ? const Duration(seconds: 5) : wait, _load);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ApiException ? e : null;
        _unreachable = e is! ApiException;
      });
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
    final l = context.l10n;
    final error = _unreachable ? l.cannotReachCloudRetrying : (_error == null ? null : apiErrorText(l, _error!));
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

    // On a phone: closer to the edges, and it scrolls.
    final phone = context.isPhone;
    return Dialog(
      insetPadding: phone ? const EdgeInsets.all(Kx.s16) : null,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 860),
        child: SingleChildScrollView(
          padding: EdgeInsets.all(phone ? Kx.s16 : Kx.s32),
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
                        Text(l.signInTo(widget.boardName ?? l.thisBoard), style: context.text.headlineSmall),
                        const SizedBox(height: 4),
                        Text(
                          l.signInUsePhone,
                          style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  IconButton(tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
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
                        step(1, l.signInStep1),
                        step(2, l.signInStep2),
                        step(3, l.signInStep3),
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
                                    Flexible(child: Text(l.newCodeIn(secondsLeft), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                                  ],
                                ),
                            ],
                          ),
                        ),
                        if (error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: Kx.s12),
                            child: Row(
                              children: [
                                Icon(Icons.cloud_off, size: 18, color: c.error),
                                const SizedBox(width: Kx.s8),
                                Expanded(
                                  child: Text(error, style: TextStyle(color: c.error)),
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
                      l.signInCodeNote,
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
