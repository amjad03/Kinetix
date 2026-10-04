import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';

/// The board's idle screen. A teacher scans the QR code (or types the 6 digits) in the
/// Teacher App, and the board opens their class. Nothing secret is ever typed on this screen.
class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, required this.api, required this.deviceName, required this.onPractice});

  final ApiClient api;
  final String? deviceName;
  final VoidCallback onPractice;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
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
      // Replace the code a little before it expires so it never shows a dead code.
      final wait = code.expiresAt.difference(DateTime.now()) - const Duration(seconds: 10);
      _refresh = Timer(wait.isNegative ? const Duration(seconds: 5) : wait, _load);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is ApiException ? e.message : 'No connection to KINETIX Cloud. Retrying…');
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
    final code = _code;
    final secondsLeft = code == null ? 0 : code.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 999);
    return Scaffold(
      backgroundColor: const Color(0xFF101418),
      body: SafeArea(
        child: Center(
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 64,
            runSpacing: 32,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: code == null
                    ? const SizedBox(width: 280, height: 280, child: Center(child: CircularProgressIndicator()))
                    : QrImageView(data: code.qrPayload, size: 280),
              ),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  const Text('KINETIX', style: TextStyle(color: Color(0xFF7CC4FF), fontSize: 20, letterSpacing: 6, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(widget.deviceName ?? 'Board', style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 24),
                  const Text('Open the KINETIX Teacher app → Connect to board,\nthen scan the code or type:',
                      style: TextStyle(color: Colors.white70, fontSize: 20, height: 1.4)),
                  const SizedBox(height: 16),
                  Text(code?.display ?? '— — —',
                      key: const Key('pairing-code'),
                      style: const TextStyle(color: Colors.white, fontSize: 72, fontWeight: FontWeight.w700, letterSpacing: 8, fontFeatures: [FontFeature.tabularFigures()])),
                  if (code != null) Text('New code in $secondsLeft s', style: const TextStyle(color: Colors.white38, fontSize: 16)),
                  if (_error != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(_error!, style: const TextStyle(color: Color(0xFFFFB4A9), fontSize: 16))),
                  const SizedBox(height: 32),
                  OutlinedButton.icon(
                    onPressed: widget.onPractice,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Practice board (no sign-in)'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white70, side: const BorderSide(color: Colors.white24)),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
